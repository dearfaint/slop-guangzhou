import {StreetDetails} from './street-details.ts';
import {NightLights} from './night-lights.ts';
import {Forecourts} from './forecourts.ts';
import {cityView} from './city-views.ts';
import {Waterfront} from './waterfront.ts';
import {RiverReflections} from './river-water.ts';
import { PearlPark } from './pearl-park.ts';
import { withPearlPark, parkPlaces } from './pearl-park-layout.ts';
import { precompileScene } from './precompile.ts';
import { ReferenceUI } from './reference-ui.ts';
import { HUACHENG_SPAWN } from './startup.ts';
import { SouthAxis, southAxisGround } from './south-axis.ts';
import './reference-ui.css';
import * as THREE from 'three/webgpu';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { buildingMaterial, palette } from './materials';
import { ReferenceEnvironment } from './reference-environment.ts';
import { UrbanLife } from './urban-life';
import { CitySound } from './city-sound.ts';
import { Streets } from './streets';
import { RoadMarkings } from './road-markings';
import { Haixinsha } from './haixinsha.ts';
import { Minimap } from './minimap';
import { TravelAvatar } from './travel-avatar';
import { WalkControls, travelSettings, type TravelMode } from './walk-controls';
import { cityNight } from './lighting-state';
import { setLandmarkNight } from './landmarks';
import { Tiles } from './tiles';
import { DynamicResolution } from './resolution';
import { createHuachengStone, createStoneInscription, huachengStone } from './huacheng-stone.ts';
import { OperaSite } from './opera-site.ts';
import { OperaReflections } from './opera-materials.ts';
import type { Landmark, Manifest } from './types';
const el = <T extends HTMLElement=HTMLElement>(id:string)=>document.getElementById(id) as T;
const status=el('load-status');
const boot=el('boot');
const bootTimings:Record<string,number>={};
const loading=(progress:number,message:string)=>{if([2,6,12,60,72,82,94,100].includes(progress)){bootTimings[progress]=Math.round(performance.now());boot.dataset.timings=JSON.stringify(bootTimings);}el<HTMLProgressElement>('boot-progress').value=progress;el('boot-message').textContent=message;};
const nextPaint=()=>new Promise<void>(resolve=>requestAnimationFrame(()=>resolve()));
function error(message:string) { el('error').hidden=false;el('error').textContent=message;status.textContent='场景加载失败';boot.hidden=false;el('boot-message').textContent=message;el('boot-retry').hidden=false; }
const about=el<HTMLDialogElement>('about');
el('about-open').onclick=()=>about.showModal();el('about-close').onclick=()=>about.close();
el('metrics-more').onclick=()=>{const p=el('performance-detail');p.hidden=!p.hidden;el('metrics-more').setAttribute('aria-expanded',String(!p.hidden));};
async function start() {
  loading(2,'正在读取城市数据…');
  const response=await fetch(`${import.meta.env.BASE_URL}data/manifest.json`);
  if(!response.ok)throw new Error('城市数据清单不存在，请先运行 data:build。');
  const manifest:Manifest=await response.json();
  el('data-summary').textContent=`${manifest.stats.buildings} 条建筑 / 部件记录 · ${manifest.stats.roads} 段道路 · ${manifest.tiles.length} 个分块。\n原始高度或楼层记录 ${manifest.stats.sourceHeight||0} 条，估算高度 ${manifest.stats.estimatedHeight||0} 条。\n地图 JSON ${(manifest.stats.jsonBytes/1024).toFixed(0)} KB，gzip ${(manifest.stats.gzipBytes/1024).toFixed(0)} KB。数据处理于 ${manifest.generated.slice(0,10)}。`;
  let canvas=el<HTMLCanvasElement>('city');
  const resolution=new DynamicResolution(devicePixelRatio);
  const forceWebGL=new URLSearchParams(location.search).has('webgl');
  let renderer=new THREE.WebGPURenderer({canvas,antialias:true,powerPreference:'high-performance',reversedDepthBuffer:true,forceWebGL});
  renderer.setPixelRatio(resolution.ratio);renderer.setSize(innerWidth,innerHeight);
  loading(6,'正在初始化图形引擎…');
  const initializing=renderer.init();
  let timeout:ReturnType<typeof setTimeout>|undefined,automaticFallback=false;
  try{
    await Promise.race([initializing,new Promise<never>((_,reject)=>{timeout=setTimeout(()=>reject(new Error('渲染器初始化超时')),6000);})]);
  }catch(cause){
    if(forceWebGL)throw cause;
    automaticFallback=true;
    // A late WebGPU initialization must never claim the active WebGL canvas.
    const abandoned=renderer,replacement=canvas.cloneNode(false) as HTMLCanvasElement;
    canvas.replaceWith(replacement);canvas=replacement;
    void initializing.then(()=>abandoned.dispose(),()=>{});
    renderer=new THREE.WebGPURenderer({canvas,antialias:true,powerPreference:'high-performance',reversedDepthBuffer:true,forceWebGL:true});
    renderer.setPixelRatio(resolution.ratio);renderer.setSize(innerWidth,innerHeight);
    await renderer.init();
  }finally{clearTimeout(timeout);}
  renderer.shadowMap.enabled=true;
  renderer.toneMapping=THREE.ACESFilmicToneMapping;renderer.toneMappingExposure=1.2;
  const backend=(renderer.backend as unknown as {isWebGPUBackend?:boolean}).isWebGPUBackend?'WebGPU':'WebGL 2';
  el('backend').textContent=backend+' / TSL'+(automaticFallback?' · 自动降级':'');
  const scene=new THREE.Scene();scene.background=palette.sky;scene.fog=new THREE.Fog(palette.sky,3800,8500);
  const camera=new THREE.PerspectiveCamera(42,innerWidth/innerHeight,2,14000);
  const riverReflections=new RiverReflections();
  const controls=new OrbitControls(camera,canvas);controls.enableDamping=true;controls.dampingFactor=.065;controls.minDistance=80;controls.maxDistance=5600;controls.maxPolarAngle=Math.PI*.48;controls.autoRotateSpeed=.45;
  const home=new THREE.Vector3(650,1050,-1620),homeTarget=new THREE.Vector3(-310,45,-300);
  camera.position.copy(home);controls.target.copy(homeTarget);controls.update();
  loading(12,'正在建立地标与城市环境…');await nextPaint();
  const environment=new ReferenceEnvironment(scene,renderer),life=new UrbanLife(),streets=new Streets(),forecourts=new Forecourts(),streetDetails=new StreetDetails(),nightLights=new NightLights(),markings=new RoadMarkings();
  const southAxis=new SouthAxis(),island=new Haixinsha(),park=new PearlPark();
  const waterfront=new Waterfront();
  scene.add(life.root,streets.root,forecourts.root,streetDetails.root,nightLights.root,markings.root,southAxis.root,island.root,park.root,waterfront.root);
  scene.add(createHuachengStone(createStoneInscription()));
  const operaSite=new OperaSite();scene.add(operaSite.root);const operaReflections=new OperaReflections();
  let mapDirty=0;
  let mode:'orbit'|'walk'|'tour'='orbit',tourIndex=0,tourNext=0;
  const walker=new WalkControls(camera,canvas,()=>setMode('orbit'),()=>updateTravelUI());
  const avatar=new TravelAvatar();scene.add(avatar.root);
  const soundButton=el<HTMLButtonElement>('btn-sound');
  const updateSoundUI=()=>{const engine=sound.engine;soundButton.setAttribute('aria-pressed',String(engine.enabled));soundButton.setAttribute('aria-label',engine.enabled?'关闭音效':'开启音效');soundButton.title=engine.enabled?'关闭音效 N':'开启音效 N';soundButton.querySelector('use')!.setAttribute('href',engine.enabled?'#i-sound':'#i-sound-off');soundButton.dataset.state=engine.context?.state??'inactive';};
  const sound=new CitySound(life,walker,avatar,updateSoundUI);updateSoundUI();
  soundButton.onclick=()=>{sound.engine.setEnabled(!sound.engine.enabled);updateSoundUI();};
  addEventListener('pagehide',()=>{sound.engine.reset();void sound.engine.suspend();});

  const orbitPosition=new THREE.Vector3(),orbitTarget=new THREE.Vector3();
  const minimap=new Minimap(el<HTMLCanvasElement>('minimap'));
  const minimapViewDirection=new THREE.Vector3();
  const closePlaces=()=>{el('places-content').hidden=true;el('places-toggle').setAttribute('aria-expanded','false');el('places-action').textContent='＋';};
  el('places-toggle').onclick=()=>{const content=el('places-content');content.hidden=!content.hidden;el('places-toggle').setAttribute('aria-expanded',String(!content.hidden));el('places-action').textContent=content.hidden?'＋':'−';};
  document.querySelector('.scene-settings')!.addEventListener('toggle',e=>{if((e.target as HTMLDetailsElement).open){closePlaces();}});
  let firstEntry=true;
  let orbitSelection='花城广场 · 中轴全景';
  function setMode(next:typeof mode){
    if(next===mode)return;
    if(mode==='walk'){const focus=walker.position.clone();focus.y=0;walker.exit();avatar.root.visible=false;camera.position.copy(focus).add(orbitPosition.clone().sub(orbitTarget));controls.target.copy(focus);el('selection').textContent=orbitSelection;}
    mode=next;el<HTMLInputElement>('height').disabled=next==='walk';flight=null;controls.autoRotate=false;keys.clear();
    if(next==='walk'){
      controls.update();orbitPosition.copy(camera.position);orbitTarget.copy(controls.target);orbitSelection=el('selection').textContent??'';
      controls.enabled=false;walker.setMap(withPearlPark([...tiles.loaded.values()].map(t=>t.data)));
      if(firstEntry){walker.thirdPerson=true;walker.setTravel('car');walker.enter(HUACHENG_SPAWN,new THREE.Vector3(0,0,-1),true);firstEntry=false;}else walker.resume();
      updateTravelUI();
    }
    else{controls.enabled=true;controls.update();}
    if(next!=='walk'){document.body.classList.remove('third-person');el('altitude-pad').hidden=true;el('map-mode').textContent='全览焦点';}
    document.body.classList.toggle('walking',next==='walk');el('walk-hud').hidden=next!=='walk';
    for(const value of ['orbit','walk','tour'])el('mode-'+value).setAttribute('aria-pressed',String(next===value));
    el('rotate').setAttribute('aria-pressed','false');
    if(next==='tour')tourNext=0;
  }
  for(const value of ['orbit','walk','tour'] as const)el('mode-'+value).onclick=()=>setMode(value);
  function updateTravelUI(){
    const settings=travelSettings[walker.travel],speed=el<HTMLInputElement>('walk-speed');
    el('walk-position').textContent=`位置 ${walker.position.x.toFixed(1)}, ${walker.position.z.toFixed(1)} m · 高度 ${walker.position.y.toFixed(0)} m`;
    speed.min=String(settings.min);speed.max=String(settings.max);speed.value=String(walker.speed);speed.setAttribute('aria-label',settings.label+'速度');
    el('speed-label').textContent=settings.label+'速度';el('speed-value').textContent=walker.speed+' m/s';
    const view=walker.thirdPerson?'第三人称':'第一人称';
    document.body.classList.toggle('third-person',walker.thirdPerson);
    el('selection').textContent=view+' · '+settings.label;el('map-mode').textContent=settings.label+'位置';
    el('travel-help').textContent=(walker.travel==='bike'||walker.travel==='car'?'W/S 前后 · A/D 转向':'WASD 移动')+(walker.travel==='balloon'?' · E/Q 升降':'')+' · 拖动看向 · Shift '+(walker.travel==='walk'?'跑步':'加速')+' · C 切换视角';
    el('altitude-pad').hidden=walker.travel!=='balloon';
    document.querySelectorAll<HTMLButtonElement>('[data-travel]').forEach(b=>b.setAttribute('aria-pressed',String(b.dataset.travel===walker.travel)));
  }
  document.querySelectorAll<HTMLButtonElement>('[data-travel]').forEach(b=>b.onclick=()=>{if(mode!=='walk')setMode('walk');walker.setTravel(b.dataset.travel as TravelMode);updateTravelUI();});
  el('walk-exit').onclick=()=>setMode('orbit');
  el<HTMLInputElement>('walk-speed').oninput=e=>{walker.speed=Number((e.target as HTMLInputElement).value);el('speed-value').textContent=walker.speed+' m/s';};
  el('pointer-lock').onclick=()=>void walker.lockPointer();
  document.querySelectorAll<HTMLButtonElement>('[data-hour]').forEach(b=>b.onclick=()=>environment.setTime(Number(b.dataset.hour)));
  el<HTMLInputElement>('time').oninput=e=>environment.setTime(Number((e.target as HTMLInputElement).value));
  el<HTMLInputElement>('cycle').onchange=e=>{environment.autoCycle=(e.target as HTMLInputElement).checked;};
  const ground=new THREE.Mesh(southAxisGround(),new THREE.MeshStandardMaterial({color:palette.ground,roughness:1}));scene.add(ground);
  const tiles=new Tiles(manifest,buildingMaterial(),()=>{mapDirty=performance.now();status.textContent=tiles.errors?`${tiles.loaded.size} 区块可见 · ${tiles.failed.size} 区块重试中`:`${tiles.buildings.toLocaleString()} 条建筑 / 部件记录 · ${tiles.loaded.size} / ${manifest.tiles.length} 区块`;});
  scene.add(tiles.root);
  const origin=manifest.origin;
  const toLocal=(lon:number,lat:number)=>new THREE.Vector3((lon-origin[0])*Math.PI/180*6378137*Math.cos(origin[1]*Math.PI/180),0,-(lat-origin[1])*Math.PI/180*6378137);
  const landmarkResponse=await fetch(`${import.meta.env.BASE_URL}data/landmarks.json`);
  if(!landmarkResponse.ok)throw new Error('地标数据不存在');
  const landmarks:Landmark[]=[...await landmarkResponse.json(),...parkPlaces];
  let flight: {from:THREE.Vector3;to:THREE.Vector3;targetFrom:THREE.Vector3;targetTo:THREE.Vector3;time:number}|null=null;
  function fly(position:THREE.Vector3,target:THREE.Vector3,minDistance=80,fov=42) {camera.fov=fov;camera.updateProjectionMatrix();controls.minDistance=minDistance;controls.autoRotate=false;el('rotate').setAttribute('aria-pressed','false');flight={from:camera.position.clone(),to:position,targetFrom:controls.target.clone(),targetTo:target,time:performance.now()};}
  function overview(){setMode('orbit');fly(home,homeTarget);el('selection').textContent='花城广场 · 中轴全景';document.querySelectorAll('.place').forEach(b=>b.classList.remove('selected'));}
  landmarks.forEach((p,i)=>{
    const button=document.createElement('button');button.className='place';button.setAttribute('aria-label',`定位${p.name}`);
    const idx=document.createElement('span');idx.className='index';idx.textContent=String(i+1).padStart(2,'0');
    const text=document.createElement('span'),name=document.createElement('strong'),en=document.createElement('small');name.textContent=p.name;en.textContent=p.en;text.append(name,en);
    const arrow=document.createElement('span');arrow.className='arrow';arrow.textContent='↗';button.append(idx,text,arrow);
    button.onclick=()=>{if(mode==='walk')setMode('orbit');if(p.h===0){overview();button.classList.add('selected');return;}document.querySelectorAll('.place').forEach(b=>b.classList.remove('selected'));button.classList.add('selected');el('selection').textContent=p.name+' · '+p.description;const target=toLocal(p.lon,p.lat);target.y=Math.max(0,p.h*.35);const distance=p.name==='广州大剧院'?190:p.h>150||p.h===0?700:260;fly(target.clone().add(new THREE.Vector3(distance*.85,Math.max(distance*.75,p.h*1.4),distance)),target);};
    el('landmarks').append(button);
  });
  const southButton=document.createElement('button');southButton.className='place';southButton.setAttribute('aria-label','定位南广场精细区域');
  southButton.innerHTML='<span class="index">19</span><span><strong>南广场 · 临江隧道</strong><small>SOUTH AXIS</small></span><span class="arrow">↗</span>';
  southButton.onclick=()=>{setMode('orbit');const target=toLocal(113.3191,23.1163);fly(target.clone().add(new THREE.Vector3(220,230,270)),target);el('selection').textContent='南广场 · 新中轴隧道 · 海心沙二号桥';};el('landmarks').append(southButton);
  const islandButton=document.createElement('button');islandButton.className='place';islandButton.innerHTML='<span class="index">20</span><span><strong>海心沙 · 建筑与桥梁</strong><small>HAIXINSHA ISLAND</small></span><span class="arrow">↗</span>';
  islandButton.onclick=()=>{setMode('orbit');const target=new THREE.Vector3(-240,0,550);fly(target.clone().add(new THREE.Vector3(160,450,580)),target);el('selection').textContent='海心沙 · 西区看台 / 东区建筑 / 连接桥';};el('landmarks').append(islandButton);
  const stoneButton=document.createElement('button');stoneButton.className='place';stoneButton.setAttribute('aria-label','定位花城广场题字石');
  stoneButton.innerHTML='<span class="index">21</span><span><strong>花城广场 · 题字石</strong><small>HUACHENG SQUARE STONE</small></span><span class="arrow">↗</span>';
  stoneButton.onclick=()=>{setMode('orbit');const target=new THREE.Vector3(huachengStone.x,2.1,huachengStone.z);fly(target.clone().add(new THREE.Vector3(1,1.6,17)),target,8);el('selection').textContent='花城广场 · 青灰景石与金色题字';};el('landmarks').append(stoneButton);
  document.querySelectorAll('#landmarks .index').forEach((label,i)=>label.textContent=String(i+1).padStart(2,'0'));
  let mapRequest=0;
  minimap.onNavigate=async point=>{
    const request=++mapRequest;
    flight=null;controls.autoRotate=false;el('rotate').setAttribute('aria-pressed','false');
    document.querySelectorAll('.place').forEach(b=>b.classList.remove('selected'));
    if(mode==='walk'){
      el('selection').textContent='正在加载跳转区域…';
      const nearby=manifest.tiles.filter(t=>Math.hypot(t.center[0]-point[0],t.center[1]-point[1])<850);
      await Promise.all(nearby.filter(t=>!tiles.loaded.has(t.id)).map(t=>tiles.load(t)));
      if(request!==mapRequest||mode!=='walk')return;
      if(nearby.some(t=>tiles.pending.has(t.id)||!tiles.loaded.has(t.id))){el('selection').textContent='目标区域加载中，请稍后再点';return;}
      walker.setMap(withPearlPark([...tiles.loaded.values()].map(t=>t.data)));
      camera.getWorldDirection(forward);walker.enter(point,forward);updateTravelUI();
    }else{
      setMode('orbit');const target=new THREE.Vector3(point[0],0,point[1]);
      const offset=camera.position.clone().sub(controls.target);fly(target.clone().add(offset),target);
      el('selection').textContent=`地图定位 · ${point[0].toFixed(0)}, ${point[1].toFixed(0)} m`;
    }
  };
  el('overview').onclick=overview;el('reset').onclick=overview;
  el('rotate').onclick=()=>{setMode('orbit');flight=null;controls.autoRotate=!controls.autoRotate;el('rotate').setAttribute('aria-pressed',String(controls.autoRotate));};
  controls.addEventListener('start',()=>{if(mode==='tour')setMode('orbit');flight=null;});
  const slider=el<HTMLInputElement>('height');slider.oninput=()=>{if(mode==='walk')return;flight=null;camera.position.y=Number(slider.value);controls.update();};
  const keys=new Set<string>();
  window.addEventListener('keydown',e=>{if(mode==='walk')return;if((e.target as HTMLElement)?.matches('input,button,dialog')||about.open)return;if(['KeyW','KeyA','KeyS','KeyD','ArrowUp','ArrowDown','ArrowLeft','ArrowRight'].includes(e.code)){e.preventDefault();keys.add(e.code);flight=null;}});
  window.addEventListener('keyup',e=>keys.delete(e.code));window.addEventListener('blur',()=>keys.clear());
  addEventListener('resize',()=>{camera.aspect=innerWidth/innerHeight;camera.updateProjectionMatrix();renderer.setSize(innerWidth,innerHeight);});
  await tiles.preload((loaded,total)=>loading(16+loaded/total*42,`正在加载地图与建筑… ${Math.floor(loaded)} / ${total}`));
  loading(60,'正在生成参考项目的人物模型与骨骼动作…');await nextPaint();
  loading(72,'正在布置车辆、行人、树木与公共设施…');await nextPaint();
  const data=withPearlPark([...tiles.loaded.values()].map(t=>t.data));
  walker.setMap(data);minimap.setMap(data);life.setMap(data);streets.setMap(data);forecourts.setMap(data);streetDetails.setMap(data);nightLights.setLamps([...streets.getLampSites(),...streetDetails.getLightSites()]);markings.setMap(data);sound.setMap(data);waterfront.setMap(data);mapDirty=0;
  setMode('walk');
  environment.update(0,camera.position);cityNight.value=environment.night;
  waterfront.update(0,environment.night);

  life.update(0,0,environment.night,camera.position);streets.update(environment.night,camera.position);streetDetails.update(environment.night,camera.position);
  avatar.update(walker,0);nightLights.update(environment.night,camera.position,life.getAudioActors().cars,walker.active&&walker.travel==='car'?avatar.car:undefined);southAxis.update(0,environment.night,camera.position);island.update(camera.position);park.update(camera.position,environment.night);operaSite.update(camera.position);
  if((renderer.backend as unknown as {isWebGPUBackend?:boolean}).isWebGPUBackend){
    scene.traverse(object=>{if(object instanceof THREE.InstancedMesh)object.instanceMatrix=new THREE.StorageInstancedBufferAttribute(object.instanceMatrix.array as Float32Array,16);});
  }
  loading(82,'正在预编译场景材质与人物动画…');await nextPaint();
  const compileProfile=await precompileScene(renderer,scene,camera,ratio=>loading(82+ratio*10,`正在预编译场景材质… ${Math.round(ratio*100)}%`));
  boot.dataset.compileProfile=JSON.stringify(compileProfile);
  loading(94,'正在预热首帧与灯光…');await nextPaint();
  renderer.render(scene,camera);await nextPaint();renderer.render(scene,camera);
  await (renderer.backend as unknown as {device?:{queue:{onSubmittedWorkDone:()=>Promise<void>}}}).device?.queue.onSubmittedWorkDone();
  loading(100,'准备就绪 · 花城广场');await nextPaint();
  sound.engine.ready=true;boot.hidden=true;document.body.setAttribute('aria-busy','false');
  const ui=new ReferenceUI(walker,camera,environment,sound,landmarks.map(p=>({name:p.name,point:toLocal(p.lon,p.lat)})),{
   scenic:(name:string)=>{if(name==='drone'){setMode('tour');return;}setMode('orbit');const view=cityView(name,landmarks,origin,camera.aspect);fly(view.position,view.target,80,view.fov);},
   follow:()=>{if(mode!=='walk')setMode('walk');},
   teleport:(point:THREE.Vector3)=>{if(mode!=='walk')setMode('walk');const place=parkPlaces.find(p=>toLocal(p.lon,p.lat).distanceTo(point)<.1);const direction=place?new THREE.Vector3(place.lookAt[0]-point.x,0,place.lookAt[1]-point.z):new THREE.Vector3(0,0,-1);walker.enter([point.x,point.z],direction,true);updateTravelUI();},
  });
  let last=performance.now(),metricTime=last,tileTime=0,frames=0,firstFrame=0;
  const forward=new THREE.Vector3(),right=new THREE.Vector3(),move=new THREE.Vector3();
  // ?cinema: no animation loop; promo/capture drives fixed-step frames and an optional scripted camera.
  const cinema=new URLSearchParams(location.search).has('cinema');
  let shotCamera:{position:THREE.Vector3;target:THREE.Vector3;fov:number}|null=null;
  const frame=(now:number,dt:number)=>{
    if(mapDirty&&now-mapDirty>250){const data=withPearlPark([...tiles.loaded.values()].map(t=>t.data));walker.setMap(data);minimap.setMap(data);life.setMap(data);streets.setMap(data);forecourts.setMap(data);streetDetails.setMap(data);nightLights.setLamps([...streets.getLampSites(),...streetDetails.getLightSites()]);markings.setMap(data);sound.setMap(data);waterfront.setMap(data);mapDirty=0;}
    if(mode==='tour'&&now>tourNext){const place=landmarks[tourIndex++%landmarks.length],target=toLocal(place.lon,place.lat);target.y=place.h*.25;fly(target.clone().add(new THREE.Vector3(450,Math.max(350,place.h),500)),target);tourNext=now+9000;}
    if(flight){const t=Math.min(1,(now-flight.time)/(matchMedia('(prefers-reduced-motion: reduce)').matches?1:1400));const eased=t*t*(3-2*t);camera.position.lerpVectors(flight.from,flight.to,eased);controls.target.lerpVectors(flight.targetFrom,flight.targetTo,eased);if(t===1)flight=null;}
    if(mode!=='walk'&&keys.size&&!about.open){camera.getWorldDirection(forward);forward.y=0;forward.normalize();right.crossVectors(forward,camera.up).normalize();move.set(0,0,0);if(keys.has('KeyW')||keys.has('ArrowUp'))move.add(forward);if(keys.has('KeyS')||keys.has('ArrowDown'))move.sub(forward);if(keys.has('KeyD')||keys.has('ArrowRight'))move.add(right);if(keys.has('KeyA')||keys.has('ArrowLeft'))move.sub(right);move.normalize().multiplyScalar(dt*Math.max(100,camera.position.y*.5));camera.position.add(move);controls.target.add(move);}
    walker.world.setVehicles(life.getVehicleBodies());
    if(mode==='walk'){walker.update(dt);avatar.update(walker,dt);}else controls.update();
    if(mode!=='walk'){
    // Bound camera target to the downloaded core area instead of flying into empty space.
    const clampedX=THREE.MathUtils.clamp(controls.target.x,-1700,1680),clampedZ=THREE.MathUtils.clamp(controls.target.z,-1550,1800);
    camera.position.x+=clampedX-controls.target.x;camera.position.z+=clampedZ-controls.target.z;controls.target.x=clampedX;controls.target.z=clampedZ;
    }
    if(now-tileTime>200){tiles.radius=mode==='walk'?950:THREE.MathUtils.clamp(camera.position.distanceTo(controls.target)*.72,850,2500);tiles.update(mode==='walk'?walker.position:controls.target);tileTime=now;}
    if(mode==='walk')forward.set(-Math.sin(walker.heading),0,-Math.cos(walker.heading));else camera.getWorldDirection(forward);
    minimap.update(now,mode==='walk'?walker.position:controls.target,forward,mode==='walk',camera.getWorldDirection(minimapViewDirection));
    environment.update(dt,camera.position);cityNight.value=environment.night;setLandmarkNight(environment.night);
    waterfront.update(now/1000,environment.night);

    life.setPlayerVehicle(walker.travel==='car'?{x:walker.position.x,z:walker.position.z,y:walker.position.y-1.15,heading:walker.heading,length:4.4,width:1.9,height:1.5}:undefined);
    if(mode==='walk')life.updatePopulation(walker.position);
    life.update(dt,now/1000,environment.night,camera.position);sound.update(dt,now/1000,camera,environment.night);streets.update(environment.night,camera.position);streetDetails.update(environment.night,camera.position);nightLights.update(environment.night,camera.position,life.getAudioActors().cars,mode==='walk'&&walker.travel==='car'?avatar.car:undefined);
    southAxis.update(now/1000,environment.night,camera.position);island.update(camera.position);park.update(camera.position,environment.night);
    operaSite.update(camera.position);operaReflections.update(renderer,scene,environment.hours,environment.night);
    if(shotCamera){camera.position.copy(shotCamera.position);camera.lookAt(shotCamera.target);if(camera.fov!==shotCamera.fov){camera.fov=shotCamera.fov;camera.updateProjectionMatrix();}}
    ui.update();riverReflections.update(renderer,scene,camera,now);renderer.render(scene,camera);frames++;
    if(!firstFrame&&tiles.loaded.size){firstFrame=performance.now();}
    if(now-metricTime>800){
      const stats=life.getStats(),green=streets.getStats(),hours=environment.hours;
      const roadStats=markings.getStats();
      el('life-count').textContent=`${stats.cars} 辆车 / ${stats.vehicleTypes} 类 · ${stats.pedestrians} 行人 / 参考项目人物 · ${green.trees} 株植被\n${stats.signals} 处推测信号灯 · ${stats.stopped} 辆车停候\n${roadStats.crossings} 处推测斑马线`;
      el('clock').textContent=`${String(Math.floor(hours)).padStart(2,'0')}:${String(Math.floor(hours%1*60)).padStart(2,'0')}`;
      el<HTMLInputElement>('time').value=String(hours);document.body.classList.toggle('night',environment.night>.5);
      slider.disabled=mode==='walk';el('walk-position').textContent=`位置 ${walker.position.x.toFixed(1)}, ${walker.position.z.toFixed(1)} m · 高度 ${walker.position.y.toFixed(0)} m`;
      const fps=frames*1000/(now-metricTime);el('fps').textContent=String(Math.round(fps));el('hud-fps').textContent=String(Math.round(fps));
      // Skip samples spanning a hidden tab or long stall; they do not reflect render cost.
      const ratio=!cinema&&now-metricTime<2000?resolution.sample(fps,now):null;if(ratio!==null)renderer.setPixelRatio(ratio);el('calls').textContent=String((renderer.info.render as typeof renderer.info.render & {drawCalls:number}).drawCalls);el('tiles').textContent=String(tiles.loaded.size);el('size').textContent=(tiles.bytes/1024).toFixed(0);
      const memory=(performance as unknown as {memory?:{usedJSHeapSize:number}}).memory;
      el('performance-detail').textContent=`渲染后端：${backend}\n人物：Slop New York 程序模型 · ${stats.characters.detailed} 近景 · 2 级 LOD\n首次地图可见：${firstFrame?(firstFrame/1000).toFixed(2)+' s':'加载中'}（含页面资源与初始化）\n三角形：${renderer.info.render.triangles.toLocaleString()}\n几何体：${renderer.info.memory.geometries}\nJS 堆：${memory?(memory.usedJSHeapSize/1048576).toFixed(1)+' MB':'浏览器未提供'}\n渲染分辨率：${resolution.ratio}× 像素（上限 ${resolution.max}×，帧率低时自动降低）\nGPU 内存：浏览器未提供\n当前地图：${(tiles.bytes/1024).toFixed(0)} KB（JSON 解压大小）\n完整地图：${(manifest.stats.jsonBytes/1024).toFixed(0)} KB / gzip ${(manifest.stats.gzipBytes/1024).toFixed(0)} KB`;
      el('height-value').textContent=Math.round(camera.position.y)+' m';slider.value=String(camera.position.y);
      if(mode==='walk')camera.getWorldDirection(forward);
      const heading=mode==='walk'?walker.heading:controls.getAzimuthalAngle();(document.querySelector('.compass svg') as SVGElement).style.transform=`rotate(${-heading}rad)`;
      frames=0;metricTime=now;
    }
  };
  if(!cinema){renderer.setAnimationLoop(()=>{const now=performance.now(),dt=Math.min((now-last)/1000,.05);last=now;frame(now,dt);});return;}
  renderer.setPixelRatio(1);
  let virtualNow=last;
  const device=(renderer.backend as unknown as {device?:{queue:{onSubmittedWorkDone:()=>Promise<void>}}}).device;
  const v=(p:number[])=>new THREE.Vector3(p[0],p[1],p[2]);
  Object.assign(window,{cinema:{
    backend,
    async step(count=1,dt=1/30){for(let i=0;i<count;i++){virtualNow+=dt*1000;frame(virtualNow,dt);}await device?.queue.onSubmittedWorkDone();},
    time:(hours:number)=>environment.setTime(hours),
    shot(position:number[],target:number[],fov=42){setMode('orbit');flight=null;controls.target.copy(v(target));shotCamera={position:v(position),target:v(target),fov};},
    camera(position:number[],target:number[],fov=42){if(mode!=='walk')controls.target.copy(v(target));shotCamera={position:v(position),target:v(target),fov};},
    travel(travel:TravelMode,x:number,z:number,dx:number,dz:number,view:'chase'|'action'|'pov'='chase'){shotCamera=null;setMode('walk');walker.setTravel(travel);walker.enter([x,z],new THREE.Vector3(dx,0,dz),true);walker.setCameraView(view);updateTravelUI();},
    follow(){shotCamera=null;},
    fov(value:number){camera.fov=value;camera.updateProjectionMatrix();},
    state:()=>({x:walker.position.x,y:walker.position.y,z:walker.position.z,heading:walker.heading,hours:environment.hours,mode}),
  }});
  document.body.dataset.cinema='ready';
}
start().catch(e=>{console.error(e);error(`无法启动城市场景：${e.message}。请检查浏览器是否支持 WebGPU / WebGL 2，并使用本地 HTTP 服务访问。`);});
