import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {PerspectiveCamera,Vector3} from 'three/webgpu';
import {cityView} from '../src/city-views.ts';
import {WalkControls} from '../src/walk-controls.ts';
const origin=JSON.parse(readFileSync(new URL('../public/data/manifest.json',import.meta.url))).origin;
const landmarks=JSON.parse(readFileSync(new URL('../public/data/landmarks.json',import.meta.url)));
const local=p=>new Vector3((p.lon-origin[0])*Math.PI/180*6378137*Math.cos(origin[1]*Math.PI/180),0,-(p.lat-origin[1])*Math.PI/180*6378137);
test('twin towers and cultural landmarks fit their city views, including a narrow viewport',()=>{
 for(const [name,targets] of [['fifthAve',['CTF FINANCE CENTRE','GUANGZHOU IFC']],['chryslerGCT',['GUANGZHOU OPERA HOUSE','GUANGZHOU LIBRARY']],['observatory',['CTF FINANCE CENTRE']],['waterfront',['CTF FINANCE CENTRE','GUANGZHOU IFC','CANTON TOWER']]]){
  for(const aspect of [1.5,.6]){const view=cityView(name,landmarks,origin,aspect),camera=new PerspectiveCamera(42,aspect,2,14000);camera.position.copy(view.position);camera.lookAt(view.target);camera.updateMatrixWorld();
   for(const en of targets){const p=landmarks.find(l=>l.en===en),center=local(p);for(const y of name==='observatory'?[p.h*.5,p.h]:[0,p.h])for(const dx of [-45,45]){const projected=center.clone().add(new Vector3(dx,y,0)).project(camera);assert.ok(Math.abs(projected.x)<.94&&Math.abs(projected.y)<.94&&projected.z<1,`${name} clips ${en}: ${projected.toArray()}`);}}
  }
 }
});
test('returning from a city view preserves player position, heading, travel and camera style',()=>{
 const oldWindow=globalThis.window,oldDocument=globalThis.document;globalThis.window=new EventTarget();globalThis.document={querySelector:()=>null,querySelectorAll:()=>[],pointerLockElement:null};
 const camera=new PerspectiveCamera(),walker=new WalkControls(camera,new EventTarget(),()=>{});
 try{walker.setTravel('bike');walker.enter([100,200],new Vector3(1,0,-1),true);walker.setCameraView('pov');const position=walker.position.clone(),heading=walker.heading;walker.exit();camera.position.set(800,600,500);walker.resume();assert.deepEqual(walker.position,position);assert.equal(walker.heading,heading);assert.equal(walker.travel,'bike');assert.equal(walker.thirdPerson,false);assert.equal(walker.active,true);assert.deepEqual(camera.position,position);assert.equal(camera.fov,65);assert.equal(camera.near,.12);}finally{walker.dispose();globalThis.window=oldWindow;globalThis.document=oldDocument;}
});

test('Canton Tower panorama stays at the tower tip on desktop and portrait screens',()=>{
 const tower=landmarks.find(p=>p.en==='CANTON TOWER'),tip=local(tower);
 for(const aspect of [1.5,.6]){
  const view=cityView('cantonTop',landmarks,origin,aspect);
  assert.ok(Math.hypot(view.position.x-tip.x,view.position.z-tip.z)<3,'camera must remain over the tower, including portrait mode');
  assert.ok(view.position.y>tower.h&&view.position.y<=tower.h+6);
  const camera=new PerspectiveCamera(view.fov,aspect,2,14000);camera.position.copy(view.position);camera.lookAt(view.target);camera.updateMatrixWorld();
  for(const en of ['CTF FINANCE CENTRE','GUANGZHOU IFC','GUANGZHOU OPERA HOUSE','GUANGZHOU LIBRARY']){const p=landmarks.find(p=>p.en===en);for(const y of [0,p.h]){const q=local(p).setY(y).project(camera);assert.ok(Math.abs(q.x)<.95&&Math.abs(q.y)<.95&&q.z<1,`${en} missing from tower panorama: ${q.toArray()}`);}}
 }
});
