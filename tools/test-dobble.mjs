/* Два диска: одно совпадение, одно очко за поиск, одинаковый порядок по сети. */
import {BASE,wait,reporter,launch,tab,lobby,until} from './netkit.mjs';
const GAME_URL=BASE+'dobble.html',rep=reporter(),ok=rep.ok;
const state=page=>page.evaluate(()=>{
 const set=id=>[...document.querySelectorAll('#'+id+' .sy')].map(g=>+g.dataset.s).sort((a,b)=>a-b);
 const bottom=set('cBot'),top=set('cTop');
 return{playing:document.getElementById('app').classList.contains('playing'),seat:window.NET?NET.seat:0,
  discs:document.querySelectorAll('#stage .dc').length,central:!!document.getElementById('cMid'),
  bottom,top,key:top.join(',')+'|'+bottom.join(','),match:bottom.filter(s=>top.includes(s)),
  ready:!document.querySelector('#stage .back')&&document.getElementById('stage').dataset.ready==='true',
  scores:[+document.getElementById('numBot').textContent,+document.getElementById('numTop').textContent],
  frozen:[document.getElementById('zBot').classList.contains('frozen'),document.getElementById('zTop').classList.contains('frozen')],
  sheet:document.getElementById('sheet').classList.contains('on'),title:document.getElementById('sheetTitle').textContent,
  progress:document.getElementById('left').textContent,again:document.getElementById('again').textContent};
});
const tap=async(page,card,s,near=false,touch=false)=>{
 const point=await page.evaluate(([card,s,near])=>{
  const g=document.querySelector(card+' .sy[data-s="'+s+'"]'),r=g.querySelector('.hit').getBoundingClientRect(),cr=document.querySelector(card).getBoundingClientRect();
  let x=r.left+r.width/2,y=r.top+r.height/2;
  if(near){const k=+/scale\(([\d.]+)\)/.exec(g.parentNode.getAttribute('transform'))[1],rad=12*k*cr.width/200,dx=x-(cr.left+cr.width/2),dy=y-(cr.top+cr.height/2),len=Math.hypot(dx,dy);x+=dx/len*rad*1.08;y+=dy/len*rad*1.08;}
  return{x,y};
 },[card,s,near]);
 if(touch)await page.touchscreen.tap(point.x,point.y);else await page.mouse.click(point.x,point.y);
};
const ready=page=>until(page,state,s=>s.ready||s.sheet,9000);
const browser=await launch();
try{
 const A=await tab(browser,rep,'A'),B=await tab(browser,rep,'B');
 await A.goto(GAME_URL);await B.goto(GAME_URL);
 await lobby.openFrom(A,'.row[data-mode="3"]');const code=await lobby.create(A);
 await lobby.openFrom(B,'.row[data-mode="3"]');await lobby.join(B,code);
 ok('оба подключились и получили пару',await ready(A)&&await ready(B));
 let a=await state(A),b=await state(B);
 ok('ровно два диска, центрального нет',a.discs===2&&!a.central&&b.discs===2&&!b.central);
 ok('по шесть предметов и ровно одно совпадение',a.bottom.length===6&&a.top.length===6&&a.match.length===1);
 ok('диски одинаковы по сторонам на обоих телефонах',a.bottom.join()===b.top.join()&&a.top.join()===b.bottom.join());
 ok('партия состоит из 29 поисков',a.progress==='Совпадение 1 из 29');
 const old=a.key;
 await Promise.all([tap(A,'#cBot',a.match[0]),tap(B,'#cBot',b.match[0])]);
 ok('первый спор разрешён',await until(A,state,s=>s.scores.reduce((x,y)=>x+y,0)===1,9000));
 await ready(A);await ready(B);await wait(500);
 a=await state(A);b=await state(B);
 ok('одно очко за одновременное нажатие',a.scores[0]+a.scores[1]===1&&b.scores[0]+b.scores[1]===1);
 ok('счёт совпал по игрокам',a.scores.join()===b.scores.slice().reverse().join());
 ok('оба диска сменились',a.key!==old&&a.bottom.join()===b.top.join()&&a.top.join()===b.bottom.join());
 const bad=a.bottom.find(s=>!a.top.includes(s));await tap(A,'#cBot',bad);
 ok('промах штрафует только нажавшего',await until(A,state,s=>s.frozen[0],2000));
 ok('промах не меняет счёт',(await state(A)).scores.join()===a.scores.join());
 await wait(1200);
 for(let n=0;n<32;n++){
  await ready(A);await ready(B);a=await state(A);b=await state(B);if(a.sheet)break;
  const player=n%3?A:B,view=player===A?a:b,total=a.scores[0]+a.scores[1];
  await tap(player,'#cBot',view.match[0]);
  await until(A,state,s=>s.scores[0]+s.scores[1]>total||s.sheet,9000);
  await until(B,state,s=>s.scores[0]+s.scores[1]>total||s.sheet,9000);
 }
 await until(A,state,s=>s.sheet,5000);await until(B,state,s=>s.sheet,5000);a=await state(A);b=await state(B);
 ok('29 совпадений и один итог у обоих',a.sheet&&b.sheet&&a.scores[0]+a.scores[1]===29&&a.scores.join()===b.scores.slice().reverse().join());
 await A.locator('#again').click();ok('ожидание согласия',await until(A,state,s=>/Ждём/.test(s.again),5000));
 await B.locator('#again').click();ok('реванш начинает новую пару',await until(A,state,s=>!s.sheet&&s.scores[0]+s.scores[1]===0,12000));await ready(A);await ready(B);
 a=await state(A);b=await state(B);ok('реванш синхронен',a.bottom.join()===b.top.join()&&a.top.join()===b.bottom.join());
 await B.locator('#toMenuTop').click();ok('выход соперника виден',await until(A,lobby.warned,w=>w.shown&&/вышел/.test(w.text),12000));await A.locator('#toMenuTop').click();
 for(const reducedMotion of ['no-preference','reduce']){
  const context=await browser.newContext({viewport:{width:390,height:844},hasTouch:true,isMobile:true,serviceWorkers:'block',reducedMotion});
  const page=await context.newPage();page.on('pageerror',e=>{rep.failed++;console.error(e.message);});
  await page.addInitScript({path:new URL('./webkit-like.js',import.meta.url).pathname});await page.goto(GAME_URL);await page.locator('.row[data-mode="2"]').click();await ready(page);
  for(const card of ['#cTop','#cBot']){
   const before=await state(page),s=before.match[0];await tap(page,card,s,false,true);await until(page,state,v=>v.scores[0]+v.scores[1]>before.scores[0]+before.scores[1],4000);await ready(page);
  }
  a=await state(page);ok(reducedMotion+': оба игрока могут нажать, включая верхний повёрнутый диск',a.scores.join()==='1,1');
  const bad=a.top.find(s=>!a.bottom.includes(s));await tap(page,'#cTop',bad,true,true);
  ok(reducedMotion+': касание рядом с символом учитывает поворот',await until(page,state,s=>s.frozen[1],2000));
  await wait(1200);a=await state(page);await tap(page,'#cBot',a.match[0],false,true);await wait(100);await page.locator('#restart').click();await wait(700);
  a=await state(page);ok(reducedMotion+': перезапуск отменяет прежнюю смену пары',a.scores.join()==='0,0'&&a.discs===2&&!a.central);
  await context.close();
 }
 for(const mode of [0,1]){
  const page=await tab(browser,rep,'AI');await page.goto(GAME_URL);await page.locator('.row[data-mode="'+mode+'"]').click();await ready(page);
  ok('ИИ '+mode+': находит совпадение двух дисков',await until(page,state,s=>s.scores[1]>0,10000));await page.close();
 }
}finally{await browser.close();}
process.exitCode=rep.done('Доббль: два диска');
