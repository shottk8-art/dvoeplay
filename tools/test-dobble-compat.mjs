/* Старый Доббль с третьей картой не должен подключиться к новой паре дисков. */
import assert from 'node:assert/strict';
import{BASE,launch,lobby,until}from'./netkit.mjs';
const browser=await launch(),ctx=await browser.newContext({serviceWorkers:'block'}),page=await ctx.newPage();
const rooms=[];
const call=async(action,data)=>{const res=await fetch(BASE+'api/'+action,{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify(data)});return{status:res.status,body:await res.json()};};
try{
 for(const game of ['dobble','dobble-two-discs-v1']){const r=await call('create',{game,free:true});assert.equal(r.status,200);rooms.push({code:r.body.code,token:r.body.token});}
 const oldClient=await call('join',{code:rooms[1].code,game:'dobble'});assert.equal(oldClient.status,409);
 await page.goto(BASE+'dobble.html');await lobby.openFrom(page,'.row[data-mode="3"]');await lobby.join(page,rooms[0].code);
 assert.ok(await until(page,lobby.msg,s=>/другую игру/.test(s),7000));
 assert.equal(await page.locator('#app.playing').count(),0);
 console.log('PASS: old and new Dobble clients cannot join incompatible rooms; new-client UI reports the mismatch');
}finally{
 for(const r of rooms)assert.equal((await call('leave',r)).status,200);
 await browser.close();
}
