// server.js — couch-Hebrew app server (Railway). Phase 1: serve the existing static app
// (quiz.html, index.html, data/). Real-time multiplayer (WebSocket) layers on next.
// Zero dependencies so the first deploy can't fail on install.
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.dirname(fileURLToPath(import.meta.url));
const PORT = process.env.PORT || 3000;

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.mp3': 'audio/mpeg',
  '.txt': 'text/plain; charset=utf-8',
  '.ico': 'image/x-icon',
};

const server = http.createServer((req, res) => {
  let pathname;
  try { pathname = decodeURIComponent(new URL(req.url, 'http://x').pathname); }
  catch { res.writeHead(400); res.end('bad request'); return; }

  if (pathname === '/healthz') { res.writeHead(200, { 'Content-Type': 'text/plain' }); res.end('ok'); return; }
  if (pathname === '/') pathname = '/index.html';

  // resolve safely under ROOT; reject path traversal and any dotfile segment (.git, .ghtoken, …)
  const filePath = path.normalize(path.join(ROOT, pathname));
  const unsafe = !filePath.startsWith(ROOT + path.sep) || pathname.split('/').some(s => s.startsWith('.'));
  if (unsafe) { res.writeHead(403, { 'Content-Type': 'text/plain' }); res.end('forbidden'); return; }

  fs.readFile(filePath, (err, data) => {
    if (err) { res.writeHead(404, { 'Content-Type': 'text/plain' }); res.end('not found'); return; }
    res.writeHead(200, { 'Content-Type': MIME[path.extname(filePath).toLowerCase()] || 'application/octet-stream' });
    res.end(data);
  });
});

server.listen(PORT, () => console.log(`couch-hebrew listening on :${PORT}`));
