import test from 'node:test';
import assert from 'node:assert/strict';
import {buildTrafficGraph,chooseNext,lanePosition,signalState,safeSpeed,edgeAxis,junctionAhead,stopLineDistance,lanesPerDirection,vehicleLaneOffset} from '../src/traffic-model.ts';
const road=(id,p,kind='secondary')=>({id,p,kind,w:12,name:'',bridge:false,tunnel:false});
const fixture=[road('a',[[0,0],[0,100]]),road('b',[[0,100],[100,100]]),road('c',[[0,100],[-100,100]])];
test('source paths deduplicate and connect at actual shared coordinates',()=>{const g=buildTrafficGraph([...fixture,...fixture]);assert.equal(g.edges.size,6);const e=[...g.edges.values()][0];const n=chooseNext(g,e,0);assert.equal(n.from,e.to);assert.notEqual(n.to,e.from);assert.ok(g.nodes.get(e.to).signal);assert.equal(g.nodes.get(e.to).source,'inferred');});
test('right side lane offset follows travel direction',()=>{const g=buildTrafficGraph([road('r',[[0,0],[0,-100]])]);const e=[...g.edges.values()][0];assert.deepEqual(lanePosition(e,50,3),[3,-50]);assert.equal(edgeAxis(e),1);});
test('cross axes never green together and include yellow and all red',()=>{let yellow=false,allRed=false;for(let t=0;t<52;t+=.5){const a=signalState(t,'junction',0),b=signalState(t,'junction',1);assert.ok(!(a==='green'&&b==='green'));yellow ||= a==='yellow';allRed ||=a==='red'&&b==='red';assert.equal(a,signalState(t+52,'junction',0));}assert.ok(yellow&&allRed);});
test('stopping speed reaches zero at stop line and supports cruise after release',()=>{assert.equal(safeSpeed(10,0),0);assert.equal(safeSpeed(10,-2),0);assert.equal(safeSpeed(10,4),4);assert.equal(safeSpeed(10,Infinity),10);});
test('walkers use source footways, vehicles exclude footways, tunnels and proposed roads',()=>{const roads=[...fixture,road('w',[[1,0],[1,20]],'footway'),{...road('t',[[4,0],[4,20]]),tunnel:true},road('p',[[7,0],[7,20]],'proposed')];const walks=[...buildTrafficGraph(roads,true).edges.values()];assert.ok(walks.length>=2);assert.deepEqual([...new Set(walks.map(e=>e.roadId))],['w']);assert.equal(buildTrafficGraph(roads).edges.size,6);});

import {UrbanLife} from '../src/urban-life.ts';
import {Vector3} from 'three/webgpu';
import {vehicleSpecs} from '../src/vehicle-model.ts';
test('integrated car stops before inferred signal, resumes green, and crosses connected route',()=>{
 const life=new UrbanLife();life.setMap([{buildings:[],roads:fixture,areas:[]}]);
 const edge=[...life.roads.edges.values()][0],node=life.roads.nodes.get(edge.to),axis=edgeAxis(edge);
 const red=Array.from({length:52},(_,i)=>i).find(t=>signalState(t,node.id,axis)==='red');
 const green=Array.from({length:52},(_,i)=>i).find(t=>signalState(t,node.id,axis)==='green');
 const actor={edge:edge.id,d:85,speed:8,seed:1,type:0,pause:0,x:0,z:85,heading:0};life.cars=[actor];
 for(let i=0;i<300;i++)life.update(1/60,red,0,new Vector3());
 assert.equal(actor.edge,edge.id);assert.ok(actor.d+2.2<=edge.length-stopLineDistance(life.roads,node));assert.equal(actor.speed,0);assert.equal(life.getStats().stopped,1);
 for(let i=0;i<300;i++)life.update(1/60,green,1,new Vector3());
 assert.notEqual(actor.edge,edge.id);assert.equal(life.roads.edges.get(actor.edge).from,edge.to);
 assert.ok(Object.values(life.batches).every(mesh=>[...mesh.instanceMatrix.array].every(Number.isFinite)));
 life.dispose();
});
test('map refresh retains existing actors and their route progress',()=>{
 const life=new UrbanLife(),data=[{buildings:[],roads:fixture,areas:[]}];life.setMap(data);life.update(.1,0,0,new Vector3());
 const actors=[...life.cars],progress=actors.map(a=>a.d);life.setMap(data);
 assert.deepEqual(life.cars,actors);assert.deepEqual(life.cars.map(a=>a.d),progress);life.dispose();
});

import {readFileSync} from 'node:fs';
test('full city runs sixty simulated seconds with moving actors and finite instance matrices',()=>{
 const root=new URL('../public/data/',import.meta.url),read=name=>JSON.parse(readFileSync(new URL(name,root),'utf8'));
 const tiles=read('manifest.json').tiles.map(t=>read(t.id+'.json'));
 const life=new UrbanLife();life.setMap(tiles);
 assert.equal(life.getStats().cars,212);assert.equal(life.getStats().pedestrians,340);
 assert.equal(new Set(life.cars.map(a=>a.type)).size,5);
 const before=life.people.map(a=>[a.x,a.z]);
 for(let i=0;i<1200;i++)life.update(.05,i*.05,i/1200,new Vector3(-310,2,65));
 assert.ok(life.people.some((a,i)=>Math.hypot(a.x-before[i][0],a.z-before[i][1])>5));
 for(const mesh of Object.values(life.batches)){assert.ok([...mesh.instanceMatrix.array].every(Number.isFinite));assert.ok(mesh.count<=mesh.instanceMatrix.count);}
 assert.ok(life.getStats().signals>0);life.dispose();
});

test('red signal is anticipated across short curved approach segments, including bus overhang',()=>{
 const roads=[road('approach',[[0,0],[0,70],[1,96],[1,100]]),{...road('cross',[[-100,100],[1,100],[100,100]]),w:28}];
 for(const type of vehicleSpecs.keys()){
  const life=new UrbanLife();life.setMap([{buildings:[],roads,areas:[]}]);
  const edge=[...life.roads.edges.values()][0],ahead=junctionAhead(life.roads,edge,60);
  assert.ok(ahead?.node.signal);assert.equal(stopLineDistance(life.roads,ahead.node),20);
  const red=Array.from({length:52},(_,i)=>i).find(t=>signalState(t,ahead.node.id,ahead.axis)==='red');
  const actor={edge:edge.id,d:60,speed:8,seed:1,type,pause:0,x:0,z:60,heading:0};life.cars=[actor];
  for(let i=0;i<600;i++)life.update(.016,red,0,new Vector3());
  const stopped=junctionAhead(life.roads,life.roads.edges.get(actor.edge),actor.d);
  assert.equal(actor.speed,0);assert.ok(stopped.distance>=vehicleSpecs[type].length/2+20+.49);
  life.dispose();
 }
});

test('cars and buses stay centered inside the same inferred lanes used by road paint',()=>{
 for(const width of [7.5,12,13,18,24,28,32]){
  const laneWidth=width/2/lanesPerDirection(width),center=vehicleLaneOffset(width);
  assert.ok(center-1.25>.18);assert.ok(center+1.25<laneWidth-.12);
 }
});

test('a car already past the stop line clears the red-light junction instead of blocking its crossing',()=>{
 const life=new UrbanLife();life.setMap([{buildings:[],roads:fixture,areas:[]}]);
 const edge=[...life.roads.edges.values()][0],node=life.roads.nodes.get(edge.to),axis=edgeAxis(edge);
 const red=Array.from({length:52},(_,i)=>i).find(t=>signalState(t,node.id,axis)==='red');
 const actor={edge:edge.id,d:92,speed:6,seed:1,type:0,pause:0,x:0,z:92,heading:0};life.cars=[actor];
 for(let i=0;i<180;i++)life.update(.016,red,0,new Vector3());
 assert.notEqual(actor.edge,edge.id);life.dispose();
});

test('nearby traffic recycling preserves unique slots and does not accumulate buses',()=>{
 const root=new URL('../public/data/',import.meta.url),read=name=>JSON.parse(readFileSync(new URL(name,root),'utf8'));
 const life=new UrbanLife();life.setMap(read('manifest.json').tiles.map(t=>read(t.id+'.json')));
 try{for(const [x,z] of [[-288,-400],[400,-300],[-700,100],[0,-700]]){life.updatePopulation(new Vector3(x,2,z));assert.equal(new Set(life.cars.map(a=>a.slot)).size,life.cars.length);assert.ok(life.cars.filter(a=>a.type===2).length<=12);assert.ok(life.cars.length<=212);}}
 finally{life.dispose();}
});
