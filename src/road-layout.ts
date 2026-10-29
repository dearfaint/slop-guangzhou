import {junctionApproaches} from './junction-layout.ts';
import { buildTrafficGraph, junctionAhead, stopLineDistance, lanesPerDirection } from './traffic-model.ts';
import { WalkWorld } from './walk-world.ts';
import type { TrafficEdge } from './traffic-model.ts';
import type { TileData, Point } from './types.ts';
import { groundRoadPaths } from './south-axis-layout.ts';
export interface PaintRect { x:number; z:number; dx:number; dz:number; length:number; width:number; kind:'center'|'edge'|'lane'|'crossing'|'stop'; roadId:string; source:'inferred:road'; }
interface Rectangle {x:number;z:number;dx:number;dz:number;length:number;width:number}
interface Segment extends Rectangle {edge:TrafficEdge}
// Separating axes for two finite road/paint rectangles, avoiding sampling gaps.
function overlaps(a:Rectangle,b:Rectangle) {
 const ex=a.x-b.x,ez=a.z-b.z;
 for(const [dx,dz] of [[a.dx,a.dz],[-a.dz,a.dx],[b.dx,b.dz],[-b.dz,b.dx]]){
  const ar=Math.abs(dx*a.dx+dz*a.dz)*a.length/2+Math.abs(-dx*a.dz+dz*a.dx)*a.width/2;
  const br=Math.abs(dx*b.dx+dz*b.dz)*b.length/2+Math.abs(-dx*b.dz+dz*b.dx)*b.width/2;
  if(Math.abs(ex*dx+ez*dz)>ar+br)return false;
 }
 return true;
}
export function createRoadLayout(data:TileData[]) {
 const graph=buildTrafficGraph(data.flatMap(t=>t.roads)),world=new WalkWorld();world.setMap(data);
 const stations=new Map<string,{start:number;direction:number}>();
 const key=(p:Point)=>`${Math.round(p[0]*2)},${Math.round(p[1]*2)}`;
 for(const road of data.flatMap(t=>t.roads))for(const path of groundRoadPaths(road)){
  let distance=0;
  for(let i=1;i<path.length;i++){
   const a=path[i-1],b=path[i],length=Math.hypot(b[0]-a[0],b[1]-a[1]);
   stations.set(`${road.id}:${key(a)}>${key(b)}`,{start:distance,direction:1});
   stations.set(`${road.id}:${key(b)}>${key(a)}`,{start:distance+length,direction:-1});
   distance+=length;
  }
 }
 const unique=new Map<string,TrafficEdge>();
 for(const e of graph.edges.values()){
  const key=[e.from,e.to].sort().join('|'),previous=unique.get(key);
  if(!previous||e.width>previous.width||(e.oneway&&e.permitted&&previous.permitted===false))unique.set(key,e);
 }
 const cells=new Map<string,Segment[]>(),size=60;
 for(const e of unique.values()){
  const s={edge:e,length:e.length,width:e.width+.5,x:(e.a[0]+e.b[0])/2,z:(e.a[1]+e.b[1])/2,dx:(e.b[0]-e.a[0])/e.length,dz:(e.b[1]-e.a[1])/e.length};
  const r=e.width/2+1;
  for(let x=Math.floor((Math.min(e.a[0],e.b[0])-r)/size);x<=Math.floor((Math.max(e.a[0],e.b[0])+r)/size);x++)for(let z=Math.floor((Math.min(e.a[1],e.b[1])-r)/size);z<=Math.floor((Math.max(e.a[1],e.b[1])+r)/size);z++){
   const key=x+','+z,list=cells.get(key)??[];list.push(s);cells.set(key,list);
  }
 }
 const safe=(p:PaintRect)=>{
  const candidates=new Set<Segment>(),r=Math.hypot(p.length,p.width)/2;
  for(let x=Math.floor((p.x-r)/size);x<=Math.floor((p.x+r)/size);x++)for(let z=Math.floor((p.z-r)/size);z<=Math.floor((p.z+r)/size);z++)for(const s of cells.get(x+','+z)??[])candidates.add(s);
  for(const s of candidates)if(s.edge.roadId!==p.roadId&&Math.abs(p.dx*s.dx+p.dz*s.dz)<.94&&overlaps(p,s))return false;
  for(const [u,v] of [[0,0],[-1,-1],[-1,1],[1,-1],[1,1]])if(!world.canStand(p.x+p.dx*u*p.length/2-p.dz*v*p.width/2,p.z+p.dz*u*p.length/2+p.dx*v*p.width/2,.05))return false;
  return true;
 };
 const paint:PaintRect[]=[];
 const rect=(e:TrafficEdge,distance:number,length:number,width:number,offset:number,kind:PaintRect['kind']):PaintRect=>{
  const dx=(e.b[0]-e.a[0])/e.length,dz=(e.b[1]-e.a[1])/e.length;
  return {x:e.a[0]+dx*distance-dz*offset,z:e.a[1]+dz*distance+dx*offset,dx,dz,length,width,kind,roadId:e.roadId,source:'inferred:road'};
 };
 const add=(p:PaintRect)=>{if(safe(p))paint.push(p);};
 for(const e of unique.values()){
  if(e.width<(e.oneway?5.5:7.5)||!/^(trunk|primary|secondary|tertiary|residential|unclassified)(_link)?$/.test(e.kind))continue;
  const reverse=graph.nodes.get(e.to)!.outgoing.map(id=>graph.edges.get(id)!).find(n=>n.to===e.from)!;
  const ahead=junctionAhead(graph,e,0),behind=junctionAhead(graph,reverse,0);
  const trim=(junction:typeof ahead)=>junction?Math.max(0,stopLineDistance(graph,junction.node)+2-(junction.distance-e.length)):0;
  const start=trim(behind),end=e.length-trim(ahead);
  if(end-start<1)continue;
  for(let t=start;t<end;t+=24){
   const length=Math.min(24,end-t),center=t+length/2;
   if(!e.oneway)for(const offset of [-.18,.18])add(rect(e,center,length,.12,offset,'center'));
   for(const side of [-1,1])add(rect(e,center,length,.13,side*(e.width/2-.45),'edge'));
  }
  const lanes=e.oneway?Math.max(1,Math.min(6,Math.floor(e.width/3.2+1e-6))):lanesPerDirection(e.width);
  // Dash phase follows source-path distance, rather than restarting at every OSM vertex.
  const station=stations.get(`${e.roadId}:${key(e.a)}>${key(e.b)}`)??{start:0,direction:1};
  const s1=station.start+station.direction*start,s2=station.start+station.direction*end;
  if(lanes>1)for(let s=Math.floor(Math.min(s1,s2)/8)*8;s<Math.max(s1,s2);s+=8){
   const lo=Math.max(Math.min(s1,s2),s),hi=Math.min(Math.max(s1,s2),s+3);
   if(hi-lo<.05)continue;
   const center=((lo+hi)/2-station.start)/station.direction;
   for(let lane=1;lane<lanes;lane++)for(const side of (e.oneway?[1]:[-1,1])){
    const offset=e.oneway?-e.width/2+lane*e.width/lanes:side*lane*e.width/2/lanes;
    add(rect(e,center,hi-lo,.12,offset,'lane'));
   }
  }
 }
 const acceptedCrossings:PaintRect[]=[];
 let crossings=0,stops=0;
 for(const node of graph.nodes.values()){
  if(!node.signal)continue;
  for(const approach of junctionApproaches(graph,node)){
   const {edge:e,crossing:at,line}=approach;
   const crossing:PaintRect={x:at.p[0],z:at.p[1],dx:at.dx,dz:at.dz,length:3,width:Math.min(e.width,at.width)-1.2,kind:'crossing',roadId:at.roadId,source:'inferred:road'};
   if(!safe(crossing)||acceptedCrossings.some(p=>overlaps(crossing,{...p,width:p.width+.5})))continue;
   acceptedCrossings.push(crossing);
   const count=Math.floor(crossing.width/.95),step=crossing.width/count;
   for(let stripe=0;stripe<count;stripe++){
    const offset=(stripe-(count-1)/2)*step;
    paint.push({...crossing,x:crossing.x-crossing.dz*offset,z:crossing.z+crossing.dx*offset,width:.5});
   }
   crossings++;
   if(!approach.incoming)continue;
   const w=Math.min(e.width,line.width),half=e.oneway?0:1,stop:PaintRect={x:line.p[0]+line.dz*w/4*half,z:line.p[1]-line.dx*w/4*half,dx:line.dx,dz:line.dz,length:.35,width:(e.oneway?w:w/2)-.9,kind:'stop',roadId:line.roadId,source:'inferred:road'};
   if(safe(stop)){paint.push(stop);stops++;}
  }
 }
 return {paint,crossings,stops};
}
