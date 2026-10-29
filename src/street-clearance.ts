import {bridgeRoadProfile,isVisibleRoad,FOOT_TOP,ROAD_TOP} from './road-level.ts';
import {inPolygon,nearestPath,southAxisRoadSurfaces,northMallLinks} from './south-axis-layout.ts';
import {southAxisData} from './south-axis-data.ts';
import {tunnelData} from './tunnel-data.ts';
import {tunnelRoutes} from './tunnel-layout.ts';
import {parkRoadReplaced} from './pearl-park-layout.ts';
import {islandRoadReplaced} from './haixinsha-layout.ts';
import type {Point,TileData} from './types.ts';

type Surface={p:Point[][];bottom:number;top:number};
// Match rendered road ribbons, including mitred bends, replacement polygons and bridge decks.
// Test the whole vertical extent of a ground prop so a pole/crown cannot pierce an overpass.
export function streetClearance(data:TileData[]){
 const cells=new Map<string,Surface[]>(),size=40;
 const add=(p:Point[][],bottom:number,top:number)=>{
  const xs=p[0].map(v=>v[0]),zs=p[0].map(v=>v[1]),s={p,bottom,top};
  for(let x=Math.floor((Math.min(...xs)-4)/size);x<=Math.floor((Math.max(...xs)+4)/size);x++)for(let z=Math.floor((Math.min(...zs)-4)/size);z<=Math.floor((Math.max(...zs)+4)/size);z++){
   const key=x+','+z,list=cells.get(key)??[];list.push(s);cells.set(key,list);
  }
 };
 const ribbon=(path:Point[],w:number,y:number[],round:boolean)=>{
  const kept=path.map((_,i)=>i).filter(i=>!i||Math.hypot(path[i][0]-path[i-1][0],path[i][1]-path[i-1][1])>=.1),p=kept.map(i=>path[i]);
  const normals=p.slice(1).map((b,i)=>{const a=p[i],l=Math.hypot(b[0]-a[0],b[1]-a[1]);return [-(b[1]-a[1])/l,(b[0]-a[0])/l];});
  const offsets=p.map((_,i)=>{
   const a=normals[Math.max(0,i-1)],b=normals[Math.min(normals.length-1,i)];if(!a||!b)return [0,0];
   const mx=a[0]+b[0],mz=a[1]+b[1],l=Math.hypot(mx,mz);if(l<.01)return [b[0]*w/2,b[1]*w/2];
   const nx=mx/l,nz=mz/l,scale=Math.min(w,w/2/Math.max(.5,nx*b[0]+nz*b[1]));return [nx*scale,nz*scale];
  });
  for(let i=1;i<p.length;i++){
   const a=p[i-1],b=p[i],n=offsets[i-1],m=offsets[i];
   add([[[a[0]-n[0],a[1]-n[1]],[a[0]+n[0],a[1]+n[1]],[b[0]+m[0],b[1]+m[1]],[b[0]-m[0],b[1]-m[1]]]],Math.min(y[kept[i-1]],y[kept[i]])-.65,Math.max(y[kept[i-1]],y[kept[i]]));
  }
  if(round&&p.length>1)for(const i of [0,p.length-1])add([Array.from({length:32},(_,j)=>[p[i][0]+Math.cos(j*Math.PI/16)*w/2,p[i][1]+Math.sin(j*Math.PI/16)*w/2] as Point)],y[kept[i]]-.65,y[kept[i]]);
 };
 const roads=[...new Map(data.flatMap(t=>t.roads).map(r=>[r.id+JSON.stringify(r.p),r])).values()];
 for(const r of roads){
  if(parkRoadReplaced(r.id)||!isVisibleRoad(r)||islandRoadReplaced(r.p,r.bridge)||tunnelRoutes.has(r.id))continue;
  const foot=/^(footway|path|pedestrian|steps|cycleway)$/.test(r.kind),replacement=tunnelData.roadSurfaces[r.id]?.p??southAxisRoadSurfaces.get(r.id);
  if(replacement){for(const p of replacement)add(p,-.2,r.bridge?5:foot?FOOT_TOP:ROAD_TOP);}
  else {const profile=r.bridge?bridgeRoadProfile(r,foot?FOOT_TOP:ROAD_TOP):{p:r.p,y:r.p.map(()=>foot?FOOT_TOP:ROAD_TOP)};ribbon(profile.p,r.w,profile.y,!r.bridge);}
 }
 for(const r of [...tunnelData.routes.filter(r=>!r.covered),...southAxisData.ramps])ribbon(r.p,r.w,r.y,false);
 for(const r of northMallLinks)if(roads.some(q=>q.id===r.id))ribbon(r.p,r.w,r.y,false);
 const clear=(x:number,z:number,radius:number,top:number,bottom=0)=>{
  return !(cells.get(Math.floor(x/size)+','+Math.floor(z/size))??[]).some(s=>s.bottom<=top+.3&&s.top>=bottom-.3&&(inPolygon(x,z,s.p)||s.p.some(ring=>nearestPath(x,z,[...ring,ring[0]]).distance<radius)));
 };
 // Cover a solid bed/fence footprint with small discs, including its edges and interior.
 // Each disc encloses its entire cell, so narrow crossing paths cannot slip between samples.
 const box=(p:{x:number;z:number;dx:number;dz:number;length:number;width:number},top:number)=>{
  const nx=Math.max(1,Math.ceil(p.length/.5)),nz=Math.max(1,Math.ceil(p.width/.5)),sx=p.length/nx,sz=p.width/nz,radius=Math.hypot(sx,sz)/2+.02;
  for(let i=0;i<nx;i++)for(let j=0;j<nz;j++){
   const a=(i+.5)*sx-p.length/2,b=(j+.5)*sz-p.width/2;
   if(!clear(p.x+p.dx*a-p.dz*b,p.z+p.dz*a+p.dx*b,radius,top))return false;
  }
  return true;
 };
 return Object.assign(clear,{box});
}
