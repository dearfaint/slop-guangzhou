// Compress public/data/characters/*.glb in place:
// - near: 512px WebP textures + animation keyframe resample + meshopt (keep float32 POSITION so
//   bind-space bounding boxes for brand placement and elder waist-key attachment stay exact).
// - far: weld + meshopt (keep float32 POSITION so applyMatrix4 works without normalized Int16).
import {realpathSync,readFileSync,writeFileSync} from 'node:fs';
import {createRequire} from 'node:module';
import {MeshoptEncoder,MeshoptDecoder} from 'meshoptimizer';

const require=createRequire(realpathSync(new URL('../node_modules/@gltf-transform/cli/package.json',import.meta.url)));
const {NodeIO}=require('@gltf-transform/core');
const {ALL_EXTENSIONS,EXTMeshoptCompression}=require('@gltf-transform/extensions');
const {dedup,weld,reorder,quantize,resample,textureCompress,prune}=require('@gltf-transform/functions');
const sharp=require('sharp');

const dir=new URL('../public/data/characters/',import.meta.url);
const catalogPath=new URL('catalog.json',dir);
const catalog=JSON.parse(readFileSync(catalogPath,'utf8'));

function describe(path){
 const b=readFileSync(path),j=JSON.parse(b.subarray(20,20+b.readUInt32LE(12)).toString());
 return {bytes:b.length,triangles:j.meshes.reduce((s,m)=>s+m.primitives.reduce((t,p)=>t+j.accessors[p.indices].count/3,0),0),animations:(j.animations??[]).map(a=>a.name),meshes:j.meshes.length,images:(j.images??[]).length,vertexColors:j.meshes.every(m=>m.primitives.every(p=>'COLOR_0' in p.attributes))};
}

await MeshoptEncoder.ready;await MeshoptDecoder.ready;
const io=new NodeIO().registerExtensions(ALL_EXTENSIONS).registerDependencies({'meshopt.encoder':MeshoptEncoder,'meshopt.decoder':MeshoptDecoder});

let beforeBytes=0,afterBytes=0;
for(const entry of catalog){
 const nearPath=new URL(entry.near,dir),farPath=new URL(entry.far,dir);
 beforeBytes+=readFileSync(nearPath).length+readFileSync(farPath).length;
 {
  const doc=await io.read(nearPath.pathname);
  await doc.transform(
   dedup(),
   resample(),
   textureCompress({encoder:sharp,targetFormat:'webp',resize:[512,512]}),
   reorder({encoder:MeshoptEncoder,target:'size'}),
   quantize({pattern:/^(NORMAL|TEXCOORD|WEIGHTS|JOINTS)(_\d+)?$/,quantizeNormal:8}),
   prune()
  );
  doc.createExtension(EXTMeshoptCompression).setRequired(true).setEncoderOptions({method:EXTMeshoptCompression.EncoderMethod.FILTER});
  await io.write(nearPath.pathname,doc);
 }
 {
  const doc=await io.read(farPath.pathname);
  await doc.transform(
   dedup(),
   weld(),
   reorder({encoder:MeshoptEncoder,target:'size'}),
   quantize({pattern:/^(NORMAL|COLOR)(_\d+)?$/,quantizeNormal:8,quantizeColor:8}),
   prune()
  );
  doc.createExtension(EXTMeshoptCompression).setRequired(true).setEncoderOptions({method:EXTMeshoptCompression.EncoderMethod.FILTER});
  await io.write(farPath.pathname,doc);
 }
 entry.nearStats=describe(nearPath);entry.farStats=describe(farPath);
 afterBytes+=entry.nearStats.bytes+entry.farStats.bytes;
 console.log(entry.id,`near ${(entry.nearStats.bytes/1024).toFixed(0)} KB · far ${(entry.farStats.bytes/1024).toFixed(0)} KB`);
}
writeFileSync(catalogPath,JSON.stringify(catalog,null,2)+'\n');
console.log(`total ${(beforeBytes/1048576).toFixed(2)} MB -> ${(afterBytes/1048576).toFixed(2)} MB`);
