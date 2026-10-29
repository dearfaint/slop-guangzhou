import {circulatingTrafficEdges} from './traffic-circulation.ts';
import {junctionApproaches} from './junction-layout.ts';
import {WalkWorld} from './walk-world.ts';
import {segmentDistance} from './street-layout.ts';
import {vehiclesOverlap,type VehicleBody} from './vehicle-collision.ts';
import { HUACHENG_SPAWN } from './startup.ts';
import { BODY_SPECS, BUS_SPEC, buildLoftedBusBodyGeometry, buildBusWheelGeo, createLoftedBusMaterial, createBusWheelMaterial, buildCarGeometry, buildCarProxyGeometry, createLoftedCarMaterial } from './vendor/slop-newyork/actor-models.js';
import { signalHousingGeometry } from './slop-street-models.ts';
import { SlopCrowd } from './slop-people.ts';
import { pedestrianSpeed } from './character-data.ts';
import { Group, InstancedMesh, BoxGeometry, SphereGeometry, BufferGeometry, MeshStandardMaterial, MeshStandardNodeMaterial, Object3D, Color, Vector3, DynamicDrawUsage, InstancedBufferAttribute } from 'three/webgpu';
import * as TSL from 'three/tsl';
// three 0.186 exports instanceColor; the pinned 0.183 type package predates it.
const instanceTint=(TSL as typeof TSL & {instanceColor:ReturnType<typeof TSL.vec3>}).instanceColor;
import { actorGeometry, actorLabels, labelGeometry, joined } from './actor-geometry.ts';
import { vehicleGeometry } from './vehicle-geometry.ts';
import { vehicleSpecs, referenceVehicleType as vehicleType } from './vehicle-model.ts';
import type { TileData } from './types.ts';
import { buildTrafficGraph, chooseNext, forwardTrafficEdges, hash, lanePosition, safeSpeed, signalState, junctionAhead, stopLineDistance, vehicleLaneOffset } from './traffic-model.ts';
import type { TrafficGraph, TrafficEdge } from './traffic-model.ts';
interface Actor { slot?:number; edge:string; d:number; speed:number; seed:number; type:number; pause:number; x:number; z:number; heading:number; y?:number; pitch?:number; look?:number }

export const CAR_LIMIT=212,PED_LIMIT=340,SIGNAL_LIMIT=2400;
export class UrbanLife {
 private circulation=new Set<string>();
 readonly root=new Group();
 private crowd=new SlopCrowd();
 private populationFocus=new Vector3(HUACHENG_SPAWN[0],0,HUACHENG_SPAWN[1]);
 private roads:TrafficGraph=buildTrafficGraph([]);private walks:TrafficGraph=buildTrafficGraph([],true);
 private playerVehicle:VehicleBody|undefined;
 setPlayerVehicle(body:VehicleBody|undefined){this.playerVehicle=body;}
 private carBody(a:Actor):VehicleBody{const v=vehicleSpecs[a.type];return {x:a.x,z:a.z,y:a.y??.35,heading:a.heading,length:v.length,width:v.width,height:v.height};}
 getVehicleBodies(){return this.cars.map(a=>this.carBody(a));}
 private cars:Actor[]=[];private people:Actor[]=[];private signals:{id:string;axis:number;x:number;z:number;heading:number}[]=[];
 private batches:Record<string,InstancedMesh>={};private temp=new Object3D();private stopped=0;private labelTexture=actorLabels();private labelMaterial=new MeshStandardMaterial({map:this.labelTexture,roughness:.6});private lampMaterial:MeshStandardMaterial|MeshStandardNodeMaterial;
 constructor(){
  this.root.name='Urban life — real OSM paths; inferred traffic lights';
  const box=new BoxGeometry(1,1,1),sphere=new SphereGeometry(.5,8,6),g=actorGeometry();
  const make=(name:string,count:number,color:string,geometry:BufferGeometry=box,emissive=false,shared?:MeshStandardMaterial|MeshStandardNodeMaterial)=>{const material=shared??(emissive?new MeshStandardNodeMaterial({color,roughness:.65,emissive:color,emissiveIntensity:1}):new MeshStandardMaterial({color,roughness:.65}));if(material instanceof MeshStandardNodeMaterial)material.emissiveNode=TSL.vec3(TSL.materialEmissive).mul(instanceTint);const mesh=new InstancedMesh(geometry,material,count);mesh.name=name;mesh.count=0;mesh.castShadow=true;mesh.receiveShadow=true;mesh.instanceMatrix.setUsage(DynamicDrawUsage);mesh.setColorAt(0,new Color(1,1,1));mesh.frustumCulled=false;this.batches[name]=mesh;this.root.add(mesh);return material;};
  make('body',CAR_LIMIT,'#ffffff',g.carBody);make('cabin',CAR_LIMIT,'#244552',g.carGlass);make('carTrim',CAR_LIMIT,'#ffffff',g.carTrim);make('carDetails',CAR_LIMIT,'#27343b',g.carDetails);
  for(const geometry of [g.busBody,g.busGlass,g.busPanels,g.busTrim])geometry.dispose();
  const busGeometry=buildLoftedBusBodyGeometry();busGeometry.setAttribute('busState',new InstancedBufferAttribute(new Float32Array(CAR_LIMIT*4),4));
  make('slop-bus',CAR_LIMIT,'#ffffff',busGeometry,false,createLoftedBusMaterial());
  for(const side of [-1,1])make(`slop-bus-wheel-${side}`,CAR_LIMIT*2,'#ffffff',buildBusWheelGeo(side),false,createBusWheelMaterial());
  for(let type=4;type<vehicleSpecs.length;type++){const model=vehicleGeometry(type);for(const [part,geometry] of Object.entries(model))make(`vehicle${type}${part}`,CAR_LIMIT,part==='glass'?'#244552':part==='details'?'#27343b':'#ffffff',geometry);}
  for(const [type,row] of [[3,4],[7,5],[8,6],[6,7],[2,2]]){const v=vehicleSpecs[type];make(`vehicleText${type}`,CAR_LIMIT,'#ffffff',joined([-1,1].map(side=>labelGeometry(row,type===2?2.5:type===8?2.7:1.5,.30,0,0).rotateY(side*Math.PI/2).translate(side*(v.width/2+.035),type===2?1.15:type===3?.76:1.55,type===6?-1:0))),false,this.labelMaterial);}
  make('livery',CAR_LIMIT*18,'#ffffff');make('emergencyLights',CAR_LIMIT*4,'#ffffff',box,true);
  make('plates',CAR_LIMIT,'#ffffff',joined([labelGeometry(3,.40,.13,.46,2.222),labelGeometry(3,.40,.13,.46,2.222).rotateY(Math.PI)]),false,this.labelMaterial);
  make('wheels',CAR_LIMIT*4,'#20262a',g.tyre);make('hubs',CAR_LIMIT*4,'#adb6b8',g.hub);make('taxi',CAR_LIMIT,'#f1d54b');
  make('taxiText',CAR_LIMIT,'#ffffff',labelGeometry(0,.54,.14,1.56,.141),false,this.labelMaterial);
  make('busText',CAR_LIMIT,'#ffffff',labelGeometry(1,1.75,.24,2.51,5.035),false,this.labelMaterial);
  this.lampMaterial=make('headlights',CAR_LIMIT*4,'#ffffff',box,true);
  this.root.add(this.crowd.root);
  for(const [name,mesh] of Object.entries(this.batches)){const material=mesh.material as MeshStandardMaterial;if(name==='cabin'||name==='busGlass'||name.endsWith('glass')){material.roughness=.18;material.metalness=.35;}else if(name==='hubs'||name.endsWith('trim')){material.roughness=.32;material.metalness=.65;}}
  for(const kind of ['sedan','taxi','suv']){
    const spec=BODY_SPECS[kind],mat=createLoftedCarMaterial(spec);
    for(const detail of ['near','far']){const geometry=detail==='near'?buildCarGeometry(spec):buildCarProxyGeometry(spec);make(`slop-${kind}-${detail}`,CAR_LIMIT,'#ffffff',geometry,false,mat);geometry.setAttribute('paintColor',this.batches[`slop-${kind}-${detail}`].instanceColor!);geometry.setAttribute('carState',new InstancedBufferAttribute(new Float32Array(CAR_LIMIT*4),4));}
  }
  make('signalPole',SIGNAL_LIMIT,'#465253');make('signalBox',SIGNAL_LIMIT,'#30393b',signalHousingGeometry());make('signalLamps',SIGNAL_LIMIT*3,'#ffffff',sphere,true);
 }
 private put(name:string,x:number,y:number,z:number,sx:number,sy:number,sz:number,heading=0,color?:Color,pitch=0){const mesh=this.batches[name],i=mesh.count++;this.temp.position.set(x,y,z);this.temp.rotation.set(pitch,heading,0,'YXZ');this.temp.scale.set(sx,sy,sz);this.temp.updateMatrix();mesh.setMatrixAt(i,this.temp.matrix);if(color)mesh.setColorAt(i,color);}
 setMap(data:TileData[]){
  const roads=data.flatMap(t=>t.roads);this.roads=buildTrafficGraph(roads,false,true);this.circulation=circulatingTrafficEdges(this.roads);this.walks=buildTrafficGraph(roads,true,false,data.flatMap(t=>t.areas));
  this.cars=this.populate(this.cars,this.roads,CAR_LIMIT,false);this.people=this.populate(this.people,this.walks,PED_LIMIT,true);
  this.signals=[];
  const world=new WalkWorld();world.setMap(data);
  const cells=new Map<string,TrafficEdge[]>();
  for(const e of this.roads.edges.values()){
   if((e.yA??.35)<0||(e.yA??.35)>=1||(e.yB??.35)<0||(e.yB??.35)>=1)continue;
   const r=e.width/2+.4;
   for(let x=Math.floor((Math.min(e.a[0],e.b[0])-r)/60);x<=Math.floor((Math.max(e.a[0],e.b[0])+r)/60);x++)for(let z=Math.floor((Math.min(e.a[1],e.b[1])-r)/60);z<=Math.floor((Math.max(e.a[1],e.b[1])+r)/60);z++){
    const key=x+','+z,list=cells.get(key)??[];list.push(e);cells.set(key,list);
   }
  }
  const occupied=new Map<string,{x:number;z:number}[]>();
  const nodes=[...this.roads.nodes.values()].filter(n=>n.signal).sort((a,b)=>a.id.localeCompare(b.id));
  for(const n of nodes)for(const approach of junctionApproaches(this.roads,n)){
   if(!approach.incoming)continue;
   const p=approach.signal;
   if(!world.canStand(p.x,p.z,.35)||(cells.get(Math.floor(p.x/60)+','+Math.floor(p.z/60))??[]).some(e=>segmentDistance([p.x,p.z],e.a,e.b)<e.width/2+.35))continue;
   const cx=Math.floor(p.x/4),cz=Math.floor(p.z/4);
   let duplicate=false;
   for(let x=cx-1;x<=cx+1;x++)for(let z=cz-1;z<=cz+1;z++)if((occupied.get(x+','+z)??[]).some(q=>Math.hypot(p.x-q.x,p.z-q.z)<4))duplicate=true;
   if(duplicate||this.signals.length>=SIGNAL_LIMIT)continue;
   const key=cx+','+cz,list=occupied.get(key)??[];list.push(p);occupied.set(key,list);this.signals.push(p);
  }
  this.root.userData.signalSource='inferred';
 }
 private populate(existing:Actor[],graph:TrafficGraph,limit:number,ped:boolean){
  const actors=existing.filter(a=>graph.edges.has(a.edge)&&(ped||this.circulation.has(a.edge))&&graph.edges.get(a.edge)!.permitted!==false&&Math.hypot(a.x-this.populationFocus.x,a.z-this.populationFocus.z)<(ped?600:1400));
  const edges=[...graph.edges.values()].filter(e=>e.permitted!==false&&(ped||this.circulation.has(e.id))&&e.length>(ped?.5:12)).sort((a,b)=>Math.hypot(a.a[0]-this.populationFocus.x,a.a[1]-this.populationFocus.z)-Math.hypot(b.a[0]-this.populationFocus.x,b.a[1]-this.populationFocus.z));
  const pool=edges.filter(e=>Math.hypot(e.a[0]-this.populationFocus.x,e.a[1]-this.populationFocus.z)<(ped?320:1100));const selected=pool.length?pool:edges;
  const target=Math.min(limit,Math.floor(selected.reduce((sum,e)=>sum+e.length,0)/(ped?8:65)));
  const occupied=new Set(actors.map(a=>a.slot));
  for(let i=0;i<target&&selected.length;i++){if(occupied.has(i))continue;for(let attempt=0;attempt<(ped?1:20);attempt++){const seed=hash(attempt?`${ped}:${i}:${attempt}`:`${ped}:${i}`),e=selected[seed%selected.length],d=(seed%1000)/1000*e.length,p=lanePosition(e,d,ped?0:vehicleLaneOffset(e.width,e.oneway));const actor:Actor={slot:i,edge:e.id,d,speed:0,seed,look:seed,type:ped?0:vehicleType(i),pause:0,x:p[0],z:p[1],heading:Math.atan2(e.b[0]-e.a[0],e.b[1]-e.a[1]),y:(e.yA??.35)+((e.yB??.35)-(e.yA??.35))*d/e.length};if(!ped&&(actors.some(other=>vehiclesOverlap(this.carBody(actor),this.carBody(other)))||this.playerVehicle&&vehiclesOverlap(this.carBody(actor),this.playerVehicle)))continue;actors.push(actor);break;}}return actors;
 }
 private ambientForward(graph:TrafficGraph,e:TrafficEdge){const next=forwardTrafficEdges(graph,e);return graph===this.roads&&this.circulation.has(e.id)?next.filter(n=>this.circulation.has(n.id)):next;}
 private move(actors:Actor[],graph:TrafficGraph,dt:number,time:number,ped:boolean){
  const bodies=ped?new Map<Actor,VehicleBody>():new Map(actors.map(a=>[a,this.carBody(a)]));
  for(const a of actors){const previous=ped?undefined:{...a};let e=graph.edges.get(a.edge)!;let desired=ped?pedestrianSpeed(a.look??a.seed): vehicleSpecs[a.type].speed-1+(a.seed%20)/10;
   if(ped&&a.pause>0){a.pause-=dt;desired=0;}
   if(!ped){const ahead=junctionAhead(graph,e,a.d);let gap=this.ambientForward(graph,e).length?Infinity:Math.max(0,e.length-a.d-vehicleSpecs[a.type].length/2-.5);
    if(ahead?.node.signal&&signalState(time,ahead.node.id,ahead.axis)!=='green'){
     const remaining=ahead.distance-stopLineDistance(graph,ahead.node)-(vehicleSpecs[a.type].length/2)-.5;
     // Vehicles already past the stop line must clear the junction rather than freeze on the crossing.
     if(remaining>=-.2)gap=remaining;
    }
    for(const other of actors)if(other!==a&&other.edge===a.edge&&other.d>a.d)gap=Math.min(gap,other.d-a.d-((vehicleSpecs[a.type].length+vehicleSpecs[other.type].length)/2+2.6));
    desired=safeSpeed(desired,gap);a.speed+=Math.max(-4*dt,Math.min(2*dt,desired-a.speed));if(gap<=.05)a.speed=0;else if(a.speed*dt>gap)a.speed=gap/Math.max(dt,.001);
   }else a.speed=desired;
   a.d+=a.speed*dt;
   while(a.d>=e.length){
    const forward=ped?[]:this.ambientForward(graph,e);
    const next=ped?chooseNext(graph,e,a.seed+1):forward[hash(`${a.seed}:${e.to}`)%Math.max(1,forward.length)];
    if(!next){a.d=e.length;a.speed=0;break;}
    a.d-=e.length;a.seed=(a.seed+1)>>>0;e=next;a.edge=e.id;
    if(ped&&a.seed%7===0)a.pause=1+a.seed%4;
   }
   const p=lanePosition(e,a.d,ped?0:vehicleLaneOffset(e.width,e.oneway));const smooth=1-Math.exp(-dt*8);a.x+=(p[0]-a.x)*smooth;a.z+=(p[1]-a.z)*smooth;
   a.y=(e.yA??.35)+((e.yB??.35)-(e.yA??.35))*a.d/e.length;a.pitch=-Math.atan2((e.yB??.35)-(e.yA??.35),e.length);
   const target=Math.atan2(e.b[0]-e.a[0],e.b[1]-e.a[1]);a.heading+=Math.atan2(Math.sin(target-a.heading),Math.cos(target-a.heading))*smooth;
   if(!ped&&previous){
    const start=this.carBody(previous),end=this.carBody(a),steps=Math.max(1,Math.ceil(Math.hypot(end.x-start.x,end.z-start.z)/.25),Math.ceil(Math.abs(end.heading-start.heading)/.1));let blocked=false;
    for(let step=1;step<=steps&&!blocked;step++){
     const t=step/steps,body={...end,x:start.x+(end.x-start.x)*t,z:start.z+(end.z-start.z)*t,y:start.y+(end.y-start.y)*t,heading:start.heading+(end.heading-start.heading)*t};
     for(const [other,b] of bodies)if(other!==a&&vehiclesOverlap(body,b)){blocked=true;break;}
     blocked ||=!!this.playerVehicle&&vehiclesOverlap(body,this.playerVehicle);
    }
    if(blocked){Object.assign(a,previous);a.speed=0;}bodies.set(a,this.carBody(a));
   }
  }
 }
 updatePopulation(position:Vector3){
  if(Math.hypot(position.x-this.populationFocus.x,position.z-this.populationFocus.z)>150){
   this.populationFocus.copy(position);this.cars=this.populate(this.cars,this.roads,CAR_LIMIT,false);this.people=this.populate(this.people,this.walks,PED_LIMIT,true);
  }
 }
 update(dt:number,elapsed:number,night:number,_cameraPosition:Vector3){
  dt=Math.min(.1,Math.max(0,dt));this.move(this.cars,this.roads,dt,elapsed,false);this.move(this.people,this.walks,dt,elapsed,true);this.stopped=this.cars.filter(a=>a.speed<.2).length;
  for(const mesh of Object.values(this.batches))mesh.count=0;
  const color=new Color();
  for(const a of this.cars){const bus=a.type===2,police=a.type===3,emergency=police||a.type===7||a.type===8,v=vehicleSpecs[a.type],s=Math.sin(a.heading),c=Math.cos(a.heading),look=a.look??a.seed;
   const paint=color.set(police||a.type===7?'#eef2f3':a.type===8?'#c72e24':a.type===1?'#38b59b':bus?'#cf5545':['#f4f5f2','#25303c','#b32a30','#2f6f93','#8d979f'][look%5]);
   const part=(name:string,x=0,y=0,z=0,sx=1,sy=1,sz=1,tint?:Color,pitch=0)=>{
    const slope=a.pitch??0,longitudinal=y*Math.sin(slope)+z*Math.cos(slope),vertical=y*Math.cos(slope)-z*Math.sin(slope);
    this.put(name,a.x+x*c+longitudinal*s,(a.y??.35)+vertical,a.z-x*s+longitudinal*c,sx,sy,sz,a.heading,tint,pitch+slope);
   };
   const sourceKind=a.type===1?'taxi':a.type===4?'suv':'sedan',sourceCar=[0,1,3,4].includes(a.type);
   if(sourceCar){const name=`slop-${sourceKind}-${Math.hypot(a.x-_cameraPosition.x,a.z-_cameraPosition.z)<110?'near':'far'}`;part(name,0,0,0,1,1,1,paint);(this.batches[name].geometry.getAttribute('carState') as InstancedBufferAttribute).setXYZW(this.batches[name].count-1,a.speed<.2?1:0,0,0,(a.seed%100)/100);}
   else if(bus){part('slop-bus');(this.batches['slop-bus'].geometry.getAttribute('busState') as InstancedBufferAttribute).setXYZW(this.batches['slop-bus'].count-1,a.speed<.2?1:0,0,0,(a.seed%100)/100);for(const side of [-1,1])for(const end of [-1,1])part(`slop-bus-wheel-${side}`,side*BUS_SPEC.wheelX,BUS_SPEC.wheelRadius,end*BUS_SPEC.wheelZ,1,1,1,undefined,elapsed*a.speed/BUS_SPEC.wheelRadius);part('busText',0,.25,.8);}
   else if(a.type>=4){for(const name of ['body','glass','trim','details'])part(`vehicle${a.type}${name}`,0,0,0,1,1,1,name==='body'?paint:name==='trim'?color.set('#b3bec3'):undefined);}
   else{part('body',0,0,0,1,1,1,paint);part('cabin');part('carTrim',0,0,0,1,1,1,paint);part('carDetails');part('plates');}
   if(!sourceCar&&!bus)for(const side of [-1,1])for(const end of [-1,1]){
    part('wheels',side*(v.width/2-.03),v.wheel/2-.07,end*v.axle,.22,v.wheel,v.wheel,undefined,elapsed*a.speed/(v.wheel/2));
    part('hubs',side*(v.width/2+.09),v.wheel/2-.07,end*v.axle,v.wheel*.52,v.wheel*.52,v.wheel*.52,undefined,elapsed*a.speed/(v.wheel/2));
    part('headlights',side*v.width*.34,.65,end*(v.length/2+.025),.34,.14,.055,color.set(end>0?'#fff4ce':'#f04436'));
   }
   if(a.type===1&&!sourceCar){part('taxi',0,1.56,0,.58,.18,.28);part('taxiText');}
   if([2,3,6,7,8].includes(a.type))part(`vehicleText${a.type}`);
   if(emergency){
    for(const side of [-1,1]){
     part('livery',side*(v.width/2+.012),police?.62:1.0,0,.028,police?.16:.13,v.length*.88,color.set(police?'#174b94':'#c92829'));
     part('emergencyLights',side*.38,(a.type===8?2.53:v.height)+.16,police?-.14:a.type===8?v.length/2-.9:.6,.60,.17,.28,color.set(Math.floor(elapsed*7+side*.5)%2===0?(side<0?'#ff2539':'#2478ff'):'#100f19'));
    }
    part('livery',0,(a.type===8?2.53:v.height)+.055,police?-.14:a.type===8?v.length/2-.9:.6,1.32,.08,.34,color.set('#242e37'));
   }
   if(a.type===7)for(const side of [-1,1]){part('livery',side*1.105,2.08,-1.6,.03,.47,.14,color.set('#d52e36'));part('livery',side*1.107,2.08,-1.6,.03,.14,.47,color);}
  }
  this.crowd.update(this.people,_cameraPosition,dt);
  for(const signal of this.signals){if(Math.hypot(signal.x-_cameraPosition.x,signal.z-_cameraPosition.z)>850)continue;this.put('signalPole',signal.x,2,signal.z,.14,4,.14);this.put('signalBox',signal.x,3.9,signal.z,1,1,1,signal.heading);const state=signalState(elapsed,signal.id,signal.axis);for(let i=0;i<3;i++){const active=state===['red','yellow','green'][i];color.set(active?['#ff3030','#ffd447','#3dff8c'][i]:'#020403');this.put('signalLamps',signal.x+Math.sin(signal.heading)*.18,4.26-i*.36,signal.z+Math.cos(signal.heading)*.18,.23,.23,.15,signal.heading,color);}}
  this.lampMaterial.emissiveIntensity=.2+night*3;
  for(const mesh of Object.values(this.batches)){mesh.visible=mesh.count>0;mesh.userData.unusedBatch=mesh.count===0;mesh.instanceMatrix.needsUpdate=true;const state=mesh.geometry.getAttribute('carState')??mesh.geometry.getAttribute('busState');if(state)state.needsUpdate=true;if(mesh.instanceColor)mesh.instanceColor.needsUpdate=true;}
 }
 getAudioActors(){return {cars:this.cars,people:this.people,signals:this.signals,roads:this.roads,rig:(person:Actor)=>this.crowd.getRig(person)};}
 policeDistance(position:Vector3){let distance=Infinity;for(const a of this.cars)if(a.type===3)distance=Math.min(distance,Math.hypot(a.x-position.x,.35-position.y,a.z-position.z));return distance;}
 getStats(){return {cars:this.cars.length,vehicleTypes:new Set(this.cars.map(a=>a.type)).size,pedestrians:this.people.length,signals:this.signals.length,stopped:this.stopped,signalSource:'inferred' as const,characters:this.crowd.stats()};}
 dispose(){this.crowd.dispose();const geometries=new Set(Object.values(this.batches).map(m=>m.geometry));for(const g of geometries)g.dispose();for(const material of new Set(Object.values(this.batches).map(m=>m.material as MeshStandardMaterial)))material.dispose();this.labelTexture.dispose();for(const m of Object.values(this.batches))m.dispose();this.root.clear();}
}
