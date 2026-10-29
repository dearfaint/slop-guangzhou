import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {PerspectiveCamera} from 'three/webgpu';
import {WalkControls} from '../src/walk-controls.ts';
import {WalkWorld} from '../src/walk-world.ts';
import {southAxisData as data} from '../src/south-axis-data.ts';
const read=p=>JSON.parse(readFileSync(new URL(p,import.meta.url),'utf8'));
const tiles=read('../public/data/manifest.json').tiles.map(t=>read('../public/data/'+t.id+'.json'));

test('holding straight ahead at the entrance heading does not stall against a slightly angled tunnel wall',()=>{
 const previousWindow=globalThis.window,previousDocument=globalThis.document,events=new EventTarget();events.matches=()=>false;
 globalThis.window=events;globalThis.document={querySelector:()=>null,querySelectorAll:()=>[],pointerLockElement:null};
 const controls=new WalkControls(new PerspectiveCamera(),new EventTarget(),()=>{});
 try{
  const ramp=data.ramps.find(r=>r.id==='osm/way/923953845/0'),a=ramp.p[0],b=ramp.p[1];
  controls.setMap(tiles);controls.setTravel('bike');controls.active=true;controls.thirdPerson=false;
  controls.position.set(a[0],ramp.y[0]+1.9,a[1]);controls.yaw=controls.bodyYaw=Math.atan2(-(b[0]-a[0]),-(b[1]-a[1]));
  const heading=controls.bodyYaw,key=new Event('keydown');key.code='KeyW';events.dispatchEvent(key);
  let lowest=.35,elapsed=0;
  while(elapsed<210&&controls.position.x<338.4){controls.update(.05);lowest=Math.min(lowest,controls.position.y-1.9);elapsed+=.05;}
  assert.equal(controls.bodyYaw,heading,'no automatic steering');assert.ok(lowest<-10);
  assert.ok(controls.position.x>=338.4,`stalled at ${controls.position.toArray()}`);assert.ok(controls.position.y>2.1);
 }finally{controls.dispose();globalThis.window=previousWindow;globalThis.document=previousDocument;}
});

test('tunnel wall sliding keeps the player inside the drivable width and cannot pull a surface player down',()=>{
 const world=new WalkWorld();world.setMap(tiles);
 const r=data.ramps.find(r=>r.id==='osm/way/923953845/0'),i=Math.floor(r.p.length/2),a=r.p[i],b=r.p[i+1],dx=b[0]-a[0],dz=b[1]-a[1],length=Math.hypot(dx,dz),nx=-dz/length,nz=dx/length;
 const from=[a[0]+nx*2.73,a[1]+nz*2.73],end=world.move(from,dx/length*.3+nx*.12,dz/length*.3+nz*.12,r.y[i]);
 assert.ok((end[0]-from[0])*dx/length+(end[1]-from[1])*dz/length>.2,'slides forwards');
 assert.equal(world.canStand(...end,.45,world.groundHeight(...end,r.y[i])),true);
 assert.equal(world.canStand(...a,.45,0),false,'surface level cannot fall into a deep cutting');
});
