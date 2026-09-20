/* Логика сетевых комнат dvoeplay.
   Хранилище передаётся снаружи: на Netlify это Blobs, в локальном тесте —
   объект в памяти. Благодаря этому один и тот же код гоняется и в бою, и в тестах.

   Модель: комната хранит список ходов по текущему раунду. Игра у обоих
   клиентов детерминированная, поэтому достаточно передать сам ход,
   а состояние поля каждый считает сам.

   Очерёдность сервер хранит ЯВНО, а не выводит из числа ходов: в «Точках
   и квадратах», «Мемо-дуэли» и «Захлопни ящик» ход часто остаётся за тем
   же игроком, так что простое чередование там неверно. Ходящий сам
   сообщает, к кому переходит очередь; сервер следит лишь за тем, чтобы
   нельзя было сходить вне очереди.

   ВАЖНОЕ ПРО ЗАПИСЬ. Комната — один объект, и оба игрока пишут в него
   одновременно. Наивное «прочитал — изменил — записал» теряет ходы: пока
   один читал, второй успел сходить, и запись первого затирает чужой ход.
   Именно так партии и разъезжались. Поэтому каждая запись условная: она
   проходит, только если с момента чтения комнату никто не трогал
   (сравнение по etag). Не прошла — читаем заново и повторяем действие.

   Ход — маленькое значение JSON: число (клетка), строка (слово),
   массив (размер фишки и клетка). Размер ограничен. */

const LIFETIME = 3 * 60 * 60 * 1000;   /* комната живёт 3 часа с последнего касания */
const AWOL     = 25 * 1000;            /* столько тишины — считаем соперника отключившимся */
const PRESENCE = 6 * 1000;             /* как часто отмечаться «я на связи» */
const MAX_MOVES = 800;
const MAX_MOVE_CHARS = 64;             /* столько символов хватает на слово и на пару чисел */
const MAX_NAME_CHARS = 12;             /* имя игрока; длиннее не влезает в табло */
const TRIES = 6;                       /* столько раз пробуем провести запись */

/* имя приходит от игрока, поэтому чистим: одна строка, без лишних пробелов */
const clean = (v) => String(v == null ? '' : v)
  .replace(/[\u0000-\u001f\u007f]/g, '')
  .replace(/\s+/g, ' ')
  .trim()
  .slice(0, MAX_NAME_CHARS);

const now = () => Date.now();
const rnd = (n) => Math.floor(Math.random() * n);
const newCode  = () => String(rnd(90000) + 10000);
const newToken = () => Math.random().toString(36).slice(2) + Math.random().toString(36).slice(2);
const sleep = (ms) => new Promise(r => setTimeout(r, ms));

function key(code){ return 'room-' + code; }

/* кто начинает раунд: первый раунд за первым игроком, дальше по очереди */
export function starterOf(round){ return round % 2 === 0 ? 1 : 2; }

/* ход допустим, если он компактный и без вложенных объектов */
export function okMove(v){
  if (v === null || v === undefined) return false;
  const t = typeof v;
  if (t === 'number') return Number.isFinite(v);
  if (t === 'string') return v.length <= MAX_MOVE_CHARS;
  if (Array.isArray(v)){
    if (v.length > 8) return false;
    return v.every(x => (typeof x === 'number' && Number.isFinite(x)) ||
                        (typeof x === 'string' && x.length <= MAX_MOVE_CHARS));
  }
  return false;
}

/* метка хода: клиент повторяет ход, пока сервер не подтвердит, и метка
   не даёт применить один и тот же ход дважды */
function okMid(v){ return typeof v === 'string' && v.length > 0 && v.length <= 32; }

function blank(game){
  return {
    game,
    seed: rnd(1e9),          /* общая случайность: колода, загаданное слово, броски */
    created: now(),
    touched: now(),
    round: 0,
    turn: starterOf(0),
    seats: [null, null],     /* токены игроков */
    who: ['', ''],           /* имена игроков, как они себя назвали */
    seen: [0, 0],            /* когда каждый последний раз выходил на связь */
    mids: ['', ''],          /* метка последнего принятого хода каждого */
    moves: [],
    rematch: [false, false],
    result: null             /* {winner, at} — заполняет тот, у кого партия закончилась */
  };
}

/* комнаты, созданные прошлой версией, могли не знать про новые поля */
function patch(room){
  if (typeof room.turn !== 'number') room.turn = starterOf(room.round);
  if (!room.who) room.who = ['', ''];
  if (!room.mids) room.mids = ['', ''];
  return room;
}

function seatOf(room, token){
  if (!token) return 0;
  if (room.seats[0] === token) return 1;
  if (room.seats[1] === token) return 2;
  return 0;
}

function alive(room, seat, at){ return room.seen[seat - 1] > 0 && at - room.seen[seat - 1] < AWOL; }

function view(room, seat, since, at){
  const other = seat === 1 ? 2 : 1;
  return {
    game: room.game,
    seed: room.seed,
    seat,
    round: room.round,
    joined: !!(room.seats[0] && room.seats[1]),
    oppOnline: !!room.seats[other - 1] && alive(room, other, at),
    oppLeft: room.seats[other - 1] === false,
    oppName: (room.who && room.who[other - 1]) || '',
    total: room.moves.length,
    since: Math.max(0, since | 0),
    moves: room.moves.slice(Math.max(0, since | 0)),
    turn: room.turn,
    rematch: room.rematch.slice(),
    result: room.result
  };
}

const bad = (status, error) => ({ status, body: { error } });
const ok  = (body) => ({ status: 200, body });

/* запись не прошла — комнату успели изменить, начинаем действие заново */
const AGAIN = { retry: true };

export async function handle(store, action, data){
  for (let i = 0; i < TRIES; i++){
    const res = await once(store, action, data || {});
    if (res !== AGAIN) return res;
    await sleep(15 + rnd(25) + i * 25);
  }
  return bad(503, 'Комната сейчас занята, попробуйте ещё раз');
}

async function once(store, action, data){
  const at = now();

  if (action === 'create'){
    const game = String(data.game || 'dvoeplay').slice(0, 32);
    /* пробуем несколько кодов — вдруг занят */
    for (let i = 0; i < 8; i++){
      const code = newCode();
      const cur = await store.read(key(code));
      if (cur && at - cur.value.touched < LIFETIME) continue;
      const room = blank(game);
      const token = newToken();
      room.seats[0] = token;
      room.seen[0] = at;
      room.who[0] = clean(data.name);
      /* запись только если код так и остался свободным */
      if (!(await store.write(key(code), room, cur ? cur.etag : null))) continue;
      return ok({ code, token, seat: 1, seed: room.seed, round: 0, turn: room.turn });
    }
    return bad(503, 'Не удалось подобрать свободный код, попробуйте ещё раз');
  }

  const code = String(data.code || '').replace(/\D/g, '');
  if (code.length !== 5) return bad(400, 'Код должен быть из пяти цифр');

  const held = await store.read(key(code));
  if (!held) return bad(404, 'Комната не найдена');
  const room = patch(held.value);
  const tag = held.etag;
  if (at - room.touched > LIFETIME){
    await store.del(key(code));
    return bad(410, 'Комната устарела');
  }
  const save = () => store.write(key(code), room, tag);

  if (action === 'join'){
    if (room.seats[0] === false) return bad(410, 'Хозяин комнаты вышел');
    if (room.seats[1] && room.seats[1] !== false && alive(room, 2, at)) return bad(409, 'В комнате уже двое');
    if (data.game && room.game && String(data.game) !== room.game){
      return bad(409, 'В этой комнате играют в другую игру');
    }
    const token = newToken();
    room.seats[1] = token;
    room.seen[1] = at;
    room.who[1] = clean(data.name);
    room.touched = at;
    if (!(await save())) return AGAIN;
    return ok({ code, token, seat: 2, game: room.game, seed: room.seed,
                round: room.round, turn: room.turn, oppName: room.who[0] || '' });
  }

  const seat = seatOf(room, data.token);
  if (!seat) return bad(403, 'Вы не в этой комнате');

  if (action === 'state'){
    /* Опрос идёт раз в секунду с обоих телефонов. Если каждый раз
       переписывать комнату, записи будут наступать друг другу на пятки и
       мешать ходам. Отмечаемся на связи не чаще раза в шесть секунд —
       соперник считается отключившимся только через двадцать пять. */
    if (at - room.seen[seat - 1] > PRESENCE){
      room.seen[seat - 1] = at;
      room.touched = at;
      if (!(await save())) return AGAIN;
    }
    return ok(view(room, seat, data.since, at));
  }

  room.seen[seat - 1] = at;
  room.touched = at;

  if (action === 'move'){
    if (!okMove(data.move)) return bad(400, 'Недопустимый ход');
    /* тот же ход прислали второй раз: ответ на первую попытку потерялся
       в дороге. Он уже учтён — просто отдаём нынешнюю картину */
    if (okMid(data.mid) && room.mids[seat - 1] === data.mid){
      return ok(view(room, seat, data.since, at));
    }
    if (room.moves.length >= MAX_MOVES) return bad(409, 'Слишком много ходов');
    if (room.turn !== seat) return bad(409, 'Сейчас не ваш ход');
    if ((data.round | 0) !== room.round) return bad(409, 'Раунд уже сменился');
    const next = data.next | 0;
    room.moves.push(data.move);
    room.turn = (next === 1 || next === 2) ? next : (3 - seat);
    if (okMid(data.mid)) room.mids[seat - 1] = data.mid;
    if (!(await save())) return AGAIN;
    return ok(view(room, seat, data.since, at));
  }

  if (action === 'result'){
    if (!room.result) room.result = { winner: data.winner | 0, at };
    if (!(await save())) return AGAIN;
    return ok(view(room, seat, data.since, at));
  }

  if (action === 'again'){
    room.rematch[seat - 1] = true;
    if (room.rematch[0] && room.rematch[1]){
      room.round += 1;
      room.moves = [];
      room.mids = ['', ''];
      room.turn = starterOf(room.round);
      room.rematch = [false, false];
      room.result = null;
    }
    if (!(await save())) return AGAIN;
    return ok(view(room, seat, 0, at));
  }

  if (action === 'leave'){
    room.seats[seat - 1] = false;
    /* в комнате никого не осталось — держать её незачем */
    const gone = (s) => !s;
    if (gone(room.seats[0]) && gone(room.seats[1])){
      await store.del(key(code));
      return ok({ left: true, closed: true });
    }
    if (!(await save())) return AGAIN;
    return ok({ left: true });
  }

  return bad(400, 'Неизвестное действие');
}
