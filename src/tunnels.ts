import {Group,Mesh,BufferGeometry,Float32BufferAttribute,MeshStandardMaterial,MeshBasicMaterial,DoubleSide} from 'three/webgpu';
import {nearestPath} from './south-axis-layout.ts';
import {palette} from './materials.ts';
import type {TunnelRoute} from './tunnel-layout.ts';
// Shared tunnel surfaces use the same profile as player physics and traffic.
const asphalt=new MeshStandardMaterial({color:palette.road,roughness:1,side:DoubleSide});
const concrete=new MeshStandardMaterial({color:'#a1aaa7',roughness:.92,side:DoubleSide});
const roof=new MeshStandardMaterial({color:'#727e80',roughness:.94,side:DoubleSide});
const light=new MeshBasicMaterial({color:'#fff1cb',side:DoubleSide});
const paint=new MeshBasicMaterial({color:'#dfdfce',side:DoubleSide});
// Covered sections are unlit: the sun would otherwise light the floor through the roof, so mouths
// read as open road. Ceiling light strips and lane paint stay bright against these.
export const tunnelInterior={floor:new MeshBasicMaterial({color:'#2c3133',side:DoubleSide}),wall:new MeshBasicMaterial({color:'#5b6263',side:DoubleSide}),roof:new MeshBasicMaterial({color:'#373d3f',side:DoubleSide})};
export function createTunnel(route:TunnelRoute){
 const root=new Group();root.name=`tunnel:${route.name}:${route.id}`;
 const batches=new Map<MeshStandardMaterial|MeshBasicMaterial,number[]>();
 const quad=(a:number[],b:number[],c:number[],d:number[],material:MeshStandardMaterial|MeshBasicMaterial=concrete)=>{const v=batches.get(material)??[];v.push(...a,...b,...c,...a,...c,...d);batches.set(material,v);};
 const edges=route.p.map((p,i)=>{const a=route.p[Math.max(0,i-1)],b=route.p[Math.min(route.p.length-1,i+1)],dx=b[0]-a[0],dz=b[1]-a[1],length=Math.hypot(dx,dz)||1;return [-1,1].map(side=>[p[0]-dz/length*route.w/2*side,route.y[i],p[1]+dx/length*route.w/2*side]);});
 for(let i=1;i<edges.length;i++){
  const [a,b]=edges[i-1],[c,d]=edges[i];quad(a,b,d,c,route.covered?tunnelInterior.floor:asphalt);
  if(route.covered){
   quad([a[0],a[1]+4.8,a[2]],[b[0],b[1]+4.8,b[2]],[d[0],d[1]+4.8,d[2]],[c[0],c[1]+4.8,c[2]],tunnelInterior.roof);
   if(i%8===0)for(const side of [0,1]){const p=edges[i-1][side],q=edges[i][side],inset=side===0?.2:-.2,dx=(b[0]-a[0])/route.w,dz=(b[2]-a[2])/route.w;quad([p[0]+dx*inset,p[1]+4.25,p[2]+dz*inset],[q[0]+dx*inset,q[1]+4.25,q[2]+dz*inset],[q[0]+dx*inset,q[1]+4.4,q[2]+dz*inset],[p[0]+dx*inset,p[1]+4.4,p[2]+dz*inset],light);}
  }
  // A dashed lane line follows the road profile into and out of the underpass.
  if(i%3===0&&route.w>=6.4){const p=route.p[i-1],q=route.p[i],y=route.y[i-1]+.02,z=route.y[i]+.02,dx=q[0]-p[0],dz=q[1]-p[1],length=Math.hypot(dx,dz)||1,nx=-dz/length*.06,nz=dx/length*.06;quad([p[0]-nx,y,p[1]-nz],[p[0]+nx,y,p[1]+nz],[q[0]+nx,z,q[1]+nz],[q[0]-nx,z,q[1]-nz],paint);}
 }
 for(const line of route.walls)for(let i=1;i<line.length;i++){
  const a=line[i-1],b=line[i],ya=nearestPath(...a,route.p,route.y).y,yb=nearestPath(...b,route.p,route.y).y;
  if(!route.covered&&Math.min(ya,yb)>-.22)continue;
  const topA=route.covered?ya+4.8:.48,topB=route.covered?yb+4.8:.48;
  quad([a[0],ya,a[1]],[b[0],yb,b[1]],[b[0],topB,b[1]],[a[0],topA,a[1]],route.covered?tunnelInterior.wall:concrete);
  if(!route.covered)quad([a[0],.48,a[1]],[b[0],.48,b[1]],[b[0],1.2,b[1]],[a[0],1.2,a[1]],roof);
 }
 // The portal lintel stays above the 4.8 m clear opening, never across the road.
 if(route.covered)for(const i of [0,edges.length-1]){const [a,b]=edges[i];quad([a[0],a[1]+4.8,a[2]],[b[0],b[1]+4.8,b[2]],[b[0],.4,b[2]],[a[0],.4,a[2]]);}
 for(const [material,vertices] of batches){const g=new BufferGeometry();g.setAttribute('position',new Float32BufferAttribute(vertices,3));g.computeVertexNormals();const mesh=new Mesh(g,material);mesh.receiveShadow=true;mesh.castShadow=true;root.add(mesh);}
 return root;
}
