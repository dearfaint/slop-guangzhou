import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {Vector3} from 'three/webgpu';
import {createTunnelGardens} from '../src/tunnel-gardens.ts';
import {tunnelData} from '../src/tunnel-data.ts';
import {inTunnelExcavation} from '../src/tunnel-layout.ts';
import {WalkWorld} from '../src/walk-world.ts';
import {Streets} from '../src/streets.ts';
const read=p=>JSON.parse(readFileSync(new URL('../public/data/'+p+'.json',import.meta.url))),tiles=read('manifest').tiles.map(t=>read(t.id));

test('loaded tunnel entrances receive low planting on roofs, outer rims and paired medians',()=>{
 const beds=createTunnelGardens(tiles);
 assert.ok(beds.length>30&&beds.length<1200);
 for(const kind of ['roof','rim','median'])assert.ok(beds.some(b=>b.kind===kind),kind);
 const screenshot=beds.filter(b=>Math.hypot(b.x-705,b.z+692)<100);
 assert.ok(screenshot.some(b=>b.kind==='roof'),'bare roof at the screenshot portal');
 assert.ok(screenshot.some(b=>b.kind==='median'),'empty separator approaching the screenshot portal');
 assert.deepEqual(createTunnelGardens([]),[]);
 assert.deepEqual(createTunnelGardens([...tiles].reverse()),beds);
 assert.deepEqual(createTunnelGardens([...tiles,...tiles]),beds);
});

test('beds stay outside open ramp excavations and are solid only at the surface',()=>{
 const beds=createTunnelGardens(tiles),world=new WalkWorld();world.setMap(tiles);
 for(const b of beds){
  for(const p of [[b.x,b.z],...b.p[0]])assert.equal(inTunnelExcavation(...p),false,`bed intrudes into an open ramp at ${p}`);
  assert.equal(world.canStand(b.x,b.z,.2,.5),false,`planted bed is not physical at ${b.x},${b.z}`);
 }
 for(const r of tunnelData.routes.filter(r=>r.covered))for(const i of [0,Math.floor(r.p.length/2),r.p.length-1])assert.equal(world.canStand(...r.p[i],1,r.y[i]),true,`landscaping blocks underground ${r.id}`);
});

test('tunnel planting reuses street instance batches and disappears on unload',()=>{
 const streets=new Streets();streets.setMap(tiles);
 assert.ok(streets.getStats().tunnelGardens>30);
 assert.ok(streets.root.children.every(m=>m.isInstancedMesh));
 assert.ok(streets.root.children.every(m=>m.geometry.attributes.position.array.every(Number.isFinite)));
 streets.update(1,new Vector3(705,5,-692));
 assert.ok(streets.root.children.filter(m=>m.count>0).length<400);
 streets.update(0,new Vector3(10000,10,10000));assert.ok(streets.root.children.every(m=>m.count===0));
 streets.setMap([]);assert.equal(streets.getStats().tunnelGardens,0);streets.dispose();
});
