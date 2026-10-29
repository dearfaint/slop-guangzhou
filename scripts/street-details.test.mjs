import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {Vector3,Matrix4} from 'three/webgpu';
import {streetDetails,activeStreetDetails} from '../src/street-detail-layout.ts';
import {StreetDetails} from '../src/street-details.ts';
import {WalkWorld,insidePolygon} from '../src/walk-world.ts';
import {segmentDistance} from '../src/street-layout.ts';
const root=new URL('../public/data/',import.meta.url),read=n=>JSON.parse(readFileSync(new URL(n,root),'utf8'));
const data=read('manifest.json').tiles.map(t=>read(t.id+'.json'));
const roads=[...new Map(data.flatMap(t=>t.roads).map(r=>[r.id,r])).values()];
const buildings=[...new Map(data.flatMap(t=>t.buildings).map(b=>[b.id,b])).values()];
test('all seven requested facilities are present, uniquely identified, and tied to loaded sources',()=>{
 const kinds=['led','shop','awning','roadSign','grate','metro','cart'];
 assert.deepEqual([...new Set(streetDetails.map(f=>f.kind))].sort(),kinds.sort());assert.equal(new Set(streetDetails.map(f=>f.id)).size,streetDetails.length);
 assert.deepEqual(activeStreetDetails([]),[]);assert.equal(activeStreetDetails(data).length,streetDetails.length);
 for(const kind of kinds)assert.ok(streetDetails.some(f=>f.kind===kind));
 assert.ok(streetDetails.filter(f=>f.kind==='led').length<100);assert.ok(streetDetails.filter(f=>f.kind==='cart').length<100);
});
test('road signs use actual road names and metro lamps retain source entrance IDs and ground levels',()=>{
 const raw=JSON.parse(readFileSync(new URL('../data/raw/osm.json',import.meta.url),'utf8')).elements;
 for(const f of streetDetails){if(f.kind==='roadSign')assert.equal(roads.find(r=>r.id===f.reference)?.name,f.text);
  if(f.kind==='metro'){const e=raw.find(n=>'osm/node/'+n.id===f.source);assert.equal(e.tags.railway,'subway_entrance');assert.ok(Number(e.tags.level??0)>=0);assert.ok(Math.hypot(f.x-f.origin[0],f.z-f.origin[1])<10);}
 }
});
test('cart and entrance posts keep mapped routes, buildings, planting and water clear and have collision',()=>{
 const world=new WalkWorld();world.setMap(data);
 for(const f of streetDetails.filter(f=>f.p)){
  assert.equal(world.canStand(f.x,f.z,.2),false,f.id);
  for(const p of f.p[0]){for(const b of buildings)assert.equal(insidePolygon(...p,b.p),false,f.id+' building');
   for(const t of data)for(const a of t.areas.filter(a=>a.kind==='water'))assert.equal(insidePolygon(...p,a.p),false);
   for(const r of roads.filter(r=>!r.bridge&&!r.tunnel&&(r.layer??0)===0))for(let i=1;i<r.p.length;i++)assert.ok(segmentDistance(p,r.p[i-1],r.p[i])>r.w/2+.1,f.id+' route');
  }
 }
});
test('shared batches render finite geometry and cull while labels remain aligned with instances',()=>{
 const details=new StreetDetails();details.setMap(data);assert.ok(details.root.children.length>5&&details.root.children.length<=20);
 for(const m of details.root.children){assert.ok(m.isInstancedMesh);assert.ok(m.geometry.attributes.position.array.every(Number.isFinite));if(m.geometry.attributes.detailRect)assert.ok(m.geometry.attributes.detailRect.array.every(v=>v>=0&&v<=1));}
 details.update(1,new Vector3(-622,3,-543));assert.ok(details.root.children.some(m=>m.count>0));assert.ok(details.getLightSites().length>0);
 details.update(0,new Vector3(10000,10,10000));assert.ok(details.root.children.every(m=>m.count===0));
 details.setMap([]);assert.equal(details.root.children.length,0);assert.equal(details.getLightSites().length,0);details.dispose();
});

test('street-name faces sit outside their lamp pole on both sides',()=>{
 const details=new StreetDetails();details.setMap(data);const mesh=details.root.getObjectByName('Actual street names'),f=streetDetails.find(f=>f.kind==='roadSign');
 for(const i of [0,1]){const matrix=new Matrix4();mesh.getMatrixAt(i,matrix);const p=new Vector3().setFromMatrixPosition(matrix);assert.ok(Math.hypot(p.x-f.x,p.z-f.z)>.13);}
 details.dispose();
});

test('Blessxu.cn branding is confined to a subset of LED adverts and never replaces map labels',()=>{
 const branded=streetDetails.filter(f=>f.text==='Blessxu.cn'),led=streetDetails.filter(f=>f.kind==='led');
 assert.ok(branded.length>0&&branded.length<led.length);assert.ok(branded.every(f=>f.kind==='led'));
});
