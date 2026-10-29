import { Group, Mesh, MeshStandardMaterial, BoxGeometry, TorusGeometry } from 'three/webgpu';
import { BODY_SPECS, buildCarGeometry, buildSteerableWheelGeo, createLoftedCarMaterial } from './vendor/slop-newyork/actor-models.js';
export function createPlayerCar(){
 const root=new Group();root.name='player-car';root.rotation.y=Math.PI;
 const spec=BODY_SPECS.taxi,material=createLoftedCarMaterial(spec,0xffbe14),dark=new MeshStandardMaterial({color:'#20282d',roughness:.8});
 root.add(new Mesh(buildCarGeometry(spec,false),material));
 const wheels:Group[]=[],front:Group[]=[];
 for(const side of [-1,1])for(const end of [-1,1]){
  const pivot=new Group();pivot.position.set(side*spec.wheelX,spec.wheelRadius,end*spec.wheelZ);root.add(pivot);if(end>0)front.push(pivot);
  const wheel=new Group();pivot.add(wheel);wheels.push(wheel);wheel.add(new Mesh(buildSteerableWheelGeo(spec,side),material));
 }
 const dashboard=new Mesh(new BoxGeometry(1.42,.14,.30),dark);dashboard.position.set(0,.87,.45);root.add(dashboard);
 const steering=new Mesh(new TorusGeometry(.16,.02,8,24),dark);steering.position.set(.4,1.04,.26);steering.rotation.x=-.3;root.add(steering);
 root.traverse(object=>{if(object instanceof Mesh){object.castShadow=true;object.receiveShadow=true;}});
 return {root,wheels,front};
}
