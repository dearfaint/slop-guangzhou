import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {MeshStandardMaterial} from 'three/webgpu';
import {isGroundRoad,isVisibleRoad} from '../src/road-level.ts';
import {buildTrafficGraph,chooseNext,vehicleLaneOffset,lanePosition} from '../src/traffic-model.ts';
import {createTile,disposeTile} from '../src/geometry.ts';
import {createStreetLayout} from '../src/street-layout.ts';
import {createRoadLayout} from '../src/road-layout.ts';
const road=(id,extra={})=>({id,p:[[0,0],[100,0]],w:9.6,kind:'secondary',name:'',bridge:false,tunnel:false,...extra});
const tile=roads=>({roads,buildings:[],areas:[]});
const read=path=>JSON.parse(readFileSync(new URL(path,import.meta.url),'utf8'));
test('negative-layer and indoor roads do not leak into ground meshes, traffic, paint or lamps',()=>{
 for(const extra of [{layer:-1},{layer:-2},{indoor:true},{tunnel:true},{kind:'construction'}]){
  const r=road('underground',extra),data=tile([r]);
  assert.equal(isGroundRoad(r),false);assert.equal(isVisibleRoad(r),false);
  const material=new MeshStandardMaterial(),group=createTile(data,material);
  assert.equal(group.children.length,0);disposeTile(group);material.dispose();
  assert.equal(buildTrafficGraph([r]).edges.size,0);assert.equal(createRoadLayout([data]).paint.length,0);
  assert.equal(createStreetLayout([data]).lamps.length,0);
 }
 assert.equal(isVisibleRoad(road('bridge',{bridge:true,layer:1})),true);
});
test('one-way and reverse one-way use only permitted travel arms and stay inside a lane',()=>{
 for(const oneway of [1,-1]){
  const graph=buildTrafficGraph([road('r',{oneway})]),allowed=[...graph.edges.values()].filter(e=>e.permitted);
  assert.equal(allowed.length,1);const e=allowed[0];assert.equal(e.a[0],oneway===1?0:100);
  assert.ok(chooseNext(graph,e,0).permitted);
  const offset=vehicleLaneOffset(e.width,oneway);assert.ok(Math.abs(offset-3.2)<.001);
  assert.ok(Math.abs(lanePosition(e,50,offset)[1])<e.width/2);
 }
 const graph=buildTrafficGraph([road('approach'),road('wrong',{p:[[100,50],[100,0]],oneway:1}),road('exit',{p:[[100,0],[200,0]],oneway:1})]);
 const e=[...graph.edges.values()].find(e=>e.roadId==='approach'&&e.b[0]===100);
 for(let i=0;i<10;i++)assert.equal(chooseNext(graph,e,i).roadId,'exit');
});
test('runtime data preserves OSM direction, grade and named core tunnels',()=>{
 const manifest=read('../public/data/manifest.json'),roads=manifest.tiles.flatMap(t=>read('../public/data/'+t.id+'.json').roads);
 const raw=new Map(read('../data/raw/osm.json').elements.map(e=>['osm/'+e.type+'/'+e.id,e]));
 for(const r of roads){
  const source=raw.get(r.id.replace(/\/\d+$/,'')),tags=source.tags;
  assert.equal(r.layer,Number(tags.layer??0),r.id);
  assert.equal(r.tunnel,!!tags.tunnel&&!['no','false','0'].includes(tags.tunnel),r.id);
  if(tags.oneway==='yes')assert.equal(r.oneway,1,r.id);
  if(parseFloat(tags.lanes)>0&&!tags.width)assert.equal(r.w,Math.round(Math.min(35,Math.max(1,parseFloat(tags.lanes)*3.2))*10)/10,r.id);
  assert.ok(r.widthSource,r.id);
 }
 for(const name of ['金穗路隧道','CBD隧道','新中轴隧道','花城大道隧道']){
  const found=roads.filter(r=>r.name===name);assert.ok(found.length>=2,name);assert.ok(found.filter(r=>r.tunnel).length>=2,name);assert.ok(found.filter(r=>r.tunnel).every(r=>!isVisibleRoad(r)),name);
 }
 // This underground parking aisle lacks tunnel=yes in the source.
 assert.ok(!isVisibleRoad(roads.find(r=>r.id==='osm/way/1374133779/0')));
 const r=roads.find(r=>r.id==='osm/way/27318112/0');assert.equal(r.oneway,1);assert.equal(r.w,6.5);
});

test('short source segments keep a continuous turn connection',()=>{
 const graph=buildTrafficGraph([road('short',{p:[[0,0],[.8,0],[20,0]],oneway:1})]);
 const start=[...graph.edges.values()].find(e=>e.a[0]===0&&e.permitted);
 assert.ok(start);const next=chooseNext(graph,start,0);assert.equal(next.a[0],.8);assert.equal(next.b[0],20);
});
