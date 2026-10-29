// Grate pattern, LED scan/sweep and cart forms adapted from Slop New York (MIT).
import {CURB_RISE,FOOT_TOP} from './curb.ts';
import {Group,InstancedMesh,MeshStandardMaterial,MeshStandardNodeMaterial,MeshBasicNodeMaterial,BoxGeometry,PlaneGeometry,RingGeometry,CylinderGeometry,ConeGeometry,InstancedBufferAttribute,Matrix4,Quaternion,Vector3,type BufferGeometry,type Material,type Texture} from 'three/webgpu';
import {attribute,vec4,uv,texture,positionLocal,fract,smoothstep,length,max,abs,sin,cos,color,mix,time,step} from 'three/tsl';
import {joined} from './actor-geometry.ts';
import {cityNight} from './lighting-state.ts';
import {activeStreetDetails,type StreetDetail} from './street-detail-layout.ts';
import {createDetailAtlas,labelKey} from './street-detail-atlas.ts';
import type {TileData} from './types';
interface DrawItem extends StreetDetail {back?:boolean;}
export class StreetDetails {
 readonly root=new Group();
 private features:StreetDetail[]=[];
 private batches:{mesh:InstancedMesh;items:DrawItem[];matrix:(f:DrawItem)=>Matrix4;labels:boolean}[]=[];
 private materials=new Set<Material>();
 private atlas?:Texture;
 private rects=new Map<string,number[]>();
 private last=new Vector3(Infinity,Infinity,Infinity);
 constructor(){this.root.name='Source-linked commercial and street facilities';}
 setMap(data:TileData[]){
  this.dispose();// Ground-standing dressing sits on the raised footway; facade signs keep their heights.
  this.features=activeStreetDetails(data).map(f=>f.kind==='grate'?{...f,y:f.y+.14+CURB_RISE}:f.kind==='cart'||f.kind==='metro'?{...f,y:FOOT_TOP}:f);this.last.set(Infinity,Infinity,Infinity);if(!this.features.length)return;
  const panels:DrawItem[]=this.features.filter(f=>['led','shop','roadSign','metro','cart'].includes(f.kind)).flatMap(f=>{
   const p={...f};if(f.kind==='metro')p.y+=2.5;
   if(f.kind==='cart'){p.y+=.96;p.w=1.25;p.h=.42;p.x+=Math.sin(p.angle)*.59;p.z+=Math.cos(p.angle)*.59;}
   return ['metro','roadSign'].includes(f.kind)?[p,{...p,back:true,angle:p.angle+Math.PI}]:[p];
  });
  const atlas=createDetailAtlas(panels);this.atlas=atlas.texture;this.rects=atlas.rects;
  const keep=<T extends Material>(m:T)=>{this.materials.add(m);return m;};
  const metal=keep(new MeshStandardMaterial({color:'#374643',roughness:.65,metalness:.55}));
  const steel=keep(new MeshStandardMaterial({color:'#b5c5c2',roughness:.4,metalness:.7}));
  const dark=keep(new MeshStandardMaterial({color:'#202829',roughness:.8}));
  const matrix=(f:DrawItem,x=0,y=0,z=0,sx=1,sy=1,sz=1)=>new Matrix4().compose(new Vector3(f.x+Math.cos(f.angle)*x+Math.sin(f.angle)*z,f.y+y,f.z-Math.sin(f.angle)*x+Math.cos(f.angle)*z),new Quaternion().setFromAxisAngle(new Vector3(0,1,0),f.angle),new Vector3(sx,sy,sz));
  const batch=(name:string,g:BufferGeometry,m:Material,items:DrawItem[],transform:(f:DrawItem)=>Matrix4,labels=false,shadow=true)=>{
   if(!items.length){g.dispose();return;}
   const mesh=new InstancedMesh(g,m,items.length);mesh.name=name;mesh.castShadow=shadow;mesh.receiveShadow=true;
   if(labels)g.setAttribute('detailRect',new InstancedBufferAttribute(new Float32Array(items.length*4),4));
   items.forEach((f,i)=>{mesh.setMatrixAt(i,transform(f));if(labels)(g.getAttribute('detailRect') as InstancedBufferAttribute).setXYZW(i,...this.rects.get(labelKey(f))! as [number,number,number,number]);});
   mesh.computeBoundingSphere();this.root.add(mesh);this.batches.push({mesh,items,matrix:transform,labels});
  };
  const panelMaterial=(glow:number,animated=false)=>{
   const rect=vec4(attribute('detailRect','vec4')),image=texture(this.atlas!,uv().mul(rect.zw).add(rect.xy)).rgb;
   if(animated){const m=keep(new MeshBasicNodeMaterial());const sweep=sin(uv().x.mul(5).add(time.mul(.8))).mul(.045).add(.955).mul(sin(uv().y.mul(320)).mul(.025).add(.975));m.colorNode=image.mul(cityNight.mul(.6).add(1)).mul(sweep);return m;}
   const m=keep(new MeshStandardNodeMaterial({roughness:.6,metalness:.08}));m.colorNode=image;m.emissiveNode=image.mul(cityNight.mul(glow).add(.015));return m;
  };
  batch('Sign cabinets',new BoxGeometry(1,1,1),metal,panels.filter(p=>!p.back),f=>matrix(f,0,0,0,f.w+.1,f.h+.1,f.kind==='roadSign'?.26:.14));
  batch('Animated LED screens',new PlaneGeometry(1,1),panelMaterial(1.2,true),panels.filter(p=>p.kind==='led'),f=>matrix(f,0,0,.085,f.w,f.h,1),true,false);
  batch('Lit shops, metro and food-cart panels',new PlaneGeometry(1,1),panelMaterial(.85),panels.filter(p=>['shop','metro','cart'].includes(p.kind)),f=>matrix(f,0,0,.085,f.w,f.h,1),true,false);
  batch('Actual street names',new PlaneGeometry(1,1),panelMaterial(.05),panels.filter(p=>p.kind==='roadSign'),f=>matrix(f,0,0,.145,f.w,f.h,1),true,false);
  const cloth=keep(new MeshStandardNodeMaterial({roughness:.92}));cloth.colorNode=mix(color('#e7ddc1'),color('#316e60'),step(.5,fract(uv().x.mul(12))));
  const awnings=this.features.filter(f=>f.kind==='awning');
  batch('Striped retail awnings',new BoxGeometry(1,.08,1.6).rotateX(.16).translate(0,-.12,.9),cloth,awnings,f=>matrix(f,0,0,0,f.w,1,1));
  batch('Awning valances',new BoxGeometry(1,.24,.06).translate(0,-.3,1.69),cloth,awnings,f=>matrix(f,0,0,0,f.w,1,1));
  const grate=keep(new MeshStandardNodeMaterial({metalness:.45,roughness:.68,alphaTest:.45}));
  const rings=smoothstep(.35,.52,fract(length(positionLocal.xz).mul(11))),ribs=smoothstep(.25,.45,abs(sin(positionLocal.x.mul(14)).mul(cos(positionLocal.z.mul(14))))),slots=max(rings,ribs);
  grate.colorNode=mix(color('#141312'),color('#3b3936'),slots);grate.opacityNode=step(.4,slots);
  batch('Iron tree grates',new RingGeometry(.2,.95,32).rotateX(-Math.PI/2),grate,this.features.filter(f=>f.kind==='grate'),f=>matrix(f),false,false);
  const metros=this.features.filter(f=>f.kind==='metro');
  batch('Metro entrance light posts',joined([new CylinderGeometry(.09,.13,2.12,8).translate(0,1.06,0),new BoxGeometry(.44,.12,.44).translate(0,.06,0)]),metal,metros,f=>matrix(f));
  const carts=this.features.filter(f=>f.kind==='cart');
  batch('Food-cart steel and counters',joined([new BoxGeometry(1.5,1.05,1.0).translate(0,.84,0),new BoxGeometry(1.7,.08,1.2).translate(0,1.4,0),new CylinderGeometry(.035,.035,1.35,8).translate(0,2.1,0),...[-.45,0,.45].map(x=>new CylinderGeometry(.065,.055,.22,8).translate(x,1.55,.2))]),steel,carts,f=>matrix(f));
  batch('Food-cart casters',joined([-1,1].flatMap(side=>[-1,1].map(end=>new CylinderGeometry(.16,.16,.12,12).rotateZ(Math.PI/2).translate(side*.79,.16,end*.38)))),dark,carts,f=>matrix(f));
  const canopy=keep(new MeshStandardNodeMaterial({roughness:.9}));canopy.colorNode=mix(color('#d3b965'),color('#276a5b'),step(.5,fract(uv().x.mul(8))));
  batch('Food-cart parasols',new ConeGeometry(1.6,.65,8).translate(0,2.78,0),canopy,carts,f=>matrix(f));
 }
 getLightSites(){return this.features.filter(f=>['led','shop','metro','cart'].includes(f.kind)).map(f=>({x:f.x+Math.sin(f.angle)*.3,z:f.z+Math.cos(f.angle)*.3,height:f.y+(f.kind==='metro'?2.6:f.kind==='cart'?2.2:0),angle:f.angle+Math.PI/2,tint:f.kind==='metro'?'#ffb8a2':f.kind==='led'?'#b9e0ef':'#ffdfb1',power:f.kind==='led'?65:f.kind==='shop'?32:22,reach:f.kind==='led'?20:11}));}
 update(_night:number,camera:Vector3){
  if(this.last.distanceToSquared(camera)<400)return;this.last.copy(camera);
  for(const {mesh,items,matrix,labels} of this.batches){let count=0;const attr=mesh.geometry.getAttribute('detailRect') as InstancedBufferAttribute|undefined;
   for(const f of items){const range=f.kind==='led'?1100:f.kind==='grate'?300:650;if(Math.hypot(f.x-camera.x,f.y-camera.y,f.z-camera.z)>range)continue;
    mesh.setMatrixAt(count,matrix(f));if(labels)attr!.setXYZW(count,...this.rects.get(labelKey(f))! as [number,number,number,number]);count++;
   }
   mesh.count=count;mesh.instanceMatrix.needsUpdate=true;if(attr)attr.needsUpdate=true;
  }
 }
 getStats(){return Object.fromEntries(['led','shop','awning','roadSign','grate','metro','cart'].map(kind=>[kind,this.features.filter(f=>f.kind===kind).length]));}
 dispose(){for(const {mesh} of this.batches){mesh.geometry.dispose();mesh.dispose();}for(const m of this.materials)m.dispose();this.atlas?.dispose();this.atlas=undefined;this.materials.clear();this.batches=[];this.features=[];this.rects.clear();this.root.clear();}
}
