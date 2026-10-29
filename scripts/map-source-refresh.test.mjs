import test from 'node:test';import assert from 'node:assert/strict';import {spawnSync} from 'node:child_process';
const run=code=>{const r=spawnSync('python3',['-c',`import importlib.util,json\nspec=importlib.util.spec_from_file_location('source','scripts/fetch-data.py');m=importlib.util.module_from_spec(spec);spec.loader.exec_module(m)\n${code}`],{cwd:new URL('..',import.meta.url),encoding:'utf8'});assert.equal(r.status,0,r.stderr);return JSON.parse(r.stdout);};
test('road refresh includes new connecting ways while retaining non-road geometry',()=>{
 const r=run(`old={'elements':[{'type':'way','id':1,'tags':{'highway':'footway'},'geometry':[{'lon':0,'lat':0},{'lon':1,'lat':0}]},{'type':'way','id':2,'tags':{'building':'yes'},'geometry':['building-original']},{'type':'relation','id':3,'tags':{'natural':'water'},'members':['complete-water-ring']}]}\nnew={'elements':[{'type':'way','id':1,'tags':{'highway':'footway'},'nodes':[10,11,12],'geometry':[{'lon':0,'lat':0},{'lon':.5,'lat':0},{'lon':1,'lat':0}]},{'type':'way','id':4,'tags':{'highway':'footway'},'nodes':[11,13],'geometry':[{'lon':.5,'lat':0},{'lon':.5,'lat':1}]},{'type':'way','id':2,'tags':{'building':'yes'},'geometry':['unreviewed-building']},{'type':'node','id':11,'tags':{'highway':'crossing'},'lon':.5,'lat':0}]}\nprint(json.dumps(m.refresh_roads(old,new)))`);
 assert.deepEqual(r.elements.find(e=>e.id===1).nodes,[10,11,12]);assert.ok(r.elements.some(e=>e.id===4));assert.deepEqual(r.elements.find(e=>e.id===2).geometry,['building-original']);assert.deepEqual(r.elements.find(e=>e.id===3).members,['complete-water-ring']);assert.equal(r.elements.find(e=>e.type==='node').tags.highway,'crossing');
});
test('road refresh refuses an incomplete extract instead of dropping existing roads',()=>{
 const r=run(`try:\n m.refresh_roads({'elements':[{'type':'way','id':1,'tags':{'highway':'footway'}}]},{'elements':[]})\n print(json.dumps({'refused':False}))\nexcept ValueError:\n print(json.dumps({'refused':True}))`);assert.equal(r.refused,true);
});
test('source conversion retains road version and timestamp',()=>{
 const r=run(`print(json.dumps(m.convert(b'<osm><node id="1" lon="0" lat="0"/><node id="2" lon="1" lat="0"/><way id="10" version="3" timestamp="2026-10-26T00:00:00Z"><nd ref="1"/><nd ref="2"/><tag k="highway" v="footway"/></way></osm>')))`);
 const way=r.elements.find(e=>e.type==='way');assert.equal(way.version,3);assert.equal(way.timestamp,'2026-10-26T00:00:00Z');
});

test('reviewed stair direction conflicts retain source tags and explain both source-node endpoints',()=>{
 const p=spawnSync(process.execPath,['scripts/audit-map-sources.mjs'],{cwd:new URL('..',import.meta.url),encoding:'utf8'});assert.equal(p.status,0,p.stderr);const report=JSON.parse(p.stdout);
 for(const id of ['233931696','233931699']){
  const item=report.walking.inclineReview.find(r=>r.id===`osm/way/${id}/0`);assert.equal(item.incline,'up');assert.equal(item.topologyDirection,'down');assert.equal(item.resolution,'preserve_topology_and_source_tag_conflict');assert.ok(item.endpointEvidence.start.nodeId);assert.ok(item.endpointEvidence.start.deckRoads.length);assert.ok(item.endpointEvidence.end.groundRoads.length);assert.ok(item.delta<0);
 }
});

import {readFileSync} from 'node:fs';import {buildTrafficGraph} from '../src/traffic-model.ts';import {isVisibleRoad} from '../src/road-level.ts';
const read=p=>JSON.parse(readFileSync(new URL(p,import.meta.url),'utf8'));
test('all packaged roads have versioned node references after the coherent source refresh',()=>{
 const m=read('../public/data/manifest.json'),roads=m.tiles.flatMap(t=>read('../public/data/'+t.id+'.json').roads);
 assert.deepEqual(m.connectivitySource.unmatchedWayIds,[]);
 for(const r of roads){assert.equal(r.nodeIds.length,r.p.length,r.id);assert.ok(Number.isInteger(r.sourceVersion)&&r.sourceVersion>0,r.id);assert.ok(r.sourceTimestamp,r.id);}
});
test('new split roads meet at their actual shared source node and underground links stay underground',()=>{
 const m=read('../public/data/manifest.json'),roads=m.tiles.flatMap(t=>read('../public/data/'+t.id+'.json').roads),g=buildTrafficGraph(roads);
 const node=g.nodes.get('osm/node/4416448573');assert.ok(node);const ids=node.outgoing.map(id=>g.edges.get(id).roadId);assert.ok(ids.includes('osm/way/442084728/0'));assert.ok(ids.includes('osm/way/1571237855/0'));
 const tunnel=roads.find(r=>r.id==='osm/way/1571873743/0');assert.ok(tunnel);assert.equal(tunnel.tunnel,true);assert.equal(isVisibleRoad(tunnel),false);
});
