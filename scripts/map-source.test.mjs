import test from 'node:test';import assert from 'node:assert/strict';import {spawnSync} from 'node:child_process';import {readFileSync} from 'node:fs';
import {buildTrafficGraph} from '../src/traffic-model.ts';
const python=code=>{const r=spawnSync('python3',['-c',code],{cwd:new URL('..',import.meta.url),encoding:'utf8'});assert.equal(r.status,0,r.stderr);return JSON.parse(r.stdout);};
const road=(id,p,extra={})=>({id,p,w:2.6,kind:'footway',bridge:false,tunnel:false,...extra});
test('road properties retain source semantics without treating relative incline as elevation',()=>{
 const tags={highway:'footway',footway:'sidewalk',incline:'up',surface:'paving_stones',foot:'yes','sidewalk:right:width':'1.8',level:'-1;0',step_count:'60'};
 const result=python(`import sys,json\nsys.path.insert(0,'scripts')\nfrom road_properties import road_properties\nprint(json.dumps(road_properties(json.loads(${JSON.stringify(JSON.stringify(tags))}),lambda v: float(v) if v is not None else None)))`);
 assert.deepEqual(result.tags,tags);assert.equal(result.widthSource,'estimate:class');assert.equal(result.height,undefined);
});
test('OSM conversion retains way references and tagged crossing nodes',()=>{
 const result=python(`import importlib.util,json\nspec=importlib.util.spec_from_file_location('fetch','scripts/fetch-data.py');m=importlib.util.module_from_spec(spec);spec.loader.exec_module(m)\nr=m.convert(b'<osm><node id="1" lon="113.32" lat="23.12"><tag k="highway" v="crossing"/><tag k="crossing" v="traffic_signals"/></node><node id="2" lon="113.321" lat="23.12"/><way id="10"><nd ref="1"/><nd ref="2"/><tag k="highway" v="footway"/></way></osm>')\nprint(json.dumps(r))`);
 assert.deepEqual(result.elements.find(e=>e.type==='way').nodes,[1,2]);assert.equal(result.elements.find(e=>e.type==='node'&&e.id===1)?.tags.crossing,'traffic_signals');
});
test('nearby distinct source nodes do not connect by coordinate rounding',()=>{
 const a=road('a',[[0,0],[10,0]],{nodeIds:[1,2]}),b=road('b',[[10.1,0],[20,0]],{nodeIds:[3,4]}),g=buildTrafficGraph([a,b],true);
 const e=[...g.edges.values()].find(e=>e.roadId==='a'&&e.b[0]===10),n=[...g.edges.values()].find(e=>e.roadId==='b'&&e.a[0]===10.1);assert.notEqual(e.to,n.from);
});
test('shared source nodes remain connected and foot restrictions apply to routing',()=>{
 const a=road('a',[[0,0],[10,0]],{nodeIds:[1,2]}),b=road('b',[[10,0],[20,0]],{nodeIds:[2,3]}),g=buildTrafficGraph([a,b],true);
 const e=[...g.edges.values()].find(e=>e.roadId==='a'&&e.b[0]===10),n=[...g.edges.values()].find(e=>e.roadId==='b'&&e.a[0]===10);assert.equal(e.to,n.from);
 for(const tags of [{foot:'no'},{access:'private'},{access:'no'}])assert.equal(buildTrafficGraph([road('blocked',[[0,0],[10,0]],{tags})],true).edges.size,0);
 assert.ok(buildTrafficGraph([road('public-path',[[0,0],[10,0]],{tags:{access:'private',foot:'yes'}})],true).edges.size>0);
});
test('packaged roads retain original tags and aligned source references',()=>{
 const read=p=>JSON.parse(readFileSync(new URL(p,import.meta.url),'utf8')),raw=read('../data/raw/osm.json'),ways=new Map(raw.elements.filter(e=>e.type==='way').map(e=>[e.id,e]));
 const roads=read('../public/data/manifest.json').tiles.flatMap(t=>read('../public/data/'+t.id+'.json').roads);
 for(const r of roads){const source=ways.get(Number(r.id.split('/')[2]));assert.deepEqual(r.tags,source.tags,r.id);if(source.nodes){assert.equal(r.nodeIds.length,r.p.length,r.id);assert.ok(r.nodeIds.every(id=>id===null||source.nodes.includes(id)),r.id);}}
});

test('clipping retains original vertex IDs but does not invent IDs for cut endpoints',()=>{
 const result=python(`import sys,json\nsys.path.insert(0,'scripts')\nfrom road_properties import road_node_properties\nel={'nodes':[1,2,3],'geometry':[{'lon':0,'lat':0},{'lon':10,'lat':0},{'lon':20,'lat':0}]}\nprint(json.dumps(road_node_properties(el,[(5,0),(10,0),(15,0)],lambda x,z:(x,z),{2:{'highway':'crossing'}})))`);
 assert.deepEqual(result.nodeIds,[null,2,null]);assert.deepEqual(result.nodeTags,{'2':{highway:'crossing'}});
});

import {isGroundRoad,isVisibleRoad} from '../src/road-level.ts';
test('an explicitly underground-only level never becomes a ground sidewalk',()=>{
 const r=road('basement',[[0,0],[10,0]],{tags:{level:'-1'}});assert.equal(isGroundRoad(r),false);assert.equal(isVisibleRoad(r),false);assert.equal(buildTrafficGraph([r],true).edges.size,0);
 assert.equal(isVisibleRoad(road('entry',[[0,0],[10,0]],{kind:'steps',tags:{level:'-1;0'}})),true);
});
test('invalid negative lane counts remain source evidence and do not collapse road width',()=>{
 const r=python(`import sys,json\nsys.path.insert(0,'scripts')\nfrom road_properties import road_properties\nprint(json.dumps(road_properties({'highway':'service','lanes':'-1'},lambda v: float(v) if v is not None else None)))`);
 assert.equal(r.w,4);assert.equal(r.widthSource,'estimate:class');assert.equal(r.tags.lanes,'-1');
});
