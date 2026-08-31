import { isRateLimitError } from "@convex-dev/rate-limiter";
import { httpRouter } from "convex/server";
import { ConvexError } from "convex/values";
import type { Id } from "./_generated/dataModel";
import { internal } from "./_generated/api";
import { httpAction } from "./_generated/server";

const http = httpRouter();
const maxBodyBytes = 16_384;

function configuredOrigins() {
  const raw = process.env.ALLOWED_ORIGINS ?? process.env.ALLOWED_ORIGIN ?? "";
  return new Set(
    raw
      .split(",")
      .map((value) => value.trim())
      .filter(Boolean),
  );
}

function requestOrigin(request: Request) {
  return request.headers.get("Origin")?.trim() ?? "";
}

function originStatus(request: Request) {
  const allowed = configuredOrigins();
  if (!allowed.size) return { ok: false as const, status: 503, error: "Allowed origins are not configured." };
  const origin = requestOrigin(request);
  if (!origin || !allowed.has(origin)) return { ok: false as const, status: 403, error: "Origin is not allowed." };
  return { ok: true as const, origin };
}

function corsHeaders(origin?: string) {
  const headers: Record<string, string> = {
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type, X-Admin-Key, X-Test-Key, X-Test-Run-Id",
    "Access-Control-Max-Age": "86400",
    Vary: "Origin",
  };
  if (origin) headers["Access-Control-Allow-Origin"] = origin;
  return headers;
}

function jsonResponse(body: unknown, status = 200, origin?: string) {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      "Content-Type": "application/json; charset=utf-8",
      "Cache-Control": "no-store",
      ...corsHeaders(origin),
    },
  });
}

async function readBody(request: Request) {
  const declared = Number(request.headers.get("Content-Length") ?? "0");
  if (Number.isFinite(declared) && declared > maxBodyBytes) {
    throw new HttpError(413, "Request is too large.");
  }
  const text = await request.text();
  if (new TextEncoder().encode(text).byteLength > maxBodyBytes) {
    throw new HttpError(413, "Request is too large.");
  }
  try {
    const parsed: unknown = JSON.parse(text);
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
      throw new Error("Invalid object");
    }
    return parsed as Record<string, unknown>;
  } catch {
    throw new HttpError(400, "Could not read that request.");
  }
}

class HttpError extends Error {
  constructor(
    readonly status: number,
    message: string,
  ) {
    super(message);
  }
}

function stringValue(body: Record<string, unknown>, key: string) {
  const value = body[key];
  return typeof value === "string" ? value : "";
}

function optionalString(body: Record<string, unknown>, key: string) {
  const value = body[key];
  return typeof value === "string" ? value : undefined;
}

function optionalNumber(body: Record<string, unknown>, key: string) {
  const value = body[key];
  return typeof value === "number" ? value : undefined;
}

function booleanValue(body: Record<string, unknown>, key: string) {
  return body[key] === true;
}

function creatorIds(body: Record<string, unknown>, key = "ids") {
  const value = body[key];
  if (!Array.isArray(value) || !value.every((item) => typeof item === "string")) {
    throw new HttpError(400, `${key} must be an array of IDs.`);
  }
  return value as Array<Id<"creators">>;
}

function managerIds(body: Record<string, unknown>, key = "managerIds") {
  const value = body[key];
  if (!Array.isArray(value) || !value.every((item) => typeof item === "string")) {
    throw new HttpError(400, `${key} must be an array of IDs.`);
  }
  return value as Array<Id<"managers">>;
}

function creatorStatusValue(body: Record<string, unknown>) {
  const value = body.status;
  if (value === "submitted" || value === "approved" || value === "rejected") return value;
  throw new HttpError(400, "Invalid creator status.");
}

function optionalCreatorStatus(body: Record<string, unknown>) {
  if (body.status === undefined || body.status === "") return undefined;
  return creatorStatusValue(body);
}

function attributionStateValue(body: Record<string, unknown>) {
  const value = body.state;
  if (value === undefined || value === "") return undefined;
  if (value === "pending" || value === "sent" || value === "ineligible") return value;
  throw new HttpError(400, "Invalid attribution state.");
}

function platformValue(body: Record<string, unknown>) {
  const value = body.platform;
  if (value === "Instagram" || value === "TikTok" || value === "YouTube" || value === "Other") return value;
  throw new HttpError(400, "Invalid platform.");
}

function constantTimeEqual(left: string, right: string) {
  const length = Math.max(left.length, right.length);
  let difference = left.length ^ right.length;
  for (let index = 0; index < length; index += 1) {
    difference |= (left.charCodeAt(index) || 0) ^ (right.charCodeAt(index) || 0);
  }
  return difference === 0;
}

async function sha256(value: string) {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(value));
  return Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, "0")).join("");
}

async function requestIdentity(request: Request) {
  const salt = process.env.IDENTITY_HASH_SALT ?? "";
  if (salt.length < 32) {
    throw new HttpError(503, "Identity hashing is not configured.");
  }
  const forwarded = request.headers.get("X-Forwarded-For")?.split(",")[0]?.trim();
  const address = request.headers.get("CF-Connecting-IP")?.trim() || forwarded || "unknown";
  const userAgent = request.headers.get("User-Agent")?.slice(0, 500) ?? "unknown";
  return sha256(`${salt}|${address}|${userAgent}`);
}

function testRunId(request: Request) {
  const expected = process.env.TEST_CLEANUP_KEY ?? "";
  const supplied = request.headers.get("X-Test-Key") ?? "";
  if (expected.length < 32 || !constantTimeEqual(supplied, expected)) return undefined;
  const value = request.headers.get("X-Test-Run-Id")?.trim() ?? "";
  return value && value.length <= 80 ? value : undefined;
}

function errorDetails(error: unknown) {
  if (error instanceof HttpError) return { status: error.status, message: error.message };
  if (isRateLimitError(error)) return { status: 429, message: "Too many requests. Please wait and try again." };
  if (error instanceof ConvexError) {
    const data = error.data;
    if (data && typeof data === "object" && "message" in data && typeof data.message === "string") {
      return { status: 400, message: data.message };
    }
  }
  if (error instanceof Error) {
    if (error.name.includes("Validation") || error.message.includes("ArgumentValidationError")) {
      return { status: 400, message: "The request contains invalid fields." };
    }
    try {
      const data: unknown = JSON.parse(error.message);
      if (data && typeof data === "object" && "message" in data && typeof data.message === "string") {
        return { status: 400, message: data.message };
      }
    } catch {
      return { status: 500, message: "The request could not be completed." };
    }
  }
  return { status: 500, message: "The request could not be completed." };
}

const publicPreflight = httpAction(async (_ctx, request) => {
  const origin = originStatus(request);
  if (!origin.ok) return jsonResponse({ ok: false, error: origin.error }, origin.status);
  return new Response(null, { status: 204, headers: corsHeaders(origin.origin) });
});

http.route({ path: "/api", method: "OPTIONS", handler: publicPreflight });
http.route({ path: "/admin", method: "OPTIONS", handler: publicPreflight });

http.route({
  path: "/api",
  method: "POST",
  handler: httpAction(async (ctx, request) => {
    const origin = originStatus(request);
    if (!origin.ok) return jsonResponse({ ok: false, error: origin.error }, origin.status);

    try {
      const body = await readBody(request);
      const action = stringValue(body, "action");
      if (stringValue(body, "website")) {
        return jsonResponse({ ok: true, ignored: true }, 200, origin.origin);
      }
      const rateLimitKey = await requestIdentity(request);
      const consentUserAgent = request.headers.get("User-Agent")?.slice(0, 500) || undefined;
      const taggedTestRunId = testRunId(request);

      if (action === "validateCode") {
        const result = await ctx.runMutation(internal.managers.validateCode, {
          code: stringValue(body, "code"),
          rateLimitKey,
        });
        return jsonResponse(result, 200, origin.origin);
      }

      if (action === "registerManager") {
        const result = await ctx.runMutation(internal.managers.register, {
          fullName: stringValue(body, "fullName"),
          email: stringValue(body, "email"),
          phone: optionalString(body, "phone"),
          company: optionalString(body, "company"),
          socialHandle: optionalString(body, "socialHandle"),
          venmoHandle: stringValue(body, "venmoHandle"),
          venmoLegalName: stringValue(body, "venmoLegalName"),
          estCreators: stringValue(body, "estCreators"),
          source: optionalString(body, "source"),
          consentAccepted: booleanValue(body, "consentAccepted"),
          consentVersion: stringValue(body, "consentVersion"),
          consentOrigin: origin.origin,
          consentUserAgent,
          consentIpHash: rateLimitKey,
          rateLimitKey,
          testRunId: taggedTestRunId,
        });
        const siteUrl = (process.env.PUBLIC_SITE_URL ?? origin.origin).replace(/\/+$/, "");
        return jsonResponse(
          { ...result, shareUrl: `${siteUrl}/?code=${encodeURIComponent(result.code)}` },
          200,
          origin.origin,
        );
      }

      if (action === "submitCreator") {
        const result = await ctx.runMutation(internal.creators.submit, {
          fullName: stringValue(body, "fullName"),
          contactEmail: stringValue(body, "contactEmail"),
          gowishEmail: stringValue(body, "gowishEmail"),
          phone: optionalString(body, "phone"),
          country: stringValue(body, "country"),
          platform: platformValue(body),
          handle: stringValue(body, "handle"),
          followers: stringValue(body, "followers"),
          otherHandles: optionalString(body, "otherHandles"),
          venmoHandle: stringValue(body, "venmoHandle"),
          venmoLegalName: stringValue(body, "venmoLegalName"),
          managerCode: optionalString(body, "refCode") ?? optionalString(body, "managerCode"),
          consentAccepted: booleanValue(body, "consentAccepted"),
          consentVersion: stringValue(body, "consentVersion"),
          consentOrigin: origin.origin,
          consentUserAgent,
          consentIpHash: rateLimitKey,
          rateLimitKey,
          testRunId: taggedTestRunId,
        });
        return jsonResponse(result, 200, origin.origin);
      }

      throw new HttpError(400, "Unknown action.");
    } catch (error) {
      const details = errorDetails(error);
      return jsonResponse({ ok: false, error: details.message }, details.status, origin.origin);
    }
  }),
});

http.route({
  path: "/admin",
  method: "POST",
  handler: httpAction(async (ctx, request) => {
    const origin = originStatus(request);
    if (!origin.ok) return jsonResponse({ ok: false, error: origin.error }, origin.status);

    const expected = process.env.ADMIN_KEY ?? "";
    if (expected.length < 32) {
      return jsonResponse({ ok: false, error: "Admin access is not configured." }, 503, origin.origin);
    }
    if (!constantTimeEqual(request.headers.get("X-Admin-Key") ?? "", expected)) {
      return jsonResponse({ ok: false, error: "Not authorized." }, 401, origin.origin);
    }

    try {
      const body = await readBody(request);
      const action = stringValue(body, "action");

      if (action === "stats") {
        return jsonResponse({ ok: true, stats: await ctx.runQuery(internal.admin.stats, {}) }, 200, origin.origin);
      }
      if (action === "listCreators") {
        const creators = await ctx.runQuery(internal.admin.listCreators, {
          status: optionalCreatorStatus(body),
          managerCode: optionalString(body, "managerCode"),
          limit: optionalNumber(body, "limit"),
        });
        return jsonResponse({ ok: true, creators }, 200, origin.origin);
      }
      if (action === "listManagers") {
        const managers = await ctx.runQuery(internal.admin.listManagers, {
          limit: optionalNumber(body, "limit"),
        });
        return jsonResponse({ ok: true, managers }, 200, origin.origin);
      }
      if (action === "setStatus") {
        const result = await ctx.runMutation(internal.admin.setStatus, {
          ids: creatorIds(body),
          status: creatorStatusValue(body),
          reason: optionalString(body, "reason"),
        });
        return jsonResponse(result, 200, origin.origin);
      }
      if (action === "markPaid") {
        const who = body.who;
        if (who !== "creator" && who !== "manager") throw new HttpError(400, "Invalid payout recipient.");
        const result = await ctx.runMutation(internal.admin.markPaid, {
          ids: creatorIds(body),
          who,
          paymentReference: optionalString(body, "paymentReference"),
          unpay: body.unpay === true ? true : undefined,
        });
        return jsonResponse(result, 200, origin.origin);
      }
      if (action === "updateCreator") {
        const id = stringValue(body, "id") as Id<"creators">;
        const result = await ctx.runMutation(internal.admin.updateCreator, {
          id,
          fullName: optionalString(body, "fullName"),
          contactEmail: optionalString(body, "contactEmail"),
          gowishEmail: optionalString(body, "gowishEmail"),
          venmoHandle: optionalString(body, "venmoHandle"),
          venmoLegalName: optionalString(body, "venmoLegalName"),
          notes: optionalString(body, "notes"),
          reason: optionalString(body, "reason"),
        });
        return jsonResponse(result, 200, origin.origin);
      }
      if (action === "attribution") {
        const result = await ctx.runQuery(internal.admin.attribution, {
          state: attributionStateValue(body),
          limit: optionalNumber(body, "limit"),
        });
        return jsonResponse({ ok: true, ...result }, 200, origin.origin);
      }
      if (action === "markAttributionSent") {
        const result = await ctx.runMutation(internal.admin.markAttributionSent, {
          ids: creatorIds(body),
          batchId: optionalString(body, "batchId"),
        });
        return jsonResponse(result, 200, origin.origin);
      }
      if (action === "setManagerDisabled") {
        const id = stringValue(body, "id") as Id<"managers">;
        const result = await ctx.runMutation(internal.admin.setManagerDisabled, {
          id,
          disabled: booleanValue(body, "disabled"),
          reason: stringValue(body, "reason") || "Manual manager update",
        });
        return jsonResponse(result, 200, origin.origin);
      }
      if (action === "testCleanup") {
        const cleanupEnabled = process.env.ENABLE_TEST_CLEANUP === "true";
        const cleanupKey = process.env.TEST_CLEANUP_KEY ?? "";
        if (!cleanupEnabled || cleanupKey.length < 32) {
          throw new HttpError(400, "Test cleanup is not configured.");
        }
        if (!constantTimeEqual(request.headers.get("X-Test-Key") ?? "", cleanupKey)) {
          throw new HttpError(403, "Test cleanup key is invalid.");
        }
        const result = await ctx.runMutation(internal.admin.cleanupTestData, {
          creatorIds: creatorIds(body, "creatorIds"),
          managerIds: managerIds(body),
          testRunId: stringValue(body, "testRunId") || request.headers.get("X-Test-Run-Id") || "",
          confirmation: stringValue(body, "confirmation") as "DELETE_TEST_DATA",
        });
        return jsonResponse(result, 200, origin.origin);
      }

      throw new HttpError(400, "Unknown admin action.");
    } catch (error) {
      const details = errorDetails(error);
      return jsonResponse({ ok: false, error: details.message }, details.status, origin.origin);
    }
  }),
});

http.route({
  path: "/health",
  method: "GET",
  handler: httpAction(async () =>
    jsonResponse({
      ok: true,
      service: "gowish-intake",
      time: Date.now(),
    }),
  ),
});

export default http;
