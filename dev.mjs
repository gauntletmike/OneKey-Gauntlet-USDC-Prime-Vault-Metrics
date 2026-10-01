import http from 'node:http';
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { resolve, extname, sep } from 'node:path';
import handler from './api/vault.js';

const root = fileURLToPath(new URL('.', import.meta.url));
const mime = { '.html':'text/html; charset=utf-8', '.css':'text/css; charset=utf-8', '.js':'text/javascript; charset=utf-8', '.svg':'image/svg+xml' };
const allowed = new Set(['index.html','styles.css','app.js','favicon.svg','lib/math.js']);
http.createServer(async (req,res) => {
  const url = new URL(req.url,'http://localhost');
  if (url.pathname === '/api/vault') {
    res.status = code => { res.statusCode=code; return res; };
    res.json = value => { res.setHeader('Content-Type','application/json'); res.end(JSON.stringify(value)); };
    return handler(req,res);
  }
  const relative = url.pathname === '/' ? 'index.html' : url.pathname.slice(1);
  const path = resolve(root,relative);
  if (!path.startsWith(root.endsWith(sep)?root:root+sep) || !allowed.has(relative)) { res.writeHead(404); return res.end('Not found'); }
  try { const bytes=await readFile(path); res.writeHead(200,{'Content-Type':mime[extname(path)]||'application/octet-stream'}); res.end(bytes); }
  catch { res.writeHead(404); res.end('Not found'); }
}).listen(Number(process.env.PORT)||3000,'0.0.0.0',()=>console.log(`OneKey analytics running on port ${Number(process.env.PORT)||3000}`));
