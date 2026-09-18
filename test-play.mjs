/* Настоящая сетевая партия: два окна браузера, живой сервер, реальные клики.
   Проверяем синхронизацию, блокировку хода, итог, фант и реванш. */
import pw from '/home/claude/.npm-global/lib/node_modules/playwright/index.js';
const { chromium } = pw;

const URL = 'http://localhost:8787/dvoeplay.html';
let failed = 0;
const ok = (name, cond, extra) => {
  if (cond) console.log('  ok  ', name);
  else { failed++; console.log('  ПЛОХО', name, extra === undefined ? '' : JSON.stringify(extra)); }
};
const wait = (ms) => new Promise(r => setTimeout(r, ms));

/* состояние партии глазами страницы */
const look = (page) => page.evaluate(() => ({
  screen: document.body.classList.contains('playing') ? 'игра' : 'меню',
  netplay: document.body.classList.contains('netplay'),
  openNet: document.body.classList.contains('open-net'),
  openSheet: document.body.classList.contains('open'),
  title: document.getElementById('navtitle').textContent,
  name1: document.getElementById('name1').textContent.trim(),
  name2: document.getElementById('name2').textContent.trim(),
  dots1: !!document.querySelector('#name1 .dots'),
  dots2: !!document.querySelector('#name2 .dots'),
  score: document.getElementById('score1').textContent + ':' + document.getElementById('score2').textContent,
  hint: document.getElementById('hint').textContent.trim(),
  discs: [].slice.call(document.querySelectorAll('.board .disc:not(.aim)')).length,
  sheetTitle: document.getElementById('sheetTitle').textContent,
  sheetSub: document.getElementById('sheetSub').textContent,
  forfeit: document.getElementById('forfeit').classList.contains('on'),
  ftext: document.getElementById('ftext').textContent,
  again: document.getElementById('again').textContent,
  againOff: document.getElementById('again').disabled,
  err: document.getElementById('netErr').textContent
}));

/* клик по центру столбца: тем же жестом, что и живой человек */
async function dropIn(page, col){
  const box = await page.locator('#board').boundingBox();
  const x = box.x + box.width * (col + 0.5) / 7;
  const y = box.y + box.height * 0.5;
  await page.mouse.move(x, y);
  await page.mouse.down();
  await page.mouse.up();
}

/* ждём, пока на поле станет нужное число фишек */
async function discs(page, n, ms = 6000){
  const t0 = Date.now();
  while (Date.now() - t0 < ms){
    const c = await page.evaluate(() => document.querySelectorAll('.board .disc:not(.aim)').length);
    if (c === n) return true;
    await wait(120);
  }
  return false;
}
async function until(page, fn, ms = 8000){
  const t0 = Date.now();
  while (Date.now() - t0 < ms){
    if (fn(await look(page))) return true;
    await wait(150);
  }
  return false;
}

const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium' });
const ctxA = await browser.newContext({ viewport: { width: 390, height: 844 } });
const ctxB = await browser.newContext({ viewport: { width: 390, height: 844 } });
const A = await ctxA.newPage();
const B = await ctxB.newPage();
for (const [p, who] of [[A,'A'],[B,'B']]){
  p.on('pageerror', e => { failed++; console.log('  ОШИБКА В СТРАНИЦЕ ' + who + ':', e.message); });
}

console.log('комната');
await A.goto(URL);
await B.goto(URL);
await A.locator('.row[data-mode="3"]').click();
ok('шторка сети открылась', (await look(A)).openNet);
await A.locator('#netCreate').click();
await A.waitForFunction(() => /^\d{5}$/.test(document.getElementById('netCode').textContent), null, { timeout: 5000 });
const code = await A.locator('#netCode').textContent();
ok('код получен: ' + code, /^\d{5}$/.test(code));
ok('первый ждёт второго', !(await look(A)).screen.includes('игра'));

await B.locator('.row[data-mode="3"]').click();
await B.locator('#netJoinOpen').click();
await B.locator('#netInput').fill(code);           /* fill шлёт input — вход по пятой цифре */
ok('второй вошёл в игру', await until(B, s => s.screen === 'игра' && s.netplay));
ok('первый тоже в игре', await until(A, s => s.screen === 'игра' && s.netplay));

const a0 = await look(A), b0 = await look(B);
ok('код виден в шапке', a0.title.includes(code) && b0.title.includes(code), [a0.title, b0.title]);
ok('у первого «Вы» слева', a0.name1 === 'Вы' && a0.name2 === 'Соперник', [a0.name1, a0.name2]);
ok('у второго «Вы» справа', b0.name1 === 'Соперник' && b0.name2 === 'Вы', [b0.name1, b0.name2]);
ok('первый ходит', a0.hint === 'Ваш ход', a0.hint);
ok('второй ждёт', b0.hint === 'Ход соперника', b0.hint);
ok('точка ожидания у первого', b0.dots1 === true && b0.dots2 === false, [b0.dots1, b0.dots2]);
ok('кнопка «заново» спрятана', await A.locator('#reset').isHidden());

console.log('блокировка');
await dropIn(B, 0);                                 /* не его ход — ничего не должно произойти */
await wait(900);
ok('чужой ход не проходит', (await look(B)).discs === 0, (await look(B)).discs);

console.log('партия');
/* первый (красные) собирает ряд в столбцах 0–3, второй (жёлтые) отвечает в 6 */
const plan = [[A,0],[B,6],[A,1],[B,6],[A,2],[B,6],[A,3]];
for (let i = 0; i < plan.length; i++){
  const [p, col] = plan[i];
  await dropIn(p, col);
  ok('ход ' + (i+1) + ' виден у себя', await discs(p, i + 1), i + 1);
  ok('ход ' + (i+1) + ' долетел до соперника', await discs(p === A ? B : A, i + 1), i + 1);
}

console.log('итог');
ok('у первого «Вы выиграли»', await until(A, s => s.openSheet && s.sheetTitle === 'Вы выиграли'), (await look(A)).sheetTitle);
ok('у второго «Выиграл соперник»', await until(B, s => s.openSheet && s.sheetTitle === 'Выиграл соперник'), (await look(B)).sheetTitle);
const a1 = await look(A), b1 = await look(B);
ok('счёт совпал', a1.score === '1:0' && b1.score === '1:0', [a1.score, b1.score]);
ok('победителю фанта нет', a1.forfeit === false);
ok('проигравшему фант есть', b1.forfeit === true);
ok('фант в форме «Вы …»', /^Вы /.test(b1.ftext), b1.ftext);

console.log('реванш');
await A.locator('#again').click();
ok('первый ждёт согласия', await until(A, s => s.againOff && /Ждём соперника/.test(s.again)), (await look(A)).again);
ok('второму видно, что готов', await until(B, s => /Соперник готов/.test(s.again)), (await look(B)).again);
await B.locator('#again').click();
ok('поле у первого чистое', await discs(A, 0));
ok('поле у второго чистое', await discs(B, 0));
const a2 = await look(A), b2 = await look(B);
ok('шторки закрылись', !a2.openSheet && !b2.openSheet);
ok('счёт сохранился', a2.score === '1:0' && b2.score === '1:0', [a2.score, b2.score]);
ok('во втором раунде начинает второй', a2.hint === 'Ход соперника' && b2.hint === 'Ваш ход', [a2.hint, b2.hint]);
ok('кнопка «играть снова» вернулась', a2.again === 'Играть снова' && !a2.againOff, a2.again);

await dropIn(A, 0);
await wait(700);
ok('первый не ходит в чужую очередь', (await look(A)).discs === 0, (await look(A)).discs);
await dropIn(B, 3);
ok('второй сходил', await discs(B, 1));
ok('ход дошёл до первого', await discs(A, 1));

console.log('обрыв связи');
await B.locator('#back').click();                   /* второй ушёл в меню */
ok('первому видно, что соперник вышел',
   await until(A, s => /вышел/.test(s.hint), 10000), (await look(A)).hint);

console.log('приглашение по ссылке');
const C = await (await browser.newContext({ viewport: { width: 390, height: 844 } })).newPage();
C.on('pageerror', e => { failed++; console.log('  ОШИБКА В СТРАНИЦЕ C:', e.message); });
await A.locator('#back').click();                   /* первый освобождает комнату */
await wait(400);
await A.locator('.row[data-mode="3"]').click();
await A.locator('#netCreate').click();
await A.waitForFunction(old => {
  const t = document.getElementById('netCode').textContent;
  return /^\d{5}$/.test(t) && t !== old;
}, code, { timeout: 5000 });
const code2 = await A.locator('#netCode').textContent();
ok('вторая комната — новый код', code2 !== code, [code, code2]);
await C.goto(URL + '?room=' + code2);
ok('по ссылке сразу попадаем в партию', await until(C, s => s.screen === 'игра' && s.netplay, 9000), await look(C));
ok('у хозяина комнаты тоже началась', await until(A, s => s.screen === 'игра'));
ok('адрес почищен от кода', !(await C.evaluate(() => location.search)));

console.log('чужой код');
await C.locator('#back').click();
await A.locator('#back').click();
await wait(300);
await C.locator('.row[data-mode="3"]').click();
await C.locator('#netJoinOpen').click();
await C.locator('#netInput').fill('00042');
ok('нет такой комнаты — сказали', await until(C, s => /не найдена/i.test(s.err), 6000), (await look(C)).err);

await browser.close();
console.log(failed ? '\nПРОВАЛЕНО проверок: ' + failed : '\nвся сетевая партия прошла чисто');
process.exit(failed ? 1 : 0);
