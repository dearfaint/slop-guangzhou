import {Group,Mesh,BufferGeometry,Float32BufferAttribute,BoxGeometry,PlaneGeometry,CanvasTexture,SRGBColorSpace,MeshStandardMaterial,MeshStandardNodeMaterial,type Texture} from 'three/webgpu';
import {positionLocal,sin,mix,color,smoothstep} from 'three/tsl';
import {mergeVertices} from 'three/addons/utils/BufferGeometryUtils.js';

// Photo-based proportions; user's map places it south of the circular court, inside the south entrance.
export const huachengStone={x:-294,z:343,ground:.42,width:8.6,height:3.25,depth:2.5,baseWidth:7.1,baseDepth:2.35,baseHeight:.5};
export function stoneBlocks(x:number,z:number,radius=.45){
 const s=huachengStone;
 return Math.abs(x-s.x)<s.width/2+radius&&Math.abs(z-s.z)<s.depth/2+radius;
}
// Uneven shoulder and crown, with the broad right end and low left bevel from the reference.
const crown=[.95,1.78,2.52,2.83,3.04,3.12,3.03,3.25,3.13,2.98,2.84,2.53,2.25,1.87,.95];
function top(u:number){const t=u*(crown.length-1),i=Math.min(crown.length-2,Math.floor(t));return crown[i]+(crown[i+1]-crown[i])*(t-i);}
function bottom(u:number){return .14+.81*Math.pow(Math.abs(u*2-1),9);}
function surface(u:number,v:number,back=false):[number,number,number]{
 const edge=Math.pow(Math.sin(Math.PI*u),.45)*Math.pow(Math.sin(Math.PI*v),.35);
 const relief=(Math.sin(u*39+v*13)*Math.sin(v*27-u*8)*.045+Math.sin(u*17-v*9)*.055)*edge;
 return [(u-.5)*huachengStone.width,bottom(u)+(top(u)-bottom(u))*v,(back?-1:1)*(.25+.96*edge)+relief];
}
export function createStoneInscription(){
 const canvas=document.createElement('canvas');canvas.width=2048;canvas.height=640;
 const ctx=canvas.getContext('2d')!;
 ctx.font='430px "Kaiti SC", "STKaiti", "KaiTi", serif';ctx.textAlign='center';ctx.textBaseline='middle';
 ctx.fillStyle='#fff';
 for(const [i,glyph] of [...'花城广场'].entries()){
  ctx.save();ctx.translate(280+i*490,335+(i%2?6:-8));ctx.rotate([-.065,.025,-.035,.045][i]);ctx.fillText(glyph,0,0);ctx.restore();
 }
 const texture=new CanvasTexture(canvas);texture.colorSpace=SRGBColorSpace;texture.anisotropy=4;return texture;
}
export function createHuachengStone(inscription:Texture|null=null){
 const root=new Group(),s=huachengStone;root.name='花城广场 · 题字景石';root.position.set(s.x,s.ground,s.z);
 root.userData={source:'用户提供的花城广场景石照片及位置地图',placement:'圆形下沉庭院南侧、南入口以内；坐标按地图相对位置估算'};
 const rock=new MeshStandardNodeMaterial({roughness:.97});
 const p=positionLocal;
 const grain=sin(p.x.mul(43).add(sin(p.y.mul(59))).add(p.z.mul(37))).mul(sin(p.y.mul(91).add(p.z.mul(65)))).mul(.5).add(.5);
 const mottling=sin(p.x.mul(2.7).add(sin(p.y.mul(4.1))).add(p.z.mul(3.9))).mul(.5).add(.5);
 const veinWave=p.x.mul(4.3).add(p.y.mul(8)).add(sin(p.x.mul(7).add(p.y.mul(3))));
 const veins=smoothstep(.94,.995,sin(veinWave));
 rock.colorNode=mix(mix(color('#3e5650'),color('#60756c'),mottling),color('#a2aaa0'),veins.mul(.10).add(grain.mul(.10)));
 const vertices:number[]=[],cols=48,rows=18;
 const tri=(a:number[],b:number[],c:number[])=>vertices.push(...a,...b,...c);
 for(const back of [false,true])for(let i=0;i<cols;i++)for(let j=0;j<rows;j++){
  const a=surface(i/cols,j/rows,back),b=surface((i+1)/cols,j/rows,back),c=surface((i+1)/cols,(j+1)/rows,back),d=surface(i/cols,(j+1)/rows,back);
  if(back){tri(a,c,b);tri(a,d,c);}else{tri(a,b,c);tri(a,c,d);}
 }
 const edge=(u:number,v:number,uu:number,vv:number)=>{
  const a=surface(u,v),b=surface(uu,vv),c=surface(uu,vv,true),d=surface(u,v,true);tri(a,d,c);tri(a,c,b);
 };
 for(let i=0;i<cols;i++){edge(i/cols,0,(i+1)/cols,0);edge((i+1)/cols,1,i/cols,1);}
 for(let j=0;j<rows;j++){edge(0,(j+1)/rows,0,j/rows);edge(1,j/rows,1,(j+1)/rows);}
 const raw=new BufferGeometry();raw.setAttribute('position',new Float32BufferAttribute(vertices,3));
 const geometry=mergeVertices(raw);raw.dispose();geometry.computeVertexNormals();
 const body=new Mesh(geometry,rock);body.name='不规则青灰景石';body.position.y=s.baseHeight-.14;root.add(body);
 const baseMaterial=new MeshStandardMaterial({color:'#636e63',roughness:.92});
 for(let i=0;i<4;i++){
  const block=new Mesh(new BoxGeometry(s.baseWidth/4-.018,s.baseHeight,s.baseDepth),baseMaterial);
  block.position.set((i-1.5)*s.baseWidth/4,s.baseHeight/2,0);root.add(block);
 }
 // A transparent gold inscription follows the front relief, avoiding a rectangular sign or floating label.
 const lettering=new PlaneGeometry(1,1,48,12),pos=lettering.getAttribute('position'),uv=lettering.getAttribute('uv');
 for(let i=0;i<pos.count;i++){
  const u=.22+uv.getX(i)*.56,y=.95+uv.getY(i)*1.5,v=(y-bottom(u))/(top(u)-bottom(u));
  const point=surface(u,v);pos.setXYZ(i,point[0],y+s.baseHeight-.14,point[2]+.015);
 }
 lettering.computeVertexNormals();
 const gold=new MeshStandardMaterial({color:'#d8b75e',metalness:.42,roughness:.6,alphaMap:inscription,transparent:true,depthWrite:false,polygonOffset:true,polygonOffsetFactor:-1,polygonOffsetUnits:-1});
 // alphaMap reads green; canvas has a transparent black background and white brush lettering.
 if(!inscription)gold.visible=false;
 const text=new Mesh(lettering,gold);text.name='花城广场 · 金色题字';root.add(text);
 return root;
}
