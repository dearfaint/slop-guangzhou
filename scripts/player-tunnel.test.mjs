import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {Group,Mesh,MeshStandardMaterial,PerspectiveCamera,Raycaster,Vector3} from 'three/webgpu';
import {WalkWorld} from '../src/walk-world.ts';
import {WalkControls} from '../src/walk-controls.ts';
import {southAxisData as data} from '../src/south-axis-data.ts';
import {SouthAxis,southAxisGround} from '../src/south-axis.ts';
import {createTile,disposeTile} from '../src/geometry.ts';
import {nearestPath} from '../src/south-axis-layout.ts';
const read=p=>JSON.parse(readFileSync(new URL(p,import.meta.url),'utf8'));
const tiles=read('../public/data/manifest.json').tiles.map(t=>read('../public/data/'+t.id+'.json'));
const west=data.ramps.find(r=>r.id==='osm/way/923953845/0'),east=data.ramps.find(r=>r.id==='osm/way/102596669/0'),main=data.underground.find(r=>r.id==='osm/way/248284676/0');
const route=[...west.p,...main.p.slice(1),...east.p.slice(1)];

test('player movement follows every mainline and branch slope without entering from a cliff edge',()=>{
 const world=new WalkWorld();world.setMap(tiles);
 for(const road of [...data.ramps,...data.underground]){
  let point=road.p[0],height=Array.isArray(road.y)?road.y[0]:road.heights[0];
  for(let i=1;i<road.p.length;i++){
   const end=road.p[i],steps=Math.ceil(Math.hypot(end[0]-point[0],end[1]-point[1])/.2),start=point;
   for(let j=1;j<=steps;j++){
    const target=[start[0]+(end[0]-start[0])*j/steps,start[1]+(end[1]-start[1])*j/steps];
    const next=world.move(point,target[0]-point[0],target[1]-point[1],height);
    assert.ok(Math.hypot(next[0]-target[0],next[1]-target[1])<.01,road.id);
    const y=world.groundHeight(...next,height);assert.ok(Math.abs(y-height)<.1,`${road.id}: ${height} -> ${y}`);point=next;height=y;
   }
  }
 }
 const middle=west.p[Math.floor(west.p.length/2)];
 assert.equal(world.canStand(...middle),false,'surface players cannot drop through the cutting');
 assert.ok(world.cameraClear(middle[0],west.y[Math.floor(west.p.length/2)]+2,middle[1]));
});

test('real bicycle controls cross the entry, underground mainline and exit',()=>{
 const previousWindow=globalThis.window,previousDocument=globalThis.document,events=new EventTarget();events.matches=()=>false;
 globalThis.window=events;globalThis.document={querySelector:()=>null,querySelectorAll:()=>[],pointerLockElement:null};
 const camera=new PerspectiveCamera(),controls=new WalkControls(camera,new EventTarget(),()=>{});
 try{
  controls.setMap(tiles);controls.setTravel('bike');controls.active=true;controls.position.set(route[0][0],2.25,route[0][1]);
  const key=new Event('keydown');key.code='KeyW';events.dispatchEvent(key);let minimum=0,checkedReload=false;
  for(const target of route.slice(1)){
   let count=0;const budget=Math.ceil(Math.hypot(controls.position.x-target[0],controls.position.z-target[1])/.2)*2+200;
   while(Math.hypot(controls.position.x-target[0],controls.position.z-target[1])>.45){
    const dx=target[0]-controls.position.x,dz=target[1]-controls.position.z;
    controls.yaw=controls.bodyYaw=Math.atan2(-dx,-dz);controls.update(.025);minimum=Math.min(minimum,controls.position.y-1.9);
    if(minimum<-10.7&&!checkedReload){
     const p=controls.position.clone(),floor=p.y-1.9;controls.setTravel('walk');controls.setMap(tiles);
     assert.ok(Math.abs(controls.position.y-floor-2.1)<.01);assert.ok(Math.hypot(controls.position.x-p.x,controls.position.z-p.z)<.01);
     controls.setTravel('bike');events.dispatchEvent(key);checkedReload=true;
    }
    assert.ok(++count<budget,`bicycle blocked at ${target}, position ${controls.position.toArray()}`);
   }
  }
  assert.ok(minimum<-10);assert.ok(controls.position.y>2.1);
  assert.ok(Math.hypot(controls.position.x-route.at(-1)[0],controls.position.z-route.at(-1)[1])<.5);
 }finally{controls.dispose();globalThis.window=previousWindow;globalThis.document=previousDocument;}
});

test('rendered tunnel junctions have no wall across the player route and entry collars have no holes',()=>{
 const model=new SouthAxis(),scene=new Group(),material=new MeshStandardMaterial(),ground=new Mesh(southAxisGround(),material),groups=tiles.map(t=>createTile(t,material));
 scene.add(model.root,ground,...groups);scene.updateMatrixWorld(true);const ray=new Raycaster();
 const world=new WalkWorld();world.setMap(tiles);
 let height=.35;
 for(let i=1;i<route.length;i++){
  const a=route[i-1],b=route[i],length=Math.hypot(b[0]-a[0],b[1]-a[1]),count=Math.max(1,Math.ceil(length/.5));
  let previous=new Vector3(a[0],height+1.2,a[1]);
  for(let j=1;j<=count;j++){
   const x=a[0]+(b[0]-a[0])*j/count,z=a[1]+(b[1]-a[1])*j/count;height=world.groundHeight(x,z,height);
   const next=new Vector3(x,height+1.2,z),direction=next.clone().sub(previous);
   if(direction.length()>.01){ray.set(previous,direction.clone().normalize());ray.far=direction.length();assert.equal(ray.intersectObject(scene,true).length,0,`physical barrier at ${x},${z}`);}
   previous=next;
  }
 }
 for(const road of data.underground)for(const [end,before] of [[0,1],[road.p.length-1,road.p.length-2]]){
  const b=road.p[end],a=road.p[before],length=Math.hypot(b[0]-a[0],b[1]-a[1]),distance=Math.min(3,length),x=b[0]-(b[0]-a[0])/length*distance,z=b[1]-(b[1]-a[1])/length*distance;
  const from=new Vector3(x,nearestPath(x,z,road.p,road.heights).y+1.2,z),to=new Vector3(b[0],road.heights[end]+1.2,b[1]);
  ray.set(from,to.clone().sub(from).normalize());ray.far=from.distanceTo(to);
  assert.equal(ray.intersectObject(scene,true).length,0,`junction wall blocks ${road.id}`);
 }
 for(const r of data.ramps){const outer=r.y[0]>.3?0:r.p.length-1,next=outer===0?1:outer-1,a=r.p[outer],b=r.p[next],dx=b[0]-a[0],dz=b[1]-a[1],length=Math.hypot(dx,dz);
  for(const along of [-.5,.5,1])for(const side of [-4.7,0,4.7]){
   const x=a[0]+dx/length*along-dz/length*side,z=a[1]+dz/length*along+dx/length*side;
   ray.set(new Vector3(x,10,z),new Vector3(0,-1,0));ray.far=20;assert.ok(ray.intersectObject(scene,true).length,`open seam at ${r.id}`);
  }
 }
 groups.forEach(disposeTile);ground.geometry.dispose();model.dispose();material.dispose();
});
