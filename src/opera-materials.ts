import {DataTexture,RepeatWrapping,LinearMipmapLinearFilter,SRGBColorSpace,MeshPhysicalMaterial,MeshStandardMaterial,MeshBasicNodeMaterial,Vector2,Float32BufferAttribute,CubeCamera,CubeRenderTarget,HalfFloatType,type BufferGeometry,type Scene,type WebGPURenderer} from 'three/webgpu';
import {reflector,color,mix,screenUV,vec2,vec3,sin,positionWorld,time} from 'three/tsl';

// Seamless, metre-scaled PBR surfaces. Generated once and shared across tile reloads.
function surfaceTextures(triangular:boolean){
 const size=512,color=new Uint8Array(size*size*4),rough=new Uint8Array(size*size*4),heights=new Float32Array(size*size);
 let seed=71831;const random=()=>{seed=(Math.imul(seed,1664525)+1013904223)>>>0;return seed/4294967296;};
 const panels=Array.from({length:64},()=>random());
 for(let y=0;y<size;y++)for(let x=0;x<size;x++){
  const u=x/128,v=y/(triangular?128:64),fx=u%1,fy=v%1;
  const distance=Math.min(fx,1-fx,fy,1-fy,triangular?Math.abs(fx-fy)*.707:1);
  const seam=Math.max(0,1-distance*250),panel=panels[(Math.floor(v)*4+Math.floor(u))*2+(triangular&&fx>fy?1:0)];
  const grain=random(),speck=random()<.06?(random()-.5)*36:0;
  const tone=205+(panel-.5)*7+(grain-.5)*16+speck-seam*55,p=(y*size+x)*4;
  color[p]=tone;color[p+1]=tone+1;color[p+2]=tone+2;color[p+3]=255;
  rough[p]=rough[p+1]=rough[p+2]=Math.min(255,155+(grain-.5)*45+seam*70);rough[p+3]=255;
  heights[y*size+x]=(grain-.5)*.0015-seam*.0015;
 }
 const normal=new Uint8Array(size*size*4);
 for(let y=0;y<size;y++)for(let x=0;x<size;x++){
  const dx=(heights[y*size+(x+1)%size]-heights[y*size+(x+size-1)%size])/.05;
  const dy=(heights[((y+1)%size)*size+x]-heights[((y+size-1)%size)*size+x])/.05;
  const length=Math.hypot(dx,dy,1),p=(y*size+x)*4;
  normal[p]=128-dx/length*127;normal[p+1]=128-dy/length*127;normal[p+2]=128+127/length;normal[p+3]=255;
 }
 const texture=(pixels:Uint8Array,name:string)=>{
  const t=new DataTexture(pixels,size,size);t.name=name;t.wrapS=t.wrapT=RepeatWrapping;t.generateMipmaps=true;t.minFilter=LinearMipmapLinearFilter;t.anisotropy=8;t.needsUpdate=true;return t;
 };
 const map=texture(color,triangular?'Opera granite triangular panels':'Opera dressed paving slabs');map.colorSpace=SRGBColorSpace;
 return {map,roughnessMap:texture(rough,'Opera surface roughness'),normalMap:texture(normal,'Opera fine surface relief')};
}
const stone=surfaceTextures(true),slabs=surfaceTextures(false);
export const operaGranite=new MeshStandardMaterial({name:'Opera grey granite',color:'#858b8e',...stone,roughness:1,metalness:.025,normalScale:new Vector2(.55,.55)});
export const operaWhite=new MeshStandardMaterial({name:'Opera pale stone',color:'#e4e8e8',...stone,roughness:1,metalness:.015,normalScale:new Vector2(.45,.45)});
export const operaPaving=new MeshStandardMaterial({name:'Opera finished paving',color:'#dce0da',...slabs,roughness:1,normalScale:new Vector2(.35,.35)});
export const operaGlass=new MeshPhysicalMaterial({name:'Opera reflective glazing',color:'#31525e',metalness:0,roughness:.085,ior:1.5,clearcoat:1,clearcoatRoughness:.06,specularIntensity:1});
export const operaFrame=new MeshStandardMaterial({name:'Opera anodised frame',color:'#677981',metalness:.82,roughness:.28});
export function createOperaWater(){
 const reflection=reflector({resolutionScale:.5,bounces:false,samples:2});
 reflection.target.rotation.x=-Math.PI/2;reflection.target.position.y=.2;
 const ripple=vec2(sin(positionWorld.x.mul(2.3).add(time.mul(.45))),sin(positionWorld.z.mul(2.7).sub(time.mul(.32)))).mul(.0007);
 reflection.uvNode=screenUV.flipX().add(ripple);
 const material=new MeshBasicNodeMaterial({name:'Opera reflecting pool'});
 const reflected=mix(reflection.rgb,vec3(reflection.rgb.dot(vec3(.2126,.7152,.0722))),.4);
 material.colorNode=mix(color('#081a1c'),reflected,.30);
 return {material,target:reflection.target,dispose:()=>{reflection.dispose();material.dispose();}};
}

// Project each face onto its own dominant plane; every UV unit is 12.8 metres.
export function operaSurfaceUV(g:BufferGeometry){
 const p=g.getAttribute('position'),n=g.getAttribute('normal'),uv=new Float32Array(p.count*2);
 for(let i=0;i<p.count;i++){
  const x=Math.abs(n.getX(i)),y=Math.abs(n.getY(i)),z=Math.abs(n.getZ(i));
  uv[i*2]=(x>y&&x>z?p.getZ(i):p.getX(i))/12.8;
  uv[i*2+1]=(y>=x&&y>=z?p.getZ(i):p.getY(i))/12.8;
 }
 g.setAttribute('uv',new Float32BufferAttribute(uv,2));return g;
}

// A local HDR probe captures the actual halls, sky and surrounding city. No global lighting changes.
export class OperaReflections{
 private target=new CubeRenderTarget(128,{type:HalfFloatType,generateMipmaps:true});
 private camera=new CubeCamera(.3,5000,this.target);
 private hour=NaN;
 constructor(){this.camera.position.set(-413,3,171);}
 update(renderer:WebGPURenderer,scene:Scene,hour:number,night:number){
  if(!Number.isFinite(this.hour)||Math.abs(hour-this.hour)>=2){
   this.camera.update(renderer,scene);this.hour=hour;
   for(const m of [operaGranite,operaWhite,operaPaving,operaGlass,operaFrame]){
    if(m.envMap!==this.target.texture){m.envMap=this.target.texture;m.needsUpdate=true;}
   }
  }
  operaGranite.envMapIntensity=.3;operaWhite.envMapIntensity=.25;operaPaving.envMapIntensity=.2;
  operaGlass.envMapIntensity=1.4-night*.65;operaFrame.envMapIntensity=.8;
 }
}
