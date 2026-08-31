import { v } from "convex/values";
import { internalMutation } from "./_generated/server";
import { recordAudit } from "./audit";
import { limitRegistration, limitValidation } from "./rateLimits";
import { payoutMethod } from "./schema";
import {
  clean,
  normalizeCode,
  normalizeEmail,
  normalizeHandle,
  normalizePayout,
  optional,
  requireConsent,
  required,
} from "./validation";

const alphabet = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";

const registrationResult = v.object({
  ok: v.literal(true),
  duplicate: v.boolean(),
  code: v.string(),
  name: v.string(),
});

export const register = internalMutation({
  args: {
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
    consentAccepted: v.boolean(),
    consentVersion: v.string(),
    consentOrigin: v.string(),
    consentUserAgent: v.optional(v.string()),
    consentIpHash: v.optional(v.string()),
    rateLimitKey: v.string(),
    testRunId: v.optional(v.string()),
  },
  returns: registrationResult,
  handler: async (ctx, args) => {
    await limitRegistration(ctx, required(args.rateLimitKey, 128, "Rate limit key"));

    const email = normalizeEmail(args.email, "Email");
    const consent = requireConsent(
      args.consentAccepted,
      args.consentVersion,
      args.consentOrigin,
      "manager-2026-08-31",
    );
    const existing = await ctx.db
      .query("managers")
      .withIndex("by_email", (q) => q.eq("email", email))
      .unique();

    if (existing) {
      return {
        ok: true as const,
        duplicate: true,
        code: existing.code,
        name: existing.fullName,
      };
    }

    let code = "";
    for (let attempt = 0; attempt < 64; attempt += 1) {
      let candidate = "M";
      for (let index = 0; index < 6; index += 1) {
        candidate += alphabet.charAt(Math.floor(Math.random() * alphabet.length));
      }
      const conflict = await ctx.db
        .query("managers")
        .withIndex("by_code", (q) => q.eq("code", candidate))
        .unique();
      if (!conflict) {
        code = candidate;
        break;
      }
    }

    if (!code) {
      throw new Error("Could not allocate a unique manager code.");
    }

    const fullName = required(args.fullName, 120, "Name");
    const payout = normalizePayout(args.payoutMethod, args.payoutDestination, args.payoutLegalName);
    const managerId = await ctx.db.insert("managers", {
      code,
      fullName,
      email,
      phone: optional(args.phone, 40, "Phone"),
      company: optional(args.company, 120, "Company"),
      socialHandle: optional(args.socialHandle, 200, "Social handle"),
      ...payout,
      estCreators: required(args.estCreators, 40, "Estimated creators"),
      source: optional(args.source, 200, "Source"),
      enabled: true,
      ...consent,
      consentAcceptedAt: Date.now(),
      consentUserAgent: optional(args.consentUserAgent, 500, "User agent"),
      consentIpHash: optional(args.consentIpHash, 128, "IP hash"),
      creatorCount: 0,
      approvedCreatorCount: 0,
      managerOwedAmount: 0,
      managerPaidAmount: 0,
      testRunId: optional(args.testRunId, 80, "Test run ID"),
    });

    await recordAudit(ctx, {
      actor: "public",
      action: "manager_registered",
      entityType: "manager",
      entityKey: `manager:${managerId}`,
      details: { code, consentVersion: consent.consentVersion },
    });

    return { ok: true as const, duplicate: false, code, name: fullName };
  },
});

export const validateCode = internalMutation({
  args: {
    code: v.string(),
    rateLimitKey: v.string(),
  },
  returns: v.union(
    v.object({
      ok: v.literal(true),
      code: v.string(),
      name: v.string(),
    }),
    v.object({
      ok: v.literal(false),
      error: v.string(),
    }),
  ),
  handler: async (ctx, args) => {
    await limitValidation(ctx, required(args.rateLimitKey, 128, "Rate limit key"));
    const code = normalizeCode(args.code);
    if (!code) {
      return { ok: false as const, error: "Enter a code." };
    }

    const manager = await ctx.db
      .query("managers")
      .withIndex("by_code", (q) => q.eq("code", code))
      .unique();

    if (!manager || !manager.enabled) {
      return { ok: false as const, error: "No enabled manager found with that code." };
    }

    return { ok: true as const, code: manager.code, name: manager.fullName };
  },
});

export { clean, normalizeCode, normalizeEmail, normalizeHandle };
