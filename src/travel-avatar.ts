import { buildHelicopterBodyGeometry, buildHelicopterMainRotorGeometry, buildHelicopterTailRotorGeometry, createLoftedHelicopterMaterial } from './vendor/slop-newyork/actor-models.js';
import { createPlayerCar } from './player-car.ts';
import { bicycleFit as fit } from './bicycle-fit.ts';
import { PersonCrowd, PersonRig } from './vendor/slop-newyork/pedestrians.js';
import { Group, Mesh, MeshStandardMaterial, BoxGeometry, SphereGeometry, CylinderGeometry, TorusGeometry, TubeGeometry, CatmullRomCurve3, Shape, ExtrudeGeometry, Vector3, type Object3D, type BufferGeometry } from 'three/webgpu';
import { travelSettings, type WalkControls } from './walk-controls.ts';

const up=new Vector3(0,1,0);
export class TravelAvatar {
  readonly root=new Group();
  readonly person=new Group();
  readonly bike=new Group();
  readonly balloon=new Group();
  private carModel=createPlayerCar();
  readonly car=this.carModel.root;
  readonly rig=new PersonRig({seed:.13,scale:1,girth:.98,hair:.2});
  private personCrowd=new PersonCrowd(1);
  private rideFrame=new Group();
  private rotors:Mesh[]=[];
  private wheels:Group[]=[];
  readonly steering=new Group();
  private crank=new Group();
  private pedals:Group[]=[];
  private phase=0;
  constructor(){
    this.root.name='player';this.person.name='player-person';this.bike.name='player-bicycle';this.balloon.name='player-helicopter';
    this.root.add(this.person,this.bike,this.balloon,this.car);this.root.visible=false;
    const material=(color:string)=>new MeshStandardMaterial({color,roughness:.7});
    const dark=material('#243632'),metal=material('#b6c7bf'),frame=material('#d8983d');
    const mesh=(parent:Object3D,geometry:BufferGeometry,mat:MeshStandardMaterial,x=0,y=0,z=0)=>{const m=new Mesh(geometry,mat);m.castShadow=true;m.receiveShadow=true;m.position.set(x,y,z);parent.add(m);return m;};
    const box=(parent:Object3D,mat:MeshStandardMaterial,x:number,y:number,z:number,w:number,h:number,d:number)=>mesh(parent,new BoxGeometry(w,h,d),mat,x,y,z);
    const bar=(parent:Object3D,mat:MeshStandardMaterial,a:number[],b:number[],r=.035)=>{
      const start=new Vector3(...a),end=new Vector3(...b),delta=end.clone().sub(start);
      const m=mesh(parent,new CylinderGeometry(r,r,delta.length(),8),mat);m.position.copy(start.add(end).multiplyScalar(.5));m.quaternion.setFromUnitVectors(up,delta.normalize());return m;
    };
    this.person.matrixAutoUpdate=false;this.person.add(...this.personCrowd.meshes);
    this.rideFrame.rotation.y=Math.PI;this.root.add(this.rideFrame);
    this.steering.name='bicycle-steering';this.steering.position.set(...fit.pivot);this.bike.add(this.steering);
    for(const z of [-fit.axleZ,fit.axleZ]){
      const wheel=new Group();wheel.position.set(0,fit.axleY,z);if(z<0){wheel.position.sub(this.steering.position);this.steering.add(wheel);}else this.bike.add(wheel);this.wheels.push(wheel);
      mesh(wheel,new TorusGeometry(fit.wheelRadius,fit.tyreRadius,10,48).rotateY(Math.PI/2),dark);
      mesh(wheel,new TorusGeometry(.315,.012,8,48).rotateY(Math.PI/2),metal);
      for(let i=0;i<16;i++){const a=i*Math.PI/8;bar(wheel,metal,[0,0,0],[0,Math.sin(a)*.31,Math.cos(a)*.31],.003);}
      bar(wheel,metal,[-.075,0,0],[.075,0,0],.023);
    }
    const rear=[0,fit.axleY,fit.axleZ],pedal=[0,fit.crankY,0],seat=[0,.79,.23],head=[...fit.pivot],front=[0,fit.axleY,-fit.axleZ];
    for(const [a,b] of [[seat,pedal],[pedal,head],[head,seat]])bar(this.bike,frame,a,b,.023);
    // Paired stays and forks straddle the wheels instead of passing through them.
    for(const side of [-1,1]){
      for(const a of [seat,pedal])bar(this.bike,frame,a,[side*.055,rear[1],rear[2]],.013);
      bar(this.steering,metal,[side*.04,-.06,0],[side*.055,front[1]-head[1],front[2]-head[2]],.016);
    }
    bar(this.bike,metal,seat,[0,fit.seatY-.04,fit.seatZ],.013);
    const saddle=new Shape();saddle.moveTo(-.035,-.13);saddle.quadraticCurveTo(-.075,-.13,-.09,.045);saddle.quadraticCurveTo(-.10,.12,0,.12);saddle.quadraticCurveTo(.10,.12,.09,.045);saddle.quadraticCurveTo(.075,-.13,.035,-.13);saddle.closePath();
    const saddleMesh=mesh(this.bike,new ExtrudeGeometry(saddle,{depth:.035,bevelEnabled:true,bevelSize:.012,bevelThickness:.009,bevelSegments:3,curveSegments:12}).rotateX(Math.PI/2),dark,0,fit.seatY,fit.seatZ);saddleMesh.name='bicycle-saddle';
    const steeringPoint=(p:number[])=>new Vector3(...p).sub(this.steering.position);
    for(const side of [-1,1])bar(this.steering,metal,[0,0,0],[side*.04,-.06,0],.018);
    bar(this.steering,metal,[0,0,0],steeringPoint([0,1.22,-.40]).toArray(),.014);
    const handlePoints=[[-.35,1.24,-.30],[-.25,1.24,-.34],[0,1.23,-.40],[.25,1.24,-.34],[.35,1.24,-.30]].map(steeringPoint);
    mesh(this.steering,new TubeGeometry(new CatmullRomCurve3(handlePoints),24,.011,8,false),metal).name='bicycle-handlebar';
    for(const side of [-1,1]){
      const grip=bar(this.steering,dark,steeringPoint([side*.25,1.24,-.34]).toArray(),steeringPoint([side*.35,1.24,-.30]).toArray(),.017);grip.name=side<0?'bicycle-grip-l':'bicycle-grip-r';
      bar(this.steering,metal,steeringPoint([side*.25,1.23,-.35]).toArray(),steeringPoint([side*.31,1.205,-.385]).toArray(),.005);
    }
    mesh(this.bike,new TorusGeometry(.075,.005,8,32).rotateY(Math.PI/2),metal,-.045,fit.crankY,0);
    mesh(this.bike,new TorusGeometry(.04,.004,8,24).rotateY(Math.PI/2),metal,-.045,fit.axleY,fit.axleZ);
    const chainPoints=[[-.045,fit.crankY-.075,0],[-.045,fit.axleY-.04,fit.axleZ],[-.045,fit.axleY+.04,fit.axleZ],[-.045,fit.crankY+.075,0]].map(p=>new Vector3(...p));mesh(this.bike,new TubeGeometry(new CatmullRomCurve3(chainPoints,true),40,.003,5,true),dark);
    this.crank.position.set(0,fit.crankY,0);this.bike.add(this.crank);
    for(const side of [-1,1]){
      bar(this.crank,metal,[0,0,0],[side*fit.pedalX,side*fit.crankRadius,0],.012);
      const carrier=new Group();carrier.position.set(side*fit.pedalX,side*fit.crankRadius,0);this.crank.add(carrier);this.pedals.push(carrier);
      box(carrier,dark,0,0,0,.105,.018,.09).name=side<0?'bicycle-pedal-l':'bicycle-pedal-r';
    }
    const heliMaterial=createLoftedHelicopterMaterial(),heli=new Group();heli.rotation.y=Math.PI;this.balloon.add(heli);
    mesh(heli,buildHelicopterBodyGeometry(),heliMaterial as unknown as MeshStandardMaterial,0,0,0);
    const rotor=mesh(heli,buildHelicopterMainRotorGeometry(),heliMaterial as unknown as MeshStandardMaterial,0,2.66,-.45);
    const tail=mesh(heli,buildHelicopterTailRotorGeometry(),heliMaterial as unknown as MeshStandardMaterial,.28,1.6,-5.8);this.rotors=[rotor,tail];
  }
  update(controls:WalkControls,dt:number){
    this.root.visible=controls.active;if(!controls.active)return;
    this.root.position.copy(controls.position);this.root.position.y-=controls.travel==='balloon'?2.1:travelSettings[controls.travel].height;
    this.root.rotation.y=controls.heading;
    this.person.visible=controls.thirdPerson&&(controls.travel==='walk'||controls.travel==='bike');this.car.visible=controls.travel==='car';
    for(const wheel of this.carModel.wheels)wheel.rotation.x+=(controls.signedSpeed??controls.movingSpeed)*Math.min(dt,.05)/.33;
    for(const pivot of this.carModel.front)pivot.rotation.y=controls.steering??0;this.bike.visible=controls.travel==='bike';this.balloon.visible=controls.travel==='balloon';
    this.rotors[0].rotation.y+=dt*36;this.rotors[1].rotation.x+=dt*48;
    const distance=(controls.signedSpeed??controls.movingSpeed)*Math.min(dt,.05);this.phase+=distance*(controls.travel==='walk'?2.8:2);
    const cycling=controls.travel==='bike';this.steering.rotation.y=cycling?(controls.steering??0):0;
    this.root.updateMatrixWorld(true);this.person.matrix.copy(this.root.matrixWorld).invert();this.person.matrixWorldNeedsUpdate=true;
    if(cycling){
      const grips=[1,-1].map(side=>this.bike.localToWorld(new Vector3(-side*fit.gripX,fit.gripY,fit.gripZ).sub(this.steering.position).applyAxisAngle(up,this.steering.rotation.y).add(this.steering.position)));
      this.rig.ride(this.rideFrame,this.phase,{seat:new Vector3(0,fit.seatY,-fit.seatZ),bars:new Vector3(0,fit.gripY,-fit.gripZ),gripHalf:fit.gripX,bracket:new Vector3(0,fit.crankY,0),crankLength:fit.crankRadius,grips});
    }else{
      const floor=this.root.position.y-(controls.airHeight??0);
      this.rig.update(dt,controls.position.x,controls.position.z,controls.heading+Math.PI,()=>floor,null,controls.airHeight??0);
    }
    this.personCrowd.begin();this.personCrowd.add(this.rig);this.personCrowd.end();
    for(const wheel of this.wheels)wheel.rotation.x-=distance/(fit.wheelRadius+fit.tyreRadius);
    this.crank.rotation.x=-this.phase;
    for(const pedal of this.pedals)pedal.rotation.x=this.phase;
  }
  dispose(){
    for(const lod of this.personCrowd.lods)lod.pose.dispose();
    const geometries=new Set<BufferGeometry>(),materials=new Set<MeshStandardMaterial>();
    this.root.traverse(o=>{if(o instanceof Mesh){geometries.add(o.geometry);materials.add(o.material as MeshStandardMaterial);}});
    for(const g of geometries)g.dispose();for(const m of materials)m.dispose();this.root.removeFromParent();
  }
}
