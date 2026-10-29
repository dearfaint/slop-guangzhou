import test from 'node:test';
import assert from 'node:assert/strict';
import {advanceHours,timeLighting,wrapHours} from '../src/time-model.ts';

test('day, golden hour and night have distinct continuous lighting',()=>{
 const day=timeLighting(12),dusk=timeLighting(18),night=timeLighting(22);
 assert.equal(day.night,0);assert.equal(night.night,1);
 assert.ok(dusk.night>0&&dusk.night<1);
 assert.ok(day.sunIntensity>dusk.sunIntensity&&dusk.sunIntensity>=night.sunIntensity);
 assert.ok(day.ambientIntensity>night.ambientIntensity*5);
 assert.ok(dusk.horizon[0]>dusk.horizon[2]);
 assert.ok(dusk.ambient[0]>dusk.ambient[2],'sunset ambience warms building reflections');
 assert.ok(day.zenith[2]>day.zenith[0]);
 assert.ok(night.moonIntensity>0);
});
test('clock wraps at midnight and completes one eight-minute day',()=>{
 assert.equal(wrapHours(-1),23);assert.equal(wrapHours(49),1);
 assert.ok(Math.abs(advanceHours(23.99,.4)-.01)<1e-10);
 assert.equal(advanceHours(7,480),7);assert.equal(advanceHours(7,-1),7);
});
test('lighting is continuous across keyframes, dawn, dusk and midnight',()=>{
 for(let h=0;h<24;h+=.01){
  const a=timeLighting(h),b=timeLighting(h+.001);
  for(const key of ['night','sunIntensity','ambientIntensity','moonIntensity','exposure'])assert.ok(Math.abs(a[key]-b[key])<.01,`${key} at ${h}`);
  for(const key of ['zenith','horizon','fog'])for(let i=0;i<3;i++)assert.ok(Math.abs(a[key][i]-b[key][i])<.005,`${key} at ${h}`);
 }
 const a=timeLighting(24-.0001),b=timeLighting(.0001);
 for(const key of ['zenith','horizon','fog'])for(let i=0;i<3;i++)assert.ok(Math.abs(a[key][i]-b[key][i])<.001);
});

test('active city lighting preserves distant night landmarks and restores daylight on preset changes',async()=>{
 const {Scene}=await import('three/webgpu');
 const {LightingSystem}=await import('../src/vendor/slop-newyork/lighting.js');
 const {cityUniforms}=await import('../src/vendor/slop-newyork/tsl-materials.js');
 const scene=new Scene(),lighting=new LightingSystem(scene);
 const day={fog:scene.fog.density,sun:lighting.sunLight.intensity,sky:lighting.uSkyExposure.value,interior:cityUniforms.uInteriorGlow.value};
 for(const preset of ['twilight','midnight']){
  lighting.applyPreset(preset);
  // At the 3km skyline, haze should retain most facade light rather than hiding it behind the nearer tower.
  assert.ok(Math.exp(-((scene.fog.density*3000)**2))>.75,`${preset} skyline transmission`);
  assert.ok(cityUniforms.uInteriorGlow.value>day.interior,'interiors light up after sunset');
  assert.equal(lighting.uFogDensity.value,scene.fog.density,'aerial and standard fog use the same density');
 }
 lighting.applyPreset('midday');
 assert.deepEqual({fog:scene.fog.density,sun:lighting.sunLight.intensity,sky:lighting.uSkyExposure.value,interior:cityUniforms.uInteriorGlow.value},day);
 scene.traverse(object=>{object.geometry?.dispose();object.material?.dispose();});
 lighting.sunLight.dispose();
});
