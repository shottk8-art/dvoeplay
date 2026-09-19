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

   Ход — маленькое значение JSON: число (клетка), строка (слово),
   массив (размер фишки и клетка). Размер ограничен. */

const LIFETIME = 3 * 60 * 60 * 1000;   /* комната живёт 3 часа с последнего касания */
const AWOL     = 25 * 1000;            /* столько тишины — считаем соперника отключившимся */
const MAX_MOVES = 800;
const MAX_MOVE_CHARS = 64;             /* столько символов хватает на слово и на пару чисел */
const MAX_NAME_CHARS = 12;             /* имя игрока; длиннее не влезает в табло */

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
    moves: [],
    rematch: [false, false],
    result: null             /* {winner, at} — заполняет тот, у кого партия закончилась */
  };
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

export async function handle(store, action, data){
  const at = now();
  data = data || {};

  if (action === 'create'){
    const game = String(data.game || 'dvoeplay').slice(0, 32);
    /* пробуем несколько кодов — вдруг занят */
    for (let i = 0; i < 8; i++){
      const code = newCode();
      const busy = await store.get(key(code));
      if (busy && at - busy.touched < LIFETIME) continue;
      const room = blank(game);
      const token = newToken();
      room.seats[0] = token;
      room.seen[0] = at;
      room.who[0] = clean(data.name);
      await store.set(key(code), room);
      return ok({ code, token, seat: 1, seed: room.seed, round: 0, turn: room.turn });
    }
    return bad(503, 'Не удалось подобрать свободный код, попробуйте ещё раз');
  }

  const code = String(data.code || '').replace(/\D/g, '');
  if (code.length !== 5) return bad(400, 'Код должен быть из пяти цифр');

  const room = await store.get(key(code));
  if (!room) return bad(404, 'Комната не найдена');
  if (at - room.touched > LIFETIME){
    await store.del(key(code));
    return bad(410, 'Комната устарела');
  }
  /* комнаты, созданные до обновления, могли не хранить очередь явно */
  if (typeof room.turn !== 'number') room.turn = starterOf(room.round);

  if (action === 'join'){
    if (room.seats[0] === false) return bad(410, 'Хозяин комнаты вышел');
    if (room.seats[1] && room.seats[1] !== false && alive(room, 2, at)) return bad(409, 'В комнате уже двое');
    if (data.game && room.game && String(data.game) !== room.game){
      return bad(409, 'В этой комнате играют в другую игру');
    }
    const token = newToken();
    room.seats[1] = token;
    room.seen[1] = at;
    if (!room.who) room.who = ['', ''];
    room.who[1] = clean(data.name);
    room.touched = at;
    await store.set(key(code), room);
    return ok({ code, token, seat: 2, game: room.game, seed: room.seed,
                round: room.round, turn: room.turn, oppName: room.who[0] || '' });
  }

  const seat = seatOf(room, data.token);
  if (!seat) return bad(403, 'Вы не в этой комнате');
  room.seen[seat - 1] = at;

  if (action === 'state'){
    room.touched = at;
    await store.set(key(code), room);
    return ok(view(room, seat, data.since, at));
  }

  if (action === 'move'){
    if (!okMove(data.move)) return bad(400, 'Недопустимый ход');
    if (room.moves.length >= MAX_MOVES) return bad(409, 'Слишком много ходов');
    if (room.turn !== seat) return bad(409, 'Сейчас не ваш ход');
    if ((data.round | 0) !== room.round) return bad(409, 'Раунд уже сменился');
    const next = data.next | 0;
    room.moves.push(data.move);
    room.turn = (next === 1 || next === 2) ? next : (3 - seat);
    room.touched = at;
    await store.set(key(code), room);
    return ok(view(room, seat, data.since, at));
  }

  if (action === 'result'){
    if (!room.result) room.result = { winner: data.winner | 0, at };
    room.touched = at;
    await store.set(key(code), room);
    return ok(view(room, seat, data.since, at));
  }

  if (action === 'again'){
    room.rematch[seat - 1] = true;
    if (room.rematch[0] && room.rematch[1]){
      room.round += 1;
      room.moves = [];
      room.turn = starterOf(room.round);
      room.rematch = [false, false];
      room.result = null;
    }
    room.touched = at;
    await store.set(key(code), room);
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
    room.touched = at;
    await store.set(key(code), room);
    return ok({ left: true });
  }

  return bad(400, 'Неизвестное действие');
}
