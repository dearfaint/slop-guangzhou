import {bicycleGrip,bicycleFoot} from '../src/bicycle-fit.ts';
import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {Vector3,Mesh,Bone,MeshStandardMaterial,BoxGeometry} from 'three/webgpu';
import {GLTFLoader} from 'three/addons/loaders/GLTFLoader.js';
import {MeshoptDecoder} from 'three/addons/libs/meshopt_decoder.module.js';
import {characterTypes,characterLook,CHARACTER_NEAR_LIMIT,pedestrianSpeed} from '../src/character-data.ts';
import {CharacterInstance,CharacterCrowd,CharacterLibrary} from '../src/characters.ts';
const folder=new URL('../public/data/characters/',import.meta.url);
function glb(name){const bytes=readFileSync(new URL(name,folder));return {bytes,json:JSON.parse(bytes.subarray(20,20+bytes.readUInt32LE(12)).toString())};}
const testLoader=new GLTFLoader();testLoader.setMeshoptDecoder(MeshoptDecoder);
async function fixture(index=0){const {bytes,json}=glb(`${characterTypes[index].id}-near.glb`);delete json.images;delete json.textures;delete json.samplers;json.extensionsUsed=(json.extensionsUsed||[]).filter(e=>e!=='EXT_texture_webp');json.extensionsRequired=(json.extensionsRequired||[]).filter(e=>e!=='EXT_texture_webp');for(const m of json.materials){delete m.normalTexture;delete m.occlusionTexture;delete m.emissiveTexture;delete m.pbrMetallicRoughness?.baseColorTexture;delete m.pbrMetallicRoughness?.metallicRoughnessTexture;}const payload=Buffer.from(JSON.stringify(json)),padded=Buffer.alloc(Math.ceil(payload.length/4)*4,32);payload.copy(padded);const bin=bytes.subarray(20+bytes.readUInt32LE(12)),out=Buffer.alloc(20+padded.length+bin.length);bytes.copy(out,0,0,12);out.writeUInt32LE(out.length,8);out.writeUInt32LE(padded.length,12);out.writeUInt32LE(0x4e4f534a,16);padded.copy(out,20);bin.copy(out,20+padded.length);return {gltf:await testLoader.parseAsync(out.buffer.slice(out.byteOffset,out.byteOffset+out.byteLength),''),brands:new Map()};}
test('all twelve approved city assets have animated near and single-surface far geometry',()=>{
 const catalog=JSON.parse(readFileSync(new URL('catalog.json',folder)));
 assert.equal(catalog.length,12);assert.ok(catalog.some(r=>r.age<.2));assert.ok(catalog.some(r=>r.age>.8));
 for(const r of catalog){const near=glb(r.near),far=glb(r.far);assert.deepEqual(new Set(near.json.animations.map(a=>a.name)),new Set(['Walk','Idle']));assert.equal(near.json.skins[0].joints.length,53);assert.ok(r.nearStats.triangles<40000);assert.ok(r.farStats.triangles<2500);assert.ok(near.bytes.length<800*1024,`${r.near} compressed under 800 KB`);assert.ok(far.bytes.length<90*1024,`${r.far} compressed under 90 KB`);assert.ok(near.json.extensionsUsed?.includes('EXT_meshopt_compression'));assert.ok(far.json.extensionsUsed?.includes('EXT_meshopt_compression'));assert.equal(far.json.meshes.length,1);assert.equal(far.json.meshes[0].primitives.length,1);assert.ok(far.json.meshes[0].primitives[0].attributes.COLOR_0!==undefined);assert.equal(far.json.images,undefined);}
});
test('stable appearance covers all ages; keys are fifty percent of eligible elders only',()=>{
 const seen=new Set();let eligible=0,keys=0,brands=0;for(let seed=0;seed<1000000;seed+=17){const look=characterLook(seed),recipe=characterTypes[look.index];seen.add(look.index);brands+=Number(look.brand!=='none');if(recipe.keys){eligible++;keys+=Number(look.keys);}else assert.equal(look.keys,false);assert.deepEqual(look,characterLook(seed));}
 assert.equal(seen.size,12);assert.ok(keys/eligible>.45&&keys/eligible<.55);assert.ok(brands>0);assert.ok(pedestrianSpeed(6)<pedestrianSpeed(0));
});
test('real skinned instances animate independently and bicycle IK holds hands and pedals',async()=>{
 const template=await fixture(),first=new CharacterInstance(template,0),second=new CharacterInstance(template,0);const bones=instance=>{const result=new Map();instance.root.traverse(o=>{if(o instanceof Bone)result.set(o.name,o);});return result;};const a=bones(first),b=bones(second),before=b.get('calf_l').quaternion.clone();first.update(.27,1.3);assert.ok(!a.get('calf_l').quaternion.equals(before));assert.ok(b.get('calf_l').quaternion.equals(before));
 for(const phase of [0,.8,2.5,4]){first.update(.05,0);first.ride(phase);for(const [side,sign] of [['l',1],['r',-1]]){const hand=first.root.worldToLocal(a.get('middle_01_'+side).getWorldPosition(new Vector3()));assert.ok(hand.distanceTo(bicycleGrip(sign,0).add(new Vector3(0,.016,0)))<.09,`hand ${side}: ${hand.toArray()}`);const angle=-Math.PI/2-phase+(sign<0?Math.PI:0),foot=first.root.worldToLocal(a.get('foot_'+side).getWorldPosition(new Vector3()));assert.ok(foot.distanceTo(bicycleFoot(sign,phase))<.06,`foot ${side}: ${foot.toArray()}`);}}
 for(let i=0;i<120;i++){first.update(.016,0);first.ride(i*.03);}const foot=a.get('foot_l').getWorldPosition(new Vector3()),toe=a.get('ball_l').getWorldPosition(new Vector3());assert.ok(toe.sub(foot).normalize().z>.95,'shoe points along the pedal instead of inheriting calf pitch');first.dispose();second.dispose();
});
test('crowd caps skeletons and releases them when camera moves to far geometry',async()=>{
 const library=new CharacterLibrary(),template=await fixture();library.near.set(0,template);library.far.set(0,new Mesh(new BoxGeometry(),new MeshStandardMaterial()));const crowd=new CharacterCrowd(library),people=Array.from({length:210},(_,i)=>({x:i*.01,z:2,heading:0,speed:1.2,seed:0,look:0}));crowd.update(people,new Vector3(0,2,0),.016);assert.equal(crowd.stats().detailed,CHARACTER_NEAR_LIMIT);assert.equal(crowd.batches.get(0).count,210-CHARACTER_NEAR_LIMIT);crowd.update(people,new Vector3(0,2,100),.016);assert.equal(crowd.stats().detailed,0);assert.equal(crowd.batches.get(0).count,210);crowd.dispose();
});
test('elder shoulder poses remain animated after repeated frames and keys follow the skinned waistband',async()=>{
 const template=await fixture(10),person=new CharacterInstance(template,10),bones=new Map();person.root.traverse(o=>{if(o instanceof Bone)bones.set(o.name,o);});
 person.update(.016,1.1);const shoulder=bones.get('upperarm_l').quaternion.clone();person.update(.016,1.1);assert.ok(shoulder.angleTo(bones.get('upperarm_l').quaternion)<.15,'constant animation channels must survive per-frame IK restoration');assert.equal(person.keys.entries.length,1);const key=person.keys.entries[0],point=new Vector3();
 for(let i=0;i<60;i++){person.root.position.set(i*.02,.28,3);person.update(.016,1.1);person.root.updateMatrixWorld(true);key.garment.skeleton.update();key.garment.getVertexPosition(key.vertex,point);key.garment.localToWorld(point);person.root.worldToLocal(point);point.z+=.008;assert.ok(point.distanceTo(key.root.position)<1e-6);}
 person.dispose();
});

test('running has flight and higher knee lift; walking retains grounded support without cumulative pose drift',async()=>{
 const template=await fixture(),sample=speed=>{const person=new CharacterInstance(template,0);let maxLift=0,flight=0,support=0;for(let i=0;i<240;i++){person.update(1/60,Math.min(speed,1.8));person.locomote(1/60,speed);person.root.updateMatrixWorld(true);const feet=['l','r'].map(side=>person.root.worldToLocal(person.bones.get('foot_'+side).getWorldPosition(new Vector3())));if(i>60){maxLift=Math.max(maxLift,...feet.map(p=>p.y));if(feet.every(p=>p.y>.08))flight++;if(feet.some(p=>Math.abs(p.y-.065)<.005))support++;for(const foot of feet)assert.ok(foot.y>=.06&&foot.y<.45);for(const side of ['l','r']){const shoulder=person.bones.get('upperarm_'+side).getWorldPosition(new Vector3()),elbow=person.bones.get('lowerarm_'+side).getWorldPosition(new Vector3());assert.ok(elbow.y<shoulder.y-.08,JSON.stringify({speed,i,shoulder:shoulder.toArray(),elbow:elbow.toArray()}));}}}person.dispose();return {maxLift,flight,support};};
 const walk=sample(1.4),run=sample(3.64);assert.ok(walk.maxLift<.15);assert.equal(walk.flight,0);assert.ok(walk.support>170);assert.ok(run.maxLift>.32);assert.ok(run.flight>15);assert.ok(run.support>80);
});
test('shoulders swing in opposition to the stride while the two arms counterbalance each other',async()=>{
 const template=await fixture();
 for(const speed of [1.4,2.4,3.64]){
  const person=new CharacterInstance(template,0);let previous,checked=0;
  try{
   for(let i=0;i<960;i++){
    person.update(1/240,Math.min(speed,1.8));person.locomote(1/240,speed);person.root.updateMatrixWorld(true);
    const position=(bone,side)=>person.root.worldToLocal(person.bones.get(bone+'_'+side).getWorldPosition(new Vector3()));
    const angle=side=>{const arm=position('lowerarm',side).sub(position('upperarm',side));return Math.atan2(arm.z,-arm.y);};
    const stride=position('foot','l').z-position('foot','r').z,left=angle('l'),right=angle('r');
    if(i>240){
     assert.ok(stride*left<=1e-7&&stride*right>=-1e-7,'upper arms oppose their same-side leading leg');
     assert.ok(Math.abs(left+right)<.001,'the arms counterbalance rather than reaching forward together');
     if(previous){const legDelta=stride-previous.stride,armDelta=left-previous.left;if(Math.abs(legDelta)>.0001&&Math.abs(armDelta)>.0001){checked++;assert.ok(legDelta*armDelta<0,'shoulder swing reverses with the stride');}}
    }
    previous={stride,left};
   }
   assert.ok(checked>300,'check shoulder motion throughout multiple strides');
  }finally{person.dispose();}
 }
});

test('the actual city crowd keeps anatomical arm poses across all twelve character types',async()=>{
 const library=new CharacterLibrary();for(let i=0;i<12;i++)library.near.set(i,await fixture(i));
 const crowd=new CharacterCrowd(library),people=Array.from({length:12},(_,i)=>({x:(i-6)*1.5,z:5,heading:.7,speed:pedestrianSpeed(i),seed:i,look:i}));let checks=0;
 try{
  for(let frame=0;frame<480;frame++){
   crowd.update(people,new Vector3(0,2,0),1/120);
   if(frame<120)continue;
   for(const actor of people){
    const person=crowd.instances.get(actor);assert.ok(person,'city update creates the near character');person.root.updateMatrixWorld(true);
    const position=(name,side)=>person.root.worldToLocal(person.bones.get(name+'_'+side).getWorldPosition(new Vector3()));
    const stride=position('foot','l').z-position('foot','r').z;
    for(const [side,sign] of [['l',1],['r',-1]]){
     const upper=position('lowerarm',side).sub(position('upperarm',side)).normalize(),fore=position('hand',side).sub(position('lowerarm',side)).normalize();
     const swing=Math.atan2(upper.z,-upper.y),bend=Math.atan2(upper.z*fore.y-upper.y*fore.z,upper.y*fore.y+upper.z*fore.z);
     assert.ok(stride*swing*sign<=1e-7,`city character ${actor.seed} swings its upper arm against the leading leg`);
     assert.ok(bend>.04&&bend<1.85,`city character ${actor.seed} keeps its elbow bending forward`);
     assert.ok(Math.abs(upper.x)<.12&&Math.abs(fore.x)<.12,'no sideways elbow flare');
     const fingers=position('middle_01',side).sub(position('hand',side)).normalize();assert.ok(fingers.dot(fore)>.94,'neutral wrist');checks++;
    }
   }
  }
  assert.equal(checks,360*12*2);
 }finally{crowd.dispose();}
});

test('walking and running flex elbows forward in the sagittal plane and keep wrists aligned',async()=>{
 const person=new CharacterInstance(await fixture(),0);
 try{
  for(const speed of [1.4,2.4,3.64])for(let i=0;i<360;i++){
   person.update(1/120,Math.min(speed,1.8));person.locomote(1/120,speed);person.root.updateMatrixWorld(true);
   if(i<120)continue;
   for(const side of ['l','r']){
    const position=name=>person.root.worldToLocal(person.bones.get(name+'_'+side).getWorldPosition(new Vector3()));
    const upper=position('lowerarm').sub(position('upperarm')).normalize(),fore=position('hand').sub(position('lowerarm')).normalize();
    const bend=Math.atan2(upper.z*fore.y-upper.y*fore.z,upper.y*fore.y+upper.z*fore.z);
    assert.ok(bend>.04&&bend<1.85,`elbow must bend forward, speed ${speed}, ${side}, bend ${bend}`);
    assert.ok(Math.abs(upper.x)<.12&&Math.abs(fore.x)<.12,'arms swing by the body, without sideways flaring');
    const fingers=position('middle_01').sub(position('hand')).normalize();assert.ok(fingers.dot(fore)>.94,'wrist follows the forearm rather than flopping sideways');
   }
  }
 }finally{person.dispose();}
});
