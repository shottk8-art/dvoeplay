/* Секретная десятая игра. «Взломщик кода» закрыт, пока во всех остальных
   девяти играх не пройден уровень «Сложно»: победа над ИИ, а в «5 буквах»
   и «Виселице» — отгаданное слово. До этого он прячется: ни названия, ни
   картинки на главном экране, в турнир не попадает, прямой заход возвращает
   в каталог. Отметки ставит общий блок памяти DP — здесь он вынимается из
   страницы как есть и вызывается так же, как в конце партии. */
import { BASE, wait, reporter, launch } from './netkit.mjs';

const rep = reporter();
const ok = rep.ok;
const NINE = ['dvoeplay','magnitniy-boy','memo-duel','matreshka','dots-boxes','5-bukv','viselica','zahlopni-yaschik','dobble'];

const browser = await launch({ locked: true });
const ctx = await browser.newContext({ viewport: { width: 390, height: 844 } });
const p = await ctx.newPage();
const errors = [];
p.on('pageerror', e => errors.push(e.message));

/* DP живёт внутри замыкания страницы — берём тот же блок из её исходника */
async function dp(fn, arg){
  return p.evaluate(([f, a]) => {
    const h = document.documentElement.outerHTML;
    const s = h.indexOf('var DP=(function(){'), e = h.indexOf('})();', h.indexOf('return {read:read', s)) + 5;
    const DP = new Function(h.slice(s, e) + ';return DP;')();
    return new Function('DP', 'a', 'return (' + f + ')(DP, a);')(DP, a);
  }, [fn.toString(), arg]);
}
async function home(){ await p.goto(BASE + 'index.html'); await wait(700); }

rep.head('закрыто: игра не раскрывается');
await home();
const bento = await p.innerHTML('#bento');
ok('плитка закрыта', await p.locator('#lockTile').count() === 1);
ok('ни названия, ни картинки игры', !/Взломщик|vzlomshik|art-lock/.test(bento));
ok('на плитке прогресс 0 из 9', /0 из 9/.test(await p.textContent('#lockTile')));
ok('счётчик — «Открыто 9 из 10»', (await p.textContent('#count')) === 'Открыто 9 из 10');
ok('в плашке — тизер «Секрет»', (await p.textContent('#hero .badge')) === 'Секрет');
ok('тизер не называет игру', !/Взломщик/.test(await p.textContent('#hero')));

await p.click('#lockTile'); await wait(450);
ok('плитка открывает шторку «Как открыть»', await p.evaluate(() => document.getElementById('lockSheet').classList.contains('on')));
ok('в шторке девять игр', await p.locator('#lockBody .lrow').count() === 9);
ok('шторка тоже не называет игру', !/Взломщик/.test(await p.textContent('#lockSheet')));
await p.click('#lockClose'); await wait(300);
await p.click('#hero .hero'); await wait(450);
ok('тизер в плашке открывает ту же шторку', await p.evaluate(() => document.getElementById('lockSheet').classList.contains('on')));
await p.keyboard.press('Escape'); await wait(300);

await p.goto(BASE + 'vzlomshik.html'); await wait(500);
ok('прямой заход — обратно в каталог', /index\.html$/.test(p.url()), p.url());
await p.goto(BASE + 'vzlomshik.html?room=12345'); await wait(500);
ok('приглашение в комнату пускает', /vzlomshik\.html/.test(p.url()), p.url());

rep.head('отметки «Сложно»');
await home();
await dp(DP => { DP.save('dvoeplay', { win: 1, mode: 0 }); DP.save('matreshka', { win: 2, mode: 1 }); DP.save('memo-duel', { win: 1, mode: 2 }); });
ok('лёгкий уровень, проигрыш и игра вдвоём не считаются', Object.keys(await dp(DP => DP.hard())).length === 0);
await dp(DP => { DP.save('dvoeplay', { win: 1, mode: 1 }); DP.save('5-bukv', { win: 0, solved: 1, mode: 1 }); });
ok('победа над ИИ и отгаданное слово на «Сложно» — считаются', JSON.stringify(Object.keys(await dp(DP => DP.hard())).sort()) === '["5-bukv","dvoeplay"]');
await home();
ok('на плитке 2 из 9', /2 из 9/.test(await p.textContent('#lockTile')));
await dp(DP => DP.clear());
ok('сброс статистики отметки не стирает', Object.keys(await dp(DP => DP.hard())).length === 2);

rep.head('открыто');
await dp((DP, ids) => ids.forEach(id => DP.save(id, { win: 1, mode: 1 })), NINE);
await home();
ok('закрытой плитки больше нет', await p.locator('#lockTile').count() === 0);
ok('счётчик — «Все десять»', (await p.textContent('#count')) === 'Все десять');
ok('в плашке — «Открыто» и настоящее название', (await p.textContent('#hero .badge')) === 'Открыто' && /Взломщик кода/.test(await p.textContent('#hero h3')));
ok('ссылка ведёт в игру', await p.locator('a[href="vzlomshik.html"]').count() >= 1);
await p.goto(BASE + 'vzlomshik.html'); await wait(500);
ok('прямой заход теперь пускает', /vzlomshik\.html$/.test(p.url()), p.url());

ok('ошибок на страницах нет', errors.length === 0, errors);
await browser.close();
process.exit(rep.done('Секретная игра'));
