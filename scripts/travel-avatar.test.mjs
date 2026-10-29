import test from 'node:test';
import assert from 'node:assert/strict';
import {Vector3,Box3,Mesh} from 'three/webgpu';
import {TravelAvatar} from '../src/travel-avatar.ts';

test('third person exposes the matching reference person, bicycle and helicopter; first person keeps vehicles',()=>{
 const avatar=new TravelAvatar(),state={active:true,thirdPerson:true,position:new Vector3(0,2.1,0),travel:'walk',heading:0,movingSpeed:3};
 avatar.update(state,.05);assert.ok(avatar.person.visible);assert.equal(avatar.bike.visible,false);assert.equal(avatar.balloon.visible,false);
 state.travel='bike';state.position.y=1.9;avatar.update(state,.05);assert.ok(avatar.bike.visible);assert.equal(avatar.root.position.y,0);
 const bikeBox=new Box3().setFromObject(avatar.bike,true);assert.ok(bikeBox.max.z-bikeBox.min.z>1.8&&bikeBox.max.z-bikeBox.min.z<2.1);
 const wheel=avatar.wheels[0];const rotation=wheel.rotation.x;avatar.update(state,.05);assert.notEqual(wheel.rotation.x,rotation);
 state.thirdPerson=false;avatar.update(state,.05);assert.equal(avatar.person.visible,false);assert.ok(avatar.bike.visible);
 state.travel='balloon';state.thirdPerson=true;state.position.y=180;avatar.update(state,.05);assert.ok(avatar.balloon.visible);assert.equal(avatar.bike.visible,false);
 const helicopterBox=new Box3().setFromObject(avatar.balloon);assert.ok(helicopterBox.max.y-helicopterBox.min.y>2);assert.ok(helicopterBox.max.z-helicopterBox.min.z>8);
 avatar.root.traverse(o=>{if(o instanceof Mesh){const p=o.geometry.getAttribute('position');assert.ok(Array.from(p.array).every(Number.isFinite));}});
 state.active=false;avatar.update(state,.05);assert.equal(avatar.root.visible,false);avatar.dispose();
});

test('front fork and handlebar steer together while wheels keep spinning independently',()=>{
 const avatar=new TravelAvatar(),state={active:true,thirdPerson:true,position:new Vector3(100,1.9,200),travel:'bike',heading:0,movingSpeed:4,steering:.4};
 avatar.update(state,.05);const front=avatar.wheels[0],rear=avatar.wheels[1];assert.equal(front.parent,avatar.steering);assert.equal(rear.parent,avatar.bike);assert.equal(avatar.steering.rotation.y,.4);assert.notEqual(front.rotation.x,0);assert.equal(front.rotation.x,rear.rotation.x);
 state.steering=-.4;avatar.update(state,.05);assert.equal(avatar.steering.rotation.y,-.4);avatar.dispose();
});

test('car avatar has a full-size body, turning front wheels and hides standing character',()=>{
 const avatar=new TravelAvatar(),state={active:true,thirdPerson:true,position:new Vector3(0,1.15,0),travel:'car',heading:0,movingSpeed:5,signedSpeed:5,steering:.3};
 avatar.update(state,.05);assert.ok(avatar.car.visible);assert.equal(avatar.person.visible,false);assert.equal(avatar.bike.visible,false);assert.equal(avatar.root.position.y,0);
 const bounds=new Box3().setFromObject(avatar.car,true);assert.ok(bounds.max.z-bounds.min.z>4.4);assert.ok(bounds.max.x-bounds.min.x>1.9);assert.ok(Math.abs(bounds.min.y)<.01);
 assert.ok(avatar.carModel.front.every(p=>p.rotation.y===.3));const wheel=avatar.carModel.wheels[0],rotation=wheel.rotation.x;avatar.update(state,.05);assert.notEqual(wheel.rotation.x,rotation);
 state.thirdPerson=false;avatar.update(state,.05);assert.ok(avatar.car.visible);assert.equal(avatar.person.visible,false);
 state.travel='walk';avatar.update(state,.05);assert.equal(avatar.car.visible,false);avatar.dispose();
});
