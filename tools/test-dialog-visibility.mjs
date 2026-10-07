import { BASE, reporter, launch } from './netkit.mjs';
const rep = reporter(), browser = await launch();
const context = await browser.newContext({viewport:{width:390,height:844}});
const page = await context.newPage();
page.on('pageerror', error => {rep.failed++;console.error('ОШИБКА В СТРАНИЦЕ',error.message);});
try {
  for (const name of ['index','dvoeplay','matreshka','magnitniy-boy','memo-duel','dots-boxes','5-bukv','viselica','zahlopni-yaschik','dobble','vzlomshik']) {
    await page.goto(BASE+name+'.html');
    const count=await page.getByRole('dialog').count();
    rep.ok(name+': closed dialogs are absent from the accessibility tree',count===0,count);
  }
  await page.goto(BASE+'index.html');
  await page.getByRole('button',{name:'Имена игроков',exact:true}).click();
  rep.ok('opened names dialog remains accessible',await page.getByRole('dialog',{name:'Имена игроков',exact:true}).count()===1);
  await page.getByRole('dialog',{name:'Имена игроков',exact:true}).getByRole('button',{name:'Готово',exact:true}).click();
  rep.ok('closed names dialog disappears again',await page.getByRole('dialog').count()===0);
  await page.goto(BASE+'dvoeplay.html');
  await page.getByRole('button',{name:'По сети На двух телефонах, по коду комнаты',exact:true}).click();
  rep.ok('network lobby remains accessible when opened',await page.getByRole('dialog',{name:'Игра по сети',exact:true}).count()===1);
} finally {await browser.close();}
process.exitCode=rep.done('Dialog accessibility');
