import { Group, Mesh, BufferGeometry, Float32BufferAttribute, MeshStandardNodeMaterial } from 'three/webgpu';
import { attribute, float, positionView, smoothstep, viewportSize } from 'three/tsl';
import { createRoadLayout } from './road-layout.ts';
import type { TileData } from './types.ts';
export class RoadMarkings {
 readonly root=new Group();
 private white=new MeshStandardNodeMaterial({color:'#e6e4d4',roughness:.9,transparent:true,depthWrite:false,polygonOffset:true,polygonOffsetFactor:-1,polygonOffsetUnits:-1});
 private yellow=new MeshStandardNodeMaterial({color:'#cfb44e',roughness:.9,transparent:true,depthWrite:false,polygonOffset:true,polygonOffsetFactor:-1,polygonOffsetUnits:-1});
 private stats={crossings:0,stops:0,rectangles:0};
 constructor(){
  this.root.name='Inferred lane paint and crossings';this.root.userData.source='inferred:road';
  // Fade subpixel paint instead of letting distant 12 cm lines sparkle into white noise.
  const coverage=smoothstep(.65,1.6,float(attribute('paintWidth','float')).mul(viewportSize.y).div(positionView.z.negate().max(1)));
  this.white.opacityNode=coverage;this.yellow.opacityNode=coverage;
 }
 setMap(data:TileData[]){
  this.clear();const {paint,crossings,stops}=createRoadLayout(data),batches:[number[],number[]]=[[],[]],widths:[number[],number[]]=[[],[]];
  for(const p of paint){
   const a=p.length/2,b=p.width/2,corners=[[-a,-b],[a,-b],[a,b],[-a,b]].map(([u,v])=>[p.x+p.dx*u-p.dz*v,.374,p.z+p.dz*u+p.dx*v]);
   const vertices=batches[p.kind==='center'?1:0];
   for(const i of [0,2,1,0,3,2]){vertices.push(...corners[i]);widths[p.kind==='center'?1:0].push(Math.min(p.length,p.width));}
  }
  batches.forEach((vertices,i)=>{if(!vertices.length)return;const g=new BufferGeometry();g.setAttribute('position',new Float32BufferAttribute(vertices,3));g.setAttribute('paintWidth',new Float32BufferAttribute(widths[i],1));g.computeVertexNormals();g.computeBoundingSphere();this.root.add(new Mesh(g,i===0?this.white:this.yellow));});
  this.stats={crossings,stops,rectangles:paint.length};
 }
 getStats(){return this.stats;}
 private clear(){for(const mesh of this.root.children)(mesh as Mesh).geometry.dispose();this.root.clear();}
 dispose(){this.clear();this.white.dispose();this.yellow.dispose();}
}
