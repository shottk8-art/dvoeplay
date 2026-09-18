/* Локальный сервер для проверки: та же логика комнат, что и на Netlify,
   но хранилище в памяти. Нужен только для тестов, на боевой сайт не попадает. */
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { handle } from '../netlify/functions/lib/rooms.mjs';

const ROOT = path.resolve(process.cwd(), 'public');
const mem = new Map();
const store = {
  async get(k){ return mem.has(k) ? JSON.parse(mem.get(k)) : null; },
  async set(k, v){ mem.set(k, JSON.stringify(v)); },
  async del(k){ mem.delete(k); }
};

const TYPES = { '.html':'text/html; charset=utf-8', '.js':'text/javascript', '.css':'text/css', '.json':'application/json' };

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, 'http://localhost');

  if (url.pathname.startsWith('/api/')){
    const action = url.pathname.split('/').filter(Boolean).pop();
    let data = {};
    if (req.method === 'POST'){
      const chunks = [];
      for await (const c of req) chunks.push(c);
      try { data = JSON.parse(Buffer.concat(chunks).toString() || '{}'); } catch { data = {}; }
    } else {
      url.searchParams.forEach((v, k) => { data[k] = v; });
    }
    let out;
    try { out = await handle(store, action, data); }
    catch (e){ out = { status: 500, body: { error: String(e && e.message || e) } }; }
    res.writeHead(out.status, { 'content-type':'application/json; charset=utf-8', 'cache-control':'no-store' });
    res.end(JSON.stringify(out.body));
    return;
  }

  let p = url.pathname === '/' ? '/index.html' : url.pathname;
  const file = path.join(ROOT, decodeURIComponent(p));
  if (!file.startsWith(ROOT) || !fs.existsSync(file)){ res.writeHead(404); res.end('нет такого файла'); return; }
  res.writeHead(200, { 'content-type': TYPES[path.extname(file)] || 'application/octet-stream' });
  fs.createReadStream(file).pipe(res);
});

const PORT = process.env.PORT || 8787;
server.listen(PORT, () => console.log('локальный сервер на http://localhost:' + PORT));
