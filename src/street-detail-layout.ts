import {streetDetailData} from './street-detail-data.ts';
import type {Point,TileData} from './types';
export type StreetDetailKind='led'|'shop'|'awning'|'roadSign'|'grate'|'metro'|'cart';
export interface StreetDetail {id:string;kind:StreetDetailKind;reference:string;referenceType:'road'|'building';x:number;z:number;angle:number;y:number;w:number;h:number;text:string;p?:Point[][];bed?:Point;source?:string;origin?:Point;exit?:string;}
export const streetDetails=streetDetailData as StreetDetail[];
const gratedBeds=new Set(streetDetails.filter(f=>f.kind==='grate').map(f=>f.bed!.join(',')));
export const hasTreeGrate=(x:number,z:number)=>gratedBeds.has(x+','+z);
export function activeStreetDetails(data:TileData[]){
 const buildings=new Set(data.flatMap(t=>t.buildings.map(b=>b.id))),roads=new Set(data.flatMap(t=>t.roads.map(r=>r.id)));
 return streetDetails.filter(f=>(f.referenceType==='road'?roads:buildings).has(f.reference));
}
