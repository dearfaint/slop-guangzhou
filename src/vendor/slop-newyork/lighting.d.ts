import type {Scene,WebGPURenderer,Vector3,DirectionalLight} from 'three/webgpu';
export class LightingSystem {constructor(scene:Scene,renderer?:WebGPURenderer);activePresetId:string;sunLight:DirectionalLight;applyPreset(id:string):void;update(focus:Vector3):void;}
