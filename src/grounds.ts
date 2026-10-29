// Mapped non-park grounds: green belts (drawn with the park lawn), campus grounds,
// sports pitches, running tracks and outdoor pools, plus campus boundary fences.
// Colours and fence form are visual estimates; outlines come from OSM.
import { BoxGeometry, BufferGeometry, Float32BufferAttribute, MeshStandardMaterial } from 'three/webgpu';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import type { Area, Point, Road } from './types';

// Stacked 5 mm–1 cm apart so overlapping grounds never share a plane with the .18 lawn.
export const GROUND_LEVELS={campus:.17,track:.195,pitch:.2,pool:.2,line:.206} as const;
const TILE=600;

export const campusMaterial=new MeshStandardMaterial({color:'#b8b5a6',roughness:1});
export const trackMaterial=new MeshStandardMaterial({color:'#a9533f',roughness:.95});
export const poolMaterial=new MeshStandardMaterial({color:'#3f93b8',roughness:.15,metalness:.05});
export const lineMaterial=new MeshStandardMaterial({color:'#eeeee6',roughness:.9});
const pitchMaterials=new Map<string,MeshStandardMaterial>();
/** Courts read by sport; football, multi-use and unknown pitches are turf. */
export function pitchMaterial(sport?:string){
  const key=sport?.split(';')[0]==='basketball'?'basketball':sport?.split(';')[0]==='tennis'?'tennis':'turf';
  let m=pitchMaterials.get(key);
  if(!m){m=new MeshStandardMaterial({name:'pitch '+key,color:key==='basketball'?'#3f6f8c':key==='tennis'?'#3c7a5c':'#4e8a3e',roughness:.95});pitchMaterials.set(key,m);}
  return m;
}
export const fenceWallMaterial=new MeshStandardMaterial({color:'#cbc5b6',roughness:.95});
export const fenceRailMaterial=new MeshStandardMaterial({color:'#3a4446',roughness:.6,metalness:.4});

/** Flat band of the given width centred on a closed ring, at height y. */
export function ringRibbon(ring:Point[],width:number,y:number){
  const v:number[]=[];
  for(let i=1;i<ring.length;i++){
    const a=ring[i-1],b=ring[i],dx=b[0]-a[0],dz=b[1]-a[1],l=Math.hypot(dx,dz);if(l<.05)continue;
    const nx=-dz/l*width/2,nz=dx/l*width/2;
    v.push(a[0]-nx,y,a[1]-nz,b[0]-nx,y,b[1]-nz,b[0]+nx,y,b[1]+nz,a[0]-nx,y,a[1]-nz,b[0]+nx,y,b[1]+nz,a[0]+nx,y,a[1]+nz);
  }
  // Emit both windings so the band faces up whichever way the ring runs.
  const n=v.length;for(let i=0;i<n;i+=9)v.push(v[i],v[i+1],v[i+2],v[i+6],v[i+7],v[i+8],v[i+3],v[i+4],v[i+5]);
  const g=new BufferGeometry();g.setAttribute('position',new Float32BufferAttribute(v,3));g.computeVertexNormals();return g;
}

const onTileCut=(a:Point,b:Point)=>[0,1].some(k=>Math.abs(a[k]/TILE-Math.round(a[k]/TILE))<1e-6&&Math.abs(b[k]/TILE-Math.round(b[k]/TILE))<1e-6&&Math.round(a[k]/TILE)===Math.round(b[k]/TILE));

/**
 * Low wall with railings along campus boundaries. Tile split edges are skipped, and the
 * fence opens wherever a mapped road or path crosses it (gates). Visual only: no collision.
 */
export function campusFences(areas:Area[],roads:Road[]){
  const crossings=roads.flatMap(r=>r.p.slice(1).map((b,i)=>[r.p[i],b,r.w/2+1.2] as [Point,Point,number]));
  const open=(x:number,z:number)=>crossings.some(([a,b,pad])=>{const dx=b[0]-a[0],dz=b[1]-a[1],t=Math.max(0,Math.min(1,((x-a[0])*dx+(z-a[1])*dz)/(dx*dx+dz*dz||1)));return Math.hypot(x-a[0]-dx*t,z-a[1]-dz*t)<pad;});
  const walls:BufferGeometry[]=[],rails:BufferGeometry[]=[];
  const run=(a:Point,b:Point)=>{
    const dx=b[0]-a[0],dz=b[1]-a[1],l=Math.hypot(dx,dz);if(l<.3)return;
    const cx=(a[0]+b[0])/2,cz=(a[1]+b[1])/2,angle=Math.atan2(dx,dz);
    walls.push(new BoxGeometry(.3,.9,l).rotateY(angle).translate(cx,.45,cz));
    for(const y of [1.2,2.05])rails.push(new BoxGeometry(.05,.05,l).rotateY(angle).translate(cx,y,cz));
    const posts=Math.max(1,Math.round(l/2.4));
    for(let k=0;k<=posts;k++)rails.push(new BoxGeometry(.06,1.2,.06).translate(a[0]+dx*k/posts,1.5,a[1]+dz*k/posts));
  };
  for(const area of areas){
    if(area.kind!=='campus')continue;
    for(const ring of area.p)for(let i=1;i<ring.length;i++){
      const a=ring[i-1],b=ring[i];if(onTileCut(a,b))continue;
      // Walk the edge in ~1 m steps, emitting fence only between gate openings.
      const l=Math.hypot(b[0]-a[0],b[1]-a[1]),steps=Math.max(1,Math.ceil(l));let start:Point|undefined;
      for(let k=0;k<=steps;k++){
        const p:Point=[a[0]+(b[0]-a[0])*k/steps,a[1]+(b[1]-a[1])*k/steps],gate=open(...p);
        if(!gate&&!start)start=p;
        if(start&&(gate||k===steps)){run(start,p);start=undefined;}
      }
    }
  }
  const merge=(list:BufferGeometry[])=>{if(!list.length)return undefined;const g=mergeGeometries(list.map(x=>x.toNonIndexed()),false);list.forEach(x=>x.dispose());return g??undefined;};
  return {walls:merge(walls),rails:merge(rails)};
}
