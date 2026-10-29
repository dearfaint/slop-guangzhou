import {tunnelData} from './tunnel-data.ts';
import type { Point, Area, Road } from './types.ts';
import { southAxisData } from './south-axis-data.ts';
export interface DetailRamp {id:string;p:Point[];y:number[];w:number;source:string;heightSource:string}
export interface SouthAxisData {
 source:string;heightSource:string;plaza:Point[][];bridge:Point[][];bridgeBands:Point[][][];beds:Point[][][];courtyard:{center:Point;radius:number;outerRadius:number;depth:number;opening:Point[][];excavation:Point[][];wallEdges?:Point[][]};pavingLines:Point[][];trenches:Point[][][];
 ramps:DetailRamp[];underground:{id:string;p:Point[];y:number;heights:number[];floorSurfaces:Point[][][];w:number;ceilingSurfaces:Point[][][];wallEdges:Point[][];source:string}[];
 paths:{id:string;p:Point[];w:number}[];trees:{x:number;z:number;height:number}[];
 areaReplacements:{key:string;p:Point[][][]}[];roadReplacements:{id:string;p:Point[][][];lines:Point[][]}[];
 trafficExcluded:string[];bridgeSource:string;plazaSource:string;
}
export function inRing(x:number,z:number,p:Point[]) {
 let result=false;for(let i=0,j=p.length-1;i<p.length;j=i++)if((p[i][1]>z)!==(p[j][1]>z)&&x<(p[j][0]-p[i][0])*(z-p[i][1])/(p[j][1]-p[i][1])+p[i][0])result=!result;return result;
}
export const inPolygon=(x:number,z:number,p:Point[][])=>inRing(x,z,p[0])&&!p.slice(1).some(r=>inRing(x,z,r));
export function nearestPath(x:number,z:number,p:Point[],heights?:number[]) {
 let best={distance:Infinity,y:0,x:0,z:0};
 for(let i=1;i<p.length;i++){
  const a=p[i-1],b=p[i],dx=b[0]-a[0],dz=b[1]-a[1],length=dx*dx+dz*dz;
  const t=length?Math.max(0,Math.min(1,((x-a[0])*dx+(z-a[1])*dz)/length)):0;
  const px=a[0]+dx*t,pz=a[1]+dz*t,distance=Math.hypot(x-px,z-pz);
  if(distance<best.distance)best={distance,y:heights?heights[i-1]+(heights[i]-heights[i-1])*t:0,x:px,z:pz};
 }
 return best;
}
const bridgeZ=southAxisData.bridge[0].map(p=>p[1]),north=Math.min(...bridgeZ),south=Math.max(...bridgeZ);
export function bridgeHeight(z:number){const t=Math.max(0,Math.min(1,(z-north)/(south-north)));return .42+1.9*Math.sin(t*Math.PI);}

function boxRing(x0:number,z0:number,x1:number,z1:number):Point[] {
 return [[x0,z0],[x1,z0],[x1,z1],[x0,z1],[x0,z0]];
}
export function ellipseRing(cx:number,cz:number,rx:number,rz:number,segments=64,tilt=0):Point[] {
 const c=Math.cos(tilt),s=Math.sin(tilt);
 return Array.from({length:segments+1},(_,i)=>{
  const a=i/segments*Math.PI*2,x=Math.cos(a)*rx,z=Math.sin(a)*rz;
  return [cx+x*c-z*s,cz+x*s+z*c] as Point;
 });
}

// Huacheng Square South Mall (花城汇南区) sunken courts, twin oval ramp wells, and Musical Fountain (音乐喷泉).
export const centralMallBounds=[-306.0,-280.88,-271.4,-185.14] as const;
export const southMallBounds=[-307.6,-113.0,-274.9,-60.3] as const;
export const northMallBounds=[-303.0,-323.0,-275.0,-309.5] as const;
export const westWellSpec={center:[-350.4,-231.5] as Point,rx:14.8,rz:11.2,tilt:-.16};
export const eastWellSpec={center:[-221.6,-231.0] as Point,rx:15.2,rz:11.4,tilt:.16};
export const musicalFountainSpec={center:[-290.0,-146.3] as Point,rx:27.6,rz:17.6,innerRx:14.2,innerRz:9.1};
// Shared with paving preparation so its exclusion follows the deck instead of the wider planting bounds.
export const mallPlazaOuter:Point[]=[
 [-320,-324],[-258,-324],[-258,-280],[-266,-276],[-266,-184],
 [-250,-168],[-246,-146],[-250,-124],[-268,-112],[-268,-56],
 [-314,-56],[-314,-112],[-330,-124],[-334,-146],[-330,-168],
 [-312,-184],[-312,-276],[-320,-280],[-320,-324],
];

export const mallExcavationRings:Point[][]= [
 boxRing(...centralMallBounds),
 boxRing(...southMallBounds),
 boxRing(...northMallBounds),
 ellipseRing(...westWellSpec.center,westWellSpec.rx,westWellSpec.rz,48,westWellSpec.tilt),
 ellipseRing(...eastWellSpec.center,eastWellSpec.rx,eastWellSpec.rz,48,eastWellSpec.tilt),
];

export function centralMallFloorY(z:number):number {
 if(z<=-280.88)return .42;
 if(z<-267.20)return .42+(-4.6-.42)*((z+280.88)/(-267.20+280.88));
 if(z<=-222.07)return -4.6;
 if(z<-185.14)return -4.6+(.42+4.6)*((z+222.07)/(-185.14+222.07));
 return .42;
}
export function southMallFloorY(z:number):number {
 if(z<=-113.0)return -4.2;
 if(z<=-78.1)return -4.2;
 if(z<-60.3)return -4.2+(.42+4.2)*((z+78.1)/(-60.3+78.1));
 return .42;
}

const mallPassageLines=[
 {
  p:[-280.88,-274.0,-267.20,-245.0,-222.07,-203.6,-185.14].map(z=>[-288.7,z] as Point),
  heights:[.42,-2.09,-4.6,-4.6,-4.6,-2.09,.42],
  w:33.6,
 },
 {
  p:[-112.2,-95.0,-78.1,-69.2,-60.3].map(z=>[-291.25,z] as Point),
  heights:[-4.2,-4.2,-4.2,-1.89,.42],
  w:31.4,
 },
];

export function southAxisHeight(x:number,z:number):number|undefined {
 if(inPolygon(x,z,centralPromenade)&&!inRing(x,z,northRotundaOpening))return .42;
 if(inPolygon(x,z,southAxisData.bridge))return bridgeHeight(z);
 if(inPolygon(x,z,southAxisData.plaza))return .42;
 if(x>=-305.6&&x<=-271.8&&z>=-280.88&&z<=-185.14)return centralMallFloorY(z);
 if(x>=-307.2&&x<=-275.3&&z>=-112.4&&z<=-60.3)return southMallFloorY(z);
 if(x>=-332&&x<=-248&&z>=-312&&z<=-56&&!inRing(x,z,mallExcavationRings[2]))return .42;
 return undefined;
}
// The AMap satellite view shows a pedestrian deck here, above the mapped motor tunnels.
// The edges follow the two OSM footways 1513985585 / 1513985586; dimensions are approximate.
export const centralPromenade:Point[][]=[[[-325,-46],[-264,-46],[-265,34],[-270,110],[-270,154],[-322,154],[-323,79],[-318,-42],[-325,-46]]];
export const northRotunda={center:[-291.6,-12.2] as Point,radius:14.2,outerRadius:15.4,floorY:southAxisData.underground.find(r=>r.id==='osm/way/603486756/0')!.y};
export const northRotundaOpening=ellipseRing(...northRotunda.center,northRotunda.radius,northRotunda.radius,96);
export const tunnelLateralRadius=(radius:number)=>Math.min(radius,1.05);
function rampCollar(r:DetailRamp){
 const outerFirst=r.y[0]>r.y.at(-1)!,a=outerFirst?r.p[0]:r.p.at(-1)!,b=outerFirst?r.p[1]:r.p[r.p.length-2];
 const dx=a[0]-b[0],dz=a[1]-b[1],len=Math.hypot(dx,dz)||1;
 const inner:Point=[a[0]-dx/len*4,a[1]-dz/len*4],mid:Point=[a[0]+dx/len*2,a[1]+dz/len*2],tip:Point=[a[0]+dx/len*7,a[1]+dz/len*7];
 return {p:[inner,a,mid,tip],heights:[.32,.35,.30,0],w:r.w+3.6,tunnel:true};
}
// Select the nearby level from the player's previous foot height, never from XY alone.
const passageSurfaces=[
 ...southAxisData.ramps.map(r=>({p:r.p,heights:r.y,w:r.w,tunnel:true})),
 ...southAxisData.ramps.map(rampCollar),
 ...southAxisData.underground.map(r=>({p:r.p,heights:r.heights,w:r.w,tunnel:true})),
 ...mallPassageLines.map(r=>({...r,tunnel:false})),
].map(r=>({...r,minX:Math.min(...r.p.map(p=>p[0]))-r.w/2,maxX:Math.max(...r.p.map(p=>p[0]))+r.w/2,minZ:Math.min(...r.p.map(p=>p[1]))-r.w/2,maxZ:Math.max(...r.p.map(p=>p[1]))+r.w/2,minY:Math.min(...r.heights),maxY:Math.max(...r.heights)}));
export function southAxisPassage(x:number,z:number,referenceHeight:number,radius=.45,tolerance=.65){
 let best:(ReturnType<typeof nearestPath>&{width:number;tunnel:boolean})|undefined;
 for(const r of passageSurfaces){
  const margin=r.tunnel?tunnelLateralRadius(radius):radius;
  if(x<r.minX||x>r.maxX||z<r.minZ||z>r.maxZ||referenceHeight<r.minY-tolerance||referenceHeight>r.maxY+tolerance)continue;
  const p=nearestPath(x,z,r.p,r.heights);
  if(p.distance<=r.w/2-margin&&Math.abs(p.y-referenceHeight)<tolerance&&(!best||p.distance<best.distance))best={...p,width:r.w,tunnel:r.tunnel};
 }
 return best;
}
export function southAxisBlocked(x:number,z:number,radius=.45){
 if(Math.hypot(x-northRotunda.center[0],z-northRotunda.center[1])<northRotunda.radius+.4+radius)return true;
 const trenchMargin=tunnelLateralRadius(radius)+.45;
 for(const trench of southAxisData.trenches){
  if(inPolygon(x,z,trench))return true;
  const rim=nearestPath(x,z,trench[0]);
  if(rim.distance<trenchMargin&&!southAxisData.ramps.some(r=>nearestPath(rim.x,rim.z,r.p).distance<r.w/2+.05))return true;
 }
 for(const ring of mallExcavationRings.slice(2))if(inRing(x,z,ring)||nearestPath(x,z,ring).distance<radius+.35)return true;
 // Block side retaining walls of the central & south sunken mall courts while keeping stair ends open.
 if(x>=-306.0-radius&&x<=-271.4+radius&&z>-279.8&&z<-186.2)return true;
 if(x>=-307.6-radius&&x<=-274.9+radius&&z>-113.0-radius&&z<-61.4)return true;
 const {center:[cx,cz],radius:openingRadius}=southAxisData.courtyard;
 return Math.hypot(x-cx,z-cz)<openingRadius+.4+radius;
}
export function inSouthAxisPlanting(x:number,z:number){
 if(x>=-368&&x<=-204&&z>=-325&&z<=-56)return true;
 return inPolygon(x,z,southAxisData.courtyard.excavation)||southAxisData.beds.some(p=>inPolygon(x,z,p))||southAxisData.trenches.some(p=>inPolygon(x,z,p))||southAxisHeight(x,z)!==undefined;
}
const mallReplacedRoads=new Set([
 'osm/way/554611944/0','osm/way/554611945/0','osm/way/554611948/0','osm/way/554611942/0',
 'osm/way/299795189/0','osm/way/299795189/1','osm/way/299795190/0','osm/way/299795190/1',
 'osm/way/299795142/0','osm/way/299795151/0','osm/way/299795186/0','osm/way/299795194/0',
 'osm/way/554611940/0','osm/way/554611941/0','osm/way/1374671615/0',
]);
export const southAxisTrafficRoads=new Set([...southAxisData.trafficExcluded,...mallReplacedRoads]);
export const southAxisRoadSurfaces=new Map<string,Point[][][]>([
 ...southAxisData.roadReplacements.map(r=>[r.id,r.p] as [string,Point[][][]]),
 ...[...mallReplacedRoads].map(id=>[id,[]] as [string,Point[][][]]),
]);
const roadPaths=new Map(southAxisData.roadReplacements.map(r=>[r.id,r.lines]));
const tunnelGroundPaths=new Map(tunnelData.routes.map(r=>{const paths:Point[][]=[];if(!r.covered){let path:Point[]=[];for(let i=0;i<r.p.length;i++){if(r.y[i]>.349)path.push(r.p[i]);else{if(path.length>1)paths.push(path);path=[];}}if(path.length>1)paths.push(path);}return [r.id,paths] as const;}));
export function groundRoadPaths(road:Road):Point[][] {return southAxisTrafficRoads.has(road.id)?[]:tunnelGroundPaths.get(road.id)??tunnelData.roadSurfaces[road.id]?.lines??roadPaths.get(road.id)??[road.p];}
const areaSurfaces=new Map(southAxisData.areaReplacements.map(a=>[a.key,a.p]));
export function southAxisAreaSurfaces(area:Area){
 const key=`${area.p[0][0][0]}:${area.p[0][0][1]}:${area.name}`;
 if(key==='-448.1:-526:')return [[area.p[0],...mallExcavationRings,northRotundaOpening]];
 return areaSurfaces.get(key);
}

// Small ancillary roofs were incorrectly extruded to the generic 18 m default.
// Satellite imagery supports low pavilions/entrance canopies here; 3.2 m is still an estimate.
const ancillaryHeights=new Map<string,number>([
 ['overture/f09cc13c-f442-4150-9a94-7a56ddfbd541/0',3.2],['overture/d8261a54-ff00-4ac3-8923-ce0ffc590fec/0',3.2],['overture/451c774c-e68b-45d8-9b35-b05377b25ed5/0',3.2],
 ['overture/f867c590-0b98-4648-a5e3-9d6cfb16f393/0',3.2],['overture/cbff8b2d-8726-4c1a-8708-fbb888283c67/0',3.2],
 ['overture/99b041f6-bcf2-47a3-bbe4-5475707496fc/0',3.2],['overture/4bd9415b-1fbd-43ac-b965-40916ae646a8/0',3.2],
 ['overture/a36a2635-66ea-4ade-ae19-86a47804dbb6/0',2.6],['overture/dbd04109-1b42-4747-8234-77e7ef56fb68/0',2.6],
 ['overture/b211cb7d-9297-405c-a59f-d44956aaec0a/0',3.2],
 ['overture/f388476c-1d4a-4cb3-85fd-bbd0fd585130/0',3.2],['overture/92d64ee1-b609-4b71-8ef7-a70917ab1b39/0',3.2],
 ['overture/7f4d1c99-f9ce-4240-b5ed-95d0d5cb96e9/0',3.2],['overture/3c7a854f-faf9-408d-bc6d-e79ccba2f047/0',3.2],
 ['overture/684ad3f3-6dfe-4e21-a141-45ba53e2726f/0',3.2],['overture/fce99e23-377f-46b6-9c57-a8fef3c98228/0',3.2],
]);
export const southAxisBuildingHeight=(id:string,fallback:number)=>ancillaryHeights.get(id)??fallback;
