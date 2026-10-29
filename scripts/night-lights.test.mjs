import test from 'node:test';
import assert from 'node:assert/strict';
import {Group,Vector3} from 'three/webgpu';
import {NightLights} from '../src/night-lights.ts';
test('fixed light pool turns off by day and lights nearby street surfaces after dusk',()=>{
 const lights=new NightLights(),camera=new Vector3(0,2,0),count=lights.root.children.length;
 assert.equal(lights.spots.length,12);lights.setLamps([{x:5,z:0,height:8,angle:0},{x:300,z:0,height:8,angle:0}]);lights.update(0,camera,[]);assert.ok(lights.spots.every(s=>s.intensity===0));
 lights.update(1,camera,[]);assert.ok(lights.spots.some(s=>s.intensity>0&&s.position.y>8&&s.target.position.y<1));assert.equal(lights.root.children.length,count);
 lights.update(1,new Vector3(0,400,0),[]);assert.ok(lights.spots.every(s=>s.intensity===0));lights.dispose();
});
test('traffic beams follow the front of moving cars including bridge height and pitch',()=>{
 const lights=new NightLights();lights.update(1,new Vector3(0,9,0),[{x:0,z:0,y:8,heading:Math.PI/2,pitch:.1,type:0}]);
 const beams=lights.spots.filter(s=>s.intensity>0);assert.equal(beams.length,2);for(const s of beams){assert.ok(s.target.position.x>s.position.x+10);assert.ok(s.position.y>8);}
 lights.update(0,new Vector3(),[]);assert.ok(lights.spots.every(s=>s.intensity===0));lights.dispose();
});
test('player beams use the car world transform and disappear when no car is active',()=>{
 const lights=new NightLights(),car=new Group();car.position.set(10,3,20);car.rotation.y=Math.PI;car.updateMatrixWorld(true);
 lights.update(1,new Vector3(10,5,25),[],car);const active=lights.spots.filter(s=>s.intensity>0);assert.equal(active.length,2);
 for(const s of active){assert.ok(s.position.z<20);assert.ok(s.target.position.z<s.position.z-10);assert.equal(s.castShadow,true);const delta=s.target.position.clone().sub(s.position);assert.ok(Math.atan2(-delta.y,Math.hypot(delta.x,delta.z))-s.angle>.004,'low-beam upper edge stays below horizon');}
 lights.update(1,new Vector3(),[]);assert.ok(lights.spots.every(s=>s.intensity===0));lights.dispose();
});

test('street pools fade at the nearest-light selection boundary',()=>{
 const lights=new NightLights();lights.setLamps(Array.from({length:9},(_,i)=>({x:10+i*10,z:0,height:8,angle:0})));lights.update(1,new Vector3(0,8,0),[]);
 const active=lights.spots.filter(s=>s.intensity>0);assert.equal(active.length,8);assert.ok(active.at(-1).intensity<active[0].intensity);lights.dispose();
});

test('decorative spill shares the existing pool and cannot displace all road lights',()=>{
 const lights=new NightLights();lights.setLamps([
  ...Array.from({length:10},(_,i)=>({x:8+i*4,z:0,height:8,angle:0})),
  ...Array.from({length:10},(_,i)=>({x:1+i*.2,z:0,height:3,angle:0,tint:'#ffb8a2',power:22,reach:11})),
 ]);lights.update(1,new Vector3(0,3,0),[]);
 const active=lights.spots.filter(s=>s.intensity>0);assert.equal(lights.spots.length,12);assert.equal(active.filter(s=>s.distance===11).length,2);assert.ok(active.filter(s=>s.distance===29).length>=4);lights.dispose();
});
