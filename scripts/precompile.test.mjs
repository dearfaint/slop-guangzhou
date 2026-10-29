import test from 'node:test';
import assert from 'node:assert/strict';
import {Scene,Mesh,BoxGeometry,MeshStandardMaterial,PerspectiveCamera} from 'three/webgpu';
import {precompileScene} from '../src/precompile.ts';

test('startup compiles static shader layouts once, preserves distinct layouts, and restores scene flags',async()=>{
 const scene=new Scene(),material=new MeshStandardMaterial(),a=new Mesh(new BoxGeometry(),material),b=new Mesh(new BoxGeometry(),material),c=new Mesh(new BoxGeometry().deleteAttribute('uv'),material);
 b.visible=false;scene.add(a,b,c);const compiled=[],progress=[];let draws=0;
 const renderer={compileAsync:async object=>{compiled.push(object);},render(){draws++;}};
 const stats=await precompileScene(renderer,scene,new PerspectiveCamera(),ratio=>progress.push(ratio));
 assert.equal(compiled.length,2);assert.ok(compiled.includes(a)&&compiled.includes(c));assert.equal(stats.objects,2);assert.equal(draws,1);assert.equal(progress.at(-1),1);
 assert.equal(b.visible,false);assert.equal(a.frustumCulled,true);
 for(const object of [a,b,c])object.geometry.dispose();material.dispose();
});

test('a precompile failure restores visibility instead of exposing warm-up-only objects',async()=>{
 const scene=new Scene(),mesh=new Mesh(new BoxGeometry(),new MeshStandardMaterial());mesh.visible=false;scene.add(mesh);
 await assert.rejects(precompileScene({compileAsync:async()=>{throw new Error('device lost');},render(){}},scene,new PerspectiveCamera(),()=>{}),/device lost/);
 assert.equal(mesh.visible,false);assert.equal(mesh.frustumCulled,true);mesh.geometry.dispose();mesh.material.dispose();
});


test('WebGL prewarming limits outstanding shader jobs to one',async()=>{
 const scene=new Scene(),meshes=Array.from({length:4},()=>new Mesh(new BoxGeometry(),new MeshStandardMaterial()));scene.add(...meshes);
 let active=0,peak=0;
 const renderer={backend:{isWebGLBackend:true},async compileAsync(){peak=Math.max(peak,++active);await new Promise(resolve=>setTimeout(resolve,2));active--;},render(){}};
 try{await precompileScene(renderer,scene,new PerspectiveCamera(),()=>{});assert.equal(peak,1);}
 finally{for(const mesh of meshes){mesh.geometry.dispose();mesh.material.dispose();}}
});
