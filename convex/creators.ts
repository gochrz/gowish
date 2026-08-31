import { v } from "convex/values";
import { internalMutation } from "./_generated/server";
import { recordAudit } from "./audit";
import { limitRegistration } from "./rateLimits";
import { platform } from "./schema";
import { changeProgramStats } from "./stats";
import {
  businessError,
  normalizeCode,
  normalizeEmail,
  normalizeHandle,
  optional,
  requireConsent,
  required,
} from "./validation";

const creatorBonusAmount = 20;
const managerBonusAmount = 10;
const partnerRevenueAmount = 60;
const alphabet = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";

function normalizeFollowers(value: string) {
  const normalized = required(value, 40, "Followers").replace(/[\s,]/g, "");
  if (!/^\d{1,12}$/.test(normalized)) {
    throw businessError("Followers must be a number.");
  }
  return normalized;
}

function dateStamp(timestamp: number) {
  const date = new Date(timestamp);
  const year = String(date.getUTCFullYear()).slice(2);
  const month = String(date.getUTCMonth() + 1).padStart(2, "0");
  const day = String(date.getUTCDate()).padStart(2, "0");
  return `${year}${month}${day}`;
}

export const submit = internalMutation({
  args: {
    fullName: v.string(),
    contactEmail: v.string(),
    gowishEmail: v.string(),
    phone: v.optional(v.string()),
    country: v.string(),
    platform,
    handle: v.string(),
    followers: v.string(),
    otherHandles: v.optional(v.string()),
    venmoHandle: v.string(),
    venmoLegalName: v.string(),
    managerCode: v.optional(v.string()),
    consentAccepted: v.boolean(),
    consentVersion: v.string(),
    consentOrigin: v.string(),
    consentUserAgent: v.optional(v.string()),
    consentIpHash: v.optional(v.string()),
    rateLimitKey: v.string(),
    testRunId: v.optional(v.string()),
  },
  returns: v.object({
    ok: v.literal(true),
    id: v.string(),
    managerCode: v.union(v.string(), v.null()),
  }),
  handler: async (ctx, args) => {
    await limitRegistration(ctx, required(args.rateLimitKey, 128, "Rate limit key"));

    const country = required(args.country, 80, "Country");
    if (country !== "United States") {
      throw businessError("This program is currently open to creators in the United States only.");
    }

    const consent = requireConsent(
      args.consentAccepted,
      args.consentVersion,
      args.consentOrigin,
      "creator-2026-08-31",
    );
    const gowishEmail = normalizeEmail(args.gowishEmail, "GoWish account email");
    const existing = await ctx.db
      .query("creators")
      .withIndex("by_gowishEmail", (q) => q.eq("gowishEmail", gowishEmail))
      .unique();

    if (existing) {
      throw businessError("That GoWish account email has already been submitted. One payout is allowed per GoWish account.");
    }

    const normalizedManagerCode = normalizeCode(args.managerCode);
    const manager = normalizedManagerCode
      ? await ctx.db
          .query("managers")
          .withIndex("by_code", (q) => q.eq("code", normalizedManagerCode))
          .unique()
      : null;

    if (normalizedManagerCode && (!manager || !manager.enabled)) {
      throw businessError("That referral code was not recognized. Leave it blank if you do not have one.");
    }

    const now = Date.now();
    let reference = "";
    for (let attempt = 0; attempt < 64; attempt += 1) {
      let suffix = "";
      for (let index = 0; index < 6; index += 1) {
        suffix += alphabet.charAt(Math.floor(Math.random() * alphabet.length));
      }
      const candidate = `C${dateStamp(now)}-${suffix}`;
      const conflict = await ctx.db
        .query("creators")
        .withIndex("by_reference", (q) => q.eq("reference", candidate))
        .unique();
      if (!conflict) {
        reference = candidate;
        break;
      }
    }

    if (!reference) {
      throw new Error("Could not allocate a unique creator reference.");
    }

    const creatorId = await ctx.db.insert("creators", {
      reference,
      fullName: required(args.fullName, 120, "Name"),
      contactEmail: normalizeEmail(args.contactEmail, "Contact email"),
      gowishEmail,
      phone: optional(args.phone, 40, "Phone"),
      country,
      platform: args.platform,
      handle: normalizeHandle(args.handle, "Social handle"),
      followers: normalizeFollowers(args.followers),
      otherHandles: optional(args.otherHandles, 300, "Other handles"),
      venmoHandle: normalizeHandle(args.venmoHandle, "Venmo handle"),
      venmoLegalName: required(args.venmoLegalName, 120, "Venmo legal name"),
      managerCode: manager?.code,
      managerId: manager?._id,
      status: "submitted",
      creatorBonusAmount,
      managerBonusAmount: manager ? managerBonusAmount : 0,
      partnerRevenueAmount,
      attributionState: "pending",
      ...consent,
      consentAcceptedAt: now,
      consentUserAgent: optional(args.consentUserAgent, 500, "User agent"),
      consentIpHash: optional(args.consentIpHash, 128, "IP hash"),
      testRunId: optional(args.testRunId, 80, "Test run ID"),
    });

    if (manager) {
      await ctx.db.patch("managers", manager._id, {
        creatorCount: manager.creatorCount + 1,
      });
    }

    await changeProgramStats(ctx, {
      totalCreators: 1,
      submittedCount: 1,
      withManagerCount: manager ? 1 : 0,
      attributionPending: 1,
    });

    await recordAudit(ctx, {
      actor: "public",
      action: "creator_submitted",
      entityType: "creator",
      entityKey: `creator:${creatorId}`,
      details: {
        reference,
        managerCode: manager?.code ?? null,
        consentVersion: consent.consentVersion,
        creatorBonusAmount,
        managerBonusAmount: manager ? managerBonusAmount : 0,
        partnerRevenueAmount,
      },
    });

    return {
      ok: true as const,
      id: reference,
      managerCode: manager?.code ?? null,
    };
  },
});
