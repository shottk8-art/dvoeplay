import assert from 'node:assert/strict';
import { handle } from '../netlify/functions/lib/rooms.mjs';
import { memStore } from './memstore.mjs';

let failures = 0;
async function fixture() {
  const store = memStore();
  const call = (action, data) => handle(store, action, data);
  const a = (await call('create', { game: 'dvoeplay' })).body;
  const b = (await call('join', { code: a.code, game: 'dvoeplay' })).body;
  const first = { code: a.code, token: a.token };
  const second = { code: a.code, token: b.token };
  await call('result', { ...first, winner: 1, round: 0 });
  await call('again', { ...first, round: 0 });
  await call('again', { ...second, round: 0 });
  return { call, first, second };
}
async function check(name, fn) {
  try { await fn(); console.log('ok', name); }
  catch (error) { failures++; console.error('FAIL', name, error.message); }
}

await check('late result from round 0 cannot finish round 1', async () => {
  const { call, first } = await fixture();
  const late = await call('result', { ...first, winner: 2, round: 0 });
  const state = (await call('state', first)).body;
  assert.equal(state.round, 1);
  assert.equal(state.result, null);
  assert.equal(late.status, 409);
});
await check('duplicate rematch from round 0 cannot consent to round 1', async () => {
  const { call, first } = await fixture();
  await call('again', { ...first, round: 0 });
  const state = (await call('state', first)).body;
  assert.deepEqual(state.rematch, [false, false]);
});
await check('invalid winner cannot corrupt the round result', async () => {
  const { call, first } = await fixture();
  const invalid = await call('result', { ...first, winner: 99, round: 1 });
  assert.equal(invalid.status, 400);
  assert.equal((await call('state', first)).body.result, null);
});
await check('request without a round cannot change a later round', async () => {
  const { call, first } = await fixture();
  assert.equal((await call('result', { ...first, winner: 1 })).status, 409);
  assert.equal((await call('again', first)).status, 409);
  const state = (await call('state', first)).body;
  assert.equal(state.result, null);
  assert.deepEqual(state.rematch, [false, false]);
});
await check('results and rematches remain valid for the current round', async () => {
  const { call, first, second } = await fixture();
  assert.equal((await call('result', { ...first, winner: 2, round: 1 })).status, 200);
  assert.equal((await call('result', { ...second, winner: 1, round: 1 })).body.result.winner, 2);
  await call('again', { ...first, round: 1 });
  const next = await call('again', { ...second, round: 1 });
  assert.equal(next.body.round, 2);
  assert.equal(next.body.result, null);
  assert.deepEqual(next.body.rematch, [false, false]);
});

console.log(`round boundaries: ${failures ? failures + ' failed' : 'passed'}`);
process.exitCode = failures ? 1 : 0;
