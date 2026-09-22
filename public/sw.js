/* Офлайн-режим dvoeplay.

   Все восемь игр и главный экран — обычные файлы, поэтому после первого
   открытия они работают и без сети: в самолёте, в метро, на даче. Игра
   по сети без сети, понятно, невозможна — её запросы к /api/ этот файл
   не трогает вообще и пропускает прямо на сервер.

   Стратегия — «отдать из кеша сразу, обновить в фоне»: приложение
   открывается мгновенно, как настоящее, а свежая версия, выложенная на
   сайт, подхватывается при следующем открытии. Поэтому новая версия у
   игрока появляется не в ту же секунду, а со второго запуска — это
   нормально и так задумано.

   VERSION меняется, только когда меняется сам список файлов (появилась
   девятая игра, новая иконка). Для обычной правки игры ничего менять не
   нужно: файл обновится в кеше сам. */

const VERSION = 'dvoeplay-v1';

/* всё, без чего приложение не откроется без сети; список сверяет audit.py */
const FILES = [
  './',
  'index.html',
  'net.js',
  'manifest.webmanifest',
  'dvoeplay.html',
  'matreshka.html',
  'magnitniy-boy.html',
  'memo-duel.html',
  'dots-boxes.html',
  '5-bukv.html',
  'viselica.html',
  'zahlopni-yaschik.html',
  'apple-touch-icon.png',
  'icon-192.png',
  'icon-512.png',
  'icon-maskable-512.png'
];

self.addEventListener('install', (e) => {
  e.waitUntil(
    caches.open(VERSION)
      .then((c) => c.addAll(FILES))
      .then(() => self.skipWaiting())
  );
});

/* старые кеши от прошлых версий списка больше не нужны */
self.addEventListener('activate', (e) => {
  e.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== VERSION).map((k) => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', (e) => {
  const req = e.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);
  if (url.origin !== self.location.origin) return;     /* Telegram и всё чужое — мимо */
  if (url.pathname.startsWith('/api/')) return;         /* игра по сети — только напрямую */

  /* Ссылка-приглашение открывает игру с ?room=12345. Страница от этого
     не меняется, поэтому в кеше храним её без хвоста — одну на все коды. */
  const key = url.origin + url.pathname;

  /* свежая версия с сайта: сразу кладём её в кеш на следующий раз */
  const fresh = fetch(req).then((res) => {
    if (!res || !res.ok || res.type !== 'basic') return res;
    const copy = res.clone();
    return caches.open(VERSION)
      .then((c) => c.put(key, copy))
      .then(() => res, () => res);
  });
  /* обновление в фоне должно успеть закончиться, даже если ответ уже отдан из кеша */
  e.waitUntil(fresh.then(() => {}, () => {}));

  e.respondWith(
    caches.open(VERSION).then((c) => c.match(key)).then((hit) => {
      if (hit) return hit;
      /* в кеше нет, а сети нет — вместо любой страницы отдаём главный экран */
      return fresh.catch(() => {
        if (req.mode !== 'navigate') return Response.error();
        return caches.open(VERSION)
          .then((c) => c.match(url.origin + '/index.html'))
          .then((r) => r || Response.error());
      });
    })
  );
});
