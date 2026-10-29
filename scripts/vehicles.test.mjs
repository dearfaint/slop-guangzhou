import {readFileSync} from 'node:fs';
import test from 'node:test';
import assert from 'node:assert/strict';
import {vehicleGeometry} from '../src/vehicle-geometry.ts';
import {vehicleSpecs,vehicleType,sirenLevel} from '../src/vehicle-model.ts';
import {UrbanLife} from '../src/urban-life.ts';
import {PoliceSiren} from '../src/police-siren.ts';
import {Vector3,Color} from 'three/webgpu';
test('all ten metre-scale classes populate and extra vehicle geometry is finite and bounded',()=>{
 assert.equal(new Set(Array.from({length:84},(_,i)=>vehicleType(i))).size,10);
 for(let type=4;type<vehicleSpecs.length;type++)for(const g of Object.values(vehicleGeometry(type))){
  assert.ok(g.attributes.position.count>0);assert.ok([...g.attributes.position.array,...g.attributes.normal.array].every(Number.isFinite));g.computeBoundingBox();
  assert.ok(g.boundingBox.max.x<=vehicleSpecs[type].width/2+.2);assert.ok(g.boundingBox.min.y>=.27);assert.ok(g.boundingBox.max.z<=vehicleSpecs[type].length/2+.1);g.dispose();
 }
});
test('fleet renders every class and emergency lights alternate without overflowing instance buffers',()=>{
 const root=new URL('../public/data/',import.meta.url),read=name=>JSON.parse(readFileSync(new URL(name,root),'utf8'));const life=new UrbanLife();life.setMap(read('manifest.json').tiles.map(t=>read(t.id+'.json')));
 assert.equal(life.getStats().vehicleTypes,5);life.people=[];const police=life.cars.find(a=>a.type===3);life.cars=[police];
 const camera=new Vector3(police.x,0,police.z);assert.equal(life.policeDistance(camera),.35);
 const a=new Color(),b=new Color();life.update(0,0,0,camera);life.batches.emergencyLights.getColorAt(0,a);life.update(0,.15,0,camera);life.batches.emergencyLights.getColorAt(0,b);assert.ok(!a.equals(b));
 for(const mesh of Object.values(life.batches)){assert.ok(mesh.count<=mesh.instanceMatrix.count);assert.ok([...mesh.instanceMatrix.array].every(Number.isFinite));}
 life.cars=[];assert.equal(life.policeDistance(camera),Infinity);life.dispose();
});
test('siren falls off with distance and is silent outside audible range',()=>{
 assert.ok(sirenLevel(0)>sirenLevel(20));assert.ok(sirenLevel(20)>sirenLevel(100));assert.equal(sirenLevel(220),0);assert.equal(sirenLevel(Infinity),0);
});
test('audio starts only after enabling, suspends when hidden or off, and releases on disposal',async()=>{
 let listener,created=0,stopped=false,closed=false;const parameter=()=>({value:0,setTargetAtTime(v){this.value=v;}});
 const context={currentTime:0,createGain:()=>({gain:parameter(),connect(){}}),createOscillator:()=>({frequency:parameter(),connect(){},start(){},stop(){stopped=true;}}),async resume(){this.state='running';},async suspend(){this.state='suspended';},async close(){closed=true;}};
 const oldDocument=globalThis.document,oldAudio=globalThis.AudioContext;
 globalThis.document={hidden:false,addEventListener(_,fn){listener=fn;},removeEventListener(_,fn){assert.equal(fn,listener);}};globalThis.AudioContext=class{constructor(){created++;return context;}};
 try{const siren=new PoliceSiren();assert.equal(created,0);await siren.setEnabled(true);assert.equal(context.state,'running');siren.update(0,.5);assert.ok(siren.gain.gain.value>0);assert.equal(siren.oscillator.frequency.value,1200);
 document.hidden=true;listener();assert.equal(context.state,'suspended');siren.update(0,1);assert.equal(siren.gain.gain.value,0);
 document.hidden=false;listener();assert.equal(context.state,'running');await siren.setEnabled(false);assert.equal(context.state,'suspended');assert.equal(siren.enabled,false);assert.equal(siren.gain.gain.value,0);siren.dispose();assert.ok(stopped&&closed);
 }finally{if(oldDocument===undefined)delete globalThis.document;else globalThis.document=oldDocument;if(oldAudio===undefined)delete globalThis.AudioContext;else globalThis.AudioContext=oldAudio;}
});

test('reference fleet contains 200 cars plus 12 buses with the source taxi and police proportions',async()=>{
 const {referenceVehicleType}=await import('../src/vehicle-model.ts');const fleet=Array.from({length:212},(_,i)=>referenceVehicleType(i));
 assert.equal(fleet.filter(v=>v===2).length,12);assert.equal(fleet.filter(v=>v===1).length,40);assert.equal(fleet.filter(v=>v===3).length,5);assert.equal(new Set(fleet).size,5);
});
