import {streetClearance} from './street-clearance.ts';
import {tunnelData} from './tunnel-data.ts';
import {groundRoadPaths,nearestPath} from './south-axis-layout.ts';
import {isGroundRoad,hiddenUndergroundBuildings} from './road-level.ts';
import {insidePolygon} from './street-layout.ts';
import {activeForecourts} from './forecourt-layout.ts';
import type {Point,TileData} from './types.ts';

interface Rectangle {x:number;z:number;dx:number;dz:number;length:number;width:number}
export interface TunnelGarden extends Rectangle {kind:'median'|'rim'|'roof';p:Point[][]}
const cache=new WeakMap<TileData[],TunnelGarden[]>(),CELL=40;
// Separating axes include both rectangles: a narrow crossing must not slip between sampled corners.
function overlaps(a:Rectangle,b:Rectangle){
 for(const [x,z] of [[a.dx,a.dz],[-a.dz,a.dx],[b.dx,b.dz],[-b.dz,b.dx]]){
  const extent=(r:Rectangle)=>Math.abs(x*r.dx+z*r.dz)*r.length/2+Math.abs(-x*r.dz+z*r.dx)*r.width/2;
  if(Math.abs((a.x-b.x)*x+(a.z-b.z)*z)>extent(a)+extent(b))return false;
 }
 return true;
}
const segment=(a:Point,b:Point,width:number):Rectangle=>{const length=Math.hypot(b[0]-a[0],b[1]-a[1])||.001;return {x:(a[0]+b[0])/2,z:(a[1]+b[1])/2,dx:(b[0]-a[0])/length,dz:(b[1]-a[1])/length,length,width};};
const corners=(r:Rectangle):Point[]=>[[-1,-1],[1,-1],[1,1],[-1,1],[-1,-1]].map(([u,v])=>[r.x+r.dx*r.length/2*u-r.dz*r.width/2*v,r.z+r.dz*r.length/2*u+r.dx*r.width/2*v]);

/** Low, inferred planting only in free surface space around the six mapped motor underpasses. */
export function createTunnelGardens(data:TileData[]):TunnelGarden[]{
 const cached=cache.get(data);if(cached)return cached;
 const roads=[...new Map(data.flatMap(t=>t.roads).map(r=>[r.id+JSON.stringify(r.p),r])).values()],ids=new Set(roads.map(r=>r.id));
 const routes=tunnelData.routes.filter(r=>ids.has(r.id)).sort((a,b)=>a.id.localeCompare(b.id)),ramps=routes.filter(r=>!r.covered);
 if(!routes.length){cache.set(data,[]);return [];}
 type Obstacle={rect?:Rectangle;p?:Point[][]};
 const grid=new Map<string,Obstacle[]>();
 const cells=(points:Point[],pad=0)=>{
  const xs=points.map(p=>p[0]),zs=points.map(p=>p[1]),keys:string[]=[];
  for(let x=Math.floor((Math.min(...xs)-pad)/CELL);x<=Math.floor((Math.max(...xs)+pad)/CELL);x++)for(let z=Math.floor((Math.min(...zs)-pad)/CELL);z<=Math.floor((Math.max(...zs)+pad)/CELL);z++)keys.push(x+','+z);
  return keys;
 };
 const index=(o:Obstacle,points:Point[],pad=0)=>{for(const key of cells(points,pad)){const list=grid.get(key)??[];list.push(o);grid.set(key,list);}};
 const path=(p:Point[],width:number)=>{for(let i=1;i<p.length;i++){const r=segment(p[i-1],p[i],width+1.2);r.length+=1.2;index({rect:r},[p[i-1],p[i]],width/2+1);}};
 for(const r of roads)if(isGroundRoad(r)||r.bridge)for(const p of r.bridge?[r.p]:groundRoadPaths(r))path(p,r.w);
 for(const r of ramps)path(r.p,r.w);
 const polygons=[...data.flatMap(t=>t.buildings.filter(b=>b.base<2&&!hiddenUndergroundBuildings.has(b.id)).map(b=>b.p)),...data.flatMap(t=>t.areas.filter(a=>a.kind==='water').map(a=>a.p)),...activeForecourts(data).flatMap(s=>s.beds.map(b=>b.p)),...tunnelData.excavations];
 for(const p of polygons)index({p},p[0],.4);
 for(const row of data.flatMap(t=>t.treeRows??[]))path(row.p,3);
 const result:TunnelGarden[]=[];
 const add=(r:Rectangle,kind:TunnelGarden['kind'])=>{
  const p=corners(r),obstacles=new Set(cells(p,.4).flatMap(k=>grid.get(k)??[]));
  for(const o of obstacles){
   if(o.rect&&overlaps(r,o.rect))return;
   if(o.p&&(p.some(q=>insidePolygon(q,o.p!))||o.p.some(ring=>ring.some((a,i)=>overlaps(r,segment(a,ring[(i+1)%ring.length],.6))))))return;
  }
  result.push({...r,kind,p:[p]});index({rect:{...r,length:r.length+.3,width:r.width+.3}},p,.3);
 };
 // Paired open ramps leave an intact strip at street level. Keep the plants below the retaining-wall tops.
 for(const r of ramps)for(let i=2;i<r.p.length-2;i+=2){
  if(r.y[i]>-.4)continue;
  const p=r.p[i],direction=segment(r.p[i-1],r.p[i+1],0);
  const candidates=ramps.filter(q=>q.name===r.name&&q.id>r.id).map(q=>({q,...nearestPath(...p,q.p,q.y)})).filter(q=>q.distance<30&&q.y<-.4).sort((a,b)=>a.distance-b.distance);
  const other=candidates[0];if(!other)continue;
  const gap=other.distance-(r.w+other.q.w)/2,width=Math.min(5.2,gap-1.5);if(width<.9)continue;
  const t=(r.w/2+gap/2)/other.distance;
  add({x:p[0]+(other.x-p[0])*t,z:p[1]+(other.z-p[1])*t,dx:direction.dx,dz:direction.dz,length:5.4,width},'median');
 }
 // Short garden panels behind each lintel occupy the surface roof, never the 4.8 m vehicle opening.
 for(const r of routes.filter(r=>r.covered))for(const end of [0,r.p.length-1])for(const step of [2,4,6]){
  const i=end===0?step:end-step;if(i<=0||i>=r.p.length-1)continue;
  const d=segment(r.p[i-1],r.p[i+1],0);add({x:r.p[i][0],z:r.p[i][1],dx:d.dx,dz:d.dz,length:4.8,width:Math.min(5.2,r.w-1)},'roof');
 }
 // Low garden strips beside the last descending stretch soften the otherwise bare concrete mouth.
 for(const r of ramps)for(let i=2;i<r.p.length-2;i+=2){
  if(r.y[i]>-1.2)continue;
  const d=segment(r.p[i-1],r.p[i+1],0);
  for(const side of [-1,1]){const offset=(r.w/2+2.2)*side;add({x:r.p[i][0]-d.dz*offset,z:r.p[i][1]+d.dx*offset,dx:d.dx,dz:d.dz,length:5.4,width:1.7},'rim');}
 }
 const clear=streetClearance(data),safe=result.filter(p=>clear.box(p,1.1));
 safe.sort((a,b)=>a.x-b.x||a.z-b.z);cache.set(data,safe);return safe;
}
