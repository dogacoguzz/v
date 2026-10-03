import test from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, writeFileSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { buildPayload, parseSitemap, findKey, run, HOST } from "./indexnow.mjs";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const KEY = "0123456789abcdef0123456789abcdef";
const XML = `<urlset>
<url><loc>https://${HOST}/</loc><xhtml:link href="https://${HOST}/tr/"/></url>
<url><loc>https://${HOST}/tr/</loc></url>
<url><loc>https://${HOST}/</loc></url>
</urlset>`;

function fixture() {
  const dir = mkdtempSync(join(tmpdir(), "indexnow-"));
  writeFileSync(join(dir, "sitemap.xml"), XML);
  writeFileSync(join(dir, `${KEY}.txt`), KEY);
  return dir;
}

test("buildPayload sets host, key, keyLocation and urlList", () => {
  const p = buildPayload({ key: KEY, urls: ["https://velorahealthcompanion.com/"] });
  assert.equal(p.host, HOST);
  assert.equal(p.key, KEY);
  assert.equal(p.keyLocation, `https://${HOST}/${KEY}.txt`);
  assert.deepEqual(p.urlList, ["https://velorahealthcompanion.com/"]);
});

test("parseSitemap returns deduplicated absolute https loc URLs only", () => {
  assert.deepEqual(parseSitemap(XML), [`https://${HOST}/`, `https://${HOST}/tr/`]);
});

test("real sitemap parses to https URLs", () => {
  const urls = parseSitemap(readFileSync(join(ROOT, "sitemap.xml"), "utf8"));
  assert.ok(urls.length > 0);
  assert.ok(urls.every((u) => u.startsWith(`https://${HOST}/`)));
});

test("dry run prints the body and makes no request", async () => {
  const lines = [];
  let called = false;
  const out = await run({
    argv: ["--dry-run"],
    root: fixture(),
    fetchImpl: async () => { called = true; },
    log: (s) => lines.push(s),
  });
  assert.equal(called, false);
  assert.equal(out.dryRun, true);
  assert.deepEqual(JSON.parse(lines[0]), buildPayload({ key: KEY, urls: parseSitemap(XML) }));
});

test("live run POSTs the JSON body with the charset header", async () => {
  let seen;
  await run({
    root: fixture(),
    fetchImpl: async (url, init) => { seen = { url, init }; return { ok: true, status: 200 }; },
    log: () => {},
  });
  assert.equal(seen.url, "https://api.indexnow.org/indexnow");
  assert.equal(seen.init.method, "POST");
  assert.equal(seen.init.headers["Content-Type"], "application/json; charset=utf-8");
  assert.equal(JSON.parse(seen.init.body).key, KEY);
});

test("repo key file content equals its filename key", () => {
  const key = findKey(ROOT);
  assert.match(key, /^[0-9a-f]{32}$/);
  assert.equal(readFileSync(join(ROOT, `${key}.txt`), "utf8").trim(), key);
});

test("a non-ok response rejects with the status", async () => {
  await assert.rejects(
    run({ root: fixture(), fetchImpl: async () => ({ ok: false, status: 403 }), log: () => {} }),
    /failed with 403/,
  );
});

test("findKey throws when there is no key file or more than one", () => {
  const none = mkdtempSync(join(tmpdir(), "indexnow-"));
  assert.throws(() => findKey(none), /expected one IndexNow key file/);
  const two = fixture();
  const other = "fedcba9876543210fedcba9876543210";
  writeFileSync(join(two, `${other}.txt`), other);
  assert.throws(() => findKey(two), /expected one IndexNow key file/);
});

test("findKey throws when the content differs from the file name", () => {
  const dir = mkdtempSync(join(tmpdir(), "indexnow-"));
  writeFileSync(join(dir, `${KEY}.txt`), "fedcba9876543210fedcba9876543210");
  assert.throws(() => findKey(dir), /does not match/);
});
