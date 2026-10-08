import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';

const source = name => readFileSync(new URL('../public/' + name + '.html', import.meta.url), 'utf8');
function load(name, start, end, globals = {}) {
  const s = source(name), a = s.indexOf(start), b = s.indexOf(end, a);
  assert(a >= 0 && b > a, 'missing actual game source');
  return vm.runInNewContext(s.slice(a, b), globals), globals;
}
let seed = 20261007;
const random = n => ((seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0) % n);

// Compare the real latest-move detector against an independent whole-board scan.
const four = load('dvoeplay', 'function freeRow(', '/* ---------- ход ---------- */', { ROWS: 6, COLS: 7 });
function boardWinner(board) {
  for (let r = 0; r < 6; r++) for (let c = 0; c < 7; c++) {
    const p = board[r * 7 + c];
    if (!p) continue;
    for (const [dr, dc] of [[0,1],[1,0],[1,1],[1,-1]]) {
      const cells = Array.from({length:4}, (_, i) => [r + dr*i, c + dc*i]);
      if (cells.every(([y,x]) => y>=0 && y<6 && x>=0 && x<7 && board[y*7+x]===p)) return p;
    }
  }
  return 0;
}
let placements = 0;
for (let game = 0; game < 2000; game++) {
  const board = Array(42).fill(0);
  for (let turn = 0; turn < 42; turn++) {
    const legal = Array.from({length:7}, (_, i) => i).filter(c => !board[c]);
    if (!legal.length) break;
    const c = legal[random(legal.length)], r = four.freeRow(board, c), p = turn%2+1;
    assert(r>=0 && r<6); board[r*7+c]=p; placements++;
    const won = four.winLine(board, r, c, p);
    assert.equal(!!won, boardWinner(board) === p);
    if (won) break;
  }
}
console.log('ok 4 в ряд: 2000 seeded games,', placements, 'legal moves checked');

const art = load('dobble', 'var SYM=', 'var ORDER=5;');
assert.equal(art.SYM.length, 31); assert.equal(art.NAMES.length, 31);
assert.equal(new Set(art.NAMES).size, 31);
art.SYM.forEach(entry => assert.ok(entry[1].includes('class="sticker"')));

// Every pair of distinct Dobble cards must share exactly one unique symbol.
const dobble = load('dobble', 'var ORDER=5;', 'var DECK=buildDeck();');
const deck = dobble.buildDeck();
assert.equal(deck.length, 31);
let pairs = 0;
for (let i=0; i<deck.length; i++) {
  assert.equal(deck[i].length, 6); assert.equal(new Set(deck[i]).size, 6);
  for (let j=i+1; j<deck.length; j++) {
    const overlap=deck[i].filter(x=>deck[j].includes(x));
    assert.equal(overlap.length,1); assert.equal(dobble.common(deck[i],deck[j]),overlap[0]); pairs++;
  }
}
for(let seed=1;seed<=200;seed++){
  let value=seed;const rng=()=>((value=(Math.imul(value,1664525)+1013904223)>>>0)/4294967296),order=deck.map((_,i)=>i);
  for(let i=order.length-1;i>0;i--){const j=Math.floor(rng()*(i+1));[order[i],order[j]]=[order[j],order[i]];}
  const schedule=dobble.pairSchedule(order);
  assert.equal(schedule.length,29);
  const seen=new Set();
  schedule.forEach((pair,i)=>{
    assert.notEqual(pair[0],pair[1]);
    assert.equal(deck[pair[0]].filter(x=>deck[pair[1]].includes(x)).length,1);
    assert.ok(!seen.has(pair.slice().sort((a,b)=>a-b).join(',')));
    seen.add(pair.slice().sort((a,b)=>a-b).join(','));
    if(i){assert.notEqual(pair[0],schedule[i-1][0]);assert.notEqual(pair[1],schedule[i-1][1]);}
  });
}
console.log('ok Доббль: all', pairs, 'card pairs and 31 cards');

// Repeated letters/digits consume each secret occurrence at most once.
const word = load('5-bukv', 'function evaluate(guess,secret)', 'var app=document.getElementById');
const lock = load('vzlomshik', 'function feedback(code,guess)', '/* ===================== ВИБРАЦИЯ', {DIGITS:4});
function reference(secret, guess) {
  const exact = guess.split('').map((x,i)=>x===secret[i]);
  const remaining = secret.split('').filter((_,i)=>!exact[i]);
  return guess.split('').map((x,i)=>{
    if(exact[i]) return 'correct';
    const j=remaining.indexOf(x); if(j<0) return 'absent';
    remaining.splice(j,1); return 'present';
  });
}
const code = (alphabet, n) => Array.from({length:n},()=>alphabet[random(alphabet.length)]).join('');
for (let i=0;i<10000;i++) {
  const secret=code('абвгд',5), guess=code('абвгд',5);
  assert.deepEqual(Array.from(word.evaluate(guess,secret)),reference(secret,guess));
  const s=code('0123456789',4),g=code('0123456789',4),v=reference(s,g);
  assert.deepEqual(Array.from(lock.feedback(s,g)),[v.filter(x=>x==='correct').length,v.filter(x=>x==='present').length]);
}
console.log('ok 5 букв / Взломщик: 10000 seeded repeated-symbol cases each');

// Legal Matryoshka moves preserve every piece, and undo restores the exact state.
const mat = load('matreshka', 'function topOf(st,i)', '/* ===================== СОПЕРНИК', {
  LINES:[[0,1,2],[3,4,5],[6,7,8],[0,3,6],[1,4,7],[2,5,8],[0,4,8],[2,4,6]]
});
let moves=0;
for(let game=0;game<200;game++) {
  const st={b:Array.from({length:9},()=>[]),h:{1:[0,2,2,2],2:[0,2,2,2]}};
  for(let turn=0;turn<64;turn++) {
    const p=turn%2+1,legal=mat.genMoves(st,p); if(!legal.length)break;
    const move=legal[random(legal.length)],before=JSON.stringify(st);
    mat.apply(st,move,p); const after=JSON.stringify(st);
    for(const player of [1,2])for(const size of [1,2,3]) {
      const onBoard=st.b.flat().filter(x=>x.p===player&&x.s===size).length;
      assert.equal(onBoard+st.h[player][size],2);
    }
    for(const stack of st.b)for(let i=1;i<stack.length;i++) assert(stack[i].s>stack[i-1].s);
    mat.undo(st,move,p); assert.equal(JSON.stringify(st),before);
    mat.apply(st,move,p); assert.equal(JSON.stringify(st),after); moves++;
    if(mat.outcome(st,p))break;
  }
}
console.log('ok Матрёшка: 200 seeded games,',moves,'piece-conservation / undo checks');
