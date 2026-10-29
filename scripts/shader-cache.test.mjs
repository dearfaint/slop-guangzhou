import test from 'node:test';
import assert from 'node:assert/strict';
import {BoxGeometry,InstancedMesh,MeshStandardMaterial,StorageInstancedBufferAttribute} from 'three/webgpu';
import RenderObject from 'three/src/renderers/common/RenderObject.js';

// Exercise the installed renderer's real cache-key implementation without creating a GPU device.
const key=object=>RenderObject.prototype.getMaterialCacheKey.call({
 object,material:object.material,geometry:object.geometry,
 _nodes:{getCustomProgramCacheKey:material=>material.customProgramCacheKey()},
 renderer:{backend:{isWebGPUBackend:true}},context:{id:1,stateKey:1},clippingContextCacheKey:'',
 getGeometryCacheKey:RenderObject.prototype.getGeometryCacheKey,
});
test('separate storage instance batches with equal layouts reuse the shader cache',()=>{
 const geometry=new BoxGeometry(),material=new MeshStandardMaterial();
 const a=new InstancedMesh(geometry,material,4),b=new InstancedMesh(geometry,material,8);
 a.instanceMatrix=new StorageInstancedBufferAttribute(a.instanceMatrix.array,16);
 b.instanceMatrix=new StorageInstancedBufferAttribute(b.instanceMatrix.array,16);
 try{assert.equal(key(a),key(b),'per-batch UUID must not force another TSL build');
  b.receiveShadow=true;assert.notEqual(key(a),key(b),'shadow layout must remain distinct');
 }finally{geometry.dispose();material.dispose();a.dispose();b.dispose();}
});
