import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {Matrix4} from 'three/webgpu';
import {Streets} from '../src/streets.ts';
import {StreetSurface} from '../src/street-surface.ts';
import {siteLevel} from '../src/curb.ts';
import {createStreetLayout,insidePolygon} from '../src/street-layout.ts';
import {activeForecourts} from '../src/forecourt-layout.ts';
import {createTunnelGardens} from '../src/tunnel-gardens.ts';
import {WalkWorld} from '../src/walk-world.ts';
const read=n=>JSON.parse(readFileSync(new URL('../public/data/'+n+'.json',import.meta.url))),data=read('manifest').tiles.map(t=>read(t.id));
test('rendered lamp poles, bench bases and planters rest on the actual local surface',()=>{
 const streets=new Streets(),surface=new StreetSurface(data);streets.setMap(data);let checked=0;
 for(const mesh of streets.root.children){const p=mesh.geometry.parameters;
  if(!p||!(mesh.geometry.type==='CylinderGeometry'&&(p.height===1||p.height===.65)||mesh.geometry.type==='BoxGeometry'&&p.width===1.6&&p.height===.45))continue;
  for(let i=0;i<mesh.count;i++){const m=new Matrix4();mesh.getMatrixAt(i,m);const [x,y,z]=[m.elements[12],m.elements[13],m.elements[14]],bottom=y-p.height*m.elements[5]/2;
   assert.ok(Math.abs(bottom-(siteLevel(x,z)??surface.height(x,z)))<.003,`floating at ${x},${z}: ${bottom}`);checked++;
  }
 }
 assert.ok(checked>500);streets.dispose();
});
test('bench and planter bodies stop walking and disappear when map is unloaded',()=>{
 const layout=createStreetLayout(data),world=new WalkWorld();world.setMap(data);
 for(const p of [...layout.benches,...layout.planters])assert.equal(world.canStand(p.x,p.z,.1),false);
 const p=layout.benches[0];world.setMap([]);assert.equal(world.canStand(p.x,p.z,.1),true);
});
test('lamp poles leave forecourt and tunnel planting beds clear',()=>{
 const beds=[...activeForecourts(data).flatMap(s=>s.beds),...createTunnelGardens(data)];
 for(const lamp of createStreetLayout(data).lamps)for(const bed of beds)assert.equal(insidePolygon([lamp.x,lamp.z],bed.p),false);
});
test('north mall links join mapped paths to the deck without a hole or blocked passage',async()=>{
 const {northMallLinks,southAxisHeight,groundRoadPaths}=await import('../src/south-axis-layout.ts');
 const world=new WalkWorld();world.setMap(data);
 for(const link of northMallLinks){const r=data.flatMap(t=>t.roads).find(r=>r.id===link.id);assert.deepEqual(groundRoadPaths(r)[0].at(-1),link.p.at(-1));
  let previous=.28;
  for(let z=link.p[0][1];z<=-323;z+=.25){const x=link.p[0][0],y=southAxisHeight(x,z);assert.ok(y!==undefined);assert.ok(Math.abs(y-previous)<.03);assert.equal(world.canStand(x,z,.45,y),true);previous=y;}
 }
});
