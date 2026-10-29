import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {MeshStandardMaterial,Raycaster,Vector3,Box3} from 'three/webgpu';
import {createTile,disposeTile,roadStrip} from '../src/geometry.ts';
import {bridgeDetails} from '../src/bridges.ts';
import {bridgeRoadProfile,isVisibleRoad} from '../src/road-level.ts';
import {islandRoadReplaced,haixinDeckHeight} from '../src/haixinsha-layout.ts';
import {Haixinsha} from '../src/haixinsha.ts';
import {haixinshaData} from '../src/haixinsha-data.ts';
const read=p=>JSON.parse(readFileSync(new URL(p,import.meta.url),'utf8'));
const tiles=read('../public/data/manifest.json').tiles.map(t=>read('../public/data/'+t.id+'.json'));
const roads=[...new Map(tiles.flatMap(t=>t.roads).map(r=>[r.id,r])).values()];
const ray=new Raycaster();
const cast=(root,from,direction,distance)=>{root.updateMatrixWorld(true);ray.set(new Vector3(...from),new Vector3(...direction));ray.far=distance;return ray.intersectObject(root,true);};
const dispose=root=>root.traverse(o=>o.geometry?.dispose());

test('ordinary roads are solid down to terrain, including curved seams and end faces',()=>{
 const geometry=roadStrip([[0,0],[10,0],[10,10]],6,.35,-.2),root=createTile({buildings:[],areas:[],roads:[{id:'solid',p:[[0,0],[10,0]],w:6,kind:'residential',bridge:false,tunnel:false}]},new MeshStandardMaterial());
 try{
  assert.ok(geometry.attributes.position.count>12);
  for(const [from,dir] of [[[5,0,5],[0,0,-1]],[[5,0,-5],[0,0,1]],[[-2,0,0],[1,0,0]],[[12,0,0],[-1,0,0]]])assert.ok(cast(root,from,dir,6).length,'side/end must close the old air gap');
  assert.ok([...geometry.attributes.position.array].every(Number.isFinite));
 }finally{geometry.dispose();disposeTile(root);}
});

test('all mapped bridge surfaces and details remain finite, with open centreline entries',()=>{
 let checked=0;
 for(const r of roads.filter(r=>r.bridge&&isVisibleRoad(r)&&!islandRoadReplaced(r.p,r.bridge))){
  const profile=bridgeRoadProfile(r,/^(footway|path|pedestrian|steps|cycleway)$/.test(r.kind)?.28:.35),root=bridgeDetails(r,profile);
  try{
   root.traverse(o=>{if(o.geometry)assert.ok([...o.geometry.attributes.position.array].every(Number.isFinite),r.id);});
   for(const end of [0,profile.p.length-1]){
    const neighbor=end===0?1:end-1,a=profile.p[end],b=profile.p[neighbor],dx=b[0]-a[0],dz=b[1]-a[1],l=Math.hypot(dx,dz)||1;
    const direction=new Vector3(dx,profile.y[neighbor]-profile.y[end],dz),distance=Math.min(direction.length(),1);direction.normalize();
    assert.equal(cast(root,[a[0],profile.y[end]+.7,a[1]],direction.toArray(),distance).length,0,`${r.id} entry remains clear`);
   }
   checked++;
  }finally{dispose(root);}
 }
 assert.ok(checked>100);
});

test('connected generic bridge source nodes have matching deck heights across map partitions',()=>{
 const joints=new Map();
 for(const r of roads.filter(r=>r.bridge&&isVisibleRoad(r)&&!islandRoadReplaced(r.p,r.bridge))){
  const profile=bridgeRoadProfile(r,/^(footway|path|pedestrian|steps|cycleway)$/.test(r.kind)?.28:.35);
  for(const point of r.p){const i=profile.p.findIndex(p=>Math.hypot(p[0]-point[0],p[1]-point[1])<1e-5);if(i<0){assert.ok(profile.p.some(p=>Math.hypot(p[0]-point[0],p[1]-point[1])<1.5),`${r.id} moved an endpoint too far`);continue;}const p=profile.p[i],key=p.map(v=>Math.round(v*2)).join(','),list=joints.get(key)??[];list.push({id:r.id,y:profile.y[i]});joints.set(key,list);}
 }
 for(const [key,list] of joints)if(list.length>1)assert.ok(Math.max(...list.map(p=>p.y))-Math.min(...list.map(p=>p.y))<.08,`${key}: ${JSON.stringify(list)}`);
});

test('Liede has a shell tower with an open upper eye, a clear carriageway and a bounded landmark height',()=>{
 const road=roads.find(r=>r.id==='osm/way/233809684/0'),root=bridgeDetails(road,bridgeRoadProfile(road));
 try{
  assert.equal(cast(root,[667,115,680],[0,0,-1],30).length,0,'upper eye is open');
  assert.ok(cast(root,[684,65,680],[0,0,-1],30).length>0,'shell has a broad solid face');
  assert.equal(cast(root,[661,6,650],[0,0,1],30).length,0,'traffic passes below the arch');
  const bounds=new Box3().setFromObject(root);assert.ok(bounds.max.y>132&&bounds.max.y<135);
 }finally{dispose(root);}
});

test('Haixin curved deck matches walking height at every source centreline segment',()=>{
 const model=new Haixinsha();
 try{const p=haixinshaData.haixin.path;
  for(let i=1;i<p.length;i++){
   const x=(p[i-1][0]+p[i][0])/2,z=(p[i-1][1]+p[i][1])/2,y=haixinDeckHeight(z,x);
   const floors=cast(model.root,[x,y+.35,z],[0,-1,0],1).filter(h=>Math.abs(h.face.normal.y)>.8);
   assert.ok(floors.some(h=>Math.abs(h.point.y-y)<.06),`deck mismatch at ${x},${z}: ${floors.map(h=>h.point.y)}`);
  }
 }finally{model.dispose();}
});


test('bridge merge and exit corridors leave full car clearance through adjoining roads',()=>{
 const key=p=>p.map(v=>Math.round(v*2)).join(',');let hits=[];
for(const r of roads.filter(r=>r.bridge&&isVisibleRoad(r)&&/^(trunk|primary|secondary|tertiary|residential|unclassified|service)(_link)?$/.test(r.kind))){const model=createTile({roads:[r],buildings:[],areas:[]},new MeshStandardMaterial());model.updateMatrixWorld(true);
 for(const other of roads.filter(o=>o.id!==r.id&&isVisibleRoad(o)&&/^(trunk|primary|secondary|tertiary|residential|unclassified|service)(_link)?$/.test(o.kind)&&o.p.some(p=>r.p.some(q=>key(p)===key(q))))){const profile=other.bridge?bridgeRoadProfile(other):{p:other.p,y:other.p.map(()=>.35)};
 for(let i=1;i<profile.p.length;i++){const a=profile.p[i-1],b=profile.p[i],d=new Vector3(b[0]-a[0],profile.y[i]-profile.y[i-1],b[1]-a[1]),len=d.length();if(!len)continue;d.divideScalar(len);
 for(const offset of [-1.2,0,1.2]){ray.set(new Vector3(a[0]-d.z*offset,profile.y[i-1]+.7,a[1]+d.x*offset),d);ray.far=len;const h=ray.intersectObject(model,true)[0];if(h)hits.push({r:r.id,other:other.id,at:h.point.toArray()});}}
 }model.traverse(o=>o.geometry?.dispose());}
 assert.equal(hits.length,0,JSON.stringify(hits.slice(0,10)));
});
