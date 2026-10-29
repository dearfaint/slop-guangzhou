import test from 'node:test';import assert from 'node:assert/strict';import {WalkWorld,insidePolygon} from '../src/walk-world.ts';
const ring=(x,z,w,d)=>[[x,z],[x+w,z],[x+w,z+d],[x,z+d],[x,z]];
const building={id:'b',p:[ring(5,-4,3,8)],base:0,h:20};
const map={buildings:[building],roads:[{p:[[-10,0],[4,0]],kind:'footway',id:'f'}],areas:[{kind:'water',p:[ring(-8,4,16,4)]}]};
test('walking avoids buildings, water, boundary and swept wall tunnelling',()=>{
 const world=new WalkWorld();world.setMap([map]);assert.ok(world.canStand(0,0));assert.equal(world.canStand(6,0),false);assert.equal(world.canStand(0,6),false);assert.equal(world.canStand(-1700,0),false);
 const [x,z]=world.move([0,0],15,0);assert.ok(x<4.6&&z===0);assert.ok(world.canStand(x,z));
});
test('spawn uses nearest mapped footpath and movement slides along a wall',()=>{
 const world=new WalkWorld();world.setMap([map]);const p=world.spawn([6,0]);assert.ok(world.canStand(...p));assert.ok(p[0]<=4.55);
 const [x,z]=world.move([4,0],3,3);assert.ok(x<4.6&&z>2);assert.ok(world.canStand(x,z));
});
test('polygon holes are navigable and elevated buildings do not block ground',()=>{
 assert.equal(insidePolygon(5,5,[ring(0,0,10,10),ring(3,3,4,4)]),false);
 const world=new WalkWorld();world.setMap([{...map,buildings:[{...building,base:5}],areas:[]}]);assert.ok(world.canStand(6,0));
});

test('spawn over a broad river finds nearby dry land instead of a fixed fallback',()=>{
 const world=new WalkWorld();world.setMap([{buildings:[],roads:[],areas:[{kind:'water',p:[ring(-400,-400,800,800)]}]}]);const p=world.spawn([0,0]);assert.ok(world.canStand(...p));assert.ok(Math.hypot(...p)>400);assert.ok(Math.hypot(...p)<450);
});
