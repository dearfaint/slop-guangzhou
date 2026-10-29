import test from 'node:test';
import assert from 'node:assert/strict';
import {Vector3} from 'three/webgpu';
import {CitySoundSources} from '../src/city-sound.ts';
import {UrbanLife} from '../src/urban-life.ts';
import {TravelAvatar} from '../src/travel-avatar.ts';
import {createSynthResources} from '../src/vendor/slop-newyork/audio-synthesis.js';
import {createEventResources} from '../src/vendor/slop-newyork/audio-events.js';

test('reference synthesis produces non-silent finite engine, bicycle, footsteps and signal buffers',()=>{
 const ctx={sampleRate:8000,createBuffer(channels,length,sampleRate){const data=Array.from({length:channels},()=>new Float32Array(length));return {sampleRate,length,duration:length/sampleRate,numberOfChannels:channels,getChannelData:i=>data[i]};},createPeriodicWave(real,imag){return {real,imag};}};
 const resources=createEventResources(ctx,createSynthResources(ctx));
 const buffers=[resources.noise,resources.ratchet,resources.chain,resources.signalTick,resources.signalWalk,...resources.footsteps,...resources.horns,...resources.syllables.flat(),...Object.values(resources.combustion).flatMap(bank=>Object.values(bank).filter(v=>v?.getChannelData))];
 for(const buffer of buffers){const samples=buffer.getChannelData(0);assert.ok(samples.every(Number.isFinite));assert.ok(samples.some(v=>Math.abs(v)>.001));}
 assert.equal(resources.footsteps.length,8);assert.equal(resources.syllables.length,6);
});

test('Guangzhou sound adapter selects local traffic and switches the player voice with travel mode',()=>{
 const life=new UrbanLife(),avatar=new TravelAvatar();
 const roads=[{id:'road',p:[[0,-200],[0,200]],w:12,kind:'secondary',bridge:false,tunnel:false},{id:'walk',p:[[5,-200],[5,200]],w:3,kind:'footway',bridge:false,tunnel:false}];
 const walker={active:true,travel:'car',position:new Vector3(0,1.15,0),movingSpeed:3,signedSpeed:3,heading:0};
 try{
  life.setMap([{roads,buildings:[],areas:[]}]);life.update(0,0,0,new Vector3());
  const sources=new CitySoundSources(life,walker,avatar),first=sources.collect(new Vector3(0,2,0),0);
  assert.equal(first.motors[0].id,walker);assert.equal(first.motors[0].kind,'sedan');assert.ok(first.motors.length<=10);
  walker.travel='bike';assert.equal(sources.collect(new Vector3(0,2,0),0).motors[0].kind,'cyclist');
  walker.travel='walk';walker.position.y=2.1;avatar.update({...walker,thirdPerson:true},.016);
  const walking=sources.collect(new Vector3(0,2,0),0);assert.ok(walking.people.some(p=>p.id===walker));assert.ok(!walking.motors.some(p=>p.id===walker));
  const far=sources.collect(new Vector3(10000,2,10000),0);assert.equal(far.people.length,0);assert.equal(far.sirens.length,0);
 }finally{life.dispose();avatar.dispose();}
});

test('motor pool replaces synthesis when the same player changes vehicle and releases old nodes',async()=>{
 const {CityAudioSystem}=await import('../src/vendor/slop-newyork/audio-system.js');
 const param=()=>({value:0,cancelScheduledValues(){},setValueAtTime(){},setTargetAtTime(){},linearRampToValueAtTime(){},exponentialRampToValueAtTime(){}});
 let disconnected=0;
 const node=()=>new Proxy({connect(target){return target;},disconnect(){disconnected++;},start(){},stop(){},setPeriodicWave(){}},{get(object,key){if(key in object)return object[key];return object[key]=param();}});
 const ctx=new Proxy({currentTime:0,sampleRate:8000,createBuffer(channels,length,sampleRate){const data=Array.from({length:channels},()=>new Float32Array(length));return {sampleRate,length,duration:length/sampleRate,numberOfChannels:channels,getChannelData:i=>data[i]};},createPeriodicWave(){return {}; }},{get(object,key){if(key in object)return object[key];if(String(key).startsWith('create'))return node;}});
 const engine=Object.create(CityAudioSystem.prototype);
 Object.assign(engine,{context:ctx,resources:createSynthResources(ctx),mix:node(),reflections:node(),acoustics:{obstruction:()=>0,enclosure:0},listener:{x:0,y:0,z:0},motorParams:{}});
 const id={},source={id,kind:'sedan',x:0,y:1,z:0,heading:0,player:true,seed:.13,speed:3,load:.5,range:160};
 const pool=new Map();let previous;
 for(const [index,kind] of ['sedan','cyclist','helicopter','sedan'].entries()){
  engine.updatePool(pool,[{...source,kind}],1,index*.04,.04);
  const slot=pool.get(id);assert.equal(slot.kind,kind);assert.equal(pool.size,1);
  if(previous){assert.notEqual(slot.voice,previous.voice);assert.notEqual(slot.emitter,previous.emitter);assert.ok(disconnected>0);}
  engine.updatePool(pool,[{...source,kind}],1,index*.04+.01,.04);assert.equal(pool.get(id),slot,'same mode must reuse the current voice');
  previous=slot;
 }
 engine.updatePool(pool,[],1,1,.04);engine.updatePool(pool,[],1,1.2,.04);assert.equal(pool.size,0,'walking or leaving roaming must retire the motor');
});
