/* Compile the pinned OpenMoji SVG sources into the offline Dobble page. */
import fs from 'node:fs/promises';
import assert from 'node:assert/strict';
const root=new URL('../',import.meta.url);
const manifest=JSON.parse(await fs.readFile(new URL('assets/dobble/manifest.json',root),'utf8'));
assert.equal(manifest.assets.length,31);
const palette={
  '#d22f27':'#EB3D4E','#ea5a47':'#FF626E','#fcea2b':'#FFD53D',
  '#f1b31c':'#F3AE27','#f4aa41':'#FFB53E','#e27022':'#EC8A28',
  '#92d3f5':'#60CDF3','#61b2e4':'#1DAAE0','#b1cc33':'#93D847',
  '#5c9e31':'#49AF4A','#b399c8':'#AF7AEB','#8967aa':'#8352C6'
};
const symbols=[];
for(const asset of manifest.assets){
  const svg=await fs.readFile(new URL('assets/dobble/'+asset.source,root),'utf8');
  assert.ok(!/<script|<foreignObject|\bon\w+\s*=|\bhref\s*=|url\(|<defs/i.test(svg),'self-contained artwork');
  let inner=svg.replace(/^<svg\b[^>]*>/,'').replace(/<\/svg>\s*$/,'')
    .replace(/\s+id="[^"]*"/g,'').replace(/<g\s*\/>/g,'')
    .replace(/stroke="#(?:000000|000)"/gi,'stroke="#202431"')
    .replace(/stroke-width="2"/g,'stroke-width="3"');
  inner=inner.replace(/#[0-9a-f]{6}\b/gi,hex=>palette[hex.toLowerCase()]||hex);
  if(asset.code==='2601')inner=inner.replace(/#d0cfce/gi,'#D6EDFA');
  if(asset.code==='1F441')inner=inner.replace(/#a57939/gi,'#35BCEB');
  if(asset.code==='1F3B5')inner=inner.replace(/#3f3f3f/gi,'#9863DA');
  if(asset.code==='2744')inner=inner.replace(/#202431/g,'#298AC8');
  if(asset.code==='2615')inner=inner.replace(/fill="#fff"/gi,'fill="#FFD28A"');
  const b=asset.bounds,size=Math.max(b.width,b.height);
  assert.ok(size>0&&size<73);
  const scale=22/size,cx=b.x+b.width/2,cy=b.y+b.height/2;
  const transform='translate(12 12) scale('+scale.toFixed(7)+') translate('+(-cx).toFixed(5)+' '+(-cy).toFixed(5)+')';
  symbols.push(['art','<g class="sticker" transform="'+transform+'">'+inner.replace(/\s+/g,' ').trim()+'</g>']);
}
const pageURL=new URL('public/dobble.html',root);
let page=await fs.readFile(pageURL,'utf8');
const pattern=/var SYM=\[[\s\S]*?\n\];(?=\nvar NAMES=)/;
assert.ok(pattern.test(page),'Dobble asset block found');
page=page.replace(pattern,'var SYM=[\n'+symbols.map(s=>'  '+JSON.stringify(s)).join(',\n')+'\n];');
await fs.writeFile(pageURL,page);
const preview='<!doctype html><meta charset="utf-8"><title>Доббль — обновлённые предметы</title><style>body{margin:20px;background:#f2f2f7;font:14px system-ui;display:grid;grid-template-columns:repeat(5,1fr);gap:12px}figure{margin:0;padding:16px;background:white;border-radius:18px;text-align:center}svg{width:88px;height:88px}.sticker{stroke:none}figcaption{margin-top:8px}</style>'+symbols.map((s,id)=>'<figure><svg viewBox="0 0 24 24">'+s[1]+'</svg><figcaption>'+manifest.assets[id].name+'</figcaption></figure>').join('');
await fs.mkdir(new URL('docs/dobble/2026-10-08/art-v2/',root),{recursive:true});
await fs.writeFile(new URL('docs/dobble/2026-10-08/art-v2/symbols.html',root),preview);
console.log('Compiled 31 vector assets; source paths and matching IDs preserved');
