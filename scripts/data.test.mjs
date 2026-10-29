import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, statSync } from 'node:fs';
import { gunzipSync } from 'node:zlib';
const root=new URL('../public/data/',import.meta.url);
const json=name=>JSON.parse(readFileSync(new URL(name,root),'utf8'));
const manifest=json('manifest.json');
const tiles=manifest.tiles.map(t=>({meta:t,data:json(t.id+'.json')}));
const buildings=tiles.flatMap(t=>t.data.buildings),roads=tiles.flatMap(t=>t.data.roads);
test('real extract is bounded, tiled and backed by Overture and OSM records',()=>{
 assert.equal(manifest.version,1);assert.deepEqual(manifest.origin,[113.322,23.119]);
 assert.ok(tiles.length>4);assert.ok(buildings.length>500);assert.ok(roads.length>200);
 assert.equal(buildings.length,manifest.stats.buildings);assert.equal(roads.length,manifest.stats.roads);
 assert.ok(buildings.some(b=>b.id.startsWith('overture/')));assert.ok(buildings.some(b=>b.id.startsWith('osm/')));
 assert.equal(new Set(buildings.map(b=>b.id)).size,buildings.length);
});
test('tile byte accounting and precompressed copies match their content',()=>{
 let bytes=0;
 for(const {meta,data} of tiles){
  const raw=readFileSync(new URL(meta.id+'.json',root));assert.equal(raw.length,meta.bytes);
  assert.deepEqual(gunzipSync(readFileSync(new URL(meta.id+'.json.gz',root))),raw);
  assert.equal(meta.buildings,data.buildings.length);bytes+=raw.length;
 }
 assert.equal(bytes,manifest.stats.jsonBytes);
});
test('building geometry, heights and source labels are finite and within the core',()=>{
 for(const b of buildings){
  assert.ok(b.h>0&&b.h<=650,b.id);assert.ok(b.base>=0&&b.h>b.base,b.id);
  assert.ok(b.hs);assert.ok(b.source);
  for(const ring of b.p){assert.ok(ring.length>=4);assert.deepEqual(ring[0],ring.at(-1));for(const p of ring){assert.ok(p.every(Number.isFinite));assert.ok(Math.abs(p[0])<1800&&Math.abs(p[1])<1900);}}
 }
 assert.equal(buildings.filter(b=>b.hs.startsWith('estimate')).length,manifest.stats.estimatedHeight);
});
test('landmarks and verified high-rise height corrections survive processing',()=>{
 const ifc=buildings.find(b=>b.name.includes('广州国际金融中心'));assert.equal(ifc.h,438.6);assert.equal(ifc.hs,'CTBUH:architectural-height');
 assert.ok(buildings.some(b=>b.name.includes('广州东塔')&&b.h===530));
 const places=json('landmarks.json');assert.equal(places.length,18);
 assert.ok(places.every(p=>p.lon>113.30&&p.lon<113.34&&p.lat>23.10&&p.lat<23.14&&p.source));
 const tower=places.find(p=>p.name==='广州塔');const square=places.find(p=>p.name==='花城广场');assert.ok(tower.lat<square.lat);
});
test('river, parks and nonempty road lines are present',()=>{
 const areas=tiles.flatMap(t=>t.data.areas);assert.ok(areas.some(a=>a.kind==='water'));assert.ok(areas.some(a=>a.kind==='park'));
 for(const road of roads){assert.ok(road.p.length>1);assert.ok(road.w>=1&&road.w<=35);}
});

test('each custom landmark has exactly one primary replacement and corrected height',()=>{
 const specs=JSON.parse(readFileSync(new URL('../data/landmark-overrides.json',import.meta.url),'utf8'));
 assert.equal(specs.length,20);
 for(const spec of specs){
  const records=buildings.filter(b=>b.landmark===spec.model),primary=records.filter(b=>b.landmarkPrimary);
  assert.equal(primary.length,1,spec.model);assert.equal(primary[0].id,spec.seed);assert.equal(primary[0].h,spec.height);
  assert.ok(primary[0].heightReference);assert.ok(records.length>=1);
 }
 assert.ok(buildings.filter(b=>b.landmark==='canton').length>20,'tower old stacked sections must be suppressed');
 assert.equal(json('landmarks.json').find(p=>p.name==='广州图书馆').h,50);
 assert.equal(json('landmarks.json').find(p=>p.name==='广东省博物馆').h,45);
});

test('axis towers retain podiums and replace overlapping tower parts only',()=>{
 const ifp=buildings.find(b=>b.landmark==='ifp'&&b.landmarkPrimary);
 assert.equal(ifp.id,'osm/way/926991930/0');assert.equal(ifp.h,198);
 const podium=buildings.find(b=>b.id==='overture/26d552fa-e6cb-49fc-827e-806c6370c929/0');
 assert.equal(podium.h,19.2);assert.equal(podium.landmark,undefined);
 assert.equal(buildings.find(b=>b.landmark==='kaihua').h,252);
 assert.equal(buildings.find(b=>b.landmark==='ritz'&&b.landmarkPrimary).h,181.5);
 assert.equal(buildings.find(b=>b.id==='osm/way/589848492/0').landmarkPrimary,false);
 const places=json('landmarks.json');
 for(const model of ['fuli','ifp','kaihua','ritz']){
  const primary=buildings.find(b=>b.landmark===model&&b.landmarkPrimary);
  assert.ok(places.some(p=>p.source===primary.id&&p.h===primary.h));
 }
});

test('GT winter towers stay north/south ordered with a separate low podium',()=>{
 const primary=model=>buildings.find(b=>b.landmark===model&&b.landmarkPrimary);
 const north=primary('gtwinterNorth'),south=primary('gtwinterSouth');
 assert.equal(north.h,206.8);assert.equal(south.h,282.8);assert.equal(primary('gtwinterWest').h,71.9);
 const z=b=>b.p[0].reduce((s,p)=>s+p[1],0)/b.p[0].length;
 assert.ok(z(north)<z(south));
 const podium=buildings.find(b=>b.id==='overture/94ddee10-1627-4d33-8f97-2fb0d366b10e/0');
 assert.equal(podium.h,19.2);assert.equal(podium.landmark,undefined);
 for(const model of ['gtsummer','gtautumn','youth'])assert.ok(primary(model).hs.startsWith('estimate:'));
});
test('trees follow source OSM rows and expose estimated tree dimensions',()=>{
 const rows=tiles.flatMap(t=>t.data.treeRows??[]);
 assert.equal(rows.length,manifest.stats.treeRows);assert.ok(rows.length>0);
 assert.equal(new Set(rows.map(r=>r.id)).size,rows.length);
 for(const row of rows){
  assert.ok(row.id.startsWith('osm/way/'));assert.equal(row.source,'OSM:natural=tree_row');
  assert.ok(row.spacing>0&&row.height>0&&row.heightSource.startsWith('estimate:'));
  assert.ok(row.p.length>1&&row.p.flat().every(Number.isFinite));
 }
});
