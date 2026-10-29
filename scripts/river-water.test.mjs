import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {insidePolygon} from '../src/walk-world.ts';
const root=new URL('../public/data/',import.meta.url);
const manifest=JSON.parse(readFileSync(new URL('manifest.json',root),'utf8'));
const areas=manifest.tiles.flatMap(t=>JSON.parse(readFileSync(new URL(t.id+'.json',root),'utf8')).areas).filter(a=>a.kind==='water');
const water=(x,z)=>areas.some(a=>insidePolygon(x,z,a.p));

test('Pearl River continues east of Liede Bridge without a dry tile gap',()=>{
 for(const x of [950,1050,1199.9,1200.1,1350,1500]){
  for(const z of [650,750,850])assert.ok(water(x,z),`river missing at ${x}, ${z}`);
 }
});
test('river repair keeps both banks dry',()=>{
 for(const [x,z] of [[1100,450],[1350,500],[1100,1250],[1350,1300]])assert.equal(water(x,z),false,`land flooded at ${x}, ${z}`);
});
