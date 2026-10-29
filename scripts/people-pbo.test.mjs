import test from 'node:test';
import assert from 'node:assert/strict';
import {DataTexture,RGBAFormat,FloatType} from 'three/webgpu';
import {PersonCrowd,PersonRig} from '../src/vendor/slop-newyork/pedestrians.js';

test('CPU bone animation marks the WebGL pose texture for upload on each near and far update',()=>{
 const crowd=new PersonCrowd(1),rig=new PersonRig({seed:.13});
 for(const [i,lod] of crowd.lods.entries()){
  const attr=lod.pose.value,texture=new DataTexture(attr.array,attr.count,1,RGBAFormat,FloatType);attr.pbo=texture;
  rig.update(.016,10,20,0,()=>.28);crowd.begin();crowd.add(rig,i?50:0);
  const before=texture.version;crowd.end();assert.ok(texture.version>before,'CPU upload must invalidate the PBO texture, not only the storage attribute');
  const snapshot=Float32Array.from(texture.image.data),version=texture.version;
  rig.update(.1,12,20,0,()=>.28);crowd.begin();crowd.add(rig,i?50:0);crowd.end();
  assert.ok(texture.version>version);assert.notDeepEqual(texture.image.data,snapshot);assert.equal(texture.image.data,attr.array);texture.dispose();
 }
 for(const lod of crowd.lods){lod.pose.dispose();lod.mesh.geometry.dispose();lod.mesh.material.dispose();}
});
