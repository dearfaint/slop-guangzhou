import {forecourtData} from './forecourt-data.ts';
import type {Point,TileData} from './types';
interface ForecourtBed {x:number;z:number;angle:number;p:Point[][];trees:{x:number;z:number;height:number;y:number}[];}
interface ForecourtSite {building:string;paving:Point[][][];border:Point[][][];beds:ForecourtBed[];}
// Source buildings and mapped block boundaries stay intact. Planting is a visual estimate.
export const forecourtSites=forecourtData as ForecourtSite[];
export function activeForecourts(data:TileData[]){
  const loaded=new Set(data.flatMap(t=>t.buildings.map(b=>b.id)));
  return forecourtSites.filter(s=>loaded.has(s.building));
}
