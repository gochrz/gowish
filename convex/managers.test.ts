import rateLimiterTest from "@convex-dev/rate-limiter/test";
import { convexTest } from "convex-test";
import { describe, expect, test } from "vitest";
import { internal } from "./_generated/api";
import schema from "./schema";

const modules = import.meta.glob("./**/*.ts");

function setup() {
  const t = convexTest(schema, modules);
  rateLimiterTest.register(t);
  return t;
}

const registration = {
  fullName: "  Morgan Reed  ",
  email: " Morgan@Example.COM ",
  phone: " +1 555 111 2222 ",
  company: " North Studio ",
  socialHandle: " @morgan ",
  payoutMethod: "venmo" as const,
  payoutDestination: " @@morgan-pay ",
  payoutLegalName: " Morgan Reed ",
  estCreators: "6 to 20",
  source: " UGC roster ",
  consentAccepted: true,
  consentVersion: "manager-2026-08-31",
  consentOrigin: "https://www.gowishpartner.com",
  consentUserAgent: "test-agent",
  consentIpHash: "0123456789abcdef",
  rateLimitKey: "manager-test-client",
};

describe("manager registration", () => {
  test("normalizes data, records consent, and creates an audit event", async () => {
    const t = setup();
    const result = await t.mutation(internal.managers.register, registration);

    expect(result).toMatchObject({ ok: true, duplicate: false, name: "Morgan Reed" });
    expect(result.code).toMatch(/^M[A-HJ-NP-Z2-9]{6}$/);

    const state = await t.run(async (ctx) => ({
      managers: await ctx.db.query("managers").collect(),
      events: await ctx.db.query("auditEvents").collect(),
    }));

    expect(state.managers).toHaveLength(1);
    expect(state.managers[0]).toMatchObject({
      email: "morgan@example.com",
      fullName: "Morgan Reed",
      payoutMethod: "venmo",
      payoutDestination: "@morgan-pay",
      payoutLegalName: "Morgan Reed",
      enabled: true,
      consentAccepted: true,
      consentVersion: "manager-2026-08-31",
      creatorCount: 0,
      approvedCreatorCount: 0,
      managerOwedAmount: 0,
      managerPaidAmount: 0,
    });
    expect(state.events).toHaveLength(1);
    expect(state.events[0]).toMatchObject({
      actor: "public",
      action: "manager_registered",
      entityType: "manager",
    });
  });

  test("returns the existing code for a normalized duplicate email", async () => {
    const t = setup();
    const first = await t.mutation(internal.managers.register, registration);
    const second = await t.mutation(internal.managers.register, {
      ...registration,
      email: "MORGAN@example.com",
      fullName: "Different Name",
      rateLimitKey: "manager-test-client-2",
    });

    expect(second).toEqual({
      ok: true,
      duplicate: true,
      code: first.code,
      name: "Morgan Reed",
    });

    const managers = await t.run((ctx) => ctx.db.query("managers").collect());
    expect(managers).toHaveLength(1);
  });

  test("requires explicit consent", async () => {
    const t = setup();

    await expect(
      t.mutation(internal.managers.register, {
        ...registration,
        consentAccepted: false,
      }),
    ).rejects.toThrow("Consent is required");
  });

  test("stores a normalized Apple Cash email", async () => {
    const t = setup();
    await t.mutation(internal.managers.register, {
      ...registration,
      payoutMethod: "apple_cash",
      payoutDestination: " Morgan.Payments@Example.COM ",
    });

    const managers = await t.run((ctx) => ctx.db.query("managers").collect());
    expect(managers[0]).toMatchObject({
      payoutMethod: "apple_cash",
      payoutDestination: "morgan.payments@example.com",
      payoutLegalName: "Morgan Reed",
    });
  });

  test("rejects an invalid Apple Cash contact", async () => {
    const t = setup();

    await expect(
      t.mutation(internal.managers.register, {
        ...registration,
        payoutMethod: "apple_cash",
        payoutDestination: "morgan cash",
      }),
    ).rejects.toThrow("Apple Cash phone number or email is invalid");
  });

  test("rejects unsupported manager consent versions", async () => {
    const t = setup();

    await expect(
      t.mutation(internal.managers.register, {
        ...registration,
        consentVersion: "manager-old-version",
      }),
    ).rejects.toThrow("Consent version is not supported");
  });

  test("validates enabled codes and rejects disabled managers", async () => {
    const t = setup();
    const created = await t.mutation(internal.managers.register, registration);

    await expect(
      t.mutation(internal.managers.validateCode, {
        code: ` ${created.code.toLowerCase()} `,
        rateLimitKey: "validate-test-client",
      }),
    ).resolves.toMatchObject({ ok: true, code: created.code, name: "Morgan Reed" });

    await t.run(async (ctx) => {
      const manager = await ctx.db
        .query("managers")
        .withIndex("by_code", (q) => q.eq("code", created.code))
        .unique();
      if (!manager) throw new Error("Manager not found");
      await ctx.db.patch(manager._id, { enabled: false });
    });

    await expect(
      t.mutation(internal.managers.validateCode, {
        code: created.code,
        rateLimitKey: "validate-test-client-2",
      }),
    ).resolves.toEqual({ ok: false, error: "No enabled manager found with that code." });
  });

  test("allocates unique manager codes", async () => {
    const t = setup();
    const codes = new Set<string>();

    for (let i = 0; i < 20; i += 1) {
      const result = await t.mutation(internal.managers.register, {
        ...registration,
        email: `manager-${i}@example.com`,
        rateLimitKey: `manager-unique-${i}`,
      });
      codes.add(result.code);
    }

    expect(codes.size).toBe(20);
  });

  test("rate limits repeated registration attempts from one client", async () => {
    const t = setup();

    for (let i = 0; i < 10; i += 1) {
      await t.mutation(internal.managers.register, {
        ...registration,
        rateLimitKey: "same-rate-limited-client",
      });
    }

    await expect(
      t.mutation(internal.managers.register, {
        ...registration,
        rateLimitKey: "same-rate-limited-client",
      }),
    ).rejects.toThrow("RateLimited");
  });
});
