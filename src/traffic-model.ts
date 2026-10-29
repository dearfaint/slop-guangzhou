import { Carriageways } from './curb.ts';
import {tunnelRoutes} from './tunnel-layout.ts';
import { groundRoadPaths, nearestPath } from './south-axis-layout.ts';
import { southAxisData } from './south-axis-data.ts';
import { isGroundRoad, isVisibleRoad, isPedestrianRoad, bridgeRoadProfile, FOOT_TOP, ROAD_TOP } from './road-level.ts';
import type { Area, Point, Road } from './types.ts';

export interface TrafficNode { id:string; p:Point; outgoing:string[]; signal:boolean; source:'inferred' }
export interface TrafficEdge { id:string; from:string; to:string; a:Point; b:Point; length:number; width:number; kind:string; roadId:string; oneway?:number; permitted?:boolean; yA?:number; yB?:number }
export interface TrafficGraph { nodes:Map<string,TrafficNode>; edges:Map<string,TrafficEdge> }
export const hash=(s:string)=>{let n=2166136261;for(let i=0;i<s.length;i++)n=Math.imul(n^s.charCodeAt(i),16777619);return n>>>0;};
const nodeKey=(p:Point)=>`${Math.round(p[0]*2)},${Math.round(p[1]*2)}`;
export function buildTrafficGraph(roads:Road[],pedestrian=false,throughTunnels=false,areas:Area[]=[]):TrafficGraph {
 const nodes=new Map<string,TrafficNode>(),edges=new Map<string,TrafficEdge>();
 const pointKey=(p:Point)=>`${Math.round(p[0]*10)},${Math.round(p[1]*10)}`;
 const knownNodes=new Map<string,Set<number>>();
 for(const road of roads)road.nodeIds?.forEach((id,i)=>{if(id===null)return;const key=pointKey(road.p[i]),ids=knownNodes.get(key)??new Set<number>();ids.add(id);knownNodes.set(key,ids);});
 const ramps=new Map(southAxisData.ramps.map(r=>[r.id,r])),tunnels=new Map(southAxisData.underground.map(r=>[r.id,r]));
 const bridges=new Map<string,{p:Point[];y:number[]}>();
 const curbs=pedestrian?new Carriageways(roads,areas):undefined;
 const roadDirection=(r:Road,p:Point):[number,number]=>{let best=Infinity,dir:[number,number]=[1,0];for(let i=1;i<r.p.length;i++){const a=r.p[i-1],b=r.p[i],dx=b[0]-a[0],dz=b[1]-a[1],l=Math.hypot(dx,dz)||1,t=Math.max(0,Math.min(1,((p[0]-a[0])*dx+(p[1]-a[1])*dz)/(l*l))),d=Math.hypot(p[0]-a[0]-dx*t,p[1]-a[1]-dz*t);if(d<best){best=d;dir=[dx/l,dz/l];}}return dir;};
 if(throughTunnels||pedestrian)for(const r of roads)if(r.bridge&&isVisibleRoad(r)&&!bridges.has(r.id))bridges.set(r.id,bridgeRoadProfile(r,/^(footway|path|pedestrian|steps|cycleway)$/.test(r.kind)?FOOT_TOP:ROAD_TOP));
 // Do not send ground pedestrians into a solid bridge approach without headroom.
 const walkSurfaces=new Map<string,{a:Point;b:Point;ya:number;yb:number;w:number}[]>();
 if(pedestrian)for(const r of roads)if(bridges.has(r.id)&&/^(trunk|primary|secondary|tertiary|residential|unclassified|service)(_link)?$/.test(r.kind)){
  const prof=bridges.get(r.id)!;
  for(let i=1;i<prof.p.length;i++){
   const a=prof.p[i-1],b=prof.p[i],surface={a,b,ya:prof.y[i-1],yb:prof.y[i],w:r.w};
   for(let x=Math.floor((Math.min(a[0],b[0])-r.w/2)/40);x<=Math.floor((Math.max(a[0],b[0])+r.w/2)/40);x++)for(let z=Math.floor((Math.min(a[1],b[1])-r.w/2)/40);z<=Math.floor((Math.max(a[1],b[1])+r.w/2)/40);z++){
    const key=x+','+z,list=walkSurfaces.get(key)??[];list.push(surface);walkSurfaces.set(key,list);
   }
  }
 }
 const walkingClear=(p:Point)=>{
  for(const s of walkSurfaces.get(Math.floor(p[0]/40)+','+Math.floor(p[1]/40))??[]){
   const dx=s.b[0]-s.a[0],dz=s.b[1]-s.a[1],t=Math.max(0,Math.min(1,((p[0]-s.a[0])*dx+(p[1]-s.a[1])*dz)/(dx*dx+dz*dz||1))),distance=Math.hypot(p[0]-s.a[0]-dx*t,p[1]-s.a[1]-dz*t),height=s.ya+(s.yb-s.ya)*t;
   if(distance<s.w/2+.3&&height>.5&&height<3.1)return false;
  }
  return true;
 };
 const sampleWalk=(p:Point[])=>p.flatMap((a,i)=>{
  if(i===p.length-1)return [a];
  const b=p[i+1],n=Math.max(1,Math.ceil(Math.hypot(b[0]-a[0],b[1]-a[1])/2));
  return Array.from({length:n},(_,j)=>[a[0]+(b[0]-a[0])*j/n,a[1]+(b[1]-a[1])*j/n] as Point);
 });
 const height=(r:Road,p:Point):number=>pedestrian?(bridges.has(r.id)?nearestPath(p[0],p[1],bridges.get(r.id)!.p,bridges.get(r.id)!.y).y:r.kind==='living_street'?ROAD_TOP:curbs!.walkLevel(p[0],p[1],r.w/2,roadDirection(r,p))):tunnelRoutes.has(r.id)?nearestPath(p[0],p[1],tunnelRoutes.get(r.id)!.p,tunnelRoutes.get(r.id)!.y).y:ramps.has(r.id)?nearestPath(p[0],p[1],ramps.get(r.id)!.p,ramps.get(r.id)!.y).y:tunnels.has(r.id)?nearestPath(p[0],p[1],tunnels.get(r.id)!.p,tunnels.get(r.id)!.heights).y:bridges.has(r.id)?nearestPath(p[0],p[1],bridges.get(r.id)!.p,bridges.get(r.id)!.y).y:.35;
 const trafficPath=(road:Road):Point[]=>tunnelRoutes.get(road.id)?.p??(ramps.has(road.id)?road.p.flatMap((a,i)=>{
  if(i===road.p.length-1)return [a];
  const b=road.p[i+1],count=Math.ceil(Math.hypot(b[0]-a[0],b[1]-a[1])/3);
  return Array.from({length:count},(_,j)=>[a[0]+(b[0]-a[0])*j/count,a[1]+(b[1]-a[1])*j/count] as Point);
 }):bridges.has(road.id)?bridges.get(road.id)!.p:road.p);
 const motorPattern=throughTunnels?/^(trunk|primary|secondary|tertiary|residential|unclassified|living_street|service)(_link)?$/:/^(trunk|primary|secondary|tertiary|residential|unclassified|living_street|service)(_link)?$/;
 for(const original of roads)for(const p of pedestrian?(bridges.has(original.id)?[bridges.get(original.id)!.p]:groundRoadPaths(original).map(sampleWalk)):throughTunnels&&(isGroundRoad(original)||ramps.has(original.id)||tunnels.has(original.id)||bridges.has(original.id)||tunnelRoutes.has(original.id))?[trafficPath(original)]:groundRoadPaths(original)){
  const r={...original,p};
  const sourceNodes=new Map(original.p.flatMap((p,i)=>original.nodeIds?.[i]!=null?[[pointKey(p),original.nodeIds[i]!] as const]:[]));
  const connection=(p:Point)=>{
   const key=pointKey(p),id=sourceNodes.get(key);
   if(id!==undefined)return `osm/node/${id}`;
   if(original.nodeIds)return `${original.id}@${key}`;
   const known=knownNodes.get(key);if(known?.size===1)return `osm/node/${[...known][0]}`;
   return nodeKey(p)+(throughTunnels||pedestrian?','+Math.round(height(r,p)*2):'');
  };
  if((!isGroundRoad(r)&&!((pedestrian||throughTunnels)&&bridges.has(r.id)||throughTunnels&&!pedestrian&&(tunnels.has(r.id)||tunnelRoutes.has(r.id))))||!(pedestrian?isPedestrianRoad(r):motorPattern.test(r.kind)))continue;
  for(let i=1;i<r.p.length;i++){
   const a=r.p[i-1],b=r.p[i],from=connection(a),to=connection(b),length=Math.hypot(b[0]-a[0],b[1]-a[1]);if(length<.1||from===to)continue;
   if(pedestrian&&!r.bridge&&[a,b,[(a[0]+b[0])/2,(a[1]+b[1])/2] as Point].some(p=>!walkingClear(p)))continue;
   for(const [id,p] of [[from,a],[to,b]] as [string,Point][]){if(!nodes.has(id))nodes.set(id,{id,p,outgoing:[],signal:false,source:'inferred'});}
   // Keep both geometric arms for markings and junctions; cars use permitted arms only.
   for(const reverse of [false,true]){const f=reverse?to:from,t=reverse?from:to,id=`${r.id}:${f}>${t}`;if(edges.has(id))continue;
    edges.set(id,{id,from:f,to:t,a:reverse?b:a,b:reverse?a:b,length,width:ramps.get(r.id)?.w??r.w,kind:r.kind,roadId:r.id,oneway:r.oneway??0,permitted:pedestrian||!r.oneway||(r.oneway===-1?reverse:!reverse),...(throughTunnels||pedestrian?{yA:height(r,reverse?b:a),yB:height(r,reverse?a:b)}:{})});nodes.get(f)!.outgoing.push(id);
   }
  }
 }
 if(throughTunnels)for(const node of nodes.values()){
  const arms=node.outgoing.map(id=>edges.get(id)!);
  const y=arms.some(e=>(e.yA??.35)<.3)?Math.min(...arms.map(e=>e.yA??.35)):Math.max(...arms.map(e=>e.yA??.35));
  for(const e of arms){e.yA=y;edges.get(`${e.roadId}:${e.to}>${e.from}`)!.yB=y;}
 }
 // Only junctions involving at least three distinct bearings receive inferred lights.
 if(!pedestrian)for(const node of nodes.values()){
  const arms=junctionArms({nodes,edges},node);
  const crossing=arms.some(a=>arms.some(b=>Math.abs(((a.b[0]-a.a[0])*(b.b[0]-b.a[0])+(a.b[1]-a.a[1])*(b.b[1]-b.a[1]))/a.length/b.length)<.7));
  node.signal=arms.length>=3&&crossing&&node.outgoing.some(id=>/^(primary|secondary|tertiary)/.test(edges.get(id)!.kind))&&node.outgoing.every(id=>{const y=edges.get(id)!.yA??.35;return y>=0&&y<1;});
 }
 return {nodes,edges};
}
export type SignalState='green'|'yellow'|'red';
export function signalState(elapsed:number,nodeId:string,axis:number):SignalState {
 const phase=((elapsed+hash(nodeId)%9)%52+52)%52;
 const local=(phase+(axis?26:0))%52;
 return local<21?'green':local<24?'yellow':'red';
}
export function edgeAxis(e:TrafficEdge){return Math.abs(e.b[0]-e.a[0])>Math.abs(e.b[1]-e.a[1])?0:1;}
export function chooseNext(graph:TrafficGraph,e:TrafficEdge,seed:number):TrafficEdge {
 const choices=graph.nodes.get(e.to)!.outgoing.map(id=>graph.edges.get(id)!).filter(n=>n.permitted!==false);
 const forward=choices.filter(n=>n.to!==e.from);return (forward.length?forward:choices)[seed%(forward.length||choices.length)]||e;
}
export function forwardTrafficEdges(graph:TrafficGraph,e:TrafficEdge){return graph.nodes.get(e.to)!.outgoing.map(id=>graph.edges.get(id)!).filter(n=>n.permitted!==false&&n.to!==e.from);}
export function safeSpeed(cruise:number,gap:number){return Math.min(cruise,Math.sqrt(Math.max(0,gap)*4));}
export function lanePosition(e:TrafficEdge,distance:number,offset:number):Point {
 const t=Math.min(1,Math.max(0,distance/e.length)),dx=(e.b[0]-e.a[0])/e.length,dz=(e.b[1]-e.a[1])/e.length;
 return [e.a[0]+dx*distance-dz*offset,e.a[1]+dz*(t*e.length)+dx*offset];
}

// Inferred geometry shared by the painted stop line and the vehicle's front bumper.
export function stopLineDistance(graph:TrafficGraph,node:TrafficNode):number {
 return Math.max(...node.outgoing.map(id=>graph.edges.get(id)!.width),6)*.5+6;
}
export function junctionAhead(graph:TrafficGraph,edge:TrafficEdge,distance:number) {
 let e=edge,remaining=e.length-distance;
 for(let i=0;i<24;i++){
  const node=graph.nodes.get(e.to)!;
  if(node.outgoing.length>=3)return {node,axis:junctionAxis(graph,node,e),distance:remaining};
  if(remaining>100)return undefined;
  const next=node.outgoing.map(id=>graph.edges.get(id)!).filter(n=>n.to!==e.from);
  if(next.length!==1)return undefined;
  e=next[0];remaining+=e.length;
 }
 return undefined;
}
export function armPoint(graph:TrafficGraph,edge:TrafficEdge,distance:number) {
 let e=edge,d=distance;
 for(let i=0;i<24;i++){
  if(d<=e.length)return {p:lanePosition(e,d,0),dx:(e.b[0]-e.a[0])/e.length,dz:(e.b[1]-e.a[1])/e.length,width:e.width,roadId:e.roadId};
  d-=e.length;
  const node=graph.nodes.get(e.to)!;
  if(node.outgoing.length>=3)return undefined;
  const next=node.outgoing.map(id=>graph.edges.get(id)!).filter(n=>n.to!==e.from);
  if(next.length!==1)return undefined;
  e=next[0];
 }
 return undefined;
}

export function lanesPerDirection(width:number){return Math.max(1,Math.min(3,Math.floor(width/2/3.2)));}
export function vehicleLaneOffset(width:number,oneway=0){return oneway?width/2-width/(2*Math.max(1,Math.min(6,Math.floor(width/3.2+1e-6)))):width/(4*lanesPerDirection(width));}

// Cluster geometric arms instead of rounding angles into arbitrary compass buckets.
export function junctionArms(graph:TrafficGraph,node:TrafficNode):TrafficEdge[] {
 const arms:TrafficEdge[]=[];
 for(const e of node.outgoing.map(id=>graph.edges.get(id)!).sort((a,b)=>b.width-a.width||a.id.localeCompare(b.id))){
  if(arms.some(a=>((a.b[0]-a.a[0])*(e.b[0]-e.a[0])+(a.b[1]-a.a[1])*(e.b[1]-e.a[1]))/a.length/e.length>.94))continue;
  arms.push(e);
 }
 return arms;
}

export function junctionAxis(graph:TrafficGraph,node:TrafficNode,edge:TrafficEdge){
 const reference=junctionArms(graph,node)[0];
 if(!reference)return edgeAxis(edge);
 const dot=Math.abs(((reference.b[0]-reference.a[0])*(edge.b[0]-edge.a[0])+(reference.b[1]-reference.a[1])*(edge.b[1]-edge.a[1]))/reference.length/edge.length);
 const axis=edgeAxis(reference);return dot>=.7?axis:1-axis;
}
