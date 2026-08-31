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

const managerRegistration = {
  fullName: "Morgan Reed",
  email: "morgan@example.com",
  phone: "+1 555 111 2222",
  company: "North Studio",
  socialHandle: "@morgan",
  venmoHandle: "@morgan-pay",
  venmoLegalName: "Morgan Reed",
  estCreators: "6 to 20",
  source: "UGC roster",
  consentAccepted: true,
  consentVersion: "manager-2026-08-31",
  consentOrigin: "https://www.gowishpartner.com",
  consentUserAgent: "test-agent",
  consentIpHash: "0123456789abcdef",
  rateLimitKey: "manager-for-creator-test",
};

const creatorSubmission = {
  fullName: "  Casey Lane  ",
  contactEmail: " CASEY@Example.com ",
  gowishEmail: " Casey.GoWish@Example.COM ",
  phone: " +1 555 333 4444 ",
  country: "United States",
  platform: "Instagram" as const,
  handle: " @@caseycreates ",
  followers: "42000",
  otherHandles: "TikTok @casey",
  venmoHandle: " @@casey-pay ",
  venmoLegalName: " Casey Lane ",
  managerCode: undefined,
  consentAccepted: true,
  consentVersion: "creator-2026-08-31",
  consentOrigin: "https://www.gowishpartner.com",
  consentUserAgent: "test-agent",
  consentIpHash: "fedcba9876543210",
  rateLimitKey: "creator-test-client",
};

describe("creator submission", () => {
  test("stores normalized data, consent evidence, amount snapshots, and an audit event", async () => {
    const t = setup();
    const result = await t.mutation(internal.creators.submit, creatorSubmission);

    expect(result.ok).toBe(true);
    expect(result.id).toMatch(/^C\d{6}-[A-HJ-NP-Z2-9]{6}$/);
    expect(result.managerCode).toBeNull();

    const state = await t.run(async (ctx) => ({
      creators: await ctx.db.query("creators").collect(),
      events: await ctx.db.query("auditEvents").collect(),
      stats: await ctx.db.query("programStats").withIndex("by_key", (q) => q.eq("key", "global")).unique(),
    }));

    expect(state.creators).toHaveLength(1);
    expect(state.creators[0]).toMatchObject({
      reference: result.id,
      fullName: "Casey Lane",
      contactEmail: "casey@example.com",
      gowishEmail: "casey.gowish@example.com",
      country: "United States",
      handle: "@caseycreates",
      venmoHandle: "@casey-pay",
      status: "submitted",
      attributionState: "pending",
      creatorBonusAmount: 20,
      managerBonusAmount: 0,
      partnerRevenueAmount: 60,
      consentAccepted: true,
      consentVersion: "creator-2026-08-31",
    });
    expect(state.events.at(-1)).toMatchObject({
      actor: "public",
      action: "creator_submitted",
      entityType: "creator",
    });
    expect(state.stats).toMatchObject({
      totalCreators: 1,
      submittedCount: 1,
      approvedCount: 0,
      withManagerCount: 0,
    });
  });

  test("prevents duplicate GoWish emails after normalization", async () => {
    const t = setup();
    await t.mutation(internal.creators.submit, creatorSubmission);

    await expect(
      t.mutation(internal.creators.submit, {
        ...creatorSubmission,
        gowishEmail: "CASEY.GOWISH@example.com",
        rateLimitKey: "creator-duplicate-test-client",
      }),
    ).rejects.toThrow("already been submitted");

    const creators = await t.run((ctx) => ctx.db.query("creators").collect());
    expect(creators).toHaveLength(1);
  });

  test("attributes an enabled manager and snapshots the manager bonus", async () => {
    const t = setup();
    const manager = await t.mutation(internal.managers.register, managerRegistration);
    const result = await t.mutation(internal.creators.submit, {
      ...creatorSubmission,
      managerCode: ` ${manager.code.toLowerCase()} `,
    });

    expect(result.managerCode).toBe(manager.code);

    const state = await t.run(async (ctx) => ({
      creator: await ctx.db
        .query("creators")
        .withIndex("by_gowishEmail", (q) => q.eq("gowishEmail", "casey.gowish@example.com"))
        .unique(),
      manager: await ctx.db
        .query("managers")
        .withIndex("by_code", (q) => q.eq("code", manager.code))
        .unique(),
    }));

    expect(state.creator).toMatchObject({
      managerCode: manager.code,
      managerBonusAmount: 10,
    });
    expect(state.creator?.managerId).toBe(state.manager?._id);
    expect(state.manager).toMatchObject({ creatorCount: 1 });
  });

  test("rejects disabled or unknown referral codes", async () => {
    const t = setup();
    const manager = await t.mutation(internal.managers.register, managerRegistration);
    await t.run(async (ctx) => {
      const stored = await ctx.db
        .query("managers")
        .withIndex("by_code", (q) => q.eq("code", manager.code))
        .unique();
      if (!stored) throw new Error("Manager not found");
      await ctx.db.patch(stored._id, { enabled: false });
    });

    await expect(
      t.mutation(internal.creators.submit, {
        ...creatorSubmission,
        managerCode: manager.code,
      }),
    ).rejects.toThrow("referral code was not recognized");
  });

  test("enforces United States eligibility and explicit consent", async () => {
    const t = setup();

    await expect(
      t.mutation(internal.creators.submit, {
        ...creatorSubmission,
        country: "Other",
      }),
    ).rejects.toThrow("United States only");

    await expect(
      t.mutation(internal.creators.submit, {
        ...creatorSubmission,
        consentAccepted: false,
        rateLimitKey: "creator-consent-test-client",
      }),
    ).rejects.toThrow("Consent is required");
  });

  test("rejects unsupported consent versions and invalid follower counts", async () => {
    const t = setup();

    await expect(
      t.mutation(internal.creators.submit, {
        ...creatorSubmission,
        consentVersion: "creator-old-version",
      }),
    ).rejects.toThrow("Consent version is not supported");

    await expect(
      t.mutation(internal.creators.submit, {
        ...creatorSubmission,
        followers: "lots",
        rateLimitKey: "creator-followers-test-client",
      }),
    ).rejects.toThrow("Followers must be a number");

    await expect(
      t.mutation(internal.creators.submit, {
        ...creatorSubmission,
        venmoHandle: "not a valid handle",
        rateLimitKey: "creator-venmo-test-client",
      }),
    ).rejects.toThrow("Venmo handle is invalid");
  });

  test("allocates unique creator references", async () => {
    const t = setup();
    const references = new Set<string>();

    for (let i = 0; i < 20; i += 1) {
      const result = await t.mutation(internal.creators.submit, {
        ...creatorSubmission,
        contactEmail: `creator-${i}@example.com`,
        gowishEmail: `creator-${i}@gowish.example.com`,
        rateLimitKey: `creator-reference-${i}`,
      });
      references.add(result.id);
    }

    expect(references.size).toBe(20);
  });
});
