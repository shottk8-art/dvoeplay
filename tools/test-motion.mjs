import {BASE,launch,wait,reporter} from './netkit.mjs';
const rep=reporter(),browser=await launch();
const names=['dvoeplay','matreshka','magnitniy-boy','memo-duel','dots-boxes','5-bukv','viselica','zahlopni-yaschik','dobble','vzlomshik'];
const measure=page=>page.evaluate(()=>new Promise(resolve=>{
 const mini=document.querySelector('.mini');let changes=0;
 const observer=new MutationObserver(records=>{changes+=records.length;});
 observer.observe(mini,{subtree:true,childList:true,attributes:true,characterData:true});
 setTimeout(()=>{observer.disconnect();resolve(changes);},1250);
}));
try{
 for(const reducedMotion of ['no-preference','reduce']){
  const context=await browser.newContext({viewport:{width:390,height:844},serviceWorkers:'block',reducedMotion});
  const page=await context.newPage();page.on('pageerror',e=>{rep.failed++;console.error('ОШИБКА В СТРАНИЦЕ',e.message);});
  for(const name of names){
   await page.goto(BASE+name+'.html');await wait(650);
   rep.ok(name+' '+reducedMotion+': controller loaded',await page.locator('html.motion-ready').count()===1);
   if(reducedMotion==='reduce'){
    rep.ok(name+': reduced-motion preview is static',await measure(page)===0);
    if(name==='5-bukv'||name==='viselica'){
     rep.ok(name+': static word preview is complete',await page.locator('.mini .mtile').evaluateAll(es=>es.every(e=>e.textContent.trim().length===1)));
    }
   }
   await page.locator('.row[data-mode="2"]').click();await wait(700);
   rep.ok(name+' '+reducedMotion+': hidden preview does no DOM work',await measure(page)===0);
   await page.getByRole('button',{name:'Меню',exact:true}).click();await wait(650);
   rep.ok(name+' '+reducedMotion+': preview returns to menu',await page.locator('#menu').evaluate(e=>e.getBoundingClientRect().left>=-1));
   if(reducedMotion==='reduce')rep.ok(name+': remains static after returning',await measure(page)===0);
  }
  await context.close();
 }
 const context=await browser.newContext({viewport:{width:390,height:844},serviceWorkers:'block'}),page=await context.newPage();
 await page.goto(BASE+'index.html');await wait(650);
 await page.getByRole('button',{name:'Имена игроков',exact:true}).click();await wait(450);
 await page.getByRole('dialog',{name:'Имена игроков',exact:true}).getByRole('button',{name:'Готово',exact:true}).click();
 const closing=await page.locator('#whoSheet').evaluate(e=>({visible:getComputedStyle(e).visibility,hidden:e.getAttribute('aria-hidden'),inert:e.inert}));
 rep.ok('closing dialog is immediately inaccessible',closing.hidden==='true'&&closing.inert);
 rep.ok('closing dialog keeps its exit animation',closing.visible==='visible');
 await wait(500);rep.ok('dialog becomes invisible after its exit',await page.locator('#whoSheet').evaluate(e=>getComputedStyle(e).visibility==='hidden'));
 await page.locator('a.t').first().scrollIntoViewIfNeeded();await wait(500);
 const tile=page.locator('a.t').first(),box=await tile.boundingBox();await page.mouse.move(box.x+box.width/2,box.y+box.height/2);await page.mouse.down();await wait(160);
 const pressed=await tile.evaluate(e=>new DOMMatrix(getComputedStyle(e).transform).a);
 rep.ok('catalog tile reacts to press after intro has finished',pressed<.999,pressed);await page.mouse.move(0,0);await page.mouse.up();
 await page.locator('.app').evaluate(e=>e.scrollTo(0,e.scrollHeight));await wait(400);
 rep.ok('hero is outside the scrolling viewport',await page.locator('.hero').evaluate(e=>e.getBoundingClientRect().bottom<=0));
 rep.ok('offscreen hero animation pauses',await page.locator('.hero').evaluate(e=>e.classList.contains('motion-paused')));
 await context.close();
}finally{await browser.close();}
process.exitCode=rep.done('Движение');
