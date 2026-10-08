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

/* Blobs за тем же интерфейсом, что и локальное хранилище в тестах.
   Запись условная: etag, полученный при чтении, — пропуск на запись.
   Если комнату успели изменить, Blobs вернёт modified:false, и логика
   комнат перечитает её и повторит действие. Без этого ходы теряются. */
export function blobStore(store = getStore({ name: 'rooms', consistency: 'strong' })){
  return {
    async read(k){
      const r = await store.getWithMetadata(k, { type: 'json', consistency: 'strong' });
      if (!r || r.data == null) return null;
      return { value: r.data, etag: r.etag };
    },
    async write(k, v, etag){
      if (etag !== null && (typeof etag !== 'string' || !etag)){
        throw new Error('Для обновления комнаты нужен etag');
      }
      const how = etag === null ? { onlyIfNew: true }
                : { onlyIfMatch: etag };
      // При сбое клиент повторит ход. Безусловная запись могла бы стереть ход соперника.
      const res = await store.setJSON(k, v, how);
      // The SDK can report modified:true for non-412 HTTP failures without an ETag.
      // https://github.com/netlify/primitives/issues/741
      if (res && res.modified && (typeof res.etag !== 'string' || !res.etag)){
        throw new Error('Storage write was not confirmed by an ETag');
      }
      return !!(res && res.modified);
    },
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
    /* в логах функции на Netlify видно, что именно сломалось */
    console.error('[room] ' + action + ':', e && (e.stack || e.message || e));
    return json(500, { error: 'Сервер комнат недоступен' });
  }
};

export const config = { path: '/api/*' };
