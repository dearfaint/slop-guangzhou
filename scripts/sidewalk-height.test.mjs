import test from 'node:test';import assert from 'node:assert/strict';import {readFileSync} from 'node:fs';
import {Vector3} from 'three/webgpu';import {buildTrafficGraph} from '../src/traffic-model.ts';import {bridgeRoadProfile} from '../src/road-level.ts';import {nearestPath} from '../src/south-axis-layout.ts';import {SlopCrowd} from '../src/slop-people.ts';
import {FOOT_TOP} from '../src/road-level.ts';
const read=n=>JSON.parse(readFileSync(new URL('../public/data/'+n+'.json',import.meta.url))),data=read('manifest').tiles.map(t=>read(t.id)),roads=[...new Map(data.flatMap(t=>t.roads).map(r=>[r.id,r])).values()];
test('pedestrian graph includes the rendered bridge and follows its surface elevation',()=>{
 const r=roads.find(r=>r.id==='osm/way/529182857/0'),profile=bridgeRoadProfile(r,.28),g=buildTrafficGraph(roads,true);
 const edges=[...g.edges.values()].filter(e=>e.roadId===r.id);assert.ok(edges.length>0,'bridge must not be removed from walking network');
 for(const e of edges)for(const [p,y] of [[e.a,e.yA],[e.b,e.yB]])assert.ok(Math.abs(y-nearestPath(...p,profile.p,profile.y).y)<.08);
});
test('crowd feet follow the route elevation instead of always using terrain height',()=>{
 const crowd=new SlopCrowd(),p={x:635,z:114,y:5.8,heading:0,speed:0,seed:13};
 try{crowd.update([p],new Vector3(635,9,114),.016);const rig=crowd.getRig(p);assert.ok(rig.pelvisY>6.3,`pelvis at ${rig.pelvisY} is buried in bridge`);}finally{crowd.dispose();}
});
test('Liede elevated sidewalk follows the adjacent bridge rather than a separate arch',()=>{
 const r=roads.find(r=>r.id==='osm/way/1158342328/0'),road=roads.find(r=>r.id==='osm/way/698854094/0'),sidewalk=bridgeRoadProfile(r,.28),motor=bridgeRoadProfile(road);
 for(let i=0;i<sidewalk.p.length;i++){
  const [x,z]=sidewalk.p[i];if(z<12||z>78)continue;
  const y=nearestPath(x,z,motor.p,motor.y).y;
  assert.ok(Math.abs(sidewalk.y[i]-y)<.25,`sidewalk ${sidewalk.y[i]} separates from road ${y} at ${x},${z}`);
 }
});

import {bridgeDetails} from '../src/bridges.ts';
test('overlapping Liede connector ribbons do not paint extra diagonal lane grids',()=>{
 for(const id of ['440769426','440769428']){
  const r=roads.find(r=>r.id===`osm/way/${id}/0`),model=bridgeDetails(r,bridgeRoadProfile(r));
  try{assert.equal(model.children.filter(m=>m.material.color.getHexString()==='e0dfce').length,0);}finally{model.traverse(m=>m.geometry?.dispose());}
 }
 const r=roads.find(r=>r.id==='osm/way/686143527/0'),model=bridgeDetails(r,bridgeRoadProfile(r));
 try{assert.ok(model.children.some(m=>m.material.color.getHexString()==='e0dfce'));}finally{model.traverse(m=>m.geometry?.dispose());}
});

import {createTile,disposeTile} from '../src/geometry.ts';import {Raycaster,MeshStandardMaterial} from 'three/webgpu';
test('separate footway ribbons meet without an open wedge at a shared corner',()=>{
 const road=(id,p)=>({id,p,w:2.6,kind:'footway',bridge:false,tunnel:false}),m=new MeshStandardMaterial(),model=createTile({roads:[road('west',[[-20,0],[0,0]]),road('north',[[0,0],[0,20]])],buildings:[],areas:[]},m);
 try{model.updateMatrixWorld(true);const ray=new Raycaster(new Vector3(.7,2,-.7),new Vector3(0,-1,0));assert.ok(ray.intersectObject(model,true).some(h=>Math.abs(h.point.y-FOOT_TOP)<.01),'outer corner must be paved');}finally{disposeTile(model);m.dispose();}
});

import {UrbanLife} from '../src/urban-life.ts';
test('crowd population uses short sampled walkway edges, including bridge sidewalks',()=>{
 const life=new UrbanLife();life.setMap(data);life.updatePopulation(new Vector3(635,4,114));
 try{const bridgeIds=new Set(roads.filter(r=>r.bridge&&r.kind==='footway').map(r=>r.id));assert.ok(life.people.some(p=>bridgeIds.has(life.walks.edges.get(p.edge).roadId)),'sampled bridge paths must remain eligible for people');life.update(.05,0,0,new Vector3(635,8,114));assert.ok(life.people.every(p=>Number.isFinite(p.y)));}finally{life.dispose();}
});

test('ground walkers do not enter the solid low bridge deck at the screenshot crossing',()=>{
 const g=buildTrafficGraph(roads,true),motor=roads.filter(r=>['440769426','440769428','686143525','686143527'].some(id=>r.id===`osm/way/${id}/0`)).map(r=>({r,profile:bridgeRoadProfile(r)}));
 for(const e of g.edges.values())if(e.roadId==='osm/way/1080777399/0'){
  const p=[(e.a[0]+e.b[0])/2,(e.a[1]+e.b[1])/2];
  for(const {r,profile} of motor){const q=nearestPath(...p,profile.p,profile.y);assert.ok(!(q.distance<r.w/2+.3&&q.y>.5&&q.y<3.1),'ground route intersects bridge approach');}
 }
});
