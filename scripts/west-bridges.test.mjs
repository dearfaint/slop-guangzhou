import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {Haixinsha} from '../src/haixinsha.ts';
import {bridge4Height,bridge5Height,islandBridgeHeight} from '../src/haixinsha-layout.ts';
import {bridgeRoadProfile} from '../src/road-level.ts';
import {WalkWorld} from '../src/walk-world.ts';
import {WalkControls} from '../src/walk-controls.ts';
import {Raycaster,Vector3,PerspectiveCamera} from 'three/webgpu';
const read=p=>JSON.parse(readFileSync(new URL(p,import.meta.url),'utf8'));
const tiles=read('../public/data/manifest.json').tiles.map(t=>read('../public/data/'+t.id+'.json'));
const roads=new Map(tiles.flatMap(t=>t.roads).map(r=>[r.id,r]));
const profiles=[[721099986,bridge4Height],[721099987,bridge5Height]];
test('both west bridges meet their actual road endpoints and traffic uses the same smooth profile',()=>{
 for(const [id,height] of profiles){const r=roads.get(`osm/way/${id}/0`),p=bridgeRoadProfile(r,id===721099986?.35:.28);assert.ok(Math.abs(height(r.p[0][1])-(id===721099986?.35:.28))<.001);assert.ok(Math.abs(height(r.p.at(-1)[1])-(id===721099986?.35:.28))<.001);
  for(let i=0;i<p.p.length;i++){assert.ok(Math.abs(p.y[i]-height(p.p[i][1]))<1e-8);if(i)assert.ok(Math.abs(p.y[i]-p.y[i-1])/Math.hypot(p.p[i][0]-p.p[i-1][0],p.p[i][1]-p.p[i-1][1])<.22);}
 }
});
test('rendered bridge floors agree with player height along both curves, including the five-bridge landing',()=>{
 const model=new Haixinsha(),ray=new Raycaster();model.root.updateMatrixWorld(true);
 try{for(const [id,height] of profiles){const r=roads.get(`osm/way/${id}/0`);for(let i=1;i<r.p.length;i++){const a=r.p[i-1],b=r.p[i];for(let j=1;j<6;j++){const t=j/6,x=a[0]+(b[0]-a[0])*t,z=a[1]+(b[1]-a[1])*t,y=height(z);assert.ok(Math.abs(islandBridgeHeight(x,z)-y)<1e-8);ray.set(new Vector3(x,y+6,z),new Vector3(0,-1,0));ray.far=10;const hit=ray.intersectObject(model.root,true)[0];assert.ok(hit,`${id} has a floor`);assert.ok(Math.abs(hit.point.y-y)<.06,`${id}: visible ${hit.point.y} vs ground ${y}`);}}}}
 finally{model.dispose();}
});
test('walking crosses both banks with no step, water gap or one-metre landing jump',()=>{
 const world=new WalkWorld();world.setMap(tiles);
 for(const [id] of profiles){const r=roads.get(`osm/way/${id}/0`);let p=r.p[0],h=world.groundHeight(...p,0);
  for(let i=1;i<r.p.length;i++){const start=p,end=r.p[i],count=Math.ceil(Math.hypot(end[0]-p[0],end[1]-p[1])/.3);for(let j=1;j<=count;j++){const target=[start[0]+(end[0]-start[0])*j/count,start[1]+(end[1]-start[1])*j/count],next=world.move(p,target[0]-p[0],target[1]-p[1],h);assert.ok(Math.hypot(next[0]-target[0],next[1]-target[1])<.02,`${id} blocked near ${target}`);const y=world.groundHeight(...next,h);assert.ok(Math.abs(y-h)<.08,`${id} height jumps at ${next}: ${h} -> ${y}`);p=next;h=y;}}
  assert.ok(Math.abs(h-(id===721099986?.35:.28))<.001);
 }
});
test('player car travels from Qinglan Road across bridge four and onto the island approach',()=>{
 const previousWindow=globalThis.window,previousDocument=globalThis.document,events=new EventTarget();events.matches=()=>false;globalThis.window=events;globalThis.document={querySelector:()=>null,querySelectorAll:()=>[],pointerLockElement:null};
 const c=new WalkControls(new PerspectiveCamera(),new EventTarget(),()=>{});
 try{c.setMap(tiles);c.setTravel('car');c.active=true;const route=[...roads.get('osm/way/454892912/0').p.slice(-2),...roads.get('osm/way/1372988688/0').p.slice(1),...roads.get('osm/way/721099986/0').p.slice(1),...roads.get('osm/way/1372988684/0').p.slice(1)];c.position.set(route[0][0],1.15,route[0][1]);const e=new Event('keydown');e.code='KeyW';events.dispatchEvent(e);let peak=0;
  for(const target of route.slice(1)){let steps=0;while(Math.hypot(c.position.x-target[0],c.position.z-target[1])>.5){const dx=target[0]-c.position.x,dz=target[1]-c.position.z;c.yaw=c.bodyYaw=Math.atan2(-dx,-dz);c.update(.025);peak=Math.max(peak,c.position.y-1.15);assert.ok(++steps<2000,`blocked at ${target}, position ${c.position.toArray()}`);}}
  assert.ok(peak>3.4);assert.ok(c.position.y-1.15<.5);
 }finally{c.dispose();globalThis.window=previousWindow;globalThis.document=previousDocument;}
});

test('bridge railings protect the sides without closing the road or pedestrian entries',()=>{
 const model=new Haixinsha(),ray=new Raycaster();model.root.updateMatrixWorld(true);
 try{for(const [id,height] of profiles){const r=roads.get(`osm/way/${id}/0`);for(let i=1;i<r.p.length;i++){const a=r.p[i-1],b=r.p[i],from=new Vector3(a[0],height(a[1])+1,a[1]),to=new Vector3(b[0],height(b[1])+1,b[1]);ray.set(from,to.clone().sub(from).normalize());ray.far=from.distanceTo(to);assert.equal(ray.intersectObject(model.root,true).length,0,`${id} railing blocks segment ${i}`);}}}
 finally{model.dispose();}
});
