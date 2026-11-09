/* Шторки тянутся вниз за язычок (motion.js) и долгое нажатие ничего не
   выделяет (motion.css). Касание имитируется настоящими touch-событиями —
   так, как палец на iPhone; мышью — как на компьютере. */
import { BASE, wait, reporter, launch } from './netkit.mjs';

const rep = reporter();
const ok = rep.ok;
const browser = await launch();
const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true });
const p = await ctx.newPage();
const errors = [];
p.on('pageerror', e => errors.push(e.message));

const isOn = (id) => p.evaluate(i => document.getElementById(i).classList.contains('on'), id);
/* палец: touchstart на язычке, серия touchmove вниз, touchend */
async function swipe(sel, dy, steps = 6){
  return p.evaluate(([s, d, n]) => {
    const g = document.querySelector(s), r = g.getBoundingClientRect();
    const x = r.left + r.width / 2, y0 = r.top + r.height / 2;
    const touch = (y) => new Touch({ identifier: 1, target: g, clientX: x, clientY: y });
    const fire = (type, y, list) => g.dispatchEvent(new TouchEvent(type, { bubbles: true, cancelable: true,
      touches: list ? [touch(y)] : [], changedTouches: [touch(y)] }));
    fire('touchstart', y0, true);
    let prevented = false;
    for (let i = 1; i <= n; i++){
      const ev = new TouchEvent('touchmove', { bubbles: true, cancelable: true, touches: [touch(y0 + d * i / n)], changedTouches: [touch(y0 + d * i / n)] });
      g.dispatchEvent(ev); if (ev.defaultPrevented) prevented = true;
    }
    const moved = getComputedStyle(g.closest('.sheet,.np-sheet')).transform;
    fire('touchend', y0 + d, false);
    return { prevented, moved };
  }, [sel, dy, steps]);
}

rep.head('шторка каталога');
await p.goto(BASE + 'index.html'); await wait(700);
await p.click('#statBtn'); await wait(500);
ok('статистика открылась', await isOn('sheet'));
let r = await swipe('#sheet .grab', 20);   /* меньше порога смахивания (24 px): синтетические касания идут в одну миллисекунду */
await wait(500);
ok('тянется за пальцем', r.moved !== 'none', r.moved);
ok('страница под шторкой не прокручивается', r.prevented);
ok('чуть потянули — вернулась на место', await isOn('sheet'));
r = await swipe('#sheet .grab', 200);
await wait(600);
ok('потянули вниз — закрылась', !(await isOn('sheet')));
ok('затемнение тоже ушло', !(await p.evaluate(() => document.getElementById('backdrop').classList.contains('on'))));
ok('после закрытия шторка без следов сдвига', await p.evaluate(() => document.getElementById('sheet').style.transform === ''));

rep.head('мышью на компьютере');
await p.click('#whoBtn'); await wait(500);
ok('имена открылись', await isOn('whoSheet'));
const g = await p.locator('#whoSheet .grab').boundingBox();
await p.mouse.move(g.x + g.width / 2, g.y + 2);
await p.mouse.down();
for (let i = 1; i <= 8; i++) await p.mouse.move(g.x + g.width / 2, g.y + 2 + i * 25);
await p.mouse.up(); await wait(600);
ok('смахнули мышью — закрылась', !(await isOn('whoSheet')));

rep.head('долгое нажатие ничего не выделяет');
const sel = await p.evaluate(() => ({
  body: getComputedStyle(document.body).webkitUserSelect || getComputedStyle(document.body).userSelect,
  input: getComputedStyle(document.getElementById('nameMe')).webkitUserSelect || getComputedStyle(document.getElementById('nameMe')).userSelect
}));
ok('текст страницы не выделяется', sel.body === 'none', sel);
ok('в поле имени выделять можно', sel.input !== 'none', sel);
await p.goto(BASE + 'magnitniy-boy.html'); await wait(600);
ok('и в игре тоже', await p.evaluate(() => (getComputedStyle(document.body).webkitUserSelect || getComputedStyle(document.body).userSelect) === 'none'));

rep.head('лобби сетевой игры (net.js)');
await p.goto(BASE + 'dvoeplay.html'); await wait(600);
await p.locator('.row[data-mode="3"]').click();
await p.waitForFunction(() => document.body.classList.contains('np-open'), null, { timeout: 5000 }).catch(() => {});
ok('лобби открылось', await p.evaluate(() => document.body.classList.contains('np-open')));
await swipe('.np-grab', 220); await wait(600);
ok('потянули вниз — лобби закрылось', !(await p.evaluate(() => document.body.classList.contains('np-open'))));

ok('ошибок на страницах нет', errors.length === 0, errors);
await browser.close();
process.exit(rep.done('Шторки и выделение'));
