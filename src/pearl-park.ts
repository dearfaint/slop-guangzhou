import { BufferGeometry, Float32BufferAttribute, ShapeGeometry, ExtrudeGeometry, BoxGeometry, CylinderGeometry, Group, Mesh, MeshStandardMaterial, Vector3, Quaternion, type Material } from 'three/webgpu';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { shapeFrom, roadStrip } from './geometry.ts';
import { streetLampHousing } from './slop-street-models.ts';
import { SlopTrees } from './slop-trees.ts';
import { createParkLawnMaterial } from './vendor/slop-newyork/tsl-materials.js';
import { pearlParkData as d } from './pearl-park-data.ts';
import { pearlParkFloor, parkRoadProfile, parkBuildingFrame, inPearlPark, inParkRing } from './pearl-park-layout.ts';
import type { Point } from './types.ts';
const forward=new Vector3(0,0,1);
export class PearlPark {
 readonly root=new Group();
 private trees:SlopTrees;
 private materials:Material[]=[];
 private bulbs?:MeshStandardMaterial;
 constructor(){
  this.root.name='珠江公园 · OSM水系园路与岭南亭廊';
  const batches=new Map<Material,BufferGeometry[]>();
  const mat=(color:string,roughness=.85)=>{const m=new MeshStandardMaterial({color,roughness});this.materials.push(m);return m;};
  const stone=mat('#a5a39a'),paving=mat('#d5c6ad'),path=mat('#c8a98d'),roof=mat('#505655'),white=mat('#deddd0'),wood=mat('#5b4530'),glass=mat('#435c59',.25),brick=mat('#a88c73');
  const water=mat('#16463e',.5),leaf=mat('#496e3c'),bark=mat('#8d8067');
  roof.side=2;leaf.side=2;water.metalness=.7;water.roughness=.65;
  const asphalt=mat('#3e4446');this.bulbs=mat('#eadbc2');this.bulbs.emissive.set('#eadbc2');
  const lawn=createParkLawnMaterial();this.materials.push(lawn);
  const add=(g:BufferGeometry,m:Material)=>{g.deleteAttribute('uv');const a=batches.get(m)??[];a.push(g);batches.set(m,a);};
  const surface=(rings:Point[][],height:(x:number,z:number)=>number,m:Material)=>{const g=new ShapeGeometry(shapeFrom(rings));g.rotateX(-Math.PI/2);const p=g.attributes.position;for(let i=0;i<p.count;i++)p.setY(i,height(p.getX(i),p.getZ(i)));g.computeVertexNormals();add(g,m);};
  const box=(x:number,y:number,z:number,w:number,h:number,l:number,m:Material,angle=0)=>{const g=new BoxGeometry(w,h,l);g.rotateY(-angle);g.translate(x,y,z);add(g,m);};
  const beam=(a:Vector3,b:Vector3,w:number,h:number,m:Material)=>{const g=new BoxGeometry(w,h,a.distanceTo(b));g.applyQuaternion(new Quaternion().setFromUnitVectors(forward,b.clone().sub(a).normalize()));g.translate(...a.clone().add(b).multiplyScalar(.5).toArray());add(g,m);};
  const pillar=(x:number,y:number,z:number,r:number,h:number,m=white)=>{const g=new CylinderGeometry(r,r*1.08,h,8);g.translate(x,y+h/2,z);add(g,m);};
  const roofRing=(x:number,y:number,z:number,r:number,sides=8,angle=0)=>{
   const profile=[[1.12,0],[1,.16],[.72,.65],[.18,1.55]],v:number[]=[];
   for(let j=1;j<profile.length;j++)for(let i=0;i<sides;i++){
    const p=(k:number,n:number)=>{const a=angle+k*Math.PI*2/sides;return [x+Math.cos(a)*r*profile[n][0],y+profile[n][1],z+Math.sin(a)*r*profile[n][0]];};
    v.push(...p(i,j-1),...p(i+1,j-1),...p(i+1,j),...p(i,j-1),...p(i+1,j),...p(i,j));
   }
   const g=new BufferGeometry();g.setAttribute('position',new Float32BufferAttribute(v,3));g.computeVertexNormals();add(g,roof);
  };
  const pavilion=(x:number,z:number,r:number,h:number,angle=0)=>{const y=pearlParkFloor(x,z)??0;pillar(x,y,z,r+.8,.2,stone);for(let i=0;i<8;i++){const a=angle+i*Math.PI/4;pillar(x+Math.cos(a)*r*.78,y+.2,z+Math.sin(a)*r*.78,.18,h-.5);}
   roofRing(x,y+h-.7,z,r,8,angle);roofRing(x,y+h+.7,z,r*.5,8,angle);};
  for(const p of d.ground)surface(p,(x,z)=>(pearlParkFloor(x,z)??0)+.18,lawn);
  for(const w of d.waters){const stream=w.id.includes('creek')||w.name.includes('溪');surface(w.p,(x,z)=>(stream?pearlParkFloor(x,z)??0:0)+.12,water);
   const r=w.p[0];for(let i=1;i<r.length;i++){const a=r[i-1],b=r[i];beam(new Vector3(a[0],(pearlParkFloor(...a)??0)+.14,a[1]),new Vector3(b[0],(pearlParkFloor(...b)??0)+.14,b[1]),.34,.25,stone);}}
  for(const r of d.roads){const p=parkRoadProfile(r);add(roadStrip(p.p,r.w+.45,p.y.map(y=>y-.04)),stone);add(roadStrip(p.p,r.w,p.y),r.bridge?wood:['footway','path','pedestrian','steps','cycleway'].includes(r.kind)?path:asphalt);
   if(r.bridge)for(let i=1;i<p.p.length;i++){const a=p.p[i-1],b=p.p[i],dx=b[0]-a[0],dz=b[1]-a[1],l=Math.hypot(dx,dz)||1;
    for(const side of [-1,1]){const x=a[0]-dz/l*(r.w/2+.05)*side,z=a[1]+dx/l*(r.w/2+.05)*side,bx=b[0]-dz/l*(r.w/2+.05)*side,bz=b[1]+dx/l*(r.w/2+.05)*side;pillar(x,p.y[i-1],z,.09,.95,wood);beam(new Vector3(x,p.y[i-1]+.85,z),new Vector3(bx,p.y[i]+.85,bz),.12,.12,wood);}}}
  for(const b of d.buildings){const f=parkBuildingFrame(b);
   if(b.style==='pavilion'){pavilion(f.x,f.z,Math.max(2.2,Math.min(5,f.length*.35)),b.h);continue;}
   if(b.style==='yutang'){
    // Photo-guided open colonnade: white posts and a curved grey-tile gallery around the courtyard.
    const radius=Math.max(8,f.length*.4),y=f.y,point=(a:number,r:number)=>new Vector3(f.x+Math.cos(a+f.angle)*r,y,f.z+Math.sin(a+f.angle)*r);
    for(let i=0;i<18;i++){const a=-2.7+i*3.8/18,c=-2.7+(i+1)*3.8/18;
     const strip=roadStrip([[point(a,radius).x,point(a,radius).z],[point(c,radius).x,point(c,radius).z]],3.5,y+.25);add(strip,paving);
     const l=point(a,radius-1.25),r=point(a,radius+1.25);pillar(l.x,y+.25,l.z,.17,3.1);pillar(r.x,y+.25,r.z,.17,3.1);
     const mid=point((a+c)/2,radius);box(mid.x,y+3.55,mid.z,point(a,radius).distanceTo(point(c,radius))+.35,.22,4.4,roof,a+f.angle+Math.PI/2);
    }
    pavilion(f.x+Math.cos(f.angle)*radius*.6,f.z+Math.sin(f.angle)*radius*.6,4.5,4.2,f.angle);pillar(f.x,f.y+.18,f.z,7,.03,paving);continue;
   }
   if(b.style==='stage'){surface(b.p,()=>f.y+.45,stone);box(f.x,f.y+.3,f.z,f.length,.45,4,paving,f.angle);continue;}
   const g=new ExtrudeGeometry(shapeFrom(b.p),{depth:b.h-1,bevelEnabled:false});g.rotateX(-Math.PI/2);g.translate(0,f.y+.15,0);add(g,b.style==='baozhu'?brick:white);
   surface(b.p,()=>f.y+b.h-.7,roof);
   for(let i=1;i<b.p[0].length;i++){const a=b.p[0][i-1],c=b.p[0][i],l=Math.hypot(c[0]-a[0],c[1]-a[1]),n=Math.max(1,Math.floor(l/3));
    for(let j=0;j<n;j++){const t=(j+.5)/n,x=a[0]+t*(c[0]-a[0]),z=a[1]+t*(c[1]-a[1]);box(x,f.y+2,z,Math.min(1.7,l/n*.65),b.style==='bookhouse'?2.6:1.2,.18,glass,Math.atan2(c[1]-a[1],c[0]-a[0]));}}
   if(b.style==='baozhu'){roofRing(f.x,f.y+3.6,f.z,f.length*.7,4,f.angle+Math.PI/4);roofRing(f.x,f.y+b.h-.8,f.z,f.length*.65,4,f.angle+Math.PI/4);}
  }
  for(const g of d.gardens){const r=g.p[0];for(let i=1;i<r.length;i++){const a=r[i-1],b=r[i],l=Math.hypot(b[0]-a[0],b[1]-a[1]),n=Math.ceil(l/3);for(let k=0;k<n;k++){const x=a[0]+(b[0]-a[0])*k/n,z=a[1]+(b[1]-a[1])*k/n,y=pearlParkFloor(x,z)??0;pillar(x,y,z,.13,2.6,wood);box(x,y+2.7,z,3.3,.15,2.1,wood,Math.atan2(b[1]-a[1],b[0]-a[0]));box(x,y+2.85,z,2.6,.18,1.4,leaf);}}}
  for(const p of d.pois.filter(p=>p.kind==='gate')){const y=pearlParkFloor(...p.p)??0,angle=p.name==='东门'||p.name==='兴盛门'?Math.PI/2:0;for(const side of [-1,1])pillar(p.p[0]+Math.cos(angle)*4*side,y,p.p[1]+Math.sin(angle)*4*side,.3,3.2,stone);box(p.p[0],y+3.15,p.p[1],8.6,.4,.9,wood,angle);}
  for(const [i,r] of d.roads.entries()){
   if(i%5||r.bridge||!['path','footway','pedestrian'].includes(r.kind))continue;
   const j=Math.max(1,Math.floor(r.p.length/2)),a=r.p[j-1],b=r.p[j],dx=b[0]-a[0],dz=b[1]-a[1],l=Math.hypot(dx,dz)||1,x=(a[0]+b[0])/2-dz/l*(r.w/2+1),z=(a[1]+b[1])/2+dx/l*(r.w/2+1),angle=Math.atan2(dz,dx),y=pearlParkFloor(x,z)??0;
   if(!inPearlPark(x,z)||d.waters.some(w=>inParkRing(x,z,w.p[0])&&!w.p.slice(1).some(h=>inParkRing(x,z,h))))continue;
   box(x,y+.6,z,1.8,.12,.5,wood,angle);box(x,y+.95,z+.18,1.8,.6,.08,wood,angle);for(const side of [-1,1])box(x+Math.cos(angle)*.6*side,y+.3,z+Math.sin(angle)*.6*side,.13,.55,.46,stone,angle);
   pillar(x+1.4,y,z,.065,3.4,stone);const head=streetLampHousing();head.translate(x+1.4,y+3.4,z);add(head,stone);box(x+1.4,y+3.35,z,.6,.06,.32,this.bulbs!);
  }
  const broad=d.trees.filter(t=>!(t.x>1160&&t.x<1340&&t.z>-325&&t.z<-245));
  for(const t of d.trees.filter(t=>!broad.includes(t))){const y=pearlParkFloor(t.x,t.z)??0,h=8;pillar(t.x,y,t.z,.2,h,bark);for(let j=0;j<8;j++){const a=j*Math.PI/4,v:number[]=[];for(let k=0;k<6;k++){const p=(n:number,side:number)=>{const u=n/6,r=u*4.5,w=Math.sin(u*Math.PI)*.55*side;return [t.x+Math.cos(a)*r-Math.sin(a)*w,y+h+Math.sin(u*Math.PI)*1.2-u*1.6,t.z+Math.sin(a)*r+Math.cos(a)*w];};v.push(...p(k,-1),...p(k,1),...p(k+1,1),...p(k,-1),...p(k+1,1),...p(k+1,-1));}const g=new BufferGeometry();g.setAttribute('position',new Float32BufferAttribute(v,3));g.computeVertexNormals();add(g,leaf);}}
  for(const [m,parts] of batches){const flat=parts.map(g=>g.index?g.toNonIndexed():g),geometry=mergeGeometries(flat,false)!;for(const g of new Set([...parts,...flat]))g.dispose();const mesh=new Mesh(geometry,m);mesh.castShadow=m!==water&&m!==lawn;mesh.receiveShadow=true;this.root.add(mesh);}
  this.trees=new SlopTrees(broad.map(t=>({...t,y:(pearlParkFloor(t.x,t.z)??0)+.18})));this.root.add(this.trees.root);
 }
 update(camera:Vector3,night=0){this.trees.update(camera);if(this.bulbs)this.bulbs.emissiveIntensity=.1+night*2;}
 dispose(){this.trees.dispose();for(const child of this.root.children){if(child instanceof Mesh)child.geometry.dispose();}for(const m of this.materials)m.dispose();this.root.clear();}
}
