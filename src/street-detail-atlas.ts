import {CanvasTexture,DataTexture,SRGBColorSpace,type Texture} from 'three/webgpu';
import type {StreetDetail} from './street-detail-layout.ts';
export const labelKey=(f:StreetDetail)=>f.kind+':'+f.text;
export function createDetailAtlas(items:StreetDetail[]):{texture:Texture;rects:Map<string,number[]>}{
 const labels=[...new Map(items.map(f=>[labelKey(f),f])).values()];
 const leds=labels.filter(f=>f.kind==='led'),small=labels.filter(f=>f.kind!=='led');
 const width=2048,ledHeight=Math.ceil(leds.length/4)*256,height=2**Math.ceil(Math.log2(Math.max(256,ledHeight+Math.ceil(small.length/8)*128)));
 // Give large LED panels four label cells without making every road sign a large texture.
 const cells=[...leds.map((f,i)=>({f,x:i%4*512,y:Math.floor(i/4)*256,w:512,h:256})),...small.map((f,i)=>({f,x:i%8*256,y:ledHeight+Math.floor(i/8)*128,w:256,h:128}))];
 const rects=new Map(cells.map(({f,x,y,w,h})=>[labelKey(f),[(x+2)/width,1-(y+h-2)/height,(w-4)/width,(h-4)/height]]));
 if(typeof document==='undefined'){const texture=new DataTexture(new Uint8Array([255,255,255,255]),1,1);texture.needsUpdate=true;return {texture,rects};}
 const canvas=document.createElement('canvas');canvas.width=width;canvas.height=height;const ctx=canvas.getContext('2d')!;
 cells.forEach(({f,x,y,w,h})=>{
  const led=f.kind==='led',metro=f.kind==='metro',road=f.kind==='roadSign',scale=h/128;
  const backgrounds=led?['#164e63','#125b50','#744d33','#203a70']:['#184f45'];
  ctx.fillStyle=metro?'#b12632':road?'#155c55':backgrounds[Array.from(f.text).reduce((n,c)=>n+c.charCodeAt(0),0)%backgrounds.length];ctx.fillRect(x,y,w,h);
  ctx.strokeStyle='#d9e7df';ctx.lineWidth=3*scale;ctx.strokeRect(x+5*scale,y+5*scale,w-10*scale,h-10*scale);
  if(led){ctx.fillStyle='#e9c567';ctx.fillRect(x+15*scale,y+18*scale,w-30*scale,5*scale);for(let k=0;k<13;k++){const bh=(8+(k*37%33))*scale;ctx.fillStyle='#183744';ctx.fillRect(x+(9+k*20)*scale,y+h-8*scale-bh,14*scale,bh);}}
  const text=(value:string,top:number,size:number)=>{ctx.save();ctx.translate(x+w/2,y+top*scale);ctx.scale(2/(f.w/f.h),1);ctx.fillStyle='#fff4dd';ctx.font=`600 ${size*scale}px "PingFang SC","Microsoft YaHei",sans-serif`;ctx.textAlign='center';ctx.textBaseline='middle';ctx.fillText(value,0,0,(w-22*scale)/(2/(f.w/f.h)));ctx.restore();};
  if(metro){text('M  地铁 · '+(f.exit||'入口'),37,34);text(f.text.replace(/站?\s*[A-Z]\d?出入口|出入口/g,''),85,28);}
  else if(led){text(f.text,57,34);text('ZHUJIANG · CITY LIFE',94,15);}
  else if(f.kind==='cart'){text(f.text,48,40);text('TEA · SNACKS',95,24);}
  else text(f.text,67,76);
 });
 const texture=new CanvasTexture(canvas);texture.colorSpace=SRGBColorSpace;texture.anisotropy=4;texture.name='Chinese street-detail label atlas';return {texture,rects};
}
