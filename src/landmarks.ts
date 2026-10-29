import {createOpera} from './opera.ts';
import { Group, Mesh, BufferGeometry, Float32BufferAttribute, CylinderGeometry, SphereGeometry, BoxGeometry, CatmullRomCurve3, Vector3, Quaternion, MeshStandardMaterial, MeshStandardNodeMaterial, Material } from 'three/webgpu';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { positionWorld, normalWorld, fract, abs, max, step, mix, color, float, vec3, sin, floor, min, cameraPosition, smoothstep } from 'three/tsl';
import { cityNight } from './lighting-state.ts';
import type { Building } from './types';

type Ring = Vector3[];
const UP=new Vector3(0,1,0);
// World-space procedural surfaces; no external images or individually modelled windows.
// Analytic box filtering keeps narrow piers stable when they become subpixel.
function stripe(coord:ReturnType<typeof float>, duty:number) {
  const width=max(coord.fwidth(),.001);
  const integral=(t:ReturnType<typeof float>)=>floor(t).mul(duty).add(min(fract(t),duty));
  return integral(coord.add(width.mul(.5))).sub(integral(coord.sub(width.mul(.5)))).div(width);
}
function curtain(base:string, frame:string, bay:number, vertical=false) {
  const m=new MeshStandardNodeMaterial({metalness:.16,roughness:.24});
  const along=mix(positionWorld.x,positionWorld.z,step(.5,abs(normalWorld.x)));
  const bars=stripe(along.div(bay),vertical?.20:.045);
  const floors=stripe(positionWorld.y.div(3.8),.045);
  const grid=max(bars,floors.mul(vertical?.35:.8));
  const view=cameraPosition.sub(positionWorld).normalize();
  const grazing=abs(normalWorld.dot(view)).oneMinus().pow(3).mul(.50);
  const glazing=mix(color(base),color('#c1d8df'),grazing);
  m.colorNode=mix(mix(glazing,color(frame),grid),color(frame),step(.7,normalWorld.y));
  const room=fract(sin(floor(along.div(bay)).mul(12.98).add(floor(positionWorld.y.div(3.8)).mul(78.23))).mul(43758.5));
  const occupied=step(.62,room);
  // Resolve individual rooms nearby; conserve their mean light once windows are subpixel.
  const footprint=max(along.div(bay).fwidth(),positionWorld.y.div(3.8).fwidth());
  const filtered=mix(occupied,float(.38),smoothstep(.8,1.8,footprint));
  const pane=stripe(along.div(bay),.18).oneMinus().mul(stripe(positionWorld.y.div(3.8),.24).oneMinus());
  const windowColor=mix(color('#ffe0ae'),color('#b4d5ed'),step(.84,room));
  const frameLight=color(vertical?'#c7dce9':'#78bcd7').mul(bars).mul(vertical?.12:.06);
  m.emissiveNode=windowColor.mul(filtered).mul(pane).mul(grid.oneMinus()).mul(.65).add(frameLight).mul(step(.7,normalWorld.y).oneMinus()).mul(cityNight);
  return m;
}
const glass=curtain('#294b60','#819da5',3.2);
const ctfGlass=curtain('#528496','#ede5d1',1.7,true);
const fuliGlass=curtain('#78939b','#d0d5cf',2.7);
const ifpGlass=curtain('#436a7c','#b8c7cd',1.7,true);
const kaihuaGlass=curtain('#506c7b','#ccd1ce',1.8,true);
const ritzGlass=curtain('#485d68','#b1a28a',2.7,true);
const bronze=new MeshStandardMaterial({color:'#b6a17c',metalness:.38,roughness:.35});
const pearlGlass=curtain('#376b7a','#a4b9b8',2.6);
const yingkaiGlass=curtain('#456775','#d2d4ce',1.8,true);
const leatopGlass=curtain('#3f6474','#98aeb4',2.8);
const gtGlass=curtain('#567582','#c5cbc8',2.6);
const gtWall=new MeshStandardNodeMaterial({roughness:.65});
const gtAlong=mix(positionWorld.x,positionWorld.z,step(.5,abs(normalWorld.x)));
const gtWindows=stripe(gtAlong.div(3.2),.45).oneMinus().mul(stripe(positionWorld.y.div(4.4),.42).oneMinus());
gtWall.colorNode=mix(color('#c4c1b5'),color('#3d5966'),gtWindows.mul(step(.7,normalWorld.y).oneMinus()));
const silver=new MeshStandardMaterial({color:'#bacbd0',metalness:.30,roughness:.3});
const stone=new MeshStandardMaterial({color:'#b7b9b2',roughness:.85});
const darkStone=new MeshStandardMaterial({color:'#44454a',roughness:.8});
const red=new MeshStandardMaterial({color:'#6f2430',metalness:.18,roughness:.65});
const blackGlass=new MeshStandardMaterial({color:'#335866',metalness:.12,roughness:.26});
const libraryStone=new MeshStandardNodeMaterial({roughness:.8});
const course=positionWorld.y.div(1.1);
const along=mix(positionWorld.x,positionWorld.z,step(.5,abs(normalWorld.x)));
const joints=max(stripe(course,.09),stripe(along.div(6).add(sin(positionWorld.y.floor()).mul(.4)),.014));
libraryStone.colorNode=mix(color('#e1ddd1'),color('#777e80'),joints.mul(.65));
const stonePanel=fract(sin(floor(along.div(5)).mul(12.9898).add(floor(course).mul(78.233))).mul(43758.5453));
const stoneSlots=step(.74,stonePanel).mul(stripe(course,.18)).mul(step(.7,normalWorld.y).oneMinus());
libraryStone.colorNode=mix(libraryStone.colorNode,color('#626b70'),stoneSlots);
libraryStone.colorNode=mix(libraryStone.colorNode,color('#d3d0c6'),step(.7,normalWorld.y));

gtWall.emissiveNode=color('#ffcf95').mul(gtWindows).mul(cityNight).mul(.65);
libraryStone.emissiveNode=color('#ffe0a6').mul(stoneSlots).mul(cityNight);
const ifcFrame=new MeshStandardNodeMaterial({color:'#bacbd0',metalness:.3,roughness:.3});
ifcFrame.emissiveNode=color('#79b9d8').mul(cityNight).mul(.65);
// The stepped east-tower crown remains readable from across the river.
ctfGlass.emissiveNode=vec3(ctfGlass.emissiveNode!).add(color('#f3d4a5').mul(smoothstep(470,520,positionWorld.y)).mul(cityNight).mul(.12));
const cantonFrame=new MeshStandardNodeMaterial({color:'#bacbd0',metalness:.3,roughness:.3});
cantonFrame.emissiveNode=mix(color('#338fe6'),color('#d844b0'),sin(positionWorld.y.div(48)).mul(.5).add(.5)).mul(cityNight).mul(.78);
export function setLandmarkNight(night:number){
  blackGlass.emissive.set('#ffdcaa');blackGlass.emissiveIntensity=night*.35;
  red.emissive.set('#a82d40');red.emissiveIntensity=night*.6;
}

class Model {
  private batches=new Map<Material,BufferGeometry[]>();
  add(g:BufferGeometry,mat:Material) {
    const geo=g.index?g.toNonIndexed():g;
    if(geo!==g)g.dispose();
    geo.deleteAttribute('uv');geo.clearGroups();
    if(!this.batches.has(mat))this.batches.set(mat,[]);
    this.batches.get(mat)!.push(geo);
  }
  box(x:number,y:number,z:number,w:number,h:number,d:number,mat:Material) {
    this.add(new BoxGeometry(w,h,d).translate(x,y+h/2,z),mat);
  }
  beam(a:Vector3,b:Vector3,r:number,mat:Material,sides=5) {
    const delta=b.clone().sub(a),len=delta.length();if(len<.01)return;
    const q=new Quaternion().setFromUnitVectors(UP,delta.divideScalar(len));
    const g=new CylinderGeometry(r,r,len,sides,1,true);g.applyQuaternion(q);g.translate((a.x+b.x)/2,(a.y+b.y)/2,(a.z+b.z)/2);this.add(g,mat);
  }
  loft(rings:Ring[],mat:Material,cap=true) {
    const n=rings[0].length;
    const signed=rings[0].reduce((s,p,i)=>s+p.x*rings[0][(i+1)%n].z-rings[0][(i+1)%n].x*p.z,0);
    if(signed>0)rings=rings.map(r=>[...r].reverse());
    const positions:number[]=[];
    const tri=(a:Vector3,b:Vector3,c:Vector3)=>positions.push(...a.toArray(),...b.toArray(),...c.toArray());
    for(let k=1;k<rings.length;k++)for(let i=0;i<n;i++) {
      const j=(i+1)%n,a=rings[k-1][i],b=rings[k-1][j],c=rings[k][j],d=rings[k][i];
      tri(a,b,c);tri(a,c,d);
    }
    if(cap)for(const [index,flip] of [[0,true],[rings.length-1,false]] as const) {
      const r=rings[index],center=r.reduce((a,p)=>a.add(p),new Vector3()).divideScalar(n);
      for(let i=0;i<n;i++){const a=r[i],b=r[(i+1)%n];if(flip)tri(center,b,a);else tri(center,a,b);}
    }
    const g=new BufferGeometry();g.setAttribute('position',new Float32BufferAttribute(positions,3));g.computeVertexNormals();this.add(g,mat);
  }
  finish(b:Building) {
    const root=new Group();root.name=`landmark:${b.landmark}`;root.userData={sourceId:b.id,height:b.h,referenceHeightSource:b.hs};
    for(const [material,geos] of this.batches){
      const g=mergeGeometries(geos,false);geos.forEach(v=>v.dispose());
      if(!g)throw new Error(`地标几何体合并失败：${b.id}`);
      g.computeBoundingSphere();const mesh=new Mesh(g,material);mesh.castShadow=true;mesh.receiveShadow=true;root.add(mesh);
    }
    return root;
  }
}
function dimensions(b:Building) {
  const ring=b.p[0].slice(0,-1),xs=ring.map(p=>p[0]),zs=ring.map(p=>p[1]);
  const xmin=Math.min(...xs),xmax=Math.max(...xs),zmin=Math.min(...zs),zmax=Math.max(...zs);
  return {x:(xmin+xmax)/2,z:(zmin+zmax)/2,w:xmax-xmin,d:zmax-zmin};
}
function rectangle(x:number,z:number,w:number,d:number,y:number,bevel=0):Ring {
  const a=w/2,c=d/2,b=bevel;
  return [[a-b,c],[a,c-b],[a,-c+b],[a-b,-c],[-a+b,-c],[-a,-c+b],[-a,c-b],[-a+b,c]].map(([px,pz])=>new Vector3(x+px,y,z+pz));
}

function ctf(b:Building,m:Model) {
  const {x,z,w,d}=dimensions(b);
  // Four program zones, tapered transitions and an inclined crown. Setback
  // proportions are photo-derived approximations; overall height is KPF's 530m.
  const sections=[[0,1,0],[270,1,0],[291,.90,-.035],[365,.90,-.035],[385,.78,-.08],[467,.78,-.08],[489,.68,-.13],[b.h-12,.68,-.13]];
  const rings=sections.map(([y,s,shift])=>rectangle(x+w*shift,z+d*shift,w*s,d*s,y,2.2));
  rings[rings.length-1].forEach(p=>{p.y+=(p.x-x+w*.13)/(w*.68)*24;});
  m.loft(rings,ctfGlass);
  for(const y of [270,365,467]) {
    const s=y===270?1:y===365?.90:.78,shift=y===270?0:y===365?-.035:-.08;
    const r=rectangle(x+w*shift,z+d*shift,w*s+.4,d*s+.4,y,2.2);
    for(let i=0;i<r.length;i++)m.beam(r[i],r[(i+1)%r.length],.42,silver);
  }
}
function ifc(b:Building,m:Model) {
  const p=b.p[0].slice(0,-1),x=p.reduce((s,v)=>s+v[0],0)/p.length,z=p.reduce((s,v)=>s+v[1],0)/p.length;
  // Resample the real rounded-triangle footprint rather than replacing it with a cylinder.
  const curve=new CatmullRomCurve3(p.map(([px,pz])=>new Vector3(px,0,pz)),true,'centripetal');
  const sample=(u:number,t:number)=>{
    const point=curve.getPointAt((u%1+1)%1);
    const scale=.94+.095*Math.sin(Math.PI*t)-.20*t*t;
    return new Vector3(x+(point.x-x)*scale,t*b.h,z+(point.z-z)*scale);
  };
  const rings=Array.from({length:29},(_,k)=>Array.from({length:72},(_,i)=>sample(i/72,k/28)));
  m.loft(rings,glass);
  const count=18,levels=12;
  for(let level=0;level<levels;level++)for(let j=0;j<count;j++)for(const direction of [-1,1]) {
    // Each structural diagonal follows the curved skin through four short segments.
    for(let step=0;step<4;step++){
      const a=step/4,c=(step+1)/4;
      m.beam(sample((j+direction*a)/count,(level+a)/levels),sample((j+direction*c)/count,(level+c)/levels),.48-.18*(level+a)/levels,ifcFrame);
    }
  }
}
function museum(b:Building,m:Model) {
  const {x,z,w,d}=dimensions(b),base=12,h=b.h-base;
  m.box(x,base,z,w-3,h-1,d-3,red);
  // Dark cladding broken by connected recessed red slots (not a flat red cube).
  const columns=14,rows=5,dy=h/rows;
  for(let face=0;face<4;face++)for(let i=0;i<columns;i++)for(let j=0;j<rows;j++){
    const recess=((i+face*3)%11===Math.floor(j*.8)+2)||((i+face)%13===7&&j>1)||((i+2*face)%9===3&&j===3);
    if(recess)continue;
    const width=(face%2===0?w:d)/columns;
    const across=(i+.5)*width-(face%2===0?w:d)/2;
    if(face%2===0)m.box(x+across,base+j*dy,z+(face===0?1:-1)*d/2,width-.3,dy-.25,1.5,darkStone);
    else m.box(x+(face===1?1:-1)*w/2,base+j*dy,z+across,1.5,dy-.25,width-.3,darkStone);
  }
  // Satellite imagery shows a grey roof around a light square atrium skylight, not a red top.
  m.box(x,b.h-1.8,z,w,.8,d,darkStone);
  for(let i=0;i<9;i++)for(let j=0;j<6;j++){
    const atrium=Math.abs(i-4)<=1&&Math.abs(j-2.5)<=1;
    m.box(x+(i-4)*w/9,b.h-1,z+(j-2.5)*d/6,w/9-.5,atrium?.6:1,d/6-.5,atrium?silver:stone);
  }
  m.box(x,0,z,w*.43,base,d*.44,darkStone);
  m.box(x,base-1,z,w-1,1,d-1,darkStone);
}
function library(b:Building,m:Model) {
  const {x,z,w,d}=dimensions(b);
  // Two bending, leaning stone wings and the glass atrium between them.
  for(const side of [-1,1]) {
    const length=w*.94,depth=d*.30,center=z+side*d*.32;
    const outline:number[][]=[];
    for(const edge of [1,-1])for(let i=0;i<=18;i++) {
      const t=edge===1?i/18:1-i/18,px=(t-.5)*length;
      const curve=Math.sin(t*Math.PI)*d*.055;
      outline.push([px,center+edge*depth/2+curve]);
    }
    const rings=[0,.18,.55,1].map(t=>outline.map(([px,pz])=>{
      const roof=(side===-1?b.h:b.h*.91)-5*Math.pow(px/(length/2),2);
      const underside=side===1?8+3*px/(length/2):0;
      return new Vector3(x+px+6*t,underside+(roof-underside)*t,pz+side*8*t);
    }));
    m.loft(rings,libraryStone);
    // Real stone courses have a shallow shadow gap. Keep these few horizontal
    // bands as merged geometry so the facade remains legible at street distance.
    const at=(y:number)=>outline.map(([px,pz])=>{
      const roof=(side===-1?b.h:b.h*.91)-5*Math.pow(px/(length/2),2),t=y/roof;
      return new Vector3(x+px*1.002+6*t,y,pz+side*8*t+(pz-center)*.025);
    });
    for(let y=2;y<b.h*.78;y+=1.4)m.loft([at(y),at(y+.18)],darkStone,false);
  }
  const atrium=rectangle(x,z,w*.83,d*.28,1,0);
  m.loft([atrium,atrium.map(p=>new Vector3(p.x+5,b.h*.75,p.z))],blackGlass);
  // The leaning atrium has continuous vertical mullions and glazed roof ribs.
  for(let column=0;column<=16;column++){
    const px=x-w*.415+column*w*.83/16;
    for(const side of [-1,1])m.beam(new Vector3(px,1,z+side*d*.14),new Vector3(px+5,b.h*.75,z+side*d*.14),.10,silver);
    m.beam(new Vector3(px+5,b.h*.75,z-d*.14),new Vector3(px+5,b.h*.75,z+d*.14),.10,silver);
  }
  // Atrium glazing transoms, merged into one batch.
  for(let level=1;level<9;level++) {
    const y=level*b.h*.075,shift=5*y/(b.h*.75);
    m.beam(new Vector3(x-w*.415+shift,y,z-d*.14),new Vector3(x+w*.415+shift,y,z-d*.14),.09,silver);
    m.beam(new Vector3(x-w*.415+shift,y,z+d*.14),new Vector3(x+w*.415+shift,y,z+d*.14),.09,silver);
  }
}
function canton(b:Building,m:Model) {
  const {x,z}=dimensions(b),body=454,twist=Math.PI*.75;
  const point=(angle:number,t:number)=>{
    const a=new Vector3(Math.cos(angle)*34,0,Math.sin(angle)*25);
    const top=new Vector3(Math.cos(angle)*27,0,Math.sin(angle)*21).applyAxisAngle(UP,twist);
    return a.lerp(top,t).add(new Vector3(x,t*body,z));
  };
  // The envelope is formed by straight generators between two rotated ellipses.
  for(let j=0;j<24;j++)for(let k=0;k<24;k++)m.beam(point(j/24*Math.PI*2,k/24),point(j/24*Math.PI*2,(k+1)/24),.48,cantonFrame,6);
  for(let level=0;level<=32;level++)for(let j=0;j<48;j++)m.beam(point(j/48*Math.PI*2,level/32),point((j+1)/48*Math.PI*2,level/32),.29,cantonFrame);
  for(let k=0;k<16;k++)for(let j=0;j<24;j++)for(const dir of [-1,1])m.beam(point(j/24*Math.PI*2,k/16),point((j+dir)/24*Math.PI*2,(k+1)/16),.17,cantonFrame,4);
  // Narrow service core leaves the lattice and waist legible from both sides.
  m.add(new CylinderGeometry(5.5,7,body,16).translate(x,body/2,z),blackGlass);
  m.add(new CylinderGeometry(17,12,72,32).translate(x,404,z),glass);
  for(const y of [376,400,424,450]){
    const t=y/body;for(let j=0;j<48;j++)m.beam(point(j/48*Math.PI*2,t),point((j+1)/48*Math.PI*2,t),.65,cantonFrame);
  }
  m.add(new CylinderGeometry(1.4,3,110,12).translate(x,509,z),cantonFrame);
  m.add(new CylinderGeometry(.42,1.4,b.h-564,8).translate(x,(564+b.h)/2,z),red);
}

function pearl(b:Building,m:Model) {
  const {x,z,w,d}=dimensions(b),mat=pearlGlass;
  // Two open mechanical bands and a curved front; slot heights are photo-based.
  const ring=(y:number)=>{
    const points:Vector3[]=[],scale=.94+.05*Math.sin(Math.PI*y/b.h);
    for(const side of [1,-1])for(let i=0;i<=16;i++){
      const u=side===1?i/16:1-i/16,px=(u-.5)*w*scale;
      const curve=side===1?d*.16*(1-Math.pow(2*u-1,2)):0;
      points.push(new Vector3(x+px,y,z+side*d*scale/2-curve));
    }
    return points;
  };
  for(const [a,c] of [[0,96],[108,200],[212,b.h]])m.loft([ring(a),ring((a+c)/2),ring(c)],mat);
  for(const y of [96,200]){
    for(const side of [-1,1])m.box(x+side*w*.39,y,z,w*.18,12,d*.94,mat);
    m.box(x,y+2,z-d*.35,w*.58,7,2,blackGlass);
  }
}
function yingkai(b:Building,m:Model) {
  const {x,z,w,d}=dimensions(b),mat=yingkaiGlass;
  const sections=[0,.18,.48,.74,1].map(t=>{
    const r=rectangle(x,z,w*(1-.025*t),d*(1-.025*t),t*b.h,1+8*Math.sin(t*Math.PI*.75));
    // The carved corners vary by elevation instead of a generic square extrusion.
    return r;
  });
  m.loft(sections,mat);
  const roof=rectangle(x,z,w*.88,d*.88,b.h-3,3);
  for(let i=0;i<roof.length;i++)m.beam(roof[i],roof[(i+1)%roof.length],.25,silver);
}
function leatop(b:Building,m:Model) {
  const {x,z,w,d}=dimensions(b),mat=leatopGlass;
  const roof=rectangle(x,z,w*.97,d*.97,b.h-18,1.6);
  roof.forEach(p=>p.y+=(p.x-x)/(w*.97)*36);
  m.loft([rectangle(x,z,w*.83,d*.83,0,1.5),rectangle(x,z,w*.97,d*.97,22,1.6),roof],mat);
  for(let i=0;i<roof.length;i++)m.beam(roof[i],roof[(i+1)%roof.length],.3,silver);
}

function fuli(b:Building,m:Model) {
  const {x,z}=dimensions(b),outline=b.p[0].slice(0,-1);
  const mat=fuliGlass;
  // The source plan already records the shallow concavity on all four faces.
  const ring=(y:number,extra=0)=>outline.map(([px,pz])=>{
    const scale=1-.055*y/b.h+extra;
    return new Vector3(x+(px-x)*scale,y,z+(pz-z)*scale);
  });
  const bands=[[0,57],[63,121],[127,182],[188,b.h-12]];
  for(const [a,c] of bands)m.loft([ring(a),ring(c)],mat);
  // Recessed plant floors, with a continuous core rather than floating sections.
  for(const y of [57,121,182]){
    m.loft([ring(y,-.13),ring(y+6,-.13)],blackGlass);
    m.loft([ring(y+.3,.012),ring(y+1.4,.012)],silver);
  }
  for(let y=4;y<b.h-13;y+=4.25){
    if([57,121,182].some(v=>y>v&&y<v+6))continue;
    m.loft([ring(y,.016),ring(y+.55,.016)],silver);
  }
  const lower=ring(b.h-12),upper=ring(b.h);
  for(let i=0;i<lower.length;i++){
    m.beam(lower[i],upper[i],.30,silver);
    m.beam(upper[i],upper[(i+1)%upper.length],.26,silver);
  }
  for(const y of [b.h-12,b.h-7]){
    const r=ring(y);for(let i=0;i<r.length;i++)m.beam(r[i],r[(i+1)%r.length],.2,silver);
  }
}

function ifp(b:Building,m:Model) {
  const {x,z,w,d}=dimensions(b),mat=ifpGlass;
  // Two slim parallel sails occupy the mapped tower part. The separate source
  // podium is retained by data processing, instead of extruding it to 198 m.
  for(const side of [-1,1]) {
    const center=z+side*d*.27,depth=d*.40,height=side===1?b.h:b.h-14;
    const ring=(t:number)=>{
      const points:Ring=[];
      for(const edge of [1,-1])for(let i=0;i<=20;i++){
        const u=edge===1?i/20:1-i/20;
        const roof=height-20*(1-u),bend=Math.sin(Math.PI*u)*d*.055;
        points.push(new Vector3(x+(u-.5)*w*.97,roof*t,center+edge*depth/2+bend+Math.sin(t*Math.PI*.8)*side*2.5));
      }
      return points;
    };
    m.loft([ring(0),ring(.45),ring(.85),ring(1)],mat);
    const top=ring(1);
    for(let i=0;i<top.length;i++)m.beam(top[i],top[(i+1)%top.length],.28,silver);
    // Visible blade-like piers follow the bow of each sail.
    for(let i=0;i<=20;i++)for(let j=0;j<8;j++)m.beam(ring(j/8)[i],ring((j+1)/8)[i],.13,silver,4);
  }
  m.box(x,0,z,w*.60,b.h-34,d*.23,blackGlass);
}

function kaihua(b:Building,m:Model) {
  const {x,z,w,d}=dimensions(b),tw=w*.82,td=d*.66,cz=z-d*.10;
  const mat=kaihuaGlass,roof=b.h-16;
  // The footprint includes low retail volumes; the office shaft is narrower.
  m.box(x,0,z,w,23,d,glass);
  m.box(x,23,z,w*.94,1.3,d*.96,silver);
  m.box(x,24.3,cz,tw,roof-24.3,td,mat);
  // Two projecting sides frame the deep roof notch, seen in the supplied
  // architect's aerial rendering. Heights and notch depth are photo estimates.
  for(const side of [-1,1]){
    const cx=x+side*tw*.35,top=b.h-(side===-1?4:0);
    m.box(cx,roof,cz,tw*.30,top-roof,td,mat);
    m.box(cx,top-1,cz,tw*.33,1,td*1.02,silver);
  }
  m.box(x,roof,cz+td*.35,tw*.40,7,td*.30,mat);
  for(const side of [-1,1])for(let i=0;i<=12;i++) {
    const px=x+(i/12-.5)*tw,top=(i<4||i>8)?b.h-(i<4?4:0):roof;
    m.box(px,24,cz+side*(td/2+.25),.45,top-24,.65,silver);
  }
  for(const y of [69,132,194,roof-2])m.box(x,y,cz,tw+1,1.1,td+1,silver);
}

function ritz(b:Building,m:Model) {
  const {x,z,w,d}=dimensions(b),tw=w*.78,td=d*.64,cz=z-d*.06;
  const mat=ritzGlass;
  m.box(x,0,z,w,27,d,mat);
  m.box(x,27,z,w,1,d,bronze);
  // Concave upper facade and two swept metal blades, based on the hotel's
  // exterior photograph. No invented classical spires or generic flat roof.
  const ring=(t:number)=>{
    const result:Ring=[];
    for(const side of [1,-1])for(let i=0;i<=18;i++){
      const u=side===1?i/18:1-i/18;
      const crown=b.h-7*Math.sin(Math.PI*u)-(side===-1?5:0);
      const bend=Math.sin(Math.PI*u)*td*.10;
      const sweep=5*Math.pow(Math.max(0,(t-.80)/.20),2);
      result.push(new Vector3(x+(u-.5)*tw,crown*t,cz+side*(td/2-bend+sweep)));
    }
    return result;
  };
  m.loft([ring(0),ring(.65),ring(.8),ring(.9),ring(1)],mat,false);
  const top=ring(1);
  for(let i=0;i<top.length;i++)m.beam(top[i],top[(i+1)%top.length],.42,bronze);
  for(const index of [0,18,19,37])for(let j=0;j<16;j++)m.beam(ring(j/16)[index],ring((j+1)/16)[index],.48,bronze);
  for(let i=1;i<18;i++){
    const a=top[i],lower=ring(.91)[i];m.beam(lower,a,.16,bronze,4);
  }
  // Shorter rear plant enclosure leaves both crown blades legible.
  m.box(x,b.h-16,cz,tw*.88,5,td*.86,blackGlass);
}

function roundedRectangle(x:number,z:number,w:number,d:number,y:number,r:number):Ring {
  const points:Ring=[];
  for(let c=0;c<4;c++)for(let i=0;i<8;i++){
    const angle=c*Math.PI/2+i/7*Math.PI/2;
    const cx=x+(c===0||c===3?1:-1)*(w/2-r),cz=z+(c<2?1:-1)*(d/2-r);
    points.push(new Vector3(cx+Math.cos(angle)*r,y,cz+Math.sin(angle)*r));
  }
  return points;
}
function gtwinter(b:Building,m:Model) {
  const {x,z,w,d}=dimensions(b);
  if(b.landmark==='gtwinterWest'){
    m.box(x,0,z,w,b.h,d,gtWall);
    m.box(x,0,z+d*.30,w,14,d*.40,glass);
    for(const y of [14,20,b.h-8])m.box(x,y,z,w+.3,.7,d+.3,silver);
    return;
  }
  const south=b.landmark==='gtwinterSouth',shaft=south?b.h-30:b.h-9;
  const ring=(y:number,scale=1)=>roundedRectangle(x,z,w*scale,d*scale,y,Math.min(w,d)*.16);
  m.loft([ring(0,.92),ring(24),ring(shaft)],gtGlass);
  if(south){
    // The hotel has a rounded upper shaft, recessed plant band and smaller cap.
    m.loft([ring(shaft,.84),ring(shaft+7,.84)],blackGlass);
    m.loft([ring(shaft+7,.92),ring(b.h,.92)],gtGlass);
  }else m.loft([ring(shaft,.82),ring(b.h,.82)],gtGlass);
  for(const side of [-1,1]){
    m.box(x+side*w*.43,0,z-d*.14,1.1,shaft,d*.55,silver);
    m.box(x+side*w*.36,shaft,z-d*.14,.7,b.h-shaft,d*.46,silver);
  }
  for(const y of [24,shaft*.34,shaft*.67,shaft]){
    const r=ring(y);for(let i=0;i<r.length;i++)m.beam(r[i],r[(i+1)%r.length],.28,silver);
  }
}
function youth(b:Building,m:Model) {
  const {x,z,w,d}=dimensions(b),cx=x+w*.09,cz=z-d*.04;
  // Northern teaching bar and southern crescent follow the actual K-like plan.
  m.box(x,0,z-d*.32,w*.97,29,d*.29,gtWall);
  for(const side of [-1,1]) {
    const outline:Ring=[];
    for(const edge of [1,-1])for(let i=0;i<=16;i++){
      const u=edge===1?i/16:1-i/16;
      const px=cx+side*(12+u*(side===-1?w*.52:w*.29));
      outline.push(new Vector3(px,0,cz+d*.47*u*u+edge*6));
    }
    const ring=(y:number)=>outline.map(p=>new Vector3(p.x,y,p.z));
    m.loft([ring(4),ring(26)],silver);
    // The ground floor is open beneath the curved silver volume.
    for(let i=2;i<16;i+=3)m.beam(new Vector3(outline[i].x,0,outline[i].z-6),new Vector3(outline[i].x,4,outline[i].z-6),.45,silver);
  }
  m.add(new CylinderGeometry(11,13,b.h-6,32).scale(1,1,.8).translate(cx,(b.h-6)/2,cz),glass);
  m.add(new SphereGeometry(1,32,12,0,Math.PI*2,0,Math.PI/2).scale(11,6,8.8).translate(cx,b.h-6,cz),glass);
  // Triangular/conical glazed entrance meets the round central atrium.
  m.add(new CylinderGeometry(1,15,23,3).rotateY(Math.PI).scale(1,1,.75).translate(cx,11.5,cz+8),glass);
  for(let y=4;y<29;y+=4)m.add(new CylinderGeometry(11.3,11.3,.18,32,1,true).scale(1,1,.8).translate(cx,y,cz),silver);
}
function gtspring(b:Building,m:Model) {
  const {x,z,w,d}=dimensions(b),cx=x-w*.35,cz=z-d*.15,tw=w*.30,td=d*.70;
  const ring=(y:number)=>{
    const points:Ring=[];
    for(const side of [1,-1])for(let i=0;i<=16;i++){
      const u=side===1?i/16:1-i/16;
      points.push(new Vector3(cx+side*tw/2-(side===1?tw*.17*Math.pow(2*u-1,2):0),y,cz+(u-.5)*td));
    }
    return points;
  };
  m.box(x,0,z,w*.94,16,d*.90,glass);
  m.loft([ring(0),ring(b.h-19)],gtWall);
  const top=ring(b.h);top.forEach(p=>p.y-=7*Math.pow((p.z-cz)/(td/2),2));
  m.loft([ring(b.h-19),top],gtGlass);
  for(let i=0;i<=16;i+=2)m.beam(ring(b.h-19)[i],top[i],.32,silver);
  const bx=x+w*.25,bz=z+d*.20,bw=w*.44,bd=d*.44;
  m.loft([roundedRectangle(bx,bz,bw,bd,16,6),roundedRectangle(bx,bz,bw,bd,48,6)],gtGlass);
  for(const y of [16,24,32,40,48]){
    const r=roundedRectangle(bx,bz,bw,bd,y,6);for(let i=0;i<r.length;i++)m.beam(r[i],r[(i+1)%r.length],.20,silver);
  }
}
function gtlowrise(b:Building,m:Model) {
  const {x,z,w,d}=dimensions(b),summer=b.landmark==='gtsummer';
  // Paired C/D and E/F volumes sit at the north and south of the shared podium.
  // Their total heights are explicitly labelled floor-based estimates in data.
  m.box(x,0,z,w*.95,18,d*.96,glass);
  for(const side of [-1,1]){
    const h=side===-1?b.h:b.h*(summer?.95:20/22),cx=x+side*w*.045,cz=z+side*d*.29;
    const tw=w*.64,td=d*.39;
    const ring=(y:number)=>roundedRectangle(cx,cz,tw,td,y,summer?8:4);
    m.loft([ring(18),ring(h-7)],gtGlass);
    m.loft([ring(h-7),ring(h)],summer?gtWall:gtGlass);
    for(let y=22;y<h-3;y+=4.5){
      const r=ring(y);for(let i=0;i<r.length;i++)m.beam(r[i],r[(i+1)%r.length],.16,silver,4);
    }
  }
}

export function createLandmark(b:Building) {
  if(b.landmark==='opera')return createOpera(b);
  const model=new Model();
  switch(b.landmark){case 'ctf':ctf(b,model);break;case 'ifc':ifc(b,model);break;case 'museum':museum(b,model);break;case 'library':library(b,model);break;case 'canton':canton(b,model);break;case 'pearl':pearl(b,model);break;case 'yingkai':yingkai(b,model);break;case 'leatop':leatop(b,model);break;case 'fuli':fuli(b,model);break;case 'ifp':ifp(b,model);break;case 'kaihua':kaihua(b,model);break;case 'ritz':ritz(b,model);break;case 'gtwinterNorth':case 'gtwinterSouth':case 'gtwinterWest':gtwinter(b,model);break;case 'youth':youth(b,model);break;case 'gtspring':gtspring(b,model);break;case 'gtsummer':case 'gtautumn':gtlowrise(b,model);break;default:throw new Error('未知地标');}
  return model.finish(b);
}
