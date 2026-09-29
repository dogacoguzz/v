#!/usr/bin/env node
// serve.mjs: dependency-free static server for local checks, mimicking GitHub Pages:
// directory index.html, 301 to the trailing slash for directories, 404.html on a miss.
//
//   npm run serve            (PORT=8080 by default)

import { createServer as createHttpServer } from 'node:http';
import { createReadStream, existsSync, statSync } from 'node:fs';
import { dirname, extname, join, normalize, sep } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');

export const CONTENT_TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.xml': 'application/xml; charset=utf-8',
  '.txt': 'text/plain; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.webp': 'image/webp',
  '.avif': 'image/avif',
  '.ico': 'image/x-icon',
  '.woff2': 'font/woff2',
  '.woff': 'font/woff',
};

const isFile = (p) => existsSync(p) && statSync(p).isFile();

export function createServer({ root = ROOT } = {}) {
  const rootDir = normalize(root + sep);
  return createHttpServer((req, res) => {
    const send = (status, file, headers = {}) => {
      res.writeHead(status, {
        'Content-Type': CONTENT_TYPES[extname(file).toLowerCase()] ?? 'application/octet-stream',
        'Cache-Control': 'no-cache',
        ...headers,
      });
      if (req.method === 'HEAD') return res.end();
      createReadStream(file).pipe(res);
    };
    const notFound = () => {
      const page = join(rootDir, '404.html');
      if (isFile(page)) return send(404, page);
      res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' });
      res.end('Not found');
    };

    if (req.method !== 'GET' && req.method !== 'HEAD') {
      res.writeHead(405, { Allow: 'GET, HEAD' });
      return res.end();
    }
    let pathname;
    try {
      pathname = decodeURIComponent(new URL(req.url, 'http://localhost').pathname);
    } catch {
      return notFound();
    }
    const target = normalize(join(rootDir, pathname));
    if (!target.startsWith(rootDir) && target + sep !== rootDir) return notFound();
    const hidden = target.slice(rootDir.length).split(sep).some((part) => part.startsWith('.'));
    if (hidden || !existsSync(target)) return notFound();

    if (statSync(target).isDirectory()) {
      if (!pathname.endsWith('/')) {
        const query = new URL(req.url, 'http://localhost').search;
        res.writeHead(301, { Location: `${pathname}/${query}` });
        return res.end();
      }
      const index = join(target, 'index.html');
      return isFile(index) ? send(200, index) : notFound();
    }
    return send(200, target);
  });
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const port = Number(process.env.PORT) || 8080;
  createServer().listen(port, '127.0.0.1', () => console.log(`serving ${ROOT} at http://127.0.0.1:${port}/`));
}
