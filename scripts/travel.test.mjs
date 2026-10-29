import test from 'node:test';
import assert from 'node:assert/strict';
import {PerspectiveCamera,Vector3} from 'three/webgpu';
import {WalkControls} from '../src/walk-controls.ts';
import {GROUND_TOP} from '../src/street-surface.ts';

const windowTarget=new EventTarget();windowTarget.matches=()=>false;
globalThis.window=windowTarget;
globalThis.document={querySelector:()=>null,querySelectorAll:()=>[],pointerLockElement:null};
const create=()=>{const camera=new PerspectiveCamera(42,1,2,14000);const canvas=new EventTarget();canvas.setPointerCapture=()=>{};const controls=new WalkControls(camera,canvas,()=>{});return {camera,controls,canvas};};
const building={id:'roof',p:[[[5,-5],[15,-5],[15,5],[5,5]]],base:0,h:200};
const map={buildings:[building],roads:[],areas:[]};
test('entry follows overview location and horizontal heading, instead of fixed spawn',()=>{
 const {camera,controls}=create();controls.thirdPerson=false;controls.enter([100,200],new Vector3(1,-1,0).normalize());assert.equal(camera.position.x,100);assert.equal(camera.position.z,200);assert.equal(camera.position.y,2.1+GROUND_TOP);assert.ok(camera.getWorldDirection(new Vector3()).x>.999);
 controls.exit();controls.enter([-600,-400],new Vector3(0,-1,-1).normalize());assert.equal(camera.position.x,-600);assert.equal(camera.position.z,-400);assert.ok(camera.getWorldDirection(new Vector3()).z<-.999);controls.dispose();
});
test('travel switching resets speed, uses safe ground landing, and clears held input',()=>{
 const {camera,controls}=create();controls.thirdPerson=false;controls.setMap([map]);controls.setTravel('balloon');controls.enter([10,0],new Vector3(0,0,-1));assert.equal(camera.position.y,215);
 controls.setTravel('bike');assert.equal(controls.speed,8);assert.equal(camera.position.y,1.9+GROUND_TOP);assert.ok(controls.world.canStand(camera.position.x,camera.position.z));controls.dispose();
});
test('balloon cannot descend through rooftop or cross tall buildings below roof',()=>{
 const {camera,controls}=create();controls.setMap([map]);controls.setTravel('balloon');controls.enter([-10,0],new Vector3(1,0,0));
 const key=code=>{const e=new Event('keydown');e.code=code;windowTarget.dispatchEvent(e);};key('KeyW');key('KeyQ');for(let i=0;i<180;i++)controls.update(.05);
 assert.ok(camera.position.x< -3);assert.ok(camera.position.y>=60);controls.exit();const previous=camera.position.clone();controls.update(1);assert.deepEqual(camera.position,previous);controls.dispose();
});

test('C toggles view once, preserves actor position and heading, and leaves overview alone',()=>{
 const {camera,controls}=create();const key=(repeat=false)=>{const e=new Event('keydown');e.code='KeyC';e.repeat=repeat;windowTarget.dispatchEvent(e);};
 key();assert.equal(controls.thirdPerson,true);controls.enter([100,200],new Vector3(0,0,-1));
 const position=controls.position.clone(),heading=controls.heading;assert.ok(camera.position.distanceTo(position)>4);key();assert.equal(controls.thirdPerson,false);assert.deepEqual(controls.position,position);assert.equal(controls.heading,heading);assert.deepEqual(camera.position,position);
 key(true);assert.equal(controls.thirdPerson,false);key();assert.equal(controls.thirdPerson,true);assert.ok(camera.position.distanceTo(position)>4);controls.dispose();
});
test('third person movement and travel switches use actor position rather than camera offset',()=>{
 const {camera,controls}=create();controls.enter([100,200],new Vector3(0,0,-1));
 const e=new Event('keydown');e.code='KeyW';windowTarget.dispatchEvent(e);for(let i=0;i<50;i++)controls.update(.05);
 assert.ok(controls.position.z<198);assert.ok(camera.position.z>controls.position.z);const before=controls.position.clone();
 controls.setTravel('balloon');assert.equal(controls.position.x,before.x);assert.equal(controls.position.z,before.z);assert.equal(controls.position.y,180);assert.ok(camera.position.distanceTo(controls.position)>15);
 controls.toggleView();assert.deepEqual(camera.position,controls.position);controls.dispose();
});
test('third person camera boom stops in front of a wall',()=>{
 const {camera,controls}=create();controls.setMap([map]);controls.enter([0,0],new Vector3(-1,0,0));
 assert.ok(camera.position.x<4.65);assert.ok(controls.world.cameraClear(camera.position.x,camera.position.y,camera.position.z));assert.deepEqual(controls.position,new Vector3(0,2.1+GROUND_TOP,0));controls.dispose();
});

function key(code,type='keydown'){const event=new Event(type);event.code=code;windowTarget.dispatchEvent(event);}
function look(canvas,dy){const down=new Event('pointerdown');Object.assign(down,{pointerId:1,clientX:0,clientY:0});canvas.dispatchEvent(down);const move=new Event('pointermove');Object.assign(move,{pointerId:1,clientX:0,clientY:dy});canvas.dispatchEvent(move);}
test('third person starts at relaxed walking speed and preserves the full first person pitch range',()=>{
 const {camera,controls,canvas}=create();assert.equal(controls.thirdPerson,true);assert.equal(controls.speed,1.4);controls.enter([100,200],new Vector3(0,0,-1));
 for(const dy of [-900,900]){look(canvas,dy);const third=camera.getWorldDirection(new Vector3());assert.ok(Math.abs(third.y)>.97);if(third.y>0)assert.ok(camera.position.y>=controls.position.y,'upward view must not move below the actor');assert.ok(controls.world.cameraClear(...camera.position.toArray()));controls.toggleView();assert.ok(third.distanceTo(camera.getWorldDirection(new Vector3()))<1e-9);controls.toggleView();}
 controls.dispose();
});
test('bicycle steers in place, turns along an arc, reverses steering when backing and never strafes',()=>{
 const {controls}=create();controls.enter([100,200],new Vector3(0,0,-1));controls.setTravel('bike');const start=controls.position.clone();
 key('KeyD');for(let i=0;i<20;i++)controls.update(.05);assert.ok(controls.steering<-.45);assert.deepEqual(controls.position,start);assert.ok(Math.abs(controls.heading)<1e-9);
 key('KeyW');for(let i=0;i<20;i++)controls.update(.05);assert.ok(controls.position.x>start.x+1);assert.ok(controls.position.z<start.z);assert.ok(controls.heading<-.5);
 key('KeyW','keyup');key('KeyS');for(let i=0;i<80;i++)controls.update(.05);assert.ok(controls.heading>0);key('KeyS','keyup');key('KeyD','keyup');for(let i=0;i<30;i++)controls.update(.05);assert.ok(Math.abs(controls.steering)<.001);controls.dispose();
});

test('dragging the bicycle view looks around without steering its travel direction',()=>{
 const {camera,controls,canvas}=create();controls.enter([100,200],new Vector3(0,0,-1));controls.setTravel('bike');const heading=controls.heading;
 const down=new Event('pointerdown');Object.assign(down,{pointerId:1,clientX:0,clientY:0});canvas.dispatchEvent(down);const move=new Event('pointermove');Object.assign(move,{pointerId:1,clientX:220,clientY:0});canvas.dispatchEvent(move);
 assert.equal(controls.heading,heading);assert.ok(camera.getWorldDirection(new Vector3()).x>.5);key('KeyW');for(let i=0;i<20;i++)controls.update(.05);assert.ok(Math.abs(controls.position.x-100)<1e-7);assert.ok(controls.position.z<196);key('KeyW','keyup');controls.dispose();
});

test('car drives forward, steers without strafing, reverses and keeps C view switching',()=>{
 const {controls,camera}=create();controls.setTravel('car');controls.enter([100,200],new Vector3(0,0,-1));
 assert.equal(controls.speed,12);assert.equal(controls.thirdPerson,true);assert.ok(camera.position.distanceTo(controls.position)>8);
 const start=controls.position.clone();key('KeyD');for(let i=0;i<20;i++)controls.update(.05);assert.deepEqual(controls.position,start);
 key('KeyW');for(let i=0;i<20;i++)controls.update(.05);assert.ok(controls.position.x>start.x+1);assert.ok(controls.heading<0);assert.ok(controls.signedSpeed>0);
 key('KeyW','keyup');key('KeyD','keyup');key('KeyS');for(let i=0;i<40;i++)controls.update(.05);assert.ok(controls.signedSpeed<0);key('KeyS','keyup');
 const position=controls.position.clone(),heading=controls.heading;key('KeyC');assert.equal(controls.thirdPerson,false);assert.deepEqual(camera.position,position);assert.equal(controls.heading,heading);key('KeyC');assert.equal(controls.thirdPerson,true);controls.dispose();
});
test('car spawns on a driveable road and keeps its body clear of buildings',()=>{
 const {controls}=create();controls.setTravel('car');controls.setMap([{buildings:[building],areas:[],roads:[{id:'road',kind:'secondary',w:12,p:[[-20,-50],[-20,50]],bridge:false,tunnel:false},{id:'path',kind:'footway',w:3,p:[[0,-50],[0,50]],bridge:false,tunnel:false}]}]);
 controls.enter([0,0],new Vector3(1,0,0));assert.equal(controls.position.x,-20);
 key('KeyW');for(let i=0;i<150;i++)controls.update(.05);key('KeyW','keyup');assert.ok(controls.position.x<2.61);assert.ok(controls.world.canStand(controls.position.x,controls.position.z,2.4));controls.dispose();
});

test('reference-style jump rises once per press and lands on the same ground',()=>{
 const {controls}=create();controls.enter([100,200],new Vector3(0,0,-1));
 const ground=controls.position.y;key('Space');let top=ground;
 for(let i=0;i<100;i++){controls.update(.02);top=Math.max(top,controls.position.y);}
 assert.ok(top>ground+1);assert.equal(controls.position.y,ground);assert.equal(controls.airHeight,0);
 key('Space','keyup');controls.update(.02);key('Space');controls.update(.02);assert.ok(controls.airHeight>0);key('Space','keyup');controls.dispose();
});
