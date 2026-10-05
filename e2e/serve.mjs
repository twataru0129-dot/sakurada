// E2E テスト用：dist を「/typing/」というサブディレクトリに置いた状態で配信します
import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import path from 'node:path';

const roots = { '/typing/': path.resolve('dist'), '/mock/': path.resolve('dist-mock') };
const types = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript', '.css': 'text/css', '.png': 'image/png', '.ico': 'image/x-icon', '.webmanifest': 'application/manifest+json' };
createServer(async (req, res) => {
  const url = new URL(req.url ?? '/', 'http://x');
  const prefix = Object.keys(roots).find((p) => url.pathname.startsWith(p));
  if (!prefix) {
    res.writeHead(404).end('not found');
    return;
  }
  const root = roots[prefix];
  let rel = decodeURIComponent(url.pathname.slice(prefix.length)) || 'index.html';
  const file = path.join(root, rel);
  if (!file.startsWith(root)) return res.writeHead(403).end();
  try {
    const body = await readFile(file);
    res.writeHead(200, { 'Content-Type': types[path.extname(file)] ?? 'application/octet-stream' }).end(body);
  } catch {
    res.writeHead(404).end('not found');
  }
}).listen(Number(process.env.PORT ?? 5179));
