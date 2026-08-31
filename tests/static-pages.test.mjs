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
