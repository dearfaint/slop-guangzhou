import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {createRoadLayout} from '../src/road-layout.ts';
import {RoadMarkings} from '../src/road-markings.ts';
const road=(id,p,w=12)=>({id,p,w,kind:'secondary',bridge:false,tunnel:false,name:''});
const tile=roads=>({roads,buildings:[],areas:[]});
const intersection=tile([road('horizontal',[[-100,0],[0,0],[100,0]]),road('vertical',[[0,-100],[0,0],[0,100]],20)]);
test('crossings sit outside the wider intersection and stop lines cover incoming right lanes',()=>{
 const layout=createRoadLayout([intersection]);assert.equal(layout.crossings,4);assert.equal(layout.stops,4);
 for(const p of layout.paint){
  if(p.kind==='center'&&p.roadId==='horizontal')assert.ok(Math.abs(p.x)-p.length/2>=18-.001);
  if(p.kind==='crossing'&&p.roadId==='horizontal')assert.ok(Math.abs(p.x)-p.length/2>10.25);
  if(p.kind==='stop')assert.ok(p.x*p.dz-p.z*p.dx>0,'right side for traffic travelling toward junction');
 }
});
test('duplicate loaded tiles produce identical paint and inferred provenance',()=>{
 const a=createRoadLayout([intersection]),b=createRoadLayout([intersection,intersection]);assert.deepEqual(a,b);
 assert.ok(a.paint.every(p=>p.source==='inferred:road'&&['horizontal','vertical'].includes(p.roadId)));
});
test('roads crossing without a shared OSM vertex still clear their paint from the intersection',()=>{
 const result=createRoadLayout([tile([road('h',[[-100,0],[100,0]]),road('v',[[0,-100],[0,100]],20)])]);
 assert.equal(result.crossings,0);
 for(const p of result.paint.filter(p=>p.roadId==='h'))assert.ok(Math.abs(p.x)-p.length/2>10.25);
});
test('closely spaced junctions do not squeeze a crossing into the short connecting arm',()=>{
 const data=tile([road('h',[[-100,0],[0,0],[10,0],[100,0]]),road('a',[[0,-100],[0,0],[0,100]]),road('b',[[10,-100],[10,0],[10,100]])]);
 const {paint}=createRoadLayout([data]);
 assert.ok(!paint.some(p=>p.roadId==='h'&&p.x>0&&p.x<10));
});
test('footways, bridges and tunnels receive no ground-level road markings; buildings and water remain clear',()=>{
 const data=tile([road('h',[[-100,0],[100,0]]),{...road('bridge',[[0,-100],[0,100]]),bridge:true},{...road('tunnel',[[20,-100],[20,100]]),tunnel:true},{...road('foot',[[40,-100],[40,100]]),kind:'footway'}]);
 data.buildings=[{id:'b',base:0,p:[[[-60,-10],[-40,-10],[-40,10],[-60,10],[-60,-10]]]}];
 data.areas=[{kind:'water',name:'test',p:[[[40,-20],[60,-20],[60,20],[40,20],[40,-20]]]}];
 const result=createRoadLayout([data]);assert.ok(result.paint.every(p=>p.roadId==='h'));
 assert.ok(result.paint.every(p=>!(p.x>-60&&p.x<-40)&&!(p.x>40&&p.x<60)));
});
test('real core map stays finite, uses two batches and disposes replaced geometry',()=>{
 const root=new URL('../public/data/',import.meta.url),read=name=>JSON.parse(readFileSync(new URL(name,root),'utf8'));
 const data=read('manifest.json').tiles.map(t=>read(t.id+'.json')),layer=new RoadMarkings();layer.setMap(data);
 const stats=layer.getStats();assert.ok(stats.crossings>100&&stats.stops>100);assert.ok(stats.rectangles<60000);assert.equal(layer.root.children.length,2);
 let released=0;
 for(const mesh of layer.root.children){
  const g=mesh.geometry;assert.ok([...g.attributes.position.array].every(Number.isFinite));assert.ok([...g.attributes.normal.array].every((v,i)=>i%3!==1||v>.99));g.addEventListener('dispose',()=>released++);
 }
 layer.setMap([intersection]);assert.equal(released,2);assert.equal(layer.root.children.length,2);layer.dispose();assert.equal(layer.root.children.length,0);
});

test('one-way carriageways have white lane dividers and no opposing yellow center line',()=>{
 const layout=createRoadLayout([tile([{...road('one',[[0,0],[100,0]],9.6),oneway:1}])]);
 assert.ok(!layout.paint.some(p=>p.kind==='center'));
 const dividers=layout.paint.filter(p=>p.kind==='lane');assert.ok(dividers.length>0);
 assert.ok(dividers.every(p=>Math.abs(Math.abs(p.z)-1.6)<.001));
});
