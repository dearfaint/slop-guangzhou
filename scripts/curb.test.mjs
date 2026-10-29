import test from 'node:test';import assert from 'node:assert/strict';import {readFileSync} from 'node:fs';
import {Raycaster,Vector3,MeshStandardMaterial,Group} from 'three/webgpu';
import {createTile,disposeTile} from '../src/geometry.ts';
import {ROAD_TOP,FOOT_TOP,CURB_RAMP,LAWN_PATH} from '../src/curb.ts';
import {LAWN_TOP} from '../src/street-surface.ts';
import {WalkWorld} from '../src/walk-world.ts';
import {buildTrafficGraph} from '../src/traffic-model.ts';
import {Haixinsha} from '../src/haixinsha.ts';

// An 8 m street along x, a sidewalk 7 m off its centre line, and a crossing over it at x=0.
const road=(id,p,kind,w)=>({id,p,w,kind,name:'',bridge:false,tunnel:false});
const street=[road('street',[[-40,0],[40,0]],'residential',8),road('sidewalk',[[-40,7],[40,7]],'footway',2.5),road('crossing',[[0,-7],[0,7]],'footway',2.5)];
const top=(model,x,z)=>new Raycaster(new Vector3(x,5,z),new Vector3(0,-1,0)).intersectObject(model,true)[0]?.point.y;

test('sidewalks sit a kerb above the carriageway and crossings ramp down instead of bridging it',()=>{
 const m=new MeshStandardMaterial(),model=createTile({buildings:[],areas:[],roads:street},m);model.updateMatrixWorld(true);
 try{
  assert.ok(Math.abs(top(model,20,0)-ROAD_TOP)<1e-3,'carriageway deck');
  assert.ok(Math.abs(top(model,20,7)-FOOT_TOP)<1e-3,'raised sidewalk');
  assert.ok(FOOT_TOP-ROAD_TOP>=.1&&FOOT_TOP-ROAD_TOP<=.2,'kerb is a realistic 10-20 cm');
  // The crossing does not show above the road where it crosses it ...
  for(const z of [-3,0,3])assert.ok(Math.abs(top(model,0,z)-ROAD_TOP)<1e-3,`crossing bar at z=${z}`);
  // ... and ramps between the deck and the sidewalk just beyond the kerb.
  const mid=top(model,0,4+CURB_RAMP/2);assert.ok(mid>ROAD_TOP+.02&&mid<FOOT_TOP-.02,`kerb ramp ${mid}`);
  assert.ok(Math.abs(top(model,0,4+CURB_RAMP+.6)-FOOT_TOP)<.02);
 }finally{disposeTile(model);m.dispose();}
});

test('player and pedestrians stand on the same kerb levels that are drawn',()=>{
 const world=new WalkWorld();world.setMap([{buildings:[],areas:[],roads:street}]);
 assert.equal(world.groundHeight(20,0),ROAD_TOP);assert.equal(world.groundHeight(20,7),FOOT_TOP);
 const g=buildTrafficGraph(street,true),heights=[...g.edges.values()].filter(e=>e.roadId==='crossing').flatMap(e=>[[e.a,e.yA],[e.b,e.yB]]);
 for(const [p,y] of heights){if(Math.abs(p[1])<4)assert.equal(y,ROAD_TOP,`crossing node ${p}`);if(Math.abs(p[1])>4+CURB_RAMP)assert.equal(y,FOOT_TOP,`sidewalk node ${p}`);}
 assert.ok(heights.some(([p])=>Math.abs(p[1])<4)&&heights.some(([p])=>Math.abs(p[1])>4+CURB_RAMP));
});

test('mapped footways inside authored sites stay tucked beneath their decks',()=>{
 const read=p=>JSON.parse(readFileSync(new URL('../public/data/'+p,import.meta.url))),manifest=read('manifest.json');
 const m=new MeshStandardMaterial(),root=new Group();
 for(const t of manifest.tiles.filter(t=>Math.hypot(t.center[0]+645,t.center[1]-574)<400))root.add(createTile(read(t.id+'.json'),m));
 const island=new Haixinsha();root.add(island.root);root.updateMatrixWorld(true);
 try{const y=top(root,-645.7,574.41);assert.ok(y<FOOT_TOP-.05,`pedestrian way covers the Haixinsha approach at ${y}`);}
 finally{root.children.forEach(c=>c!==island.root&&disposeTile(c));m.dispose();}
});

test('paths across lawns stay nearly flush with the grass instead of becoming kerbed slabs',()=>{
 const lawn={id:'lawn',kind:'park',p:[[[-40,20],[40,20],[40,60],[-40,60],[-40,20]]]},path=road('park-path',[[-30,40],[30,40]],'footway',3);
 const m=new MeshStandardMaterial(),model=createTile({buildings:[],areas:[lawn],roads:[...street,path]},m);model.updateMatrixWorld(true);
 try{
  assert.ok(Math.abs(top(model,0,40)-LAWN_PATH)<1e-3,'park path level');assert.ok(LAWN_PATH-LAWN_TOP<=.12);
  const world=new WalkWorld();world.setMap([{buildings:[],areas:[lawn],roads:[...street,path]}]);
  assert.equal(world.groundHeight(0,40),LAWN_PATH);assert.equal(world.groundHeight(0,30),LAWN_TOP);assert.equal(world.groundHeight(20,7),FOOT_TOP);
 }finally{disposeTile(model);m.dispose();}
});
