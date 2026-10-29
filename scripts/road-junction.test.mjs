import {readFileSync} from 'node:fs';
import {UrbanLife} from '../src/urban-life.ts';
import {buildTrafficGraph,forwardTrafficEdges} from '../src/traffic-model.ts';
import test from 'node:test';
import assert from 'node:assert/strict';
import {roadStrip} from '../src/geometry.ts';
import {createRoadLayout} from '../src/road-layout.ts';
import {RoadMarkings} from '../src/road-markings.ts';

test('bent road segments share both seam vertices without wedge gaps',()=>{
 const g=roadStrip([[0,0],[10,0],[10,10]],6,.35),p=g.attributes.position;
 const at=i=>[p.getX(i),p.getY(i),p.getZ(i)];
 assert.deepEqual(at(2),at(7));assert.deepEqual(at(5),at(6));
 assert.ok([...p.array].every(Number.isFinite));
 assert.ok([...g.attributes.normal.array].every((n,i)=>i%3!==1||n>.99));
 g.dispose();
});

const road=p=>({id:'sample',p,w:9.6,oneway:1,kind:'secondary',bridge:false,tunnel:false});
const tile=roads=>({roads,areas:[],buildings:[]});
test('dense OSM vertices retain three metre dashes and five metre gaps',()=>{
 const dense=Array.from({length:65},(_,i)=>[i,0]);
 for(const path of [dense,[...dense].reverse()]){
  const lanes=createRoadLayout([tile([road(path)])]).paint.filter(p=>p.kind==='lane');
  for(const distance of [4,5,6,7,12,13,14,15]){const x=Math.abs(path[0][0]-distance);assert.ok(!lanes.some(p=>Math.abs(p.x-x)<p.length/2-.01));}
  assert.ok(lanes.length>0);
 }
});

test('paint batches carry physical stripe widths and retain depth occlusion',()=>{
 const layer=new RoadMarkings();layer.setMap([tile([road([[0,0],[100,0]])])]);
 for(const mesh of layer.root.children){
  assert.equal(mesh.geometry.attributes.paintWidth.count,mesh.geometry.attributes.position.count);
  assert.ok(mesh.material.opacityNode);assert.equal(mesh.material.depthTest,true);
  assert.equal(mesh.material.depthWrite,false);
 }
 layer.dispose();
});

const read=p=>JSON.parse(readFileSync(new URL(p,import.meta.url),'utf8'));
const actual=read('../public/data/manifest.json').tiles.map(t=>read('../public/data/'+t.id+'.json'));
test('actual approaches connect through underground roads without reversing or teleporting',()=>{
 const life=new UrbanLife();life.setMap(actual);const g=life.roads;
 const inbound=['osm/way/759851919/0','osm/way/624728716/0','osm/way/923953845/0','osm/way/449070492/0'];
 for(const id of inbound){
  const start=[...g.edges.values()].find(e=>e.roadId===id&&e.permitted);
  const a={edge:start.id,d:0,speed:8,seed:1,type:0,pause:0,x:start.a[0],z:start.a[1],heading:0};
  const seen=new Set();let previousY=start.yA;
  for(let i=0;i<7200;i++){
   const before=g.edges.get(a.edge);life.move([a],g,.05,i*.05,false);const after=g.edges.get(a.edge);
   if(before.id!==after.id){assert.equal(before.to,after.from);assert.notEqual(before.from,after.to);}
   assert.ok(Math.abs(a.y-previousY)<.1,'continuous vertical travel');previousY=a.y;seen.add(after.roadId);
  }
  assert.ok([...seen].some(id=>actual.flatMap(t=>t.roads).find(r=>r.id===id)?.tunnel));
  assert.ok(seen.size>3,'car advances beyond the original approach');
  assert.ok(['248282332','248284668','80912591','102596669','27318117'].some(id=>seen.has(`osm/way/${id}/0`)),'car reaches an outbound ramp');
 }
 for(const e of g.edges.values())if(e.permitted&&inbound.includes(e.roadId))assert.ok(forwardTrafficEdges(g,e).length);
 life.dispose();
});
test('a real dead end stops the vehicle before its bumper instead of bouncing it',()=>{
 const life=new UrbanLife(),g=buildTrafficGraph([road([[0,0],[100,0]])]);
 const e=[...g.edges.values()].find(e=>e.permitted),a={edge:e.id,d:80,speed:8,seed:1,type:0,pause:0,x:80,z:0,heading:Math.PI/2};
 for(let i=0;i<1000;i++)life.move([a],g,.05,i*.05,false);
 assert.equal(a.edge,e.id);assert.ok(a.d<98);assert.equal(a.speed,0);assert.ok(a.heading>1.5);
 life.dispose();
});
