import test from 'node:test';
import assert from 'node:assert/strict';
import {Box3,Vector3,Raycaster} from 'three/webgpu';
import {createHuachengStone,huachengStone as s} from '../src/huacheng-stone.ts';
import {WalkWorld} from '../src/walk-world.ts';
import {southAxisData} from '../src/south-axis-data.ts';
import {inPolygon,southAxisHeight,southAxisBlocked} from '../src/south-axis-layout.ts';

test('photo stone sits on open plaza paving and has a solid front and back',()=>{
 const court=southAxisData.courtyard;
 // User's map places the stone south of the circular court, just inside the south entrance bollards.
 assert.ok(s.z>court.center[1]+court.outerRadius+15);
 assert.ok(s.z<court.center[1]+56-5);
 assert.ok(Math.abs(s.x-court.center[0])<3);
 assert.ok(inPolygon(s.x,s.z,southAxisData.plaza));assert.equal(southAxisHeight(s.x,s.z),s.ground);assert.equal(southAxisBlocked(s.x,s.z,.45),false);
 const root=createHuachengStone();root.updateMatrixWorld(true);
 root.traverse(m=>{if(m.isMesh)for(const v of m.geometry.attributes.position.array)assert.ok(Number.isFinite(v));});
 const bounds=new Box3().setFromObject(root);
 assert.ok(Math.abs(bounds.min.y-s.ground)<.001);assert.ok(bounds.max.y>s.ground+3.4);
 const rock=root.getObjectByName('不规则青灰景石'),ray=new Raycaster();
 for(const side of [-1,1]){
  ray.set(new Vector3(s.x,s.ground+1.8,s.z+side*5),new Vector3(0,0,-side));
  assert.ok(ray.intersectObject(rock).length>0);
 }
 root.traverse(m=>{if(m.isMesh){m.geometry.dispose();m.material.dispose();}});
});
test('walking and cycling stop at the stone while its sides remain passable',()=>{
 const world=new WalkWorld();assert.equal(world.canStand(s.x,s.z),false);
 const end=world.move([s.x,s.z+5],0,-10,.42);
 assert.ok(end[1]>s.z+s.depth/2);assert.ok(end[1]<s.z+3);
 assert.equal(world.canStand(s.x+s.width/2+1,s.z),true);
 assert.equal(world.cameraClear(s.x,2,s.z),false);assert.equal(world.cameraClear(s.x,8,s.z),true);
});
