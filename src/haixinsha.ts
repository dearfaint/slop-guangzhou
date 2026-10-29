import {Group,Mesh,BoxGeometry,PlaneGeometry,CylinderGeometry,SphereGeometry,CircleGeometry,TorusGeometry,BufferGeometry,Float32BufferAttribute,MeshStandardMaterial,MeshStandardNodeMaterial,Vector3,Quaternion,Color,DoubleSide,type Material} from 'three/webgpu';
import {color} from 'three/tsl';
import {cityNight} from './lighting-state.ts';
import {mergeGeometries} from 'three/addons/utils/BufferGeometryUtils.js';
import {haixinshaData as data,type IslandBuilding} from './haixinsha-data.ts';
import {detailPolygon,detailRibbon} from './south-axis.ts';
import {performanceApron,seatPoint,canopyPoint,sailMasts,westBridgeApproach} from './haixinsha-site.ts';
import {inPolygon,nearestPath} from './south-axis-layout.ts';
import {haixinDeckHeight,bridge3Height,bridge4Height,bridge5Height} from './haixinsha-layout.ts';
import {addMarina} from './haixinsha-marina.ts';
import {palette} from './materials.ts';
import {SlopTrees} from './slop-trees.ts';
import type {Point} from './types.ts';
// Clip the mapped outline into short bands before raising it. Long planar triangles
// cannot reproduce the smooth arch used by collision and vehicle routing.
export function curvedBridgeDeck(rings:Point[][],height:(z:number,x?:number)=>number,grid=false){
 const clip=(ring:Point[],bound:number,keepAbove:boolean,axis=1)=>{
  const out:Point[]=[];for(let i=0;i<ring.length;i++){
   const a=ring[i],b=ring[(i+1)%ring.length],inside=(p:Point)=>keepAbove?p[axis]>=bound:p[axis]<=bound;
   if(inside(a))out.push(a);
   if(inside(a)!==inside(b)){const t=(bound-a[axis])/(b[axis]-a[axis]);out.push([a[0]+(b[0]-a[0])*t,a[1]+(b[1]-a[1])*t]);}
  }return out;
 };
 const parts:BufferGeometry[]=[],z0=Math.min(...rings[0].map(p=>p[1])),z1=Math.max(...rings[0].map(p=>p[1]));
 for(let z=z0;z<z1;z+=2.5){
  const ring=clip(clip(rings[0],z,true),Math.min(z1,z+2.5),false);if(ring.length<3)continue;
  if(!grid){parts.push(detailPolygon([ring],height));continue;}
  const x0=Math.min(...ring.map(p=>p[0])),x1=Math.max(...ring.map(p=>p[0]));
  for(let x=x0;x<x1;x+=2.5){const cell=clip(clip(ring,x,true,0),Math.min(x1,x+2.5),false,0);if(cell.length>=3)parts.push(detailPolygon([cell],height));}
 }
 const result=mergeGeometries(parts,false)!;for(const p of parts)p.dispose();return result;
}
const sampleEdge=(p:Point[],step=2.5):Point[]=>p.flatMap((b,i)=>{if(!i)return [b];const a=p[i-1],n=Math.max(1,Math.ceil(Math.hypot(b[0]-a[0],b[1]-a[1])/step));return Array.from({length:n},(_,j)=>[a[0]+(b[0]-a[0])*(j+1)/n,a[1]+(b[1]-a[1])*(j+1)/n] as Point);});
// Footprints follow the source map; floors, railings and canopy sections are photo-based estimates.
export class Haixinsha {
 readonly root=new Group();
 private trees!:SlopTrees;
 constructor(){
  this.root.name='海心沙 · 看台与帆塔 · 东区建筑 · 真实桥位';this.root.userData.source=data.source;
  const batches=new Map<Material,BufferGeometry[]>();
  const mat=(color:string|Color)=>new MeshStandardMaterial({color,roughness:.75,side:DoubleSide});
  const stone=mat('#dad4c5'),white=mat('#eeede5'),glass=mat('#3f7fa8'),wood=mat('#79685b'),green=mat('#68825b');
  const bridgeLight=new MeshStandardNodeMaterial({color:'#eeede5',roughness:.75});
  bridgeLight.emissiveNode=color('#ffd59a').mul(cityNight).mul(.75);
  const add=(g:BufferGeometry,m:Material)=>{const list=batches.get(m)??[];list.push(g);batches.set(m,list);};
  const box=(x:number,y:number,z:number,w:number,h:number,d:number,m:Material)=>add(new BoxGeometry(w,h,d).translate(x,y+h/2,z),m);
  const beam=(a:Vector3,b:Vector3,r:number,m:Material,rectangular=false,openEnds=false)=>{
   const delta=b.clone().sub(a);if(delta.length()<.01)return;
   const g=rectangular?new BoxGeometry(r*2,delta.length(),r*2):new CylinderGeometry(r,r,delta.length(),6);
   // Adjacent handrail pieces share ends; omit the hidden local Y caps.
   if(rectangular&&openEnds){const index=Array.from(g.index!.array);g.setIndex([...index.slice(0,12),...index.slice(24)]);g.clearGroups();}
   add(g.applyQuaternion(new Quaternion().setFromUnitVectors(new Vector3(0,1,0),delta.normalize())).translate(...a.clone().add(b).multiplyScalar(.5).toArray()),m);
  };
  const edge=(p:Point[],y:(z:number)=>number,rectangular=false)=>{
   for(let i=1;i<p.length;i++){
    const a=p[i-1],b=p[i],length=Math.hypot(b[0]-a[0],b[1]-a[1]);
    for(let d=0;d<length;d+=3){const t=d/length,x=a[0]+(b[0]-a[0])*t,z=a[1]+(b[1]-a[1])*t;beam(new Vector3(x,y(z),z),new Vector3(x,y(z)+1.15,z),.045,white,rectangular);}
    beam(new Vector3(a[0],y(a[1])+1.15,a[1]),new Vector3(b[0],y(b[1])+1.15,b[1]),.07,white,rectangular);
   }
  };
  const fascia=(ring:Point[],height:(z:number)=>number)=>{
   const v:number[]=[];for(let i=1;i<ring.length;i++){const a=ring[i-1],b=ring[i],ay=height(a[1]),by=height(b[1]);v.push(a[0],ay-.65,a[1],b[0],by-.65,b[1],b[0],by,b[1],a[0],ay-.65,a[1],b[0],by,b[1],a[0],ay,a[1]);}
   const g=new BufferGeometry();g.setAttribute('position',new Float32BufferAttribute(v,3));g.computeVertexNormals();add(g,stone);
  };
  const walls=(b:IslandBuilding)=>{
   // Facade detail follows each actual segment, including rotated and L-shaped blocks.
   for(const ring of b.p)for(let i=1;i<ring.length;i++){
    const a=ring[i-1],c=ring[i],dx=c[0]-a[0],dz=c[1]-a[1],length=Math.hypot(dx,dz);if(length<2)continue;
    for(let y=3;y<b.h;y+=3)for(let d=2;d<length-1;d+=3){const t=d/length;
     add(new PlaneGeometry(1.8,1.5).rotateY(-Math.atan2(dz,dx)).translate(a[0]+dx*t,y-.75,a[1]+dz*t),glass);
    }
    beam(new Vector3(a[0],b.h+.3,a[1]),new Vector3(c[0],b.h+.3,c[1]),.22,white);
   }
  };
  for(const b of data.buildings){
   if(b.kind==='stand')continue;
   add(detailPolygon(b.p,.45),stone);
   const floor=detailPolygon(b.p,b.h);add(floor,stone);
   for(const ring of b.p){const vertices:number[]=[];for(let i=1;i<ring.length;i++){const a=ring[i-1],c=ring[i];vertices.push(a[0],.5,a[1],c[0],.5,c[1],c[0],b.h,c[1],a[0],.5,a[1],c[0],b.h,c[1],a[0],b.h,a[1]);}const g=new BufferGeometry();g.setAttribute('position',new Float32BufferAttribute(vertices,3));g.computeVertexNormals();add(g,b.kind==='hotel'?white:stone);}
   walls(b);
   if(b.kind==='hotel')for(let y=3;y<b.h;y+=3)add(detailRibbon(b.p[0],.65,y),wood);
  }
  // The 2026 satellite image shows an open ship-shaped apron, not a central lawn: dark reflecting pools
  // over slate paving, a blue water axis and crescent stage, and red / green planting strips along both long edges.
  const apron=mat('#4b535a'),poolFloor=mat('#323d45'),waterAxis=glass,poolEdge=mat('#3c474e'),orange=mat('#d5a044'),shadow=poolEdge;poolFloor.roughness=.32;poolFloor.metalness=.2;
  const quad=(a:Vector3,b:Vector3,c:Vector3,d:Vector3,m:Material)=>{
   const g=new BufferGeometry();g.setAttribute('position',new Float32BufferAttribute([...a.toArray(),...b.toArray(),...c.toArray(),...a.toArray(),...c.toArray(),...d.toArray()],3));g.computeVertexNormals();add(g,m);
  };
  const point=(t:number,row:number,y:number)=>{const p=seatPoint(t,row);return new Vector3(p[0],y,p[1]);};
  // Three curved seating tiers follow the same fan as the canopy footprint.
  for(let row=0;row<36;row++){
   const y=5+row*.72+Math.floor(row/12)*1.8,back=(row+1)/36,front=row/36;
   for(let col=0;col<144;col++){
    const a=col/144,b=(col+1)/144;
    quad(point(a,front,y),point(b,front,y),point(b,back,y),point(a,back,y),stone);
    quad(point(a,front,y-.72),point(b,front,y-.72),point(b,front,y),point(a,front,y),shadow);
    if(col%18<2||row%12===11)continue; // radial stairs and cross-aisles
    const cushion=orange;
    quad(point(a+.0012,front+.006,y+.36),point(b-.0012,front+.006,y+.36),point(b-.0012,back-.004,y+.36),point(a+.0012,back-.004,y+.36),cushion);
    quad(point(a+.0012,back-.004,y+.35),point(b-.0012,back-.004,y+.35),point(b-.0012,back-.004,y+.9),point(a+.0012,back-.004,y+.9),cushion);
   }
  }
  // Continuous membrane canopy with repeated taut bays and an exposed cable-supported rear edge.
  for(let bay=0;bay<24;bay++)for(let along=0;along<4;along++)for(let across=0;across<8;across++){
   const a=(bay+along/4)/24,b=(bay+(along+1)/4)/24,u=across/8,v=(across+1)/8;
   quad(new Vector3(...canopyPoint(a,u)),new Vector3(...canopyPoint(b,u)),new Vector3(...canopyPoint(b,v)),new Vector3(...canopyPoint(a,v)),white);
  }
  for(let bay=0;bay<=24;bay++){
   const t=bay/24,rear=new Vector3(...canopyPoint(t,0)),front=new Vector3(...canopyPoint(t,1));
   beam(rear,front,.18,white);
   const foot=rear.clone().setY(5),mast=rear.clone().setY(62+3*Math.sin(Math.PI*t));
   beam(foot,mast,.28,white);beam(mast,front,.075,white);
   if(bay>0){const last=new Vector3(...canopyPoint((bay-1)/24,1));beam(last,front,.24,white);}
  }
  for(let i=0;i<40;i++){
   const t=i/39,a=canopyPoint(t,0),b=canopyPoint(Math.min(1,t+.018),0);
   beam(new Vector3(a[0],5,a[2]),new Vector3(b[0],42,b[2]),.22,white);
  }
  for(let col=0;col<48;col++){
   const a=new Vector3(...canopyPoint(col/48,0)),b=new Vector3(...canopyPoint((col+1)/48,0));
   quad(a.clone().setY(5),b.clone().setY(5),b.clone().setY(42),a.clone().setY(42),shadow);
  }
  for(let y=9;y<42;y+=5){const line:Point[]=Array.from({length:49},(_,i)=>{const p=canopyPoint(i/48,0);return [p[0]-.3,p[2]];});add(detailRibbon(line,1,y),white);}
  add(detailPolygon(performanceApron,.46),apron);add(detailRibbon(performanceApron[0],1,.49),poolEdge);
  // The crescent water stage lies between the audience and the four sail masts.
  const crescent:Point[][]=[[
   ...Array.from({length:49},(_,i)=>seatPoint(i/48,0)),
   ...Array.from({length:49},(_,i)=>{const t=1-i/48;return [-353-15*Math.sin(Math.PI*t),475+145*t] as Point;}),seatPoint(0,0)
  ]];
  add(detailPolygon(crescent,.55),waterAxis);add(detailRibbon(crescent[0],1.3,.57),poolEdge);
  for(let i=0;i<7;i++)box(-404,.58,487+i*19,14,.13,5,white);
  for(const pool of data.pools){add(detailPolygon(pool.p,.51),poolFloor);add(detailRibbon(pool.p[0],1.2,.54),poolEdge);}
  // Longitudinal and diagonal paving strips converge toward the eastern bow.
  // Reuse existing batches (island draw-call budget): dark bands use poolEdge, planting orange/green.
  const ink=poolEdge,waterCore=white,bloom=orange,shrub=green;
  for(const side of [-1,1]){
   add(detailRibbon([[-350,548+side*13],[-245,548+side*28],[-95,548]],5,.58),ink);
   add(detailRibbon([[-350,548+side*63],[-235,548+side*52],[-80,548]],3,.59),ink);
  }
  add(detailRibbon([[-365,548],[-80,548]],8,.6),waterAxis);
  add(detailRibbon([[-350,548],[-85,548]],2.2,.62),waterCore);
  // Planting strips just inside the long north and south edges of the bow.
  const bowEdge=performanceApron[0].filter(p=>p[0]>-330);
  const [north,south]=[bowEdge.filter(p=>p[1]<548),bowEdge.filter(p=>p[1]>=548)].map(run=>run.sort((a,b)=>a[0]-b[0]));
  for(const run of [north,south])if(run.length>1)for(const [offset,width,material] of [[3.2,2.6,bloom],[6.4,2.6,shrub],[9.4,1.8,bloom]] as [number,number,Material][]){
   const toward=run===north?1:-1,inner=run.map(p=>[p[0],p[1]+toward*offset] as Point);add(detailRibbon(inner,width,.6),material);
  }
  // Daytime photographs show exposed lattice frames and folded screens, not triangular cloth sails.
  for(const [x,z] of sailMasts){
   for(const dx of [-4,4])for(const dz of [-1.6,1.6]){
    beam(new Vector3(x+dx,1,z+dz),new Vector3(x+dx,76,z+dz),.22,white);
    for(let y=2;y<73;y+=4){beam(new Vector3(x+dx,y,z+dz),new Vector3(x-dx,y+4,z+dz),.07,white);}
   }
   for(let y=2;y<76;y+=4)beam(new Vector3(x-4,y,z-1.6),new Vector3(x+4,y,z+1.6),.08,white);
   for(let fold=0;fold<7;fold++)box(x+4,5+fold*1.35,z,5,.8,25,poolEdge);
   box(x,0,z,15,1,10,stone);
   // Low access stairs, open outriggers and service cases seen around the folded screen bases.
   for(let step=0;step<5;step++)box(x+10+step*.75,.5,z,1.0,.12*(5-step),4,stone);
   for(const side of [-1,1]){beam(new Vector3(x,18,z),new Vector3(x+10,9,z+side*9),.12,white);beam(new Vector3(x+10,9,z+side*9),new Vector3(x,1,z+side*5),.10,white);}
   box(x+16,.46,z-7,2.4,1.7,1.7,poolEdge);box(x+16,.46,z+7,2.4,1.7,1.7,poolEdge);

  }
  // Two freestanding floodlight lattice towers visible at the ends of the seating bowl.
  for(const z of [465,624]){
   const x=-425;
   for(const side of [-1,1]){beam(new Vector3(x+side*1.1,.5,z),new Vector3(x+side*.6,28,z),.12,white);for(let y=1;y<27;y+=3)beam(new Vector3(x+side, y,z),new Vector3(x-side,y+3,z),.05,white);}
   for(let row=0;row<4;row++)for(let col=0;col<3;col++)box(x-1.2+col*1.2,26+row*.85,z,1,.62,.45,white);
  }
  // Backstage platform retains the mapped voids and low profile behind the grandstand.
  const platform=data.buildings.find(b=>b.kind==='stand'&&!b.id.includes('ac999b62'));
  if(platform){add(detailPolygon(platform.p,5),stone);fascia(platform.p[0],()=>5);for(const hole of platform.p.slice(1)){add(detailPolygon([hole],5.14),green);add(detailRibbon(hole,.6,5.18),white);}}
  addMarina(add,{white,wood,glass,stone,orange,green,dark:mat('#28343a')});
  for(const [x,z] of [[-40,641]]){box(x,.4,z,25,.7,8,wood);edge([[x-12,z+4],[x+12,z+4]],()=>1.1);}
  // Streamlined white flower boats are visible on Bridge 3 in the satellite view and SCUT photographs.
  const bridge3=data.bridges.find(b=>b.id===858784087)!;
  for(const [cx,cz,length,width] of [[-648,383,29,6],[-615,426,32,6],[-635,444,23,5]]){
   const leaf:Point[]=[];
   for(const side of [1,-1])for(let i=0;i<=24;i++){
    const t=side===1?i/24:1-i/24,z=cz+(t-.5)*length;
    leaf.push([cx+(t-.5)*length*.23+side*Math.pow(Math.sin(Math.PI*t),.8)*width/2,z]);
   }
   leaf.push(leaf[0]);
   if(leaf.every(p=>inPolygon(...p,bridge3.p))){
    add(detailPolygon([leaf],5.65),green);add(detailRibbon(leaf,.7,5.68),white);fascia(leaf,()=>5.65);
    for(let i=1;i<6;i++){const t=i/6;add(new SphereGeometry(.5,5,3).translate(cx+(t-.5)*length*.23,5.9,cz+(t-.5)*length),orange);}
   }
  }
  // Dark and light flowing pavement strokes, following the curved centre of Bridge 3.
  for(const offset of [-11,0,10]){
   const line:Point[]=Array.from({length:33},(_,i)=>{const t=i/32;return [-649+42*t+offset+3*Math.sin(t*Math.PI*2),363+96*t];});
   const inside=line.filter(p=>inPolygon(...p,bridge3.p));if(inside.length>1)add(detailRibbon(inside,1.3,5.035),white);
  }
  // Mature east-district grove and shoreline crowns replace the former uniform park grid.
  const trees:Point[]=[];
  for(let x=-30;x<266;x+=12)for(let z=482;z<630;z+=12){
   const px=x+3*Math.sin(x+z),pz=z+3*Math.cos(x-z);
   if(!inPolygon(px,pz,data.island)||data.buildings.some(b=>inPolygon(px,pz,b.p)))continue;
   if(z>535&&z<553||x>220&&z>563&&z<600)continue;
   trees.push([px,pz]);
  }
  for(let x=-515;x<0;x+=13)for(const side of [-1,1]){
   const z=side===-1?449+(x+515)*.045:648-(x+515)*.035;
   if(inPolygon(x,z,data.island)&&!data.buildings.some(b=>inPolygon(x,z,b.p)))trees.push([x,z]);
  }
  const islandTrees=new SlopTrees(trees.map(([x,z],i)=>({x,z,height:8.5+(i%5)*.9})));
  this.trees=islandTrees;this.root.add(islandTrees.root);
  // Circular plaza west of the stand, visible beside the current experience centre.
  for(const [r,y] of [[18,1],[13,1.15],[8,1.3]]){
   add(new CircleGeometry(r,64).rotateX(-Math.PI/2).translate(-683,y,530),stone);
   add(new TorusGeometry(r,.4,5,64).rotateX(Math.PI/2).translate(-683,y+.05,530),wood);
  }
  const asphalt=mat(palette.road);
  const bridgeRoad=sampleEdge([[-688.697,636.113],[-682.821,633.798],[-675.685,629.078],[-666.471,621.252],[-659.058,613.337],[-653.13,604.398],[-650.131,598.532],[-645.647,585.663],[-645.728,580.587]]);
  const footBridge=sampleEdge([[-654.267,666.492],[-645.667,656.418],[-645.094,655.739],[-635.859,643.338],[-629.931,635.078],[-623.082,623.077],[-612.957,603.140],[-611.237,598.554]]);
  for(const bridge of data.bridges){
   const hFn=bridge.id===858784087?bridge3Height:bridge.id===1372988681?bridge4Height:bridge.id===1372988682?bridge5Height:()=>bridge.h;
   const curved=bridge.id===1372988681||bridge.id===1372988682,deckMat=bridge.id===1372988681?asphalt:stone;
   const rim=curved?sampleEdge(bridge.p[0]):bridge.p[0];
   add(curved?curvedBridgeDeck(bridge.p,hFn):detailPolygon(bridge.p,hFn),deckMat);fascia(rim,hFn);add(detailRibbon(rim,.45,rim.map(p=>hFn(p[1])-.4)),white);
   // End faces are open at the banks; rails follow the long mapped waterside edges.
   const ring=bridge.p[0];for(let i=1;i<ring.length;i++){
    const a=ring[i-1],b=ring[i],dx=b[0]-a[0],dz=b[1]-a[1];let waterside=Math.abs(dz)>Math.abs(dx)*.5;
    if(curved){
     const path=bridge.id===1372988681?bridgeRoad:footBridge,mx=(a[0]+b[0])/2,mz=(a[1]+b[1])/2;let best=Infinity,tangent:Point=[0,1];
     for(let j=1;j<path.length;j++){const distance=nearestPath(mx,mz,[path[j-1],path[j]]).distance;if(distance<best){best=distance;tangent=[path[j][0]-path[j-1][0],path[j][1]-path[j-1][1]];}}
     waterside=Math.abs(dx*tangent[0]+dz*tangent[1])>.7*Math.hypot(dx,dz)*Math.hypot(...tangent);
     if([path[0],path.at(-1)!].some(p=>Math.min(Math.hypot(p[0]-a[0],p[1]-a[1]),Math.hypot(p[0]-b[0],p[1]-b[1]))<.2))waterside=false;
    }
    if(waterside)edge(curved?sampleEdge([a,b]):[a,b],hFn,curved);
   }
  }
  const approach=sampleEdge(westBridgeApproach,4);
  add(detailRibbon(approach,7.5,.365),asphalt);
  add(detailRibbon([[-645.728,580.587],[-645.708,574.075]],7.5,.365),asphalt);
  for(const side of [-1,1]){add(detailRibbon(approach,1.8,.43,side*5.05),stone);add(detailRibbon(approach,.22,.46,side*3.9),white);}

  for(const offset of [-2.5,0,2.5]){
   const roadDeck=detailRibbon(bridgeRoad,2.5,0,offset),roadPositions=roadDeck.getAttribute('position');
   for(let i=0;i<roadPositions.count;i++)roadPositions.setY(i,bridge4Height(roadPositions.getZ(i))+.015);
   roadDeck.computeVertexNormals();add(roadDeck,asphalt);
  }
  add(detailRibbon(bridgeRoad,.13,bridgeRoad.map(p=>bridge4Height(p[1])+.025)),orange);
  for(const side of [-1,1])add(detailRibbon(bridgeRoad,.12,bridgeRoad.map(p=>bridge4Height(p[1])+.026),side*2.8),white);
  // Sculptural concrete piers supporting the canal bridges above water:
  for(const [x,z,hFn,spanW] of [[-630,410,bridge3Height,18]] as const){
   const yTop=hFn(z);for(const side of [-1,1])add(new CylinderGeometry(.55,.65,yTop,8).translate(x+side*spanW/2,yTop/2,z),white);
  }
  // Short supports sit under the curved deck centre lines rather than at guessed river coordinates.

  for(const [path,hFn] of [[bridgeRoad,bridge4Height],[footBridge,bridge5Height]] as const)for(const fraction of [.35,.65]){
   const i=Math.round((path.length-1)*fraction),p=path[i],a=path[Math.max(0,i-1)],b=path[Math.min(path.length-1,i+1)],dx=b[0]-a[0],dz=b[1]-a[1],length=Math.hypot(dx,dz),top=hFn(p[1])-.35;
   for(const side of [-1,1])add(new CylinderGeometry(.40,.5,top+.6,8).translate(p[0]-dz/length*side*2.7,(top-.6)/2,p[1]+dx/length*side*2.7),white);
  }
  // Sample the deck and its exposed union boundary; internal branch seams and
  // the four bank entries must not acquire crosswise railings.
  const haixinPolygons=[data.haixin.p,...(data.haixin.branches??[])];
  const entries:Point[]=[[-742.559,733.384],[-908.47,786.46],[-828.21,1034.35],[-657.707,1008.733]];
  const haixinFascia:number[]=[];
  const covered=(x:number,z:number)=>haixinPolygons.some(p=>inPolygon(x,z,p));
  for(const polygon of haixinPolygons){
   add(curvedBridgeDeck(polygon,haixinDeckHeight,true),wood);
   const rim=sampleEdge(polygon[0],4);
   for(let i=1;i<rim.length;i++){
    const a=rim[i-1],b=rim[i],dx=b[0]-a[0],dz=b[1]-a[1],length=Math.hypot(dx,dz);if(length<.01)continue;
    const x=(a[0]+b[0])/2,z=(a[1]+b[1])/2;
    if(covered(x-dz/length*.1,z+dx/length*.1)&&covered(x+dz/length*.1,z-dx/length*.1))continue;
    const ay=haixinDeckHeight(a[1],a[0]),by=haixinDeckHeight(b[1],b[0]);
    haixinFascia.push(a[0],ay,a[1],a[0],ay-.6,a[1],b[0],by,b[1],a[0],ay-.6,a[1],b[0],by-.6,b[1],b[0],by,b[1]);
    if(entries.some(p=>Math.hypot(p[0]-x,p[1]-z)<8.8))continue;
    for(const h of [.55,1.15])beam(new Vector3(a[0],ay+h,a[1]),new Vector3(b[0],by+h,b[1]),.045,h>1?bridgeLight:white,true,true);
    beam(new Vector3(a[0],ay,a[1]),new Vector3(a[0],ay+1.15,a[1]),.045,white,true,true);
   }
  }
  const fasciaGeometry=new BufferGeometry();fasciaGeometry.setAttribute('position',new Float32BufferAttribute(haixinFascia,3));fasciaGeometry.computeVertexNormals();add(fasciaGeometry,stone);
  // Abutments at the arch springs, outside the clear navigation span.
  for(const [x,z] of [[-872,815],[-830,1008.5]])box(x,-.6,z,3.8,2.6,5,stone);
  // Main arch: 198 m span, 56 m rise, 10 degrees eastward lean (SCUT / Hunan University).
  const arch=(t:number)=>{const rise=56*4*t*(1-t);return new Vector3(-872+42*t+rise*Math.tan(Math.PI/18),2+rise,815+193.5*t);};
  for(let i=0;i<48;i++)beam(arch(i/48),arch((i+1)/48),.8,bridgeLight);
  for(let i=2;i<31;i++){const t=i/32,a=arch(t),z=a.z;
   const path=data.haixin.path;
   const segment=path.findIndex((p,i)=>i>0&&path[i-1][1]<=z&&p[1]>=z);
   if(segment>0){const p=path[segment-1],q=path[segment],t=(z-p[1])/(q[1]-p[1]),x=p[0]+(q[0]-p[0])*t;beam(a,new Vector3(x,haixinDeckHeight(z,x),z),.085,bridgeLight);}
  }
  // Low garden strips around the east district, without inventing additional buildings.
  for(const z of [488,618])add(detailRibbon([[15,z],[220,z-6]],2,.3),green);
  for(const [material,parts] of batches){const flat=parts.map(g=>{g.deleteAttribute('uv');return g.index?g.toNonIndexed():g;});const geometry=mergeGeometries(flat,false)!;for(const g of new Set([...parts,...flat]))g.dispose();const mesh=new Mesh(geometry,material);mesh.castShadow=true;mesh.receiveShadow=true;mesh.layers.enable(1);this.root.add(mesh);}
 }
 update(camera:Vector3){this.trees.update(camera);}
 dispose(){this.trees.root.removeFromParent();this.trees.dispose();this.root.traverse(object=>{if(object instanceof Mesh){object.geometry.dispose();for(const material of Array.isArray(object.material)?object.material:[object.material])material.dispose();}});this.root.clear();}
}
