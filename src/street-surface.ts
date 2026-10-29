// Standing height on ordinary streets for the player: carriageway deck, kerb ramp,
// raised footway/paving, lawn, or the base ground plane, matching what is drawn.
import { Carriageways, CURB_RAMP, FOOT_TOP, ROAD_TOP, PolygonIndex, isFootway, tuckedFootwaySite } from './curb.ts';
import { isGroundRoad } from './road-level.ts';
import { groundRoadPaths } from './south-axis-layout.ts';
import { streetPavingData } from './street-paving-data.ts';
import { activeForecourts } from './forecourt-layout.ts';
import type { Point, TileData } from './types';

export const LAWN_TOP=.18,GROUND_TOP=-.2;
const CELL=40;

export class StreetSurface {
  private curbs:Carriageways;
  private footways=new Map<number,[Point,Point,number,number][]>();
  private paving=new PolygonIndex();
  constructor(data:TileData[]){
    const roads=[...new Map(data.flatMap(t=>t.roads).map(r=>[r.id,r])).values()];
    this.curbs=new Carriageways(roads,data.flatMap(t=>t.areas));
    for(const r of roads){
      if(!isFootway(r.kind)||!isGroundRoad(r))continue;
      for(const p of groundRoadPaths(r))for(let i=1;i<p.length;i++){
        const a=p[i-1],b=p[i],strip=r.w/2,half=strip+.2;
        for(let x=Math.floor((Math.min(a[0],b[0])-half)/CELL);x<=Math.floor((Math.max(a[0],b[0])+half)/CELL);x++)
          for(let z=Math.floor((Math.min(a[1],b[1])-half)/CELL);z<=Math.floor((Math.max(a[1],b[1])+half)/CELL);z++){const key=x*100000+z;let list=this.footways.get(key);if(!list)this.footways.set(key,list=[]);list.push([a,b,half,strip]);}
      }
    }
    const ids=new Set(roads.map(r=>r.id));
    for(const tile of streetPavingData)if(tile.roads.some(id=>ids.has(id)))for(const rings of tile.p)this.paving.add(rings);
    for(const site of activeForecourts(data))for(const rings of [...site.paving,...site.border,...site.beds.map(b=>b.p)])this.paving.add(rings);
  }
  /** The footway strip under (x, z): its centreline point and half-width, which set its drawn height. */
  private onFootway(x:number,z:number){
    for(const [a,b,half,strip] of this.footways.get(Math.floor(x/CELL)*100000+Math.floor(z/CELL))??[]){
      const dx=b[0]-a[0],dz=b[1]-a[1],t=Math.max(0,Math.min(1,((x-a[0])*dx+(z-a[1])*dz)/(dx*dx+dz*dz||1))),px=a[0]+dx*t,pz=a[1]+dz*t;
      if(Math.hypot(x-px,z-pz)<=half){const l=Math.hypot(dx,dz)||1;return {x:px,z:pz,half:strip,dir:[dx/l,dz/l] as [number,number]};}
    }
    return undefined;
  }
  height(x:number,z:number){
    // Opera and south-axis decks are resolved (and gated on their tiles) by WalkWorld before this;
    // on Haixinsha and in the park the mapped footways sit beneath authored decks, so stand at road level.
    if(tuckedFootwaySite(x,z))return ROAD_TOP;
    if(this.paving.has(x,z))return FOOT_TOP;
    if(this.curbs.edge(x,z)<CURB_RAMP)return this.curbs.walkLevel(x,z);
    const foot=this.onFootway(x,z);if(foot)return this.curbs.walkLevel(foot.x,foot.z,foot.half,foot.dir);
    return this.curbs.lawns.has(x,z)?LAWN_TOP:GROUND_TOP;
  }
}
