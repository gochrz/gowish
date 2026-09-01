import { defineSchema, defineTable } from "convex/server";
import { v } from "convex/values";

export const creatorStatus = v.union(
  v.literal("submitted"),
  v.literal("approved"),
  v.literal("rejected"),
);

export const attributionState = v.union(
  v.literal("pending"),
  v.literal("sent"),
  v.literal("ineligible"),
);

export const platform = v.union(
  v.literal("Instagram"),
  v.literal("TikTok"),
  v.literal("YouTube"),
  v.literal("Other"),
);

export const payoutMethod = v.union(
  v.literal("venmo"),
  v.literal("apple_cash"),
  v.literal("paypal"),
);

export default defineSchema({
  managers: defineTable({
    code: v.string(),
    fullName: v.string(),
    email: v.string(),
    phone: v.optional(v.string()),
    company: v.optional(v.string()),
    socialHandle: v.optional(v.string()),
    payoutMethod,
    payoutDestination: v.string(),
    payoutLegalName: v.string(),
    estCreators: v.string(),
    source: v.optional(v.string()),
    enabled: v.boolean(),
    consentAccepted: v.boolean(),
    consentVersion: v.string(),
    consentAcceptedAt: v.number(),
    consentOrigin: v.string(),
    consentUserAgent: v.optional(v.string()),
    consentIpHash: v.optional(v.string()),
    creatorCount: v.number(),
    approvedCreatorCount: v.number(),
    managerOwedAmount: v.number(),
    managerPaidAmount: v.number(),
    testRunId: v.optional(v.string()),
  })
    .index("by_code", ["code"])
    .index("by_email", ["email"])
    .index("by_enabled", ["enabled"]),

  creators: defineTable({
    reference: v.string(),
    fullName: v.string(),
    contactEmail: v.string(),
    gowishEmail: v.string(),
    phone: v.optional(v.string()),
    country: v.string(),
    platform,
    handle: v.string(),
    followers: v.string(),
    otherHandles: v.optional(v.string()),
    payoutMethod,
    payoutDestination: v.string(),
    payoutLegalName: v.string(),
    managerCode: v.optional(v.string()),
    managerId: v.optional(v.id("managers")),
    status: creatorStatus,
    approvedAt: v.optional(v.number()),
    rejectedAt: v.optional(v.number()),
    creatorBonusAmount: v.number(),
    managerBonusAmount: v.number(),
    partnerRevenueAmount: v.number(),
    creatorPaidAt: v.optional(v.number()),
    creatorPaymentReference: v.optional(v.string()),
    managerPaidAt: v.optional(v.number()),
    managerPaymentReference: v.optional(v.string()),
    attributionState,
    attributionSentAt: v.optional(v.number()),
    attributionBatchId: v.optional(v.string()),
    consentAccepted: v.boolean(),
    consentVersion: v.string(),
    consentAcceptedAt: v.number(),
    consentOrigin: v.string(),
    consentUserAgent: v.optional(v.string()),
    consentIpHash: v.optional(v.string()),
    notes: v.optional(v.string()),
    testRunId: v.optional(v.string()),
  })
    .index("by_reference", ["reference"])
    .index("by_gowishEmail", ["gowishEmail"])
    .index("by_status", ["status"])
    .index("by_managerCode", ["managerCode"])
    .index("by_managerCode_and_status", ["managerCode", "status"])
    .index("by_attributionState", ["attributionState"]),

  auditEvents: defineTable({
    actor: v.union(v.literal("public"), v.literal("admin"), v.literal("system")),
    action: v.string(),
    entityType: v.union(v.literal("creator"), v.literal("manager"), v.literal("system")),
    entityKey: v.string(),
    eventAt: v.number(),
    details: v.string(),
  })
    .index("by_entityKey", ["entityKey"])
    .index("by_action", ["action"]),

  programStats: defineTable({
    key: v.literal("global"),
    totalCreators: v.number(),
    submittedCount: v.number(),
    approvedCount: v.number(),
    rejectedCount: v.number(),
    withManagerCount: v.number(),
    creatorOwedAmount: v.number(),
    creatorPaidAmount: v.number(),
    managerOwedAmount: v.number(),
    managerPaidAmount: v.number(),
    grossOnApproved: v.number(),
    attributionPending: v.number(),
  }).index("by_key", ["key"]),
});
