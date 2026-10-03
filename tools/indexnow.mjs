import { readFileSync, readdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
export const HOST = "velorahealthcompanion.com";
export const ENDPOINT = "https://api.indexnow.org/indexnow";

export function parseSitemap(xml) {
  const urls = [...xml.matchAll(/<loc>\s*([^<\s]+)\s*<\/loc>/g)].map((m) => m[1]);
  return [...new Set(urls)].filter((u) => u.startsWith("https://"));
}

export function buildPayload({ key, urls, host = HOST }) {
  return {
    host,
    key,
    keyLocation: `https://${host}/${key}.txt`,
    urlList: urls,
  };
}

export function findKey(root = ROOT) {
  const files = readdirSync(root).filter((f) => /^[0-9a-f]{32}\.txt$/.test(f));
  if (files.length !== 1) throw new Error(`expected one IndexNow key file, found ${files.length}`);
  const key = readFileSync(join(root, files[0]), "utf8").trim();
  if (`${key}.txt` !== files[0]) throw new Error("key file content does not match its name");
  return key;
}

export async function run({ argv = [], root = ROOT, fetchImpl = fetch, log = console.log } = {}) {
  const urls = parseSitemap(readFileSync(join(root, "sitemap.xml"), "utf8"));
  const payload = buildPayload({ key: findKey(root), urls });
  if (argv.includes("--dry-run")) {
    log(JSON.stringify(payload, null, 2));
    return { dryRun: true, payload };
  }
  const res = await fetchImpl(ENDPOINT, {
    method: "POST",
    headers: { "Content-Type": "application/json; charset=utf-8" },
    body: JSON.stringify(payload),
  });
  log(`IndexNow responded ${res.status} for ${urls.length} URLs`);
  if (!res.ok) throw new Error(`IndexNow request failed with ${res.status}`);
  return { dryRun: false, payload, status: res.status };
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  run({ argv: process.argv.slice(2) }).catch((err) => {
    console.error(err.message);
    process.exit(1);
  });
}
