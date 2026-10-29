import type {Camera} from 'three/webgpu';
export class CityAudioSystem {
 constructor(simulation:any,options?:{onStateChange?:()=>void});
 enabled:boolean;supported:boolean;ready:boolean;context:AudioContext|null;
 honk():void;initialize():void;unlock():void;setEnabled(enabled:boolean):void;reset():void;suspend():Promise<void>|undefined;
 update(dt:number,elapsed:number,camera:Camera,night?:boolean):void;dispose():void;
}
