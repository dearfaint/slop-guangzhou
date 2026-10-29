import test from 'node:test';import assert from 'node:assert/strict';import {readFileSync} from 'node:fs';
import {Raycaster,Vector3,MeshStandardMaterial} from 'three/webgpu';
import {createTile,disposeTile} from '../src/geometry.ts';
import {campusMaterial,fenceWallMaterial,GROUND_LEVELS} from '../src/grounds.ts';
import {Forecourts} from '../src/forecourts.ts';
import {insidePolygon} from '../src/street-layout.ts';

const read=p=>JSON.parse(readFileSync(new URL('../public/data/'+p,import.meta.url))),manifest=read('manifest.json'),tiles=manifest.tiles.map(t=>read(t.id+'.json'));
const areas=tiles.flatMap(t=>t.areas),at=(kind,x,z)=>areas.some(a=>a.kind===kind&&insidePolygon([x,z],a.p));
const hits=(model,x,z)=>new Raycaster(new Vector3(x,8,z),new Vector3(0,-1,0)).intersectObject(model,true);

test('mapped green belts and campuses that preprocessing used to drop are in the tiles',()=>{
 // Huacheng Avenue's south green belt (landuse=village_green) and the Xingguo school campus.
 assert.ok(at('green',330,-254));assert.ok(at('campus',380,-380));
 const kinds=new Set(areas.map(a=>a.kind));for(const k of ['green','campus','pitch','pool'])assert.ok(kinds.has(k),k);
 // Park and water polygons stay separate, so site cuts keyed by their rings still match.
 assert.ok(!areas.some(a=>a.kind==='park'&&at('green',...a.p[0][0])&&a.p[0].length<4));
});

test('only real ground-level sport surfaces are kept',()=>{
 const raw=JSON.parse(readFileSync(new URL('../data/raw/osm.json',import.meta.url))).elements;
 const loops=raw.filter(e=>e.tags?.leisure==='track'&&e.tags.area!=='yes').length;assert.ok(loops>0);
 // Jogging loops are lines; only area=yes tracks become surfaces, and those are track-sized.
 for(const a of areas.filter(a=>a.kind==='track')){const r=a.p[0];let s=0;for(let i=1;i<r.length;i++)s+=r[i-1][0]*r[i][1]-r[i][0]*r[i-1][1];assert.ok(Math.abs(s/2)<6000,`track area ${Math.abs(s/2)}`);}
 const footprints=tiles.flatMap(t=>t.buildings).filter(b=>b.base<2);
 for(const a of areas.filter(a=>['pitch','track','pool'].includes(a.kind))){
  // Same rule as preprocessing: a surface mostly under buildings is a rooftop or indoor court.
  const xs=a.p[0].map(p=>p[0]),zs=a.p[0].map(p=>p[1]);let inside=0,covered=0;
  for(let x=Math.min(...xs);x<=Math.max(...xs);x+=1)for(let z=Math.min(...zs);z<=Math.max(...zs);z+=1)if(insidePolygon([x,z],a.p)){inside++;if(footprints.some(b=>insidePolygon([x,z],b.p)))covered++;}
  assert.ok(covered<=inside*.5,`rooftop or indoor ${a.kind} at ${a.p[0][0]}: ${covered}/${inside}`);
 }
});

test('the gap-fill paving and forecourts no longer cover the green belt',()=>{
 const courts=new Forecourts();courts.setMap(tiles);courts.root.updateMatrixWorld(true);
 try{assert.equal(hits(courts.root,330,-254).length,0);}finally{courts.dispose();}
});

test('campus grounds draw below lawns with a fence that opens for crossing roads',()=>{
 // Kept off the z=0 tile seam, which is deliberately left unfenced.
 const campus={kind:'campus',name:'',p:[[[10,10],[70,10],[70,50],[10,50],[10,10]]]};
 const gate={id:'gate',p:[[30,-10],[30,30]],w:4,kind:'service',name:'',bridge:false,tunnel:false};
 const m=new MeshStandardMaterial(),model=createTile({buildings:[],areas:[campus],roads:[gate]},m);model.updateMatrixWorld(true);
 try{
  assert.ok(hits(model,20,30).some(h=>h.object.material===campusMaterial&&Math.abs(h.point.y-GROUND_LEVELS.campus)<1e-3));
  assert.ok(GROUND_LEVELS.campus<.18);
  const wall=model.children.find(c=>c.material===fenceWallMaterial);assert.ok(wall,'fence present');
  // Probe only the near (z=0) boundary.
  const fenceAt=x=>new Raycaster(new Vector3(x,.5,7),new Vector3(0,0,1),0,6).intersectObject(wall).length>0;
  assert.ok(fenceAt(20),'fence along the boundary');assert.ok(!fenceAt(30),'gate where the road crosses');
 }finally{disposeTile(model);m.dispose();}
 // Edges on a 600 m tile split are not fenced.
 const split={kind:'campus',name:'',p:[[[560,10],[600,10],[600,40],[560,40],[560,10]]]},m2=new MeshStandardMaterial(),cut=createTile({buildings:[],areas:[split],roads:[]},m2);cut.updateMatrixWorld(true);
 try{const wall=cut.children.find(c=>c.material===fenceWallMaterial);assert.ok(wall);assert.equal(new Raycaster(new Vector3(603,.5,20),new Vector3(-1,0,0)).intersectObject(wall).filter(h=>h.point.x>599).length,0);assert.ok(new Raycaster(new Vector3(580,.5,7),new Vector3(0,0,1),0,6).intersectObject(wall).length>0);}
 finally{disposeTile(cut);m2.dispose();}
});

test('mapped grounds inside authored sites defer to the site',()=>{
 // A garden polygon inside Pearl River Park is drawn by the park itself.
 const tile=tiles.find(t=>t.areas.some(a=>a.kind==='green'&&insidePolygon([980,-501],a.p)))??tiles.find(t=>t.areas.some(a=>a.kind==='green'&&a.p[0].some(p=>Math.hypot(p[0]-980,p[1]+501)<1)));
 assert.ok(tile,'green polygon inside the park exists');
 const m=new MeshStandardMaterial(),model=createTile({...tile,roads:[],buildings:[],areas:tile.areas.filter(a=>a.kind==='green')},m);model.updateMatrixWorld(true);
 try{const g=tile.areas.find(a=>a.kind==='green'&&a.p[0].some(p=>Math.hypot(p[0]-980,p[1]+501)<1)),r=g.p[0],c=[r.reduce((s,p)=>s+p[0],0)/r.length,r.reduce((s,p)=>s+p[1],0)/r.length];assert.equal(hits(model,...c).length,0);}
 finally{disposeTile(model);m.dispose();}
});
