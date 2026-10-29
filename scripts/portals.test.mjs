import test from 'node:test';import assert from 'node:assert/strict';import {readFileSync} from 'node:fs';
import {Raycaster,Vector3,MeshStandardMaterial,Group} from 'three/webgpu';
import {createTile,disposeTile} from '../src/geometry.ts';
import {createTunnel,tunnelInterior} from '../src/tunnels.ts';
import {tunnelData} from '../src/tunnel-data.ts';
import {southAxisData} from '../src/south-axis-data.ts';
import {SouthAxis} from '../src/south-axis.ts';
import {Forecourts} from '../src/forecourts.ts';
import {Carriageways,FOOT_TOP,ROAD_TOP} from '../src/curb.ts';
import {withPearlPark} from '../src/pearl-park-layout.ts';

const read=p=>JSON.parse(readFileSync(new URL('../public/data/'+p,import.meta.url))),manifest=read('manifest.json'),tiles=manifest.tiles.map(t=>read(t.id+'.json'));
const down=(o,x,z,y=12)=>new Raycaster(new Vector3(x,y,z),new Vector3(0,-1,0)).intersectObject(o,true);
const openRamps=[...tunnelData.routes.filter(r=>!r.covered),...southAxisData.ramps];

test('covered tunnel sections are unlit so mouths read as tunnels, not sunlit road',()=>{
 const covered=createTunnel(tunnelData.routes.find(r=>r.covered)),open=createTunnel(tunnelData.routes.find(r=>!r.covered));
 const mats=g=>new Set(g.children.map(m=>m.material));
 for(const m of Object.values(tunnelInterior))assert.ok(mats(covered).has(m));
 for(const m of Object.values(tunnelInterior))assert.ok(!mats(open).has(m),'open ramps stay sunlit');
 const axis=new SouthAxis();try{assert.ok(axis.root.children.some(m=>Object.values(tunnelInterior).includes(m.material)),'south-axis underground roads');}finally{axis.dispose?.();}
});

test('inferred paving keeps clear of open ramps and the south-axis decks keep clear of roads',()=>{
 const courts=new Forecourts();courts.setMap(withPearlPark(tiles));courts.root.updateMatrixWorld(true);
 try{
  // The first stretch of every ramp is still near grade: paving at sidewalk level must not cover it.
  for(const r of openRamps){const g=r.y[0]>r.y.at(-1)?0:r.p.length-1,k=g?g-1:1,[x,z]=r.p[g],[nx,nz]=r.p[k];
   for(const t of [.3,.6,.9]){const px=x+(nx-x)*t,pz=z+(nz-z)*t;assert.equal(down(courts.root,px,pz).length,0,`paving over ramp ${r.id} at ${px.toFixed(1)},${pz.toFixed(1)}`);}}
 }finally{courts.dispose();}
 // The East K11 sculpture plaza used to be a 22 m disc over the road leaving ramp 27318117.
 const axis=new SouthAxis();axis.root.updateMatrixWorld(true);
 try{const road=tiles.flatMap(t=>t.roads).find(r=>r.id==='osm/way/444149844/0'),curbs=new Carriageways(tiles.flatMap(t=>t.roads));
  const samples=road.p.slice(1).flatMap((b,i)=>[.25,.5,.75].map(t=>[road.p[i][0]+(b[0]-road.p[i][0])*t,road.p[i][1]+(b[1]-road.p[i][1])*t])).filter(([x,z])=>Math.hypot(x+182,z+195)<22);
  assert.ok(samples.length>=2);
  for(const [x,z] of samples){assert.ok(curbs.edge(x,z)<=0,'sample is on the carriageway');assert.ok(down(axis.root,x,z).every(h=>h.point.y<ROAD_TOP),`south-axis surface over road at ${x},${z}`);}}
 finally{axis.dispose?.();}
});

test('twin south-axis ramps are split by a solid median, not a plate tilted between decks',()=>{
 const axis=new SouthAxis();axis.root.updateMatrixWorld(true);
 try{
  // Ramps 2/3 differ by ~1.4 m here; the median top must stand above the higher deck, flat across.
  // Ignore the guard rail standing on the median.
  const surface=(x,z)=>down(axis.root,x,z).find(h=>h.point.y<.6)?.point.y;
  const [x,z]=[-18.38,313.57],top=surface(x,z);
  assert.ok(top>=.091+.25&&top<=.48,`median top ${top}`);
  for(const s of [-1.5,1.5])assert.ok(Math.abs(surface(x+s*.3,z)-top)<.05,'flat median top');
 }finally{axis.dispose?.();}
});

test('kerbs use the whole road network, so sidewalks at tile seams do not stand over a neighbour tile road',()=>{
 // Sidewalk 1374426263 runs along 兴盛直街, which is mapped in the neighbouring tile.
 const tile=tiles.find(t=>t.roads.some(r=>r.id==='osm/way/1374426263/0'));assert.ok(!tile.roads.some(r=>r.id==='osm/way/993462498/0'));
 const m=new MeshStandardMaterial(),shared=new Carriageways(tiles.flatMap(t=>t.roads),tiles.flatMap(t=>t.areas));
 const local=createTile(tile,m),whole=createTile(tile,m,false,shared);local.updateMatrixWorld(true);whole.updateMatrixWorld(true);
 try{
  const y=g=>down(g,204,-550).find(h=>h.object.material.color?.getHexString()==='85887a')?.point.y;
  assert.ok(y(local)>FOOT_TOP-.01,'tile-local index misses the road (documents the seam case)');
  assert.ok(y(whole)<=ROAD_TOP+.011,`sidewalk over the road at ${y(whole)}`);
 }finally{disposeTile(local);disposeTile(whole);m.dispose();}
});

import {nearestPath} from '../src/south-axis-layout.ts';
import {isGroundRoad} from '../src/road-level.ts';
import {tunnelRoutes} from '../src/tunnel-layout.ts';
test('ramps stay at grade until the last at-grade road joining them, without exceeding 7 %',()=>{
 // Service road 1140707305 joins south-axis ramp 27318117; it used to end in mid-air over the cutting.
 const ids=new Set(openRamps.map(r=>r.id)),roads=[...new Map(tiles.flatMap(t=>t.roads).map(r=>[r.id,r])).values()].filter(r=>!ids.has(r.id)&&!tunnelRoutes.has(r.id)&&isGroundRoad(r)&&!['footway','path','steps','pedestrian','cycleway'].includes(r.kind));
 assert.ok(roads.some(r=>r.id==='osm/way/1140707305/0'));
 for(const r of roads)for(const p of [r.p[0],r.p.at(-1)])for(const m of openRamps){const n=nearestPath(p[0],p[1],m.p,m.y);assert.ok(!(n.distance<m.w/2&&n.y<-.15),`${r.id} ends over ${m.id} at deck ${n.y}`);}
 for(const r of southAxisData.ramps)for(let i=1;i<r.p.length;i++)assert.ok(Math.abs(r.y[i]-r.y[i-1])/Math.hypot(r.p[i][0]-r.p[i-1][0],r.p[i][1]-r.p[i-1][1])<.07,r.id);
});
