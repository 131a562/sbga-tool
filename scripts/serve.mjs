// 本地预览：node scripts/serve.mjs → http://localhost:5190/
// （直接双击 index.html 也能用，这个只是给需要 http 的场合）
import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { extname, join, normalize } from 'node:path';
import { fileURLToPath } from 'node:url';
const root = fileURLToPath(new URL('..', import.meta.url));
const types = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8', '.png': 'image/png', '.webmanifest': 'application/manifest+json' };
createServer(async (req, res) => {
  let url = decodeURIComponent(req.url.split('?')[0]);
  if (url.endsWith('/')) url += 'index.html';
  const p = normalize(join(root, url));
  if (!p.startsWith(normalize(root))) return res.writeHead(403).end();
  let body;
  try { body = await readFile(p); } catch { return res.writeHead(404).end('not found'); }
  res.writeHead(200, { 'content-type': types[extname(p)] || 'application/octet-stream' }).end(body);
}).listen(5190, () => console.log('http://localhost:5190/'));
