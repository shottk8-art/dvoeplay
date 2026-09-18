/* Единственная серверная функция приложения: комнаты для игры по сети.
   Адрес /api/<действие> ведёт сюда (см. netlify.toml).
   Хранилище — Netlify Blobs, отдельное хранилище «rooms». */

import { getStore } from '@netlify/blobs';
import { handle } from './lib/rooms.mjs';

const json = (status, body) => new Response(JSON.stringify(body), {
  status,
  headers: {
    'content-type': 'application/json; charset=utf-8',
    'cache-control': 'no-store'
  }
});

/* Blobs за тем же интерфейсом, что и локальное хранилище в тестах */
function blobStore(){
  const store = getStore({ name: 'rooms', consistency: 'strong' });
  return {
    async get(k){ return await store.get(k, { type: 'json' }); },
    async set(k, v){ await store.setJSON(k, v); },
    async del(k){ await store.delete(k); }
  };
}

export default async (request) => {
  const url = new URL(request.url);
  const action = url.pathname.split('/').filter(Boolean).pop();

  let data = {};
  if (request.method === 'POST'){
    try { data = await request.json(); } catch { data = {}; }
  } else {
    url.searchParams.forEach((v, k) => { data[k] = v; });
  }

  try {
    const res = await handle(blobStore(), action, data);
    return json(res.status, res.body);
  } catch (e){
    return json(500, { error: 'Сервер комнат недоступен' });
  }
};

export const config = { path: '/api/*' };
