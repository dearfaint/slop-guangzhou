import { currentLocation } from './current-location.ts';
import { Vector3, type PerspectiveCamera } from 'three/webgpu';
import type { WalkControls, TravelMode } from './walk-controls.ts';
import type { ReferenceEnvironment } from './reference-environment.ts';
import type { CitySound } from './city-sound.ts';
const el=<T extends HTMLElement=HTMLElement>(id:string)=>document.getElementById(id) as T;
const cameras=['chase','action','pov','cantonTop','centralPark','fifthAve','timesSquare','chryslerGCT','observatory','bryantPark','waterfront','pearlPark','drone'];
const names=['第三人称跟随','低角度跟随','第一人称 / 驾驶舱','广州塔顶 · 俯瞰全城','花城广场中轴','广州双塔','城市街区','大剧院与图书馆','东塔观景','花城广场与博物馆','珠江天际线','珠江公园全景','自动航拍'];
export function joystickVector(clientX:number,clientY:number,rect:Pick<DOMRect,'left'|'top'|'width'|'height'>){
 const x=(clientX-rect.left-rect.width/2)/(rect.width*.4),y=(clientY-rect.top-rect.height/2)/(rect.height*.4),length=Math.max(1,Math.hypot(x,y));
 return {x:x/length,y:y/length};
}
export class ReferenceUI {
 private touchEnabled=false;private activeCamera='chase';private clean=false;private lastUpdate=0;
 private walker:WalkControls;private sound:CitySound;private places:{name:string;point:Vector3}[];
 private actions:{scenic:(name:string)=>void;follow:()=>void;teleport:(p:Vector3)=>void};
 constructor(walker:WalkControls,_camera:PerspectiveCamera,environment:ReferenceEnvironment,sound:CitySound,landmarks:{name:string;point:Vector3}[],actions:ReferenceUI['actions']){
  this.walker=walker;this.sound=sound;this.places=[...landmarks,{name:'花城广场南广场',point:new Vector3(-310,0,300)},{name:'海心沙',point:new Vector3(-240,0,550)}];this.actions=actions;let releaseTouch=()=>{};
  const presets:Record<string,number>={golden:18,midday:12,twilight:19.5,midnight:23};
  el<HTMLSelectElement>('touch-time').onchange=event=>el(`time-${(event.target as HTMLSelectElement).value}`).click();
  document.querySelectorAll<HTMLButtonElement>('[data-time]').forEach(button=>button.onclick=()=>{environment.setTime(presets[button.dataset.time!]);el<HTMLSelectElement>('touch-time').value=button.dataset.time!;document.querySelectorAll('[data-time]').forEach(b=>b.classList.toggle('active',b===button));});
  const select=(name:string)=>{
   releaseTouch();
   this.activeCamera=name;const i=cameras.indexOf(name);el('hud-active-camera').textContent=names[i];
   document.querySelectorAll<HTMLElement>('[data-camera]').forEach(b=>b.classList.toggle('active',b.dataset.camera===name));
   if(['chase','action','pov'].includes(name)){actions.follow();walker.setCameraView(name as 'chase'|'action'|'pov');}else actions.scenic(name);
   el('camera-popover').hidePopover();
  };
  el('cam-next').onclick=()=>select(cameras[(cameras.indexOf(this.activeCamera)+1)%cameras.length]);
  el('cam-prev').onclick=()=>select(cameras[(cameras.indexOf(this.activeCamera)+cameras.length-1)%cameras.length]);
  document.querySelectorAll<HTMLElement>('[data-camera]').forEach(b=>b.onclick=()=>select(b.dataset.camera!));
  const map=()=>{const expanded=el('minimap-card').classList.toggle('map-expanded');if(expanded){releaseTouch();el('camera-popover').hidePopover();el('teleport-popover').hidePopover();}el('btn-open-map').setAttribute('aria-pressed',String(expanded));document.body.classList.toggle('map-open',expanded);el('minimap').setAttribute('aria-label',expanded?'广州街道地图，拖动平移，滚轮缩放，点击定位':'广州街道雷达，点击展开地图');(expanded?el('minimap'):el('btn-open-map')).focus();};el('btn-open-map').onclick=map;el('map-close').onclick=map;
  const clean=()=>{this.clean=!this.clean;document.body.classList.toggle('hud-minimized',this.clean);el('show-hud').hidden=!this.clean;el('btn-toggle-hud').setAttribute('aria-pressed',String(this.clean));};
  el('btn-toggle-hud').onclick=clean;el('show-hud').onclick=clean;
  el('teleport-popover').addEventListener('click',event=>{
   const button=(event.target as HTMLElement).closest<HTMLButtonElement>('.place');if(!button)return;
   const list=Array.from(document.querySelectorAll('#landmarks .place')),index=list.indexOf(button);
   const special=[new Vector3(-310,0,300),new Vector3(-240,0,550),new Vector3(-300,0,50)];
   const point=landmarks[index]?.point??special[index-landmarks.length];if(!point)return;
   event.stopPropagation();actions.teleport(point);select('chase');el('teleport-popover').hidePopover();
  },true);
  document.querySelectorAll<HTMLButtonElement>('[data-travel]').forEach(button=>button.addEventListener('click',()=>{this.activeCamera='chase';walker.setCameraView('chase');el('hud-active-camera').textContent=names[0];}));
  el('hud-fps').onclick=()=>el<HTMLDialogElement>('about').showModal();
  const keys:Record<string,string>={Digit5:'chase',Digit6:'action',Digit7:'pov',Digit8:'fifthAve',Digit9:'timesSquare',Digit0:'chryslerGCT'};
  window.addEventListener('keydown',event=>{
   const target=event.target as HTMLElement;
   if(target.matches('input,textarea,select')||!el('boot').hidden)return;
   if(event.code==='Tab'&&!event.shiftKey&&!event.ctrlKey&&!event.altKey&&!event.metaKey&&!target.isContentEditable&&!target.closest('dialog[open]')){event.preventDefault();event.stopImmediatePropagation();if(!event.repeat)map();return;}
   if(event.repeat)return;
   if(el('minimap-card').classList.contains('map-expanded')&&!['KeyM','Escape'].includes(event.code)){if(['KeyW','KeyA','KeyS','KeyD','Space','ShiftLeft','ShiftRight','Digit1','Digit2','Digit3','Digit4','KeyV'].includes(event.code)){event.preventDefault();event.stopImmediatePropagation();}return;}
   const modes:Record<string,TravelMode>={Digit1:'walk',Digit2:'car',Digit3:'bike',Digit4:'balloon'};
   if(modes[event.code]){actions.follow();document.querySelector<HTMLButtonElement>(`[data-travel="${modes[event.code]}"]`)?.click();}
   else if(event.code==='KeyV')select(cameras[(cameras.indexOf(this.activeCamera)+1)%cameras.length]);
   else if(keys[event.code])select(keys[event.code]);else if(event.code==='KeyM'){event.preventDefault();event.stopImmediatePropagation();map();}else if(event.code==='KeyH')clean();
   else if(event.code==='KeyN')el('btn-sound').click();else if(event.code==='KeyB')sound.engine.honk();
   else if(event.code==='Escape'&&el('minimap-card').classList.contains('map-expanded')){event.preventDefault();event.stopImmediatePropagation();map();}
  },{capture:true});
  const touch=matchMedia('(pointer: coarse)').matches;this.touchEnabled=touch;if(touch)el('map-atlas-hint').textContent='点按定位 · 拖动地图 · ＋ / − 缩放';el('touch-controls').hidden=!touch;document.body.classList.toggle('touch-enabled',touch);
  const stick=el('touch-stick'),knob=el('touch-stick-knob');let stickPointer:number|undefined;
  const move=(event:PointerEvent)=>{
   const {x,y}=joystickVector(event.clientX,event.clientY,stick.getBoundingClientRect());
   knob.style.setProperty('--stick-x',`${x*25}px`);knob.style.setProperty('--stick-y',`${y*25}px`);
   for(const [key,on] of [['KeyW',y<-.18],['KeyS',y>.18],['KeyA',x<-.18],['KeyD',x>.18]] as const)walker.setTouchKey(key,on);
  };
  stick.onpointerdown=event=>{if(stickPointer!==undefined)return;event.preventDefault();stickPointer=event.pointerId;stick.setPointerCapture(event.pointerId);stick.classList.add('is-pressed');move(event);};stick.onpointermove=event=>{if(stick.hasPointerCapture(event.pointerId))move(event);};
  const release=()=>{const pointer=stickPointer;stickPointer=undefined;if(pointer!==undefined&&stick.hasPointerCapture(pointer))stick.releasePointerCapture(pointer);knob.style.removeProperty('--stick-x');knob.style.removeProperty('--stick-y');stick.classList.remove('is-pressed');for(const key of ['KeyW','KeyS','KeyA','KeyD'])walker.setTouchKey(key,false);};stick.onpointerup=release;stick.onpointercancel=release;stick.onlostpointercapture=release;
  const releases=[release];
  document.querySelectorAll<HTMLButtonElement>('[data-touch-action]').forEach(button=>{
   let pressed='',pointer:number|undefined;button.onpointerdown=event=>{if(pointer!==undefined)return;event.preventDefault();pressed=button.dataset.touchAction==='boost'?'ShiftLeft':button.dataset.touchAction==='up'?(walker.travel==='walk'?'Space':'KeyE'):'KeyQ';pointer=event.pointerId;button.setPointerCapture(event.pointerId);button.classList.add('is-pressed');button.setAttribute('aria-pressed','true');walker.setTouchKey(pressed,true);};
   const releaseButton=()=>{const captured=pointer;pointer=undefined;if(captured!==undefined&&button.hasPointerCapture(captured))button.releasePointerCapture(captured);if(pressed)walker.setTouchKey(pressed,false);pressed='';button.classList.remove('is-pressed');button.setAttribute('aria-pressed','false');};
   releases.push(releaseButton);for(const name of ['pointerup','pointercancel','lostpointercapture'])button.addEventListener(name,releaseButton);
  });
  releaseTouch=()=>releases.forEach(release=>release());
  for(const id of ['cam-menu-btn','btn-teleport','mode-switch'])el(id).addEventListener('click',releaseTouch);
  addEventListener('blur',releaseTouch);document.addEventListener('visibilitychange',()=>{if(document.hidden)releaseTouch();});
  addEventListener('resize',()=>this.update());this.update();
 }
 update(){
  const now=performance.now();if(now-this.lastUpdate<100)return;this.lastUpdate=now;
  const walker=this.walker;el('touch-controls').hidden=!this.touchEnabled||!walker.active;
  el('touch-controls').querySelector<HTMLElement>('[data-touch-label="up"]')!.textContent=walker.travel==='walk'?'跳跃':'上升';
  document.querySelector('[data-touch-action="up"]')!.setAttribute('aria-label',walker.travel==='walk'?'跳跃':'上升');
  const buttons=document.querySelectorAll<HTMLButtonElement>('[data-travel]');
  buttons.forEach(button=>{const active=button.dataset.travel===walker.travel;button.classList.toggle('active',active);if(active){el('mode-switch').style.setProperty('--ind-x',button.offsetLeft+'px');el('mode-switch').style.setProperty('--ind-w',button.offsetWidth+'px');}});
  document.querySelector<HTMLButtonElement>('[data-touch-action="up"]')!.hidden=walker.travel!=='balloon'&&walker.travel!=='walk';document.querySelector<HTMLButtonElement>('[data-touch-action="down"]')!.hidden=walker.travel!=='balloon';
  const speed=Math.abs(walker.signedSpeed??walker.movingSpeed),labels={walk:'步行',car:'城市出租车',bike:'自行车',balloon:'直升机'};
  el('hud-active-mode').textContent=labels[walker.travel];el('hud-speed').textContent=String(Math.round(speed*2.236936));el('hud-altitude').textContent=String(Math.round(walker.position.y*3.28084));
  el('hud-speed-meter').style.width=Math.min(100,speed/(walker.travel==='balloon'?60:24)*100)+'%';
  el('hud-controls-hint').textContent=walker.travel==='walk'?'W A S D 移动　Space 跳跃　Shift 跑步　Drag 环绕':walker.travel==='balloon'?'W A S D 飞行　E / Q 升降　Shift 加速　Drag 环绕':'W S 前进 / 倒车　A D 转向　Shift 加速　B 喇叭　Drag 环绕';
  el('hud-location-name').textContent=currentLocation(walker.position,this.places,walker.active?'':this.activeCamera);
  el('hud-location-coordinates').textContent=`${Math.round(walker.position.x)}, ${Math.round(walker.position.z)}`;
 }
}
