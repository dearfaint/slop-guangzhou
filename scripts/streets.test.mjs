import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { Vector3 } from 'three/webgpu';
import { createStreetLayout, insidePolygon, segmentDistance } from '../src/street-layout.ts';
import { Streets } from '../src/streets.ts';
const square=(x,z,r)=>[[x-r,z-r],[x+r,z-r],[x+r,z+r],[x-r,z+r],[x-r,z-r]];
const fixture={buildings:[{id:'building',p:[square(-40,0,13)],h:10,base:0,hs:'estimate',kind:'',name:'',source:'fixture'}],roads:[{id:'foot',p:[[-130,35],[130,35]],w:4,kind:'footway',name:'',bridge:false,tunnel:false}],areas:[{kind:'park',name:'fixture park',p:[square(0,0,140),square(40,-30,15)]},{kind:'water',name:'pond',p:[square(60,80,20)]}],treeRows:[{id:'mapped-tree-row',p:[[-120,-80],[120,-80]],spacing:12,height:7,source:'OSM',heightSource:'estimate'}]};
test('polygon sampler rejects holes and respects non-convex outlines',()=>{
 assert.equal(insidePolygon([0,0],[square(0,0,100),square(0,0,20)]),false);
 assert.equal(insidePolygon([50,0],[square(0,0,100),square(0,0,20)]),true);
 const concave=[[0,0],[40,0],[40,10],[10,10],[10,40],[0,40]];
 assert.equal(insidePolygon([20,20],[concave]),false);
 assert.equal(insidePolygon([5,30],[concave]),true);
});
test('planting stays inside source parks and avoids buildings, ponds, paths and mapped tree rows',()=>{
 const layout=createStreetLayout([fixture]);assert.ok(layout.trees.length>0);
 for(const p of [...layout.trees,...layout.palms]){
  const point=[p.x,p.z];
  assert.ok(insidePolygon(point,fixture.areas[0].p));
  assert.equal(insidePolygon(point,fixture.buildings[0].p),false);
  assert.equal(insidePolygon(point,fixture.areas[1].p),false);
  assert.ok(segmentDistance(point,...fixture.roads[0].p)>=5);
  assert.ok(segmentDistance(point,...fixture.treeRows[0].p)>=11);
  assert.equal(p.source,'inferred:park');
 }
 for(const p of layout.lamps){assert.equal(p.source,'inferred:roadside');assert.equal(p.reference,'foot');assert.ok(Math.abs(p.z-35)>4);}
});
const root=new URL('../public/data/',import.meta.url);
const read=name=>JSON.parse(readFileSync(new URL(name,root),'utf8'));
const tiles=read('manifest.json').tiles.map(t=>read(t.id+'.json'));
test('real city layout is deterministic, duplicate-safe and within planting / lighting budgets',()=>{
 const a=createStreetLayout(tiles),b=createStreetLayout([...tiles].reverse());
 assert.deepEqual(a,b);assert.deepEqual(createStreetLayout([fixture,fixture]),createStreetLayout([fixture]));
 assert.ok(a.trees.length+a.palms.length>=300&&a.trees.length+a.palms.length<=800);
 assert.ok(a.lamps.length>=400&&a.lamps.length<=4000);
 assert.ok(a.planters.length<=40);
 assert.ok([...a.trees,...a.palms].some(p=>p.x>-600&&p.x<100&&p.z>-600&&p.z<300),'core square receives planting');
});
test('street scene uses bounded shared batches, emissive lamps and distance culling',()=>{
 const streets=new Streets();streets.setMap(tiles);const stats=streets.getStats();
 assert.ok(stats.batches<2400);assert.equal(streets.root.children.length,stats.batches);
 for(const mesh of streets.root.children){assert.ok(mesh.isInstancedMesh);assert.ok(mesh.geometry.getAttribute('position').array.every(Number.isFinite));}
 streets.update(1,new Vector3(-300,2,0));
 assert.ok(streets.root.children.filter(m=>m.visible&&m.count>0).length<400,'nearby draw budget');
 const bulbs=streets.root.children.filter(m=>m.material.emissiveIntensity>1);assert.equal(bulbs.length,1);
 streets.update(0,new Vector3(10000,10,10000));assert.ok(streets.root.children.every(m=>m.count===0));assert.equal(bulbs[0].material.emissiveIntensity,0);
 streets.setMap([]);assert.equal(streets.root.children.length,0);assert.equal(streets.getStats().trees,0);streets.dispose();
});
