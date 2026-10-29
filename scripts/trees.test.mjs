import test from 'node:test';
import assert from 'node:assert/strict';
import { Vector3 } from 'three/webgpu';
import { ProceduralTrees } from '../src/trees.ts';

const trees=Array.from({length:40},(_,i)=>({x:i*17,z:i%3*20,height:8}));
test('coordinate-seeded trees vary geometry and retain their appearance across rebuilds',()=>{
 const a=new ProceduralTrees(trees),b=new ProceduralTrees(trees);
 assert.equal(a.meshes.length,2);
 for(let i=0;i<2;i++){
  assert.deepEqual(a.meshes[i].instanceMatrix.array,b.meshes[i].instanceMatrix.array);
  assert.deepEqual(a.meshes[i].instanceColor.array,b.meshes[i].instanceColor.array);
  assert.ok(a.meshes[i].instanceMatrix.array.every(Number.isFinite));
 }
 const branches=a.meshes[0].count,clusters=a.meshes[1].count;
 assert.ok(branches>=trees.length*6&&branches<=trees.length*8);
 assert.ok(clusters>=trees.length*9&&clusters<=trees.length*13);
 const colors=a.meshes[1].instanceColor.array;
 assert.ok(new Set(Array.from({length:clusters},(_,i)=>colors.slice(i*3,i*3+3).join(','))).size>30);
 // A tree has at most 8 five-sided open cylinders and 13 four-plane leaf clusters.
 assert.ok(a.meshes.reduce((sum,m)=>sum+m.geometry.index.count/3*m.count,0)<=trees.length*268);
 assert.equal(a.meshes[1].material.transparent,false);
 assert.equal(a.meshes[1].material.map.image.data.byteLength,65536);
 const mask=a.meshes[1].material.map.image.data;
 const opaque=mask.filter((v,i)=>i%4===3&&v===255).length;
 assert.ok(opaque>2000&&opaque<10000,'leaf mask has visible foliage and gaps');
 a.dispose();b.dispose();
});
test('tree culling preserves matching transforms and tints and restores hidden trees',()=>{
 const source=new ProceduralTrees(trees),single=new ProceduralTrees([trees[20]]);
 source.update(new Vector3(trees[20].x,2,trees[20].z),1);
 for(let i=0;i<2;i++){
  const mesh=source.meshes[i],expected=single.meshes[i];
  assert.equal(mesh.count,expected.count);
  assert.deepEqual(mesh.instanceMatrix.array.slice(0,mesh.count*16),expected.instanceMatrix.array.slice(0,mesh.count*16));
  assert.deepEqual(mesh.instanceColor.array.slice(0,mesh.count*3),expected.instanceColor.array.slice(0,mesh.count*3));
 }
 source.update(new Vector3(10000,0,10000));assert.ok(source.meshes.every(m=>m.count===0));
 source.update(new Vector3(300,0,0));
 const rebuilt=new ProceduralTrees(trees);
 for(let i=0;i<2;i++){
  assert.equal(source.meshes[i].count,rebuilt.meshes[i].count);
  assert.deepEqual(source.meshes[i].instanceMatrix.array,rebuilt.meshes[i].instanceMatrix.array);
  assert.deepEqual(source.meshes[i].instanceColor.array,rebuilt.meshes[i].instanceColor.array);
 }
 source.dispose();single.dispose();rebuilt.dispose();
 assert.equal(new ProceduralTrees([]).meshes.length,0);
});
