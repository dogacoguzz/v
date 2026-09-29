import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { request } from 'node:http';
import { gunzipSync } from 'node:zlib';
import { createServer } from './serve.mjs';

test('serve: content types, directory index, trailing-slash redirect, 404 page, traversal', async () => {
  const root = mkdtempSync(join(tmpdir(), 'velora-serve-'));
  mkdirSync(join(root, 'eula'));
  mkdirSync(join(root, 'assets'));
  writeFileSync(join(root, 'index.html'), '<p>home</p>');
  writeFileSync(join(root, 'eula/index.html'), '<p>eula</p>');
  writeFileSync(join(root, 'assets/a.woff2'), 'font');
  writeFileSync(join(root, '404.html'), '<p>missing</p>');
  const server = createServer({ root }).listen(0, '127.0.0.1');
  await new Promise((r) => server.once('listening', r));
  const base = `http://127.0.0.1:${server.address().port}`;
  try {
    const home = await fetch(`${base}/?lang=tr`);
    assert.equal(home.status, 200);
    assert.match(home.headers.get('content-type'), /^text\/html/);
    assert.equal(await home.text(), '<p>home</p>');

    const font = await fetch(`${base}/assets/a.woff2?v=12345678`);
    assert.equal(font.headers.get('content-type'), 'font/woff2');

    const redirect = await fetch(`${base}/eula`, { redirect: 'manual' });
    assert.equal(redirect.status, 301);
    assert.equal(redirect.headers.get('location'), '/eula/');
    assert.equal(await (await fetch(`${base}/eula/`)).text(), '<p>eula</p>');

    const missing = await fetch(`${base}/nope/`);
    assert.equal(missing.status, 404);
    assert.equal(await missing.text(), '<p>missing</p>');

    const traversal = await fetch(`${base}/..%2F..%2Fetc%2Fpasswd`);
    assert.equal(traversal.status, 404);
  } finally {
    server.close();
    rmSync(root, { recursive: true, force: true });
  }
});

// Raw request: fetch() would decode gzip transparently and hide the header under test.
const get = (url, headers) => new Promise((resolve, reject) => {
  request(url, { headers }, (res) => {
    const chunks = [];
    res.on('data', (c) => chunks.push(c));
    res.on('end', () => resolve({ headers: res.headers, body: Buffer.concat(chunks) }));
  }).on('error', reject).end();
});

test('serve: gzips text types when asked, never fonts or unasked requests', async () => {
  const root = mkdtempSync(join(tmpdir(), 'velora-serve-'));
  const css = 'body { color: red; }\n'.repeat(50);
  writeFileSync(join(root, 'a.css'), css);
  writeFileSync(join(root, 'a.woff2'), 'font');
  const server = createServer({ root }).listen(0, '127.0.0.1');
  await new Promise((r) => server.once('listening', r));
  const base = `http://127.0.0.1:${server.address().port}`;
  try {
    const zipped = await get(`${base}/a.css?v=12345678`, { 'Accept-Encoding': 'gzip, br' });
    assert.equal(zipped.headers['content-encoding'], 'gzip');
    assert.equal(zipped.headers.vary, 'Accept-Encoding');
    assert.equal(gunzipSync(zipped.body).toString(), css);
    assert.ok(zipped.body.length < css.length);

    const plain = await get(`${base}/a.css`, {});
    assert.equal(plain.headers['content-encoding'], undefined);
    assert.equal(plain.body.toString(), css);

    const font = await get(`${base}/a.woff2`, { 'Accept-Encoding': 'gzip' });
    assert.equal(font.headers['content-encoding'], undefined);
    assert.equal(font.body.toString(), 'font');
  } finally {
    server.close();
    rmSync(root, { recursive: true, force: true });
  }
});
