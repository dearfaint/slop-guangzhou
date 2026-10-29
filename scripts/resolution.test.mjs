import test from 'node:test';
import assert from 'node:assert/strict';
import {DynamicResolution} from '../src/resolution.ts';

test('pixel ratio starts at the 1.25 cap and never upscales low-density screens',()=>{
  assert.equal(new DynamicResolution(2).ratio,1.25);
  assert.equal(new DynamicResolution(1).ratio,1);
  assert.equal(new DynamicResolution(1).min,.75);
});

test('sustained low fps steps resolution down to the floor, single dips are ignored',()=>{
  const r=new DynamicResolution(2);
  assert.equal(r.sample(30,0),null,'one slow sample is not enough');
  assert.equal(r.sample(60,800),null);assert.equal(r.sample(30,1600),null);
  assert.equal(r.sample(30,2400),1.125);
  let t=2400;for(let i=0;i<20;i++)r.sample(20,t+=800);
  assert.equal(r.ratio,.75);
});

test('recovery steps back up but not to a level that just proved too slow until the retry window passes',()=>{
  const r=new DynamicResolution(1);
  r.sample(30,0);r.sample(30,800);assert.equal(r.ratio,.875);
  r.sample(30,1600);r.sample(30,2400);assert.equal(r.ratio,.75);
  let t=2400;for(let i=0;i<8;i++)r.sample(60,t+=800);
  assert.equal(r.ratio,.75,'.875 was too slow a moment ago');
  t=40000;for(let i=0;i<4;i++)r.sample(60,t+=800);
  assert.equal(r.ratio,.875);
  for(let i=0;i<8;i++)r.sample(60,t+=800);
  assert.equal(r.ratio,1,'never above the cap');
});
