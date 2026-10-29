import {Group,Mesh,BufferGeometry,Float32BufferAttribute,CylinderGeometry,Vector3,Quaternion,type Material} from 'three/webgpu';
import {mergeGeometries} from 'three/addons/utils/BufferGeometryUtils.js';
import {operaGranite as granite,operaWhite as white,operaGlass as glazing,operaFrame as frame,operaSurfaceUV} from './opera-materials.ts';
import {operaMain,operaStudio} from './opera-layout.ts';
import type {Building,Point} from './types.ts';

export function createOpera(b:Building){
 const root=new Group();root.name='landmark:opera';root.userData={sourceId:b.id,height:b.h,referenceHeightSource:b.hs,photoReference:'user-aerial-20261025'};
 const batches=new Map<Material,BufferGeometry[]>();
 const add=(g:BufferGeometry,m:Material)=>{const list=batches.get(m)??[];list.push(operaSurfaceUV(g.index?g.toNonIndexed():g));batches.set(m,list);};
 const triangle=(a:Vector3,c:Vector3,d:Vector3,m:Material,center:Vector3)=>{
  const points=[a,c,d];if(c.clone().sub(a).cross(d.clone().sub(a)).dot(a.clone().add(c).add(d).multiplyScalar(1/3).sub(center))<0)points.reverse();
  const g=new BufferGeometry();g.setAttribute('position',new Float32BufferAttribute(points.flatMap(p=>p.toArray()),3));g.computeVertexNormals();add(g,m);
 };
 const beam=(a:Vector3,c:Vector3,r=.075)=>{
  const delta=c.clone().sub(a);if(delta.length()<.01)return;const g=new CylinderGeometry(r,r,delta.length(),4,1,true);
  g.applyQuaternion(new Quaternion().setFromUnitVectors(new Vector3(0,1,0),delta.normalize()));g.translate(...a.clone().add(c).multiplyScalar(.5).toArray());add(g,frame);
 };
 const glassTriangle=(a:Vector3,c:Vector3,d:Vector3,center:Vector3)=>{
  triangle(a,c,d,glazing,center);
  // Three families of members meet in real triangular glazing panels.
  const n=Math.max(3,Math.ceil(Math.max(a.distanceTo(c),c.distanceTo(d),d.distanceTo(a))/5));
  for(const [p,q,r] of [[a,c,d],[c,d,a],[d,a,c]])for(let i=1;i<n;i++)beam(p.clone().lerp(q,i/n),p.clone().lerp(r,i/n));
  beam(a,c,.12);beam(c,d,.12);beam(d,a,.12);
 };
 const hall=(outline:Point[],small:boolean)=>{
  const cx=outline.reduce((s,p)=>s+p[0],0)/outline.length,cz=outline.reduce((s,p)=>s+p[1],0)/outline.length;
  const h=b.h*(small?.60:1),skin=small?white:granite,center=new Vector3(cx,h*.35,cz);
  const ring=(scale:number,heights:number[])=>outline.map(([x,z],i)=>new Vector3(cx+(x-cx)*scale,heights[i],cz+(z-cz)*scale));
  const base=ring(.86,outline.map(()=>.6));
  const belt=ring(1,small?[4,5,6,7,6,4,3,4]:[8,10,11,13,10,6,7,8]);
  const top=ring(.96,(small?[.77,.9,.85,.70,.52,.42,.56,.65]:[.73,.85,.77,.65,.56,.42,.48,.62]).map(t=>t*h));
  for(let i=0;i<outline.length;i++){
   const j=(i+1)%outline.length;
   glassTriangle(base[i],base[j],belt[j],center);glassTriangle(base[i],belt[j],belt[i],center);
   if((!small&&(i===3||i===4))||(small&&i===3)){
    glassTriangle(belt[i],belt[j],top[i],center);triangle(belt[j],top[j],top[i],skin,center);
   }else{
    triangle(belt[i],belt[j],top[j],skin,center);triangle(belt[i],top[j],top[i],skin,center);
   }
  }
  const interior=(small?[[cx-5,cz-9,h],[cx+10,cz+7,h*.83]]:[[-557,99,h],[-519,107,h*.91],[-538,143,h*.70],[-563,147,h*.88],[-516,163,h*.65]]).map(([x,z,y])=>new Vector3(x,y,z));
  const points=[...top,...interior];
  const faces=small?[[0,1,8],[1,2,8],[2,3,9],[2,9,8],[3,4,9],[4,5,9],[5,6,8],[5,8,9],[6,7,8],[7,0,8]]:
   [[0,1,8],[1,2,9],[1,9,8],[2,3,9],[3,4,9],[4,12,9],[9,12,10],[9,10,8],[8,10,11],[8,11,0],[0,11,7],[7,11,6],[6,11,10],[6,10,5],[5,10,12],[5,12,4]];
  for(const [i,j,k] of faces){
   if(small&&i===2&&j===3){
    const a=points[i],c=points[j],d=points[k],p=a.clone().lerp(d,.2),q=c.clone().lerp(d,.2),r=a.clone().lerp(d,.48),s=c.clone().lerp(d,.48);
    triangle(a,c,q,skin,center);triangle(a,q,p,skin,center);
    glassTriangle(p,q,s,center);glassTriangle(p,s,r,center);triangle(r,s,d,skin,center);
   }else triangle(points[i],points[j],points[k],skin,center);
  }
  // Recessed roof ventilation slots lie on two actual roof planes.
  if(!small)for(const [a,c,d] of [[points[1],points[9],points[8]],[points[8],points[10],points[11]]]){
   const n=c.clone().sub(a).cross(d.clone().sub(a)).normalize();if(n.y<0)n.negate();
   for(let i=0;i<5;i++){
    const t=.32+i*.035,start=a.clone().lerp(c,t).lerp(d,.18).addScaledVector(n,.045),end=start.clone().add(c.clone().sub(a).normalize().multiplyScalar(6));beam(start,end,.12);
   }
  }
 };
 hall(operaMain,false);hall(operaStudio,true);
 for(const [material,parts] of batches){const g=mergeGeometries(parts,false)!;parts.forEach(p=>p.dispose());g.computeBoundingSphere();const m=new Mesh(g,material);m.castShadow=true;m.receiveShadow=true;root.add(m);}
 return root;
}
