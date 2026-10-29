import { Group, Mesh, InstancedMesh, BoxGeometry, CylinderGeometry, ExtrudeGeometry, Shape, CatmullRomCurve3, Vector3, Quaternion, Matrix4, MeshStandardMaterial, type BufferGeometry } from 'three/webgpu';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { inPolygon } from './south-axis-layout.ts';
import type { Point, Area, TileData } from './types.ts';

export type ShoreLight={a:Point;b:Point};
// Ignore enclosed ornamental pools; retain both the main river and the channel north of Haixinsha.
export function riverAreas(data:TileData[]):Area[]{
  return data.flatMap(t=>t.areas).filter(a=>{
    if(a.kind!=='water')return false;
    const p=a.p[0],area=Math.abs(p.reduce((s,b,i)=>{const c=p[(i+1)%p.length];return s+b[0]*c[1]-c[0]*b[1];},0))/2;
    return area>30000&&p.some(([x,z])=>x>-1750&&x<1550&&z>320&&z<1300);
  });
}
export function shorelineLights(data:TileData[]):ShoreLight[]{
  const water=riverAreas(data),wet=(x:number,z:number)=>water.some(a=>inPolygon(x,z,a.p));
  const result:ShoreLight[]=[];
  for(const area of water)for(const ring of area.p)for(let i=1;i<ring.length;i++){
    const a=ring[i-1],b=ring[i],dx=b[0]-a[0],dz=b[1]-a[1],length=Math.hypot(dx,dz);if(length<.5)continue;
    // A neighbouring streamed tile may be absent: its 600m clipping edge still is not a bank.
    if((Math.abs(dx)<.001&&Math.abs(a[0]/600-Math.round(a[0]/600))<1e-6)||(Math.abs(dz)<.001&&Math.abs(a[1]/600-Math.round(a[1]/600))<1e-6))continue;
    const nx=-dz/length,nz=dx/length,count=Math.ceil(length/12);
    for(let j=0;j<count;j++){
      const x=a[0]+dx*(j+.5)/count,z=a[1]+dz*(j+.5)/count;
      if(x< -1700||x>1500||z<340||z>1250)continue;
      const left=wet(x+nx*.8,z+nz*.8),right=wet(x-nx*.8,z-nz*.8);
      if(left===right)continue; // Shared tile cuts are water on both sides, not an embankment.
      const side=left?-1:1,offset=.35*side;
      result.push({a:[a[0]+dx*j/count+nx*offset,a[1]+dz*j/count+nz*offset],b:[a[0]+dx*(j+1)/count+nx*offset,a[1]+dz*(j+1)/count+nz*offset]});
    }
  }
  return result;
}

// A local sightseeing circuit between Haixin Bridge and Liede Bridge, not a published shipping route.
// Turn before the low simplified Liede deck; never send vessels through its collision envelope.
const cruiseRoute=new CatmullRomCurve3([[-640,805],[-430,765],[100,765],[440,810],[390,860],[-110,870],[-550,855]].map(([x,z])=>new Vector3(x,.1,z)),true,'centripetal');
export const cruiseRouteLength=cruiseRoute.getLength();
export function cruisePose(seconds:number,index:number){
  const u=((seconds*3.2/cruiseRouteLength+index/3)%1+1)%1,p=cruiseRoute.getPointAt(u),t=cruiseRoute.getTangentAt(u);
  return {x:p.x,z:p.z,heading:Math.atan2(t.x,t.z)};
}

export class Waterfront {
  readonly root=new Group();
  private banks=new Group();
  private boats:Group[]=[];
  private water:Area[]=[];
  private shoreMaterial=new MeshStandardMaterial({name:'Warm embankment light',color:'#ecd7ac',emissive:'#ffd294',roughness:.7});
  private windows=new MeshStandardMaterial({name:'Cruise cabin windows',color:'#365360',emissive:'#ffdfaa',roughness:.25,metalness:.2});
  private accents:MeshStandardMaterial[]=[];
  constructor(){
    this.root.name='珠江两岸照明与夜游船 · 实拍参考 / 位置与船型为近似';
    this.root.add(this.banks);
    const hull=new MeshStandardMaterial({color:'#f0ece1',roughness:.55}),dark=new MeshStandardMaterial({color:'#27343d',roughness:.6});
    for(let i=0;i<3;i++){
      const boat=new Group(),accent=new MeshStandardMaterial({name:'Cruise outline light',color:'#dce2df',emissive:['#edbe79','#83b4f3','#c484d5'][i],roughness:.45});
      this.accents.push(accent);
      const parts=new Map<MeshStandardMaterial,BufferGeometry[]>(),add=(g:BufferGeometry,m:MeshStandardMaterial)=>{const list=parts.get(m)??[];list.push(g);parts.set(m,list);};
      const box=(x:number,y:number,z:number,w:number,h:number,d:number,m:MeshStandardMaterial)=>add(new BoxGeometry(w,h,d).translate(x,y,z),m);
      const outline=new Shape();outline.moveTo(-4,-17);outline.lineTo(-5,11);outline.quadraticCurveTo(-4.5,17,0,22);outline.quadraticCurveTo(4.5,17,5,11);outline.lineTo(4,-17);outline.closePath();
      add(new ExtrudeGeometry(outline,{depth:1.5,bevelEnabled:false,curveSegments:8}).rotateX(-Math.PI/2).rotateY(Math.PI),hull);
      for(const y of [1.8,4.3,6.8]){
        box(0,y,-1,10,.3,34,hull);
        for(const side of [-1,1])box(side*5.02,y+.12,-1,.13,.18,33,accent);
      }
      box(0,1.1,-1,8,1.1,31,dark);
      for(const y of [3.1,5.55])for(const side of [-1,1]){
        box(side*4.55,y,-1,.1,2.1,29,this.windows);
        for(let z=-15;z<=14;z+=3)box(side*4.65,y,z,.18,2.15,.18,hull);
      }
      box(0,7.7,9,5.8,1.5,5,this.windows);box(0,8.55,9,6.2,.2,5.5,hull);
      for(const side of [-1,1])for(const z of [-13,1])box(side*3.4,7.55,z,.15,1.4,.15,hull);
      box(0,8.3,-6,7.5,.2,17,hull);
      for(const side of [-1,1]){
        box(side*4.6,7.45,-2,.1,.12,31,accent);
        for(let z=-16;z<=13;z+=3)box(side*4.6,7.1,z,.08,.7,.08,hull);
      }
      for(const [material,geometries] of parts){
        const flat=geometries.map(g=>{const f=g.index?g.toNonIndexed():g;if(f!==g)g.dispose();return f;});
        const geometry=mergeGeometries(flat,false)!;flat.forEach(g=>g.dispose());
        const mesh=new Mesh(geometry,material);mesh.layers.enable(1);mesh.castShadow=true;boat.add(mesh);
      }
      boat.name=`珠江夜游船 ${i+1} · 双层舱 / 观景甲板`;this.boats.push(boat);this.root.add(boat);
    }
    this.update(0,0);
  }
  setMap(data:TileData[]){
    this.water=riverAreas(data);
    this.banks.traverse(o=>{if(o instanceof Mesh){o.geometry.dispose();if(o instanceof InstancedMesh)o.dispose();}});this.banks.clear();
    const lights=shorelineLights(data);if(!lights.length)return;
    const rail=new InstancedMesh(new BoxGeometry(.45,.22,1),this.shoreMaterial,lights.length),posts=new InstancedMesh(new CylinderGeometry(.12,.16,1.15,6),this.shoreMaterial,Math.ceil(lights.length/2));
    const matrix=new Matrix4(),up=new Vector3(0,1,0);let count=0;
    lights.forEach(({a,b},i)=>{
      const dx=b[0]-a[0],dz=b[1]-a[1],length=Math.hypot(dx,dz),x=(a[0]+b[0])/2,z=(a[1]+b[1])/2;
      rail.setMatrixAt(i,matrix.compose(new Vector3(x,.85,z),new Quaternion().setFromAxisAngle(up,Math.atan2(dx,dz)),new Vector3(1,1,length)));
      if(i%2===0)posts.setMatrixAt(count++,matrix.makeTranslation(a[0],.75,a[1]));
    });
    for(const mesh of [rail,posts]){mesh.layers.enable(1);mesh.computeBoundingSphere();this.banks.add(mesh);}
  }
  update(seconds:number,night:number){
    this.banks.visible=night>.02;this.shoreMaterial.emissiveIntensity=night*1.25;this.windows.emissiveIntensity=night*.85;
    this.accents.forEach(m=>m.emissiveIntensity=night*1.1);
    this.boats.forEach((boat,i)=>{const p=cruisePose(seconds,i);boat.visible=this.water.some(a=>inPolygon(p.x,p.z,a.p));boat.position.set(p.x,-.15+Math.sin(seconds*.7+i)*.035,p.z);boat.rotation.y=p.heading;});
  }
  dispose(){
    const materials=new Set<MeshStandardMaterial>();this.root.traverse(o=>{if(o instanceof Mesh){o.geometry.dispose();if(o instanceof InstancedMesh)o.dispose();for(const m of Array.isArray(o.material)?o.material:[o.material])materials.add(m as MeshStandardMaterial);}});
    materials.forEach(m=>m.dispose());this.root.clear();
  }
}
