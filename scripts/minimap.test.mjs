import test from 'node:test';
import assert from 'node:assert/strict';
import {mapScreen,mapPoint,mapDestination} from '../src/minimap-layout.ts';

test('rectangular radar maps the player to its center and preserves north',()=>{
 const view={center:[1200,-500],scale:.32,width:288,height:184};
 assert.deepEqual(mapScreen(view.center,view),[144,92]);
 assert.deepEqual(mapScreen([1200,-600],view),[144,60]);
 assert.deepEqual(mapScreen([1300,-500],view),[176,92]);
});
test('atlas click coordinates invert pan and zoom at each display aspect ratio',()=>{
 for(const [width,height] of [[288,184],[1000,650],[340,700]])for(const scale of [.08,.32,.7]){
  const view={center:[400,-250],scale,width,height};
  for(const point of [[0,0],[1615,-505],[-900,1200]]){
   const pixel=mapScreen(point,view),actual=mapPoint(...pixel,view);
   assert.ok(Math.hypot(actual[0]-point[0],actual[1]-point[1])<1e-8);
  }
 }
});
test('expanded map accepts the east park and clamps destinations to downloaded bounds',()=>{
 const view={center:[0,130],scale:.2,width:1000,height:700};
 assert.deepEqual(mapDestination(...mapScreen([1615,-505],view),view),[1615,-505]);
 assert.deepEqual(mapDestination(-10000,10000,view),[-1660,1760]);
});

test('radar opens the atlas without teleporting, dragging pans without triggering navigation',async()=>{
 const {readFileSync}=await import('node:fs'),ts=await import('typescript'),url=new URL('../src/minimap.ts',import.meta.url);
 const source=readFileSync(url,'utf8').replace(/from '(\.\/[^']+)'/g,(_,path)=>`from '${new URL(path,url)}'`);
 const compiled=ts.transpileModule(source,{compilerOptions:{module:ts.ModuleKind.ESNext,target:ts.ScriptTarget.ES2022}}).outputText;
 const {Minimap}=await import('data:text/javascript;base64,'+Buffer.from(compiled).toString('base64'));
 const previous=globalThis.document,listeners={},buttons={};let opened=0,navigated=0;
 globalThis.document={createElement:()=>({}),getElementById:id=>id==='btn-open-map'?{click:()=>opened++}:{addEventListener:(type,fn)=>buttons[id]=fn}};
 const original=Minimap.prototype.setMap;Minimap.prototype.setMap=()=>{};
 try{
  const canvas={getContext:()=>({}),addEventListener:(type,fn)=>listeners[type]=fn,getBoundingClientRect:()=>({left:0,top:0,width:288,height:184}),setPointerCapture(){}};
  const map=new Minimap(canvas);map.onNavigate=()=>navigated++;
  listeners.click({clientX:144,clientY:92});assert.equal(opened,1);assert.equal(navigated,0);
  map.expanded=true;map.view={center:[0,0],scale:.32,width:288,height:184};map.center=[0,0];
  listeners.pointerdown({button:0,clientX:144,clientY:92,pointerId:1});listeners.pointermove({clientX:176,clientY:92});listeners.pointerup();listeners.click({clientX:176,clientY:92});
  assert.deepEqual(map.center,[-100,0]);assert.equal(navigated,0);
  listeners.click({clientX:144,clientY:92});assert.equal(navigated,1);
  map.focus=[1615,-505];buttons['map-center-player']();assert.deepEqual(map.center,[1615,-505]);buttons['map-view-all']();const overview=map.minZoom();assert.equal(map.zoom,overview);buttons['map-zoom-in']();assert.equal(map.zoom,overview*1.45);buttons['map-zoom-out']();assert.equal(map.zoom,overview);
 }finally{globalThis.document=previous;Minimap.prototype.setMap=original;}
});
