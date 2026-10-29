import {tunnelRoutes} from './tunnel-layout.ts';
import { pearlParkData } from './pearl-park-data.ts';
import { groundRoadPaths, centralPromenade, northRotundaOpening } from './south-axis-layout.ts';
import { clampMapPoint, clampMapCenter, expandedMapScale, mapDestination, mapPoint, mapScreen, type MapView } from './minimap-layout.ts';
import { haixinshaData } from './haixinsha-data.ts';
import { hiddenIslandBuildings } from './haixinsha-layout.ts';
import { southAxisData } from './south-axis-data.ts';
import { isVisibleRoad, hiddenUndergroundBuildings } from './road-level.ts';
import type { Vector3 } from 'three/webgpu';
import type { Point, TileData } from './types';

// Static geography is cached once; radar overlays stay in CSS pixels on HiDPI displays.
export class Minimap {
  private base=document.createElement('canvas');
  private context:CanvasRenderingContext2D;
  private last=0;
  private focus:Point=[0,0];
  private center:Point=[0,130];
  private zoom=1;
  private expanded=false;
  private view:MapView={center:[0,0],scale:.32,width:288,height:184};
  private labels:{point:Point;name:string;landmark:boolean}[]=[];
  private drag?:{x:number;y:number;center:Point;moved:boolean};
  private dragged=false;
  onNavigate?:(point:Point)=>void;
  constructor(private canvas:HTMLCanvasElement){
    this.base.width=this.base.height=2048;this.context=canvas.getContext('2d')!;this.setMap([]);
    canvas.addEventListener('click',e=>{
      if(this.dragged){this.dragged=false;return;}
      if(!this.expanded){document.getElementById('btn-open-map')?.click();return;}
      const rect=canvas.getBoundingClientRect();
      this.onNavigate?.(mapDestination(e.clientX-rect.left,e.clientY-rect.top,this.view));
    });
    canvas.addEventListener('pointerdown',e=>{
      if(!this.expanded||e.button!==0)return;
      this.drag={x:e.clientX,y:e.clientY,center:[...this.center],moved:false};this.dragged=false;canvas.setPointerCapture(e.pointerId);
    });
    canvas.addEventListener('pointermove',e=>{
      if(!this.drag)return;const dx=e.clientX-this.drag.x,dy=e.clientY-this.drag.y;
      if(Math.hypot(dx,dy)>4)this.drag.moved=true;
      if(this.drag.moved)this.center=clampMapPoint([this.drag.center[0]-dx/this.view.scale,this.drag.center[1]-dy/this.view.scale]);
    });
    canvas.addEventListener('pointerup',()=>{this.dragged=!!this.drag?.moved;this.drag=undefined;});
    canvas.addEventListener('pointercancel',()=>{this.dragged=true;this.drag=undefined;});
    canvas.addEventListener('wheel',e=>{
      if(!this.expanded)return;e.preventDefault();
      const rect=canvas.getBoundingClientRect(),x=e.clientX-rect.left,y=e.clientY-rect.top,before=mapPoint(x,y,this.view);
      this.zoom=Math.max(this.minZoom(),Math.min(8,this.zoom*Math.exp(-e.deltaY*.0015)));
      const scale=expandedMapScale(rect.width,rect.height)*this.zoom;
      this.center=clampMapPoint([before[0]-(x-rect.width/2)/scale,before[1]-(y-rect.height/2)/scale]);
    },{passive:false});
    canvas.addEventListener('keydown',e=>{
      if(!['ArrowUp','ArrowDown','ArrowLeft','ArrowRight','Enter',' '].includes(e.key))return;
      e.preventDefault();e.stopPropagation();
      if(!this.expanded){document.getElementById('btn-open-map')?.click();return;}
      if(e.key==='Enter'||e.key===' '){this.onNavigate?.([...this.center]);return;}
      const step=60/this.view.scale;
      this.center=clampMapPoint([this.center[0]+(e.key==='ArrowRight'?step:e.key==='ArrowLeft'?-step:0),this.center[1]+(e.key==='ArrowDown'?step:e.key==='ArrowUp'?-step:0)]);
    });
    document.getElementById('map-zoom-in')?.addEventListener('click',()=>{this.zoom=Math.min(8,this.zoom*1.45);});
    document.getElementById('map-zoom-out')?.addEventListener('click',()=>{this.zoom=Math.max(this.minZoom(),this.zoom/1.45);});
    document.getElementById('map-center-player')?.addEventListener('click',()=>{this.center=[...this.focus];this.zoom=3;});
    document.getElementById('map-view-all')?.addEventListener('click',()=>{this.center=[-5,130];this.zoom=this.minZoom();});
  }
  private minZoom(){return this.fitScale(this.view.width,this.view.height)/expandedMapScale(this.view.width,this.view.height);}
  private fitScale(width:number,height:number){return Math.min(width/3700,height/3600);}
  private point(p:Point):Point{return [220+p[0]/9,220+p[1]/9];}
  setMap(data:TileData[]){
    const c=this.base.getContext('2d')!;c.setTransform(this.base.width/440,0,0,this.base.height/440,0,0);c.fillStyle='#151a20';c.fillRect(0,0,440,440);
    this.labels=[];
    const path=(points:Point[],close=false)=>{c.beginPath();points.forEach((p,i)=>{const [x,y]=this.point(p);if(i)c.lineTo(x,y);else c.moveTo(x,y);});if(close)c.closePath();};
    if(data.length){path(pearlParkData.boundary[0],true);c.fillStyle='#19301f';c.fill();}
    for(const tile of data)for(const area of tile.areas){c.beginPath();for(const ring of area.p){ring.forEach((p,i)=>{const [x,y]=this.point(p);if(i)c.lineTo(x,y);else c.moveTo(x,y);});c.closePath();}c.fillStyle=area.kind==='water'||area.kind==='pool'?'#0f2535':area.kind==='campus'?'#262a2c':'#19301f';c.fill('evenodd');}
    for(const tile of data){
      for(const b of tile.buildings)if(b.landmarkPrimary&&b.name)this.labels.push({point:b.p[0][0],name:b.name,landmark:true});
      for(const road of tile.roads)if(road.name&&(isVisibleRoad(road)||tunnelRoutes.has(road.id))&&road.p.length>1)this.labels.push({point:road.p[Math.floor(road.p.length/2)],name:road.name,landmark:false});
      for(const b of tile.buildings){if(hiddenIslandBuildings.has(b.id)||hiddenUndergroundBuildings.has(b.id))continue;path(b.p[0],true);c.fillStyle='#272e37';c.fill();}
      for(const road of tile.roads){if(!isVisibleRoad(road))continue;for(const p of tunnelRoutes.has(road.id)?[road.p]:groundRoadPaths(road)){path(p);c.strokeStyle='#3a434f';c.lineWidth=Math.max(1,road.w/9);c.stroke();}}
    }
    // Upper roads are painted in source layer order, with a dark edge above lower roads.
    for(const road of [...new Map(data.flatMap(t=>t.roads).filter(r=>r.bridge&&isVisibleRoad(r)&&/^(trunk|primary|secondary|tertiary)(_link)?$/.test(r.kind)).map(r=>[r.id,r])).values()].sort((a,b)=>(a.layer??1)-(b.layer??1))){path(road.p);c.strokeStyle='#111820';c.lineWidth=Math.max(1,road.w/9)+.9;c.stroke();c.strokeStyle='#788793';c.lineWidth=Math.max(1,road.w/9);c.stroke();}
    if(data.length){
      for(const p of [southAxisData.plaza,southAxisData.bridge]){path(p[0],true);c.fillStyle='#2c4033';c.fill();}
      for(const p of southAxisData.beds){path(p[0],true);c.fillStyle='#1e3a26';c.fill();}
      path(southAxisData.courtyard.opening[0],true);c.fillStyle='#0a1118';c.fill();
      for(const r of southAxisData.ramps){path(r.p);c.strokeStyle='#b27a35';c.lineWidth=1;c.stroke();}
    }
    for(const bridge of [...haixinshaData.bridges,{p:haixinshaData.haixin.p}]){path(bridge.p[0],true);c.fillStyle='#2c4033';c.fill();}
    if(data.length){path(centralPromenade[0],true);c.fillStyle='#2c4033';c.fill();path(northRotundaOpening,true);c.fillStyle='#0a1118';c.fill();}
    // Underground motor roads remain readable without painting them onto the plaza.
    c.save();c.setLineDash([4,3]);c.strokeStyle='#675c76';c.lineWidth=1.6;
    for(const tile of data)for(const road of tile.roads){
      if(isVisibleRoad(road)||!(road.tunnel||(road.layer??0)<0)||! /^(primary|secondary|tertiary|trunk|residential|unclassified)(_link)?$/.test(road.kind))continue;
      path(road.p);c.stroke();
    }
    c.restore();
    // Draw reviewed tunnel connections last: plaza fills must not erase their route.
    if(data.length){c.save();c.setLineDash([3,2]);c.strokeStyle='#8d759b';c.lineWidth=1.7;for(const road of southAxisData.underground){path(road.p);c.stroke();}c.restore();}
    if(data.length)this.labels.push({point:[1230,-410],name:'快绿湖',landmark:true},{point:[1120,-590],name:'珠江公园',landmark:true});
    this.labels.sort((a,b)=>Number(b.landmark)-Number(a.landmark)||Number(/隧道|立交/.test(b.name))-Number(/隧道|立交/.test(a.name)));
    c.strokeStyle='#252c35';c.lineWidth=1;c.strokeRect(220-1660/9,220-1500/9,3310/9,3260/9);

  }
  update(now:number,position:Vector3,direction:Vector3,walking=false,cameraDirection=direction){
    if(now-this.last<50)return;this.last=now;this.focus=[position.x,position.z];
    const expanded=!!this.canvas.closest('.map-expanded');
    if(expanded!==this.expanded){this.expanded=expanded;this.center=expanded?[...this.focus]:[0,130];this.zoom=1;this.drag=undefined;}
    const width=this.canvas.clientWidth,height=this.canvas.clientHeight;if(!width||!height)return;
    const dpr=Math.min(window.devicePixelRatio||1,2),bw=Math.round(width*dpr),bh=Math.round(height*dpr);
    if(this.canvas.width!==bw||this.canvas.height!==bh){this.canvas.width=bw;this.canvas.height=bh;}
    const scale=expanded?expandedMapScale(width,height)*this.zoom:walking?Math.max(.05,.32/(1+Math.max(0,position.y-25)/180)):this.fitScale(width,height);
    if(expanded)this.center=clampMapCenter(this.center,{center:this.center,scale,width,height});
    this.view={center:expanded?this.center:walking?this.focus:[0,130],scale,width,height};
    const c=this.context,screen=(point:Point)=>mapScreen(point,this.view);
    c.setTransform(dpr,0,0,dpr,0,0);c.clearRect(0,0,width,height);c.fillStyle='#151a20';c.fillRect(0,0,width,height);
    const origin=screen([-1980,-1980]);c.drawImage(this.base,origin[0],origin[1],3960*scale,3960*scale);
    // Text and landmark dots remain crisp and avoid overlapping labels.
    const used:{x:number;y:number;w:number}[]=[],names=new Set<string>();
    c.font=`${expanded?11:9}px system-ui`;c.textAlign='center';c.textBaseline='middle';c.lineJoin='round';
    for(const label of this.labels){
      if(names.has(label.name))continue;const [x,y]=screen(label.point),w=c.measureText(label.name).width+14;
      if(x<w/2+8||x>width-w/2-8||y<30||y>height-16||used.some(p=>Math.abs(x-p.x)<(w+p.w)/2&&Math.abs(y-p.y)<23))continue;
      used.push({x,y,w});names.add(label.name);if(used.length> (expanded?45:10))break;
      if(label.landmark){c.beginPath();c.arc(x,y-9,2.5,0,Math.PI*2);c.fillStyle='#fff';c.fill();}
      c.lineWidth=3;c.strokeStyle='#10161de8';c.strokeText(label.name,x,y);c.fillStyle=label.landmark?'#e3ebe5':'#9ba6b3';c.fillText(label.name,x,y);
    }
    const [x,y]=screen(this.focus);
    if(x>-20&&x<width+20&&y>-20&&y<height+20){
      c.save();c.translate(x,y);c.rotate(Math.atan2(cameraDirection.x,-cameraDirection.z));
      const cone=c.createRadialGradient(0,0,2,0,0,62);cone.addColorStop(0,'#ffffff50');cone.addColorStop(1,'#ffffff00');
      c.fillStyle=cone;c.beginPath();c.moveTo(0,0);c.arc(0,0,62,-Math.PI*.72,-Math.PI*.28);c.closePath();c.fill();c.restore();
      c.save();c.translate(x,y);c.rotate(Math.atan2(direction.x,-direction.z));c.beginPath();c.moveTo(0,-9);c.lineTo(6.5,7);c.lineTo(0,4);c.lineTo(-6.5,7);c.closePath();c.fillStyle='#fff';c.strokeStyle='#080b0fe6';c.lineWidth=2;c.stroke();c.fill();c.restore();
    }
    // Distance scale follows the actual visible ground range.
    const meters=scale>=.2?100:scale>=.09?250:500,bar=meters*scale;
    c.strokeStyle='#c9d4df';c.lineWidth=1.5;c.beginPath();c.moveTo(13,height-19);c.lineTo(13,height-15);c.lineTo(13+bar,height-15);c.lineTo(13+bar,height-19);c.stroke();
    c.textAlign='left';c.fillStyle='#b0bdca';c.font='9px system-ui';c.fillText(`${meters} m`,13,height-27);
  }
}
