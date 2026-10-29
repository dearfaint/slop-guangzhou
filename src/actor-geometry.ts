import { BufferGeometry, Float32BufferAttribute, BoxGeometry, CylinderGeometry, Vector3, Quaternion, CanvasTexture, DataTexture, SRGBColorSpace, LinearFilter, type Texture } from 'three/webgpu';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
const up=new Vector3(0,1,0);
export function joined(parts:BufferGeometry[]){const flat=parts.map(g=>g.index?g.toNonIndexed():g),result=mergeGeometries(flat,false)!;for(const g of new Set([...parts,...flat]))g.dispose();return result;}
function unindexed(g:BufferGeometry){const result=g.toNonIndexed();g.dispose();return result;}
export function box(x:number,y:number,z:number,w:number,h:number,d:number){return unindexed(new BoxGeometry(w,h,d)).translate(x,y,z);}
export function beam(a:number[],b:number[],width:number){const start=new Vector3(...a),end=new Vector3(...b),delta=end.clone().sub(start);return unindexed(new BoxGeometry(width,delta.length(),width)).applyQuaternion(new Quaternion().setFromUnitVectors(up,delta.normalize())).translate(...start.add(end).multiplyScalar(.5).toArray());}
// Closed, bevelled hull: eight corners per ring, without textures or open wire frames.
export function hull(rings:{y:number;w:number;d:number;z?:number;bevel?:number}[]){
 const points=rings.map(r=>{const x=r.w/2,z=r.d/2,b=r.bevel??Math.min(r.w,r.d)*.08;return [[-x+b,-z],[x-b,-z],[x,-z+b],[x,z-b],[x-b,z],[-x+b,z],[-x,z-b],[-x,-z+b]].map(([px,pz])=>[px,r.y,pz+(r.z??0)]);});
 const positions:number[]=[];const tri=(a:number[],b:number[],c:number[])=>positions.push(...a,...b,...c);
 for(let k=1;k<points.length;k++)for(let i=0;i<8;i++){const j=(i+1)%8;tri(points[k-1][i],points[k][i],points[k][j]);tri(points[k-1][i],points[k][j],points[k-1][j]);}
 for(const [k,reverse] of [[0,false],[points.length-1,true]] as const){const r=points[k],center=[0,r[0][1],rings[k].z??0];for(let i=0;i<8;i++){const j=(i+1)%8;if(reverse)tri(center,r[j],r[i]);else tri(center,r[i],r[j]);}}
 const g=new BufferGeometry();g.setAttribute('position',new Float32BufferAttribute(positions,3));g.computeVertexNormals();return g;
}
export function actorGeometry(){
 const carBody=hull([{y:.25,w:1.68,d:4.15},{y:.36,w:1.90,d:4.40},{y:.62,w:1.90,d:4.40},{y:.80,w:1.84,d:4.05,z:.08},{y:.90,w:1.70,d:3.70,z:.16}]);
 const carGlass=hull([{y:.80,w:1.66,d:2.70,z:-.20},{y:1.30,w:1.18,d:1.45,z:-.45}]);
 const carTrimParts=[box(0,1.33,-.45,1.26,.06,1.52)];
 for(const side of [-1,1]){
  for(const [lower,upper] of [[1.15,.27],[-1.55,-1.17],[-.25,-.35]])carTrimParts.push(beam([side*.83,.82,lower],[side*.59,1.30,upper],.06));
  carTrimParts.push(box(side*.99,.95,.62,.18,.10,.23));
 }
 const carTrim=joined(carTrimParts),carDetails=joined([box(0,.48,2.19,1.18,.15,.035),box(0,.40,-2.19,1.48,.10,.035),...[-1,1].flatMap(side=>[-.65,.55].map(z=>box(side*.947,.77,z,.025,.035,.15)))]);
 const busBody=hull([{y:.28,w:2.30,d:9.85},{y:.43,w:2.50,d:10},{y:2.62,w:2.50,d:9.98},{y:2.75,w:2.32,d:9.80}]);
 const busWindows=[box(0,1.94,5.005,2.16,1.05,.035),box(0,1.94,-5.005,2.12,1.04,.035)];
 for(const side of [-1,1])for(let i=0;i<8;i++)busWindows.push(box(side*1.255,1.95,-4.04+i*1.13,.035,1.02,.96));
 const busGlass=joined(busWindows),busPanels=joined([box(0,1.12,5.02,2.28,.30,.025),box(0,1.12,-5.02,2.28,.30,.025),...[-1,1].map(side=>box(side*1.257,1.17,0,.025,.30,9.72))]);
 const busTrim=joined([box(0,2.80,-.8,1.42,.15,2.5),box(0,2.80,2.3,1.28,.15,1.4),box(0,.47,5.025,1.46,.15,.04),box(0,.47,-5.025,1.7,.15,.04),...[-1.05,1.4].map(z=>box(1.283,.93,z,.035,1.35,.86))]);
 const tyre=new CylinderGeometry(.5,.5,1,24,1).rotateZ(Math.PI/2);
 const hubParts=[unindexed(new CylinderGeometry(.5,.5,.08,10,1).rotateZ(Math.PI/2))];
 for(let i=0;i<5;i++)hubParts.push(unindexed(new BoxGeometry(.12,.75,.08).rotateX(i*Math.PI/5)));
 const hub=joined(hubParts);
 return {carBody,carGlass,carTrim,carDetails,busBody,busGlass,busPanels,busTrim,tyre,hub};
}
export function actorLabels():Texture {
 if(typeof document==='undefined'){const t=new DataTexture(new Uint8Array([255,255,255,255]),1,1);t.needsUpdate=true;return t;}
 const canvas=document.createElement('canvas');canvas.width=256;canvas.height=256;const ctx=canvas.getContext('2d')!;
 for(const [row,text,background,foreground] of [[0,'TAXI','#ffde70','#173e35'],[1,'珠江新城','#152b31','#ffc366'],[2,'城市公交','#e6eee8','#285b53'],[3,'粤 A','#2363a4','#ffffff'],[4,'警察 POLICE','#ffffff','#184e96'],[5,'120 急救','#ffffff','#d52e36'],[6,'消防救援 119','#c82f29','#ffffff'],[7,'城市物流','#e3e8eb','#284652']] as const){
  ctx.fillStyle=background;ctx.fillRect(0,row*32,256,32);ctx.fillStyle=foreground;ctx.textAlign='center';ctx.textBaseline='middle';ctx.font=`bold ${row===0?30:25}px sans-serif`;ctx.fillText(text,128,row*32+17);
 }
 const t=new CanvasTexture(canvas);t.colorSpace=SRGBColorSpace;t.minFilter=LinearFilter;t.magFilter=LinearFilter;t.generateMipmaps=false;return t;
}
export function labelGeometry(row:number,w:number,h:number,y:number,z:number){
 const g=new BufferGeometry(),u0=0,u1=1,v0=1-(row+1)/8,v1=1-row/8;
 g.setAttribute('position',new Float32BufferAttribute([-w/2,y-h/2,z,w/2,y-h/2,z,w/2,y+h/2,z,-w/2,y+h/2,z],3));
 g.setAttribute('uv',new Float32BufferAttribute([u0,v0,u1,v0,u1,v1,u0,v1],2));g.setIndex([0,1,2,0,2,3]);g.computeVertexNormals();return g;
}
