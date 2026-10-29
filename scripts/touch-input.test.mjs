import test from 'node:test';
import assert from 'node:assert/strict';
import {joystickVector} from '../src/reference-ui.ts';

test('joystick remains centered and maps forward and reverse consistently at each touch size',()=>{
 for(const size of [96,112,136]){
  const rect={left:18,top:400,width:size,height:size},cx=18+size/2,cy=400+size/2;
  assert.deepEqual(joystickVector(cx,cy,rect),{x:0,y:0});
  const forward=joystickVector(cx,cy-size*.4,rect);assert.ok(forward.y<-.99&&forward.x===0);
  const reverse=joystickVector(cx,cy+size*.4,rect);assert.ok(reverse.y>.99&&reverse.x===0);
  const diagonal=joystickVector(cx+size,cy-size,rect);assert.ok(Math.abs(Math.hypot(diagonal.x,diagonal.y)-1)<1e-12);assert.ok(diagonal.x>0&&diagonal.y<0);
 }
});
test('joystick is relative to its actual screen bounds, including landscape safe areas',()=>{
 const portrait={left:18,top:500,width:112,height:112},landscape={left:64,top:180,width:96,height:96};
 const a=joystickVector(18+56+22.4,500+56-22.4,portrait),b=joystickVector(64+48+19.2,180+48-19.2,landscape);
 assert.ok(Math.hypot(a.x-b.x,a.y-b.y)<1e-12);
});
