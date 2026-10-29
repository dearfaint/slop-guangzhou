import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {pearlParkData as d} from '../src/pearl-park-data.ts';
import {withPearlPark,parkTile,parkPlaces,parkRoadProfile,pearlParkDeckHeight,pearlParkFloor} from '../src/pearl-park-layout.ts';
import {WalkWorld} from '../src/walk-world.ts';
const root=new URL('../public/data/',import.meta.url),read=n=>JSON.parse(readFileSync(new URL(n,root)));
const city=()=>read('manifest.json').tiles.map(t=>read(t.id+'.json'));
test('park keeps mapped lakes with islands, source routes, gates and named building footprints',()=>{
 assert.ok(d.waters.some(w=>w.name==='快绿湖'&&w.p.length>1));assert.ok(d.waters.some(w=>w.name==='猎德涌'));
 assert.ok(d.roads.length>65);assert.ok(d.buildings.some(b=>b.name==='玉堂春晓'));assert.ok(d.buildings.some(b=>b.name.includes('书屋')));
 assert.equal(d.pois.filter(p=>p.kind==='gate').length,4);assert.ok(d.trees.length<=350);
});
test('park map replacement leaves unrelated city records intact and input untouched',()=>{
 const data=city(),before=JSON.stringify(data),result=withPearlPark(data);assert.equal(JSON.stringify(data),before);assert.equal(result.at(-1),parkTile);
 assert.equal(result[0].buildings.filter(b=>b.p[0][0][0]<0).length,data[0].buildings.filter(b=>b.p[0][0][0]<0).length);
});
test('east gate beyond the old clipping boundary is walkable and lake interior stays blocked',()=>{
 const world=new WalkWorld();world.setMap(withPearlPark(city()));const gate=d.pois.find(p=>p.name==='东门').p;
 assert.ok(gate[0]>1500);assert.equal(world.canStand(...gate,.35),true);
 const lake=d.waters.find(w=>w.name==='快绿湖'),p=lake.p[0][10];
 assert.equal(world.canStand(...p,1),false);
});
test('park bridge floors and northern hill agree with the walk world',()=>{
 const world=new WalkWorld();world.setMap(withPearlPark(city()));
 assert.equal(world.groundHeight(1205,-531),pearlParkFloor(1205,-531));
 for(const r of d.roads.filter(r=>r.bridge)){const p=parkRoadProfile(r),i=Math.floor(p.p.length/2),[x,z]=p.p[i];assert.ok(Math.abs(world.groundHeight(x,z,p.y[i])-pearlParkDeckHeight(x,z))<.01);}
});

test('mapped lake bridge supports continuous crossing instead of walking into the lake',()=>{
 const world=new WalkWorld();world.setMap(withPearlPark(city()));const road=d.roads.find(r=>r.sourceId==='osm/way/442556035'),p=parkRoadProfile(road);let position=p.p[0];
 for(let i=1;i<p.p.length;i++){const next=p.p[i];position=world.move(position,next[0]-position[0],next[1]-position[1],world.groundHeight(...position),.35);assert.ok(Math.hypot(position[0]-next[0],position[1]-next[1])<.15);}
});

test('park model uses finite merged geometry and bounded materials while preserving map data',async()=>{
 const {PearlPark}=await import('../src/pearl-park.ts');const model=new PearlPark();let triangles=0;
 try{assert.ok(model.root.children.filter(o=>o.isMesh).length<=14);model.root.traverse(o=>{if(!o.isMesh)return;for(const key of ['position','normal'])assert.ok(o.geometry.attributes[key].array.every(Number.isFinite));triangles+=(o.geometry.index?.count??o.geometry.attributes.position.count)/3;});assert.ok(triangles<500000,'shared source trees and merged park detail stay within budget');}
 finally{model.dispose();}
});


test('all new park teleport destinations remain on safe ground for the default car',()=>{
 const world=new WalkWorld();world.setMap(withPearlPark(city()));
 for(const p of parkPlaces){const x=(p.lon-113.322)*Math.PI/180*6378137*Math.cos(23.119*Math.PI/180),z=-(p.lat-23.119)*Math.PI/180*6378137;assert.equal(world.canStand(x,z,1.2),true,p.name);}
});

test('solid hilltop building blocks walking while open pavilion ground stays accessible',()=>{
 const world=new WalkWorld();world.setMap(withPearlPark(city()));
 const b=d.buildings.find(b=>b.style==='baozhu'),p=b.p[0].slice(0,-1),center=p.reduce((c,v)=>[c[0]+v[0]/p.length,c[1]+v[1]/p.length],[0,0]);
 assert.equal(world.canStand(...center,.35),false,'an elevated foundation must not disable wall collision');
 const open=d.buildings.find(b=>b.style==='yutang'),q=open.p[0].slice(0,-1),c=q.reduce((p,v)=>[p[0]+v[0]/q.length,p[1]+v[1]/q.length],[0,0]);assert.equal(world.canStand(...c,.35),true);
});
