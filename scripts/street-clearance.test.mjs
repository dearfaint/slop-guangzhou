import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {streetClearance} from '../src/street-clearance.ts';
import {createStreetLayout,insidePolygon,segmentDistance} from '../src/street-layout.ts';
import {roadStrip} from '../src/geometry.ts';
import {bridgeRoadProfile,isVisibleRoad,FOOT_TOP,ROAD_TOP} from '../src/road-level.ts';
import {mappedTreeSites} from '../src/slop-trees.ts';
import {activeForecourts} from '../src/forecourt-layout.ts';
import {axisGroveTrees} from '../src/axis-groves.ts';
import {createRoadDividers} from '../src/road-dividers.ts';
import {createTunnelGardens} from '../src/tunnel-gardens.ts';
import {Streets} from '../src/streets.ts';
import {parkRoadReplaced} from '../src/pearl-park-layout.ts';
import {islandRoadReplaced} from '../src/haixinsha-layout.ts';
import {tunnelRoutes} from '../src/tunnel-layout.ts';
import {tunnelData} from '../src/tunnel-data.ts';
import {southAxisRoadSurfaces} from '../src/south-axis-layout.ts';
const road=(id,p,extra={})=>({id,p,w:10,kind:'tertiary',bridge:false,tunnel:false,name:'',...extra});
const tile=roads=>({roads,buildings:[],areas:[]});
test('ground props clear bridge decks vertically while short planting can remain below high decks',()=>{
 const r=road('fixture-bridge',[[2000,2000],[2000,2400]],{bridge:true,layer:2}),clear=streetClearance([tile([r])]);
 assert.equal(clear(2000,2200,.8,15),false);
 assert.equal(clear(2000,2200,.8,2),true);
 assert.equal(clear(2000,2002,.8,2),false);
 assert.equal(clear(2007,2200,1,15),true);
 assert.equal(clear(2006,2200,1.8,15),false);
});
test('mitred bends, end caps, adjacent roads and clipped pieces participate in clearance',()=>{
 const r=road('bend',[[2000,2000],[2040,2000],[2040,2040]]),clear=streetClearance([tile([r])]);
 assert.equal(clear(2044,1996,.2,9),false,'outer miter exceeds both finite straight segments');
 assert.equal(clear(1996,2000,.2,9),false,'round road end');
 assert.equal(clear(2050,1990,1,9),true);
 assert.equal(clear.box({x:2040,z:1995,dx:1,dz:0,length:12,width:2},1.1),false,'solid bed crossing a miter');
 assert.equal(clear.box({x:2060,z:1980,dx:1,dz:0,length:5,width:2},1.1),true);
 const a=road('same-id',[[2000,2000],[2000,2100]]),b=road('same-id',[[2200,2000],[2200,2100]]);
 const pieces=streetClearance([tile([a]),tile([b])]);
 assert.equal(pieces(2200,2050,.2,9),false,'same id in another tile remains an obstacle');
 const layout=createStreetLayout([tile([a,road('crossing',[[1990,2040],[2050,2040]],{w:18})])]);
 for(const p of layout.lamps)assert.ok(streetClearance([tile([a,road('crossing',[[1990,2040],[2050,2040]],{w:18})])])(p.x,p.z,1.8,9));
});
const read=n=>JSON.parse(readFileSync(new URL('../public/data/'+n+'.json',import.meta.url)));
const data=read('manifest').tiles.map(t=>read(t.id));
test('full city lamps and retained trees clear actual rendered ground/bridge triangles',()=>{
 const clear=streetClearance(data),layout=createStreetLayout(data);
 const mapped=[...mappedTreeSites(data),...activeForecourts(data).flatMap(s=>s.beds.flatMap(b=>b.trees)),...axisGroveTrees(data)];
 const retained=mapped.filter(p=>clear(p.x,p.z,.8,(p.y??.18)+p.height*1.5));
 const props=[...layout.lamps.map(p=>({...p,top:9,radius:1.8})),...[...layout.trees,...layout.palms,...retained].map(p=>({...p,top:(p.y??.18)+p.height*1.5,radius:.8}))];
 // Independent oracle: use the renderer's actual triangles, not centreline distances.
 const beds=[...createRoadDividers(data),...createTunnelGardens(data)];
 for(const p of beds)for(const a of [-1,0,1])for(const b of [-1,0,1])props.push({x:p.x+p.dx*p.length/2*a-p.dz*p.width/2*b,z:p.z+p.dz*p.length/2*a+p.dx*p.width/2*b,top:1.25,radius:.01,reference:'planting bed'});
 const cells=new Map(),size=40;
 for(const r of data.flatMap(t=>t.roads)){
  if(!isVisibleRoad(r)||parkRoadReplaced(r.id)||islandRoadReplaced(r.p,r.bridge)||tunnelRoutes.has(r.id)||tunnelData.roadSurfaces[r.id]||southAxisRoadSurfaces.has(r.id))continue;
  const foot=/^(footway|path|pedestrian|steps|cycleway)$/.test(r.kind),prof=r.bridge?bridgeRoadProfile(r,foot?FOOT_TOP:ROAD_TOP):{p:r.p,y:r.p.map(()=>foot?FOOT_TOP:ROAD_TOP)};
  const g=roadStrip(prof.p,r.w,prof.y,undefined,!r.bridge),v=g.getAttribute('position');
  for(let i=0;i<v.count;i+=3){
   const ring=[0,1,2].map(j=>[v.getX(i+j),v.getZ(i+j)]),bottom=Math.min(...[0,1,2].map(j=>v.getY(i+j)))-.65;
   for(let x=Math.floor((Math.min(...ring.map(p=>p[0]))-2)/size);x<=Math.floor((Math.max(...ring.map(p=>p[0]))+2)/size);x++)for(let z=Math.floor((Math.min(...ring.map(p=>p[1]))-2)/size);z<=Math.floor((Math.max(...ring.map(p=>p[1]))+2)/size);z++){const key=x+','+z,list=cells.get(key)??[];list.push({ring,bottom,id:r.id});cells.set(key,list);}
  }
  g.dispose();
 }
 for(const p of props)for(const t of cells.get(Math.floor(p.x/size)+','+Math.floor(p.z/size))??[]){
  if(t.bottom>p.top+.3)continue;
  assert.ok(!insidePolygon([p.x,p.z],[t.ring])&&t.ring.every((a,i)=>segmentDistance([p.x,p.z],a,t.ring[(i+1)%3])>=p.radius-.02),`${p.reference??'mapped tree'} at ${p.x},${p.z} overlaps ${t.id}`);
 }
 for(const [x,z] of [[666.044,436.619],[665.015,457.357],[663.675,495.298]])assert.equal(clear(x,z,.8,18),false,'reported Liede trees');
 const streets=new Streets();streets.setMap(data);
 assert.equal(streets.getStats().trees,layout.trees.length+layout.palms.length+retained.length,'rendered tree list uses the clearance filter');
 assert.deepEqual(streets.getLampSites().map(({lift,...p})=>({...p,height:p.height-lift})),layout.lamps);
 console.log(JSON.stringify({lamps:layout.lamps.length,inferredTrees:layout.trees.length+layout.palms.length,mappedTrees:mapped.length,retainedMappedTrees:retained.length,dividers:createRoadDividers(data).length,tunnelGardens:createTunnelGardens(data).length}));
 streets.dispose();
});
