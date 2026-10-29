import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {MeshStandardMaterial} from 'three/webgpu';
import {createTile,disposeTile} from '../src/geometry.ts';
import {bridgeRoadProfile} from '../src/road-level.ts';
import {nearestPath} from '../src/south-axis-layout.ts';
const read=n=>JSON.parse(readFileSync(new URL('../public/data/'+n+'.json',import.meta.url)));
const tiles=read('manifest').tiles.map(t=>read(t.id));
const roads=[...new Map(tiles.flatMap(t=>t.roads).map(r=>[r.id,r])).values()];
const named=['广州大道珠江新城隧道','黄埔大道隧道','金穗路隧道','CBD隧道','猎德大道-金穗路隧道','花城大道隧道'];
test('six named motor tunnels have modelled underground pavement rather than being discarded',()=>{
 for(const name of named)for(const road of roads.filter(r=>r.name===name&&r.tunnel)){
  const material=new MeshStandardMaterial(),group=createTile({roads:[road],buildings:[],areas:[]},material);
  try{assert.ok(group.children.length>0,`${name} ${road.id} is missing`);let below=false;group.traverse(o=>{const p=o.geometry?.getAttribute('position');if(p)for(let i=0;i<p.count;i++)if(p.getY(i)<-5)below=true;});assert.ok(below,name);}finally{disposeTile(group);material.dispose();}
 }
});
test('multi-level Zhongshan interchange retains distinct source road layers',()=>{
 for(const layer of [2,3,4]){const found=roads.filter(r=>r.bridge&&r.layer===layer);assert.ok(found.length);for(const r of found){const p=bridgeRoadProfile(r);assert.ok(Math.max(...p.y)>=layer*5-.1,`${r.name} layer ${layer} was flattened`);}}
});

const {tunnelData}=await import('../src/tunnel-data.ts');
const {WalkWorld}=await import('../src/walk-world.ts');
const {buildTrafficGraph}=await import('../src/traffic-model.ts');
const {tunnelPassage}=await import('../src/tunnel-layout.ts');
const same=(a,b)=>Math.hypot(a[0]-b[0],a[1]-b[1])<.1;
function trip(tube){
 const rampAt=point=>tunnelData.routes.find(r=>!r.covered&&(same(r.p[0],point)||same(r.p.at(-1),point)));
 const first=rampAt(tube.p[0]),last=rampAt(tube.p.at(-1));
 assert.ok(first&&last,tube.id);
 const a=same(first.p.at(-1),tube.p[0])?first.p:[...first.p].reverse(),b=same(last.p[0],tube.p.at(-1))?last.p:[...last.p].reverse();
 return [...a,...tube.p.slice(1),...b.slice(1)];
}
test('player car follows all twelve source tunnel routes down from the street and back out',()=>{
 const world=new WalkWorld();world.setMap(tiles);
 for(const tube of tunnelData.routes.filter(r=>r.covered)){
  const points=trip(tube);let p=points[0],y=.35,depth=y;
  for(const q of points.slice(1)){
   world.setVehicleHeading(Math.atan2(-(q[0]-p[0]),-(q[1]-p[1])));
   const next=world.move(p,q[0]-p[0],q[1]-p[1],y,2.4);
   assert.ok(same(next,q),`${tube.name} ${tube.id}: ${p} -> ${q} blocked at ${next}, height ${y}`);
   p=next;y=world.groundHeight(...p,y);depth=Math.min(depth,y);
  }
  assert.ok(depth<-5.5,tube.name);assert.ok(Math.abs(y-.35)<.01,tube.name);
 }
});
test('tunnel lanes, traffic heights, walls and surface crossings use separate levels',()=>{
 const graph=buildTrafficGraph(roads,false,true);
 for(const r of tunnelData.routes){
  const edges=[...graph.edges.values()].filter(e=>e.roadId===r.id);assert.ok(edges.length,r.id);
  assert.ok(edges.every(e=>Number.isFinite(e.yA)&&Number.isFinite(e.yB)));
  if(r.covered){assert.ok(edges.every(e=>e.yA<-5&&e.yB<-5),r.id);const p=r.p[Math.floor(r.p.length/2)];assert.ok(tunnelPassage(...p,-5.65));assert.equal(tunnelPassage(...p,.35),undefined);assert.equal(tunnelPassage(p[0]+r.w*5,p[1]+r.w*5,-5.65,2.4),undefined);}
 }
});

test('independent interchange crossings keep vehicle clearance below the upper deck',()=>{
 const motor=r=>/^(trunk|primary|secondary|tertiary)(_link)?$/.test(r.kind);let checked=0;
 for(const r of roads.filter(r=>r.bridge&&r.layer>=1&&motor(r)))for(const other of roads.filter(o=>o.id!==r.id&&(o.layer??0)<r.layer&&!o.tunnel&&motor(o))){
  const pr=bridgeRoadProfile(r),po=other.bridge?bridgeRoadProfile(other):{p:other.p,y:other.p.map(()=>.35)};
  for(let i=1;i<r.p.length;i++)for(let j=1;j<other.p.length;j++){
   const a=r.p[i-1],b=r.p[i],c=other.p[j-1],d=other.p[j],ux=b[0]-a[0],uz=b[1]-a[1],vx=d[0]-c[0],vz=d[1]-c[1],det=ux*vz-uz*vx;if(Math.abs(det)<1e-5)continue;
   const t=((c[0]-a[0])*vz-(c[1]-a[1])*vx)/det,v=((c[0]-a[0])*uz-(c[1]-a[1])*ux)/det;if(t<0||t>1||v<0||v>1)continue;
   const p=[a[0]+t*ux,a[1]+t*uz];if(r.p.some(a=>other.p.some(b=>same(a,b)&&Math.hypot(a[0]-p[0],a[1]-p[1])<20)))continue;
   const gap=nearestPath(...p,pr.p,pr.y).y-.65-nearestPath(...p,po.p,po.y).y;
   assert.ok(gap>=(other.bridge?4.3:3.9),`${r.id} crosses ${other.id} with only ${gap}m clearance`);checked++;
  }
 }
 assert.ok(checked>20);
});

test('interchange support piers leave the lower carriageways clear',async()=>{
 const {bridgeUnderpasses,bridgeExitRoads}=await import('../src/bridge-joints.ts');
 const {Raycaster,Vector3}=await import('three/webgpu');const ray=new Raycaster();let checked=0;
 for(const r of roads.filter(r=>r.bridge&&r.layer>1)){
  const material=new MeshStandardMaterial(),root=createTile({roads:[r],buildings:[],areas:[]},material);root.updateMatrixWorld(true);
  try{for(const id of bridgeUnderpasses[r.id]??[]){const lower=bridgeExitRoads[id],profile=lower.bridge?bridgeRoadProfile(lower):{p:lower.p,y:lower.p.map(()=>.35)};
   for(let i=1;i<profile.p.length;i++)for(const offset of [-1.2,0,1.2]){const a=profile.p[i-1],b=profile.p[i],delta=new Vector3(b[0]-a[0],profile.y[i]-profile.y[i-1],b[1]-a[1]),length=delta.length();if(!length)continue;delta.divideScalar(length);ray.set(new Vector3(a[0]-delta.z*offset,profile.y[i-1]+.7,a[1]+delta.x*offset),delta);ray.far=length;assert.equal(ray.intersectObject(root,true).length,0,`${r.id} blocks lower ${id}`);checked++;}
  }}finally{disposeTile(root);material.dispose();}
 }
 assert.ok(checked>100);
});

test('traffic cannot jump between crossing viaduct levels at a rounded map node',()=>{
 const graph=buildTrafficGraph(roads,false,true),by=new Map(roads.map(r=>[r.id,r]));
 for(const edge of graph.edges.values()){const road=by.get(edge.roadId);if(!road.bridge&&!tunnelData.routes.some(r=>r.id===road.id))continue;const profile=tunnelData.routes.find(r=>r.id===road.id)??bridgeRoadProfile(road);
  for(const [p,y] of [[edge.a,edge.yA],[edge.b,edge.yB]])assert.ok(Math.abs(y-nearestPath(...p,profile.p,profile.y).y)<.06,`${road.id} jumps to another floor at ${p}`);
 }
});

test('a sideways player car keeps its front bumper inside a tunnel wall',()=>{
 const route=tunnelData.routes.find(r=>r.covered&&r.name==='金穗路隧道'),i=Math.floor(route.p.length/2),p=route.p[i],q=route.p[i+1],dx=q[0]-p[0],dz=q[1]-p[1],length=Math.hypot(dx,dz),nx=-dz/length,nz=dx/length;
 const world=new WalkWorld();world.setMap(tiles);world.setVehicleHeading(Math.atan2(-nx,-nz));assert.ok(world.canStand(...p,2.4,-5.65));assert.equal(world.canStand(p[0]+nx*1.8,p[1]+nz*1.8,2.4,-5.65),false);
 const stopped=world.move(p,nx*10,nz*10,-5.65,2.4);assert.ok(Math.hypot(stopped[0]-p[0],stopped[1]-p[1])<1.01);
});
