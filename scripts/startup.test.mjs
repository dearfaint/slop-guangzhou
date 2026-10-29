import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {PerspectiveCamera,Vector3,MeshStandardMaterial} from 'three/webgpu';
import {WalkControls} from '../src/walk-controls.ts';
import {HUACHENG_SPAWN} from '../src/startup.ts';
import {Tiles} from '../src/tiles.ts';
import {LAWN_TOP} from '../src/street-surface.ts';
const root=new URL('../public/data/',import.meta.url);
const read=name=>JSON.parse(readFileSync(new URL(name,root),'utf8'));

test('first car entry stays on central Huacheng Square instead of snapping to a road',()=>{
 const oldWindow=globalThis.window,oldDocument=globalThis.document;
 globalThis.window=new EventTarget();globalThis.document={querySelector:()=>null,querySelectorAll:()=>[],pointerLockElement:null};
 const canvas=new EventTarget(),controls=new WalkControls(new PerspectiveCamera(),canvas,()=>{});
 try{
  controls.setMap(read('manifest.json').tiles.map(t=>read(t.id+'.json')));controls.setTravel('car');
  controls.enter(HUACHENG_SPAWN,new Vector3(0,0,-1),true);
  assert.deepEqual([controls.position.x,controls.position.z],HUACHENG_SPAWN);
  assert.ok(controls.position.z < -300,'entry must stay north of the riverside road');
  assert.ok(controls.world.canStand(...HUACHENG_SPAWN,1.2));
  // The spawn stands on the square's lawn, not on the raised footway level.
  assert.equal(controls.world.groundHeight(...HUACHENG_SPAWN),LAWN_TOP);
 }finally{controls.dispose();globalThis.window=oldWindow;globalThis.document=oldDocument;}
});

test('startup waits for every tile, limits concurrency and retains ready tiles during roaming',async()=>{
 const oldFetch=globalThis.fetch,material=new MeshStandardMaterial();
 const manifest={tiles:Array.from({length:7},(_,i)=>({id:String(i),center:[i*600,0],bytes:1}))};
 let active=0,maxActive=0,requests=0;
 globalThis.fetch=async()=>{requests++;active++;maxActive=Math.max(maxActive,active);await new Promise(resolve=>setTimeout(resolve,4));active--;return {ok:true,json:async()=>({buildings:[],roads:[],areas:[]})};};
 const tiles=new Tiles(manifest,material,()=>{}),progress=[];
 try{
  await tiles.preload((loaded,total)=>progress.push([loaded,total]));
  assert.equal(maxActive,3);assert.equal(requests,7);assert.equal(tiles.loaded.size,7);
  assert.equal(tiles.pending.size,0);assert.deepEqual(progress.at(-1),[7,7]);
  await tiles.load(manifest.tiles[0]);assert.equal(requests,7,'ready tiles are not downloaded or constructed again');
  tiles.update(new Vector3(100000,0,100000));assert.equal(tiles.loaded.size,7);
 }finally{globalThis.fetch=oldFetch;material.dispose();}
});

test('a failed tile prevents startup from reporting ready',async()=>{
 const oldFetch=globalThis.fetch,oldError=console.error,material=new MeshStandardMaterial();
 globalThis.fetch=async()=>({ok:false,status:503});console.error=()=>{};
 try{const tiles=new Tiles({tiles:[{id:'failed',center:[0,0],bytes:1}]},material,()=>{});await assert.rejects(tiles.preload(()=>{}),/1 个地图分块加载失败/);assert.equal(tiles.loaded.size,0);assert.equal(tiles.pending.size,0);}
 finally{globalThis.fetch=oldFetch;console.error=oldError;material.dispose();}
});
