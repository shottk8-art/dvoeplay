/* Логика сетевых комнат dvoeplay.
   Хранилище передаётся снаружи: на Netlify это Blobs, в локальном тесте —
   объект в памяти. Благодаря этому один и тот же код гоняется и в бою, и в тестах.

   Модель: комната хранит список ходов по текущему раунду. Игра у обоих
   клиентов детерминированная, поэтому достаточно передавать сам ход,
   а состояние поля каждый считает сам. Сервер при этом проверяет
   очерёдность — клиент не может сходить дважды или за соперника. */

const LIFETIME = 3 * 60 * 60 * 1000;   /* комната живёт 3 часа с последнего касания */
const AWOL     = 25 * 1000;            /* столько тишины — считаем соперника отключившимся */
const MAX_MOVES = 500;

const now = () => Date.now();
const rnd = (n) => Math.floor(Math.random() * n);
const newCode  = () => String(rnd(90000) + 10000);
const newToken = () => Math.random().toString(36).slice(2) + Math.random().toString(36).slice(2);

function key(code){ return 'room-' + code; }

function blank(game){
  return {
    game,
    seed: rnd(1e9),          /* общий источник случайности для игр, где она нужна */
    created: now(),
    touched: now(),
    round: 0,
    seats: [null, null],     /* токены игроков */
    seen: [0, 0],            /* когда каждый последний раз выходил на связь */
    moves: [],
    rematch: [false, false],
    result: null             /* {winner, at} — заполняет тот, у кого партия закончилась */
  };
}

/* кто ходит первым в раунде: как в самой игре — первый раунд за первым игроком */
export function starterOf(round){ return round % 2 === 0 ? 1 : 2; }
export function turnOf(round, moveCount){
  const s = starterOf(round);
  return moveCount % 2 === 0 ? s : 3 - s;
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
    total: room.moves.length,
    since: Math.max(0, since | 0),
    moves: room.moves.slice(Math.max(0, since | 0)),
    turn: turnOf(room.round, room.moves.length),
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
      await store.set(key(code), room);
      return ok({ code, token, seat: 1, seed: room.seed });
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

  if (action === 'join'){
    if (room.seats[0] === false) return bad(410, 'Хозяин комнаты вышел');
    if (room.seats[1] && room.seats[1] !== false && alive(room, 2, at)) return bad(409, 'В комнате уже двое');
    const token = newToken();
    room.seats[1] = token;
    room.seen[1] = at;
    room.touched = at;
    await store.set(key(code), room);
    return ok({ code, token, seat: 2, game: room.game, seed: room.seed, round: room.round });
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
    const move = data.move | 0;
    if (!(move >= 0 && move < 64)) return bad(400, 'Недопустимый ход');
    if (room.moves.length >= MAX_MOVES) return bad(409, 'Слишком много ходов');
    if (turnOf(room.round, room.moves.length) !== seat) return bad(409, 'Сейчас не ваш ход');
    if ((data.round | 0) !== room.round) return bad(409, 'Раунд уже сменился');
    room.moves.push(move);
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
