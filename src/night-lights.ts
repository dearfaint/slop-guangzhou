import {Group,SpotLight,Vector3,type Object3D} from 'three/webgpu';
import {vehicleSpecs} from './vehicle-model.ts';
interface Lamp {x:number;z:number;height:number;angle:number;tint?:string;power?:number;reach?:number;}
interface Car {x:number;z:number;y?:number;heading:number;pitch?:number;type:number;}
// Fixed-size pools keep shader light counts stable across time and map updates.
// Low-beam angle / pitch / inverse-square intensity follow Slop New York vehicle-lights.js (MIT).
export class NightLights {
 readonly root=new Group();
 readonly spots:SpotLight[]=[];
 private lamps:Lamp[]=[];
 constructor(){
  this.root.name='Nearby street and vehicle lighting';
  for(let i=0;i<12;i++){
   const street=i<8,light=new SpotLight(street?'#ffe9cb':'#fff4df',0,street?29:36,street?.98:.14,street?.8:.85,2);
   light.castShadow=i>=10;if(light.castShadow){light.shadow.mapSize.set(512,512);light.shadow.bias=-.0003;light.shadow.normalBias=.08;}
   light.position.y=-1000;light.target.position.y=-1001;this.spots.push(light);this.root.add(light,light.target);
  }
 }
 setLamps(lamps:Lamp[]){this.lamps=lamps;}
 update(night:number,camera:Vector3,cars:Car[],player?:Object3D){
  for(const s of this.spots){s.intensity=0;s.position.y=-1000;}
  const strength=Math.max(0,Math.min(1,night));if(!strength)return;
  let detailCount=0;
  const nearby=this.lamps.map(p=>({p,d:Math.hypot(p.x-camera.x,p.height-camera.y,p.z-camera.z)})).filter(({p,d})=>d<Math.min(110,p.reach?30:110)).sort((a,b)=>a.d-b.d).filter(({p})=>!p.tint||detailCount++<2);
  const lampCutoff=nearby[8]?.d??110;
  nearby.slice(0,8).forEach(({p,d},i)=>{const s=this.spots[i];s.color.set(p.tint??'#ffe9cb');s.distance=p.reach??29;s.position.set(p.x+Math.sin(p.angle)*.35,p.height+.4,p.z+Math.cos(p.angle)*.35);s.target.position.set(p.x-Math.cos(p.angle)*4,.28,p.z+Math.sin(p.angle)*4);s.target.updateMatrixWorld();s.intensity=(p.power??180)*strength*Math.max(0,Math.min(1,(lampCutoff-d)/25));});
  const traffic=cars.map(p=>({p,d:Math.hypot(p.x-camera.x,(p.y??.35)-camera.y,p.z-camera.z)})).filter(p=>p.d<85).sort((a,b)=>a.d-b.d).slice(0,1);
  traffic.forEach(({p,d},i)=>{const v=vehicleSpecs[p.type]??vehicleSpecs[0],pitch=p.pitch??0,sin=Math.sin(p.heading),cos=Math.cos(p.heading),rise=Math.sin(pitch),forward=Math.cos(pitch);
   for(let j=0;j<2;j++){const side=(j?1:-1)*v.width*.31,s=this.spots[8+i*2+j],front=v.length/2+.14;
    s.position.set(p.x+side*cos+front*sin*forward,(p.y??.35)+.7-front*rise,p.z-side*sin+front*cos*forward);
    s.target.position.set(s.position.x+sin*26*Math.cos(pitch+.145),s.position.y-Math.sin(pitch+.145)*26,s.position.z+cos*26*Math.cos(pitch+.145));s.target.updateMatrixWorld();s.intensity=(p.type===2?900:700)*strength*Math.min(1,(85-d)/20);
   }
  });
  if(player){player.updateWorldMatrix(true,false);for(let j=0;j<2;j++){const s=this.spots[10+j],x=(j?1:-1)*.59;s.position.copy(player.localToWorld(new Vector3(x,.69,2.39)));s.target.position.copy(player.localToWorld(new Vector3(x,.69-(29-2.39)*Math.tan(.145),29)));s.target.updateMatrixWorld();s.intensity=700*strength;}}
 }
 dispose(){for(const s of this.spots)s.dispose();this.root.clear();}
}
