import {tunnelData} from './tunnel-data.ts';
import {nearestPath} from './south-axis-layout.ts';
import type {Point,Area} from './types.ts';
export interface TunnelRoute {id:string;name:string;p:Point[];y:number[];w:number;covered:boolean;walls:Point[][]}
export interface TunnelData {routes:TunnelRoute[];excavations:Point[][][];roadSurfaces:Record<string,{p:Point[][][];lines:Point[][]}>;areaSurfaces:Record<string,Point[][][]>}
export const tunnelRoutes=new Map(tunnelData.routes.map(r=>[r.id,r]));
const routes=tunnelData.routes.map(r=>({...r,minX:Math.min(...r.p.map(p=>p[0]))-r.w/2,maxX:Math.max(...r.p.map(p=>p[0]))+r.w/2,minZ:Math.min(...r.p.map(p=>p[1]))-r.w/2,maxZ:Math.max(...r.p.map(p=>p[1]))+r.w/2}));
export function tunnelPassage(x:number,z:number,referenceHeight:number,radius=.45,tolerance=.8){
 let best:(ReturnType<typeof nearestPath>&{width:number;tunnel:true})|undefined;
 for(const r of routes){
  if(x<r.minX||x>r.maxX||z<r.minZ||z>r.maxZ)continue;
  const p=nearestPath(x,z,r.p,r.y);
  if(p.distance<=r.w/2-Math.min(radius,1.05)&&Math.abs(p.y-referenceHeight)<tolerance&&(!best||p.distance<best.distance))best={...p,width:r.w,tunnel:true};
 }
 return best;
}
export function inTunnelExcavation(x:number,z:number){
 return tunnelData.excavations.some(p=>{const ring=p[0];let inside=false;for(let i=0,j=ring.length-1;i<ring.length;j=i++){const a=ring[i],b=ring[j];if((a[1]>z)!==(b[1]>z)&&x<(b[0]-a[0])*(z-a[1])/(b[1]-a[1])+a[0])inside=!inside;}return inside;});
}
export function tunnelAreaSurfaces(area:Area){return tunnelData.areaSurfaces[`${area.p[0][0][0]}:${area.p[0][0][1]}:${area.name}`];}
