import {tunnelData} from './tunnel-data.ts';
import { palette } from './materials.ts';
import {operaEntry} from './opera-layout.ts';
import {Group,Mesh,BufferGeometry,Float32BufferAttribute,Shape,Path,Vector2,ShapeGeometry,BoxGeometry,CylinderGeometry,CircleGeometry,MeshBasicMaterial,MeshStandardMaterial,MeshStandardNodeMaterial,DoubleSide,Vector3,InstancedMesh,Matrix4,Quaternion,Color,type Material} from 'three/webgpu';
import {positionWorld,fract,step,max,mix,color} from 'three/tsl';
import {mergeGeometries} from 'three/addons/utils/BufferGeometryUtils.js';
import {southAxisData as data} from './south-axis-data.ts';
import {bridgeHeight,nearestPath,mallExcavationRings,mallPlazaOuter,ellipseRing,centralMallBounds,southMallBounds,northMallBounds,westWellSpec,eastWellSpec,musicalFountainSpec,centralPromenade,northRotunda,northRotundaOpening} from './south-axis-layout.ts';
import {SlopTrees} from './slop-trees.ts';
import {tunnelInterior} from './tunnels.ts';
import {FOOT_TOP} from './road-level.ts';
import type {Point} from './types.ts';

export function detailPolygon(p:Point[][],height:number|((z:number,x:number)=>number)) {
 const shape=new Shape(p[0].map(([x,z])=>new Vector2(x,-z)));
 for(const ring of p.slice(1))shape.holes.push(new Path(ring.map(([x,z])=>new Vector2(x,-z))));
 const g=new ShapeGeometry(shape);g.rotateX(-Math.PI/2);
 const positions=g.getAttribute('position');for(let i=0;i<positions.count;i++)positions.setY(i,typeof height==='number'?height:height(positions.getZ(i),positions.getX(i)));
 g.computeVertexNormals();return g.toNonIndexed();
}
export function detailRibbon(p:Point[],width:number,heights:number[]|number,offset=0) {
 const left:number[][]=[],right:number[][]=[],v:number[]=[];
 for(let i=0;i<p.length;i++){
  const a=p[Math.max(0,i-1)],b=p[Math.min(p.length-1,i+1)],dx=b[0]-a[0],dz=b[1]-a[1],l=Math.hypot(dx,dz)||1;
  const y=typeof heights==='number'?heights:heights[i];
  left.push([p[i][0]-dz/l*(offset-width/2),y,p[i][1]+dx/l*(offset-width/2)]);
  right.push([p[i][0]-dz/l*(offset+width/2),y,p[i][1]+dx/l*(offset+width/2)]);
 }
 for(let i=1;i<p.length;i++)v.push(...left[i-1],...right[i-1],...right[i],...left[i-1],...right[i],...left[i]);
 const g=new BufferGeometry();g.setAttribute('position',new Float32BufferAttribute(v,3));g.computeVertexNormals();return g;
}
function wall(p:Point[],bottom:(x:number,z:number)=>number,top:(x:number,z:number)=>number) {
 const vertices:number[]=[];
 for(let i=1;i<p.length;i++){
  const a=p[i-1],b=p[i],al=[a[0],bottom(...a),a[1]],ah=[a[0],top(...a),a[1]],bl=[b[0],bottom(...b),b[1]],bh=[b[0],top(...b),b[1]];
  vertices.push(...al,...bl,...bh,...al,...bh,...ah);
 }
 const g=new BufferGeometry();g.setAttribute('position',new Float32BufferAttribute(vertices,3));g.computeVertexNormals();return g;
}
export function southAxisGround(){
 const outline:Point[][]=[[[-11000,-11000],[11000,-11000],[11000,11000],[-11000,11000],[-11000,-11000]],...data.trenches.map(p=>p[0]),...tunnelData.excavations.map(p=>p[0]),data.courtyard.excavation[0],...mallExcavationRings,northRotundaOpening,operaEntry];
 return detailPolygon(outline,-.2);
}
// Plaza slabs cover the tunnels; the photographed circular courtyard and mall courts remain open.
export class SouthAxis {
 readonly root=new Group();
 private materials:Material[]=[];
 private batches=new Map<Material,BufferGeometry[]>();
 private trees:SlopTrees;
 private luminous:MeshStandardMaterial;
 private lampPools:Mesh;
 private poolMaterial:MeshBasicMaterial;
 private fountainJets:InstancedMesh;
 private fountainMaterial:MeshStandardMaterial;
 private jetSpecs:{x:number;z:number;base:number;amp:number;phase:number;freq:number;radius:number}[]=[];
 private jetTemp=new Matrix4();
 constructor(){
  this.root.name='花城广场南端 · 新中轴隧道与海心沙二号桥';
  this.root.userData={source:data.source,heightSource:data.heightSource,bridgeSource:data.bridgeSource};
  const mat=(hex:string|Color,roughness=.85)=>{const m=new MeshStandardMaterial({color:hex,roughness,side:DoubleSide});this.materials.push(m);return m;};
  const paving=new MeshStandardNodeMaterial({roughness:.86,side:DoubleSide});
  const x=fract(positionWorld.x.div(1.2)),z=fract(positionWorld.z.div(.6));
  const joint=max(step(.985,x),step(.975,z));paving.colorNode=mix(color('#c9c8bd'),color('#94978e'),joint);this.materials.push(paving);
  const bridgePaving=new MeshStandardNodeMaterial({roughness:.9,side:DoubleSide});
  const bridgeJoint=max(step(.985,fract(positionWorld.x.div(1.2))),step(.97,fract(positionWorld.z.div(.6))));
  // Satellite imagery: the bridge deck is dark asphalt with terracotta bands along both curved edges.
  bridgePaving.colorNode=mix(color('#4b5054'),color('#3d4245'),bridgeJoint);this.materials.push(bridgePaving);
  const stone=mat('#b1b3aa'),asphalt=mat(palette.road,1),wallMat=mat('#a9aaa0'),recess=mat('#384240'),metal=mat('#707b78',.4),grass=mat('#6f8a50'),hedge=mat('#426c42'),brown=mat('#776056'),white=mat('#eee8d7'),yellow=mat('#d7b86c');
  this.luminous=mat('#fff0ca');this.luminous.emissive.set('#ffd89a');
  const add=(g:BufferGeometry,m:Material)=>{const parts=this.batches.get(m)??[];parts.push(g);this.batches.set(m,parts);};
  const box=(x:number,y:number,z:number,w:number,h:number,d:number,m:MeshStandardMaterial,angle=0)=>add(new BoxGeometry(w,h,d).rotateY(angle).translate(x,y,z),m);
  const post=(x:number,y:number,z:number,h:number,r=.045)=>add(new CylinderGeometry(r,r,h,6).translate(x,y+h/2,z),metal);
  const segment=(a:number[],b:number[],r:number,m:MeshStandardMaterial)=>{
   const start=new Vector3(...a),end=new Vector3(...b),delta=end.clone().sub(start),g=new CylinderGeometry(r,r,delta.length(),6);
   g.applyQuaternion(new Quaternion().setFromUnitVectors(new Vector3(0,1,0),delta.normalize()));g.translate(...start.add(end).multiplyScalar(.5).toArray());add(g,m);
  };
  const rail=(p:Point[],height:(z:number)=>number,spacing=2.1)=>{
   for(let i=1;i<p.length;i++){
    const a=p[i-1],b=p[i],length=Math.hypot(b[0]-a[0],b[1]-a[1]),steps=Math.max(1,Math.ceil(length/spacing));
    for(let j=0;j<steps;j++){const t=j/steps,x=a[0]+(b[0]-a[0])*t,z=a[1]+(b[1]-a[1])*t;post(x,height(z),z,1.08);}
    for(const h of [.48,1.06])segment([a[0],height(a[1])+h,a[1]],[b[0],height(b[1])+h,b[1]],.035,metal);
   }
  };
  add(detailPolygon(data.plaza,.42),paving);
  add(detailPolygon([...centralPromenade,northRotundaOpening],.42),paving);
  // Paving stays at street level; the twin carriageways remain under its deck.
  for(const side of [-1,1]){
   const edge=side<0?[[-323,150],[-320,79],[-315,-42]]:[[-271,150],[-268,110],[-263,34],[-262,-43]];
   add(detailRibbon(edge as Point[],.35,.45),stone);
  }
  for(let z=18;z<151;z+=18)add(detailRibbon([[-318,z],[-270,z]],.35,.438),white);
  const nr=northRotunda,northRing=(r:number)=>ellipseRing(...nr.center,r,r,96);
  add(detailPolygon([northRing(9.4)],nr.floorY+.08),grass);
  add(detailPolygon([northRing(nr.radius),northRing(9.4)],nr.floorY),asphalt);
  add(detailRibbon(northRing(9.4),.3,nr.floorY+.12),white);
  add(detailRibbon(northRing(nr.radius),.4,.47),stone);
  rail(northRing(nr.radius+.12),()=>.47,2.4);

  // The hollow circular rotunda / sunken courtyard reveals the subterranean tunnel road and passing traffic.
  const {center:[cx,cz],radius,outerRadius,depth,opening,excavation,wallEdges:courtWallEdges}=data.courtyard;
  const courtRing=(r:number):Point[]=>Array.from({length:129},(_,i)=>[cx+Math.cos(i/128*Math.PI*2)*r,cz+Math.sin(i/128*Math.PI*2)*r]);
  add(detailPolygon([courtRing(outerRadius),courtRing(radius+.6)],.47),grass);
  add(detailRibbon(courtRing(outerRadius),.35,.49),stone);add(detailRibbon(courtRing(radius+.3),.5,.5),white);
  // Excavation floor: central island garden inside the curving tunnel roadway, plus asphalt roadway apron:
  const floorY=.42-depth;
  add(detailPolygon([courtRing(9.2)],floorY),brown);
  add(detailPolygon([courtRing(outerRadius),courtRing(9.2)],floorY),asphalt);
  add(detailPolygon([courtRing(7.2)],floorY+.12),grass);
  add(detailRibbon(courtRing(7.2),.35,floorY+.15),stone);
  add(detailRibbon(courtRing(9.2),.35,floorY+.14),white);
  // Outer retaining walls around the rotunda perimeter, leaving tunnel entrances/exits completely open:
  for(const edge of courtWallEdges??[])add(wall(edge,()=>floorY,()=>.35),wallMat);
  // Plaza deck edge: fascia, glazed transparent guardrail, and perimeter colonnade; no solid walls:
  add(detailRibbon(courtRing(radius),.35,.42),white);
  const glass=mat('#b4d0cb',.25);glass.transparent=true;glass.opacity=.28;glass.depthWrite=false;
  add(wall(courtRing(radius+.12),()=>.52,()=>1.55),glass);
  rail(courtRing(radius+.12),()=>.47,2.2);
  for(let i=0;i<16;i++){
   const a=i/16*Math.PI*2,x=cx+Math.cos(a)*(radius+.35),z=cz+Math.sin(a)*(radius+.35);
   add(new CylinderGeometry(.28,.28,.35-floorY,8).translate(x,(.35+floorY)/2,z),white);
  }
  // A single palm rises from the lower central garden; its crown stays below the pedestrian deck.
  const headY=floorY+3.6;
  add(new CylinderGeometry(.23,.33,3.6,9).translate(cx,floorY+1.8,cz),brown);
  const leafVertices:number[]=[];
  for(let j=0;j<12;j++){
   const a=j*Math.PI/6;
   const leaf=(t:number,side:number)=>{const r=4.2*t,w=Math.sin(Math.PI*t)*.5*side;return [cx+Math.cos(a)*r-Math.sin(a)*w,headY+1.8*Math.sin(Math.PI*t)-.6*t,cz+Math.sin(a)*r+Math.cos(a)*w];};
   for(let k=0;k<8;k++){const t=k/8,u=(k+1)/8;leafVertices.push(...leaf(t,-1),...leaf(t,1),...leaf(u,1),...leaf(t,-1),...leaf(u,1),...leaf(u,-1));}
  }
  const leaves=new BufferGeometry();leaves.setAttribute('position',new Float32BufferAttribute(leafVertices,3));leaves.computeVertexNormals();add(leaves,hedge);
  for(const line of data.pavingLines)add(detailRibbon(line,.65,.437),white);
  // Granite borders and raised planted tongues follow the reviewed plan.
  for(const bed of data.beds){
   add(detailPolygon(bed,.61),grass);add(wall(bed[0],()=>.42,()=>.64),stone);
   add(detailRibbon(bed[0],.30,.65),stone);
  }
  const rampFloor=(x:number,z:number)=>data.ramps.map(r=>nearestPath(x,z,r.p,r.y)).sort((a,b)=>a.distance-b.distance)[0];
  const floor=(x:number,z:number)=>rampFloor(x,z).y;
  const portals=data.ramps.map(r=>r.y[0]<r.y.at(-1)!?r.p[0]:r.p.at(-1)!);
  const trenchMouths=data.ramps.map(r=>{const idx=r.y.map((y,i)=>y<.348?i:-1).filter(i=>i>=0);return r.y[0]<r.y.at(-1)!?r.p[idx.at(-1)!]:r.p[idx[0]];});
  const openings=[...portals,...trenchMouths,...data.ramps.flatMap(r=>[r.p[0],r.p.at(-1)!])];
  for(const trench of data.trenches){
   const rim=trench[0],bed:number[]=[];
   for(let i=1;i<rim.length;i++){
    const a=rim[i-1],b=rim[i],mx=(a[0]+b[0])/2,mz=(a[1]+b[1])/2;
    const na=rampFloor(...a),nb=rampFloor(...b),av=[a[0],na.y-.18,a[1]],bv=[b[0],nb.y-.18,b[1]],ai=[na.x,na.y-.18,na.z],bi=[nb.x,nb.y-.18,nb.z];
    bed.push(...av,...ai,...bi,...av,...bi,...bv);
    if(openings.some(p=>nearestPath(p[0],p[1],[a,b]).distance<4)||data.ramps.some(r=>nearestPath(mx,mz,r.p).distance<r.w/2+.05))continue;
    add(wall([a,b],(x,z)=>floor(x,z)-.3,()=>.4),wallMat);
    add(detailRibbon([a,b],.36,.47),stone);
    if(floor(mx,mz)<-.8)rail([a,b],()=>.5);
   }
   const g=new BufferGeometry();g.setAttribute('position',new Float32BufferAttribute(bed,3));g.computeVertexNormals();add(g,wallMat);
  }
  for(const ramp of data.ramps){
   // The cutting has a concrete bed, including shoulders, rather than open sky beside the asphalt.
   add(detailRibbon(ramp.p,11.4,ramp.y.map(h=>h-.16)),wallMat);
   add(detailRibbon(ramp.p,ramp.w,ramp.y),asphalt);
   const outer=ramp.y[0]>ramp.y.at(-1)!?0:ramp.p.length-1,next=outer===0?1:outer-1,a=ramp.p[outer],b=ramp.p[next],length=Math.hypot(b[0]-a[0],b[1]-a[1]);
   const collar:Point[]=[[a[0]-(b[0]-a[0])/length*2.5,a[1]-(b[1]-a[1])/length*2.5],a];
   add(detailRibbon(collar,11.4,.17),wallMat);
   add(detailRibbon(collar,ramp.w,.35),asphalt);
   for(const side of [-1,1])add(detailRibbon(ramp.p,.3,ramp.y.map(h=>Math.min(.348,h+.12)),side*(ramp.w/2+.25)),stone);
   for(const side of [-1,1])add(detailRibbon(ramp.p,.12,ramp.y.map(h=>h+.026),side*(ramp.w/2-.22)),white);
   for(let i=0;i<ramp.p.length-1;i+=3)add(detailRibbon(ramp.p.slice(i,Math.min(i+2,ramp.p.length)),.12,ramp.y.slice(i,Math.min(i+2,ramp.p.length)).map(h=>h+.028)),white);
  }
  // Paired carriageways diverge in height: a solid median with a flat top 0.3 m above the higher deck and
  // vertical faces down to each deck, instead of a plate tilted between them.
  for(let first=0;first<8;first+=2){
   const a=data.ramps[first],b=data.ramps[first+1],vertices:number[]=[],tops:Point[]=[],topY:number[]=[];
   const sides=a.p.map((p,i)=>{
    const q=nearestPath(p[0],p[1],b.p,b.y),dx=q.x-p[0],dz=q.z-p[1],length=Math.hypot(dx,dz)||1,offset=Math.min(3.5,length/2),top=Math.min(.47,Math.max(a.y[i],q.y)+.3);
    tops.push([(p[0]+q.x)/2,(p[1]+q.z)/2]);topY.push(top);
    return {a:[p[0]+dx/length*offset,p[1]+dz/length*offset,a.y[i]-.16],b:[q.x-dx/length*offset,q.z-dz/length*offset,q.y-.16],top};
   });
   const quad=(p:number[],q:number[],r:number[],t:number[])=>vertices.push(...p,...q,...r,...p,...r,...t);
   for(let i=1;i<sides.length;i++){
    const s0=sides[i-1],s1=sides[i],v=(c:number[],y:number)=>[c[0],y,c[1]];
    quad(v(s0.a,s0.top),v(s0.b,s0.top),v(s1.b,s1.top),v(s1.a,s1.top));
    quad(v(s0.a,s0.a[2]),v(s0.a,s0.top),v(s1.a,s1.top),v(s1.a,s1.a[2]));
    quad(v(s0.b,s0.b[2]),v(s0.b,s0.top),v(s1.b,s1.top),v(s1.b,s1.b[2]));
   }
   const median=new BufferGeometry();median.setAttribute('position',new Float32BufferAttribute(vertices,3));median.computeVertexNormals();add(median,stone);
   // Guard rail where one deck falls away more than a step from the other.
   for(let i=1;i<tops.length;i++)if(Math.abs(a.y[i]-nearestPath(...a.p[i],b.p,b.y).y)>.8)rail([tops[i-1],tops[i]],z=>topY[i-1]+(topY[i]-topY[i-1])*Math.max(0,Math.min(1,(z-tops[i-1][1])/((tops[i][1]-tops[i-1][1])||1))),3);
  }
  // Portal headers cap the openings at the pedestrian roof level. No wall across the carriageway.
  for(let first=0;first<8;first+=2){
   const pair=[first,first+1];
   const a=portals[pair[0]],b=portals[pair[1]],x=(a[0]+b[0])/2,z=(a[1]+b[1])/2;
   const road=data.ramps[pair[0]],p=road.p,dx=p.at(-1)![0]-p[0][0],dz=p.at(-1)![1]-p[0][1],angle=-Math.atan2(dz,dx);
   const width=Math.hypot(a[0]-b[0],a[1]-b[1])+10.2;
   const rFloorY=Math.min(...road.y),ceiling=rFloorY+4.9;
   box(x,(.4+ceiling)/2,z,3.2,.4-ceiling,width,wallMat,angle);
   box(x,(rFloorY+ceiling)/2,z,3.2,ceiling-rFloorY,Math.max(.3,Math.hypot(a[0]-b[0],a[1]-b[1])-road.w),wallMat,angle);
   for(const side of [-1,1]){
    const nx=-dz/Math.hypot(dx,dz),nz=dx/Math.hypot(dx,dz);
    box(x+nx*side*width/2,(.4+rFloorY)/2,z+nz*side*width/2,3.2,.4-rFloorY,.45,wallMat,angle);
   }
   // Black/yellow clearance band, small continuous warm light under the header.
   box(x,ceiling-.08,z,3.3,.12,width-.8,yellow,angle);box(x,ceiling-.18,z,2.6,.06,width-.8,this.luminous,angle);
  }
  for(let i=8;i<data.ramps.length;i++){
   const road=data.ramps[i],a=portals[i],p=road.p;
   const isOuterFirst=road.y[0]>road.y.at(-1)!;
   const pInner=isOuterFirst?p.at(-1)!:p[0],pBefore=isOuterFirst?p[p.length-2]:p[1];
   const dx=pInner[0]-pBefore[0],dz=pInner[1]-pBefore[1],angle=-Math.atan2(dz,dx);
   const width=road.w+3.8,rFloorY=Math.min(...road.y),ceiling=rFloorY+4.9;
   box(a[0],(.4+ceiling)/2,a[1],3.2,.4-ceiling,width,wallMat,angle);
   for(const side of [-1,1]){
    const nx=-dz/Math.hypot(dx,dz),nz=dx/Math.hypot(dx,dz);
    box(a[0]+nx*side*width/2,(.4+rFloorY)/2,a[1]+nz*side*width/2,3.2,.4-rFloorY,.45,wallMat,angle);
   }
   box(a[0],ceiling-.08,a[1],3.3,.12,width-.8,yellow,angle);box(a[0],ceiling-.18,a[1],2.6,.06,width-.8,this.luminous,angle);
  }
  for(const road of data.underground){
   const height=(x:number,z:number)=>nearestPath(x,z,road.p,road.heights).y;
   // Unlit interior (see tunnels.ts) so covered roads read as tunnels, not sunlit road.
   for(const p of road.floorSurfaces)add(detailPolygon(p,(z,x)=>height(x,z)),tunnelInterior.floor);
   for(const p of road.ceilingSurfaces)add(detailPolygon(p,(z,x)=>height(x,z)+4.9),tunnelInterior.roof);
   for(const edge of road.wallEdges)add(wall(edge,height,(x,z)=>height(x,z)+4.9),tunnelInterior.wall);
   for(const edge of road.wallEdges)add(detailRibbon(edge,.09,edge.map(p=>height(...p)+4.78)),this.luminous);
   // Keep the mapped underground carriageways legible from the driver's seat.
   for(const edge of road.wallEdges)add(detailRibbon(edge,.10,edge.map(p=>height(...p)+.025)),white);
   let travelled=0;
   for(let i=1;i<road.p.length;i++){
    const a=road.p[i-1],b=road.p[i],length=Math.hypot(b[0]-a[0],b[1]-a[1]);
    for(let d=Math.ceil(travelled/8)*8-travelled;d<length;d+=8){
     const end=Math.min(length,d+3),p:Point[]=[[a[0]+(b[0]-a[0])*d/length,a[1]+(b[1]-a[1])*d/length],[a[0]+(b[0]-a[0])*end/length,a[1]+(b[1]-a[1])*end/length]];
     add(detailRibbon(p,.10,p.map(q=>height(...q)+.027)),white);
    }
    travelled+=length;
   }

  }
  // Full mapped bridge footprint: curved flares at both banks, raised deck and fascia.
  for(const band of data.bridgeBands)add(detailPolygon(band,bridgeHeight),bridgePaving);
  add(wall(data.bridge[0],(_,z)=>bridgeHeight(z)-.55,(_,z)=>bridgeHeight(z)),stone);
  add(detailRibbon(data.bridge[0],.4,data.bridge[0].map(p=>bridgeHeight(p[1])+.035)),white);
  // Rail only along the two waterside edges, leaving the broad landings open.
  const ring=data.bridge[0];
  for(let i=1;i<ring.length;i++)if(Math.abs(ring[i][1]-ring[i-1][1])>Math.abs(ring[i][0]-ring[i-1][0])*.6)rail([ring[i-1],ring[i]],bridgeHeight,1.8);
  // Under-deck beams and short supports are visible from the canal; profile remains walkable.
  const bridgeX=(Math.min(...ring.map(p=>p[0]))+Math.max(...ring.map(p=>p[0])))/2;
  // Terracotta bands just inside the two curved waterside edges.
  const bridgeEdge=mat('#ad6556');
  for(let i=1;i<ring.length;i++)if(Math.abs(ring[i][1]-ring[i-1][1])>Math.abs(ring[i][0]-ring[i-1][0])*.6){
   const inward=(p:Point):Point=>[p[0]+Math.sign(bridgeX-p[0])*1.9,p[1]];
   const band=[inward(ring[i-1]),inward(ring[i])];add(detailRibbon(band,3,band.map(p=>bridgeHeight(p[1])+.02)),bridgeEdge);
  }
  // The deck continues north as a dark asphalt Y (pedestrian ways 877467159 / 877467160 joining the curved
  // promenade 456278900) that frames the plaza's south edge, as on the imagery; drawn over the plaza paving.
  const promenade=data.paths.find(p=>p.id.endsWith('456278900'))?.p;
  if(promenade)add(detailRibbon(promenade,9,.436),asphalt);
  for(const link of [[[-322,365],[-318,376]],[[-284,377],[-273,362]]] as Point[][])add(detailRibbon(link,9,link.map(p=>Math.max(.436,bridgeHeight(p[1])+.01))),asphalt);
  // Solid asphalt between the two links where the Y meets the bridge landing.
  add(detailPolygon([[[-322,365],[-293,367],[-273,362],[-284,377],[-318,376],[-322,365]]],.434),asphalt);
  for(const z of [Math.min(...ring.map(p=>p[1]))+14,Math.max(...ring.map(p=>p[1]))-14])for(const side of [-1,1])box(bridgeX+side*9,(bridgeHeight(z)-1)/2,z,1.4,bridgeHeight(z)+1,1.8,wallMat);
  for(const path of data.paths){
   // The source footway already supplies the continuous surface; only add its railing here.
   if(path.id.endsWith('309367383')||path.id.endsWith('455109655'))rail(path.p,()=>.4,2.5);
  }
  // Small bollards, seats and low-glare lighting along the public square.
  const minz=Math.min(...data.plaza[0].map(p=>p[1])),pools:BufferGeometry[]=[];
  for(let z=minz+12;z<cz-35;z+=24)for(const side of [-1,1]){
   const x=cx+side*27;post(x,.42,z,6.6,.065);
   for(let arm=0;arm<3;arm++){
    const a=arm*Math.PI*2/3,px=x+Math.cos(a)*.9,pz=z+Math.sin(a)*.9;
    segment([x,6.0,z],[px,7.0,pz],.045,metal);box(px,7.05,pz,.62,.12,.26,this.luminous,a);
   }
   pools.push(new CircleGeometry(5.5,24).rotateX(-Math.PI/2).translate(x,.437,z));
   box(x+side*4,.88,z,2.5,.18,.65,brown);for(const dx of [-.8,.8])box(x+side*4+dx,.65,z,.12,.42,.45,metal);
  }
  for(let i=-4;i<=4;i++)if(Math.abs(i)>1)add(new CylinderGeometry(.16,.2,.72,10).translate(cx+i*3.4,.78,cz+56),stone);
  this.poolMaterial=new MeshBasicMaterial({color:'#ffe0a1',transparent:true,opacity:0,depthWrite:false});this.materials.push(this.poolMaterial);
  this.lampPools=new Mesh(mergeGeometries(pools,false)!,this.poolMaterial);pools.forEach(g=>g.dispose());this.lampPools.visible=false;this.root.add(this.lampPools);

  // --- Huacheng Square South Mall (花城汇南区) & Musical Fountain (音乐喷泉) ---
  const terracotta=mat('#9b6755'),ochre=mat('#d5a668'),crimson=mat('#b8342b');
  const [mx0,mz0,mx1,mz1]=centralMallBounds,[sx0,sz0,sx1,sz1]=southMallBounds,[nx0,nz0,nx1,nz1]=northMallBounds;
  const [fx,fz]=musicalFountainSpec.center;
  // Continuous upper granite plaza deck from Huacheng Dadao (-324) to the south sunken court (-56), with cutouts for the 3 axial courts and the recessed fountain basin.
  const fOuter=ellipseRing(fx,fz,31.0,20.2,96),fSlate=ellipseRing(fx,fz,28.0,18.0,96),fOchre=ellipseRing(fx,fz,26.0,16.7,96);
  const fCurb=ellipseRing(fx,fz,15.8,10.2,96),fBasin=ellipseRing(fx,fz,14.2,9.1,96),fCore=ellipseRing(fx,fz,3.4,3.4,48);
  add(detailPolygon([mallPlazaOuter,mallExcavationRings[0],mallExcavationRings[1],mallExcavationRings[2],fBasin],.42),paving);
  // Subtle stone grid & diagonal accent bands on the North Deck and Musical Fountain Apron.
  for(let z=-308;z<=-282;z+=6.5)add(detailRibbon([[-318,z],[-260,z]],.22,.45),white);
  for(const xLine of [-314,-306,-298,-280,-272,-264])add(detailRibbon([[xLine,-309],[xLine,-281]],.22,.45),white);

  // 1. Central Sunken Mall Trench (z = -280.88 to -185.14): wave-paved court + monumental staircase + escalators.
  const courtZ0=-267.20,courtZ1=-222.07,mallY=-4.6;
  add(detailPolygon([[[mx0,courtZ0],[mx1,courtZ0],[mx1,courtZ1],[mx0,courtZ1],[mx0,courtZ0]]],mallY),white);
  // Iconic curved alternating charcoal-slate and warm-stone crescent bands across the sunken court floor.
  for(let k=0;k<6;k++){
   const zBase=courtZ0+4.2+k*7.2,curve:Point[]=Array.from({length:25},(_,i)=>{
    const t=i/24,px=mx0+.6+t*(mx1-mx0-1.2);
    return [px,zBase+3.2*Math.cos((t-.5)*Math.PI)] as Point;
   });
   add(detailRibbon(curve,3.2,mallY+.15),recess);
  }
  // North entrance portal wall at z = -267.20 & twin descending escalators from z = -280.88 to -267.20.
  add(wall([[mx0,courtZ0],[mx1,courtZ0]],()=>mallY,()=>.42),recess);
  add(wall([[mx0+3.5,courtZ0+.08],[mx1-3.5,courtZ0+.08]],()=>mallY+.2,()=>-.6),glass);
  box((mx0+mx1)/2,-.35,courtZ0+.25,mx1-mx0-6,.45,.4,this.luminous);
  const escSteps=14;
  for(let i=0;i<escSteps;i++){
   const t0=i/escSteps,t1=(i+1)/escSteps,za=mz0+(courtZ0-mz0)*t0,zb=mz0+(courtZ0-mz0)*t1,ya=.42+(mallY-.42)*t1;
   box((mx0+mx1)/2,(ya+mallY-.2)/2,(za+zb)/2,mx1-mx0-8.4,ya-mallY+.2,Math.abs(zb-za)+.05,i%2===0?stone:white);
  }
  for(const side of [-1,1]){
   const ex=(mx0+mx1)/2+side*((mx1-mx0)/2-2.1);
   segment([ex,.55,mz0+.4],[ex,mallY+.55,courtZ0-.4],.65,recess);
   segment([ex,1.15,mz0+.4],[ex,mallY+1.15,courtZ0-.4],.12,metal);
   box(ex,-.1,courtZ0-.8,2.8,2.2,1.8,recess);
  }

  // Grand Monumental Staircase (way 554611948, z = -222.07 to -185.14) rising from the sunken mall to the Musical Fountain.
  const stairW=mx1-mx0-6.8,stairX=(mx0+mx1)/2,totalSteps=32;
  for(let i=0;i<totalSteps;i++){
   const t0=i/totalSteps,t1=(i+1)/totalSteps,za=courtZ1+(mz1-courtZ1)*t0,zb=courtZ1+(mz1-courtZ1)*t1;
   const ya=mallY+(.42-mallY)*t1,matStep=i<12?(i%3===0?recess:white):(i%2===0?stone:white);
   box(stairX,(ya+mallY-.3)/2,(za+zb)/2,stairW,ya-mallY+.3,Math.abs(zb-za)-.02,matStep);
   if(i<12&&i%2===0){
    const arc:Point[]=Array.from({length:17},(_,j)=>{const u=j/16;return [stairX-stairW/2+.5+u*(stairW-1),za+1.1*Math.cos((u-.5)*Math.PI)] as Point;});
    add(detailRibbon(arc,.8,ya+.06),recess);
   }
  }
  // Twin side escalator channels & portal towers flanking the Grand Staircase.
  for(const side of [-1,1]){
   const ex=stairX+side*(stairW/2+1.7);
   segment([ex,mallY+.45,courtZ1+.5],[ex,.65,mz1-.5],.75,recess);
   for(const dx of [-.65,.65])segment([ex+dx,mallY+1.05,courtZ1+.5],[ex+dx,1.25,mz1-.5],.09,metal);
   box(ex,mallY+1.45,courtZ1+1.2,3.1,2.9,2.6,recess);
   box(ex,mallY+2.7,courtZ1+1.2,2.7,.22,2.2,this.luminous);
  }
  // Central double handrail and intermediate stair rails on the Grand Staircase.
  for(const dx of [-.35,.35])segment([stairX+dx,mallY+.95,courtZ1+.8],[stairX+dx,1.15,mz1-.6],.045,metal);
  for(const dx of [-stairW*.24,stairW*.24])segment([stairX+dx,(mallY+.42)/2+.95,(courtZ1+mz1)/2],[stairX+dx,1.15,mz1-.6],.04,metal);
  // Retaining walls, white stone copings, glass guardrails & raised side planters around the central trench.
  for(const edge of [[[mx0,mz1],[mx0,mz0]],[[mx0,mz0],[mx1,mz0]],[[mx1,mz0],[mx1,mz1]]] as Point[][]){
   add(wall(edge,()=>mallY-.2,()=>.45),wallMat);
   add(detailRibbon(edge,.55,.48),white);
   add(wall(edge,()=>.50,()=>1.42),glass);
   rail(edge,()=>.48,2.4);
  }
  for(const side of [-1,1]){
   const px=(mx0+mx1)/2+side*((mx1-mx0)/2+2.4),bed=ellipseRing(px,(mz0+mz1)/2,1.6,44,24);
   add(detailPolygon([bed],.64),grass);add(wall(bed,()=>.42,()=>.66),stone);add(detailRibbon(bed,.28,.68),white);
  }

  // 2. Two Sculptural White Wave-Canopy Entrance Pavilions at the top of the Grand Staircase (z = -180.2).
  for(const side of [-1,1]){
   const pcx=stairX+side*24.8,pcz=-180.0,pw=15.4,pd=12.4,nx=20,nz=14,verts:number[]=[];
   add(detailPolygon([ellipseRing(pcx,pcz,pw*.48,pd*.46,36)],.45),stone);
   const wavePt=(u:number,v:number,topSurface:boolean):[number,number,number]=>{
    const x=pcx+(u-.5)*pw*(1-.12*Math.pow(2*v-1,2)),z=pcz+(v-.5)*pd*(1-.10*Math.pow(2*u-1,2));
    const arch=Math.sin(u*Math.PI*2)*(.42*side)+Math.sin(v*Math.PI)*.48+Math.cos((u-.5)*Math.PI)*.35;
    return [x,4.45+arch+(topSurface?.18:-.12),z];
   };
   for(let i=0;i<nx;i++)for(let j=0;j<nz;j++){
    const u0=i/nx,u1=(i+1)/nx,v0=j/nz,v1=(j+1)/nz;
    const a=wavePt(u0,v0,true),b=wavePt(u1,v0,true),c=wavePt(u1,v1,true),d=wavePt(u0,v1,true);
    verts.push(...a,...c,...b,...a,...d,...c);
    const a0=wavePt(u0,v0,false),b0=wavePt(u1,v0,false),c0=wavePt(u1,v1,false),d0=wavePt(u0,v1,false);
    verts.push(...a0,...b0,...c0,...a0,...c0,...d0);
   }
   const waveGeo=new BufferGeometry();waveGeo.setAttribute('position',new Float32BufferAttribute(verts,3));waveGeo.computeVertexNormals();
   add(waveGeo,white);
   for(const uRib of [.2,.4,.6,.8]){
    const rib:Point[]=Array.from({length:15},(_,k)=>{const p=wavePt(uRib,k/14,true);return [p[0],p[2]] as Point;});
    const ribY=Array.from({length:15},(_,k)=>wavePt(uRib,k/14,true)[1]+.02);
    add(detailRibbon(rib,.18,ribY),stone);
   }
   for(const du of [.2,.5,.8])for(const dv of [.22,.78]){
    const [px,py,pz]=wavePt(du,dv,false);post(px,.45,pz,py-.45,.14);
   }
  }

  // 3. The Musical Fountain (音乐喷泉, way 554611955, centered at fx = -290.0, fz = -146.3).
  add(detailPolygon([fOuter,fSlate],.45),white);
  add(detailPolygon([fSlate,fOchre],.475),recess);
  add(detailPolygon([fOchre,fCurb],.50),ochre);
  add(detailPolygon([fCurb,fBasin],.54),white);
  add(wall(fBasin,()=>.26,()=>.54),white);
  add(detailRibbon(fCurb,.38,.56),white);
  add(detailPolygon([fBasin],.26),recess);
  // 16 radial dark-stone spokes and ornamental sector inlays inside the golden-terracotta ring.
  const sectors=16;
  for(let i=0;i<sectors;i++){
   const a0=i/sectors*Math.PI*2,a1=(i+1)/sectors*Math.PI*2,amid=(a0+a1)/2;
   add(detailRibbon([[fx+Math.cos(a0)*15.8,fz+Math.sin(a0)*10.2],[fx+Math.cos(a0)*26.0,fz+Math.sin(a0)*16.7]],.54,.525),recess);
   const span=(a1-a0)*.34,arcIn:Point[]=[],arcOut:Point[]=[];
   for(let k=0;k<=6;k++){
    const a=amid-span+span*2*(k/6);
    arcIn.push([fx+Math.cos(a)*18.4,fz+Math.sin(a)*11.8]);
    arcOut.push([fx+Math.cos(a)*23.2,fz+Math.sin(a)*14.9]);
   }
   const inlay=[...arcIn,...arcOut.reverse(),arcIn[0]];
   add(detailPolygon([inlay],.53),brown);add(detailRibbon(inlay,.26,.55),recess);
  }
  // Cross-walkways, central medallion, and concentric stainless nozzle rings inside the Musical Fountain basin.
  add(detailRibbon([[fx,fz-9.0],[fx,fz+9.0]],2.1,.48),stone);
  add(detailRibbon([[fx-14.0,fz],[fx+14.0,fz]],1.8,.48),stone);
  add(detailPolygon([fCore],.50),white);
  add(detailPolygon([ellipseRing(fx,fz,2.3,2.3,36)],.30),recess);
  for(const scale of [.36,.62,.86]){
   const nozzleRing=ellipseRing(fx,fz,13.6*scale,8.7*scale,72);
   add(detailRibbon(nozzleRing,.30,.32),white);
  }
  // Ceremonial red banner columns flanking the Musical Fountain apron on West and East.
  for(const side of [-1,1])for(const dz of [-14,-5,5,14]){
   const bx=fx+side*33.2,bz=fz+dz;
   post(bx,.42,bz,5.4,.08);
   box(bx-side*.35,3.6,bz,.7,2.2,.14,crimson);
  }
  // Musical Fountain water jets (animated in update()).
  for(const [ringIdx,scale,count,base,amp] of [[0,.86,18,1.5,1.8],[1,.62,14,2.2,2.4],[2,.36,10,2.8,2.9]] as const){
   for(let i=0;i<count;i++){
    const a=i/count*Math.PI*2+ringIdx*.4;
    this.jetSpecs.push({x:fx+Math.cos(a)*13.6*scale,z:fz+Math.sin(a)*8.7*scale,base,amp,phase:a*2+ringIdx*1.3,freq:2.4+ringIdx*.45,radius:.17-.02*ringIdx});
   }
  }
  for(let i=0;i<6;i++){
   const a=i/6*Math.PI*2;
   this.jetSpecs.push({x:fx+Math.cos(a)*1.4,z:fz+Math.sin(a)*1.4,base:3.8,amp:3.4,phase:i*.9,freq:3.1,radius:.21});
  }
  const jetGeo=new CylinderGeometry(.05,.22,1,6);jetGeo.translate(0,.5,0);
  this.fountainMaterial=new MeshStandardMaterial({color:'#e6f7ff',emissive:'#7bc8eb',emissiveIntensity:.45,roughness:.25,transparent:true,opacity:.84});
  this.materials.push(this.fountainMaterial);
  this.fountainJets=new InstancedMesh(jetGeo,this.fountainMaterial,this.jetSpecs.length);
  this.fountainJets.name='Musical fountain water jets';this.root.add(this.fountainJets);

  // 4. Twin Oval Sunken Garage Ramp Wells (way 299795189 West & way 299795190 East) & Terracotta Promenades.
  for(const [idx,spec] of [westWellSpec,eastWellSpec].entries()){
   const [wx,wz]=spec.center,inner=ellipseRing(wx,wz,spec.rx,spec.rz,64,spec.tilt),outer=ellipseRing(wx,wz,spec.rx+5.2,spec.rz+4.6,64,spec.tilt);
   add(detailPolygon([outer,inner],.435),terracotta);
   add(detailPolygon([inner],-4.2),asphalt);
   add(wall(inner,()=>-4.2,()=>.58),wallMat);
   add(detailRibbon(inner,.62,.60),white);
   add(detailRibbon(outer,.35,.445),white);
   rail(inner,()=>.58,2.2);
   // White arched underground garage ramp hoods inside the oval wells.
   const hoodOffsets=idx===0?[-3.6,3.4]:[2.8];
   for(const dx of hoodOffsets){
    const hx=wx+dx,hz=wz+1.2,hw=4.4,hd=10.2,archVerts:number[]=[];
    for(let i=0;i<12;i++)for(let j=0;j<8;j++){
     const u0=i/12,u1=(i+1)/12,v0=j/8,v1=(j+1)/8;
     const hp=(u:number,v:number):[number,number,number]=>[hx+(u-.5)*hw,(-3.6+3.2*v)+Math.sin(u*Math.PI)*1.35,hz+(v-.5)*hd];
     const a=hp(u0,v0),b=hp(u1,v0),c=hp(u1,v1),d=hp(u0,v1);
     archVerts.push(...a,...c,...b,...a,...d,...c);
    }
    const hoodGeo=new BufferGeometry();hoodGeo.setAttribute('position',new Float32BufferAttribute(archVerts,3));hoodGeo.computeVertexNormals();
    add(hoodGeo,white);
   }
  }
  // Terracotta-brown pedestrian avenues flanking the north plaza & connecting bridges to the central trench.
  const westPromenade:Point[]=[[-327,-324],[-331,-294],[-342,-269],[-351,-244]];
  const eastPromenade:Point[]=[[-247,-324],[-240,-288],[-229,-262],[-221,-243]];
  for(const line of [westPromenade,eastPromenade]){
   add(detailRibbon(line,6.2,.432),terracotta);
   for(const side of [-1,1])add(detailRibbon(line,.32,.44,side*3.1),white);
  }
  add(detailRibbon([[-336.5,-233.5],[-306.5,-233.5]],5.8,.434),terracotta);
  add(detailRibbon([[-236.5,-231.9],[-270.9,-231.9]],5.8,.434),terracotta);

  // 5. North Plaza Raised Square Tree Planter Grove (z = -303.5 to -285.5) & North Escalator Well (z = -323 to -309.5).
  const groveRing:Point[]=[[-297.8,-303.8],[-279.6,-303.8],[-279.6,-285.2],[-297.8,-285.2],[-297.8,-303.8]];
  add(detailPolygon([groveRing],.82),grass);
  add(wall(groveRing,()=>.42,()=>.86),stone);
  add(detailRibbon(groveRing,.42,.88),white);
  for(const [px,pz] of [[-305.8,-299.5],[-305.8,-289.5],[-271.6,-299.5],[-271.6,-289.5]]){
   const small:Point[]=[[px-2.1,pz-2.1],[px+2.1,pz-2.1],[px+2.1,pz+2.1],[px-2.1,pz+2.1],[px-2.1,pz-2.1]];
   add(detailPolygon([small],.62),grass);add(wall(small,()=>.42,()=>.65),stone);add(detailRibbon(small,.25,.66),white);
  }
  // North Escalator Entrance Well at bottom of photo (z = -323.0 to -309.5).
  add(detailPolygon([mallExcavationRings[2]],-4.2),recess);
  for(const edge of [[[nx0,nz0],[nx0,nz1]],[[nx0,nz1],[nx1,nz1]],[[nx1,nz1],[nx1,nz0]]] as Point[][]){
   add(wall(edge,()=>-4.2,()=>.46),wallMat);add(detailRibbon(edge,.48,.48),white);rail(edge,()=>.46,2.2);
  }
  for(const side of [-1,1]){
   const ex=(nx0+nx1)/2+side*((nx1-nx0)/2-2.2);
   segment([ex,.5,nz1-.4],[ex,-3.8,nz0+.4],.65,recess);
   segment([ex,1.1,nz1-.4],[ex,-3.2,nz0+.4],.1,metal);
  }
  box((nx0+nx1)/2,1.15,nz1-.8,11.5,.45,1.4,white);

  // 6. South Sunken Mall Court (way 554611957 & 554611942, z = -113.0 to -60.3).
  const sCourtZ=-78.1,sMallY=-4.2;
  add(detailPolygon([[[sx0,sz0],[sx1,sz0],[sx1,sCourtZ],[sx0,sCourtZ],[sx0,sz0]]],sMallY),white);
  for(let z=sz0+4;z<sCourtZ-2;z+=5.5)add(detailRibbon([[sx0+.8,z],[sx1-.8,z]],2.2,sMallY+.025),recess);
  add(wall([[sx0,sz0],[sx1,sz0]],()=>sMallY,()=>.42),recess);
  add(wall([[sx0+3,sz0+.08],[sx1-3,sz0+.08]],()=>sMallY+.2,()=>-.5),glass);
  box((sx0+sx1)/2,-.35,sz0+.25,sx1-sx0-6,.42,.38,this.luminous);
  const sSteps=16,sStairW=sx1-sx0-5.6,sStairX=(sx0+sx1)/2;
  for(let i=0;i<sSteps;i++){
   const t0=i/sSteps,t1=(i+1)/sSteps,za=sCourtZ+(sz1-sCourtZ)*t0,zb=sCourtZ+(sz1-sCourtZ)*t1,ya=sMallY+(.42-sMallY)*t1;
   box(sStairX,(ya+sMallY-.2)/2,(za+zb)/2,sStairW,ya-sMallY+.2,Math.abs(zb-za)+.05,i%4===0?stone:white);
  }
  for(const side of [-1,1]){
   const ex=sStairX+side*(sStairW/2+1.4);
   segment([ex,sMallY+.45,sCourtZ+.4],[ex,.6,sz1-.4],.65,recess);
  }
  for(const edge of [[[sx0,sz1],[sx0,sz0]],[[sx0,sz0],[sx1,sz0]],[[sx1,sz0],[sx1,sz1]]] as Point[][]){
   add(wall(edge,()=>sMallY-.2,()=>.45),wallMat);add(detailRibbon(edge,.52,.47),white);rail(edge,()=>.46,2.4);
  }

  // 7. Side Forecourts (West Friendship Store Fountain 717941981 & East K11/CTF Golden Arch Plaza) & Skybridges.
  const [wfx,wfz]=[-407.7,-203.6];
  add(detailPolygon([ellipseRing(wfx,wfz,13.5,13.5,48)],.42),stone);
  add(detailPolygon([ellipseRing(wfx,wfz,7.4,7.4,48)],.45),recess);
  add(detailRibbon(ellipseRing(wfx,wfz,7.4,7.4,48),.45,.62),white);
  add(new CylinderGeometry(1.4,1.8,1.8,12).translate(wfx,1.3,wfz),ochre);
  const [efx,efz]=[-182.0,-195.0];
  // Kept within 7 m of the sculpture: a wider disc covered the carriageway leaving ramp 27318117.
  // It sits just above the raised sidewalk paving around it.
  add(detailPolygon([ellipseRing(efx,efz,7.0,7.0,48)],FOOT_TOP+.012),paving);
  add(detailPolygon([ellipseRing(efx,efz,6.2,6.2,64)],FOOT_TOP+.02),white);
  add(detailRibbon(ellipseRing(efx,efz,6.2,6.2,64),.5,FOOT_TOP+.03),recess);
  // Iconic 3-legged golden arched sculpture in the East K11/CTF circular plaza.
  for(let leg=0;leg<3;leg++){
   const a=leg*Math.PI*2/3+.4;
   for(let k=0;k<8;k++){
    const t0=k/8,t1=(k+1)/8,r0=5.8*(1-t0),r1=5.8*(1-t1),y0=FOOT_TOP+.04+4.2*Math.sin(t0*Math.PI*.65),y1=FOOT_TOP+.04+4.2*Math.sin(t1*Math.PI*.65);
    segment([efx+Math.cos(a)*r0,y0,efz+Math.sin(a)*r0],[efx+Math.cos(a)*r1,y1,efz+Math.sin(a)*r1],.48-.18*t0,ochre);
   }
  }
  // West & East Polygonal Pedestrian Skybridges (z ≈ -288).
  const westBridgeHex:Point[]=[[-396,-282],[-378,-268],[-362,-278],[-365,-298],[-384,-306],[-398,-295],[-396,-282]];
  add(detailRibbon(westBridgeHex,4.2,5.2),stone);
  add(detailRibbon(westBridgeHex,4.6,4.95),white);
  add(detailRibbon([[-363,-288],[-342,-293]],3.8,5.2),stone);
  rail(westBridgeHex,()=>5.2,2.8);
  const eastBridgePath:Point[]=[[-220,-292],[-198,-290],[-180,-280],[-162,-292],[-180,-280],[-172,-306]];
  add(detailRibbon(eastBridgePath,4.2,5.2),stone);
  add(detailRibbon(eastBridgePath,4.6,4.95),white);
  rail(eastBridgePath,()=>5.2,2.8);

  // Curated lush tree groves for the Central/South Mall & Musical Fountain corridor.
  const mallTrees:{x:number;z:number;height:number}[]=[];
  // Central square planter matrix on North Deck (3x3 dense grove + 4 side planters).
  for(const gx of [-294.5,-288.7,-283.0])for(const gz of [-300.5,-294.5,-288.5])mallTrees.push({x:gx,z:gz,height:10.5+((Math.abs(gx*3+gz))%3)});
  for(const [px,pz] of [[-305.8,-299.5],[-305.8,-289.5],[-271.6,-299.5],[-271.6,-289.5]])mallTrees.push({x:px,z:pz,height:9.2});
  // Rim colonnade trees along both sides of the central sunken trench & grand staircase.
  for(let z=-277;z<=-189;z+=7.5){
   mallTrees.push({x:-308.4,z,height:9.5+((Math.abs(z))%3)});
   mallTrees.push({x:-269.0,z,height:9.5+((Math.abs(z+2))%3)});
  }
  // Dense park groves flanking the central trench, twin oval wells, and Musical Fountain.
  for(let x=-342;x<=-313;x+=7.5)for(let z=-276;z<=-132;z+=8.0){
   if(Math.hypot((x+350.4)/19,(z+231.5)/15)<1.08||Math.hypot(x+314,z+180)<11||Math.hypot((x+290)/34,(z+146.3)/23)<1.05)continue;
   mallTrees.push({x:x+(z%2)*1.2,z:z+(x%2)*1.2,height:11.0+((Math.abs(x*5+z*3))%4)});
  }
  for(let x=-264;x<=-234;x+=7.5)for(let z=-276;z<=-132;z+=8.0){
   if(Math.hypot((x+221.6)/19,(z+231.0)/15)<1.08||Math.hypot(x+264,z+180)<11||Math.hypot((x+290)/34,(z+146.3)/23)<1.05)continue;
   mallTrees.push({x:x+(z%2)*1.2,z:z+(x%2)*1.2,height:11.0+((Math.abs(x*7+z*3))%4)});
  }
  this.trees=new SlopTrees([...data.trees,...mallTrees]);this.root.add(this.trees.root);
  this.updateFountain(0,0);
  for(const [material,parts] of this.batches){
   const flat=parts.map(g=>{g.deleteAttribute('uv');return g.index?g.toNonIndexed():g;});const geometry=mergeGeometries(flat,false)!;
   for(const g of new Set([...parts,...flat]))g.dispose();geometry.computeBoundingSphere();
   const mesh=new Mesh(geometry,material);mesh.castShadow=true;mesh.receiveShadow=true;this.root.add(mesh);
  }
  this.batches.clear();
 }
 private updateFountain(time:number,night:number){
  const q=new Quaternion(),pos=new Vector3(),scale=new Vector3();
  this.fountainMaterial.emissiveIntensity=.38+night*1.45;
  this.jetSpecs.forEach((j,i)=>{
   const h=Math.max(.6,j.base+j.amp*(.5+.5*Math.sin(time*j.freq+j.phase)));
   pos.set(j.x,.34,j.z);scale.set(j.radius,h,j.radius);
   this.jetTemp.compose(pos,q,scale);
   this.fountainJets.setMatrixAt(i,this.jetTemp);
  });
  this.fountainJets.instanceMatrix.needsUpdate=true;
 }
 update(time:number,night:number,camera:Vector3){
  this.luminous.emissiveIntensity=night*2.2;this.poolMaterial.opacity=night*.16;this.lampPools.visible=night>.15;
  this.updateFountain(time,night);
  this.trees.update(camera);
 }
 getStats(){return {ramps:data.ramps.length,cuttings:data.trenches.length,underground:data.underground.length,bridgeSource:data.bridgeSource,trees:data.trees.length,batches:this.root.children.length};}
 dispose(){this.trees.dispose();for(const child of this.root.children)if(child instanceof Mesh){child.geometry.dispose();if(child instanceof InstancedMesh)child.dispose();}for(const m of this.materials)m.dispose();this.root.clear();}
}
