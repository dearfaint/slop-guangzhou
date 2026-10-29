import {tunnelRoutes,tunnelAreaSurfaces} from './tunnel-layout.ts';
import {tunnelData} from './tunnel-data.ts';
import {createTunnel} from './tunnels.ts';
import {riverWaterMaterial} from './river-water.ts';
import { parkHiddenBuildings, parkRoadReplaced, parkAreaSurfaces } from './pearl-park-layout.ts';
import { createParkLawnMaterial } from './vendor/slop-newyork/tsl-materials.js';
import { islandBuildings, hiddenIslandBuildings, islandRoadReplaced } from './haixinsha-layout.ts';
import { southAxisRoadSurfaces, southAxisAreaSurfaces, southAxisBuildingHeight } from './south-axis-layout.ts';
import { isVisibleRoad, hiddenUndergroundBuildings, bridgeRoadProfile } from './road-level.ts';
import { Carriageways, FOOT_TOP, ROAD_TOP, siteLevel } from './curb.ts';
import { GROUND_LEVELS, campusMaterial, trackMaterial, poolMaterial, lineMaterial, pitchMaterial, fenceWallMaterial, fenceRailMaterial, ringRibbon, campusFences } from './grounds.ts';
import { Shape, Path, Vector2, ExtrudeGeometry, ShapeGeometry, BufferGeometry, Float32BufferAttribute, Mesh, InstancedMesh, Group, MeshStandardMaterial, Material } from 'three/webgpu';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import type { Point, TileData } from './types';
import { palette, buildingAppearance } from './materials.ts';
import { bridgeDetails } from './bridges.ts';
import { createLandmark } from './landmarks.ts';

export function shapeFrom(rings: Point[][]) {
  const shape = new Shape(rings[0].map(([x,z]) => new Vector2(x,-z)));
  for (const ring of rings.slice(1)) shape.holes.push(new Path(ring.map(([x,z]) => new Vector2(x,-z))));
  return shape;
}
function polygon(rings: Point[][], y: number, bottom?:number) {
  const geometry = bottom===undefined?new ShapeGeometry(shapeFrom(rings)):new ExtrudeGeometry(shapeFrom(rings),{depth:y-bottom,bevelEnabled:false,steps:1});
  geometry.rotateX(-Math.PI/2); geometry.translate(0,bottom??y,0);
  return geometry.index?geometry.toNonIndexed():geometry;
}
export function roadStrip(p: Point[], width: number, y: number|number[], bottom?:number|number[],roundEnds=false) {
  // Adjacent segments share their offset vertices, so curves have no wedge gaps.
  const kept=p.map((_,i)=>i).filter(i=>!i||Math.hypot(p[i][0]-p[i-1][0],p[i][1]-p[i-1][1])>=.1);
  const points=kept.map(i=>p[i]),heights=typeof y==='number'?points.map(()=>y):kept.map(i=>y[i]);
  const normals=points.slice(1).map((b,i)=>{const a=points[i],dx=b[0]-a[0],dz=b[1]-a[1],length=Math.hypot(dx,dz);return [-dz/length,dx/length];});
  const offsets=points.map((_,i)=>{
    const n1=normals[Math.max(0,i-1)],n2=normals[Math.min(normals.length-1,i)];
    if(!n1||!n2)return [0,0];
    const mx=n1[0]+n2[0],mz=n1[1]+n2[1],length=Math.hypot(mx,mz);
    if(length<.01)return [n2[0]*width/2,n2[1]*width/2];
    const nx=mx/length,nz=mz/length,scale=Math.min(width,width/2/Math.max(.5,nx*n2[0]+nz*n2[1]));
    return [nx*scale,nz*scale];
  });
  const v:number[]=[];
  const triangle=(a:number[],b:number[],c:number[])=>v.push(...a,...b,...c);
  for(let i=1;i<points.length;i++){
    const a=points[i-1],b=points[i],ya=heights[i-1],yb=heights[i],n=offsets[i-1],m=offsets[i];
    v.push(a[0]-n[0],ya,a[1]-n[1],a[0]+n[0],ya,a[1]+n[1],b[0]+m[0],yb,b[1]+m[1],
      a[0]-n[0],ya,a[1]-n[1],b[0]+m[0],yb,b[1]+m[1],b[0]-m[0],yb,b[1]-m[1]);
    if(bottom!==undefined){
      const ba=typeof bottom==='number'?bottom:bottom[kept[i-1]],bb=typeof bottom==='number'?bottom:bottom[kept[i]];
      for(const side of [-1,1]){
        const at=[a[0]+n[0]*side,ya,a[1]+n[1]*side],bt=[b[0]+m[0]*side,yb,b[1]+m[1]*side];
        const ab=[at[0],ba,at[2]],bbp=[bt[0],bb,bt[2]];
        if(side===1){triangle(at,ab,bt);triangle(ab,bbp,bt);}else{triangle(at,bt,ab);triangle(ab,bt,bbp);}
      }
      if(i===1){const l=[a[0]-n[0],ya,a[1]-n[1]],r=[a[0]+n[0],ya,a[1]+n[1]];triangle(l,[l[0],ba,l[2]],r);triangle(r,[l[0],ba,l[2]],[r[0],ba,r[2]]);}
      if(i===points.length-1){const l=[b[0]-m[0],yb,b[1]-m[1]],r=[b[0]+m[0],yb,b[1]+m[1]];triangle(l,r,[l[0],bb,l[2]]);triangle(r,[r[0],bb,r[2]],[l[0],bb,l[2]]);}
      triangle([a[0]-n[0],ba,a[1]-n[1]],[b[0]+m[0],bb,b[1]+m[1]],[a[0]+n[0],ba,a[1]+n[1]]);
      triangle([a[0]-n[0],ba,a[1]-n[1]],[b[0]-m[0],bb,b[1]-m[1]],[b[0]+m[0],bb,b[1]+m[1]]);
    }
  }
  // Match the round-ended corridor used to cut neighbouring forecourt paving.
  if(roundEnds&&points.length>1)for(const i of [0,points.length-1]){
    const p=points[i],other=points[i===0?1:i-1],angle=Math.atan2(p[1]-other[1],p[0]-other[0]),top=heights[i],base=typeof bottom==='number'?bottom:bottom?.[kept[i]];
    for(let k=0;k<8;k++){
      const point=(a:number,y:number)=>[p[0]+Math.cos(a)*width/2,y,p[1]+Math.sin(a)*width/2],a=angle-Math.PI/2+k*Math.PI/8,b=a+Math.PI/8,A=point(a,top),B=point(b,top);
      triangle([p[0],top,p[1]],B,A);
      if(base!==undefined){const C=point(a,base),D=point(b,base);triangle(A,B,C);triangle(B,D,C);triangle([p[0],base,p[1]],C,D);}
    }
  }
  const g=new BufferGeometry();g.setAttribute('position',new Float32BufferAttribute(v,3));g.computeVertexNormals();return g;
}
const roadMat=new MeshStandardMaterial({color:palette.road,roughness:1});
const pathMat=new MeshStandardMaterial({color:palette.path,roughness:1});
const waterMat=riverWaterMaterial;
const parkMat=createParkLawnMaterial();
// `curbs` should index every loaded tile: a footway near a tile seam must see carriageways mapped next door.
export function createTile(data: TileData, buildingMat: Material, estimatedOnly=false, curbs=new Carriageways(data.roads,data.areas)) {
  const group=new Group();
  const batches: [BufferGeometry[],Material][] = [ [[],buildingMat],[[],roadMat],[[],pathMat],[[],waterMat],[[],parkMat] ];
  for(const b of data.buildings) {
    if(parkHiddenBuildings.has(b.id)||islandBuildings.has(b.id)||hiddenIslandBuildings.has(b.id)||hiddenUndergroundBuildings.has(b.id))continue;
    if(b.landmark) {
      if(b.landmarkPrimary){const landmark=createLandmark(b);landmark.traverse(o=>{if(o instanceof Mesh)o.layers.enable(1);});group.add(landmark);}
      continue;
    }
    if(estimatedOnly && !b.hs.startsWith('estimate')) continue;
    const g=new ExtrudeGeometry(shapeFrom(b.p),{depth:Math.max(1,southAxisBuildingHeight(b.id,b.h)-b.base),bevelEnabled:false,steps:1,curveSegments:1});
    g.rotateX(-Math.PI/2);g.translate(0,b.base+.5,0);
    const {tint,masonry}=buildingAppearance(b);
    g.setAttribute('cityMasonry',new Float32BufferAttribute(new Float32Array(g.getAttribute('position').count).fill(masonry),1));
    const colors=new Float32Array(g.getAttribute('position').count*3);
    for(let i=0;i<colors.length;i+=3) tint.toArray(colors,i);
    g.setAttribute('color',new Float32BufferAttribute(colors,3));batches[0][0].push(g);
  }
  for(const road of data.roads) {
    if(parkRoadReplaced(road.id))continue;
    const tunnel=tunnelRoutes.get(road.id);if(tunnel){for(const mesh of createTunnel(tunnel).children as Mesh[]){let batch=batches.find(([,material])=>material===mesh.material);if(!batch){batch=[[],mesh.material as Material];batches.push(batch);}batch[0].push(mesh.geometry);}continue;}
    if(!isVisibleRoad(road)||islandRoadReplaced(road.p,road.bridge)) continue;
    const foot=['footway','path','pedestrian','steps','cycleway'].includes(road.kind);
    const replacement=tunnelData.roadSurfaces[road.id]?.p??southAxisRoadSurfaces.get(road.id);
    if(replacement){for(const p of replacement)batches[foot?2:1][0].push(polygon(p,road.bridge?5:foot?.28:.35,-.2).deleteAttribute('uv'));}
    else if(road.bridge){const prof=bridgeRoadProfile(road,foot?FOOT_TOP:ROAD_TOP);batches[foot?2:1][0].push(roadStrip(prof.p,road.w,prof.y,prof.y.map(y=>Math.max(-.2,y-.65))));const details=bridgeDetails(road,prof);
      for(const mesh of details.children as Mesh[]){let batch=batches.find(([,material])=>material===mesh.material);if(!batch){batch=[[],mesh.material as Material];batches.push(batch);}batch[0].push(mesh.geometry);}
    }
    else if(foot){const prof=curbs.footProfile(road.p,road.w/2);batches[2][0].push(roadStrip(prof.p,road.w,prof.y,-.2,true));}
    else batches[1][0].push(roadStrip(road.p,road.w,ROAD_TOP,-.2,true));
  }
  const add=(geometry:BufferGeometry,material:Material)=>{let batch=batches.find(([,m])=>m===material);if(!batch){batch=[[],material];batches.push(batch);}batch[0].push(geometry);};
  // Authored sites (park, opera, south axis, Haixinsha) draw their own grounds over mapped ones.
  const authored=(area:TileData['areas'][number])=>area.kind!=='water'&&area.kind!=='park'&&area.p[0].every(p=>siteLevel(...p)!==undefined);
  for(const area of data.areas)if(!authored(area))for(const p of tunnelAreaSurfaces(area)??(area.kind==='park'?parkAreaSurfaces(area.p):undefined)??southAxisAreaSurfaces(area)??[area.p]){
    if(area.kind==='water'||area.kind==='park'||area.kind==='green')batches[area.kind==='water'?3:4][0].push(polygon(p,area.kind==='water'?.1:.18));
    else if(area.kind==='campus')add(polygon(p,GROUND_LEVELS.campus),campusMaterial);
    else if(area.kind==='track')add(polygon(p,GROUND_LEVELS.track),trackMaterial);
    else{add(polygon(p,GROUND_LEVELS[area.kind]),area.kind==='pool'?poolMaterial:pitchMaterial(area.sport));add(ringRibbon(p[0],area.kind==='pool'?.5:.12,GROUND_LEVELS.line),lineMaterial);}
  }
  const fences=campusFences(data.areas,data.roads);
  if(fences.walls)add(fences.walls,fenceWallMaterial);if(fences.rails)add(fences.rails,fenceRailMaterial);
  for(const [geos,mat] of batches) {
    if(!geos.length) continue;
    const merged=mergeGeometries(geos,false);
    geos.forEach(g=>g.dispose());
    if(!merged) throw new Error('无法合并城市几何体');
    merged.computeBoundingSphere();
    const mesh=new Mesh(merged,mat);mesh.castShadow=mat===buildingMat||![roadMat,pathMat,waterMat,parkMat,campusMaterial,trackMaterial,poolMaterial,lineMaterial].includes(mat as MeshStandardMaterial)&&!(mat as MeshStandardMaterial).name.startsWith('pitch');mesh.receiveShadow=true;if(mesh.castShadow)mesh.layers.enable(1);group.add(mesh);
  }
  return group;
}
export function disposeTile(group: Group) { group.traverse(o=>{if(o instanceof Mesh)o.geometry.dispose();if(o instanceof InstancedMesh)o.dispose();}); }
