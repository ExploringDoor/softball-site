// Local testing only: serves this folder and runs api/lookup.js the way Vercel would.
//   node dev-server.mjs [port]
import http from 'node:http';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import lookup from './api/lookup.js';

const ROOT = path.dirname(fileURLToPath(import.meta.url));
const PORT = Number(process.argv[2] || process.env.PORT || 8131);
const TYPES = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript', '.mjs': 'text/javascript', '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.svg': 'image/svg+xml', '.json': 'application/json', '.css': 'text/css' };

http.createServer(async (req, res) => {
  const url = new URL(req.url, 'http://localhost');
  if (url.pathname === '/api/lookup') return lookup(req, res);
  const rel = path.normalize(decodeURIComponent(url.pathname)).replace(/^([/\\])+/, '') || 'index.html';
  const file = path.join(ROOT, rel);
  if (!file.startsWith(ROOT + path.sep) || /^(api|dev-server\.mjs|tests)/.test(rel)) { res.statusCode = 404; return res.end('not found'); }
  try {
    const buf = await readFile(file);
    res.setHeader('Content-Type', TYPES[path.extname(file).toLowerCase()] || 'application/octet-stream');
    res.setHeader('Cache-Control', 'no-store');
    res.end(buf);
  } catch (e) { res.statusCode = 404; res.end('not found'); }
}).listen(PORT, () => console.log('champion maker on http://localhost:' + PORT));
