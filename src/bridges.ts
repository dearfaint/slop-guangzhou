import {bridgeUnderpasses,bridgeExitRoads} from './bridge-joints.ts';
import {bridgeRoadProfile} from './road-level.ts';
import {Group,Mesh,BufferGeometry,BoxGeometry,CylinderGeometry,Shape,Path,ExtrudeGeometry,Vector3,Quaternion,MeshStandardMaterial,MeshStandardNodeMaterial,type Material} from 'three/webgpu';
import {color,positionWorld,step,abs} from 'three/tsl';
import {cityNight} from './lighting-state.ts';
import {mergeGeometries} from 'three/addons/utils/BufferGeometryUtils.js';
import {bridgeRailLayout} from './bridge-rails.ts';
import {nearestPath} from './south-axis-layout.ts';
import type {Road,Point} from './types.ts';

const concrete=new MeshStandardNodeMaterial({color:'#c6c8c2',roughness:.85});
const shell=step(abs(positionWorld.x.sub(667)),36).mul(step(abs(positionWorld.z.sub(665)),6)).mul(step(7,positionWorld.y));
concrete.emissiveNode=color('#ffe0a9').mul(shell).mul(cityNight).mul(.6);
const metal=new MeshStandardMaterial({color:'#b0bfc0',metalness:.55,roughness:.38});
const paint=new MeshStandardMaterial({color:'#e0dfce',roughness:1});
const cable=new MeshStandardNodeMaterial({color:'#7e9197',metalness:.5,roughness:.45});
cable.emissiveNode=color('#ffd18b').mul(cityNight).mul(.8);
const riverRail=new MeshStandardNodeMaterial({color:'#b0bfc0',metalness:.55,roughness:.38});
riverRail.emissiveNode=color('#ffcf8c').mul(cityNight).mul(.9);
// Shared materials belong to the tile system; only geometry is disposed on unload.
export function bridgeDetails(road:Road,profile:{p:Point[];y:number[]}) {
 const root=new Group();root.name=`bridge:${road.id}`;
 const batches=new Map<Material,BufferGeometry[]>();
 const add=(g:BufferGeometry,m:Material)=>{const parts=batches.get(m)??[];parts.push(g);batches.set(m,parts);};
 const beam=(a:Vector3,b:Vector3,r:number,m:Material,box=false)=>{
  const delta=b.clone().sub(a),length=delta.length();if(length<.001)return;
  const g=box?new BoxGeometry(r*2,length,r*2):new CylinderGeometry(r,r,length,6);
  g.applyQuaternion(new Quaternion().setFromUnitVectors(new Vector3(0,1,0),delta.divideScalar(length)));
  g.translate(...a.clone().add(b).multiplyScalar(.5).toArray());add(g,m);
 };
 const {p,y}=profile;
 const {foot,adjoining,nearOpening,edges,rails}=bridgeRailLayout(road,profile);
 // Link centre-lines can describe turning routes over the same paved deck.
 // Paint their simpler through carriageways once, instead of crossing dash grids.
 const through=adjoining.filter(({road:r})=>r.bridge&&!/^(footway|path|pedestrian|steps|cycleway)$/.test(r.kind)&&r.p.length<road.p.length);
 const covered=p.filter((point,i)=>through.some(({road:r,profile})=>{const q=nearestPath(...point,profile.p,profile.y);return q.distance<r.w/2+.25&&Math.abs(q.y-y[i])<.12;})).length;
 const redundantPaint=!foot&&covered/p.length>.75;
 const underpasses=(bridgeUnderpasses[road.id]??[]).map(id=>{const r=bridgeExitRoads[id];return {road:r,profile:r.bridge?bridgeRoadProfile(r):{p:r.p,y:r.p.map(()=>.35)}};});
 for(const {a,b} of rails)for(const height of (foot?[.55,1.2]:[.5,.9]))beam(a.clone().add(new Vector3(0,height,0)),b.clone().add(new Vector3(0,height,0)),foot?.045:.075,['猎德大桥','广州大桥'].includes(road.name)?riverRail:metal);
 let station=0,nextPost=0,nextPier=22;
 for(let i=1;i<p.length;i++){
  const length=Math.hypot(p[i][0]-p[i-1][0],p[i][1]-p[i-1][1]);
  for(;nextPost<=station+length;nextPost+=foot?2:4){const t=(nextPost-station)/(length||1);for(const side of [0,1]){const a=edges[i-1][side].clone().lerp(edges[i][side],t);if(nearOpening(a.x,a.z,a.y))continue;beam(a,a.clone().add(new Vector3(0,foot?1.2:.95,0)),.055,metal,true);}}
  for(;nextPier<=station+length;nextPier+=foot?28:45){
   const t=(nextPier-station)/(length||1),h=y[i-1]+(y[i]-y[i-1])*t-.65;
   if(h>1.1){const x=p[i-1][0]+(p[i][0]-p[i-1][0])*t,z=p[i-1][1]+(p[i][1]-p[i-1][1])*t;
    // Main Liede span stays clear of invented intermediate river piers.
    const obstructs=[...adjoining,...underpasses].some(({road:r,profile})=>{const q=nearestPath(x,z,profile.p,profile.y);return q.distance<r.w/2+1.3&&q.y<h+2.5;});
    if(!obstructs&&(road.name!=='猎德大桥'||z<445||z>880)){beam(new Vector3(x,-.2,z),new Vector3(x,h,z),foot?.35:.85,concrete);}
   }
  }
  if(foot&&Math.abs(y[i]-y[i-1])/Math.max(.01,length)>.12){
   const count=Math.max(1,Math.ceil(Math.abs(y[i]-y[i-1])/.16)),dx=p[i][0]-p[i-1][0],dz=p[i][1]-p[i-1][1];
   for(let step=0;step<count;step++){const t=(step+.5)/count;add(new BoxGeometry(road.w,.16,length/count+.01).rotateY(Math.atan2(dx,dz)).translate(p[i-1][0]+dx*t,y[i-1]+(y[i]-y[i-1])*t-.065,p[i-1][1]+dz*t),concrete);}
  }
  if(!foot&&!redundantPaint&&road.w>=6.4)for(let dash=Math.floor((station-4)/8)*8+4;dash<station+length;dash+=8){
   const lo=Math.max(station,dash),hi=Math.min(station+length,dash+3);if(hi<=lo)continue;
   const t=(lo-station)/(length||1),u=(hi-station)/(length||1),lanes=Math.max(2,Math.round(road.w/3.2));
   for(let lane=1;lane<lanes;lane++){
    const a=edges[i-1][0].clone().lerp(edges[i-1][1],lane/lanes),b=edges[i][0].clone().lerp(edges[i][1],lane/lanes);
    beam(a.clone().lerp(b,t).add(new Vector3(0,.025,0)),a.clone().lerp(b,u).add(new Vector3(0,.025,0)),.055,paint,true);
   }
  }
  station+=length;
 }
 if(road.id==='osm/way/233809684/0')addLiede();
 function addLiede(){
  // Shell-shaped single tower + two spatial suspension planes. Position follows
  // mapped carriageways; shell curvature and cable sag are visual approximations.
  const z0=665,cx=667,deck=5;
  const shell=new Shape();
  shell.moveTo(-25,0);shell.bezierCurveTo(-33,48,-25,128,0,128);shell.bezierCurveTo(25,128,33,48,25,0);
  shell.lineTo(18,0);shell.bezierCurveTo(23,40,12,91,0,91);shell.bezierCurveTo(-12,91,-23,40,-18,0);shell.closePath();
  const eye=new Path();eye.absellipse(0,110,10,12,0,Math.PI*2,true,0);shell.holes.push(eye);
  add(new ExtrudeGeometry(shell,{depth:9,bevelEnabled:true,bevelThickness:.6,bevelSize:.6,bevelSegments:2,curveSegments:32}).translate(cx,deck,z0-4.5),concrete);
  for(const side of [-1,1])for(const [start,end] of [[446,z0],[z0,832]]){
   const at=(t:number)=>{
    const peak=start===z0?1-t:t;
    return new Vector3(cx+(start+(end-start)*t-z0)*.034+side*(14-10*peak),deck+2+124*peak*peak,start+(end-start)*t);
   };
   for(let i=0;i<48;i++)beam(at(i/48),at((i+1)/48),.28,cable);
   for(let i=1;i<24;i++){const a=at(i/24);beam(a,new Vector3(cx+(a.z-z0)*.034+side*14,deck+.1,a.z),.065,cable);}
  }
  for(const side of [-1,1])beam(new Vector3(cx+side*24,-.2,z0),new Vector3(cx+side*24,deck+2,z0),2,concrete);
  for(const z of [446,832]){
   beam(new Vector3(cx+(z-z0)*.034-16,deck-.9,z),new Vector3(cx+(z-z0)*.034+16,deck-.9,z),.6,concrete,true);
   for(const side of [-1,1])beam(new Vector3(cx+(z-z0)*.034+side*12,-.2,z),new Vector3(cx+(z-z0)*.034+side*12,deck-1.5,z),1,concrete);
  }
 }
 for(const [mat,parts] of batches){
  const flat=parts.map(g=>{const f=g.index?g.toNonIndexed():g;if(f!==g)g.dispose();f.deleteAttribute('uv');return f;});
  const geometry=mergeGeometries(flat,false)!;flat.forEach(g=>g.dispose());
  const mesh=new Mesh(geometry,mat);mesh.castShadow=true;mesh.receiveShadow=true;root.add(mesh);
 }
 return root;
}
