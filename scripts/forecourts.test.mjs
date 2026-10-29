import {inPearlPark} from '../src/pearl-park-layout.ts';
import {isHaixinshaDetailed} from '../src/haixinsha-layout.ts';
import {operaGroundHeight} from '../src/opera-layout.ts';
import {inSouthAxisPlanting} from '../src/south-axis-layout.ts';
import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {forecourtSites,activeForecourts} from '../src/forecourt-layout.ts';
import {Forecourts} from '../src/forecourts.ts';
import {WalkWorld,insidePolygon} from '../src/walk-world.ts';
import {segmentDistance} from '../src/street-layout.ts';
import {surfacePassages} from '../src/road-level.ts';
const root=new URL('../public/data/',import.meta.url),read=n=>JSON.parse(readFileSync(new URL(n,root),'utf8'));
const data=read('manifest.json').tiles.map(t=>read(t.id+'.json'));
const buildings=[...new Map(data.flatMap(t=>t.buildings).map(b=>[b.id,b])).values()];
const roads=[...new Map(data.flatMap(t=>t.roads).map(r=>[r.id,r])).values()];
test('surface-tagged riverside passages stay free of forecourt paving and planting',()=>{
 for(const r of roads.filter(r=>surfacePassages.has(r.id)))for(let i=1;i<r.p.length;i++){
  const a=r.p[i-1],b=r.p[i],length=Math.hypot(b[0]-a[0],b[1]-a[1]);
  for(let d=0;d<=length;d+=2)for(const side of [-.45,0,.45]){
   const x=a[0]+(b[0]-a[0])*d/length-(b[1]-a[1])/length*r.w*side,z=a[1]+(b[1]-a[1])*d/length+(b[0]-a[0])/length*r.w*side;
   for(const s of forecourtSites)for(const p of [...s.paving,...s.border,...s.beds.map(b=>b.p)])assert.equal(insidePolygon(x,z,p),false,r.id);
  }
 }
});
test('forecourts cover ordinary blocks across the map and follow loaded buildings',()=>{
 assert.ok(forecourtSites.length>30);assert.equal(activeForecourts(data).length,forecourtSites.length);assert.deepEqual(activeForecourts([]),[]);
 for(const site of forecourtSites)assert.ok(buildings.some(b=>b.id===site.building));
 const points=forecourtSites.flatMap(s=>s.paving.flatMap(p=>p[0]));
 for(const [x,z] of [[-1000,-900],[700,-900],[-1000,300],[700,300]])assert.ok(points.some(p=>Math.hypot(p[0]-x,p[1]-z)<750),'coverage in each urban quadrant');
});
test('planting footprints and trees preserve source routes and building access',()=>{
 let count=0;
 for(const site of forecourtSites)for(const bed of site.beds){count++;
  for(const p of [...bed.p[0],[bed.x,bed.z]]){
   for(const b of buildings){assert.equal(insidePolygon(...p,b.p),false);for(const ring of b.p)for(let i=1;i<ring.length;i++)assert.ok(segmentDistance(p,ring[i-1],ring[i])>4,'building entrance apron');}
   for(const r of roads.filter(r=>!r.bridge&&!r.tunnel&&(r.layer??0)===0))for(let i=1;i<r.p.length;i++)assert.ok(segmentDistance(p,r.p[i-1],r.p[i])>r.w/2+1.5,'mapped route clearance');
  }
 }
 assert.ok(count>=30&&count<=2000);
});
test('new planting has collision while the mapped sidewalk remains walkable',()=>{
 const world=new WalkWorld();world.setMap(data);
 for(const site of forecourtSites)for(const bed of site.beds)assert.equal(world.canStand(bed.x,bed.z,.3),false);
 assert.equal(world.canStand(-643,-545,.3),true);
});
test('forecourt rendering has finite geometry, a small draw budget, and clears unloaded sites',()=>{
 const scene=new Forecourts();scene.setMap(data);assert.ok(scene.root.children.length>0&&scene.root.children.length<=8);
 scene.root.traverse(m=>{if(m.geometry)assert.ok(m.geometry.attributes.position.array.every(Number.isFinite));});
 scene.setMap([]);assert.equal(scene.root.children.length,0);scene.dispose();
});

test('ordinary forecourts preserve custom park, island, opera and central-axis sites',()=>{
 for(const site of forecourtSites)for(const polygon of site.paving)for(const p of polygon[0]){
  assert.equal(inPearlPark(...p),false);assert.equal(isHaixinshaDetailed(...p),false);assert.equal(operaGroundHeight(...p),undefined);assert.equal(inSouthAxisPlanting(...p),false);
 }
});
