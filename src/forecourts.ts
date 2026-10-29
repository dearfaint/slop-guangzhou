import {palette} from './materials.ts';
import {streetPavingData} from './street-paving-data.ts';
import {hasTreeGrate} from './street-detail-layout.ts';
import {Group,Vector2,Shape,Path,ShapeGeometry,Mesh,MeshStandardMaterial,MeshStandardNodeMaterial,InstancedMesh,IcosahedronGeometry,Matrix4,Vector3,Quaternion,BufferGeometry,Float32BufferAttribute,DoubleSide} from 'three/webgpu';
import {CURB_RISE,ROAD_TOP} from './curb.ts';
import {positionWorld,fract,min,smoothstep,mix,color} from 'three/tsl';
import {mergeGeometries} from 'three/addons/utils/BufferGeometryUtils.js';
import {activeForecourts} from './forecourt-layout.ts';
import type {Point,TileData} from './types';

export class Forecourts {
  readonly root=new Group();
  constructor(){this.root.name='City-wide forecourts · inferred paving and planting';}
  setMap(data:TileData[]){
    this.dispose();
    const sites=activeForecourts(data),roads=new Set(data.flatMap(t=>t.roads.map(r=>r.id))),pavingTiles=streetPavingData.filter(t=>t.roads.some(id=>roads.has(id))),aprons=pavingTiles.flatMap(t=>t.p) as Point[][][];if(!sites.length&&!aprons.length)return;
    const paving=new MeshStandardNodeMaterial({roughness:.96});
    // World-space joints keep a consistent 1.2 m slab size across irregular polygons.
    const uv=fract(positionWorld.xz.div(1.2)),edge=min(min(uv.x,uv.y),min(uv.x.oneMinus(),uv.y.oneMinus()));
    paving.colorNode=mix(color('#9b9b8d'),color('#bab9aa'),smoothstep(.012,.028,edge));
    const surface=(polygons:Point[][][],height:number,material:MeshStandardMaterial|MeshStandardNodeMaterial,kerb=false)=>{
      const parts=polygons.map(rings=>{const shape=new Shape(rings[0].map(([x,z])=>new Vector2(x,-z)));for(const ring of rings.slice(1)){const hole=new Path();ring.forEach(([x,z],i)=>i?hole.lineTo(x,-z):hole.moveTo(x,-z));shape.holes.push(hole);}const g=new ShapeGeometry(shape);g.rotateX(-Math.PI/2);g.translate(0,height,0);return g;});
      if(!parts.length){material.dispose();return;}
      const geometry=mergeGeometries(parts);parts.forEach(p=>p.dispose());const mesh=new Mesh(geometry,material);mesh.receiveShadow=true;this.root.add(mesh);
      if(kerb){
        // Vertical kerb face down to the carriageway deck, so raised paving does not read as a floating sheet.
        const v:number[]=[],bottom=ROAD_TOP-.05;
        for(const rings of polygons)for(const ring of rings)for(let i=0;i<ring.length;i++){const [ax,az]=ring[i],[bx,bz]=ring[(i+1)%ring.length];v.push(ax,height,az,bx,height,bz,bx,bottom,bz,ax,height,az,bx,bottom,bz,ax,bottom,az);}
        const faces=new BufferGeometry();faces.setAttribute('position',new Float32BufferAttribute(v,3));faces.computeVertexNormals();
        const side=material.clone();side.side=DoubleSide;const skirt=new Mesh(faces,side);skirt.receiveShadow=true;this.root.add(skirt);
      }
    };
    // Distinct levels under the raised footways (FOOT_TOP): overlapping coplanar layers z-fight.
    surface(aprons,.27+CURB_RISE,new MeshStandardMaterial({color:palette.path,roughness:1}),true);
    surface([...sites.flatMap(s=>s.paving),...pavingTiles.flatMap(t=>t.plaza??[])],.275+CURB_RISE,paving);
    surface(sites.flatMap(s=>s.border),.295+CURB_RISE,new MeshStandardMaterial({color:'#7d827b',roughness:1}));
    const beds=sites.flatMap(s=>s.beds);
    surface(beds.map(b=>b.p),.33+CURB_RISE,new MeshStandardMaterial({color:'#655d44',roughness:1}));
    if(beds.length){
      const shrubSites=beds.flatMap(b=>Array.from({length:6},(_,j)=>({b,j})).filter(({j})=>!hasTreeGrate(b.x,b.z)||j===2||j===3));
      const geometry=new IcosahedronGeometry(1,1),material=new MeshStandardMaterial({color:'#60805a',roughness:1}),shrubs=new InstancedMesh(geometry,material,shrubSites.length);
      shrubSites.forEach(({b,j},i)=>{const along=(j-2.5)*1.85;shrubs.setMatrixAt(i,new Matrix4().compose(new Vector3(b.x+Math.sin(b.angle)*along,.62+CURB_RISE,b.z+Math.cos(b.angle)*along),new Quaternion().setFromAxisAngle(new Vector3(0,1,0),b.angle),new Vector3(1.55,.38,1.25)));});
      shrubs.castShadow=true;shrubs.receiveShadow=true;shrubs.computeBoundingSphere();this.root.add(shrubs);
    }
  }
  dispose(){for(const child of [...this.root.children]){const mesh=child as Mesh;mesh.geometry.dispose();(mesh.material as MeshStandardMaterial).dispose();if(child instanceof InstancedMesh)child.dispose();}this.root.clear();}
}
