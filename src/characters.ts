import { FOOT_TOP } from './road-level.ts';
import { bicycleFit as fit, bicycleGrip, bicycleFoot } from './bicycle-fit.ts';
import { AnimationMixer, BufferAttribute, Group, InstancedMesh, Mesh, MeshStandardMaterial, MeshStandardNodeMaterial, Object3D, CanvasTexture, SRGBColorSpace, Vector3, Quaternion, Bone, SkinnedMesh, type Skeleton, type AnimationAction } from 'three/webgpu';
import { attribute, materialColor, mix, texture, vec2, vec3, float } from 'three/tsl';
import { GLTFLoader, type GLTF } from 'three/addons/loaders/GLTFLoader.js';
import { MeshoptDecoder } from 'three/addons/libs/meshopt_decoder.module.js';
import { clone } from 'three/addons/utils/SkeletonUtils.js';
import { characterTypes, characterLook, CHARACTER_NEAR_LIMIT, CHARACTER_NEAR_DISTANCE, CHARACTER_FAR_DISTANCE } from './character-data.ts';
import { waistKeys } from './character-keys.ts';

const asset=(name:string)=>`${import.meta.env?.BASE_URL??'/'}data/characters/${name}`;
const loader=new GLTFLoader();loader.setMeshoptDecoder(MeshoptDecoder);
let logo:Promise<CanvasTexture>|undefined;
function brandTexture(){return logo??=new Promise<CanvasTexture>((resolve,reject)=>{
 const image=new Image();image.onload=()=>{const canvas=document.createElement('canvas');canvas.width=image.width;canvas.height=image.height;const ctx=canvas.getContext('2d')!;ctx.drawImage(image,0,0);const pixels=ctx.getImageData(0,0,canvas.width,canvas.height);let x0=image.width,y0=image.height,x1=0,y1=0;
 for(let y=0;y<image.height;y++)for(let x=0;x<image.width;x++){const i=(y*image.width+x)*4,r=pixels.data[i],g=pixels.data[i+1],b=pixels.data[i+2],alpha=Math.max(0,Math.min(1,(Math.max(r,g,b)-Math.min(r,g,b)-9)/24));pixels.data[i+3]=Math.round(alpha*255);if(alpha>.5){x0=Math.min(x0,x);x1=Math.max(x1,x);y0=Math.min(y0,y);y1=Math.max(y1,y);}}
 ctx.putImageData(pixels,0,0);const cropped=document.createElement('canvas');cropped.width=x1-x0+5;cropped.height=y1-y0+5;cropped.getContext('2d')!.drawImage(canvas,x0-2,y0-2,cropped.width,cropped.height,0,0,cropped.width,cropped.height);const result=new CanvasTexture(cropped);result.colorSpace=SRGBColorSpace;resolve(result);
 };image.onerror=()=>reject(new Error('服装品牌图片加载失败'));image.src=asset('blessxu-brand-source.png');
});}
interface Template {gltf:GLTF;brands:Map<string,MeshStandardNodeMaterial>}
export class CharacterLibrary {
 readonly far=new Map<number,Mesh>();readonly near=new Map<number,Template>();readonly errors=new Set<string>();
 private pending=new Set<number>();private queue:number[]=[];private active=0;
 constructor(){if(typeof document!=='undefined')for(let i=0;i<characterTypes.length;i++)loader.loadAsync(asset(`${characterTypes[i].id}-far.glb`)).then(g=>{g.scene.updateMatrixWorld(true);g.scene.traverse(o=>{if(o instanceof Mesh){o.geometry.applyMatrix4(o.matrixWorld);o.material=new MeshStandardMaterial({vertexColors:true,roughness:.85});this.far.set(i,o);}});}).catch(()=>this.errors.add(characterTypes[i].id+' 远景'));}
 request(index:number){if(typeof document==='undefined'||this.near.has(index)||this.pending.has(index))return;this.pending.add(index);this.queue.push(index);this.pump();}
 private pump(){while(this.active<2&&this.queue.length){const index=this.queue.shift()!;this.active++;Promise.all([loader.loadAsync(asset(`${characterTypes[index].id}-near.glb`)),brandTexture()]).then(([gltf,ink])=>{
 const brands=new Map<string,MeshStandardNodeMaterial>();gltf.scene.traverse(o=>{if(!(o instanceof Mesh)||Array.isArray(o.material)||!o.material.name.startsWith('Fabric-top-'))return;
 const original=o.material as MeshStandardMaterial,g=o.geometry;g.computeBoundingBox();const b=g.boundingBox!,scale=(b.max.y-b.min.y)/.67;
 for(const place of ['left','chest']){const width=(place==='left'?.115:.22)*scale,height=width/(ink.image.width/ink.image.height),centerX=place==='left'?-.10*scale:0,centerY=b.max.y-(place==='left'?.15:.24)*scale;const p=g.getAttribute('position'),uv=new Float32Array(p.count*2),front=new Float32Array(p.count);
 for(let j=0;j<p.count;j++){uv[j*2]=(p.getX(j)-centerX)/width+.5;uv[j*2+1]=(p.getY(j)-centerY)/height+.5;front[j]=p.getZ(j)>.025*scale?1:0;}g.setAttribute(`brand${place}`,new BufferAttribute(uv,2));g.setAttribute('brandfront',new BufferAttribute(front,1));const mat=new MeshStandardNodeMaterial();mat.name=original.name;mat.color.copy(original.color);mat.map=original.map;mat.normalMap=original.normalMap;mat.normalScale.copy(original.normalScale);mat.roughness=original.roughness;mat.side=original.side;const coords=vec2(attribute(`brand${place}`,'vec2')),sample=texture(ink,coords);const mask=coords.x.greaterThanEqual(0).and(coords.x.lessThanEqual(1)).and(coords.y.greaterThanEqual(0)).and(coords.y.lessThanEqual(1));mat.colorNode=mix(vec3(materialColor),sample.rgb,sample.a.mul(attribute('brandfront','float')).mul(float(mask)));brands.set(place,mat);}
 });this.near.set(index,{gltf,brands});
 }).catch(()=>this.errors.add(characterTypes[index].id+' 近景')).finally(()=>{this.active--;this.pump();});}}
 stats(){return {near:this.near.size,far:this.far.size,errors:[...this.errors]};}
}
let shared:CharacterLibrary|undefined;
export function characterLibrary(){return shared??=new CharacterLibrary();}

export class CharacterInstance {
 readonly root=new Group();private bones=new Map<string,Bone>();private gaitPhase=0;private gaitWeight=0;private bodyScale=1;private mixer:AnimationMixer;private idle:AnimationAction;private walk:AnimationAction;private walking=false;private keys:ReturnType<typeof waistKeys>;private time=0;private rest:{bone:Bone;position:Vector3;rotation:Quaternion}[]=[];
 constructor(template:Template,seed:number){const appearance=characterLook(seed),recipe=characterTypes[appearance.index];this.bodyScale=recipe.height/1.78;const model=clone(template.gltf.scene);this.root.add(model);model.traverse(o=>{if(o instanceof Bone){this.bones.set(o.name,o);this.rest.push({bone:o,position:o.position.clone(),rotation:o.quaternion.clone()});}if(o instanceof Mesh){o.frustumCulled=false;if(!Array.isArray(o.material)&&o.material.name.startsWith('Fabric-top-')&&appearance.brand!=='none')o.material=template.brands.get(appearance.brand)??o.material;}});this.mixer=new AnimationMixer(model);this.idle=this.mixer.clipAction(template.gltf.animations.find(a=>a.name==='Idle')!);this.walk=this.mixer.clipAction(template.gltf.animations.find(a=>a.name==='Walk')!);this.idle.play();this.walk.play();this.walk.weight=0;this.walk.time=(seed%100)/100*this.walk.getClip().duration;
 this.keys=waistKeys([this.root],[{...recipe,keys:appearance.keys}]);
 }
 update(dt:number,speed:number){for(const {bone,position,rotation} of this.rest){bone.position.copy(position);bone.quaternion.copy(rotation);}this.time+=dt;const moving=speed>.1;if(moving!==this.walking){this.walking=moving;this.walk.setEffectiveWeight(moving?1:0);this.idle.setEffectiveWeight(moving?0:1);}this.walk.timeScale=Math.max(.3,speed/1.35);this.mixer.update(dt);for(const {bone,position,rotation} of this.rest){position.copy(bone.position);rotation.copy(bone.quaternion);}this.keys.update(this.time,moving);}
 // Player locomotion uses stance/swing timing, with a separate airborne running gait.
 locomote(dt:number,speed:number){
  this.gaitWeight+=(Math.min(1,speed/.5)-this.gaitWeight)*(1-Math.exp(-dt*10));
  const running=Math.max(0,Math.min(1,(speed-2)/1.2)),cadence=1.0+running*.45;
  this.gaitPhase+=dt*cadence;
  if(this.gaitWeight<.01)return;
  const pelvis=this.bones.get('pelvis');if(!pelvis)return;
  const phase=this.gaitPhase%1,stance=.62-running*.26,stride=Math.min(.60+running*.3,speed*stance/cadence)*this.gaitWeight;
  const half=phase%.5,flight=stance<.5&&half>stance?Math.sin(Math.PI*(half-stance)/(.5-stance)):0;
  const bounce=(running*.09*flight+.008*Math.cos(phase*Math.PI*4))*this.gaitWeight;
  this.root.updateMatrixWorld(true);
  const hip=this.root.worldToLocal(pelvis.getWorldPosition(new Vector3()));hip.y=.88-running*.08+bounce;hip.z=running*.07;
  pelvis.position.copy(pelvis.parent!.worldToLocal(this.root.localToWorld(hip)));this.root.updateMatrixWorld(true);
  for(const [side,sign] of [['l',1],['r',-1]] as const){
   const t=(phase+(sign<0?.5:0))%1,support=t<stance,q=support?t/stance:(t-stance)/(1-stance);
   const z=support?stride*(.5-q):stride*(-.5+q),lift=support?0:(.065+running*.25)*Math.sin(Math.PI*q);
   this.solveLimb(`thigh_${side}`,`calf_${side}`,`foot_${side}`,this.root.localToWorld(new Vector3(sign*.105,.065+lift,z)),this.root.localToWorld(new Vector3(sign*.12,.6,1)));
   const foot=this.bones.get(`foot_${side}`),ball=this.bones.get(`ball_${side}`);
   if(foot&&ball)this.orientBone(foot,ball,foot.getWorldPosition(new Vector3()).add(new Vector3(0,support?-.055:-.075,.13).applyQuaternion(this.root.getWorldQuaternion(new Quaternion()))));
  }
  this.alignArms(speed);
 }
 alignArms(speed:number){
  if(speed<.1)return;
  const running=Math.max(0,Math.min(1,(speed-2)/1.2)),scale=this.bodyScale;
  this.root.updateMatrixWorld(true);
  const left=this.bones.get('foot_l'),right=this.bones.get('foot_r');if(!left||!right)return;
  const stride=this.root.worldToLocal(left.getWorldPosition(new Vector3())).z-this.root.worldToLocal(right.getWorldPosition(new Vector3())).z;
  const amplitude=Math.max(-1,Math.min(1,stride/(.6*scale)))*(.30+running*.30);
  for(const [side,sign] of [['l',1],['r',-1]] as const){
   const shoulder=this.bones.get(`upperarm_${side}`),elbow=this.bones.get(`lowerarm_${side}`),wrist=this.bones.get(`hand_${side}`),finger=this.bones.get(`middle_01_${side}`);
   if(!shoulder||!elbow||!wrist||!finger)continue;
   // Opposite shoulder swings, with forward-only elbow flexion and a neutral wrist.
   const swing=-sign*amplitude,flex=.16+running*1.18;
   const direction=(angle:number)=>new Vector3(sign*.025,-Math.cos(angle),Math.sin(angle)).transformDirection(this.root.matrixWorld);
   this.orientBone(shoulder,elbow,shoulder.getWorldPosition(new Vector3()).add(direction(swing)));
   this.orientBone(elbow,wrist,elbow.getWorldPosition(new Vector3()).add(direction(swing+flex)));
   this.orientBone(wrist,finger,wrist.getWorldPosition(new Vector3()).add(direction(swing+flex-.06)));
  }
 }
 private orientBone(bone:Bone,child:Bone,target:Vector3){const from=bone.getWorldPosition(new Vector3()),current=child.getWorldPosition(new Vector3()).sub(from).normalize(),desired=target.clone().sub(from).normalize(),world=bone.getWorldQuaternion(new Quaternion());world.premultiply(new Quaternion().setFromUnitVectors(current,desired));bone.quaternion.copy(bone.parent!.getWorldQuaternion(new Quaternion()).invert().multiply(world));this.root.updateMatrixWorld(true);}
 private solveLimb(aName:string,bName:string,cName:string,target:Vector3,pole:Vector3){const bones=this.bones;const a=bones.get(aName),b=bones.get(bName),c=bones.get(cName);if(!a||!b||!c)return;const p=a.getWorldPosition(new Vector3()),q=b.getWorldPosition(new Vector3()),r=c.getWorldPosition(new Vector3()),l1=p.distanceTo(q),l2=q.distanceTo(r),delta=target.clone().sub(p),distance=Math.min(delta.length(),l1+l2-.001),dir=delta.normalize(),along=(l1*l1-l2*l2+distance*distance)/(2*distance),height=Math.sqrt(Math.max(0,l1*l1-along*along)),bend=pole.clone().sub(p);bend.addScaledVector(dir,-bend.dot(dir)).normalize();this.orientBone(a,b,p.clone().addScaledVector(dir,along).addScaledVector(bend,height));this.orientBone(b,c,target);}
 ride(phase:number,steering=0){
  const bones=this.bones,pelvis=bones.get('pelvis');if(!pelvis)return;
  this.root.updateMatrixWorld(true);pelvis.position.copy(pelvis.parent!.worldToLocal(this.root.localToWorld(new Vector3(0,fit.hipY,fit.hipZ))));this.root.updateMatrixWorld(true);
  const lean=(bone:Bone,angle:number)=>{const axis=new Vector3(1,0,0).transformDirection(this.root.matrixWorld),world=bone.getWorldQuaternion(new Quaternion()).premultiply(new Quaternion().setFromAxisAngle(axis,angle));bone.quaternion.copy(bone.parent!.getWorldQuaternion(new Quaternion()).invert().multiply(world));this.root.updateMatrixWorld(true);};
  lean(pelvis,.08);for(const [name,angle] of [['spine_01',.16],['spine_02',.10]] as const){const bone=bones.get(name);if(bone)lean(bone,angle);}
  const rotation=this.root.getWorldQuaternion(new Quaternion()),handRotation=rotation.clone().multiply(new Quaternion().setFromAxisAngle(new Vector3(0,1,0),steering)),forward=new Vector3(0,-.10,1).normalize().applyQuaternion(handRotation);
  for(const [side,sign] of [['l',1],['r',-1]] as const){
   this.solveLimb(`thigh_${side}`,`calf_${side}`,`foot_${side}`,this.root.localToWorld(bicycleFoot(sign,phase)),this.root.localToWorld(new Vector3(sign*.18,.6,.8)));
   const grip=this.root.localToWorld(bicycleGrip(sign,steering)),hand=bones.get(`hand_${side}`)!,middle=bones.get(`middle_01_${side}`)!,index=bones.get(`index_01_${side}`)!,pinky=bones.get(`pinky_01_${side}`)!;
   const palmLength=hand.getWorldPosition(new Vector3()).distanceTo(middle.getWorldPosition(new Vector3()));
   const wrist=grip.clone().addScaledVector(forward,-palmLength).add(new Vector3(0,.016,0).applyQuaternion(handRotation));
   this.solveLimb(`upperarm_${side}`,`lowerarm_${side}`,`hand_${side}`,wrist,this.root.localToWorld(new Vector3(sign*.38,1.05,-.05)));
   this.orientBone(hand,middle,hand.getWorldPosition(new Vector3()).add(forward));
   // Align the palm across the grip, then flex fingers around its cylindrical surface.
   const width=index.getWorldPosition(new Vector3()).sub(pinky.getWorldPosition(new Vector3()));width.addScaledVector(forward,-width.dot(forward)).normalize();
   const desired=new Vector3(-sign,0,0).applyQuaternion(handRotation),roll=Math.atan2(forward.dot(width.clone().cross(desired)),width.dot(desired));
   const world=hand.getWorldQuaternion(new Quaternion()).premultiply(new Quaternion().setFromAxisAngle(forward,roll));hand.quaternion.copy(hand.parent!.getWorldQuaternion(new Quaternion()).invert().multiply(world));this.root.updateMatrixWorld(true);
   for(const finger of ['index','middle','ring','pinky']){
    const a=bones.get(`${finger}_01_${side}`)!,b=bones.get(`${finger}_02_${side}`)!,c=bones.get(`${finger}_03_${side}`)!;
    this.orientBone(a,b,a.getWorldPosition(new Vector3()).add(new Vector3(0,-.9,.435).applyQuaternion(handRotation)));
    this.orientBone(b,c,b.getWorldPosition(new Vector3()).add(new Vector3(0,-.2,-.98).applyQuaternion(handRotation)));
    const tipDirection=new Vector3(0,1,0).applyQuaternion(c.getWorldQuaternion(new Quaternion())),tipTarget=new Vector3(0,.8,-.6).applyQuaternion(handRotation),tipWorld=c.getWorldQuaternion(new Quaternion()).premultiply(new Quaternion().setFromUnitVectors(tipDirection,tipTarget));c.quaternion.copy(c.parent!.getWorldQuaternion(new Quaternion()).invert().multiply(tipWorld));this.root.updateMatrixWorld(true);
   }
   const thumb=bones.get(`thumb_01_${side}`)!,thumb2=bones.get(`thumb_02_${side}`)!,thumb3=bones.get(`thumb_03_${side}`)!;
   this.orientBone(thumb,thumb2,grip.clone().add(new Vector3(-sign*.02,-.02,-.015).applyQuaternion(handRotation)));
   this.orientBone(thumb2,thumb3,grip.clone().add(new Vector3(-sign*.005,-.025,.008).applyQuaternion(handRotation)));
   const foot=bones.get(`foot_${side}`),ball=bones.get(`ball_${side}`);if(foot&&ball)this.orientBone(foot,ball,foot.getWorldPosition(new Vector3()).add(new Vector3(0,-.015,.15).applyQuaternion(rotation)));
  }
 }

 dispose(){const skeletons=new Set<Skeleton>();this.root.traverse(o=>{if(o instanceof SkinnedMesh)skeletons.add(o.skeleton);});for(const skeleton of skeletons)skeleton.dispose();this.mixer.stopAllAction();this.mixer.uncacheRoot(this.mixer.getRoot());for(const entry of this.keys.entries)entry.root.traverse(o=>{if(o instanceof Mesh){o.geometry.dispose();for(const m of Array.isArray(o.material)?o.material:[o.material])m.dispose();}});this.root.removeFromParent();}
}
export interface CrowdActor {x:number;z:number;y?:number;heading:number;speed:number;seed:number;look?:number}
export class CharacterCrowd {
 readonly root=new Group();private batches=new Map<number,InstancedMesh>();private instances=new Map<CrowdActor,CharacterInstance>();private temp=new Object3D();private detailed=0;
 private library:CharacterLibrary;
 constructor(library=characterLibrary()){this.library=library;}
 update(people:CrowdActor[],camera:Vector3,dt:number){
  for(const [index,model] of this.library.far)if(!this.batches.has(index)){const batch=new InstancedMesh(model.geometry,model.material,210);batch.frustumCulled=false;this.root.add(batch);this.batches.set(index,batch);}
  for(const batch of this.batches.values())batch.count=0;
  const nearest=people.map(a=>({a,d:Math.hypot(a.x-camera.x,a.z-camera.z,camera.y-(a.y??FOOT_TOP))})).filter(p=>p.d<CHARACTER_NEAR_DISTANCE).sort((a,b)=>a.d-b.d).slice(0,CHARACTER_NEAR_LIMIT),selected=new Set(nearest.map(p=>p.a));
  for(const [actor,instance] of this.instances)if(!selected.has(actor)){instance.dispose();this.instances.delete(actor);}
  for(const a of people){const seed=a.look??a.seed,index=characterLook(seed).index;
   if(selected.has(a)){this.library.request(index);const template=this.library.near.get(index);if(template&&!this.instances.has(a)){const instance=new CharacterInstance(template,seed);this.instances.set(a,instance);this.root.add(instance.root);}}
   const instance=this.instances.get(a);if(instance){instance.root.position.set(a.x,a.y??FOOT_TOP,a.z);instance.root.rotation.y=a.heading;instance.update(dt,a.speed);instance.alignArms(a.speed);continue;}
   if(Math.hypot(a.x-camera.x,a.z-camera.z)>CHARACTER_FAR_DISTANCE)continue;const batch=this.batches.get(index);if(!batch)continue;this.temp.position.set(a.x,a.y??FOOT_TOP,a.z);this.temp.rotation.set(0,a.heading,0);this.temp.updateMatrix();batch.setMatrixAt(batch.count++,this.temp.matrix);
  }
  for(const batch of this.batches.values())batch.instanceMatrix.needsUpdate=true;this.detailed=this.instances.size;
 }
 stats(){return {detailed:this.detailed,...this.library.stats()};}
 dispose(){for(const instance of this.instances.values())instance.dispose();for(const batch of this.batches.values())batch.dispose();this.root.clear();}
}
