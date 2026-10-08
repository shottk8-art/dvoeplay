/* Проверка публикации: только собственная временная комната, без вывода кодов и токенов. */
import assert from 'node:assert/strict';
const base=process.env.DEPLOY_BASE_URL;
if(!base)throw new Error('Set DEPLOY_BASE_URL to the deployment being verified');
const pages=['index','dvoeplay','matreshka','magnitniy-boy','memo-duel','dots-boxes','5-bukv','viselica','zahlopni-yaschik','dobble','vzlomshik'];
for(const page of pages){
 const response=await fetch(new URL(page+'.html',base));assert.equal(response.status,200,page);
 const html=await response.text();assert.ok(html.includes('src="motion.js"')&&html.includes('href="motion.css"'),page+' motion assets');
}
for(const asset of ['motion.js','motion.css','net.js','sw.js']){
 const response=await fetch(new URL(asset,base));assert.equal(response.status,200,asset);
 if(asset==='sw.js')assert.ok((await response.text()).includes('dvoeplay-v9'));
}
console.log('PASS: all 11 pages, shared assets and v9 offline cache');
async function call(action,data){
 const response=await fetch(new URL('api/'+action,base),{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify(data)});
 const body=await response.json();return{status:response.status,body};
}
let first,second;
try{
 const created=await call('create',{game:'dvoeplay',name:'Publication test A'});assert.equal(created.status,200,'create');
 first={code:created.body.code,token:created.body.token};
 const joined=await call('join',{code:first.code,game:'dvoeplay',name:'Publication test B'});assert.equal(joined.status,200,'join');
 second={code:first.code,token:joined.body.token};
 for(let n=1;n<=8;n++){
  const mover=n%2?first:second,other=n%2?second:first;
  const [moved]=await Promise.all([call('move',{...mover,move:n,round:0,next:n%2?2:1,mid:'publication-'+n,since:n}),call('state',{...other,since:0})]);
  assert.equal(moved.status,200,'move '+n);
  assert.equal((await call('state',{...other,since:0})).body.total,n,'move retained '+n);
 }
 assert.equal((await call('result',{...first,winner:99,round:0})).status,400,'invalid winner');
 assert.equal((await call('result',{...first,winner:1,round:0})).status,200,'result');
 assert.equal((await call('again',{...first,round:0})).status,200,'first rematch');
 const rematch=await call('again',{...second,round:0});assert.equal(rematch.body.round,1,'next round');
 assert.equal((await call('result',{...first,winner:2,round:0})).status,409,'stale result');
 assert.equal((await call('again',{...first,round:0})).status,409,'stale rematch');
 const state=(await call('state',first)).body;assert.equal(state.result,null);assert.deepEqual(state.rematch,[false,false]);
 console.log('PASS: real cloud room, competing reads/writes, eight moves, result validation and rematch boundaries');
}finally{
 for(const player of [first,second])if(player)assert.equal((await call('leave',player)).status,200,'test-room cleanup');
 console.log('PASS: temporary test room closed');
}
