import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {Raycaster,Vector3,MeshStandardMaterial,Mesh,Group} from 'three/webgpu';
import {southAxisGround} from '../src/south-axis.ts';
import {createLandmark} from '../src/landmarks.ts';
import {WalkWorld} from '../src/walk-world.ts';
import {operaPool,operaGroundHeight} from '../src/opera-layout.ts';
import {OperaSite} from '../src/opera-site.ts';
import {inPolygon} from '../src/south-axis-layout.ts';
const read=p=>JSON.parse(readFileSync(new URL(p,import.meta.url),'utf8'));
const tiles=read('../public/data/manifest.json').tiles.map(t=>read('../public/data/'+t.id+'.json'));
const building=tiles.flatMap(t=>t.buildings).find(b=>b.landmarkPrimary&&b.landmark==='opera');
test('opera has two independent pebble halls and an open pedestrian gap',()=>{
 const world=new WalkWorld();world.setMap(tiles);
 assert.equal(world.canStand(-483,140),true,'gap between halls stays open');
 assert.equal(world.canStand(-550,125),false);assert.equal(world.canStand(-440,125),false);
 const model=createLandmark(building);assert.equal(model.userData.photoReference,'user-aerial-20261025');
 assert.ok(model.children.length<=5);
 for(const m of model.children){for(const key of ['position','normal'])assert.ok(m.geometry.attributes[key].array.every(Number.isFinite));m.geometry.dispose();}
});
test('opera stone textures have finite metre-scaled UVs and survive site disposal',()=>{
 const model=createLandmark(building),stone=model.children.find(m=>m.material.name==='Opera grey granite');
 assert.ok(stone.material.map&&stone.material.normalMap&&stone.material.roughnessMap);
 assert.ok(stone.geometry.attributes.uv.array.every(Number.isFinite));
 const uv=stone.geometry.attributes.uv;
 assert.ok(Math.max(...uv.array)-Math.min(...uv.array)>3,'texture repeats across the whole building');
 let disposed=false;stone.material.addEventListener('dispose',()=>{disposed=true;});
 const site=new OperaSite();site.dispose();assert.equal(disposed,false,'site must not dispose shared building materials');
 for(const m of model.children)m.geometry.dispose();
});
test('opera reflecting pool is open to the sky and terraces match walking heights',()=>{
 const site=new OperaSite();site.root.updateMatrixWorld(true);
 site.root.traverse(m=>{if(m.isMesh)for(const v of m.geometry.attributes.position.array)assert.ok(Number.isFinite(v));});
 const ray=new Raycaster(new Vector3(-390,20,160),new Vector3(0,-1,0));
 assert.ok(inPolygon(-390,160,[operaPool]));
 const hit=ray.intersectObject(site.root,true)[0];assert.ok(hit);assert.ok(hit.point.y<.3,'plaza must not fill the pool');
 const world=new WalkWorld();world.setMap(tiles);
 for(const [x,z] of [[-520,210],[-410,190.5],[-410,202],[-430,220]]){
  ray.set(new Vector3(x,15,z),new Vector3(0,-1,0));const floor=ray.intersectObject(site.root,true)[0];
  assert.ok(floor);assert.ok(Math.abs(floor.point.y-operaGroundHeight(x,z))<.06);
  assert.ok(Math.abs(world.groundHeight(x,z)-floor.point.y)<.06);
 }
 assert.equal(world.canStand(-390,160),false);assert.equal(world.canStand(-520,210),true);
 site.dispose();
});
test('triangular entrance is cut through plaza and terrain rather than painted on top',()=>{
 const site=new OperaSite(),material=new MeshStandardMaterial(),ground=new Mesh(southAxisGround(),material),scene=new Group();scene.add(ground,site.root);scene.updateMatrixWorld(true);
 const ray=new Raycaster(new Vector3(-490,20,203),new Vector3(0,-1,0)),hit=ray.intersectObject(scene,true)[0];
 assert.ok(hit.point.y<-.5);assert.ok(Math.abs(hit.point.y-operaGroundHeight(-490,203))<.01);
 const world=new WalkWorld();world.setMap(tiles);const end=world.move([-490,212],0,-15,.42);
 assert.ok(Math.abs(end[1]-197)<.01);assert.ok(world.groundHeight(...end)<-1);
 assert.equal(world.cameraClear(-490,.2,197),true);
 site.dispose();ground.geometry.dispose();material.dispose();
});
