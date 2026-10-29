import type { Camera, Material, Mesh, Object3D, Scene, WebGPURenderer } from 'three/webgpu';
// Adapted from Slop New York main.js: bounded parallel shader jobs avoid serial cold-cache compilation.
export async function precompileScene(renderer:WebGPURenderer,scene:Scene,camera:Camera,progress:(ratio:number)=>void){
 const visibility=new Map<Object3D,{visible:boolean;culled:boolean}>(),pipelines=new Set<Object3D>(),jobs:Object3D[][]=[],byMaterial=new Map<unknown,Object3D[]>(),staticPrograms=new Set<string>();
 scene.traverse(object=>{visibility.set(object,{visible:object.visible,culled:object.frustumCulled});object.visible=!object.userData.unusedBatch||object.name.startsWith('slop-');object.frustumCulled=false;});
 scene.updateMatrixWorld(true);
 scene.traverseVisible(object=>{
  const mesh=object as Mesh;if(!mesh.isMesh)return;
  const pipeline=object.userData.sharesPipelineWith??object;if(pipelines.has(pipeline))return;pipelines.add(pipeline);
  if('isInstancedMesh' in mesh||Array.isArray(mesh.material)){jobs.push([object]);return;}
  // Match RenderObject's structural geometry key; static meshes with equal material/layout share a node builder.
  const attributes=Object.keys(mesh.geometry.attributes).sort().map(name=>{const a=mesh.geometry.attributes[name];return [name,a.itemSize,a.normalized,'offset' in a?a.offset:0,'data' in a?(a as import('three/webgpu').InterleavedBufferAttribute).data.stride:0];});
  const signature=JSON.stringify([mesh.material.uuid,attributes,!!mesh.geometry.index,mesh.receiveShadow,Object.values(mesh.geometry.morphAttributes).flat().map(a=>'id' in a?a.id:a.data.uuid)]);
  if(staticPrograms.has(signature))return;staticPrograms.add(signature);
  let job=byMaterial.get(mesh.material);if(!job){job=[];byMaterial.set(mesh.material,job);jobs.push(job);}job.push(object);
 });
 const started=performance.now(),timings:{name:string;ms:number}[]=[];
 let cursor=0,done=0,compileMs=0,warmupMs=0,warmupObjects=0;
 try{
  // WebGL drivers may compile synchronously; avoid queuing sixteen heavy GLSL jobs at once.
  const workers=(renderer.backend as {isWebGLBackend?:boolean})?.isWebGLBackend?1:16;
  await Promise.all(Array.from({length:workers},async()=>{
   while(cursor<jobs.length){const job=jobs[cursor++];for(const object of job){await new Promise(resolve=>setTimeout(resolve,0));const start=performance.now();await renderer.compileAsync(object,camera,scene);timings.push({name:`${object.name||object.type} / ${Array.isArray((object as Mesh).material)?'multi':((object as Mesh).material as Material).type}`,ms:Math.round(performance.now()-start)});}progress(++done/jobs.length);}
  }));
  compileMs=Math.round(performance.now()-started);
  // Only shared-pipeline representatives need an uncullled warm-up draw.
  scene.traverse(object=>{if(object.userData.sharesPipelineWith)object.visible=false;});
  scene.traverseVisible(object=>{if((object as Mesh).isMesh)warmupObjects++;});
  const warmupStarted=performance.now();renderer.render(scene,camera);warmupMs=Math.round(performance.now()-warmupStarted);
 }finally{for(const [object,state] of visibility){object.visible=state.visible;object.frustumCulled=state.culled;}}
 return {jobs:jobs.length,objects:timings.length,compileMs,warmupMs,warmupObjects,ms:Math.round(performance.now()-started),slowest:timings.sort((a,b)=>b.ms-a.ms).slice(0,10)};
}
