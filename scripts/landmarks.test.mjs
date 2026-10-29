import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {Box3} from 'three/webgpu';
import {createLandmark} from '../src/landmarks.ts';
const root=new URL('../public/data/',import.meta.url);
const read=name=>JSON.parse(readFileSync(new URL(name,root),'utf8'));
const records=read('manifest.json').tiles.flatMap(t=>read(t.id+'.json').buildings).filter(b=>b.landmarkPrimary);
for(const b of records)test(`${b.landmark}: finite geometry, true location, reference height and bounded batches`,()=>{
 const group=createLandmark(b),bounds=new Box3().setFromObject(group);
 assert.ok(Math.abs(bounds.max.y-b.h)<.8,`height ${bounds.max.y} vs ${b.h}`);
 assert.ok(group.children.length<=5,'avoid one draw per window or structural member');
 const xs=b.p[0].map(p=>p[0]),zs=b.p[0].map(p=>p[1]);
 assert.ok(bounds.min.x>=Math.min(...xs)-15&&bounds.max.x<=Math.max(...xs)+15);
 assert.ok(bounds.min.z>=Math.min(...zs)-15&&bounds.max.z<=Math.max(...zs)+15);
 for(const mesh of group.children){
  assert.ok(mesh.geometry.getAttribute('position').count>0);
  for(const field of ['position','normal'])assert.ok(mesh.geometry.getAttribute(field).array.every(Number.isFinite));
  mesh.geometry.dispose();
 }
});

test('tile reload reuses every landmark material including night shaders',()=>{
 for(const b of records){
  const first=createLandmark(b),second=createLandmark(b);
  assert.equal(first.children.length,second.children.length);
  first.children.forEach((mesh,i)=>{assert.equal(mesh.material,second.children[i].material,b.landmark);mesh.geometry.dispose();second.children[i].geometry.dispose();});
 }
});
