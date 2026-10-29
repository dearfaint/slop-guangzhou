import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {Raycaster,Vector3,Mesh} from 'three/webgpu';
import {southAxisData as data} from '../src/south-axis-data.ts';
import {groundRoadPaths,inPolygon} from '../src/south-axis-layout.ts';
import {SouthAxis} from '../src/south-axis.ts';
import {buildTrafficGraph} from '../src/traffic-model.ts';
import {createRoadLayout} from '../src/road-layout.ts';
import {palette} from '../src/materials.ts';
const read=p=>JSON.parse(readFileSync(new URL(p,import.meta.url),'utf8'));
const tiles=read('../public/data/manifest.json').tiles.map(t=>read('../public/data/'+t.id+'.json'));
const replaced=new Set(data.roadReplacements.map(r=>r.id));
const covered=(x,z)=>inPolygon(x,z,data.plaza)||inPolygon(x,z,data.bridge)||data.trenches.some(p=>inPolygon(x,z,p));
test('clipped streets use visible centerline pieces for traffic and lane paint',()=>{
 const roads=tiles.flatMap(t=>t.roads),graph=buildTrafficGraph(roads);
 for(const r of roads.filter(r=>replaced.has(r.id)))for(const p of groundRoadPaths(r))for(let i=1;i<p.length;i++){
  assert.ok(!covered((p[i-1][0]+p[i][0])/2,(p[i-1][1]+p[i][1])/2),r.id);
 }
 for(const e of graph.edges.values())if(replaced.has(e.roadId))assert.ok(!covered((e.a[0]+e.b[0])/2,(e.a[1]+e.b[1])/2),e.id);
 for(const p of createRoadLayout(tiles).paint)if(replaced.has(p.roadId))assert.ok(!covered(p.x,p.z),p.roadId);
 assert.ok(data.roadReplacements.some(r=>r.lines.length>1),'split paths retain each separate visible part');
});
test('real unmodified dead ends and the local surface U-turn are retained',()=>{
 const culdesac={id:'real-dead-end',p:[[0,0],[30,0]],kind:'residential',w:7,bridge:false,tunnel:false};
 assert.deepEqual(groundRoadPaths(culdesac),[culdesac.p]);assert.equal(buildTrafficGraph([culdesac]).edges.size,2);
 const loop=tiles.flatMap(t=>t.roads).find(r=>r.id==='osm/way/458696110/0');assert.ok(loop);
 assert.ok(groundRoadPaths(loop).flat().length>10);
});
test('the detail no longer paints a second brown footway layer with clipped ends',()=>{
 const model=new SouthAxis();model.root.updateMatrixWorld(true);const ray=new Raycaster(),probes=[];
 for(const path of data.paths)for(let i=1;i<path.p.length;i++){
  const a=path.p[i-1],b=path.p[i],x=(a[0]+b[0])/2,z=(a[1]+b[1])/2;
  if(!covered(x,z))probes.push([x,z]);
 }
 assert.ok(probes.length>10);
 for(const [x,z] of probes){ray.set(new Vector3(x,2,z),new Vector3(0,-1,0));
  const duplicated=ray.intersectObject(model.root,true).filter(h=>h.object instanceof Mesh&&h.point.y>.3&&h.point.y<.4&&h.object.material.color?.getHexString()==='776056');
  assert.equal(duplicated.length,0);
 }
 const asphalt=model.root.children.filter(o=>o instanceof Mesh&&o.material.color?.equals(palette.road));
 assert.ok(asphalt.length>0);assert.ok(asphalt.every(o=>o.material.roughness===1));model.dispose();
});
