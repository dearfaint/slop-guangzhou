import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {haixinshaData as data} from '../src/haixinsha-data.ts';
import {Haixinsha} from '../src/haixinsha.ts';
import {minimapDestination} from '../src/minimap-layout.ts';
import {islandBridgeHeight,islandBuildingHeight,hiddenIslandBuildings} from '../src/haixinsha-layout.ts';
import {WalkWorld} from '../src/walk-world.ts';
test('minimap uses actual CSS dimensions and constrains destinations to navigable bounds',()=>{
 assert.deepEqual(minimapDestination(110,110,220,220),[0,0]);
 assert.deepEqual(minimapDestination(55,55,110,110),[0,0]);
 assert.deepEqual(minimapDestination(0,0,220,220),[-1660,-1500]);
 assert.deepEqual(minimapDestination(220,220,220,220),[1650,1760]);
 assert.deepEqual(minimapDestination(110,143,220,220),[0,594]);
});
test('island bridge polygons preserve source footprints rather than arbitrary connecting lines',()=>{
 const raw=JSON.parse(readFileSync(new URL('../data/raw/osm.json',import.meta.url),'utf8'));
 for(const b of [...data.bridges,data.haixin]){
  const original=raw.elements.find(e=>e.id===b.id).geometry;
  assert.equal(original.length,b.p[0].length);
  original.forEach((p,i)=>{const x=(p.lon-113.322)*Math.PI/180*6378137*Math.cos(23.119*Math.PI/180),z=-(p.lat-23.119)*Math.PI/180*6378137;assert.ok(Math.hypot(x-b.p[0][i][0],z-b.p[0][i][1])<.001);});
 }
});
test('replacement bridge deck remains walkable over source water and hotel roof heights match collision',()=>{
 const world=new WalkWorld();world.setMap([{buildings:[],roads:[],areas:[{kind:'water',name:'river',p:[[[-100,300],[0,300],[0,500],[-100,500],[-100,300]]]}]}]);
 assert.deepEqual(world.spawn([-53,400]),[-53,400]);assert.equal(world.canStand(-53,400),true);assert.equal(world.groundHeight(-53,400),5);assert.equal(world.canStand(-90,400),false);
 assert.equal(islandBridgeHeight(-53,400),5);
 for(const b of data.buildings)assert.equal(islandBuildingHeight(b.id,18),b.h);
 assert.ok(hiddenIslandBuildings.size>0);
});
test('island detail produces finite merged geometry with bounded draw calls',()=>{
 const model=new Haixinsha();assert.ok(model.root.children.length<=13);let triangles=0;
 for(const mesh of model.root.children){if(!mesh.geometry){mesh.traverse(child=>{if(child.geometry)assert.ok([...child.geometry.attributes.position.array].every(Number.isFinite));});continue;}const p=mesh.geometry.attributes.position;assert.ok([...p.array].every(Number.isFinite));triangles+=p.count/3;mesh.geometry.dispose();mesh.material.dispose();}
 assert.ok(triangles>5000&&triangles<100000);model.dispose();
});

test('photo-corrected performance apron stays free of inferred planting and furniture',async()=>{
 const {createStreetLayout}=await import('../src/street-layout.ts');
 const {performanceApron}=await import('../src/haixinsha-site.ts');
 const {inPolygon}=await import('../src/south-axis-layout.ts');
 const manifest=JSON.parse(readFileSync(new URL('../public/data/manifest.json',import.meta.url),'utf8'));
 const tiles=manifest.tiles.map(t=>JSON.parse(readFileSync(new URL('../public/data/'+t.id+'.json',import.meta.url),'utf8')));
 const layout=createStreetLayout(tiles);
 for(const items of Object.values(layout))for(const item of items)assert.equal(inPolygon(item.x,item.z,performanceApron),false);
 assert.ok(layout.trees.length>0);
});
test('stage pool outlines retain the real mapped water-feature boundaries',()=>{
 const raw=JSON.parse(readFileSync(new URL('../data/raw/osm.json',import.meta.url),'utf8'));
 assert.equal(data.pools.length,2);
 for(const pool of data.pools){
  const source=raw.elements.find(e=>e.id===pool.id);assert.equal(source.tags.natural,'water');assert.equal(source.geometry.length,pool.p[0].length);
  source.geometry.forEach((p,i)=>{const x=(p.lon-113.322)*Math.PI/180*6378137*Math.cos(23.119*Math.PI/180),z=-(p.lat-23.119)*Math.PI/180*6378137;assert.ok(Math.hypot(x-pool.p[0][i][0],z-pool.p[0][i][1])<.001);});
 }
});
test('seating blocks walking while the low backstage platform remains traversable',async()=>{
 const {seatPoint}=await import('../src/haixinsha-site.ts');
 const platform=data.buildings.find(b=>b.kind==='stand'&&b.h===5);
 const world=new WalkWorld();world.setMap([{buildings:[{...platform,base:0,source:'source',hs:'estimate',name:'',kind:'yes'}],roads:[],areas:[]}]);
 assert.equal(world.canStand(...seatPoint(.5,.5)),false);
 assert.equal(world.canStand(-600,510),true);assert.equal(world.groundHeight(-600,510),5);
});
