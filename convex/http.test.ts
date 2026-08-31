import rateLimiterTest from "@convex-dev/rate-limiter/test";
import { convexTest } from "convex-test";
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import schema from "./schema";

const modules = import.meta.glob("./**/*.ts");
const origin = "https://www.gowishpartner.com";
const adminKey = "0123456789abcdef0123456789abcdef0123456789abcdef";
const identityHashSalt = "89abcdef0123456789abcdef0123456789abcdef01234567";

function setup() {
  const t = convexTest(schema, modules);
  rateLimiterTest.register(t);
  return t;
}

async function post(
  t: ReturnType<typeof setup>,
  path: "/api" | "/admin",
  body: Record<string, unknown>,
  options: { origin?: string; adminKey?: string; testKey?: string; testRunId?: string } = {},
) {
  const headers = new Headers({
    "Content-Type": "application/json",
    Origin: options.origin ?? origin,
    "User-Agent": "gowish-test-agent",
    "X-Forwarded-For": "203.0.113.8",
  });
  if (options.adminKey) headers.set("X-Admin-Key", options.adminKey);
  if (options.testKey) headers.set("X-Test-Key", options.testKey);
  if (options.testRunId) headers.set("X-Test-Run-Id", options.testRunId);
  return t.fetch(path, { method: "POST", headers, body: JSON.stringify(body) });
}

async function body(response: Response) {
  return response.json() as Promise<Record<string, any>>;
}

beforeEach(() => {
  vi.stubEnv("ALLOWED_ORIGINS", origin);
  vi.stubEnv("ADMIN_KEY", adminKey);
  vi.stubEnv("PUBLIC_SITE_URL", origin);
  vi.stubEnv("ENABLE_TEST_CLEANUP", "true");
  vi.stubEnv("IDENTITY_HASH_SALT", identityHashSalt);
});

afterEach(() => {
  vi.unstubAllEnvs();
});

describe("HTTP routes", () => {
  test("serves health without exposing configuration", async () => {
    const t = setup();
    const response = await t.fetch("/health", { method: "GET" });
    const payload = await body(response);

    expect(response.status).toBe(200);
    expect(payload).toMatchObject({ ok: true, service: "gowish-intake" });
    expect(JSON.stringify(payload)).not.toContain(adminKey);
  });

  test("registers managers, validates codes, and submits attributed creators", async () => {
    const t = setup();
    const managerResponse = await post(t, "/api", {
      action: "registerManager",
      fullName: "Morgan Reed",
      email: "morgan@example.com",
      phone: "+1 555 111 2222",
      company: "North Studio",
      socialHandle: "@morgan",
      payoutMethod: "apple_cash",
      payoutDestination: "morgan@example.com",
      payoutLegalName: "Morgan Reed",
      estCreators: "6 to 20",
      source: "UGC roster",
      consentAccepted: true,
      consentVersion: "manager-2026-08-31",
      website: "",
    });
    const manager = await body(managerResponse);

    expect(managerResponse.status).toBe(200);
    expect(manager).toMatchObject({ ok: true, duplicate: false, name: "Morgan Reed" });
    expect(manager.shareUrl).toBe(`${origin}/?code=${manager.code}`);

    const validationResponse = await post(t, "/api", {
      action: "validateCode",
      code: manager.code,
      website: "",
    });
    expect(await body(validationResponse)).toMatchObject({ ok: true, code: manager.code });

    const creatorResponse = await post(t, "/api", {
      action: "submitCreator",
      fullName: "Casey Lane",
      contactEmail: "casey@example.com",
      gowishEmail: "casey.gowish@example.com",
      phone: "+1 555 333 4444",
      country: "United States",
      platform: "Instagram",
      handle: "@caseycreates",
      followers: "42000",
      otherHandles: "",
      payoutMethod: "venmo",
      payoutDestination: "@casey-pay",
      payoutLegalName: "Casey Lane",
      refCode: manager.code,
      consentAccepted: true,
      consentVersion: "creator-2026-08-31",
      website: "",
    });
    const creator = await body(creatorResponse);

    expect(creatorResponse.status).toBe(200);
    expect(creator).toMatchObject({ ok: true, managerCode: manager.code });
    expect(creator.id).toMatch(/^C\d{6}-/);
  });

  test("rejects untrusted origins, oversized bodies, and missing consent", async () => {
    const t = setup();
    const badOrigin = await post(
      t,
      "/api",
      { action: "validateCode", code: "MABC234", website: "" },
      { origin: "https://evil.example" },
    );
    expect(badOrigin.status).toBe(403);

    const oversized = await post(t, "/api", {
      action: "validateCode",
      code: "MABC234",
      website: "x".repeat(20_000),
    });
    expect(oversized.status).toBe(413);

    const noConsent = await post(t, "/api", {
      action: "registerManager",
      fullName: "Morgan Reed",
      email: "morgan@example.com",
      payoutMethod: "venmo",
      payoutDestination: "@morgan-pay",
      payoutLegalName: "Morgan Reed",
      estCreators: "1 to 5",
      consentAccepted: false,
      consentVersion: "manager-2026-08-31",
      website: "",
    });
    expect(noConsent.status).toBe(400);
    expect(await body(noConsent)).toMatchObject({ ok: false, error: "Consent is required." });
  });

  test("refuses public requests when the identity hash salt is not configured", async () => {
    const t = setup();
    vi.stubEnv("IDENTITY_HASH_SALT", "short");

    const response = await post(t, "/api", {
      action: "validateCode",
      code: "MABC234",
      website: "",
    });

    expect(response.status).toBe(503);
    expect(await body(response)).toMatchObject({ ok: false, error: "Identity hashing is not configured." });
  });

  test("silently absorbs honeypot submissions without writing records", async () => {
    const t = setup();
    const response = await post(t, "/api", {
      action: "registerManager",
      fullName: "Bot",
      email: "bot@example.com",
      payoutMethod: "venmo",
      payoutDestination: "@bot",
      payoutLegalName: "Bot",
      estCreators: "200+",
      consentAccepted: true,
      consentVersion: "manager-2026-08-31",
      website: "https://spam.example",
    });

    expect(response.status).toBe(200);
    expect(await body(response)).toMatchObject({ ok: true, ignored: true });
    const managers = await t.run((ctx) => ctx.db.query("managers").collect());
    expect(managers).toHaveLength(0);
  });

  test("protects and dispatches every admin operation", async () => {
    const t = setup();
    const unauthorized = await post(t, "/admin", { action: "stats" }, { adminKey: "wrong" });
    expect(unauthorized.status).toBe(401);

    await post(t, "/api", {
      action: "submitCreator",
      fullName: "Casey Lane",
      contactEmail: "casey@example.com",
      gowishEmail: "casey.gowish@example.com",
      country: "United States",
      platform: "Instagram",
      handle: "@caseycreates",
      followers: "42000",
      payoutMethod: "apple_cash",
      payoutDestination: "+1 (555) 333-4444",
      payoutLegalName: "Casey Lane",
      consentAccepted: true,
      consentVersion: "creator-2026-08-31",
      website: "",
    });

    const listResponse = await post(
      t,
      "/admin",
      { action: "listCreators", limit: 20 },
      { adminKey },
    );
    const listed = await body(listResponse);
    const creatorId = listed.creators[0].id;
    expect(listed.creators).toHaveLength(1);

    const updateResponse = await post(
      t,
      "/admin",
      {
        action: "updateCreator",
        id: creatorId,
        contactEmail: "corrected@example.com",
        reason: "Creator supplied a correction",
      },
      { adminKey },
    );
    expect(await body(updateResponse)).toMatchObject({ ok: true, updatedFields: 1 });

    const attributionResponse = await post(
      t,
      "/admin",
      { action: "attribution", state: "pending", limit: 20 },
      { adminKey },
    );
    const attribution = await body(attributionResponse);
    expect(attribution.rows).toHaveLength(1);

    const sentResponse = await post(
      t,
      "/admin",
      {
        action: "markAttributionSent",
        ids: [creatorId],
        batchId: "TC-HTTP-1",
      },
      { adminKey },
    );
    expect(await body(sentResponse)).toMatchObject({ ok: true, updated: 1 });

    const statusResponse = await post(
      t,
      "/admin",
      {
        action: "setStatus",
        ids: [creatorId],
        status: "approved",
        reason: "Approved by GoWish",
      },
      { adminKey },
    );
    expect(await body(statusResponse)).toMatchObject({ ok: true, updated: 1 });

    const payoutResponse = await post(
      t,
      "/admin",
      {
        action: "markPaid",
        ids: [creatorId],
        who: "creator",
        paymentReference: "VENMO-HTTP-1",
      },
      { adminKey },
    );
    expect(await body(payoutResponse)).toMatchObject({ ok: true, updated: 1 });

    const statsResponse = await post(t, "/admin", { action: "stats" }, { adminKey });
    expect(await body(statsResponse)).toMatchObject({ ok: true, stats: { approved: 1, paidToCreators: 20 } });

    const managersResponse = await post(t, "/admin", { action: "listManagers", limit: 20 }, { adminKey });
    expect(await body(managersResponse)).toMatchObject({ ok: true, managers: [] });

    const cleanupResponse = await post(
      t,
      "/admin",
      { action: "testCleanup", creatorIds: [creatorId], managerIds: [], confirmation: "DELETE_TEST_DATA" },
      { adminKey },
    );
    expect(cleanupResponse.status).toBe(400);
    expect(await body(cleanupResponse)).toMatchObject({ ok: false });
  });

  test("removes only records tagged by an authenticated test run", async () => {
    const t = setup();
    const testKey = "abcdef0123456789abcdef0123456789abcdef0123456789";
    const runId = "http-cleanup-run";
    vi.stubEnv("TEST_CLEANUP_KEY", testKey);

    const managerResponse = await post(
      t,
      "/api",
      {
        action: "registerManager",
        fullName: "Test Manager",
        email: "test-manager@example.com",
        payoutMethod: "venmo",
        payoutDestination: "@test-manager",
        payoutLegalName: "Test Manager",
        estCreators: "1 to 5",
        consentAccepted: true,
        consentVersion: "manager-2026-08-31",
        website: "",
      },
      { testKey, testRunId: runId },
    );
    const manager = await body(managerResponse);

    await post(
      t,
      "/api",
      {
        action: "submitCreator",
        fullName: "Test Creator",
        contactEmail: "test-creator@example.com",
        gowishEmail: "test-creator@gowish.example.com",
        country: "United States",
        platform: "TikTok",
        handle: "@testcreator",
        followers: "1000",
        payoutMethod: "apple_cash",
        payoutDestination: "test-creator@example.com",
        payoutLegalName: "Test Creator",
        refCode: manager.code,
        consentAccepted: true,
        consentVersion: "creator-2026-08-31",
        website: "",
      },
      { testKey, testRunId: runId },
    );

    const creatorList = await body(
      await post(t, "/admin", { action: "listCreators", limit: 20 }, { adminKey }),
    );
    const managerList = await body(
      await post(t, "/admin", { action: "listManagers", limit: 20 }, { adminKey }),
    );
    const creatorId = creatorList.creators[0].id;
    const managerId = managerList.managers[0].id;

    await post(
      t,
      "/admin",
      { action: "setStatus", ids: [creatorId], status: "approved" },
      { adminKey },
    );
    await post(
      t,
      "/admin",
      { action: "markPaid", ids: [creatorId], who: "creator" },
      { adminKey },
    );
    await post(
      t,
      "/admin",
      { action: "markPaid", ids: [creatorId], who: "manager" },
      { adminKey },
    );

    const cleanup = await post(
      t,
      "/admin",
      {
        action: "testCleanup",
        creatorIds: [creatorId],
        managerIds: [managerId],
        testRunId: runId,
        confirmation: "DELETE_TEST_DATA",
      },
      { adminKey, testKey, testRunId: runId },
    );
    expect(cleanup.status).toBe(200);
    expect(await body(cleanup)).toMatchObject({ ok: true, deletedCreators: 1, deletedManagers: 1 });

    const finalStats = await body(await post(t, "/admin", { action: "stats" }, { adminKey }));
    expect(finalStats.stats).toMatchObject({ total: 0, grossOnApproved: 0, paidToCreators: 0, paidToManagers: 0 });
  });
});
