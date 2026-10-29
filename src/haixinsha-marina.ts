import {BufferGeometry,Float32BufferAttribute,BoxGeometry,CylinderGeometry,Vector3,Quaternion,type Material} from 'three/webgpu';
import {detailPolygon,detailRibbon} from './south-axis.ts';
import {marinaGangways,marinaPontoon,marinaTerrace,marinaQuayApron,marinaBoats} from './haixinsha-site.ts';
import type {Point} from './types.ts';
// Join these pieces into the island's shared material batches, rather than one mesh per fitting.
export function addMarina(add:(g:BufferGeometry,m:Material)=>void,materials:{white:Material;wood:Material;glass:Material;stone:Material;dark:Material;orange:Material;green:Material}){
 const {white,wood,glass,stone,dark,orange,green}=materials;
 const box=(x:number,y:number,z:number,w:number,h:number,d:number,m:Material)=>add(new BoxGeometry(w,h,d).translate(x,y,z),m);
 const beam=(a:Vector3,b:Vector3,r:number,m:Material)=>{const delta=b.clone().sub(a);add(new CylinderGeometry(r,r,delta.length(),6).applyQuaternion(new Quaternion().setFromUnitVectors(new Vector3(0,1,0),delta.normalize())).translate(...a.clone().add(b).multiplyScalar(.5).toArray()),m);};
 add(detailPolygon(marinaQuayApron,.49),stone);
 add(detailPolygon(marinaTerrace,.48),wood);add(detailRibbon(marinaTerrace[0],.4,.51),stone);
 for(let x=-425;x<-282;x+=2.4)add(detailRibbon([[x,648-(x+430)*.073],[x+1,663-(x+430)*.08]],.07,.49),stone);
 // A stone quay face, fenders and palm-lined waterside terrace.
 for(const quay of [marinaTerrace[0],marinaQuayApron[0]])for(let i=1;i<quay.length;i++){
  const a=quay[i-1],b=quay[i],g=new BufferGeometry();g.setAttribute('position',new Float32BufferAttribute([a[0],-.4,a[1],b[0],-.4,b[1],b[0],.48,b[1],a[0],-.4,a[1],b[0],.48,b[1],a[0],.48,a[1]],3));g.computeVertexNormals();add(g,stone);
 }
 for(let i=0;i<6;i++){
  const x=-345+i*11,z=645-i*.8;beam(new Vector3(x,.48,z),new Vector3(x+.4,6.8,z),.2,wood);
  const v:number[]=[];for(let leaf=0;leaf<9;leaf++)for(let k=0;k<5;k++){
   const a=leaf*Math.PI*2/9,point=(t:number,s:number)=>{const r=t*3.5,w=Math.sin(t*Math.PI)*.3*s;return [x+.4+Math.cos(a)*r-Math.sin(a)*w,6.8+1.4*Math.sin(Math.PI*t)-t*.8,z+Math.sin(a)*r+Math.cos(a)*w];};
   v.push(...point(k/5,-1),...point(k/5,1),...point((k+1)/5,1),...point(k/5,-1),...point((k+1)/5,1),...point((k+1)/5,-1));
  }
  const g=new BufferGeometry();g.setAttribute('position',new Float32BufferAttribute(v,3));g.computeVertexNormals();add(g,green);
 }
 const pontoon=marinaPontoon;
 add(detailRibbon(pontoon.p,pontoon.w,.62),wood);add(detailRibbon(pontoon.p,pontoon.w+.18,.27),dark);
 for(const side of [-1,1])add(detailRibbon(pontoon.p,.16,.67,side*(pontoon.w/2-.1)),white);
 for(let i=1;i<pontoon.p.length;i++){
  const a=pontoon.p[i-1],b=pontoon.p[i],length=Math.hypot(b[0]-a[0],b[1]-a[1]);
  for(let d=2;d<length;d+=4){const x=a[0]+(b[0]-a[0])*d/length,z=a[1]+(b[1]-a[1])*d/length;box(x,.37,z+2.2,.5,.75,.4,dark);box(x,.78,z,.5,.17,.18,white);}
 }
 for(const walkway of marinaGangways){
  const [a,b]=walkway.p,dx=b[0]-a[0],dz=b[1]-a[1],length=Math.hypot(dx,dz),nx=dz/length,nz=-dx/length;
  const at=(t:number,side:number,y:number)=>new Vector3(a[0]+dx*t+nx*side,y,a[1]+dz*t+nz*side);
  add(detailRibbon(walkway.p,walkway.w,[.48,.62]),stone);
  for(const side of [-1,1]){const p=walkway.p;add(detailRibbon(p,.12,[1.42,1.56],side*1.55),white);add(detailRibbon(p,.14,[.41,.55],side*1.65),dark);}
  for(let step=0;step<=10;step++){
   const t=step/10,y=.48+.14*t;
   for(const side of [-1,1])beam(at(t,side*1.6,y),at(t,side*1.6,y+2),.055,white);
   for(let arc=0;arc<8;arc++){
    const p=(i:number)=>{const u=i/8*Math.PI;return at(t,Math.cos(u)*1.75,y+2+Math.sin(u)*.72);};beam(p(arc),p(arc+1),.055,white);
   }
  }
  // Light membrane strips leave the repeating ribs visible from above.
  for(let col=0;col<8;col++){
   const u=col/8*Math.PI,v=(col+1)/8*Math.PI;
   const p=[at(0,Math.cos(u)*1.75,2.48+Math.sin(u)*.72),at(1,Math.cos(u)*1.75,2.62+Math.sin(u)*.72),at(1,Math.cos(v)*1.75,2.62+Math.sin(v)*.72),at(0,Math.cos(v)*1.75,2.48+Math.sin(v)*.72)];
   const g=new BufferGeometry();g.setAttribute('position',new Float32BufferAttribute([...p[0].toArray(),...p[1].toArray(),...p[2].toArray(),...p[0].toArray(),...p[2].toArray(),...p[3].toArray()],3));g.computeVertexNormals();add(g,col%2?glass:white);
  }
 }
 for(const boat of marinaBoats){
  const c=Math.cos(boat.yaw),s=Math.sin(boat.yaw),point=(x:number,y:number,z:number)=>new Vector3(boat.x+x*c+z*s,y,boat.z-x*s+z*c);
  const part=(x:number,y:number,z:number,w:number,h:number,d:number,m:Material)=>add(new BoxGeometry(w,h,d).rotateY(boat.yaw).translate(...point(x,y,z).toArray()),m);
  // Longitudinal hull sections form a sharp bow, flared shoulders and a flat stern.
  const rings=[[-.5,.30,.16],[-.40,.47,.07],[.18,.50,.05],[.40,.37,.18],[.5,.02,.46]].map(([z,w,bottom])=>({z:z*boat.length,w:w*boat.width,bottom}));
  const makeHull=(bottom:boolean,m:Material)=>{const vertices:number[]=[];for(let i=1;i<rings.length;i++)for(const side of [-1,1]){
   const a=rings[i-1],b=rings[i],p=[point(side*a.w,bottom?a.bottom:.78,a.z),point(side*b.w,bottom?b.bottom:.78,b.z),point(side*b.w,bottom?.78:.96,b.z),point(side*a.w,bottom?.78:.96,a.z)];vertices.push(...p[0].toArray(),...p[1].toArray(),...p[2].toArray(),...p[0].toArray(),...p[2].toArray(),...p[3].toArray());
  }const g=new BufferGeometry();g.setAttribute('position',new Float32BufferAttribute(vertices,3));g.computeVertexNormals();add(g,m);};
  makeHull(true,white);makeHull(false,orange);
  for(const r of [rings[0],rings.at(-1)!]){
   const p=[point(-r.w,r.bottom,r.z),point(r.w,r.bottom,r.z),point(r.w,.96,r.z),point(-r.w,.96,r.z)],g=new BufferGeometry();g.setAttribute('position',new Float32BufferAttribute([...p[0].toArray(),...p[1].toArray(),...p[2].toArray(),...p[0].toArray(),...p[2].toArray(),...p[3].toArray()],3));g.computeVertexNormals();add(g,white);
  }

  const deck:Point[]=[...rings.map(r=>[-r.w,r.z] as Point),...rings.slice().reverse().map(r=>[r.w,r.z] as Point)];deck.push(deck[0]);
  add(detailPolygon([deck],.97).rotateY(boat.yaw).translate(boat.x,0,boat.z),wood);
  part(0,1.65,-1,boat.width*.69,1.35,boat.length*.54,white);part(0,2.38,-1,boat.width*.79,.16,boat.length*.58,white);
  part(0,2.05,boat.length*.265,boat.width*.62,.54,.08,glass);
  for(const side of [-1,1])for(let i=0;i<6;i++)part(side*boat.width*.35,1.93,-boat.length*.23+i*boat.length*.08,.08,.6,boat.length*.064,glass);
  part(0,2.75,-boat.length*.10,boat.width*.49,.65,boat.length*.20,white);part(0,3.12,-boat.length*.10,boat.width*.61,.12,boat.length*.25,white);
  beam(point(0,3.18,-2),point(0,5,-2),.055,white);beam(point(-1.2,4.1,-2),point(1.2,4.1,-2),.055,white);
  for(let i=1;i<deck.length;i++){
   beam(point(deck[i-1][0],1.6,deck[i-1][1]),point(deck[i][0],1.6,deck[i][1]),.025,white);
   beam(point(deck[i][0],.99,deck[i][1]),point(deck[i][0],1.6,deck[i][1]),.025,white);
  }
  for(const z of [-.35,.22])for(const side of [-1,1])add(new CylinderGeometry(.18,.18,.65,8).rotateZ(.15).translate(...point(side*boat.width*.53,.64,z*boat.length).toArray()),white);
  for(const z of [-.3,.3])beam(point(boat.width*.50,1,z*boat.length),new Vector3(boat.x+z*boat.length,.78,boat.z-9),.025,dark);
 }
}
