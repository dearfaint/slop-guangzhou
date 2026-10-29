import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {PerspectiveCamera} from 'three/webgpu';
import {WalkWorld} from '../src/walk-world.ts';
import {WalkControls} from '../src/walk-controls.ts';
import {bridgeRoadProfile} from '../src/road-level.ts';
const road={id:'collision-bridge',name:'',kind:'primary',bridge:true,tunnel:false,w:12,p:[[-50,0],[0,0],[50,0]]};
const map={roads:[road],buildings:[],areas:[]};
test('both elevated railings stop direct and high speed lateral movement over dry land',()=>{
 const world=new WalkWorld();world.setMap([map]);const h=world.groundHeight(0,0,5);
 for(const side of [-1,1]){const end=world.move([0,0],0,side*80,h,2.4);assert.ok(Math.abs(end[1])<3.6,`crossed railing: ${end}`);assert.ok(Math.abs(world.groundHeight(...end,h)-h)<.01);}
});
test('an oblique impact slides along a diagonal bridge without crossing its guardrail',()=>{
 const diagonal={...road,p:[[-40,-40],[40,40]]},world=new WalkWorld();world.setMap([{...map,roads:[diagonal]}]);
 const end=world.move([0,0],18,-4,5,2.4),lateral=Math.abs(end[1]-end[0])/Math.sqrt(2);
 assert.ok(lateral<3.6,`crossed diagonal rail: ${end}`);assert.ok((end[0]+end[1])/Math.sqrt(2)>8,'must retain forward sliding');
});
test('the ground road beneath a viaduct remains passable across both railings',()=>{
 const world=new WalkWorld();world.setMap([map]);const end=world.move([0,-12],0,24,0,2.4);assert.ok(Math.hypot(end[0],end[1]-12)<1e-8);
});
test('bridge ends stay open and a player car is physically stopped by the elevated railing',()=>{
 const oldWindow=globalThis.window,oldDocument=globalThis.document,events=new EventTarget();events.matches=()=>false;globalThis.window=events;globalThis.document={querySelector:()=>null,querySelectorAll:()=>[],pointerLockElement:null};
 const controls=new WalkControls(new PerspectiveCamera(),new EventTarget(),()=>{}),deck=Math.max(...bridgeRoadProfile(road).y);
 try{controls.setMap([map]);controls.setTravel('car');controls.active=true;controls.position.set(0,deck+1.15,0);controls.yaw=controls.bodyYaw=-Math.PI/2;const key=new Event('keydown');key.code='KeyW';events.dispatchEvent(key);for(let i=0;i<250;i++)controls.update(.05);assert.ok(controls.position.x>50,'road ends must remain open');
  controls.position.set(0,deck+1.15,0);controls.yaw=controls.bodyYaw=Math.PI;controls.setTravel('car');for(let i=0;i<250;i++)controls.update(.05);assert.ok(Math.abs(controls.position.z)<3.6,`car drove off: ${controls.position.toArray()}`);assert.ok(Math.abs(controls.position.y-(deck+1.15))<.01);
 }finally{controls.dispose();globalThis.window=oldWindow;globalThis.document=oldDocument;}
});
test('actual Liede and Guangzhou Bridge decks stop sideways driving above dry approaches',()=>{
 const read=p=>JSON.parse(readFileSync(new URL(p,import.meta.url),'utf8')),tiles=read('../public/data/manifest.json').tiles.map(t=>read('../public/data/'+t.id+'.json'));
 const world=new WalkWorld();world.setMap(tiles);
 for(const id of ['osm/way/233809684/0','osm/way/449547602/0']){const r=tiles.flatMap(t=>t.roads).find(r=>r.id===id),profile=bridgeRoadProfile(r),i=Math.floor(profile.p.length/2),a=profile.p[i],b=profile.p[i+1],dx=b[0]-a[0],dz=b[1]-a[1],length=Math.hypot(dx,dz),nx=-dz/length,nz=dx/length;
  const end=world.move(a,nx*40,nz*40,profile.y[i],2.4);assert.ok(Math.hypot(end[0]-a[0],end[1]-a[1])<r.w/2,`${id}: ${end}`);
 }
});

test('actual Liede access legs and Guangzhou Bridge sliproad remain driveable with rail collisions enabled',()=>{
 const read=p=>JSON.parse(readFileSync(new URL(p,import.meta.url),'utf8')),roads=read('../public/data/manifest.json').tiles.flatMap(t=>read('../public/data/'+t.id+'.json').roads),world=new WalkWorld();world.setMap([{roads,buildings:[],areas:[]}]);
 for(const id of ['440769426','440769428','686143525','686143527','33563315']){
  const r=roads.find(r=>r.id===`osm/way/${id}/0`),p=bridgeRoadProfile(r);
  for(let i=1;i<p.p.length;i++){const a=p.p[i-1],b=p.p[i],dx=b[0]-a[0],dz=b[1]-a[1];world.setVehicleHeading(Math.atan2(dx,dz));const end=world.move(a,dx,dz,p.y[i-1],2.4);assert.ok(Math.hypot(end[0]-b[0],end[1]-b[1])<.15,`${id} exit blocked at ${b}: ${end}`);}
 }
});
