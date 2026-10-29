import { PerspectiveCamera, Euler, Vector3 } from 'three/webgpu';
import { WalkWorld } from './walk-world.ts';
import type { Point, TileData } from './types';

export type TravelMode='walk'|'car'|'bike'|'balloon';
export const travelSettings={car:{label:'汽车',speed:12,min:4,max:24,height:1.15},walk:{label:'步行',speed:1.4,min:.8,max:3,height:2.10},bike:{label:'自行车',speed:8,min:4,max:16,height:1.9},balloon:{label:'直升机',speed:25,min:10,max:60,height:180}};

export class WalkControls {
  active=false;
  speed=1.4;
  travel:TravelMode='walk';
  thirdPerson=true;
  readonly position=new Vector3();
  private viewChanged:()=>void;
  get heading(){return this.bodyYaw;}
  steering=0;
  private bodyYaw=0;
  private cyclingSpeed=0;
  private jumpHeight=0;private jumpVelocity=0;private jumpHeld=false;
  get airHeight(){return this.jumpHeight;}
  get movingSpeed(){return Math.hypot(this.velocity.x,this.velocity.z);}
  private get driving(){return this.travel==='car';}
  private get collisionRadius(){return this.driving?2.4:.45;}
  get signedSpeed(){return this.travel==='bike'||this.driving?this.cyclingSpeed:this.movingSpeed;}
  private velocity=new Vector3();
  readonly world=new WalkWorld();
  private keys=new Set<string>();
  private touch=new Set<string>();
  private yaw=0;
  private pitch=0;
  private drag:{id:number;x:number;y:number}|null=null;
  private euler=new Euler(0,0,0,'YXZ');
  private forward=new Vector3();
  private abort=new AbortController();
  private camera:PerspectiveCamera;
  private canvas:HTMLCanvasElement;
  private onCancel:()=>void;
  constructor(camera:PerspectiveCamera,canvas:HTMLCanvasElement,onCancel:()=>void,viewChanged:()=>void=()=>{}) {
    this.viewChanged=viewChanged;this.camera=camera;this.canvas=canvas;this.onCancel=onCancel;
    const options={signal:this.abort.signal};
    window.addEventListener('keydown',e=>{
      if(!this.active||(e.target as HTMLElement)?.matches('input,select,textarea')||document.querySelector('dialog[open]'))return;
      if(e.code==='KeyC'){e.preventDefault();if(!e.repeat)this.toggleView();return;}
      if(e.code==='Escape'){this.onCancel();return;}
      if(['KeyW','KeyA','KeyS','KeyD','ArrowUp','ArrowDown','ArrowLeft','ArrowRight','ShiftLeft','ShiftRight','KeyQ','KeyE','Space','ControlLeft','ControlRight'].includes(e.code)){e.preventDefault();this.keys.add(e.code);}
    },options);
    window.addEventListener('keyup',e=>this.keys.delete(e.code),options);
    window.addEventListener('blur',()=>{this.keys.clear();this.touch.clear();this.drag=null;},options);
    canvas.addEventListener('pointerdown',e=>{if(!this.active)return;e.preventDefault();this.drag={id:e.pointerId,x:e.clientX,y:e.clientY};canvas.setPointerCapture(e.pointerId);},options);
    canvas.addEventListener('pointermove',e=>{
      if(!this.active)return;
      let dx=0,dy=0;
      if(document.pointerLockElement===canvas){dx=e.movementX;dy=e.movementY;}
      else if(this.drag?.id===e.pointerId){dx=e.clientX-this.drag.x;dy=e.clientY-this.drag.y;this.drag.x=e.clientX;this.drag.y=e.clientY;}
      else return;
      this.yaw-=dx*.003;this.pitch=Math.max(-1.35,Math.min(1.35,this.pitch-dy*.003));this.orient();
    },options);
    const stop=(e:PointerEvent)=>{if(this.drag?.id===e.pointerId)this.drag=null;};
    canvas.addEventListener('pointerup',stop,options);canvas.addEventListener('pointercancel',stop,options);
    document.querySelectorAll<HTMLButtonElement>('[data-move]').forEach(button=>{
      const key=button.dataset.move!;
      button.addEventListener('pointerdown',e=>{e.preventDefault();button.setPointerCapture(e.pointerId);this.touch.add(key);},options);
      for(const event of ['pointerup','pointercancel','lostpointercapture'])button.addEventListener(event,()=>this.touch.delete(key),options);
    });
  }
  setTravel(travel:TravelMode){
    const footHeight=this.position.y-travelSettings[this.travel].height-this.jumpHeight;
    this.jumpHeight=0;this.jumpVelocity=0;this.jumpHeld=false;
    this.world.setVehicleHeading(travel==='car'?this.yaw:undefined);
    this.travel=travel;this.steering=0;this.cyclingSpeed=0;this.bodyYaw=this.yaw;this.camera.fov=travel==='balloon'?55:65;this.camera.updateProjectionMatrix();this.speed=travelSettings[travel].speed;this.velocity.set(0,0,0);this.keys.clear();this.touch.clear();
    if(this.active){
      if(travel==='balloon'){this.position.y=Math.max(180,this.world.flightFloor(this.position.x,this.position.z));this.pitch=-.3;}
      else this.pitch=travel==='bike'?-.2:travel==='car'?-.12:0;
      if(travel!=='balloon'){
        const preferred:[number,number]=[this.position.x,this.position.z];
        const [x,z]=this.world.canStand(...preferred,this.collisionRadius,footHeight)?preferred:this.world.spawn(preferred,this.collisionRadius,this.driving);
        this.position.set(x,this.world.groundHeight(x,z,footHeight)+travelSettings[travel].height,z);
      }
      this.orient();
    }
  }
  setMap(data:TileData[]){
    this.world.setMap(data);
    if(this.active&&this.travel==='balloon')this.position.y=Math.max(this.position.y,this.world.flightFloor(this.position.x,this.position.z));
    if(this.active&&this.travel!=='balloon'&&!this.world.canStand(this.position.x,this.position.z,this.collisionRadius,this.position.y-travelSettings[this.travel].height)){
      const [x,z]=this.world.spawn([this.position.x,this.position.z],this.collisionRadius,this.driving);this.position.set(x,this.world.groundHeight(x,z)+travelSettings[this.travel].height,z);
    }
    if(this.active)this.orient();
  }
  enter(preferred:Point,direction:Vector3,keepPreferred=false) {
    this.jumpHeight=0;this.jumpVelocity=0;this.jumpHeld=false;
    this.velocity.set(0,0,0);this.cyclingSpeed=0;this.steering=0;this.keys.clear();this.touch.clear();this.drag=null;
    const bounded:Point=[Math.max(-1660,Math.min(1650,preferred[0])),Math.max(-1500,Math.min(1760,preferred[1]))];
    this.camera.fov=this.travel==='balloon'?55:65;
    this.world.setVehicleHeading(this.driving?Math.atan2(-direction.x,-direction.z):undefined);
    const position=this.travel==='balloon'||keepPreferred&&this.world.canStand(...bounded,this.collisionRadius)?bounded:this.world.spawn(bounded,this.collisionRadius,this.driving);this.active=true;this.camera.near=.12;this.camera.updateProjectionMatrix();
    this.position.set(position[0],this.travel==='balloon'?Math.max(180,this.world.flightFloor(...position)):this.world.groundHeight(...position)+travelSettings[this.travel].height,position[1]);this.yaw=Math.atan2(-direction.x,-direction.z);this.bodyYaw=this.yaw;this.pitch=this.travel==='balloon'?-.3:this.travel==='bike'?-.2:this.driving?-.12:0;this.orient();
  }
  exit(){this.active=false;this.velocity.set(0,0,0);this.keys.clear();this.touch.clear();this.drag=null;if(document.pointerLockElement===this.canvas)document.exitPointerLock();this.camera.near=2;this.camera.fov=42;this.camera.updateProjectionMatrix();}
  resume(){
    this.velocity.set(0,0,0);this.cyclingSpeed=0;this.steering=0;this.keys.clear();this.touch.clear();this.drag=null;
    this.active=true;this.camera.near=.12;this.camera.fov=this.travel==='balloon'?55:65;this.camera.updateProjectionMatrix();this.orient();
  }
  toggleView(){
    if(!this.active)return;
    this.thirdPerson=!this.thirdPerson;this.orient();this.viewChanged();
  }
  setTouchKey(key:string,pressed:boolean){if(pressed)this.touch.add(key);else this.touch.delete(key);}
  lowAngle=false;
  setCameraView(view:'chase'|'action'|'pov'){this.thirdPerson=view!=='pov';this.lowAngle=view==='action';this.orient();this.viewChanged();}
  private orient(){
    this.camera.quaternion.setFromEuler(this.euler.set(this.pitch,this.yaw,0));
    this.camera.position.copy(this.position);
    if(!this.active||!this.thirdPerson)return;
    const balloon=this.travel==='balloon',distance=balloon?22:this.lowAngle?4.5:this.driving?9:this.travel==='bike'?8:6;
    const target=this.position.clone();
    const offset=new Vector3(balloon?6:this.travel==='bike'?.8:.45,0,distance).applyQuaternion(this.camera.quaternion);
    // Upward look stays above eye level instead of pushing the camera under the avatar.
    offset.y=this.lowAngle?.25:Math.max(0,offset.y)+(balloon?5:this.driving?2:0);
    // Shorten the boom before a wall, including the space between actor and camera.
    let fraction=1;const steps=Math.ceil(offset.length()/.25);
    for(let i=1;i<=steps;i++){
      const t=i/steps;
      if(target.y+offset.y*t<this.world.groundHeight(target.x+offset.x*t,target.z+offset.z*t,this.position.y-travelSettings[this.travel].height)+.3||!this.world.cameraClear(target.x+offset.x*t,target.y+offset.y*t,target.z+offset.z*t)){
        fraction=Math.max(0,(i-2)/steps);break;
      }
    }
    this.camera.position.copy(target).addScaledVector(offset,fraction);
    // Preserve the requested pitch even when terrain or a wall shortens the boom.
  }
  async lockPointer(){if(this.active&&this.canvas.requestPointerLock){try{await this.canvas.requestPointerLock();}catch{/* Drag look remains usable when pointer lock is unavailable. */}}}
  update(dt:number) {
    if(!this.active||document.querySelector('dialog[open]'))return;
    const down=(key:string)=>this.keys.has(key)||this.touch.has(key);
    let forward=Number(down('KeyW')||down('ArrowUp'))-Number(down('KeyS')||down('ArrowDown'));
    let side=Number(down('KeyD')||down('ArrowRight'))-Number(down('KeyA')||down('ArrowLeft'));
    const previousHeading=this.bodyYaw;
    dt=Math.min(dt,.05);
    const speed=this.speed*(down('ShiftLeft')||down('ShiftRight')?(this.travel==='walk'?2.6:1.7):1);
    if(this.travel==='bike'||this.driving){
      this.steering+=(-side*.5-this.steering)*(1-Math.exp(-dt*9));
      this.cyclingSpeed+=(forward*speed-this.cyclingSpeed)*(1-Math.exp(-dt*4));
      const turn=this.cyclingSpeed*Math.tan(this.steering)/(this.driving?2.8:1.76)*dt;
      this.bodyYaw+=turn;this.yaw+=turn;
      this.velocity.set(-Math.sin(this.bodyYaw)*this.cyclingSpeed,0,-Math.cos(this.bodyYaw)*this.cyclingSpeed);
    }else{
      const length=Math.hypot(forward,side);if(length){forward/=length;side/=length;}
      this.forward.set(-Math.sin(this.yaw),0,-Math.cos(this.yaw));
      const dx=(this.forward.x*forward-this.forward.z*side)*speed,dz=(this.forward.z*forward+this.forward.x*side)*speed;
      const smoothing=1-Math.exp(-dt*(this.travel==='balloon'?2:8));
      this.velocity.x+=(dx-this.velocity.x)*smoothing;this.velocity.z+=(dz-this.velocity.z)*smoothing;
      if(this.movingSpeed>.1){const heading=Math.atan2(-this.velocity.x,-this.velocity.z),delta=Math.atan2(Math.sin(heading-this.bodyYaw),Math.cos(heading-this.bodyYaw));this.bodyYaw+=delta*(1-Math.exp(-dt*10));}
    }
    if(this.travel==='balloon'){
      const x=Math.max(-1660,Math.min(1650,this.position.x+this.velocity.x*dt)),z=Math.max(-1500,Math.min(1760,this.position.z+this.velocity.z*dt));
      if(this.position.y>=this.world.flightFloor(x,z))this.position.set(x,this.position.y,z);
      this.position.y=Math.max(this.world.flightFloor(this.position.x,this.position.z),Math.min(1200,this.position.y+(Number(down('KeyE')||down('Space'))-Number(down('KeyQ')||down('ControlLeft')||down('ControlRight')))*speed*dt));
    }else{
      const previous=this.position.clone();
      const footHeight=this.position.y-travelSettings[this.travel].height-this.jumpHeight;
      this.world.setVehicleHeading(this.driving?this.bodyYaw:undefined);
      if(this.driving){
        const turn=this.bodyYaw-previousHeading,steps=Math.max(1,Math.ceil(Math.abs(turn)/.1));
        for(let i=1;i<=steps;i++){
          this.world.setVehicleHeading(previousHeading+turn*i/steps);
          if(!this.world.canStand(this.position.x,this.position.z,this.collisionRadius,footHeight)){this.yaw-=turn;this.bodyYaw=previousHeading;this.velocity.set(-Math.sin(this.bodyYaw)*this.cyclingSpeed,0,-Math.cos(this.bodyYaw)*this.cyclingSpeed);break;}
        }
        this.world.setVehicleHeading(this.bodyYaw);
      }
      const [x,z]=this.world.move([this.position.x,this.position.z],this.velocity.x*dt,this.velocity.z*dt,footHeight,this.collisionRadius);
      if(dt>0){this.velocity.set((x-previous.x)/dt,0,(z-previous.z)/dt);if(this.travel==='bike'||this.driving)this.cyclingSpeed=this.velocity.dot(new Vector3(-Math.sin(this.bodyYaw),0,-Math.cos(this.bodyYaw)));}
      if(this.travel==='walk'){
        if(down('Space')&&!this.jumpHeld&&this.jumpHeight===0)this.jumpVelocity=5.2;
        this.jumpHeld=down('Space');this.jumpVelocity-=9.81*dt;this.jumpHeight=Math.max(0,this.jumpHeight+this.jumpVelocity*dt);if(this.jumpHeight===0)this.jumpVelocity=0;
      }
      this.position.set(x,this.world.groundHeight(x,z,footHeight)+travelSettings[this.travel].height+this.jumpHeight,z);
    }
    this.orient();
  }
  dispose(){this.exit();this.abort.abort();}
}
