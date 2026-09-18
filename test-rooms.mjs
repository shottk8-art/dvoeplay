/* Проверка логики комнат без сети: гоняем handle() на хранилище в памяти. */
import { handle, turnOf, starterOf } from '../netlify/functions/lib/rooms.mjs';

const mem = new Map();
const store = {
  async get(k){ return mem.has(k) ? JSON.parse(mem.get(k)) : null; },
  async set(k, v){ mem.set(k, JSON.stringify(v)); },
  async del(k){ mem.delete(k); }
};

let failed = 0;
function ok(name, cond, extra){
  if (cond) console.log('  ok  ', name);
  else { failed++; console.log('  ПЛОХО', name, extra === undefined ? '' : JSON.stringify(extra)); }
}
const call = (a, d) => handle(store, a, d);

console.log('очерёдность');
ok('раунд 0 начинает первый', starterOf(0) === 1);
ok('раунд 1 начинает второй', starterOf(1) === 2);
ok('раунд 0, ход 0 — первый', turnOf(0, 0) === 1);
ok('раунд 0, ход 1 — второй', turnOf(0, 1) === 2);
ok('раунд 1, ход 0 — второй', turnOf(1, 0) === 2);

console.log('комната');
const a = await call('create', { game: 'dvoeplay' });
ok('создана', a.status === 200 && /^\d{5}$/.test(a.body.code), a.body);
const code = a.body.code, t1 = a.body.token;

const bad = await call('state', { code, token: 'левый' });
ok('чужой токен не пускают', bad.status === 403, bad.body);

const s0 = await call('state', { code, token: t1, since: 0 });
ok('пока один', s0.body.joined === false && s0.body.seat === 1, s0.body);

const b = await call('join', { code });
ok('второй вошёл', b.status === 200 && b.body.seat === 2, b.body);
const t2 = b.body.token;
ok('сид общий', b.body.seed === a.body.seed);

const full = await call('join', { code });
ok('третьего не пускают', full.status === 409, full.body);

console.log('ходы');
const wrong = await call('move', { code, token: t2, move: 3, round: 0 });
ok('не в свой ход нельзя', wrong.status === 409, wrong.body);

const m1 = await call('move', { code, token: t1, move: 3, round: 0 });
ok('первый сходил', m1.status === 200 && m1.body.total === 1 && m1.body.turn === 2, m1.body);

const twice = await call('move', { code, token: t1, move: 4, round: 0 });
ok('дважды подряд нельзя', twice.status === 409, twice.body);

const m2 = await call('move', { code, token: t2, move: 3, round: 0 });
ok('второй сходил', m2.status === 200 && m2.body.total === 2 && m2.body.turn === 1, m2.body);

const stale = await call('move', { code, token: t1, move: 2, round: 7 });
ok('чужой раунд не принимают', stale.status === 409, stale.body);

const oob = await call('move', { code, token: t1, move: 99, round: 0 });
ok('невалидный ход не принимают', oob.status === 400, oob.body);

console.log('догон состояния');
const s1 = await call('state', { code, token: t2, since: 1 });
ok('отдаёт только новое', s1.body.moves.length === 1 && s1.body.moves[0] === 3, s1.body);
ok('соперник на связи', s1.body.oppOnline === true, s1.body);
ok('оба на местах', s1.body.joined === true);

console.log('итог и реванш');
const r = await call('result', { code, token: t1, winner: 1 });
ok('итог записан', r.body.result && r.body.result.winner === 1, r.body.result);
const r2 = await call('result', { code, token: t2, winner: 2 });
ok('переписать итог нельзя', r2.body.result.winner === 1, r2.body.result);

const g1 = await call('again', { code, token: t1 });
ok('один согласился — раунд тот же', g1.body.round === 0 && g1.body.rematch[0] === true, g1.body);
const g2 = await call('again', { code, token: t2 });
ok('оба согласились — новый раунд', g2.body.round === 1, g2.body);
ok('поле очищено', g2.body.total === 0 && g2.body.moves.length === 0, g2.body);
ok('итог сброшен', g2.body.result === null, g2.body);
ok('флаги сброшены', g2.body.rematch[0] === false && g2.body.rematch[1] === false);
ok('в новом раунде ходит второй', g2.body.turn === 2, g2.body);

const m3 = await call('move', { code, token: t1, move: 0, round: 1 });
ok('первый не ходит в чужом раунде', m3.status === 409, m3.body);
const m4 = await call('move', { code, token: t2, move: 0, round: 1 });
ok('второй ходит', m4.status === 200, m4.body);

console.log('уход');
const lv = await call('leave', { code, token: t2 });
ok('вышел', lv.body.left === true);
const s2 = await call('state', { code, token: t1, since: 0 });
ok('видно, что соперник ушёл', s2.body.oppLeft === true && s2.body.oppOnline === false, s2.body);

console.log('ошибки');
const nf = await call('state', { code: '00001', token: t1 });
ok('нет комнаты — 404', nf.status === 404, nf.body);
const short = await call('state', { code: '12', token: t1 });
ok('короткий код — 400', short.status === 400, short.body);
const unk = await call('пляши', { code, token: t1 });
ok('неизвестное действие — 400', unk.status === 400, unk.body);

console.log(failed ? '\nПРОВАЛЕНО проверок: ' + failed : '\nвсе проверки прошли');
process.exit(failed ? 1 : 0);
