import type {Mesh,BufferGeometry,Object3D,Vector3} from 'three/webgpu';
export const PERSON_BONES:Record<string,number>;
export function buildPersonGeometry(detail?:number):BufferGeometry;
export class PersonRig {
 constructor(options?:object);
 pose:Float32Array;bind:Vector3[];s:number;seed:number;phase:number;speed:number;feet:any[];
 update(dt:number,x:number,z:number,heading:number,ground:(owner:any,x:number,z:number)=>number,owner?:any,air?:number,updatePose?:boolean):void;
 ride(root:Object3D,crank:number,options:object):void;
}
export class PersonCrowd {
 constructor(count:number,options?:object);meshes:Mesh[];lods:any[];
 begin():void;add(rig:PersonRig,distance?:number):void;end():void;
}
