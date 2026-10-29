import {Group,Mesh,InstancedMesh,BufferGeometry,Float32BufferAttribute,BoxGeometry,MeshStandardMaterial,Vector3,type Material} from 'three/webgpu';
import {operaPaving,operaGlass,createOperaWater,operaSurfaceUV} from './opera-materials.ts';
import {mergeGeometries} from 'three/addons/utils/BufferGeometryUtils.js';
import {detailPolygon,detailRibbon} from './south-axis.ts';
import {operaPlaza,operaPool,operaLawn,operaEastLawn,operaGroundHeight,operaLawnHeight,operaEntry,operaEntryHeight} from './opera-layout.ts';
import {SlopTrees} from './slop-trees.ts';
import type {Point} from './types.ts';

const close=(p:Point[])=>[...p,p[0]];
export class OperaSite{
 readonly root=new Group();
 private trees:SlopTrees;
 private materials:Material[]=[];
 private disposePool:()=>void;
 constructor(){
  this.root.name='广州大剧院 · 水院与阶地';this.root.userData={source:'用户航拍照片及现有地图水池边界',heightSource:'照片估算'};
  const batches=new Map<Material,BufferGeometry[]>();
  const add=(g:BufferGeometry,m:Material)=>{const list=batches.get(m)??[];list.push(operaSurfaceUV(g.index?g.toNonIndexed():g));batches.set(m,list);};
  const mat=(color:string,roughness=.9)=>{const m=new MeshStandardMaterial({color,roughness});this.materials.push(m);return m;};
  const pool=createOperaWater();this.disposePool=pool.dispose;this.root.add(pool.target);
  const stone=operaPaving,paving=operaPaving,edge=mat('#879499'),grass=mat('#6b834b'),water=pool.material,glass=operaGlass;
  add(detailPolygon([operaPlaza,operaPool,operaEntry],.425),paving);
  add(detailPolygon([operaPool],.2),water);
  add(detailRibbon(close(operaPool),.48,.45),stone);
  const wall=(p:Point[],bottom:number,top:number)=>{
   const v:number[]=[];for(let i=0;i<p.length;i++){const a=p[i],b=p[(i+1)%p.length];v.push(a[0],bottom,a[1],b[0],bottom,b[1],b[0],top,b[1],a[0],bottom,a[1],b[0],top,b[1],a[0],top,a[1]);}
   const g=new BufferGeometry();g.setAttribute('position',new Float32BufferAttribute(v,3));g.computeVertexNormals();add(g,edge);
  };
  wall(operaPool,.15,.42);
  // Broad shallow steps follow the southern pool edge; the eastern apron has a level upper landing.
  for(let i=0;i<12;i++){
   const z=185+i,y=.42+i*.1;
   add(new BoxGeometry(96,Math.max(.06,y-.40),1).translate(-418,(y+.4)/2,z+.5),stone);
   add(detailRibbon([[-466,z],[-370,z]],.055,y+.003),edge);
  }
  add(detailPolygon([[[-466,197],[-370,197],[-370,210],[-466,210]]],1.62),paving);
  wall([[-466,197],[-370,197],[-370,210],[-466,210]],.42,1.62);
  add(detailPolygon([operaLawn],z=>operaLawnHeight(z)),grass);
  add(detailRibbon(close(operaLawn),.38,close(operaLawn).map(([,z])=>operaLawnHeight(z))),stone);
  add(detailPolygon([operaEastLawn],.58),grass);wall(operaEastLawn,.42,.58);
  // Triangular sunken entrance between the halls, framed by low folded concrete cheeks.
  add(detailPolygon([operaEntry],z=>operaEntryHeight(z)),edge);
  const entryWalls:number[]=[];
  for(let i=0;i<2;i++){
   const a=operaEntry[i],b=operaEntry[i+1],al=[a[0],operaEntryHeight(a[1]),a[1]],bl=[b[0],operaEntryHeight(b[1]),b[1]],ah=[a[0],.64,a[1]],bh=[b[0],.64,b[1]];
   entryWalls.push(...al,...bl,...bh,...al,...bh,...ah,...al,...bh,...bl,...al,...ah,...bh);
  }
  const cheeks=new BufferGeometry();cheeks.setAttribute('position',new Float32BufferAttribute(entryWalls,3));cheeks.computeVertexNormals();add(cheeks,stone);
  add(detailRibbon(operaEntry,.45,.65),stone);
  // Long glazed skylights are inset into the grass and the west approach.
  for(const [x,z,w,d] of [[-457,220,14,2.6],[-598,195,12,2.4]]){
   const y=operaGroundHeight(x,z)??.42;
   add(new BoxGeometry(w,.12,d).translate(x,y+.13,z),glass);
   for(let i=0;i<=5;i++)add(new BoxGeometry(.07,.14,d+.1).translate(x-w/2+w*i/5,y+.15,z),edge);
   for(const side of [-1,1])add(new BoxGeometry(w,.14,.08).translate(x,y+.15,z+side*d/2),edge);
  }
  // Fan-shaped joints on the open western forecourt stay below the pedestrian surface.
  for(let i=0;i<14;i++)add(detailRibbon([[-580+i*5,196+i*.35],[-602+i*7.5,217]],.07,.434),edge);
  for(const [m,parts] of batches){const g=mergeGeometries(parts,false)!;parts.forEach(p=>p.dispose());const mesh=new Mesh(g,m);mesh.receiveShadow=true;this.root.add(mesh);}
  const trees:{x:number;z:number;height:number}[]=[];
  for(let x=-603;x< -380;x+=8.2)trees.push({x,z:237+(Math.sin(x)*1.8),height:8.5+Math.abs(Math.sin(x))*2.5});
  for(let z=165;z<215;z+=9)trees.push({x:-617,z,height:7.5});
  for(const [x,z] of [[-378,104],[-373,116],[-599,206]])trees.push({x,z,height:7.5});
  this.trees=new SlopTrees(trees);this.root.add(this.trees.root);
 }
 update(camera:Vector3){this.trees.update(camera);}
 dispose(){this.trees.dispose();this.disposePool();for(const c of this.root.children)if(c instanceof Mesh&&!(c instanceof InstancedMesh))c.geometry.dispose();for(const m of this.materials)m.dispose();this.root.clear();}
}
