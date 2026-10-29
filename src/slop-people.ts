import { FOOT_TOP } from './road-level.ts';
import { pearlParkFloor, pearlParkDeckHeight } from './pearl-park-layout.ts';
import { Group, Vector3 } from 'three/webgpu';
import { PersonCrowd, PersonRig } from './vendor/slop-newyork/pedestrians.js';
interface Person {x:number;z:number;heading:number;speed:number;seed:number;look?:number;y?:number}
export class SlopCrowd {
 readonly root=new Group();
 private crowd=new PersonCrowd(340);
 private rigs=new Map<Person,PersonRig>();
 private detailed=0;
 constructor(){this.root.name='Slop New York procedural people';this.root.add(...this.crowd.meshes);}
 getRig(person:Person){return this.rigs.get(person);}
 update(people:Person[],camera:Vector3,dt:number){
  const current=new Set(people);for(const person of this.rigs.keys())if(!current.has(person))this.rigs.delete(person);
  this.crowd.begin();this.detailed=0;
  for(const person of people){
   let rig=this.rigs.get(person);
   if(!rig){const seed=(person.look??person.seed)>>>0;rig=new PersonRig({seed:seed/4294967296*1000,female:seed%2===0,scale:.91+(seed%15)/100,girth:.9+(seed%24)/100,hair:seed%2===0?.9:.2});this.rigs.set(person,rig);}
   const distance=Math.hypot(person.x-camera.x,person.z-camera.z,camera.y-1);
   rig.update(dt,person.x,person.z,person.heading,()=>pearlParkDeckHeight(person.x,person.z)??(pearlParkFloor(person.x,person.z)!==undefined?pearlParkFloor(person.x,person.z)!+.28:person.y??FOOT_TOP),null,0,distance<950);
   if(distance>=950)continue;
   this.crowd.add(rig,distance);if(distance<34)this.detailed++;
  }
  this.crowd.end();
 }
 stats(){return {detailed:this.detailed,near:1,far:1,errors:[] as string[],source:'slop-newyork'};}
 dispose(){for(const lod of this.crowd.lods){lod.pose.dispose();lod.mesh.material.dispose();}this.rigs.clear();this.root.clear();}
}
