import type {Scene,WebGPURenderer,Vector3} from 'three/webgpu';
export class LightingSystem {constructor(scene:Scene,renderer?:WebGPURenderer);activePresetId:string;applyPreset(id:string):void;update(focus:Vector3):void;}
