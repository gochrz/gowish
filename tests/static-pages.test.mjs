import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const readPage = (name) => readFile(new URL(`../vercel-site/${name}`, import.meta.url), "utf8");

test("public page targets the development HTTP endpoint", async () => {
  const html = await readPage("index.html");
  assert.match(html, /https:\/\/tough-spaniel-606\.convex\.site\/api/);
});

test("manager share links use the public GoWish partner domain", async () => {
  const html = await readPage("index.html");
  assert.match(html, /SITE_URL:\s*'https:\/\/www\.gowishpartner\.com'/);
});

test("public page does not promise automated email", async () => {
  const html = await readPage("index.html");
  assert.doesNotMatch(html, /on screen and by email/i);
  assert.doesNotMatch(html, /code is in your inbox/i);
});

test("public page records both consent versions", async () => {
  const html = await readPage("index.html");
  assert.match(html, /creatorConsentVersion/);
  assert.match(html, /managerConsentVersion/);
  assert.match(html, /consentAccepted/);
});

test("public page presents the United States as the only eligible country", async () => {
  const html = await readPage("index.html");
  const country = html.match(/<select id="c-country"[\s\S]*?<\/select>/)?.[0] ?? "";
  assert.match(country, /<option>United States<\/option>/);
  assert.doesNotMatch(country, /<option>Other<\/option>/);
});

test("public forms offer Venmo or Apple Cash with conditional payout details", async () => {
  const html = await readPage("index.html");
  assert.match(html, /name="payoutMethod"[^>]*value="venmo"/);
  assert.match(html, /name="payoutMethod"[^>]*value="apple_cash"/);
  assert.match(html, /Apple Cash phone number or email/);
  assert.match(html, /payoutDestination/);
  assert.match(html, /payoutLegalName/);
  assert.match(html, /syncPayoutFields/);
});

test("public copy does not promise Venmo as the only payout method", async () => {
  const html = await readPage("index.html");
  assert.doesNotMatch(html, /send[^.]{0,80}to your Venmo/i);
  assert.doesNotMatch(html, /paid direct to their Venmo/i);
  assert.match(html, /preferred payout method/i);
});

test("public copy omits the two-to-four-week estimate", async () => {
  const html = await readPage("index.html");
  assert.doesNotMatch(html, /two to four weeks from approval/i);
});

test("public copy omits the no-fronting-money paragraph", async () => {
  const html = await readPage("index.html");
  assert.doesNotMatch(html, /We do not front the money/i);
});

test("public page links directly to both app stores before and after submission", async () => {
  const html = await readPage("index.html");
  const appStore = "https://apps.apple.com/us/app/gowish-your-digital-wishlist/id1605170923";
  const googlePlay = "https://play.google.com/store/apps/details?id=com.gowish.app&hl=en";
  assert.ok(html.split(appStore).length - 1 >= 2);
  assert.ok(html.split(googlePlay).length - 1 >= 2);
});

test("creator confirmation gives actionable app steps without email or story instructions", async () => {
  const html = await readPage("index.html");
  const confirmation = html.match(/<div class="view" id="v-done">([\s\S]*?)<div class="view" id="v-manager">/)?.[1] ?? "";
  assert.match(confirmation, /Finish your GoWish profile/i);
  assert.match(confirmation, /App Store/i);
  assert.match(confirmation, /Google Play/i);
  assert.doesNotMatch(confirmation, /check your email|stor(?:y|ies)|bio/i);
});

test("admin page targets the development admin endpoint", async () => {
  const html = await readPage("admin.html");
  assert.match(html, /https:\/\/tough-spaniel-606\.convex\.site\/admin/);
});

test("admin page confirms payout changes and supports undo", async () => {
  const html = await readPage("admin.html");
  assert.match(html, /Confirm creator payout/i);
  assert.match(html, /Confirm manager payout/i);
  assert.match(html, /Undo creator paid/i);
  assert.match(html, /Undo manager paid/i);
});

test("admin page displays and edits normalized payout details", async () => {
  const html = await readPage("admin.html");
  assert.match(html, /Payout method/);
  assert.match(html, /Payout destination/);
  assert.match(html, /Payout name/);
  assert.match(html, /editPayoutMethod/);
  assert.match(html, /editPayoutDestination/);
  assert.match(html, /editPayoutName/);
  assert.doesNotMatch(html, /<th>Venmo<\/th>/);
});

test("inline page scripts parse", async () => {
  for (const name of ["index.html", "admin.html"]) {
    const html = await readPage(name);
    const scripts = [...html.matchAll(/<script>([\s\S]*?)<\/script>/g)].map(
      (match) => match[1],
    );
    assert.ok(scripts.length > 0);
    for (const script of scripts) new Function(script);
  }
});
