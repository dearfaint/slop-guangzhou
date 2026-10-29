import test from 'node:test';
import assert from 'node:assert/strict';
import {expandedMapScale,clampMapCenter,mapPoint} from '../src/minimap-layout.ts';
test('expanded map covers wide, tall and phone viewports without stretching geography',()=>{
 for(const [width,height] of [[1800,850],[850,1200],[340,700]]){
  const scale=expandedMapScale(width,height),view={width,height,scale,center:[0,130]};
  view.center=clampMapCenter([-1600,-1450],view);
  assert.ok(3310*scale>=width-1e-8&&3260*scale>=height-1e-8);
  for(const [x,y] of [[0,0],[width,height]]){const p=mapPoint(x,y,view);assert.ok(p[0]>=-1660-1e-8&&p[0]<=1650+1e-8);assert.ok(p[1]>=-1500-1e-8&&p[1]<=1760+1e-8);}
 }
});
test('overview recenters axes wider than the available map while zoomed views stop at the edge',()=>{
 const view={width:1800,height:850,scale:.2,center:[0,0]};assert.deepEqual(clampMapCenter([1600,1700],view),[-5,130]);
 const zoomed={...view,scale:1};assert.deepEqual(clampMapCenter([1600,1700],zoomed),[750,1335]);
});
