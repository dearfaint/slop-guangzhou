import test from 'node:test';
import assert from 'node:assert/strict';
import {Vector3,Quaternion} from 'three/webgpu';
import {SlopCrowd} from '../src/slop-people.ts';
import {TravelAvatar} from '../src/travel-avatar.ts';
import {PERSON_BONES} from '../src/vendor/slop-newyork/pedestrians.js';
const joint=(rig,bone)=>{const i=bone*8,p=rig.pose;return rig.bind[bone].clone().multiplyScalar(rig.s).applyQuaternion(new Quaternion(...p.slice(i,i+4))).add(new Vector3(...p.slice(i+4,i+7)));};

test('340 reference people use two shared skinned draws and retain finite, independent poses',()=>{
 const crowd=new SlopCrowd(),people=Array.from({length:340},(_,i)=>({x:i%20*3,z:Math.floor(i/20)*4,heading:0,speed:1.4,seed:i*31817}));
 try{
  for(let f=0;f<120;f++){for(const p of people)p.z+=.014;crowd.update(people,new Vector3(0,2,0),.01);}
  assert.equal(crowd.root.children.length,2);assert.equal(crowd.root.children.reduce((n,m)=>n+m.count,0),340);
  assert.ok(crowd.stats().detailed>0);
  for(const person of people)assert.ok(crowd.getRig(person).pose.every(Number.isFinite));
  assert.notDeepEqual(crowd.getRig(people[0]).pose,crowd.getRig(people[1]).pose);
  crowd.update(people,new Vector3(10000,2,10000),.01);assert.ok(crowd.root.children.every(m=>m.count===0));
  crowd.update(people,new Vector3(0,2,0),.01);assert.equal(crowd.root.children.reduce((n,m)=>n+m.count,0),340);
 }finally{crowd.dispose();}
});

test('reference player pose stays at the world position across heading changes and view modes',()=>{
 const avatar=new TravelAvatar(),state={active:true,thirdPerson:true,position:new Vector3(100,2.1,200),travel:'walk',heading:.7,movingSpeed:1.4};
 try{
  for(let f=0;f<120;f++){state.position.z-=.014;avatar.update(state,.01);}
  const pelvis=joint(avatar.rig,PERSON_BONES.PELVIS);
  assert.ok(Math.abs(pelvis.x-state.position.x)<.2);assert.ok(Math.abs(pelvis.z-state.position.z)<.2);
  assert.ok(avatar.rig.speed>.8);assert.ok(avatar.rig.pose.every(Number.isFinite));
  assert.equal(avatar.person.children.length,2);state.thirdPerson=false;avatar.update(state,.01);assert.equal(avatar.person.visible,false);
 }finally{avatar.dispose();}
});

test('reference bicycle rider stays finite while steering, reversing and changing heading',()=>{
 const avatar=new TravelAvatar(),state={active:true,thirdPerson:true,position:new Vector3(50,1.9,20),travel:'bike',heading:.7,movingSpeed:3,signedSpeed:3,steering:0};
 try{
  for(let f=0;f<180;f++){state.signedSpeed=f<90?3:-3;state.steering=Math.sin(f*.08)*.4;state.heading+=.002;avatar.update(state,.016);assert.ok(avatar.rig.pose.every(Number.isFinite));const pelvis=joint(avatar.rig,PERSON_BONES.PELVIS);assert.ok(Math.hypot(pelvis.x-state.position.x,pelvis.z-state.position.z)<.5);assert.ok(pelvis.y>.9&&pelvis.y<1.5);}
  assert.equal(avatar.steering.rotation.y,state.steering);
 }finally{avatar.dispose();}
});
