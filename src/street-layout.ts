import { inNorthGrove } from './axis-groves.ts';
import { inPearlPark } from './pearl-park-layout.ts';
import { isHaixinshaDetailed, hiddenIslandBuildings } from './haixinsha-layout.ts';
import { inSouthAxisPlanting, groundRoadPaths } from './south-axis-layout.ts';
import { isGroundRoad, hiddenUndergroundBuildings } from './road-level.ts';
import type { Point, TileData } from './types';

export interface StreetItem {
  x: number; z: number; angle: number; height: number;
  source: 'inferred:park' | 'inferred:roadside';
  /** Extra base height when standing on a raised footway (see curb.ts). */
  lift?: number;
  reference: string;
}
export interface StreetLayout { trees: StreetItem[]; palms: StreetItem[]; lamps: StreetItem[]; planters: StreetItem[]; benches: StreetItem[] }
export function insideRing(point: Point, ring: Point[]) {
  let inside=false;
  for(let i=0,j=ring.length-1;i<ring.length;j=i++) {
    const a=ring[i],b=ring[j];
    if((a[1]>point[1])!==(b[1]>point[1]) && point[0]<(b[0]-a[0])*(point[1]-a[1])/(b[1]-a[1])+a[0])inside=!inside;
  }
  return inside;
}
export function insidePolygon(point: Point,rings: Point[][]) { return !!rings.length&&insideRing(point,rings[0])&&!rings.slice(1).some(r=>insideRing(point,r)); }
export function segmentDistance(point: Point,a: Point,b: Point) {
  const dx=b[0]-a[0],dz=b[1]-a[1],length=dx*dx+dz*dz;
  const t=length ? Math.max(0,Math.min(1,((point[0]-a[0])*dx+(point[1]-a[1])*dz)/length)) : 0;
  return Math.hypot(point[0]-a[0]-dx*t,point[1]-a[1]-dz*t);
}
const jitter=(x:number,z:number)=>{const n=Math.sin(x*12.9898+z*78.233)*43758.5453;return n-Math.floor(n);};
const priority=(p:StreetItem)=>Math.hypot((p.x+300)*1.5,p.z+300);
function unique<T>(items:T[],key:(v:T)=>string) {return [...new Map(items.map(i=>[key(i),i])).values()];}
export function createStreetLayout(tiles:TileData[]):StreetLayout {
  const buildings=unique(tiles.flatMap(t=>t.buildings).filter(b=>!hiddenIslandBuildings.has(b.id)&&!hiddenUndergroundBuildings.has(b.id)),b=>b.id+JSON.stringify(b.p));
  const areas=unique(tiles.flatMap(t=>t.areas),a=>JSON.stringify(a.p));
  const parks=areas.filter(a=>a.kind==='park');
  const roads=unique(tiles.flatMap(t=>t.roads).flatMap(r=>groundRoadPaths(r).map(p=>({...r,p}))).filter(r=>isGroundRoad(r)&&!['construction','proposed','steps'].includes(r.kind)),r=>r.id+JSON.stringify(r.p));
  const treeRows=unique(tiles.flatMap(t=>t.treeRows??[]),r=>r.id+JSON.stringify(r.p));
  // Index source geometry once. Keep every clipped part; IDs can repeat across tiles.
  type Obstacle={rings?:Point[][];a?:Point;b?:Point;radius:number};
  const cells=new Map<string,Obstacle[]>(),cellSize=40;
  const index=(o:Obstacle,points:Point[])=>{
    const xs=points.map(p=>p[0]),zs=points.map(p=>p[1]);
    for(let x=Math.floor((Math.min(...xs)-o.radius)/cellSize);x<=Math.floor((Math.max(...xs)+o.radius)/cellSize);x++)
      for(let z=Math.floor((Math.min(...zs)-o.radius)/cellSize);z<=Math.floor((Math.max(...zs)+o.radius)/cellSize);z++) {
        const key=x+','+z;if(!cells.has(key))cells.set(key,[]);cells.get(key)!.push(o);
      }
  };
  for(const b of buildings)index({rings:b.p,radius:4},b.p.flat());
  for(const a of areas.filter(a=>a.kind==='water'))index({rings:a.p,radius:4},a.p.flat());
  for(const r of roads)for(let i=1;i<r.p.length;i++)index({a:r.p[i-1],b:r.p[i],radius:r.w/2+2},[r.p[i-1],r.p[i]]);
  for(const r of treeRows)for(let i=1;i<r.p.length;i++)index({a:r.p[i-1],b:r.p[i],radius:10},[r.p[i-1],r.p[i]]);
  const clear=(p:Point,margin=0)=>!inPearlPark(...p)&&!inSouthAxisPlanting(...p)&&!isHaixinshaDetailed(...p)&&!(cells.get(Math.floor(p[0]/cellSize)+','+Math.floor(p[1]/cellSize))??[]).some(o=>{
    if(o.rings) return insidePolygon(p,o.rings)||o.rings.some(r=>r.some((a,i)=>segmentDistance(p,a,r[(i+1)%r.length])<o.radius+margin));
    return segmentDistance(p,o.a!,o.b!)<o.radius+margin;
  });
  const trees:StreetItem[]=[],palms:StreetItem[]=[],lamps:StreetItem[]=[],planters:StreetItem[]=[],benches:StreetItem[]=[];
  const occupied=new Map<string,Point[]>();
  const reserve=(p:Point,gap:number)=>{
    const cx=Math.floor(p[0]/12),cz=Math.floor(p[1]/12),range=Math.ceil(gap/12);
    for(let x=cx-range;x<=cx+range;x++)for(let z=cz-range;z<=cz+range;z++)if((occupied.get(x+','+z)??[]).some(q=>Math.hypot(p[0]-q[0],p[1]-q[1])<gap))return false;
    const key=cx+','+cz;if(!occupied.has(key))occupied.set(key,[]);occupied.get(key)!.push(p);return true;
  };
  const candidates:StreetItem[]=[];
  for(const park of parks) {
    const xs=park.p[0].map(p=>p[0]),zs=park.p[0].map(p=>p[1]);
    // Global grid with deterministic jitter: consistent when neighbouring tiles load.
    for(let x=Math.ceil(Math.min(...xs)/19)*19;x<Math.max(...xs);x+=19)for(let z=Math.ceil(Math.min(...zs)/19)*19;z<Math.max(...zs);z+=19) {
      const p:Point=[x+(jitter(x,z)-.5)*5,z+(jitter(z,x)-.5)*5];
      // The Huacheng Square north grove (axis-groves.ts) plants this park densely instead.
      if(!insidePolygon(p,park.p)||!clear(p,1)||inNorthGrove(...p))continue;
      if(park.p.some(r=>r.some((a,i)=>segmentDistance(p,a,r[(i+1)%r.length])<4)))continue;
      candidates.push({x:p[0],z:p[1],angle:jitter(x+2,z)*Math.PI*2,height:6+jitter(x,z)*4,source:'inferred:park',reference:park.name||'OSM park polygon'});
    }
  }
  for(const item of candidates.sort((a,b)=>priority(a)-priority(b)))if(trees.length+palms.length<660&&reserve([item.x,item.z],12)) {
    if(jitter(item.x,item.z)>.83)palms.push({...item,height:item.height+2});else trees.push(item);
  }
  const lampCandidates:StreetItem[]=[];
  for(const road of roads) {
    const foot=['path','footway','pedestrian','cycleway'].includes(road.kind),spacing=foot?42:60;
    let carry=spacing/2;
    for(let i=1;i<road.p.length;i++) {
      const a=road.p[i-1],b=road.p[i],dx=b[0]-a[0],dz=b[1]-a[1],length=Math.hypot(dx,dz);
      if(length<.1)continue;
      let distance=carry;
      for(;distance<length;distance+=spacing)for(const side of [-1,1]) {
        const offset=road.w/2+3.2,p:Point=[a[0]+dx*distance/length-dz/length*offset*side,a[1]+dz*distance/length+dx/length*offset*side];
        if(!clear(p))continue;
        lampCandidates.push({x:p[0],z:p[1],angle:Math.atan2(dx,dz)+(side===1?Math.PI:0),height:foot?4.5:8,source:'inferred:roadside',reference:road.id});
      }
      carry=distance-length;
    }
  }
  const lampCells=new Map<string,number>();
  for(const item of lampCandidates.sort((a,b)=>priority(a)-priority(b))){
    const key=Math.floor(item.x/200)+','+Math.floor(item.z/200);
    if((lampCells.get(key)??0)>=12||!reserve([item.x,item.z],14))continue;
    lampCells.set(key,(lampCells.get(key)??0)+1);
    lamps.push(item);
    // Amenity positions remain inferred. Park furniture only beside mapped paths.
    if(item.height<5) {
      const p:Point=[item.x+Math.sin(item.angle)*5,item.z+Math.cos(item.angle)*5];
      if(clear(p)&&parks.some(a=>insidePolygon(p,a.p))&&reserve(p,3)) {
        const amenity={...item,x:p[0],z:p[1],angle:item.angle+Math.PI/2};
        if(benches.length<36&&lamps.length%3===0)benches.push(amenity);
        else if(planters.length<40&&lamps.length%4===0)planters.push(amenity);
      }
    }
  }
  return {trees,palms,lamps,planters,benches};
}
