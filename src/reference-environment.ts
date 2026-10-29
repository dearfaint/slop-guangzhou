import { LightingSystem } from './vendor/slop-newyork/lighting.js';
import { advanceHours } from './time-model.ts';
import type { Scene, WebGPURenderer, Vector3 } from 'three/webgpu';
export class ReferenceEnvironment {
 autoCycle=false;private currentHours=12;
 readonly lighting:LightingSystem;
 constructor(scene:Scene,renderer:WebGPURenderer){this.lighting=new LightingSystem(scene,renderer);this.setTime(12);}
 get hours(){return this.currentHours;}
 get night(){return this.lighting.activePresetId==='midnight'?1:this.lighting.activePresetId==='twilight'?.65:0;}
 setTime(hours:number){this.currentHours=hours;this.lighting.applyPreset(hours<6||hours>=21?'midnight':hours>=19?'twilight':hours>=16?'golden':'midday');}
 update(dt:number,position:Vector3){if(this.autoCycle)this.setTime(advanceHours(this.currentHours,dt));this.lighting.update(position);}
}
