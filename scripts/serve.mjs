import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { resolve, extname } from 'node:path';
const root = resolve('.');
const types = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8' };
createServer(async (req, res) => {
  const url = new URL(req.url, 'http://127.0.0.1');
  const path = url.pathname === '/analytics/reports' || url.pathname === '/' ? '/demo/index.html' : url.pathname;
  if (!/^\/(demo|extension)\/[a-zA-Z0-9._-]+$/.test(path) || !types[extname(path)]) { res.writeHead(404).end(); return; }
  try {
    const data = await readFile(resolve(root, `.${path}`));
    res.writeHead(200, { 'Content-Type': types[extname(path)], 'Cache-Control': 'no-store' }).end(data);
  } catch { res.writeHead(404).end(); }
}).listen(4173, '127.0.0.1', () => console.log('Demo: http://127.0.0.1:4173/analytics/reports?accountId=demo&reportId=preview'));
