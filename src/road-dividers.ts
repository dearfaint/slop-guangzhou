import {groundRoadPaths, southAxisHeight} from './south-axis-layout.ts';
import {isGroundRoad,isVisibleRoad,bridgeRoadProfile,hiddenUndergroundBuildings,FOOT_TOP,ROAD_TOP} from './road-level.ts';
import {insidePolygon} from './street-layout.ts';
import {inTunnelExcavation} from './tunnel-layout.ts';
import type {Point,TileData} from './types.ts';

export interface RoadDivider {x:number;z:number;dx:number;dz:number;length:number;width:number;kind:'planting'|'rail';placement:'median'|'roadside';roads:[string,string]}
interface Segment {id:string;a:Point;b:Point;dx:number;dz:number;length:number;width:number;candidate:boolean;foot:boolean;oneway:boolean}
const cache=new WeakMap<TileData[],RoadDivider[]>(),cellSize=50;
const nearest=(p:Point,s:Segment)=>{const t=Math.max(0,Math.min(1,((p[0]-s.a[0])*s.dx+(p[1]-s.a[1])*s.dz)/s.length));const x=s.a[0]+s.dx*s.length*t,z=s.a[1]+s.dz*s.length*t;return {x,z,t,d:Math.hypot(p[0]-x,p[1]-z)};};
// OSM often maps each carriageway separately but does not map the material between them.
// Place a low planted divider only in verified free space, and clear every intersecting path.
export function createRoadDividers(data:TileData[]):RoadDivider[]{
 const cached=cache.get(data);if(cached)return cached;
 const paths=[...new Map(data.flatMap(t=>t.roads).filter(isGroundRoad).flatMap(r=>groundRoadPaths(r).map(p=>({road:r,p}))).filter(v=>v.p.length>1).map(v=>[v.road.id+JSON.stringify(v.p),v])).values()];
 const segments:Segment[]=[],cells=new Map<string,Segment[]>();
 for(const {road,p} of paths)for(let i=1;i<p.length;i++){
  const a=p[i-1],b=p[i],length=Math.hypot(b[0]-a[0],b[1]-a[1]);if(length<.1||!road.w)continue;
  const s={id:road.id,a,b,length,dx:(b[0]-a[0])/length,dz:(b[1]-a[1])/length,width:road.w,candidate:/^(trunk|primary|secondary|tertiary)(_link)?$/.test(road.kind)&&(!!road.oneway||road.w>=10),foot:/^(footway|path|cycleway)$/.test(road.kind)&&road.w<=4,oneway:!!road.oneway};segments.push(s);
  const margin=road.w/2+18;
  for(let x=Math.floor((Math.min(a[0],b[0])-margin)/cellSize);x<=Math.floor((Math.max(a[0],b[0])+margin)/cellSize);x++)for(let z=Math.floor((Math.min(a[1],b[1])-margin)/cellSize);z<=Math.floor((Math.max(a[1],b[1])+margin)/cellSize);z++){const key=x+','+z,list=cells.get(key)??[];list.push(s);cells.set(key,list);}
 }
 for(const r of [...new Map(data.flatMap(t=>t.roads).filter(r=>r.bridge&&isVisibleRoad(r)).map(r=>[r.id,r])).values()]){
  const prof=bridgeRoadProfile(r,/^(footway|path|steps|pedestrian|cycleway)$/.test(r.kind)?FOOT_TOP:ROAD_TOP);
  for(let i=1;i<prof.p.length;i++){if(Math.min(prof.y[i-1],prof.y[i])>2.4)continue;const a=prof.p[i-1],b=prof.p[i],length=Math.hypot(b[0]-a[0],b[1]-a[1]);if(length<.1)continue;const s:Segment={id:r.id,a,b,length,dx:(b[0]-a[0])/length,dz:(b[1]-a[1])/length,width:r.w,candidate:false,foot:false,oneway:false};
   for(let x=Math.floor((Math.min(a[0],b[0])-r.w/2-4)/cellSize);x<=Math.floor((Math.max(a[0],b[0])+r.w/2+4)/cellSize);x++)for(let z=Math.floor((Math.min(a[1],b[1])-r.w/2-4)/cellSize);z<=Math.floor((Math.max(a[1],b[1])+r.w/2+4)/cellSize);z++){const key=x+','+z,list=cells.get(key)??[];list.push(s);cells.set(key,list);}
  }
 }
 const obstacles=new Map<string,Point[][][]>();
 for(const p of [...data.flatMap(t=>t.buildings.filter(b=>!hiddenUndergroundBuildings.has(b.id)).map(b=>b.p)),...data.flatMap(t=>t.areas.filter(a=>a.kind==='water').map(a=>a.p))]){const xs=p[0].map(v=>v[0]),zs=p[0].map(v=>v[1]);for(let x=Math.floor(Math.min(...xs)/cellSize);x<=Math.floor(Math.max(...xs)/cellSize);x++)for(let z=Math.floor(Math.min(...zs)/cellSize);z<=Math.floor(Math.max(...zs)/cellSize);z++){const key=x+','+z,list=obstacles.get(key)??[];list.push(p);obstacles.set(key,list);}}
 const occupied=(p:Point)=> (obstacles.get(Math.floor(p[0]/cellSize)+','+Math.floor(p[1]/cellSize))??[]).some(rings=>insidePolygon(p,rings));
 const result:RoadDivider[]=[];
 for(const s of segments.filter(s=>s.candidate&&s.length>=4)){
  const count=Math.ceil(s.length/4),step=s.length/count;
  for(let i=0;i<count;i++){
   const t=(i+.5)/count,p:Point=[s.a[0]+s.dx*s.length*t,s.a[1]+s.dz*s.length*t],near=cells.get(Math.floor(p[0]/cellSize)+','+Math.floor(p[1]/cellSize))??[];
   const partners=new Map<string,{other:Segment;x:number;z:number;d:number}>();
   for(const other of near){
    if(other.id===s.id||(!other.foot&&(!other.candidate||!s.oneway||!other.oneway||other.id<=s.id))||Math.abs(s.dx*other.dx+s.dz*other.dz)<.98)continue;
    const q=nearest(p,other),gap=q.d-(s.width+other.width)/2;
    if(q.t<=.01||q.t>=.99||gap<(other.foot?2.2:.8)||gap>(other.foot?9:14))continue;
    const old=partners.get(other.id);if(!old||q.d<old.d)partners.set(other.id,{other,...q});
   }
   for(const {other,x,z,d} of partners.values()){
    const gap=d-(s.width+other.width)/2,placement=other.foot?'roadside':'median',kind=placement==='roadside'||gap>=2.2?'planting':'rail',width=kind==='planting'?Math.min(2.6,gap-.6):.24,offset=(s.width/2+gap/2)/d,mid:Point=[p[0]+(x-p[0])*offset,p[1]+(z-p[1])*offset],length=Math.max(1,step-.15);
    if(inTunnelExcavation(...mid)||southAxisHeight(...mid)!==undefined||[mid,...[-1,1].flatMap(a=>[-1,1].map(b=>[mid[0]+s.dx*length/2*a-s.dz*width/2*b,mid[1]+s.dz*length/2*a+s.dx*width/2*b] as Point))].some(occupied))continue;
    // Other roads, footways, driveways and crossing arms get a generous open interval.
    if(near.some(o=>o.id!==s.id&&o.id!==other.id&&nearest(mid,o).d<o.width/2+width/2+length/2+1.5))continue;
    result.push({x:mid[0],z:mid[1],dx:s.dx,dz:s.dz,length,width,kind,placement,roads:[s.id,other.id]});
   }
  }
 }
 cache.set(data,result);return result;
}
