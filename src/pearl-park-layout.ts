import { pearlParkData as d } from './pearl-park-data.ts';
import { bridgeRoadProfile } from './road-level.ts';
import type { Point, Road, TileData, Building } from './types.ts';
export const parkHiddenBuildings=new Set(d.hiddenBuildings),parkRoadIds=new Set(d.roadIds);
const cuts=new Map(d.cuts.map(c=>[JSON.stringify(c.source),c.outside]));
export const parkAreaSurfaces=(p:Point[][])=>cuts.get(JSON.stringify(p));
export const parkRoadReplaced=(id:string)=>parkRoadIds.has(id.replace(/\/\d+$/,''));
export function inParkRing(x:number,z:number,r:Point[]){let inside=false;for(let i=0,j=r.length-1;i<r.length;j=i++){const a=r[i],b=r[j];if((a[1]>z)!==(b[1]>z)&&x<(b[0]-a[0])*(z-a[1])/(b[1]-a[1])+a[0])inside=!inside;}return inside;}
const bounds=[Math.min(...d.boundary[0].map(p=>p[0]))-4,Math.max(...d.boundary[0].map(p=>p[0]))+4,Math.min(...d.boundary[0].map(p=>p[1]))-4,Math.max(...d.boundary[0].map(p=>p[1]))+4];
export const inPearlPark=(x:number,z:number)=>x>=bounds[0]&&x<=bounds[1]&&z>=bounds[2]&&z<=bounds[3]&&(inParkRing(x,z,d.boundary[0])||d.boundary[0].some((a,i)=>{const b=d.boundary[0][(i+1)%d.boundary[0].length],dx=b[0]-a[0],dz=b[1]-a[1],t=Math.max(0,Math.min(1,((x-a[0])*dx+(z-a[1])*dz)/(dx*dx+dz*dz||1)));return Math.hypot(x-a[0]-t*dx,z-a[1]-t*dz)<4;}));
// The northern hill is a visual estimate around the plan's Baozhu pavilion, not a DEM.
export function parkEastAccess(x:number,z:number){return x<=1655&&d.roads.some(r=>r.id.startsWith('pearl-park/edge/')&&r.p.some((a,i)=>{if(!i)return false;const b=r.p[i-1],dx=b[0]-a[0],dz=b[1]-a[1],t=Math.max(0,Math.min(1,((x-a[0])*dx+(z-a[1])*dz)/(dx*dx+dz*dz||1)));return Math.hypot(x-a[0]-dx*t,z-a[1]-dz*t)<r.w/2+2;}));}
const creek=d.waters.find(w=>w.id==='reviewed-plan/northern-creek')!.p[0];
export function pearlParkFloor(x:number,z:number){
 if(!inPearlPark(x,z))return undefined;const q=((x-1205)/85)**2+((z+531)/72)**2,hill=q<1?7*(1-q)**2:0;
 if(x<1180||x>1290||z> -460)return hill;
 let distance=Infinity;for(let i=1;i<creek.length;i++){const a=creek[i-1],b=creek[i],dx=b[0]-a[0],dz=b[1]-a[1],t=Math.max(0,Math.min(1,((x-a[0])*dx+(z-a[1])*dz)/(dx*dx+dz*dz||1)));distance=Math.min(distance,Math.hypot(x-a[0]-dx*t,z-a[1]-dz*t));}
 const t=inParkRing(x,z,creek)?0:Math.max(0,Math.min(1,(distance-2)/16)),blend=t*t*(3-2*t),grade=Math.max(0,Math.min(4,(-z-460)/36));
 return hill*blend+grade*(1-blend);
}
export function parkRoadProfile(r:Road){
 const profile=bridgeRoadProfile({...r,bridge:true},.28);
 return {p:profile.p,y:profile.p.map((p,i)=>(pearlParkFloor(...p)??0)+(r.bridge?profile.y[i]:.28))};
}
export const parkBridges=d.roads.filter(r=>r.bridge).map(r=>({...r,...parkRoadProfile(r)}));
export function pearlParkDeckHeight(x:number,z:number){
 if(x<bounds[0]-40||x>bounds[1]+40||z<bounds[2]-40||z>bounds[3]+40)return undefined;
 for(const b of parkBridges)for(let i=1;i<b.p.length;i++){const a=b.p[i-1],c=b.p[i],dx=c[0]-a[0],dz=c[1]-a[1],t=Math.max(0,Math.min(1,((x-a[0])*dx+(z-a[1])*dz)/(dx*dx+dz*dz||1)));if(Math.hypot(x-a[0]-t*dx,z-a[1]-t*dz)<=b.w/2+.15)return b.y[i-1]+t*(b.y[i]-b.y[i-1]);}
 return undefined;
}
export function parkBuildingFrame(b:typeof d.buildings[number]){
 const r=b.p[0],n=r.length-1,c:Point=[r.slice(0,n).reduce((v,p)=>v+p[0],0)/n,r.slice(0,n).reduce((v,p)=>v+p[1],0)/n];
 let a=r[0],e=r[1],len=0;for(let i=1;i<r.length;i++){const l=Math.hypot(r[i][0]-r[i-1][0],r[i][1]-r[i-1][1]);if(l>len){len=l;a=r[i-1];e=r[i];}}
 return {x:c[0],z:c[1],y:pearlParkFloor(...c)??0,angle:Math.atan2(e[1]-a[1],e[0]-a[0]),length:len};
}
const buildings:Building[]=d.buildings.map(b=>{const frame=parkBuildingFrame(b),open=['pavilion','yutang','stage'].includes(b.style);return {id:'pearl-park/'+b.id,p:b.p,h:frame.y+b.h,base:open?frame.y+b.h-.65:0,hs:'estimate:park-profile',source:b.id,name:b.name,kind:open?'shelter':'park-service'};});
export const parkTile:TileData={buildings,roads:d.roads,areas:d.waters.map(w=>({kind:'water',p:w.p,name:w.name}))};
export function withPearlPark(data:TileData[]):TileData[]{return [...data.map(t=>({...t,buildings:t.buildings.filter(b=>!parkHiddenBuildings.has(b.id)),roads:t.roads.filter(r=>!parkRoadReplaced(r.id))})),parkTile];}
export const parkPlaces=[
 {name:'珠江公园 · 兴盛门',en:'ZHUJIANG PARK',lon:113.3303624,lat:23.1229635,h:5,description:'园路、猎德涌与西区草坪',lookAt:[1000,-430]},
 {name:'珠江公园 · 快绿湖',en:'KUAILU LAKE',lon:113.33452,lat:23.12256,h:5,description:'湖滨步道与跨水桥',lookAt:[1205,-422]},
 {name:'珠江公园 · 玉堂春晓',en:'YUTANG CHUNXIAO',lon:113.33257,lat:23.12220,h:5,description:'青瓦白柱亭廊与木兰园',lookAt:[1064,-354]},
 {name:'珠江公园 · 湾区书屋',en:'BAY AREA BOOKHOUSE',lon:113.33585,lat:23.12276,h:5,description:'湖东书屋与林下园路',lookAt:[1430,-426]},
 {name:'珠江公园 · 抱珠楼',en:'BAOZHU PAVILION',lon:113.33365,lat:23.12362,h:9,description:'北部林区与双层亭楼',lookAt:[1205,-531]},
 {name:'珠江公园 · 藤本园',en:'VINE GARDEN',lon:113.33194,lat:23.12340,h:4,description:'木质廊架与荫生植物',lookAt:[1010,-504]},
 {name:'珠江公园 · 东门',en:'ZHUJIANG PARK EAST',lon:113.3377774,lat:23.1235346,h:5,description:'完整东区及入口',lookAt:[1450,-480]},
];
