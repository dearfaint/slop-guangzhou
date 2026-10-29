import { CURB_RISE, lawnIndex } from './curb.ts';
import { axisGroveTrees } from './axis-groves.ts';
import {activeForecourts} from './forecourt-layout.ts';
import {createRoadDividers,type RoadDivider} from './road-dividers.ts';
import {createTunnelGardens,type TunnelGarden} from './tunnel-gardens.ts';
import { streetLampHousing, hydrantGeometry, mailboxGeometry } from './slop-street-models.ts';
import { Group, InstancedMesh, MeshStandardMaterial, CylinderGeometry, IcosahedronGeometry, BoxGeometry, BufferGeometry, Matrix4, Quaternion, Vector3, Color } from 'three/webgpu';
import type { TileData } from './types';
import { SlopTrees, mappedTreeSites } from './slop-trees.ts';
import { createStreetLayout } from './street-layout.ts';
import type { StreetItem, StreetLayout } from './street-layout.ts';

export class Streets {
  readonly root=new Group();
  private layout:StreetLayout={trees:[],palms:[],lamps:[],planters:[],benches:[]};
  private batches:{mesh:InstancedMesh;items:StreetItem[];matrix:(item:StreetItem)=>Matrix4}[]=[];
  private materials:MeshStandardMaterial[]=[];
  private bulb?:MeshStandardMaterial;
  private trees?:SlopTrees;
  private mappedTrees=0;
  private tunnelGardens=0;
  private lastCamera=new Vector3(Infinity,Infinity,Infinity);
  constructor(){this.root.name='Inferred park planting and roadside amenities';this.root.userData.provenance='Tree species, spacing, heights and amenity locations are estimates derived from OSM park and road geometry; mapped tree rows are excluded.';}
  setMap(data:TileData[]) {
    this.clear();this.layout=createStreetLayout(data);
    // Roadside lamps stand on the raised footway; those on lawns stay on the low park paths.
    const lawns=lawnIndex(data.flatMap(t=>t.areas));this.layout.lamps=this.layout.lamps.map(p=>({...p,lift:lawns.has(p.x,p.z)?0:CURB_RISE}));this.lastCamera.set(Infinity,Infinity,Infinity);
    const material=(color:string,metalness=0)=>{const m=new MeshStandardMaterial({color,roughness:.8,metalness});this.materials.push(m);return m;};
    const metal=material('#505f60',.5),stone=material('#b9b5a8'),wood=material('#a18562'),flowers=material('#a15d7b');
    const matrix=(p:StreetItem,x:number,y:number,z:number,sx:number,sy:number,sz:number)=>new Matrix4().compose(new Vector3(p.x+Math.cos(p.angle)*x+Math.sin(p.angle)*z,y,p.z-Math.sin(p.angle)*x+Math.cos(p.angle)*z),new Quaternion().setFromAxisAngle(new Vector3(0,1,0),p.angle),new Vector3(sx,sy,sz));
    const batch=(geometry:BufferGeometry,mat:MeshStandardMaterial,items:StreetItem[],transform:(p:StreetItem)=>Matrix4)=>{
      if(!items.length){geometry.dispose();return undefined;}
      const mesh=new InstancedMesh(geometry,mat,items.length);mesh.castShadow=true;mesh.receiveShadow=true;
      const color=new Color();items.forEach((p,i)=>{mesh.setMatrixAt(i,transform(p));color.set(mat.color).multiplyScalar(.85+.25*((Math.sin(p.x*11+p.z*3)+1)/2));mesh.setColorAt(i,color);});
      mesh.computeBoundingSphere();this.root.add(mesh);this.batches.push({mesh,items,matrix:transform});return mesh;
    };
    const dividerItems=createRoadDividers(data).map(d=>({...d,angle:Math.atan2(d.dx,d.dz),height:0,source:'inferred:roadside' as const,reference:d.roads.join(' / ')}));
    const dividerMatrix=(p:StreetItem,y:number,height:number,widthFactor:number,lengthFactor=1)=>{const d=p as StreetItem&RoadDivider;return matrix(p,0,y,0,d.width*widthFactor,height,d.length*lengthFactor);};
    const planting=dividerItems.filter(d=>d.kind==='planting'),rails=dividerItems.filter(d=>d.kind==='rail');
    batch(new BoxGeometry(1,1,1),material('#dadbd1'),planting,p=>dividerMatrix(p,.395,.24,1));
    batch(new IcosahedronGeometry(1,0),material('#8ba879'),planting,p=>dividerMatrix(p,.705,.30,.39,.5));
    const dividerMetal=material('#d9ded8',.35);
    batch(new BoxGeometry(1,1,1),dividerMetal,rails,p=>dividerMatrix(p,.82,.10,1));
    batch(new BoxGeometry(1,1,1),dividerMetal,rails,p=>dividerMatrix(p,.45,.8,1,.035));
    const gardens=createTunnelGardens(data).map(b=>({...b,angle:Math.atan2(b.dx,b.dz),height:0,source:'inferred:roadside' as const,reference:'tunnel '+b.kind}));this.tunnelGardens=gardens.length;
    const gardenMatrix=(p:StreetItem,y:number,h:number,inset=0)=>{const b=p as StreetItem&TunnelGarden;return matrix(p,0,y,0,b.width-inset,h,b.length-inset);};
    // Solid stone beds, recessed soil and two tones of low clipped planting. No tall trees at the mouth.
    batch(new BoxGeometry(1,1,1),stone,gardens,p=>gardenMatrix(p,.17,.84));
    batch(new BoxGeometry(1,1,1),material('#655d46'),gardens,p=>gardenMatrix(p,.595,.025,.2));
    const shrubs=gardens.flatMap(b=>[-1,0,1].flatMap(along=>(b.width>3?[-1,1]:[0]).map(side=>({...b,x:b.x+b.dx*along*b.length*.29-b.dz*side*b.width*.24,z:b.z+b.dz*along*b.length*.29+b.dx*side*b.width*.24}))));
    for(const tone of [0,1])batch(new IcosahedronGeometry(1,1),material(tone?'#7d9358':'#466e46'),shrubs.filter((_,i)=>i%2===tone),p=>{const b=p as StreetItem&TunnelGarden;return matrix(p,0,.8,0,Math.min(.75,b.width*.38),.24,.95);});
    const reflectors=material('#f2ce72',.2);reflectors.emissive.set('#9a792c');reflectors.emissiveIntensity=.3;
    batch(new BoxGeometry(1,1,1),reflectors,gardens.filter(b=>b.kind==='median'),p=>{const b=p as StreetItem&TunnelGarden;return matrix(p,0,.63,b.length*.43,Math.min(.36,b.width*.35),.08,.1);});
    const mapped=[...mappedTreeSites(data),...activeForecourts(data).flatMap(s=>s.beds.flatMap(b=>b.trees)),...axisGroveTrees(data)];this.mappedTrees=mapped.length;
    this.trees=new SlopTrees([...this.layout.trees,...this.layout.palms,...mapped]);for(const mesh of this.trees.meshes)this.root.add(mesh);
    batch(new CylinderGeometry(.085,.13,1,6),metal,this.layout.lamps,p=>matrix(p,0,.4+p.lift!+p.height/2,0,1,p.height,1));
    // Distant lenses stay emissive; nearby illumination comes from NightLights.
    this.bulb=material('#d8d6b9');this.bulb.emissive.set('#ffd68a');
    batch(streetLampHousing(),metal,this.layout.lamps,p=>matrix(p,0,p.height+.6+p.lift!,.35,1,1,1));
    batch(new BoxGeometry(1.2,.04,.48),this.bulb,this.layout.lamps,p=>matrix(p,0,p.height+.4+p.lift!,.35,1,1,1));
    batch(new CylinderGeometry(1.4,1.1,.65,8),stone,this.layout.planters,p=>matrix(p,0,.65,0,1,1,1));
    batch(new IcosahedronGeometry(1,0),flowers,this.layout.planters,p=>matrix(p,0,1.15,0,1.2,.45,1.2));
    batch(hydrantGeometry(),material('#b8241e',.4),this.layout.lamps.filter((_,i)=>i%4===0),p=>matrix(p,1.2,.78+p.lift!,0,1,1,1));
    batch(mailboxGeometry(),material('#183c7a',.35),this.layout.lamps.filter((_,i)=>i%8===0),p=>matrix(p,-1.2,.84+p.lift!,0,1,1,1));
    batch(new BoxGeometry(2.1,.18,.7),wood,this.layout.benches,p=>matrix(p,0,.85,0,1,1,1));
    batch(new BoxGeometry(1.6,.45,.45),stone,this.layout.benches,p=>matrix(p,0,.53,0,1,1,1));
  }
  update(night:number,cameraPosition:Vector3) {
    if(this.bulb)this.bulb.emissiveIntensity=Math.max(0,Math.min(1,night))*2.3;
    this.trees?.update(cameraPosition);
    if(this.lastCamera.distanceToSquared(cameraPosition)<2500)return;
    this.lastCamera.copy(cameraPosition);
    // Compact nearby instances into each draw; no per-frame temporary geometry.
    for(const {mesh,items,matrix} of this.batches){let count=0;for(const p of items)if(Math.hypot(p.x-cameraPosition.x,p.z-cameraPosition.z)<1900)mesh.setMatrixAt(count++,matrix(p));mesh.count=count;mesh.instanceMatrix.needsUpdate=true;}
  }
  // Lamps stand on the raised footway; night lights read the lens height from here.
  getLampSites(){return this.layout.lamps.map(p=>({...p,height:p.height+p.lift!}));}
  getStats(){return {trees:this.layout.trees.length+this.layout.palms.length+this.mappedTrees,lamps:this.layout.lamps.length,planters:this.layout.planters.length,benches:this.layout.benches.length,tunnelGardens:this.tunnelGardens,batches:this.batches.length+(this.trees?.meshes.length??0),source:'inferred:park/roadside'};}
  private clear(){this.trees?.dispose();this.trees=undefined;this.tunnelGardens=0;for(const {mesh} of this.batches){mesh.geometry.dispose();mesh.dispose();}for(const mat of this.materials)mat.dispose();this.root.clear();this.batches=[];this.materials=[];this.bulb=undefined;}
  dispose(){this.clear();}
}
