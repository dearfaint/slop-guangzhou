import test from 'node:test';
import assert from 'node:assert/strict';
import {buildTrafficGraph} from '../src/traffic-model.ts';
import {UrbanLife} from '../src/urban-life.ts';
const road=(id,p,oneway=0)=>({id,p,oneway,kind:'secondary',w:12,bridge:false,tunnel:false});
const tile=roads=>({roads,areas:[],buildings:[]});
test('a shallow fork does not masquerade as a signalised intersection',()=>{
 const graph=buildTrafficGraph([road('west',[[-100,0],[0,0]]),road('east',[[0,0],[100,10]]),road('slip',[[0,0],[100,55]])]);
 assert.equal(graph.nodes.get('0,0').signal,false);
});
test('each incoming arm has one light facing its approaching traffic',()=>{
 const data=tile([road('h',[[-100,0],[0,0],[100,0]]),road('v',[[0,-100],[0,0],[0,100]])]);
 const life=new UrbanLife();life.setMap([data]);
 try{assert.equal(life.signals.length,4);for(const s of life.signals){assert.ok(s.x*Math.sin(s.heading)+s.z*Math.cos(s.heading)>0);}}
 finally{life.dispose();}
});
test('outbound-only arms do not receive an incoming traffic light',()=>{
 const data=tile([road('west',[[-100,0],[0,0]],1),road('east',[[0,0],[100,0]],1),road('north',[[0,0],[0,-100]])]);
 const life=new UrbanLife();life.setMap([data]);
 try{assert.equal(life.signals.length,2);assert.ok(!life.signals.some(s=>s.x>10));}
 finally{life.dispose();}
});

import {readFileSync} from 'node:fs';
import {WalkWorld} from '../src/walk-world.ts';
import {segmentDistance} from '../src/street-layout.ts';
import {junctionApproaches} from '../src/junction-layout.ts';
test('full map lights cover outer districts, avoid road surfaces and retain local spacing',()=>{
 const read=p=>JSON.parse(readFileSync(new URL(p,import.meta.url),'utf8'));
 const data=read('../public/data/manifest.json').tiles.map(t=>read('../public/data/'+t.id+'.json'));
 const life=new UrbanLife(),world=new WalkWorld();world.setMap(data);life.setMap(data);
 try{
  assert.ok(life.signals.length>180,'not limited to ninety central intersections');
  assert.ok(life.signals.some(s=>s.x<-1200));assert.ok(life.signals.some(s=>s.x>1200));
  const ground=[...life.roads.edges.values()].filter(e=>e.yA>=0&&e.yA<1&&e.yB>=0&&e.yB<1);
  for(let i=0;i<life.signals.length;i++){
   const s=life.signals[i];assert.ok(world.canStand(s.x,s.z,.35));
   assert.ok(!ground.some(e=>segmentDistance([s.x,s.z],e.a,e.b)<e.width/2+.35));
   assert.ok(life.signals.slice(i+1).every(p=>Math.hypot(s.x-p.x,s.z-p.z)>=4));
   const n=life.roads.nodes.get(s.id);
   assert.ok(junctionApproaches(life.roads,n).some(a=>a.incoming&&a.signal.x===s.x&&a.signal.z===s.z));
  }
  const expected=life.signals.map(s=>({...s}));life.setMap([...data].reverse());assert.deepEqual(life.signals,expected);
 }finally{life.dispose();}
});

import {createRoadLayout} from '../src/road-layout.ts';
test('overlapping parallel approaches share a single crossing band',()=>{
 const roads=[road('a',[[-100,0],[0,0],[100,0]]),road('b',[[-100,8],[0,8],[100,8]]),road('v',[[0,-100],[0,0],[0,8],[0,100]])];
 const layout=createRoadLayout([tile(roads)]);
 assert.equal(layout.crossings,4);
 const crossings=layout.paint.filter(p=>p.kind==='crossing'&&['a','b'].includes(p.roadId));
 assert.equal(new Set(crossings.map(p=>p.roadId)).size,1,'overlapping bands are not painted twice');
});

import {junctionAhead,signalState} from '../src/traffic-model.ts';
test('rotated intersecting roads use separate phases even within the same compass axis',()=>{
 const g=buildTrafficGraph([road('a',[[-100,-84],[0,0],[100,84]]),road('b',[[-100,84],[0,0],[100,-84]])]);
 const approaches=junctionApproaches(g,g.nodes.get('0,0'));
 assert.equal(approaches.length,4);assert.equal(new Set(approaches.map(a=>a.axis)).size,2);
 const a=[...g.edges.values()].find(e=>e.roadId==='a'&&e.to==='0,0'),b=[...g.edges.values()].find(e=>e.roadId==='b'&&e.to==='0,0');
 const aheadA=junctionAhead(g,a,0),aheadB=junctionAhead(g,b,0);assert.notEqual(aheadA.axis,aheadB.axis);
 for(let t=0;t<52;t++)assert.ok(!(signalState(t,'0,0',aheadA.axis)==='green'&&signalState(t,'0,0',aheadB.axis)==='green'));
});
