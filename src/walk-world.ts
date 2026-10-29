import { StreetSurface } from './street-surface.ts';
import {createStreetLayout} from './street-layout.ts';
import {activeStreetDetails} from './street-detail-layout.ts';
import {activeForecourts} from './forecourt-layout.ts';
import {createRoadDividers} from './road-dividers.ts';
import {createTunnelGardens} from './tunnel-gardens.ts';
import {tunnelPassage,inTunnelExcavation,tunnelRoutes} from './tunnel-layout.ts';
import {vehiclesOverlap,type VehicleBody} from './vehicle-collision.ts';
import {bridgeRailLayout} from './bridge-rails.ts';
import {operaMain,operaStudio,operaGroundHeight,operaEntry} from './opera-layout.ts';
import { parkEastAccess, inPearlPark, pearlParkFloor, pearlParkDeckHeight } from './pearl-park-layout.ts';
import { islandBuildingHeight, hiddenIslandBuildings, islandBridgeHeight, islandRoadReplaced, isHaixinshaSeating, islandWalkablePlatforms } from './haixinsha-layout.ts';
import { southAxisHeight, southAxisBlocked, southAxisTrafficRoads, southAxisBuildingHeight, groundRoadPaths, southAxisPassage, nearestPath, tunnelLateralRadius } from './south-axis-layout.ts';
import { isGroundRoad, isVisibleRoad, hiddenUndergroundBuildings, bridgeRoadProfile, FOOT_TOP, ROAD_TOP } from './road-level.ts';
import { stoneBlocks, huachengStone } from './huacheng-stone.ts';
import type { Point, TileData } from './types';

export function insideRing(x:number,z:number,ring:Point[]) {
  let inside=false;
  for(let i=0,j=ring.length-1;i<ring.length;j=i++){
    const a=ring[i],b=ring[j];
    if((a[1]>z)!==(b[1]>z)&&x<(b[0]-a[0])*(z-a[1])/(b[1]-a[1])+a[0])inside=!inside;
  }
  return inside;
}
export function insidePolygon(x:number,z:number,rings:Point[][]){return insideRing(x,z,rings[0])&&!rings.slice(1).some(r=>insideRing(x,z,r));}
function nearEdges(x:number,z:number,rings:Point[][],radius:number) {
  return rings.some(r=>r.some((a,i)=>{
    const b=r[(i+1)%r.length],dx=b[0]-a[0],dz=b[1]-a[1],length=dx*dx+dz*dz;
    const t=length?Math.max(0,Math.min(1,((x-a[0])*dx+(z-a[1])*dz)/length)):0;
    return (x-a[0]-dx*t)**2+(z-a[1]-dz*t)**2<radius*radius;
  }));
}
interface RailBarrier {a:{x:number;y:number;z:number};b:{x:number;y:number;z:number};halfWidth?:number;}
export class WalkWorld {
  private cells=new Map<string,Point[][][]>();
  private vehicles:VehicleBody[]=[];
  private vehicleHeading:number|undefined;
  setVehicles(vehicles:VehicleBody[]){this.vehicles=vehicles;}
  setVehicleHeading(heading:number|undefined){this.vehicleHeading=heading;}
  vehicleBlocked(x:number,z:number,y:number,heading=this.vehicleHeading){
    if(heading===undefined)return false;
    return this.vehicles.some(other=>vehiclesOverlap({x,z,y,heading,length:4.4,width:1.9,height:1.5},other));
  }
  private railCells=new Map<string,RailBarrier[]>();
  private railContact(x:number,z:number,radius:number,height:number){
    let best:{x:number;z:number;distance:number;padding:number}|undefined;
    const reach=radius+1.4;
    for(let cx=Math.floor((x-reach)/80);cx<=Math.floor((x+reach)/80);cx++)for(let cz=Math.floor((z-reach)/80);cz<=Math.floor((z+reach)/80);cz++)for(const {a,b,halfWidth=0} of this.railCells.get(cx+','+cz)??[]){
      const dx=b.x-a.x,dz=b.z-a.z,length=dx*dx+dz*dz,t=length?Math.max(0,Math.min(1,((x-a.x)*dx+(z-a.z)*dz)/length)):0;
      const y=a.y+(b.y-a.y)*t;if(height<y-.4||height>y+1.2)continue;
      const qx=a.x+dx*t,qz=a.z+dz*t,distance=Math.hypot(x-qx,z-qz);
      const nx=distance>1e-6?(x-qx)/distance:-dz/Math.sqrt(length||1),nz=distance>1e-6?(z-qz)/distance:dx/Math.sqrt(length||1),heading=this.vehicleHeading;
      const padding=(heading===undefined?radius+.08:Math.abs(nx*Math.sin(heading)+nz*Math.cos(heading))*2.2+Math.abs(nx*Math.cos(heading)-nz*Math.sin(heading))*.95+.08)+halfWidth;
      if(distance<padding&&(!best||distance-padding<best.distance-best.padding))best={x:qx,z:qz,distance,padding};
    }
    return best;
  }
  private paths:Point[][]=[];
  private drivingPaths:Point[][]=[];
  private southAxisActive=false;
  private street=new StreetSurface([]);
  private tunnelsActive=false;
  private tunnelPadding(x:number,z:number,p:{x:number;z:number;distance:number},radius:number){
    if(this.vehicleHeading===undefined||radius<1)return tunnelLateralRadius(radius);
    if(p.distance<1e-6)return radius;
    const nx=(x-p.x)/p.distance,nz=(z-p.z)/p.distance,heading=this.vehicleHeading;
    return Math.abs(nx*Math.sin(heading)+nz*Math.cos(heading))*2.2+Math.abs(nx*Math.cos(heading)-nz*Math.sin(heading))*.95+.08;
  }
  private tunnelPassage(...args:Parameters<typeof tunnelPassage>){const p=this.tunnelsActive?tunnelPassage(...args):undefined;return p&&p.distance<=p.width/2-this.tunnelPadding(args[0],args[1],p,args[3]??.45)?p:undefined;}
  private waterPolygons=new Set<Point[][]>();
  private bridges:{p:Point[];heights:number[];w:number;minX:number;maxX:number;minZ:number;maxZ:number}[]=[];
  private bridgeDeckHeight(x:number,z:number,referenceHeight?:number){
    let best:{distance:number;y:number}|undefined;
    for(const b of this.bridges){
      if(x<b.minX||x>b.maxX||z<b.minZ||z>b.maxZ)continue;
      const p=nearestPath(x,z,b.p,b.heights);
      if(p.distance<=b.w/2+.2&&(referenceHeight!==undefined?Math.abs(p.y-referenceHeight)<1.2:p.y<1.5||[...this.waterPolygons].some(w=>insidePolygon(x,z,w)))&&(!best||p.distance<best.distance))best=p;
    }
    return best?.y;
  }
  groundHeight(x:number,z:number,referenceHeight?:number){return this.tunnelPassage(x,z,referenceHeight??.35,0)?.y??(this.southAxisActive&&referenceHeight!==undefined?southAxisPassage(x,z,referenceHeight)?.y:undefined)??operaGroundHeight(x,z)??islandBridgeHeight(x,z)??pearlParkDeckHeight(x,z)??this.bridgeDeckHeight(x,z,referenceHeight)??pearlParkFloor(x,z)??(this.southAxisActive?southAxisHeight(x,z):undefined)??this.street.height(x,z);}
  private roofs:{p:Point[][];h:number;base:number;bounds:number[]}[]=[];
  cameraClear(x:number,y:number,z:number){
    const parkFloor=pearlParkFloor(x,z);if(parkFloor!==undefined&&y<parkFloor+.2)return false;
    const operaFloor=operaGroundHeight(x,z);if(operaFloor!==undefined&&y<operaFloor+.3)return false;
    if(y>huachengStone.ground&&y<huachengStone.ground+huachengStone.baseHeight+huachengStone.height+.2&&stoneBlocks(x,z,.2))return false;
    const passage=this.southAxisActive?southAxisPassage(x,z,y-1.9,.2,4.5):undefined;
    if(passage&&y>passage.y+.3&&y<passage.y+4.7)return true;
    const tunnel=this.tunnelPassage(x,z,y-1.9,.2,4);if(tunnel&&y>tunnel.y+.3&&y<tunnel.y+4.65)return true;
    if(y<.5&&!(operaFloor!==undefined&&operaFloor<0))return false;
    return !this.roofs.some(r=>y>=r.base-.3&&y<=r.h+.3&&x>=r.bounds[0]-.35&&x<=r.bounds[1]+.35&&z>=r.bounds[2]-.35&&z<=r.bounds[3]+.35&&(insidePolygon(x,z,r.p)||nearEdges(x,z,r.p,.35)));
  }
  flightFloor(x:number,z:number){
    let height=60;for(const roof of this.roofs)if(insidePolygon(x,z,roof.p)||nearEdges(x,z,roof.p,8))height=Math.max(height,roof.h+15);return height;
  }
  setMap(data:TileData[]) {
    this.street=new StreetSurface(data);
    this.tunnelsActive=data.some(t=>t.roads.some(r=>tunnelRoutes.has(r.id)));
    this.southAxisActive=data.some(t=>t.roads.some(r=>southAxisTrafficRoads.has(r.id)));
    this.waterPolygons.clear();this.cells.clear();this.railCells.clear();this.paths=[];this.drivingPaths=[];this.roofs=[];this.bridges=[];const seen=new Set<string>(),seenRoads=new Set<string>();
    const insert=(p:Point[][])=>{
      const xs=p[0].map(v=>v[0]),zs=p[0].map(v=>v[1]);
      for(let x=Math.floor(Math.min(...xs)/80);x<=Math.floor(Math.max(...xs)/80);x++)for(let z=Math.floor(Math.min(...zs)/80);z<=Math.floor(Math.max(...zs)/80);z++){
        const key=x+','+z,list=this.cells.get(key)??[];list.push(p);this.cells.set(key,list);
      }
    };
    for(const detail of activeStreetDetails(data))if(detail.p)insert(detail.p);
    const furniture=createStreetLayout(data);
    for(const p of furniture.benches)insert([[[-1,-1],[1,-1],[1,1],[-1,1]].map(([x,z])=>[p.x+Math.cos(p.angle)*x*1.05+Math.sin(p.angle)*z*.35,p.z-Math.sin(p.angle)*x*1.05+Math.cos(p.angle)*z*.35] as Point)]);
    for(const p of furniture.planters)insert([Array.from({length:16},(_,i)=>[p.x+Math.cos(i*Math.PI/8)*1.4,p.z+Math.sin(i*Math.PI/8)*1.4] as Point)]);
    for(const site of activeForecourts(data))for(const bed of site.beds)insert(bed.p);
    for(const bed of createTunnelGardens(data))insert(bed.p);
    for(const d of createRoadDividers(data)){
      const a={x:d.x-d.dx*d.length/2,y:.35,z:d.z-d.dz*d.length/2},b={x:d.x+d.dx*d.length/2,y:.35,z:d.z+d.dz*d.length/2};
      for(let x=Math.floor((Math.min(a.x,b.x)-d.width/2)/80);x<=Math.floor((Math.max(a.x,b.x)+d.width/2)/80);x++)for(let z=Math.floor((Math.min(a.z,b.z)-d.width/2)/80);z<=Math.floor((Math.max(a.z,b.z)+d.width/2)/80);z++){const key=x+','+z,list=this.railCells.get(key)??[];list.push({a,b,halfWidth:d.width/2});this.railCells.set(key,list);}
    }
    for(const tile of data){
      for(const b of tile.buildings){if(seen.has(b.id)||hiddenIslandBuildings.has(b.id)||hiddenUndergroundBuildings.has(b.id))continue;seen.add(b.id);for(const footprint of b.landmark==='opera'?[operaMain,operaStudio].map(p=>[p]):[b.p]){this.roofs.push({p:footprint,h:islandBuildingHeight(b.id,southAxisBuildingHeight(b.id,b.h)),base:b.base,bounds:[Math.min(...b.p[0].map(p=>p[0])),Math.max(...b.p[0].map(p=>p[0])),Math.min(...b.p[0].map(p=>p[1])),Math.max(...b.p[0].map(p=>p[1]))]});if(b.base<2.2&&!islandWalkablePlatforms.has(b.id))insert(footprint);}}
      for(const a of tile.areas)if(a.kind==='water'){insert(a.p);this.waterPolygons.add(a.p);}
      for(const r of tile.roads){
        if(r.bridge&&isVisibleRoad(r)&&!islandRoadReplaced(r.p,r.bridge)&&!seenRoads.has(r.id)){
          seenRoads.add(r.id);const prof=bridgeRoadProfile(r,['footway','pedestrian','path','steps','cycleway'].includes(r.kind)?FOOT_TOP:ROAD_TOP);
          if(!r.id.startsWith('pearl-park/'))for(const rail of bridgeRailLayout(r,prof).rails){
            for(let x=Math.floor(Math.min(rail.a.x,rail.b.x)/80);x<=Math.floor(Math.max(rail.a.x,rail.b.x)/80);x++)for(let z=Math.floor(Math.min(rail.a.z,rail.b.z)/80);z<=Math.floor(Math.max(rail.a.z,rail.b.z)/80);z++){
              const key=x+','+z,list=this.railCells.get(key)??[];list.push(rail);this.railCells.set(key,list);
            }
          }
          const p=[...prof.p],heights=[...prof.y];
          if(heights[0]<.4&&p.length>1){const dx=p[0][0]-p[1][0],dz=p[0][1]-p[1][1],l=Math.hypot(dx,dz)||1;p.unshift([p[0][0]+dx/l*4,p[0][1]+dz/l*4]);heights.unshift(0);}
          if(heights[heights.length-1]<.4&&p.length>1){const a=p[p.length-1],b=p[p.length-2],dx=a[0]-b[0],dz=a[1]-b[1],l=Math.hypot(dx,dz)||1;p.push([a[0]+dx/l*4,a[1]+dz/l*4]);heights.push(0);}
          this.bridges.push({p,heights,w:r.w,minX:Math.min(...p.map(q=>q[0]))-r.w,maxX:Math.max(...p.map(q=>q[0]))+r.w,minZ:Math.min(...p.map(q=>q[1]))-r.w,maxZ:Math.max(...p.map(q=>q[1]))+r.w});
        }
        if(tunnelRoutes.has(r.id))this.drivingPaths.push(r.p);
        if((isGroundRoad(r)||(r.bridge&&isVisibleRoad(r)))&&/^(trunk|primary|secondary|tertiary|residential|unclassified|living_street|service)(_link)?$/.test(r.kind))this.drivingPaths.push(...(r.bridge?[r.p]:groundRoadPaths(r)));
        if(['footway','pedestrian','path','steps'].includes(r.kind)&&(isGroundRoad(r)||r.bridge))this.paths.push(...groundRoadPaths(r));
      }
    }
  }
  canStand(x:number,z:number,radius=.45,referenceHeight?:number) {
    if(x < -1660||(x > 1500&&!inPearlPark(x,z)&&!parkEastAccess(x,z))||z < -1500||z > 1760)return false;
    if(this.vehicleBlocked(x,z,referenceHeight??this.groundHeight(x,z)))return false;
    if(this.railContact(x,z,radius,referenceHeight??this.groundHeight(x,z)))return false;
    if(isHaixinshaSeating(x,z))return false;
    const passage=this.southAxisActive&&referenceHeight!==undefined?southAxisPassage(x,z,referenceHeight,radius):undefined;
    if(this.tunnelPassage(x,z,referenceHeight??.35,radius))return true;
    if(passage)return true;
    if(this.tunnelsActive&&inTunnelExcavation(x,z)&&this.bridgeDeckHeight(x,z,referenceHeight)===undefined)return false;
    if(stoneBlocks(x,z,radius))return false;
    if(referenceHeight!==undefined&&referenceHeight<-.6&&!insidePolygon(x,z,[operaEntry]))return false;
    if(this.southAxisActive&&southAxisBlocked(x,z,radius)&&this.bridgeDeckHeight(x,z,referenceHeight)===undefined)return false;
    const polygons=new Set<Point[][]>();
    for(let dx=-1;dx<=1;dx++)for(let dz=-1;dz<=1;dz++)for(const p of this.cells.get((Math.floor(x/80)+dx)+','+(Math.floor(z/80)+dz))??[])polygons.add(p);
    for(const p of polygons){
      if(this.waterPolygons.has(p)&&(islandBridgeHeight(x,z)!==undefined||pearlParkDeckHeight(x,z)!==undefined||this.bridgeDeckHeight(x,z,referenceHeight)!==undefined))continue;
      if(this.southAxisActive&&this.waterPolygons.has(p)&&southAxisHeight(x,z)!==undefined)continue;
      if(insidePolygon(x,z,p)||nearEdges(x,z,p,radius))return false;
    }
    return true;
  }
  spawn(preferred:Point,radius=.45,driving=false):Point {
    if((islandBridgeHeight(...preferred)!==undefined||this.southAxisActive&&southAxisHeight(...preferred)!==undefined)&&this.canStand(...preferred,radius))return preferred;
    let best:Point|undefined,distance=Infinity;
    for(const path of driving?this.drivingPaths:this.paths)for(let i=1;i<path.length;i++){
      const a=path[i-1],b=path[i],dx=b[0]-a[0],dz=b[1]-a[1],len=dx*dx+dz*dz;
      const t=len?Math.max(0,Math.min(1,((preferred[0]-a[0])*dx+(preferred[1]-a[1])*dz)/len)):0;
      const p:Point=[a[0]+t*dx,a[1]+t*dz],d=Math.hypot(p[0]-preferred[0],p[1]-preferred[1]);
      if(d<distance&&this.canStand(...p,radius)){best=p;distance=d;}
    }
    if(best&&distance<150)return best;
    for(let r=0;r<=4000;r+=5)for(let angle=0;angle<Math.PI*2;angle+=Math.PI/12){
      const p:Point=[preferred[0]+Math.cos(angle)*r,preferred[1]+Math.sin(angle)*r];if(this.canStand(...p,radius))return p;
    }
    return best??preferred;
  }
  move(from:Point,dx:number,dz:number,referenceHeight?:number,radius=.45):Point {
    let [x,z]=from;const steps=Math.max(1,Math.ceil(Math.hypot(dx,dz)/.35));
    for(let i=0;i<steps;i++){
      const nextX=x+dx/steps,nextZ=z+dz/steps;
      if(this.canStand(nextX,nextZ,radius,referenceHeight)){x=nextX;z=nextZ;}
      else{
        const rail=this.railContact(nextX,nextZ,radius,referenceHeight??this.groundHeight(x,z));
        if(rail&&rail.distance>1e-6){
          const padding=rail.padding+.005,slideX=rail.x+(nextX-rail.x)*padding/rail.distance,slideZ=rail.z+(nextZ-rail.z)*padding/rail.distance;
          if(this.canStand(slideX,slideZ,radius,referenceHeight)){x=slideX;z=slideZ;if(referenceHeight!==undefined)referenceHeight=this.groundHeight(x,z,referenceHeight);continue;}
        }
        // Resolve against the tunnel wall normal, rather than the world X/Z axes.
        // A small heading error must slide along the wall instead of killing bicycle momentum.
        const current=referenceHeight!==undefined?(this.tunnelPassage(x,z,referenceHeight,radius)??(this.southAxisActive?southAxisPassage(x,z,referenceHeight,radius):undefined)):undefined;
        const edge=current?.tunnel?(this.tunnelPassage(nextX,nextZ,referenceHeight!,0)??(this.southAxisActive?southAxisPassage(nextX,nextZ,referenceHeight!,0):undefined)):undefined;
        const width=edge?edge.width/2-this.tunnelPadding(nextX,nextZ,edge,radius)-.005:0;
        const slide=edge&&edge.distance>width?[edge.x+(nextX-edge.x)*width/edge.distance,edge.z+(nextZ-edge.z)*width/edge.distance]:undefined;
        if(edge?.tunnel&&slide&&this.canStand(slide[0],slide[1],radius,referenceHeight)){x=slide[0];z=slide[1];}
        else{
          if(this.canStand(nextX,z,radius,referenceHeight))x=nextX;
          if(this.canStand(x,nextZ,radius,referenceHeight))z=nextZ;
        }
      }
      if(referenceHeight!==undefined)referenceHeight=this.groundHeight(x,z,referenceHeight);
    }
    return [x,z];
  }
}
