import { haixinshaData as data } from './haixinsha-data.ts';
import { seatingFootprint, marinaGangways, marinaPontoon, marinaTerrace, marinaQuayApron, westBridgeApproach } from './haixinsha-site.ts';
import { inPolygon, nearestPath } from './south-axis-layout.ts';
export const islandBuildings=new Map(data.buildings.map(b=>[b.id,b]));
export const islandWalkablePlatforms=new Set(data.buildings.filter(b=>b.kind==='stand'&&b.h===5).map(b=>b.id));
export const hiddenIslandBuildings=new Set(data.hidden);
export function islandBuildingHeight(id:string,h:number){return islandBuildings.get(id)?.h??h;}
export function haixinDeckHeight(z:number,x?:number):number {
 if(x!==undefined){
  const dx8=34.48,dz8=47.38,len8Sq=dx8*dx8+dz8*dz8;
  const t8=Math.max(0,Math.min(1,((x+908.47)*dx8+(z-786.46)*dz8)/len8Sq));
  const dist8=Math.hypot(x-(-908.47+dx8*t8),z-(786.46+dz8*t8));
  if(dist8<9.5&&t8<.92)return .35+(7.99-.35)*t8;

  const dx4=-2.77,dz4=31.15,len4Sq=dx4*dx4+dz4*dz4;
  const t4=Math.max(0,Math.min(1,((x+825.44)*dx4+(z-1003.20)*dz4)/len4Sq));
  const dist4=Math.hypot(x-(-825.44+dx4*t4),z-(1003.20+dz4*t4));
  if(dist4<9.5&&t4>0)return 1.23+(.35-1.23)*t4;

  if(Math.hypot(x-(-657.71),z-1008.73)<9.5)return .35;
 }
 if(z<=740)return .35;
 if(z>=1010)return .35;
 const t=(z-740)/(1010-740);
 return .35+8.65*Math.sin(t*Math.PI);
}
export function bridge4Height(z:number):number {
 if(z<=580.587)return .35;
 if(z>=636.113)return .35;
 const t=(z-580.587)/(636.113-580.587);
 return .35+3.4*Math.pow(Math.sin(t*Math.PI),2);
}
export function bridge5Height(z:number):number {
 if(z<=598.554)return .28;
 if(z>=666.492)return .28;
 const t=(z-598.554)/(666.492-598.554);
 return .28+3.5*Math.pow(Math.sin(t*Math.PI),2);
}
export function bridge3Height(z:number):number {
 if(z<=360)return .35;
 if(z>=464)return 5;
 const t=(z-360)/(464-360),s=t*t*(3-2*t);
 return .35+(5-.35)*s;
}
export function islandBridgeHeight(x:number,z:number):number|undefined {
 const approach=nearestPath(x,z,westBridgeApproach),end=westBridgeApproach.at(-1)!,before=westBridgeApproach.at(-2)!;
 const pastEnd=Math.hypot(approach.x-end[0],approach.z-end[1])<.001&&(x-end[0])*(end[0]-before[0])+(z-end[1])*(end[1]-before[1])>0;
 if(approach.distance<=6.1&&!pastEnd)return approach.distance<=3.75?.35:.43;
 if(inPolygon(x,z,marinaTerrace)||inPolygon(x,z,marinaQuayApron))return .48;
 const pontoon=nearestPath(x,z,marinaPontoon.p);if(pontoon.distance<=marinaPontoon.w/2)return .62;
 for(const g of marinaGangways){const p=nearestPath(x,z,g.p,[.48,.62]);if(p.distance<=g.w/2)return p.y;}

 for(const b of data.buildings)if(islandWalkablePlatforms.has(b.id)&&inPolygon(x,z,b.p))return 5;
 const b1=data.bridges.find(b=>b.id===1372988680),b3=data.bridges.find(b=>b.id===858784087),b4=data.bridges.find(b=>b.id===1372988681),b5=data.bridges.find(b=>b.id===1372988682);
 if(b3&&inPolygon(x,z,b3.p))return bridge3Height(z);
 if(b4&&inPolygon(x,z,b4.p))return bridge4Height(z);
 if(b5&&(inPolygon(x,z,b5.p)||nearestPath(x,z,b5.p[0]).distance<.05))return bridge5Height(z);
 if(b1&&inPolygon(x,z,b1.p))return b1.h;
 if(inPolygon(x,z,data.haixin.p)||(data.haixin.branches&&data.haixin.branches.some(a=>inPolygon(x,z,a))))return haixinDeckHeight(z,x);
 return undefined;
}
export function islandRoadReplaced(p:[number,number][],bridge:boolean){
 if(!bridge)return false;
 const middle=p[Math.floor(p.length/2)];
 return data.bridges.some(b=>inPolygon(...middle,b.p))||inPolygon(...middle,data.haixin.p)||(data.haixin.branches&&data.haixin.branches.some(a=>inPolygon(...middle,a)))||nearestPath(...middle,data.haixin.path).distance<10;
}

export function isHaixinshaDetailed(x:number,z:number){
 return inPolygon(x,z,data.island)||data.bridges.some(b=>inPolygon(x,z,b.p))||inPolygon(x,z,data.haixin.p)||(data.haixin.branches&&data.haixin.branches.some(a=>inPolygon(x,z,a)));
}
export function isHaixinshaSeating(x:number,z:number){return inPolygon(x,z,seatingFootprint);}
