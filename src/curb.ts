// Street cross-section: raised footways meet the carriageway at a kerb, and footways
// that run onto the carriageway (crossings, overlapping sidewalks) ramp down to it.
import { isGroundRoad, ROAD_TOP, FOOT_TOP } from './road-level.ts';
import { groundRoadPaths, southAxisHeight, southAxisRoadSurfaces } from './south-axis-layout.ts';
import { operaGroundHeight } from './opera-layout.ts';
import { isHaixinshaDetailed } from './haixinsha-layout.ts';
import { inPearlPark } from './pearl-park-layout.ts';
import { insidePolygon } from './street-layout.ts';
import { tunnelData } from './tunnel-data.ts';
import { southAxisData } from './south-axis-data.ts';
import type { Area, Point, Road } from './types';

export { ROAD_TOP, FOOT_TOP };
// Sidewalk-level dressing was authored for the former .28 footway level.
export const CURB_RISE=FOOT_TOP-.28;
// Horizontal run of a kerb ramp, measured from the carriageway edge.
export const CURB_RAMP=1.5;
const FOOT_KINDS=new Set(['footway','path','pedestrian','steps','cycleway']);
export const isFootway=(kind:string)=>FOOT_KINDS.has(kind);
const CELL=30;
// Authored sites (opera, south axis, Haixinsha, Pearl River Park) draw their own decks; mapped
// footways inside them stay at the former level, tucked beneath, as before kerbs were raised.
export const SITE_FOOT=.28;
// Paths across lawns stay nearly flush with the grass (.18) instead of standing as kerbed slabs.
export const LAWN_PATH=.28;
export const tuckedFootwaySite=(x:number,z:number)=>isHaixinshaDetailed(x,z)||inPearlPark(x,z);
export function siteLevel(x:number,z:number){return operaGroundHeight(x,z)??southAxisHeight(x,z)??(tuckedFootwaySite(x,z)?SITE_FOOT:undefined);}

export class PolygonIndex {
  private grid=new Map<number,Point[][][]>();
  add(rings:Point[][]){
    const xs=rings[0].map(p=>p[0]),zs=rings[0].map(p=>p[1]);
    for(let x=Math.floor(Math.min(...xs)/CELL);x<=Math.floor(Math.max(...xs)/CELL);x++)
      for(let z=Math.floor(Math.min(...zs)/CELL);z<=Math.floor(Math.max(...zs)/CELL);z++){const key=x*100000+z;let list=this.grid.get(key);if(!list)this.grid.set(key,list=[]);list.push(rings);}
  }
  has(x:number,z:number){return (this.grid.get(Math.floor(x/CELL)*100000+Math.floor(z/CELL))??[]).some(rings=>insidePolygon([x,z],rings));}
}
/** Non-water map areas (parks, lawns) drawn as grass at .18. */
export function lawnIndex(areas:Iterable<Area>){
  const index=new PolygonIndex(),seen=new Set<string>();
  for(const a of areas){const key=JSON.stringify(a.p[0][0])+a.p[0].length;if(a.kind==='water'||seen.has(key))continue;seen.add(key);index.add(a.p);}
  return index;
}

export class Carriageways {
  private grid=new Map<number,[Point,Point,number,number,number][]>();
  readonly lawns:PolygonIndex;
  // Pre-cut carriageway polygons (tunnel and south-axis replacements) are drawn wider than their trimmed centrelines.
  private surfaces=new PolygonIndex();
  constructor(roads:Iterable<Road>,areas:Iterable<Area>=[]){
    this.lawns=lawnIndex(areas);
    const seen=new Set<string>();
    const add=(a:Point,b:Point,half:number,ya:number,yb:number)=>{
      const pad=half+CURB_RAMP+.5;
      for(let x=Math.floor((Math.min(a[0],b[0])-pad)/CELL);x<=Math.floor((Math.max(a[0],b[0])+pad)/CELL);x++)
        for(let z=Math.floor((Math.min(a[1],b[1])-pad)/CELL);z<=Math.floor((Math.max(a[1],b[1])+pad)/CELL);z++){
          const key=x*100000+z;let list=this.grid.get(key);if(!list)this.grid.set(key,list=[]);list.push([a,b,half,ya,yb]);
        }
    };
    for(const r of roads){
      if(seen.has(r.id)||isFootway(r.kind)||!isGroundRoad(r))continue;seen.add(r.id);
      for(const p of groundRoadPaths(r))for(let i=1;i<p.length;i++)add(p[i-1],p[i],r.w/2,ROAD_TOP,ROAD_TOP);
      for(const rings of tunnelData.roadSurfaces[r.id]?.p??southAxisRoadSurfaces.get(r.id)??[])this.surfaces.add(rings);
    }
    // Open tunnel and south-axis approach ramps are carriageways too, at their own (descending) deck.
    for(const r of [...tunnelData.routes.filter(r=>!r.covered),...southAxisData.ramps])for(let i=1;i<r.p.length;i++)add(r.p[i-1],r.p[i],r.w/2,r.y[i-1],r.y[i]);
  }
  /** Signed distance to the nearest carriageway edge (negative inside) and that carriageway's deck height. */
  nearest(x:number,z:number){
    let d=Infinity,y=ROAD_TOP,ux=0,uz=0;
    for(const [a,b,half,ya,yb] of this.grid.get(Math.floor(x/CELL)*100000+Math.floor(z/CELL))??[]){
      const dx=b[0]-a[0],dz=b[1]-a[1],t=Math.max(0,Math.min(1,((x-a[0])*dx+(z-a[1])*dz)/(dx*dx+dz*dz||1))),e=Math.hypot(x-a[0]-dx*t,z-a[1]-dz*t)-half;
      if(e<d){d=e;y=ya+(yb-ya)*t;const l=Math.hypot(dx,dz)||1;ux=dx/l;uz=dz/l;}
    }
    if(d>0&&this.surfaces.has(x,z))return {d:-.01,y:ROAD_TOP,ux,uz};
    return {d,y,ux,uz};
  }
  edge(x:number,z:number){return this.nearest(x,z).d;}
  /**
   * Height people and vehicles stand at: the deck on a carriageway, footway level beyond the kerb ramp.
   * `half`/`dir` are the footway half-width and direction: the ramp is measured from the strip's near
   * edge, so a sidewalk running beside and overhanging the carriageway stays at deck level there instead
   * of standing as a lip. A crossing's width runs along the kerb, so it does not shift its ramp.
   */
  walkLevel(x:number,z:number,half=0,dir?:[number,number]){
    const site=siteLevel(x,z);if(site!==undefined)return site;
    const {d,y,ux,uz}=this.nearest(x,z);if(d<=0)return Math.min(ROAD_TOP,y);
    const toward=dir?half*Math.abs(dir[0]*ux+dir[1]*uz):half,e=d-toward;if(e>=CURB_RAMP&&this.lawns.has(x,z))return LAWN_PATH;
    return ROAD_TOP+(FOOT_TOP-ROAD_TOP)*Math.max(0,Math.min(1,e/CURB_RAMP));
  }
  /** Drawn footway top: tucked under the deck where it crosses a carriageway, at most 1 cm proud of it on the ramp. */
  footLevel(x:number,z:number,half=0,dir?:[number,number]){
    if(siteLevel(x,z)!==undefined)return SITE_FOOT;
    const {d,y}=this.nearest(x,z);if(d<=0)return Math.min(ROAD_TOP,y)-.04;
    const walk=this.walkLevel(x,z,half,dir);return walk===LAWN_PATH?walk:Math.max(ROAD_TOP+.01,walk);
  }
  /** Footway polyline resampled near carriageways so kerb ramps follow the edge. */
  footProfile(p:Point[],half=0,step=1):{p:Point[];y:number[]}{
    const points:Point[]=[p[0]],dirs:[number,number][]=[];
    const unit=(a:Point,b:Point):[number,number]=>{const l=Math.hypot(b[0]-a[0],b[1]-a[1])||1;return [(b[0]-a[0])/l,(b[1]-a[1])/l];};
    for(let i=1;i<p.length;i++){
      const a=p[i-1],b=p[i],length=Math.hypot(b[0]-a[0],b[1]-a[1]);
      const mid:Point=[(a[0]+b[0])/2,(a[1]+b[1])/2],dir=unit(a,b),levels=[a,mid,b].map(q=>this.footLevel(q[0],q[1],half,dir));
      const near=Math.min(this.edge(...a),this.edge(...b),this.edge(...mid))<CURB_RAMP+half+length/2||levels.some(y=>y!==levels[0]);
      const n=near?Math.max(1,Math.ceil(length/step)):1;
      if(i===1)dirs.push(dir);
      for(let k=1;k<=n;k++){points.push([a[0]+(b[0]-a[0])*k/n,a[1]+(b[1]-a[1])*k/n]);dirs.push(dir);}
    }
    return {p:points,y:points.map((q,i)=>this.footLevel(q[0],q[1],half,dirs[i]))};
  }
}
