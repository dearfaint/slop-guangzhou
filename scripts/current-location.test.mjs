import test from 'node:test';
import assert from 'node:assert/strict';
import {currentLocation} from '../src/current-location.ts';

const places=[{name:'花城广场',point:{x:-288,z:-400}},{name:'广州塔',point:{x:-292,z:1112}},{name:'广州大剧院',point:{x:-509,z:125}}];
test('location follows the player between landmarks and avoids distant place labels',()=>{
 for(const p of places)assert.equal(currentLocation(p.point,places),p.name);
 assert.equal(currentLocation({x:-509,z:180},places),'广州大剧院附近');
 assert.equal(currentLocation({x:-1600,z:-1400},places),'城市漫游');
});
test('park boundary and dedicated city views retain their location labels',()=>{
 assert.equal(currentLocation({x:1615,z:-505},places),'珠江公园 · 园路与湖滨');
 assert.equal(currentLocation(places[0].point,places,'cantonTop'),'广州塔顶 · 俯瞰全城');
 assert.equal(currentLocation(places[0].point,places,'pearlPark'),'珠江公园 · 园路与湖滨');
});
