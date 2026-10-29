import { FOOT_TOP } from './road-level.ts';
import { CityAudioSystem } from './vendor/slop-newyork/audio-system.js';
import { signalState, junctionAhead } from './traffic-model.ts';
import { travelSettings, type WalkControls } from './walk-controls.ts';
import type { UrbanLife } from './urban-life.ts';
import type { TravelAvatar } from './travel-avatar.ts';
import type { TileData } from './types.ts';
import type { Camera, Vector3 } from 'three/webgpu';

// Source synthesis/spatial mixing is unchanged; this adapter supplies Guangzhou simulation coordinates.
export class CitySoundSources {
 private life:UrbanLife;private walker:WalkControls;private avatar:TravelAvatar;
 constructor(life:UrbanLife,walker:WalkControls,avatar:TravelAvatar){this.life=life;this.walker=walker;this.avatar=avatar;}
 playerSource(){return {id:this.walker,x:this.walker.position.x,y:this.walker.position.y,z:this.walker.position.z,seed:.13};}
 collect(listener:Vector3,elapsed:number){
  const actors=this.life.getAudioActors(),distance=(a:{x:number;y:number;z:number})=>Math.hypot(a.x-listener.x,a.y-listener.y,a.z-listener.z);
  const motors:any[]=[],sirens:any[]=[],people:any[]=[],signals:any[]=[];
  for(const car of actors.cars){
   const y=(car.y??.35)+.7;if(y<0&&listener.y>1)continue;
   const edge=actors.roads.edges.get(car.edge),ahead=edge?junctionAhead(actors.roads,edge,car.d):undefined;
   const green=!ahead?.node.signal||signalState(elapsed,ahead.node.id,ahead.axis)==='green';
   const blocked=car.speed<.2&&green&&actors.cars.some(other=>other!==car&&other.edge===car.edge&&other.d>car.d&&other.d-car.d<12);
   const source={id:car,kind:car.type===2?'bus':car.type===4?'suv':'sedan',x:car.x,y,z:car.z,speed:car.speed,load:car.speed>0?.35:0,verticalSpeed:0,heading:car.heading,police:car.type===3||car.type===7||car.type===8,player:false,seed:car.seed/4294967296,blocked,gain:1,range:160};
   const d=distance(source);if(d<180)motors.push(source);if(source.police&&d<220)sirens.push({...source,kind:'siren',range:200});
  }
  const walker=this.walker,speed=walker.signedSpeed??walker.movingSpeed;
  if(walker.active&&(walker.travel==='car'||walker.travel==='bike'||walker.travel==='balloon')){
   motors.unshift({id:walker,kind:walker.travel==='bike'?'cyclist':walker.travel==='balloon'?'helicopter':'sedan',x:walker.position.x,y:walker.position.y-travelSettings[walker.travel].height+.7,z:walker.position.z,speed:Math.abs(speed),load:Math.abs(speed)>.1?.65:0,verticalSpeed:0,heading:walker.heading+Math.PI,police:false,player:true,seed:.13,blocked:false,gain:1,range:160});
  }
  const person=(id:object,x:number,y:number,z:number,speed:number,rig:TravelAvatar['rig'],player=false)=>{
   const source={id,x,y,z,speed,grounded:!player||!this.walker.airHeight,seed:rig.seed,phase:rig.phase,player,conversation:null,leftX:rig.feet[0].px,leftY:rig.feet[0].py,leftZ:rig.feet[0].pz,rightX:rig.feet[1].px,rightY:rig.feet[1].py,rightZ:rig.feet[1].pz};
   if(distance(source)<45)people.push(source);
  };
  for(const actor of actors.people){const rig=actors.rig(actor);if(rig)person(actor,actor.x,actor.y??FOOT_TOP,actor.z,actor.speed,rig);}
  if(walker.active&&walker.travel==='walk')person(walker,walker.position.x,walker.position.y-travelSettings.walk.height,walker.position.z,walker.movingSpeed,this.avatar.rig,true);
  for(const signal of actors.signals){const source={id:signal,x:signal.x,y:1.2,z:signal.z,walk:signalState(elapsed,signal.id,signal.axis)==='green',seed:(signal.x+signal.z)*.013};if(distance(source)<35)signals.push(source);}
  const nearest=(a:any,b:any)=>distance(a)-distance(b);
  motors.sort((a,b)=>Number(b.player)-Number(a.player)||nearest(a,b));sirens.sort(nearest);people.sort((a,b)=>Number(b.player)-Number(a.player)||nearest(a,b));signals.sort(nearest);
  return {motors:motors.slice(0,10),sirens:sirens.slice(0,2),people:people.slice(0,6),signals:signals.slice(0,2),traffic:Math.min(1,motors.length/16),motion:walker.active?Math.abs(speed):0};
 }
}

export class CitySound {
 readonly engine:CityAudioSystem;
 private buildings:{minX:number;maxX:number;minZ:number;maxZ:number;minY:number;maxY:number}[]=[];
 constructor(life:UrbanLife,walker:WalkControls,avatar:TravelAvatar,onStateChange:()=>void){
  this.engine=new CityAudioSystem({sources:new CitySoundSources(life,walker,avatar),controllerManager:{nearColliders:(x:number,z:number,r:number)=>this.buildings.filter(b=>x+r>b.minX&&x-r<b.maxX&&z+r>b.minZ&&z-r<b.maxZ)},trafficSystem:{}},{onStateChange});
 }
 setMap(data:TileData[]){const seen=new Set<string>();this.buildings=[];for(const tile of data)for(const b of tile.buildings){if(seen.has(b.id))continue;seen.add(b.id);this.buildings.push({minX:Math.min(...b.p[0].map(p=>p[0])),maxX:Math.max(...b.p[0].map(p=>p[0])),minZ:Math.min(...b.p[0].map(p=>p[1])),maxZ:Math.max(...b.p[0].map(p=>p[1])),minY:b.base,maxY:b.h});}}
 update(dt:number,elapsed:number,camera:Camera,night:number){this.engine.update(dt,elapsed,camera,night>.5);}
 dispose(){this.engine.dispose();}
}
