import { writeFileSync } from 'node:fs';
import { BASE, launch, wait } from './netkit.mjs';
const pages=['index','dvoeplay','matreshka','magnitniy-boy','memo-duel','dots-boxes','5-bukv','viselica','zahlopni-yaschik','dobble','vzlomshik'];
const browser=await launch();
const context=await browser.newContext({viewport:{width:390,height:844},serviceWorkers:'block',reducedMotion:process.env.REDUCED_MOTION?'reduce':'no-preference'});
const page=await context.newPage();
const cdp=await context.newCDPSession(page);await cdp.send('Performance.enable');
const metrics=async()=>Object.fromEntries((await cdp.send('Performance.getMetrics')).metrics.map(m=>[m.name,m.value]));
async function sample(){
 const before=await metrics();
 const observation=await page.evaluate(()=>new Promise(resolve=>{
  const mini=document.querySelector('.mini'),deltas=[];let mutations=0,last,start;
  const observer=new MutationObserver(records=>{mutations+=records.length;});
  if(mini)observer.observe(mini,{subtree:true,childList:true,attributes:true,characterData:true});
  function frame(t){if(start===undefined){start=t;last=t;}else{deltas.push(t-last);last=t;}
   if(t-start<3200){requestAnimationFrame(frame);return;}
   observer.disconnect();const sorted=deltas.slice().sort((a,b)=>a-b);
   const active=document.getAnimations().filter(a=>a.playState==='running');
   const layoutAnimations=active.filter(a=>a.effect.getKeyframes().some(f=>Object.keys(f).some(k=>['left','top','width','height','margin','padding'].includes(k))));
   resolve({frames:deltas.length,p95Ms:sorted[Math.floor(sorted.length*.95)],maxMs:Math.max(...deltas),over33Ms:deltas.filter(v=>v>33.4).length,previewMutations:mutations,activeAnimations:active.length,layoutAnimations:layoutAnimations.length});
  }requestAnimationFrame(frame);
 }));
 const after=await metrics();const diff={};for(const name of ['LayoutCount','RecalcStyleCount','LayoutDuration','RecalcStyleDuration','ScriptDuration','TaskDuration'])diff[name]=after[name]-before[name];
 return {...observation,metrics:diff};
}
const results=[];
try{for(const name of (process.env.MOTION_PAGES?pages.filter(n=>process.env.MOTION_PAGES.split(',').includes(n)):pages)){await page.goto(BASE+name+'.html');await wait(650);const menu=await sample();let playing;
 if(name!=='index'){await page.locator('.row[data-mode="2"]').click();await wait(700);playing=await sample();}
 results.push({page:name,menu,playing});console.log(name,JSON.stringify({menuLayouts:menu.metrics.LayoutCount,menuP95:menu.p95Ms,hiddenPreviewMutations:playing?.previewMutations}));
}}finally{await browser.close();}
writeFileSync(process.env.MOTION_REPORT||'docs/motion/2026-10-07/baseline.json',JSON.stringify({base:BASE,reduced:!!process.env.REDUCED_MOTION,viewport:'390x844',sampleMs:3200,results},null,2)+'\n');
