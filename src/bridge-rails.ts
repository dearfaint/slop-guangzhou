import {Vector3} from 'three/webgpu';
import {bridgeJunctions,bridgeConnections,bridgeExitRoads} from './bridge-joints.ts';
import {bridgeRoadProfile,FOOT_TOP,ROAD_TOP} from './road-level.ts';
import {nearestPath} from './south-axis-layout.ts';
import type {Road,Point} from './types.ts';

// Rendering and collision share the same open ends and merge cut-outs.
export function bridgeRailLayout(road:Road,profile:{p:Point[];y:number[]}) {
 const {p,y}=profile;
 const foot=/^(footway|path|pedestrian|steps|cycleway)$/.test(road.kind);
 const ids=new Set(bridgeConnections[road.id]??[]);
 // Parallel ramp ribbons can overlap without sharing an OSM centreline node.
 // Their common paved corridor must remain an opening in both render and collision.
 if(bridgeConnections[road.id])for(const r of Object.values(bridgeExitRoads))if(r.id!==road.id&&r.p.some(a=>road.p.some(b=>Math.hypot(a[0]-b[0],a[1]-b[1])<(r.w+road.w)/2+1)))ids.add(r.id);
 const adjoining=[...ids].map(id=>{
  const r=bridgeExitRoads[id],profile=r.bridge?bridgeRoadProfile(r,/^(footway|path|pedestrian|steps|cycleway)$/.test(r.kind)?FOOT_TOP:ROAD_TOP):{p:r.p,y:r.p.map(()=>.35)};
  return {road:r,profile};
 });
 const roadOpening=(x:number,z:number,y:number)=>adjoining.some(({road:r,profile})=>{const q=nearestPath(x,z,profile.p,profile.y);return q.distance<r.w/2+.8&&Math.abs(q.y-y)<1.2;});
 const openings=road.p.filter(p=>bridgeJunctions.has(p.map(v=>Math.round(v*2)).join(',')));
 const nearOpening=(x:number,z:number,y:number)=>roadOpening(x,z,y)||openings.some(p=>Math.hypot(x-p[0],z-p[1])<Math.max(3,road.w*.8));
 const edges=p.map((a,i)=>{
  const before=p[Math.max(0,i-1)],after=p[Math.min(p.length-1,i+1)],dx=after[0]-before[0],dz=after[1]-before[1],length=Math.hypot(dx,dz)||1;
  return [-1,1].map(side=>new Vector3(a[0]-dz/length*side*(road.w/2-.12),y[i],a[1]+dx/length*side*(road.w/2-.12)));
 });
 const rails:{a:Vector3;b:Vector3}[]=[];
 for(let i=1;i<p.length;i++)for(const side of [0,1]){
  const a=edges[i-1][side],b=edges[i][side],mid=a.clone().lerp(b,.5);
  if(![a,mid,b].some(p=>nearOpening(p.x,p.z,p.y)))rails.push({a,b});
 }
 return {foot,adjoining,nearOpening,edges,rails};
}
