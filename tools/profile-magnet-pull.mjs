import {writeFileSync} from 'node:fs';
import {BASE,launch,wait} from './netkit.mjs';
const browser=await launch(),context=await browser.newContext({viewport:{width:390,height:844},serviceWorkers:'block'}),page=await context.newPage();
const cdp=await context.newCDPSession(page);await cdp.send('Performance.enable');
const metrics=async()=>Object.fromEntries((await cdp.send('Performance.getMetrics')).metrics.map(x=>[x.name,x.value]));
try{
 await page.goto(BASE+'magnitniy-boy.html');await page.locator('.row[data-mode="2"]').click();await wait(800);
 const box=await page.locator('#well').boundingBox();
 const put=async(x,y)=>{await page.mouse.click(box.x+box.width*x,box.y+box.height*y);};
 await put(.5,.5);await wait(500);
 const before=await metrics();await put(.62,.5);await wait(1700);const after=await metrics();const diff={};
 for(const k of ['LayoutCount','RecalcStyleCount','LayoutDuration','RecalcStyleDuration','TaskDuration'])diff[k]=after[k]-before[k];
 const state=await page.evaluate(()=>({balls:document.querySelectorAll('#well .ball').length,hint:document.getElementById('hint').textContent}));
 writeFileSync(process.env.MOTION_REPORT||'docs/motion/2026-10-07/magnet-before.json',JSON.stringify({metrics:diff,state},null,2)+'\n');console.log(diff,state);
}finally{await browser.close();}
