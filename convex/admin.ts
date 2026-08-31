import { v } from "convex/values";
import type { Doc, Id } from "./_generated/dataModel";
import { internalMutation, internalQuery } from "./_generated/server";
import { recordAudit } from "./audit";
import { attributionState, creatorStatus } from "./schema";
import { changeProgramStats, ensureProgramStats } from "./stats";
import {
  businessError,
  normalizeCode,
  normalizeEmail,
  normalizeHandle,
  required,
} from "./validation";

const maxAdminBatch = 100;
const maxListLimit = 200;

const operationResult = v.object({
  ok: v.literal(true),
  updated: v.number(),
  unchanged: v.number(),
});

const creatorRow = v.object({
  id: v.id("creators"),
  submittedAt: v.number(),
  reference: v.string(),
  fullName: v.string(),
  contactEmail: v.string(),
  gowishEmail: v.string(),
  phone: v.string(),
  country: v.literal("United States"),
  platform: v.union(v.literal("Instagram"), v.literal("TikTok"), v.literal("YouTube"), v.literal("Other")),
  handle: v.string(),
  followers: v.string(),
  otherHandles: v.string(),
  venmoHandle: v.string(),
  venmoLegalName: v.string(),
  managerCode: v.string(),
  status: creatorStatus,
  approvedAt: v.union(v.number(), v.null()),
  rejectedAt: v.union(v.number(), v.null()),
  creatorBonusAmount: v.number(),
  managerBonusAmount: v.number(),
  partnerRevenueAmount: v.number(),
  creatorPaidAt: v.union(v.number(), v.null()),
  creatorPaymentReference: v.string(),
  managerPaidAt: v.union(v.number(), v.null()),
  managerPaymentReference: v.string(),
  attributionState,
  attributionSentAt: v.union(v.number(), v.null()),
  attributionBatchId: v.string(),
  submissionId: v.string(),
  creatorPaid: v.boolean(),
  managerPaid: v.boolean(),
  attributionSent: v.boolean(),
  notes: v.string(),
  consentVersion: v.string(),
  consentAcceptedAt: v.number(),
});

const attributionRow = v.object({
  id: v.id("creators"),
  reference: v.string(),
  name: v.string(),
  gowishEmail: v.string(),
  platform: v.union(v.literal("Instagram"), v.literal("TikTok"), v.literal("YouTube"), v.literal("Other")),
  handle: v.string(),
  submittedAt: v.number(),
  status: creatorStatus,
  state: attributionState,
  sentAt: v.union(v.number(), v.null()),
  batchId: v.union(v.string(), v.null()),
});

function listLimit(value: number | undefined) {
  const limit = value ?? 100;
  if (!Number.isInteger(limit) || limit < 1 || limit > maxListLimit) {
    throw businessError(`Limit must be between 1 and ${maxListLimit}.`);
  }
  return limit;
}

function uniqueIds(ids: Array<Id<"creators">>) {
  if (ids.length < 1 || ids.length > maxAdminBatch) {
    throw businessError(`Choose between 1 and ${maxAdminBatch} creators.`);
  }
  const seen = new Set<string>();
  return ids.filter((id) => {
    if (seen.has(id)) return false;
    seen.add(id);
    return true;
  });
}

function mapCreator(row: Doc<"creators">) {
  return {
    id: row._id,
    submittedAt: row._creationTime,
    reference: row.reference,
    fullName: row.fullName,
    contactEmail: row.contactEmail,
    gowishEmail: row.gowishEmail,
    phone: row.phone ?? "",
    country: row.country,
    platform: row.platform,
    handle: row.handle,
    followers: row.followers,
    otherHandles: row.otherHandles ?? "",
    venmoHandle: row.venmoHandle,
    venmoLegalName: row.venmoLegalName,
    managerCode: row.managerCode ?? "",
    status: row.status,
    approvedAt: row.approvedAt ?? null,
    rejectedAt: row.rejectedAt ?? null,
    creatorBonusAmount: row.creatorBonusAmount,
    managerBonusAmount: row.managerBonusAmount,
    partnerRevenueAmount: row.partnerRevenueAmount,
    creatorPaidAt: row.creatorPaidAt ?? null,
    creatorPaymentReference: row.creatorPaymentReference ?? "",
    managerPaidAt: row.managerPaidAt ?? null,
    managerPaymentReference: row.managerPaymentReference ?? "",
    attributionState: row.attributionState,
    attributionSentAt: row.attributionSentAt ?? null,
    attributionBatchId: row.attributionBatchId ?? "",
    submissionId: row.reference,
    creatorPaid: Boolean(row.creatorPaidAt),
    managerPaid: Boolean(row.managerPaidAt),
    attributionSent: row.attributionState === "sent",
    notes: row.notes ?? "",
    consentVersion: row.consentVersion,
    consentAcceptedAt: row.consentAcceptedAt,
  };
}

export const listCreators = internalQuery({
  args: {
    status: v.optional(creatorStatus),
    managerCode: v.optional(v.string()),
    limit: v.optional(v.number()),
  },
  returns: v.array(creatorRow),
  handler: async (ctx, args) => {
    const limit = listLimit(args.limit);
    const managerCode = args.managerCode ? normalizeCode(args.managerCode) : undefined;
    let rows: Array<Doc<"creators">>;

    if (managerCode && args.status) {
      const status = args.status;
      rows = await ctx.db
        .query("creators")
        .withIndex("by_managerCode_and_status", (q) => q.eq("managerCode", managerCode).eq("status", status))
        .order("desc")
        .take(limit);
    } else if (managerCode) {
      rows = await ctx.db
        .query("creators")
        .withIndex("by_managerCode", (q) => q.eq("managerCode", managerCode))
        .order("desc")
        .take(limit);
    } else if (args.status) {
      const status = args.status;
      rows = await ctx.db
        .query("creators")
        .withIndex("by_status", (q) => q.eq("status", status))
        .order("desc")
        .take(limit);
    } else {
      rows = await ctx.db.query("creators").order("desc").take(limit);
    }

    return rows.map(mapCreator);
  },
});

export const listManagers = internalQuery({
  args: { limit: v.optional(v.number()) },
  returns: v.array(
    v.object({
      id: v.id("managers"),
      registeredAt: v.number(),
      code: v.string(),
      fullName: v.string(),
      email: v.string(),
      phone: v.string(),
      company: v.string(),
      socialHandle: v.string(),
      venmoHandle: v.string(),
      venmoLegalName: v.string(),
      estCreators: v.string(),
      source: v.string(),
      enabled: v.boolean(),
      submitted: v.number(),
      approved: v.number(),
      owed: v.number(),
      paidOut: v.number(),
    }),
  ),
  handler: async (ctx, args) => {
    const managers = await ctx.db.query("managers").order("desc").take(listLimit(args.limit));
    return managers.map((manager) => ({
      id: manager._id,
      registeredAt: manager._creationTime,
      code: manager.code,
      fullName: manager.fullName,
      email: manager.email,
      phone: manager.phone ?? "",
      company: manager.company ?? "",
      socialHandle: manager.socialHandle ?? "",
      venmoHandle: manager.venmoHandle,
      venmoLegalName: manager.venmoLegalName,
      estCreators: manager.estCreators,
      source: manager.source ?? "",
      enabled: manager.enabled,
      submitted: manager.creatorCount,
      approved: manager.approvedCreatorCount,
      owed: manager.managerOwedAmount,
      paidOut: manager.managerPaidAmount,
    }));
  },
});

export const stats = internalQuery({
  args: {},
  returns: v.object({
    total: v.number(),
    submitted: v.number(),
    approved: v.number(),
    rejected: v.number(),
    withManager: v.number(),
    owedToCreators: v.number(),
    paidToCreators: v.number(),
    owedToManagers: v.number(),
    paidToManagers: v.number(),
    grossOnApproved: v.number(),
    attributionPending: v.number(),
  }),
  handler: async (ctx) => {
    const row = await ctx.db
      .query("programStats")
      .withIndex("by_key", (q) => q.eq("key", "global"))
      .unique();
    return {
      total: row?.totalCreators ?? 0,
      submitted: row?.submittedCount ?? 0,
      approved: row?.approvedCount ?? 0,
      rejected: row?.rejectedCount ?? 0,
      withManager: row?.withManagerCount ?? 0,
      owedToCreators: row?.creatorOwedAmount ?? 0,
      paidToCreators: row?.creatorPaidAmount ?? 0,
      owedToManagers: row?.managerOwedAmount ?? 0,
      paidToManagers: row?.managerPaidAmount ?? 0,
      grossOnApproved: row?.grossOnApproved ?? 0,
      attributionPending: row?.attributionPending ?? 0,
    };
  },
});

export const setStatus = internalMutation({
  args: {
    ids: v.array(v.id("creators")),
    status: creatorStatus,
    reason: v.optional(v.string()),
  },
  returns: operationResult,
  handler: async (ctx, args) => {
    const ids = uniqueIds(args.ids);
    const reason = args.reason ? required(args.reason, 500, "Reason") : "Manual status update";
    const rows = await Promise.all(ids.map((id) => ctx.db.get("creators", id)));
    if (rows.some((row) => !row)) throw businessError("One or more creators were not found.");

    let updated = 0;
    let unchanged = 0;

    for (const row of rows as Array<Doc<"creators">>) {
      if (row.status === args.status) {
        unchanged += 1;
        continue;
      }

      if (row.status === "rejected" && args.status === "approved") {
        throw businessError("A rejected creator must be returned to submitted before approval.");
      }
      if (row.status === "approved" && (row.creatorPaidAt || row.managerPaidAt)) {
        throw businessError("A paid approval cannot be changed to another status.");
      }

      const now = Date.now();
      const patch: Partial<Doc<"creators">> = {
        status: args.status,
        approvedAt: args.status === "approved" ? now : undefined,
        rejectedAt: args.status === "rejected" ? now : undefined,
      };

      if (row.attributionState !== "sent") {
        patch.attributionState = args.status === "rejected" ? "ineligible" : "pending";
        if (row.attributionState === "pending" && patch.attributionState === "ineligible") {
          await changeProgramStats(ctx, { attributionPending: -1 });
        } else if (row.attributionState === "ineligible" && patch.attributionState === "pending") {
          await changeProgramStats(ctx, { attributionPending: 1 });
        }
      }

      if (row.status === "submitted" && args.status === "approved") {
        await changeProgramStats(ctx, {
          submittedCount: -1,
          approvedCount: 1,
          creatorOwedAmount: row.creatorBonusAmount,
          managerOwedAmount: row.managerBonusAmount,
          grossOnApproved: row.partnerRevenueAmount,
        });
      } else if (row.status === "submitted" && args.status === "rejected") {
        await changeProgramStats(ctx, { submittedCount: -1, rejectedCount: 1 });
      } else if (row.status === "rejected" && args.status === "submitted") {
        await changeProgramStats(ctx, { rejectedCount: -1, submittedCount: 1 });
      } else if (row.status === "approved" && args.status === "submitted") {
        await changeProgramStats(ctx, {
          approvedCount: -1,
          submittedCount: 1,
          creatorOwedAmount: -row.creatorBonusAmount,
          managerOwedAmount: -row.managerBonusAmount,
          grossOnApproved: -row.partnerRevenueAmount,
        });
      } else if (row.status === "approved" && args.status === "rejected") {
        await changeProgramStats(ctx, {
          approvedCount: -1,
          rejectedCount: 1,
          creatorOwedAmount: -row.creatorBonusAmount,
          managerOwedAmount: -row.managerBonusAmount,
          grossOnApproved: -row.partnerRevenueAmount,
        });
      }

      if (row.managerId && (row.status === "approved" || args.status === "approved")) {
        const manager = await ctx.db.get("managers", row.managerId);
        if (!manager) throw businessError("The attributed manager no longer exists.");
        const delta = args.status === "approved" ? 1 : -1;
        await ctx.db.patch("managers", manager._id, {
          approvedCreatorCount: manager.approvedCreatorCount + delta,
          managerOwedAmount: manager.managerOwedAmount + delta * row.managerBonusAmount,
        });
      }

      await ctx.db.patch("creators", row._id, patch);
      await recordAudit(ctx, {
        actor: "admin",
        action: "creator_status_changed",
        entityType: "creator",
        entityKey: `creator:${row._id}`,
        details: { from: row.status, to: args.status, reason },
      });
      updated += 1;
    }

    return { ok: true as const, updated, unchanged };
  },
});

export const markPaid = internalMutation({
  args: {
    ids: v.array(v.id("creators")),
    who: v.union(v.literal("creator"), v.literal("manager")),
    paymentReference: v.optional(v.string()),
    unpay: v.optional(v.boolean()),
  },
  returns: operationResult,
  handler: async (ctx, args) => {
    const ids = uniqueIds(args.ids);
    const paymentReference = args.unpay
      ? undefined
      : args.paymentReference
        ? required(args.paymentReference, 120, "Payment reference")
        : `manual-${Date.now()}`;
    const rows = await Promise.all(ids.map((id) => ctx.db.get("creators", id)));
    if (rows.some((row) => !row)) throw businessError("One or more creators were not found.");

    for (const row of rows as Array<Doc<"creators">>) {
      if (row.status !== "approved") {
        throw businessError("Payouts can only be marked after the creator is approved.");
      }
      if (args.who === "manager" && !row.managerId) {
        throw businessError(`Creator ${row.reference} does not have an attributed manager.`);
      }
    }

    let updated = 0;
    let unchanged = 0;

    for (const row of rows as Array<Doc<"creators">>) {
      const alreadyPaid = args.who === "creator" ? row.creatorPaidAt : row.managerPaidAt;
      if (args.unpay && !alreadyPaid) {
        unchanged += 1;
        continue;
      }
      if (!args.unpay && alreadyPaid) {
        unchanged += 1;
        continue;
      }

      const now = Date.now();
      if (args.who === "creator") {
        if (args.unpay) {
          await ctx.db.patch("creators", row._id, {
            creatorPaidAt: undefined,
            creatorPaymentReference: undefined,
          });
          await changeProgramStats(ctx, {
            creatorOwedAmount: row.creatorBonusAmount,
            creatorPaidAmount: -row.creatorBonusAmount,
          });
        } else {
          await ctx.db.patch("creators", row._id, {
            creatorPaidAt: now,
            creatorPaymentReference: paymentReference,
          });
          await changeProgramStats(ctx, {
            creatorOwedAmount: -row.creatorBonusAmount,
            creatorPaidAmount: row.creatorBonusAmount,
          });
        }
      } else {
        const manager = await ctx.db.get("managers", row.managerId as Id<"managers">);
        if (!manager) throw businessError("The attributed manager no longer exists.");
        if (args.unpay) {
          await ctx.db.patch("creators", row._id, {
            managerPaidAt: undefined,
            managerPaymentReference: undefined,
          });
          await ctx.db.patch("managers", manager._id, {
            managerOwedAmount: manager.managerOwedAmount + row.managerBonusAmount,
            managerPaidAmount: manager.managerPaidAmount - row.managerBonusAmount,
          });
          await changeProgramStats(ctx, {
            managerOwedAmount: row.managerBonusAmount,
            managerPaidAmount: -row.managerBonusAmount,
          });
        } else {
          await ctx.db.patch("creators", row._id, {
            managerPaidAt: now,
            managerPaymentReference: paymentReference,
          });
          await ctx.db.patch("managers", manager._id, {
            managerOwedAmount: manager.managerOwedAmount - row.managerBonusAmount,
            managerPaidAmount: manager.managerPaidAmount + row.managerBonusAmount,
          });
          await changeProgramStats(ctx, {
            managerOwedAmount: -row.managerBonusAmount,
            managerPaidAmount: row.managerBonusAmount,
          });
        }
      }

      await recordAudit(ctx, {
        actor: "admin",
        action: args.unpay
          ? args.who === "creator"
            ? "creator_payment_reversed"
            : "manager_payment_reversed"
          : args.who === "creator"
            ? "creator_paid"
            : "manager_paid",
        entityType: "creator",
        entityKey: `creator:${row._id}`,
        details: {
          amount: args.who === "creator" ? row.creatorBonusAmount : row.managerBonusAmount,
          paymentReference: args.unpay
            ? args.who === "creator"
              ? row.creatorPaymentReference ?? null
              : row.managerPaymentReference ?? null
            : paymentReference,
          managerCode: row.managerCode ?? null,
          reversal: Boolean(args.unpay),
        },
      });
      updated += 1;
    }

    return { ok: true as const, updated, unchanged };
  },
});

export const updateCreator = internalMutation({
  args: {
    id: v.id("creators"),
    fullName: v.optional(v.string()),
    contactEmail: v.optional(v.string()),
    gowishEmail: v.optional(v.string()),
    venmoHandle: v.optional(v.string()),
    venmoLegalName: v.optional(v.string()),
    notes: v.optional(v.string()),
    reason: v.optional(v.string()),
  },
  returns: v.object({ ok: v.literal(true), updatedFields: v.number() }),
  handler: async (ctx, args) => {
    const creator = await ctx.db.get("creators", args.id);
    if (!creator) throw businessError("Creator not found.");
    const reason = args.reason ? required(args.reason, 500, "Reason") : "Manual creator update";
    const patch: Partial<Doc<"creators">> = {};
    const fields: string[] = [];

    if (args.fullName !== undefined) {
      const fullName = required(args.fullName, 120, "Name");
      if (fullName !== creator.fullName) {
        patch.fullName = fullName;
        fields.push("fullName");
      }
    }
    if (args.contactEmail !== undefined) {
      const contactEmail = normalizeEmail(args.contactEmail, "Contact email");
      if (contactEmail !== creator.contactEmail) {
        patch.contactEmail = contactEmail;
        fields.push("contactEmail");
      }
    }
    if (args.gowishEmail !== undefined) {
      const gowishEmail = normalizeEmail(args.gowishEmail, "GoWish account email");
      if (gowishEmail !== creator.gowishEmail) {
        if (creator.status === "approved" || creator.attributionState === "sent") {
          throw businessError("The GoWish email cannot be changed after approval or attribution submission.");
        }
        const duplicate = await ctx.db
          .query("creators")
          .withIndex("by_gowishEmail", (q) => q.eq("gowishEmail", gowishEmail))
          .unique();
        if (duplicate && duplicate._id !== creator._id) {
          throw businessError("That GoWish account email already belongs to another submission.");
        }
        patch.gowishEmail = gowishEmail;
        fields.push("gowishEmail");
      }
    }
    if (args.venmoHandle !== undefined || args.venmoLegalName !== undefined) {
      const venmoHandle = args.venmoHandle === undefined
        ? creator.venmoHandle
        : normalizeHandle(args.venmoHandle, "Venmo handle");
      const venmoLegalName = args.venmoLegalName === undefined
        ? creator.venmoLegalName
        : required(args.venmoLegalName, 120, "Venmo legal name");
      const venmoChanged = venmoHandle !== creator.venmoHandle || venmoLegalName !== creator.venmoLegalName;
      if (venmoChanged && creator.creatorPaidAt) {
        throw businessError("Venmo details cannot be changed after the creator payout is marked paid.");
      }
      if (args.venmoHandle !== undefined) {
        if (venmoHandle !== creator.venmoHandle) {
          patch.venmoHandle = venmoHandle;
          fields.push("venmoHandle");
        }
      }
      if (args.venmoLegalName !== undefined) {
        if (venmoLegalName !== creator.venmoLegalName) {
          patch.venmoLegalName = venmoLegalName;
          fields.push("venmoLegalName");
        }
      }
    }
    if (args.notes !== undefined) {
      const notes = args.notes.trim() ? required(args.notes, 2000, "Notes") : undefined;
      if (notes !== creator.notes) {
        patch.notes = notes;
        fields.push("notes");
      }
    }

    if (!fields.length) throw businessError("No creator fields were provided for update.");
    await ctx.db.patch("creators", creator._id, patch);
    await recordAudit(ctx, {
      actor: "admin",
      action: "creator_updated",
      entityType: "creator",
      entityKey: `creator:${creator._id}`,
      details: { fields, reason },
    });
    return { ok: true as const, updatedFields: fields.length };
  },
});

function tsvValue(value: string) {
  const flattened = value.replace(/[\t\r\n]+/g, " ").trim();
  return /^[=+\-@]/.test(flattened) ? `'${flattened}` : flattened;
}

export const attribution = internalQuery({
  args: {
    state: v.optional(attributionState),
    limit: v.optional(v.number()),
  },
  returns: v.object({
    count: v.number(),
    ids: v.array(v.id("creators")),
    rows: v.array(attributionRow),
    tsv: v.string(),
  }),
  handler: async (ctx, args) => {
    const state = args.state ?? "pending";
    const rows = await ctx.db
      .query("creators")
      .withIndex("by_attributionState", (q) => q.eq("attributionState", state))
      .order("asc")
      .take(listLimit(args.limit));
    const output = rows.map((row) => ({
      id: row._id,
      reference: row.reference,
      name: row.fullName,
      gowishEmail: row.gowishEmail,
      platform: row.platform,
      handle: row.handle,
      submittedAt: row._creationTime,
      status: row.status,
      state: row.attributionState,
      sentAt: row.attributionSentAt ?? null,
      batchId: row.attributionBatchId ?? null,
    }));
    const header = ["Reference", "Name", "GoWish account email", "Platform", "Handle", "Submitted"].join("\t");
    const lines = output.map((row) =>
      [
        row.reference,
        row.name,
        row.gowishEmail,
        row.platform,
        row.handle,
        new Date(row.submittedAt).toISOString().slice(0, 10),
      ]
        .map(tsvValue)
        .join("\t"),
    );
    return { count: output.length, ids: output.map((row) => row.id), rows: output, tsv: [header, ...lines].join("\n") };
  },
});

export const markAttributionSent = internalMutation({
  args: {
    ids: v.array(v.id("creators")),
    batchId: v.optional(v.string()),
  },
  returns: operationResult,
  handler: async (ctx, args) => {
    const ids = uniqueIds(args.ids);
    const batchId = args.batchId
      ? required(args.batchId, 120, "Attribution batch ID")
      : `manual-${Date.now()}`;
    const rows = await Promise.all(ids.map((id) => ctx.db.get("creators", id)));
    if (rows.some((row) => !row)) throw businessError("One or more creators were not found.");

    for (const row of rows as Array<Doc<"creators">>) {
      if (row.attributionState === "sent" && args.batchId && row.attributionBatchId !== batchId) {
        throw businessError(`Creator ${row.reference} was already sent in another attribution batch.`);
      }
      if (row.attributionState === "ineligible") {
        throw businessError(`Creator ${row.reference} is not eligible for attribution.`);
      }
    }

    let updated = 0;
    let unchanged = 0;
    for (const row of rows as Array<Doc<"creators">>) {
      if (row.attributionState === "sent") {
        unchanged += 1;
        continue;
      }
      const sentAt = Date.now();
      await ctx.db.patch("creators", row._id, {
        attributionState: "sent",
        attributionSentAt: sentAt,
        attributionBatchId: batchId,
      });
      await changeProgramStats(ctx, { attributionPending: -1 });
      await recordAudit(ctx, {
        actor: "admin",
        action: "attribution_sent",
        entityType: "creator",
        entityKey: `creator:${row._id}`,
        details: { batchId, sentAt },
      });
      updated += 1;
    }
    return { ok: true as const, updated, unchanged };
  },
});

export const setManagerDisabled = internalMutation({
  args: {
    id: v.id("managers"),
    disabled: v.boolean(),
    reason: v.string(),
  },
  returns: v.object({ ok: v.literal(true), changed: v.boolean() }),
  handler: async (ctx, args) => {
    const manager = await ctx.db.get("managers", args.id);
    if (!manager) throw businessError("Manager not found.");
    const enabled = !args.disabled;
    if (manager.enabled === enabled) return { ok: true as const, changed: false };
    const reason = required(args.reason, 500, "Reason");
    await ctx.db.patch("managers", manager._id, { enabled });
    await recordAudit(ctx, {
      actor: "admin",
      action: enabled ? "manager_enabled" : "manager_disabled",
      entityType: "manager",
      entityKey: `manager:${manager._id}`,
      details: { reason },
    });
    return { ok: true as const, changed: true };
  },
});

export const initializeStats = internalMutation({
  args: {},
  returns: v.object({ ok: v.literal(true) }),
  handler: async (ctx) => {
    await ensureProgramStats(ctx);
    return { ok: true as const };
  },
});

export const cleanupTestData = internalMutation({
  args: {
    creatorIds: v.array(v.id("creators")),
    managerIds: v.array(v.id("managers")),
    testRunId: v.string(),
    confirmation: v.literal("DELETE_TEST_DATA"),
  },
  returns: v.object({
    ok: v.literal(true),
    deletedCreators: v.number(),
    deletedManagers: v.number(),
  }),
  handler: async (ctx, args) => {
    const creatorIds = args.creatorIds.length ? uniqueIds(args.creatorIds) : [];
    if (!creatorIds.length && !args.managerIds.length) {
      throw businessError("Choose at least one test record to clean up.");
    }
    if (args.managerIds.length > maxAdminBatch) {
      throw businessError(`Choose no more than ${maxAdminBatch} managers.`);
    }
    const testRunId = required(args.testRunId, 80, "Test run ID");
    const managerIdSet = new Set(args.managerIds.map(String));
    if (managerIdSet.size !== args.managerIds.length) {
      throw businessError("Duplicate manager IDs are not allowed.");
    }

    const creators = await Promise.all(creatorIds.map((id) => ctx.db.get("creators", id)));
    const managers = await Promise.all(args.managerIds.map((id) => ctx.db.get("managers", id)));
    if (creators.some((row) => !row) || managers.some((row) => !row)) {
      throw businessError("One or more test records were not found.");
    }
    if (creators.some((row) => row?.testRunId !== testRunId) || managers.some((row) => row?.testRunId !== testRunId)) {
      throw businessError("Cleanup can only remove records created by the matching test run.");
    }

    const creatorIdSet = new Set(creatorIds.map(String));
    for (const manager of managers as Array<Doc<"managers">>) {
      const linked = await ctx.db
        .query("creators")
        .withIndex("by_managerCode", (q) => q.eq("managerCode", manager.code))
        .take(maxAdminBatch + 1);
      if (linked.some((creator) => !creatorIdSet.has(String(creator._id)))) {
        throw businessError(`Manager ${manager.code} still has creators outside this test cleanup.`);
      }
    }

    for (const creator of creators as Array<Doc<"creators">>) {
      const statsChange = {
        totalCreators: -1,
        submittedCount: creator.status === "submitted" ? -1 : 0,
        approvedCount: creator.status === "approved" ? -1 : 0,
        rejectedCount: creator.status === "rejected" ? -1 : 0,
        withManagerCount: creator.managerId ? -1 : 0,
        creatorOwedAmount: creator.status === "approved" && !creator.creatorPaidAt ? -creator.creatorBonusAmount : 0,
        creatorPaidAmount: creator.creatorPaidAt ? -creator.creatorBonusAmount : 0,
        managerOwedAmount: creator.status === "approved" && creator.managerId && !creator.managerPaidAt ? -creator.managerBonusAmount : 0,
        managerPaidAmount: creator.managerPaidAt ? -creator.managerBonusAmount : 0,
        grossOnApproved: creator.status === "approved" ? -creator.partnerRevenueAmount : 0,
        attributionPending: creator.attributionState === "pending" ? -1 : 0,
      };
      await changeProgramStats(ctx, statsChange);

      if (creator.managerId) {
        const manager = await ctx.db.get("managers", creator.managerId);
        if (!manager) throw businessError("The attributed manager no longer exists.");
        await ctx.db.patch("managers", manager._id, {
          creatorCount: manager.creatorCount - 1,
          approvedCreatorCount: manager.approvedCreatorCount - (creator.status === "approved" ? 1 : 0),
          managerOwedAmount:
            manager.managerOwedAmount -
            (creator.status === "approved" && !creator.managerPaidAt ? creator.managerBonusAmount : 0),
          managerPaidAmount: manager.managerPaidAmount - (creator.managerPaidAt ? creator.managerBonusAmount : 0),
        });
      }

      const events = await ctx.db
        .query("auditEvents")
        .withIndex("by_entityKey", (q) => q.eq("entityKey", `creator:${creator._id}`))
        .take(200);
      for (const event of events) await ctx.db.delete("auditEvents", event._id);
      await ctx.db.delete("creators", creator._id);
    }

    for (const manager of managers as Array<Doc<"managers">>) {
      const refreshed = await ctx.db.get("managers", manager._id);
      if (!refreshed) continue;
      if (refreshed.creatorCount !== 0 || refreshed.managerOwedAmount !== 0 || refreshed.managerPaidAmount !== 0) {
        throw businessError(`Manager ${refreshed.code} still has financial or creator records.`);
      }
      const events = await ctx.db
        .query("auditEvents")
        .withIndex("by_entityKey", (q) => q.eq("entityKey", `manager:${manager._id}`))
        .take(200);
      for (const event of events) await ctx.db.delete("auditEvents", event._id);
      await ctx.db.delete("managers", manager._id);
    }

    return {
      ok: true as const,
      deletedCreators: creatorIds.length,
      deletedManagers: args.managerIds.length,
    };
  },
});
