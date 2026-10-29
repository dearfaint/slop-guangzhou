import * as THREE from 'three/webgpu';

function keyBundle(color:string){
 const root=new THREE.Group(),swing=new THREE.Group();swing.position.set(0,-.012,.035);root.add(swing);
 const steel=new THREE.MeshStandardMaterial({color:'#b7c2c8',metalness:.85,roughness:.25});
 const brass=new THREE.MeshStandardMaterial({color:'#bc9855',metalness:.8,roughness:.3});
 const loop=new THREE.Mesh(new THREE.BoxGeometry(.009,.024,.002),new THREE.MeshStandardMaterial({color,roughness:1}));loop.position.set(0,.006,-.001);root.add(loop);
 const clip=new THREE.Mesh(new THREE.TorusGeometry(.007,.0018,6,16),steel);clip.scale.y=1.5;clip.position.y=-.008;root.add(clip);
 const hook=new THREE.Mesh(new THREE.TubeGeometry(new THREE.CatmullRomCurve3([new THREE.Vector3(0,-.008,0),new THREE.Vector3(0,-.017,.020),new THREE.Vector3(0,-.026,.035)]),8,.0012,6,false),steel);root.add(hook);
 const ring=new THREE.Mesh(new THREE.TorusGeometry(.013,.0015,6,24),steel);ring.position.y=-.027;swing.add(ring);
 for(let i=0;i<5;i++){
  const item=new THREE.Group();item.position.set((i-2)*.003,-.038,(i-2)*.002);item.rotation.set(.12*(i-2),0,(i-2)*.22);
  const head=new THREE.Shape();head.absarc(0,0,.007,0,Math.PI*2,false);const hole=new THREE.Path();hole.absarc(0,0,.003,0,Math.PI*2,true);head.holes.push(hole);
  const options={depth:.0015,bevelEnabled:true,bevelSize:.0004,bevelThickness:.0003,bevelSegments:1,curveSegments:12};
  const metal=i%2?brass:steel;item.add(new THREE.Mesh(new THREE.ExtrudeGeometry(head,options),metal));
  const length=.035+i*.003,stem=new THREE.Shape();stem.moveTo(-.002,-.005);stem.lineTo(-.002,-length);stem.lineTo(.004,-length);
  for(let j=0;j<3;j++){const y=-length+.006+j*.007;stem.lineTo(.004,y);stem.lineTo(.001,y);stem.lineTo(.001,y+.003);stem.lineTo(.004,y+.003);}
  stem.lineTo(.003,-.005);stem.closePath();item.add(new THREE.Mesh(new THREE.ExtrudeGeometry(stem,options),metal));swing.add(item);
 }
 return {root,swing};
}
export function waistKeys(people:THREE.Group[],recipes:{age:number;shorts?:boolean;footwear?:string;keys?:boolean;bottomColor?:string}[]){
 const entries:{root:THREE.Group;swing:THREE.Group;garment:THREE.SkinnedMesh;person:THREE.Group;vertex:number;phase:number}[]=[],point=new THREE.Vector3();
 people.forEach((person,i)=>{
  const r=recipes[i];if(!(r.age>.8&&r.shorts&&r.footwear==='slippers'&&r.keys))return;
  let garment:THREE.SkinnedMesh|null=null,shirt:THREE.SkinnedMesh|null=null;person.traverse(o=>{if(!(o instanceof THREE.SkinnedMesh)||Array.isArray(o.material))return;if(o.material.name.startsWith('Fabric-shorts-'))garment=o;if(o.material.name.startsWith('Fabric-top-'))shirt=o;});
  if(!garment)return;
  const pants=garment as THREE.SkinnedMesh,top=shirt as THREE.SkinnedMesh|null;
  const position=pants.geometry.attributes.position;pants.geometry.computeBoundingBox();const box=pants.geometry.boundingBox;
  if(top)top.geometry.computeBoundingBox();
  const waistY=top?Math.min(box!.max.y-.025,top.geometry.boundingBox!.min.y-.015):box!.max.y-.025;
  const target=new THREE.Vector3(box!.min.x*.65,waistY,box!.max.z*.65);let vertex=0,best=Infinity;
  for(let j=0;j<position.count;j++){
   point.fromBufferAttribute(position,j);if(Math.abs(point.y-waistY)>.04)continue;
   const d=point.distanceToSquared(target);if(d<best){best=d;vertex=j;}
  }
  const bundle=keyBundle(r.bottomColor??"#56645b");person.add(bundle.root);entries.push({...bundle,garment:pants,person,vertex,phase:i*.73});
 });
 function update(time:number,walking:boolean){
  for(const e of entries){
   if(!e.root.visible||!e.person.visible)continue;
   e.person.updateMatrixWorld(true);e.garment.skeleton.update();e.garment.getVertexPosition(e.vertex,point);e.garment.localToWorld(point);e.person.worldToLocal(point);
   e.root.position.copy(point);e.root.position.z+=.008;
   const amplitude=walking?.16:.018;e.swing.rotation.x=.08+Math.sin(time*(walking?5.1:1.4)+e.phase)*amplitude;e.swing.rotation.z=Math.sin(time*(walking?4.2:1.1)+e.phase)*amplitude*.65;
  }
 }
 return {update,entries};
}
