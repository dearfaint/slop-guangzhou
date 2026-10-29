import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {PerspectiveCamera} from 'three/webgpu';
import {WalkWorld} from '../src/walk-world.ts';
import {WalkControls} from '../src/walk-controls.ts';
import {UrbanLife} from '../src/urban-life.ts';
import {forwardTrafficEdges} from '../src/traffic-model.ts';
import {southAxisData as data} from '../src/south-axis-data.ts';
import {groundRoadPaths} from '../src/south-axis-layout.ts';
import {ROAD_TOP,FOOT_TOP} from '../src/road-level.ts';

const read=p=>JSON.parse(readFileSync(new URL(p,import.meta.url),'utf8'));
const tiles=read('../public/data/manifest.json').tiles.map(t=>read('../public/data/'+t.id+'.json'));
const roads=new Map();
for(const t of tiles)for(const r of t.roads)roads.set(r.id,r);

test('player car crosses all four Linjiang Dadao surface-to-tunnel-to-surface routes and pure-W mainline',()=>{
 const previousWindow=globalThis.window,previousDocument=globalThis.document,events=new EventTarget();events.matches=()=>false;
 globalThis.window=events;globalThis.document={querySelector:()=>null,querySelectorAll:()=>[],pointerLockElement:null};
 const world=new WalkWorld();world.setMap(tiles);
 const key=new Event('keydown');key.code='KeyW';
 const routes=[
  [...roads.get('osm/way/444428465/0').p.slice(-2),...data.ramps.find(r=>r.id==='osm/way/923953845/0').p.slice(1),...data.underground.find(r=>r.id==='osm/way/248284676/0').p.slice(1),...data.ramps.find(r=>r.id==='osm/way/102596669/0').p.slice(1),...roads.get('osm/way/1445405480/0').p.slice(1)],
  [...roads.get('osm/way/526242009/0').p.slice(-2),...data.ramps.find(r=>r.id==='osm/way/449070492/0').p.slice(1),...data.underground.find(r=>r.id==='osm/way/102596674/0').p.slice(1),...data.ramps.find(r=>r.id==='osm/way/80912591/0').p.slice(1),...roads.get('osm/way/449070495/0').p.slice(1)],
  [...roads.get('osm/way/923953846/0').p,...data.ramps.find(r=>r.id==='osm/way/759851919/0').p.slice(1),...data.underground.find(r=>r.id==='osm/way/248284675/0').p.slice(1),...data.underground.find(r=>r.id==='osm/way/449070493/0').p.slice(1),...data.underground.find(r=>r.id==='osm/way/444419548/0').p.slice(1),...data.ramps.find(r=>r.id==='osm/way/248284668/0').p.slice(1),...roads.get('osm/way/458696117/0').p.slice(1,3)],
  [...roads.get('osm/way/624728715/0').p,...data.ramps.find(r=>r.id==='osm/way/624728716/0').p.slice(1),...data.underground.find(r=>r.id==='osm/way/248284666/0').p.slice(1),...data.underground.find(r=>r.id==='osm/way/444419547/0').p.slice(1),...data.underground.find(r=>r.id==='osm/way/444420600/0').p.slice(1),...data.ramps.find(r=>r.id==='osm/way/248282332/0').p.slice(1),...roads.get('osm/way/624728717/0').p.slice(1,3)],
 ];
 try{
  for(const pts of routes){
   const controls=new WalkControls(new PerspectiveCamera(),new EventTarget(),()=>{});
   controls.setMap(tiles);controls.setTravel('car');controls.active=true;
   controls.position.set(pts[0][0],world.groundHeight(pts[0][0],pts[0][1],0)+1.15,pts[0][1]);
   events.dispatchEvent(key);
   let minFoot=Infinity;
   for(const target of pts.slice(1)){
    let count=0;
    const budget=Math.ceil(Math.hypot(controls.position.x-target[0],controls.position.z-target[1])/.2)*2+400;
    while(Math.hypot(controls.position.x-target[0],controls.position.z-target[1])>.8){
     const dx=target[0]-controls.position.x,dz=target[1]-controls.position.z;
     controls.yaw=controls.bodyYaw=Math.atan2(-dx,-dz);controls.update(.025);
     minFoot=Math.min(minFoot,controls.position.y-1.15);
     assert.ok(++count<budget,`car blocked before ${target} at ${controls.position.toArray()}`);
    }
   }
   assert.ok(minFoot<-5.3);assert.ok(Math.abs(controls.position.y-1.15-ROAD_TOP)<.05);
   controls.dispose();
  }
  // Central Axis Tunnel route:
  // Zhujiang West ramp 444149841 -> distributor 444149842 -> link 603486755 -> North Roundabout 603486756 -> Southbound Tunnel 603486757 -> South Roundabout (around hollow circle) 444419547 -> ramp 248284668!
  const centralAxisRoute=[
   ...roads.get('osm/way/444149841/0').p,
   ...roads.get('osm/way/603486755/0').p,
   ...roads.get('osm/way/603486757/0').p,
   ...roads.get('osm/way/444419547/0').p,
   ...roads.get('osm/way/449070494/0').p,
   ...roads.get('osm/way/449070493/0').p,
   ...roads.get('osm/way/444419548/0').p,
   ...data.ramps.find(r=>r.id==='osm/way/248284668/0').p,
  ];
  const axisCar=new WalkControls(new PerspectiveCamera(),new EventTarget(),()=>{});
  axisCar.setMap(tiles);axisCar.setTravel('car');axisCar.active=true;
  axisCar.position.set(centralAxisRoute[0][0],world.groundHeight(centralAxisRoute[0][0],centralAxisRoute[0][1],0)+1.15,centralAxisRoute[0][1]);
  events.dispatchEvent(key);
  let axisMinFoot=Infinity;
  for(const target of centralAxisRoute.slice(1)){
   let count=0;const budget=Math.ceil(Math.hypot(axisCar.position.x-target[0],axisCar.position.z-target[1])/.2)*2+400;
   while(Math.hypot(axisCar.position.x-target[0],axisCar.position.z-target[1])>.8){
    const dx=target[0]-axisCar.position.x,dz=target[1]-axisCar.position.z;
    axisCar.yaw=axisCar.bodyYaw=Math.atan2(-dx,-dz);axisCar.update(.025);
    axisMinFoot=Math.min(axisMinFoot,axisCar.position.y-1.15);
    assert.ok(++count<budget,`axis car blocked before ${target}`);
   }
  }
  assert.ok(axisMinFoot<-5.3);assert.ok(Math.abs(axisCar.position.y-1.15)<.4);
  axisCar.dispose();

  // Holding W straight from surface road before the west ramp slides cleanly through and exits onto east surface road.
  const straight=new WalkControls(new PerspectiveCamera(),new EventTarget(),()=>{});
  const ramp=data.ramps.find(r=>r.id==='osm/way/923953845/0'),a=ramp.p[0],b=ramp.p[1],dx=b[0]-a[0],dz=b[1]-a[1],len=Math.hypot(dx,dz);
  straight.setMap(tiles);straight.setTravel('car');straight.active=true;
  straight.position.set(a[0]-dx/len*12,1.15,a[1]-dz/len*12);straight.yaw=straight.bodyYaw=Math.atan2(-dx,-dz);
  const heading=straight.bodyYaw;events.dispatchEvent(key);
  let lowest=Infinity,elapsed=0;
  while(elapsed<180&&straight.position.x<355){straight.update(.05);lowest=Math.min(lowest,straight.position.y-1.15);elapsed+=.05;}
  assert.equal(straight.bodyYaw,heading);assert.ok(lowest<-10);assert.ok(straight.position.x>=355);// Back at street level: carriageway deck or the raised paving beside it.
  const exit=straight.position.y-1.15;assert.ok(exit>=ROAD_TOP-.05&&exit<=FOOT_TOP+.05,`exit height ${straight.position.toArray()}`);
  straight.dispose();
 }finally{globalThis.window=previousWindow;globalThis.document=previousDocument;}
});

test('all five Linjiang Dadao surface frontage roads remain intact and passable for cars without opening trenches',()=>{
 const world=new WalkWorld();world.setMap(tiles);
 for(const id of ['osm/way/444422638/0','osm/way/624720031/0','osm/way/248284670/0','osm/way/458696117/0','osm/way/458696110/0']){
  const r=roads.get(id),paths=groundRoadPaths(r);
  assert.equal(paths.length,1,`${id} stays one continuous surface path`);
  let p=r.p[0],h=world.groundHeight(p[0],p[1],0);
  assert.equal(world.canStand(p[0],p[1],2.4,h),true,id);
  for(let i=1;i<r.p.length;i++){
   const end=r.p[i],steps=Math.max(1,Math.ceil(Math.hypot(end[0]-p[0],end[1]-p[1])/.5)),start=p;
   for(let j=1;j<=steps;j++){
    const target=[start[0]+(end[0]-start[0])*j/steps,start[1]+(end[1]-start[1])*j/steps];
    const next=world.move(p,target[0]-p[0],target[1]-p[1],h,2.4);
    assert.ok(Math.hypot(next[0]-target[0],next[1]-target[1])<.08,`${id} blocked at ${target}`);
    p=next;h=world.groundHeight(p[0],p[1],h);
   }
  }
 }
 for(const r of data.ramps){
  const mid=r.p[Math.floor(r.p.length/2)];
  assert.equal(world.canStand(mid[0],mid[1],2.4,0),false,'surface cars cannot drop into ramp cuttings');
 }
});

test('underground metro shells no longer block avenues; riverside passages and grade-separated bridges connect',()=>{
 const world=new WalkWorld();world.setMap(tiles);
 // Huacheng Dadao x Huaxia Rd (Zhujiang New Town Metro), Huacheng Dadao x Liede, Siyou Xinmalu (Wuyangcun Metro).
 for(const [x,z] of [[-641.1,-324.4],[547.2,-215.3],[-1316.6,-394.0],[-331.1,1588.7],[-1187.6,-879.2]]){
  assert.equal(world.canStand(x,z,2.4,0),true,`avenue clear at ${x},${z}`);
 }
 // Grade separation at Linjiang Dadao under Liede Bridge.
 let pUnder=[699.9,377.5],hUnder=world.groundHeight(pUnder[0],pUnder[1],0),maxUnder=0;
 for(let i=1;i<=40;i++){
  const tx=699.9+(659.7-699.9)*i/40,tz=377.5+(372.5-377.5)*i/40;
  pUnder=world.move(pUnder,tx-pUnder[0],tz-pUnder[1],hUnder,2.4);hUnder=world.groundHeight(pUnder[0],pUnder[1],hUnder);maxUnder=Math.max(maxUnder,hUnder);
 }
 assert.ok(Math.hypot(pUnder[0]-659.7,pUnder[1]-372.5)<.05);assert.equal(maxUnder,ROAD_TOP);
 let pOver=[647.3,251.3],hOver=world.groundHeight(pOver[0],pOver[1],0),maxOver=0;
 for(let i=1;i<=200;i++){
  const tx=647.3+(672.8-647.3)*i/200,tz=251.3+(1010.4-251.3)*i/200;
  pOver=world.move(pOver,tx-pOver[0],tz-pOver[1],hOver,2.4);hOver=world.groundHeight(pOver[0],pOver[1],hOver);maxOver=Math.max(maxOver,hOver);
 }
 assert.ok(Math.hypot(pOver[0]-672.8,pOver[1]-1010.4)<.05);assert.equal(maxOver,5);
 // South-bank riverside avenue (Binjiang E Rd -> Yuejiang W Rd) is continuous in AI traffic graph.
 const life=new UrbanLife();life.setMap(tiles);const g=life.roads;
 for(const id of ['osm/way/440897003/0','osm/way/545834707/0','osm/way/1540072633/0','osm/way/545834708/0','osm/way/428712171/0','osm/way/240587995/0','osm/way/460917763/0','osm/way/428712170/0','osm/way/1414108617/0','osm/way/102826700/0','osm/way/1414112412/0','osm/way/102826699/0']){
  const edges=[...g.edges.values()].filter(e=>e.roadId===id&&e.permitted);
  assert.ok(edges.length>0,`${id} present in traffic graph`);
  assert.ok(forwardTrafficEdges(g,edges.at(-1)).length>0,`${id} has forward continuation`);
 }
 life.dispose();
});
