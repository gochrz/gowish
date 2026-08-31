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

function managerArgs(suffix = "base") {
  return {
    fullName: "Morgan Reed",
    email: `morgan-${suffix}@example.com`,
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
    rateLimitKey: `manager-${suffix}`,
  };
}

function creatorArgs(suffix: string, managerCode?: string) {
  return {
    fullName: `Creator ${suffix}`,
    contactEmail: `creator-${suffix}@example.com`,
    gowishEmail: `creator-${suffix}@gowish.example.com`,
    phone: "+1 555 333 4444",
    country: "United States",
    platform: "Instagram" as const,
    handle: `@creator${suffix}`,
    followers: "42000",
    otherHandles: "TikTok @creator",
    venmoHandle: `@creator-${suffix}-pay`,
    venmoLegalName: `Creator ${suffix}`,
    managerCode,
    consentAccepted: true,
    consentVersion: "creator-2026-08-31",
    consentOrigin: "https://www.gowishpartner.com",
    consentUserAgent: "test-agent",
    consentIpHash: "fedcba9876543210",
    rateLimitKey: `creator-${suffix}`,
  };
}

async function creatorIdByEmail(t: ReturnType<typeof setup>, email: string) {
  return t.run(async (ctx) => {
    const creator = await ctx.db
      .query("creators")
      .withIndex("by_gowishEmail", (q) => q.eq("gowishEmail", email))
      .unique();
    if (!creator) throw new Error("Creator not found");
    return creator._id;
  });
}

describe("admin operations", () => {
  test("enforces status transitions and payout guards while updating balances", async () => {
    const t = setup();
    const manager = await t.mutation(internal.managers.register, managerArgs());
    await t.mutation(internal.creators.submit, creatorArgs("managed", manager.code));
    await t.mutation(internal.creators.submit, creatorArgs("direct"));
    const managedId = await creatorIdByEmail(t, "creator-managed@gowish.example.com");
    const directId = await creatorIdByEmail(t, "creator-direct@gowish.example.com");

    await expect(
      t.mutation(internal.admin.markPaid, {
        ids: [managedId],
        who: "creator",
        paymentReference: "VENMO-EARLY",
      }),
    ).rejects.toThrow("approved");

    await expect(
      t.mutation(internal.admin.setStatus, {
        ids: [managedId],
        status: "approved",
        reason: "Confirmed by GoWish batch 1",
      }),
    ).resolves.toEqual({ ok: true, updated: 1, unchanged: 0 });

    const approvedStats = await t.query(internal.admin.stats, {});
    expect(approvedStats).toMatchObject({
      total: 2,
      submitted: 1,
      approved: 1,
      rejected: 0,
      withManager: 1,
      owedToCreators: 20,
      owedToManagers: 10,
      grossOnApproved: 60,
    });

    await expect(
      t.mutation(internal.admin.markPaid, {
        ids: [managedId],
        who: "creator",
        paymentReference: "VENMO-123",
      }),
    ).resolves.toEqual({ ok: true, updated: 1, unchanged: 0 });

    await expect(
      t.mutation(internal.admin.markPaid, {
        ids: [managedId],
        who: "manager",
        paymentReference: "VENMO-456",
      }),
    ).resolves.toEqual({ ok: true, updated: 1, unchanged: 0 });

    await t.mutation(internal.admin.setStatus, {
      ids: [directId],
      status: "approved",
      reason: "Confirmed by GoWish batch 1",
    });

    await expect(
      t.mutation(internal.admin.markPaid, {
        ids: [directId],
        who: "manager",
        paymentReference: "VENMO-NO-MANAGER",
      }),
    ).rejects.toThrow("does not have an attributed manager");

    await expect(
      t.mutation(internal.admin.setStatus, {
        ids: [managedId],
        status: "rejected",
        reason: "Attempted reversal",
      }),
    ).rejects.toThrow("paid approval");

    const paidStats = await t.query(internal.admin.stats, {});
    expect(paidStats).toMatchObject({
      owedToCreators: 20,
      paidToCreators: 20,
      owedToManagers: 0,
      paidToManagers: 10,
    });

    const managerRows = await t.query(internal.admin.listManagers, { limit: 20 });
    expect(managerRows[0]).toMatchObject({
      code: manager.code,
      submitted: 1,
      approved: 1,
      owed: 0,
      paidOut: 10,
    });
  });

  test("moves rejected attribution out of the export and restores it on resubmission", async () => {
    const t = setup();
    await t.mutation(internal.creators.submit, creatorArgs("transition"));
    const creatorId = await creatorIdByEmail(t, "creator-transition@gowish.example.com");

    await t.mutation(internal.admin.setStatus, {
      ids: [creatorId],
      status: "rejected",
      reason: "GoWish declined",
    });

    const rejected = await t.run((ctx) => ctx.db.get(creatorId));
    expect(rejected).toMatchObject({ status: "rejected", attributionState: "ineligible" });

    const pendingAfterReject = await t.query(internal.admin.attribution, {
      state: "pending",
      limit: 100,
    });
    expect(pendingAfterReject.count).toBe(0);

    await t.mutation(internal.admin.setStatus, {
      ids: [creatorId],
      status: "submitted",
      reason: "Corrected and resubmitted",
    });

    const restored = await t.run((ctx) => ctx.db.get(creatorId));
    expect(restored).toMatchObject({ status: "submitted", attributionState: "pending" });
  });

  test("marks attribution batches exactly once and keeps sent history visible", async () => {
    const t = setup();
    await t.mutation(internal.creators.submit, creatorArgs("attribution"));
    const creatorId = await creatorIdByEmail(t, "creator-attribution@gowish.example.com");

    const pending = await t.query(internal.admin.attribution, {
      state: "pending",
      limit: 100,
    });
    expect(pending.count).toBe(1);
    expect(pending.rows[0]).toMatchObject({ id: creatorId, state: "pending" });
    expect(pending.tsv).toContain("creator-attribution@gowish.example.com");

    await expect(
      t.mutation(internal.admin.markAttributionSent, {
        ids: [creatorId],
        batchId: "TC-2026-08-31-A",
      }),
    ).resolves.toEqual({ ok: true, updated: 1, unchanged: 0 });

    const empty = await t.query(internal.admin.attribution, {
      state: "pending",
      limit: 100,
    });
    expect(empty.count).toBe(0);

    const sent = await t.query(internal.admin.attribution, {
      state: "sent",
      limit: 100,
    });
    expect(sent.rows[0]).toMatchObject({
      id: creatorId,
      state: "sent",
      batchId: "TC-2026-08-31-A",
    });

    await expect(
      t.mutation(internal.admin.markAttributionSent, {
        ids: [creatorId],
        batchId: "TC-2026-08-31-A",
      }),
    ).resolves.toEqual({ ok: true, updated: 0, unchanged: 1 });
  });

  test("allows controlled identity corrections and protects paid payout details", async () => {
    const t = setup();
    await t.mutation(internal.creators.submit, creatorArgs("first"));
    await t.mutation(internal.creators.submit, creatorArgs("second"));
    const firstId = await creatorIdByEmail(t, "creator-first@gowish.example.com");

    await expect(
      t.mutation(internal.admin.updateCreator, {
        id: firstId,
        gowishEmail: "creator-second@gowish.example.com",
        reason: "Creator supplied the wrong GoWish email",
      }),
    ).rejects.toThrow("already belongs to another submission");

    await expect(
      t.mutation(internal.admin.updateCreator, {
        id: firstId,
        contactEmail: "corrected@example.com",
        venmoHandle: "@corrected-venmo",
        venmoLegalName: "Corrected Person",
        reason: "Creator confirmed corrected payment details",
      }),
    ).resolves.toEqual({ ok: true, updatedFields: 3 });

    await t.mutation(internal.admin.setStatus, {
      ids: [firstId],
      status: "approved",
      reason: "Approved by GoWish",
    });
    await t.mutation(internal.admin.markPaid, {
      ids: [firstId],
      who: "creator",
      paymentReference: "VENMO-PAID",
    });

    await expect(
      t.mutation(internal.admin.updateCreator, {
        id: firstId,
        venmoHandle: "@after-payment",
        reason: "Late correction",
      }),
    ).rejects.toThrow("after the creator payout is marked paid");

    const events = await t.run((ctx) =>
      ctx.db
        .query("auditEvents")
        .withIndex("by_entityKey", (q) => q.eq("entityKey", `creator:${firstId}`))
        .collect(),
    );
    expect(events.map((event) => event.action)).toContain("creator_updated");
    expect(events.map((event) => event.action)).toContain("creator_paid");
  });

  test("bounds creator and manager listing requests", async () => {
    const t = setup();

    await expect(t.query(internal.admin.listCreators, { limit: 501 })).rejects.toThrow("between 1 and 200");
    await expect(t.query(internal.admin.listManagers, { limit: 501 })).rejects.toThrow("between 1 and 200");
  });

  test("supports the existing admin page contract with audited undo and notes", async () => {
    const t = setup();
    const submitted = await t.mutation(internal.creators.submit, creatorArgs("contract"));
    const creatorId = await creatorIdByEmail(t, "creator-contract@gowish.example.com");

    const initialStats = await t.query(internal.admin.stats, {});
    expect(initialStats.attributionPending).toBe(1);

    await t.mutation(internal.admin.setStatus, {
      ids: [creatorId],
      status: "approved",
    });
    await t.mutation(internal.admin.markPaid, {
      ids: [creatorId],
      who: "creator",
    });
    await t.mutation(internal.admin.updateCreator, {
      id: creatorId,
      contactEmail: "creator-contract@example.com",
      gowishEmail: "creator-contract@gowish.example.com",
      venmoHandle: "@creator-contract-pay",
      venmoLegalName: "Creator contract",
      notes: "Creator confirmed the correction by phone.",
    });

    const paidRows = await t.query(internal.admin.listCreators, { limit: 20 });
    expect(paidRows[0]).toMatchObject({
      submissionId: submitted.id,
      creatorPaid: true,
      managerPaid: false,
      attributionSent: false,
      notes: "Creator confirmed the correction by phone.",
    });

    await t.mutation(internal.admin.markPaid, {
      ids: [creatorId],
      who: "creator",
      unpay: true,
    });
    const unpaidRows = await t.query(internal.admin.listCreators, { limit: 20 });
    expect(unpaidRows[0].creatorPaid).toBe(false);

    const attribution = await t.query(internal.admin.attribution, { limit: 20 });
    expect(attribution.ids).toEqual([creatorId]);
    await t.mutation(internal.admin.markAttributionSent, { ids: [creatorId] });
    const finalStats = await t.query(internal.admin.stats, {});
    expect(finalStats.attributionPending).toBe(0);

    const events = await t.run((ctx) =>
      ctx.db
        .query("auditEvents")
        .withIndex("by_entityKey", (q) => q.eq("entityKey", `creator:${creatorId}`))
        .collect(),
    );
    expect(events.map((event) => event.action)).toContain("creator_payment_reversed");
  });
});
