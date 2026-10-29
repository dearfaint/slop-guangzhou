import test from 'node:test';import assert from 'node:assert/strict';import {readFileSync} from 'node:fs';
import {Vector3,Raycaster,MeshStandardMaterial} from 'three/webgpu';
import {buildTrafficGraph,forwardTrafficEdges,hash,lanePosition} from '../src/traffic-model.ts';
import {circulatingTrafficEdges} from '../src/traffic-circulation.ts';
import {UrbanLife} from '../src/urban-life.ts';
import {createTile,disposeTile} from '../src/geometry.ts';
import {FOOT_TOP,ROAD_TOP} from '../src/road-level.ts';
const root=new URL('../public/data/',import.meta.url),read=n=>JSON.parse(readFileSync(new URL(n,root),'utf8')),data=read('manifest.json').tiles.map(t=>read(t.id+'.json'));
const road=(id,p,kind='unclassified')=>({id,p,kind,w:5,bridge:false,tunnel:false});
test('circulating traffic retains loops and prunes both directions of a dead-end spur without deleting source roads',()=>{
 const graph=buildTrafficGraph([road('loop',[[0,0],[50,0],[50,50],[0,50],[0,0]]),road('spur',[[0,0],[-20,0],[-50,0]])]);
 const before=graph.edges.size,allowed=circulatingTrafficEdges(graph);assert.equal(graph.edges.size,before);
 assert.ok([...allowed].every(id=>graph.edges.get(id).roadId==='loop'));assert.equal(allowed.size,8);
});
test('the photographed source road remains mapped but does not generate or receive circulating traffic',()=>{
 const life=new UrbanLife();life.setMap(data);const id='osm/way/737870913/0';assert.ok([...life.roads.edges.values()].some(e=>e.roadId===id));
 assert.ok(life.cars.every(a=>life.roads.edges.get(a.edge).roadId!==id));
 assert.equal(life.cars.length,212);
 const e=[...life.roads.edges.values()].find(e=>e.roadId==='osm/way/544809832/0'&&e.to==='osm/node/6909039285'&&e.permitted);
 const options=forwardTrafficEdges(life.roads,e),seed=Array.from({length:100},(_,i)=>i).find(i=>options[hash(`${i}:${e.to}`)%options.length].roadId===id),d=e.length-1,p=lanePosition(e,d,1.25);
 life.cars=[{edge:e.id,d,speed:2,seed,type:0,pause:0,x:p[0],z:p[1],heading:Math.atan2(e.b[0]-e.a[0],e.b[1]-e.a[1])}];
 for(let i=0;i<600;i++){life.update(.05,i*.05,0,new Vector3(-1174,3,-478));assert.ok(life.cars.every(a=>life.roads.edges.get(a.edge).roadId!==id),'circulating traffic entered the pedestrian-end spur');}
 life.dispose();
});
test('ground road and footway endpoints have closed round surfaces instead of clipped slabs',()=>{
 const mat=new MeshStandardMaterial();
 for(const kind of ['unclassified','footway']){const model=createTile({buildings:[],areas:[],roads:[road('end',[[0,0],[20,0]],kind)]},mat);model.updateMatrixWorld(true);
  try{const hits=new Raycaster(new Vector3(21,3,.5),new Vector3(0,-1,0)).intersectObject(model,true);assert.ok(hits.some(h=>Math.abs(h.point.y-(kind==='footway'?FOOT_TOP:ROAD_TOP))<.001));}
  finally{disposeTile(model);}
 }mat.dispose();
});
