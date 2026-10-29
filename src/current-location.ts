import { inPearlPark } from './pearl-park-layout.ts';

export function currentLocation(position:{x:number;z:number},places:{name:string;point:{x:number;z:number}}[],camera=''){
 if(camera==='cantonTop')return '广州塔顶 · 俯瞰全城';
 if(camera==='pearlPark'||inPearlPark(position.x,position.z))return '珠江公园 · 园路与湖滨';
 let nearest:typeof places[number]|undefined,distance=350;
 for(const place of places){const d=Math.hypot(place.point.x-position.x,place.point.z-position.z);if(d<distance){nearest=place;distance=d;}}
 return nearest?`${nearest.name}${distance>35?'附近':''}`:'城市漫游';
}
