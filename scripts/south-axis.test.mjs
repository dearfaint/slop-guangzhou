import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {MeshStandardMaterial,Vector3,Mesh,Group,Raycaster} from 'three/webgpu';
import {SouthAxis,southAxisGround,detailRibbon} from '../src/south-axis.ts';
import {southAxisData as data} from '../src/south-axis-data.ts';
import {inPolygon,southAxisHeight,southAxisBlocked,southAxisRoadSurfaces,nearestPath} from '../src/south-axis-layout.ts';
import {createTile,disposeTile} from '../src/geometry.ts';
import {WalkWorld} from '../src/walk-world.ts';
import {GROUND_TOP} from '../src/street-surface.ts';
const read=path=>JSON.parse(readFileSync(new URL(path,import.meta.url),'utf8'));
const manifest=read('../public/data/manifest.json'),tiles=manifest.tiles.map(t=>read('../public/data/'+t.id+'.json'));
test('bridge preserves the complete OSM area footprint and all ramps retain their source endpoints',()=>{
 const raw=new Map(read('../data/raw/osm.json').elements.filter(e=>e.type==='way').map(e=>[e.id,e]));
 const project=p=>[(p.lon-113.322)*Math.PI/180*6378137*Math.cos(23.119*Math.PI/180),-(p.lat-23.119)*Math.PI/180*6378137];
 const original=raw.get(877475630).geometry.map(project);assert.equal(data.bridge[0].length,original.length);
 for(let i=0;i<original.length;i++)assert.ok(Math.hypot(data.bridge[0][i][0]-original[i][0],data.bridge[0][i][1]-original[i][1])<.002);
 assert.ok(data.bridge[0].length>25);assert.equal(data.trenches.length,6);assert.equal(data.ramps.length,10);
 for(const r of data.ramps){const source=raw.get(Number(r.id.split('/')[2])).geometry;
  for(const [p,q] of [[r.p[0],project(source[0])],[r.p.at(-1),project(source.at(-1))]])assert.ok(Math.hypot(p[0]-q[0],p[1]-q[1])<.002);
  assert.equal(r.y.length,r.p.length);assert.ok(Math.min(...r.y)<-5);assert.ok(Math.max(...r.y)>.3);
  for(let i=1;i<r.p.length;i++)assert.ok(Math.abs(r.y[i]-r.y[i-1])/Math.hypot(r.p[i][0]-r.p[i-1][0],r.p[i][1]-r.p[i-1][1])<.07);
 }
});
test('mainline layer-two approaches are excavated through every rendered surface',()=>{
 const material=new MeshStandardMaterial(),scene=new Group(),model=new SouthAxis();
 const ground=new Mesh(southAxisGround(),material);scene.add(ground,model.root);
 const groups=tiles.map(t=>createTile(t,material));scene.add(...groups);scene.updateMatrixWorld(true);
 const ray=new Raycaster();
 for(const id of [80912591,923953845,449070492,102596669]){
  const ramp=data.ramps.find(r=>r.id===`osm/way/${id}/0`);assert.ok(ramp);
  assert.ok(Math.min(...ramp.y)<-10);
  for(const t of [.3,.5,.7]){
   const i=Math.floor((ramp.p.length-1)*t),[x,z]=ramp.p[i];
   ray.set(new Vector3(x,20,z),new Vector3(0,-1,0));const hit=ray.intersectObject(scene,true)[0];
   assert.ok(hit,`road floor exists: ${id}`);
   assert.ok(hit.point.y<-.5,`no flat ground or road cap remains: ${id} @ ${t}`);
   assert.ok(Math.abs(hit.point.y-ramp.y[i])<.1,`first visible surface is the sloping road: ${id}`);
  }
  const portal=ramp.y[0]<ramp.y.at(-1)?0:ramp.p.length-1,before=portal===0?1:portal-1;
  const a=new Vector3(ramp.p[before][0],ramp.y[before]+1.5,ramp.p[before][1]),b=new Vector3(ramp.p[portal][0],ramp.y[portal]+1.5,ramp.p[portal][1]);
  ray.set(a,b.clone().sub(a).normalize());ray.far=a.distanceTo(b)+2;
  assert.equal(ray.intersectObject(scene,true).length,0,`portal is open at vehicle height: ${id}`);ray.far=Infinity;
 }
 for(const group of groups)disposeTile(group);ground.geometry.dispose();model.dispose();material.dispose();
});
test('terrain is actually cut open above the ramps',()=>{
 const g=southAxisGround(),p=g.getAttribute('position');
 for(let i=0;i<p.count;i+=3){const x=(p.getX(i)+p.getX(i+1)+p.getX(i+2))/3,z=(p.getZ(i)+p.getZ(i+1)+p.getZ(i+2))/3;
  // Float32 triangulation may leave sub-millimetre degenerate triangles on the rim.
  assert.ok(!data.trenches.some(r=>inPolygon(x,z,r)&&nearestPath(x,z,r[0]).distance>.001));
 }
 g.dispose();
 for(const r of data.ramps){const g=detailRibbon(r.p,r.w,r.y);assert.ok([...g.attributes.normal.array].filter((_,i)=>i%3===1).every(y=>y>.98));g.dispose();}
});
test('all affected real tiles merge clipped roads and areas with compatible attributes',()=>{
 const material=new MeshStandardMaterial();let affected=0;
 for(const t of tiles.filter(t=>t.roads.some(r=>southAxisRoadSurfaces.has(r.id)))){
  const group=createTile(t,material);affected++;
  group.traverse(o=>{if(o instanceof Mesh)assert.ok([...o.geometry.attributes.position.array].every(Number.isFinite));});disposeTile(group);
 }
 assert.ok(affected>=2);material.dispose();
});
test('walkers cross the real bridge over water, follow its height and cannot step into cuttings or the open courtyard',()=>{
 const world=new WalkWorld();world.setMap(tiles);
 const ring=data.bridge[0],z=(Math.min(...ring.map(p=>p[1]))+Math.max(...ring.map(p=>p[1])))/2;
 const x=-303;assert.ok(inPolygon(x,z,data.bridge));assert.ok(world.canStand(x,z));assert.ok(world.groundHeight(x,z)>1);
 assert.deepEqual(world.spawn([x,z]),[x,z]);
 for(const r of data.ramps){const p=r.p[Math.floor(r.p.length/2)];assert.ok(southAxisBlocked(...p));assert.equal(world.canStand(...p),false);}
 assert.equal(world.canStand(...data.courtyard.center),false);
 // Detail is not applied to unrelated synthetic maps or before the corresponding tiles exist.
 const empty=new WalkWorld();empty.setMap([]);assert.equal(empty.groundHeight(x,z),GROUND_TOP);
});
test('detail meshes are finite, stay in a bounded batch budget, and release their resources',()=>{
 const model=new SouthAxis();const stats=model.getStats();assert.ok(stats.batches<40);assert.equal(stats.bridgeSource,'OSM/way/877475630');
 model.update(10,1,new Vector3(-300,120,450));let geometries=0,disposed=0;
 model.root.traverse(o=>{if(o instanceof Mesh){geometries++;assert.ok([...o.geometry.attributes.position.array].every(Number.isFinite));o.geometry.addEventListener('dispose',()=>disposed++);}});
 assert.ok(geometries>10);model.dispose();assert.ok(disposed>=geometries);assert.equal(model.root.children.length,0);
});

test('walking and cycling keep eye height above the changing bridge deck',async()=>{
 const {PerspectiveCamera}=await import('three/webgpu');const {WalkControls}=await import('../src/walk-controls.ts');
 const previousWindow=globalThis.window,previousDocument=globalThis.document,target=new EventTarget();target.matches=()=>false;
 globalThis.window=target;globalThis.document={querySelector:()=>null,querySelectorAll:()=>[],pointerLockElement:null};
 const camera=new PerspectiveCamera(),controls=new WalkControls(camera,new EventTarget(),()=>{});
 try{
  controls.thirdPerson=false;controls.speed=3.5;controls.setMap(tiles);controls.enter([-303,450],new Vector3(0,0,-1));
  assert.ok(Math.abs(camera.position.y-controls.world.groundHeight(-303,450)-2.1)<.001);
  const key=new Event('keydown');key.code='KeyW';target.dispatchEvent(key);
  for(let i=0;i<200;i++)controls.update(.05);
  assert.ok(controls.position.z<418&&controls.position.z>410);
  assert.ok(Math.abs(controls.position.y-southAxisHeight(controls.position.x,controls.position.z)-2.1)<.001);
  controls.setTravel('bike');assert.ok(Math.abs(controls.position.y-southAxisHeight(controls.position.x,controls.position.z)-1.9)<.001);
 }finally{controls.dispose();globalThis.window=previousWindow;globalThis.document=previousDocument;}
});

test('the circular courtyard is open through every ground and plaza layer, with a recessed floor',()=>{
 const material=new MeshStandardMaterial(),scene=new Group(),model=new SouthAxis(),ground=new Mesh(southAxisGround(),material);
 const groups=tiles.map(t=>createTile(t,material));scene.add(ground,model.root,...groups);scene.updateMatrixWorld(true);
 const {center:[cx,cz],depth,radius}=data.courtyard,ray=new Raycaster();
 for(const r of [9,14])for(let i=0;i<8;i++){
  const angle=i/8*Math.PI*2;ray.set(new Vector3(cx+Math.cos(angle)*r,15,cz+Math.sin(angle)*r),new Vector3(0,-1,0));
  const hit=ray.intersectObject(scene,true)[0];assert.ok(hit,'lower floor exists');
  assert.ok(Math.abs(hit.point.y-(.42-depth))<.03,'no planter, plaza cap, or ground cap covers the opening');
 }
 assert.equal(southAxisHeight(cx,cz),undefined);
 assert.ok(southAxisBlocked(cx+radius-.2,cz));assert.equal(southAxisBlocked(cx+radius+2,cz),false);
 for(const group of groups)disposeTile(group);ground.geometry.dispose();material.dispose();model.dispose();
});
test('diagonal paving never crosses planted beds or the courtyard excavation',()=>{
 const [cx,cz]=data.courtyard.center;
 for(const line of data.pavingLines)for(let i=1;i<line.length;i++){
  const a=line[i-1],b=line[i];for(let j=1;j<10;j++){
   const x=a[0]+(b[0]-a[0])*j/10,z=a[1]+(b[1]-a[1])*j/10;
   assert.ok(Math.hypot(x-cx,z-cz)>data.courtyard.outerRadius-.01);
   assert.ok(!data.beds.some(p=>inPolygon(x,z,p)));
  }
 }
 assert.ok(data.pavingLines.length>5);
});

test('the open court never receives generic park trees or furniture',async()=>{
 const {createStreetLayout}=await import('../src/street-layout.ts');
 const layout=createStreetLayout(tiles);
 for(const list of Object.values(layout))for(const item of list)assert.equal(inPolygon(item.x,item.z,data.courtyard.excavation),false);
});

test('sunken mall plaza, oval ramp wells and musical fountain are excavated and navigable via the grand staircase',()=>{
 const material=new MeshStandardMaterial(),scene=new Group(),model=new SouthAxis(),ground=new Mesh(southAxisGround(),material);
 const groups=tiles.map(t=>createTile(t,material));scene.add(ground,model.root,...groups);scene.updateMatrixWorld(true);
 const ray=new Raycaster();
 // Sunken mall court (-4.6 m), south sunken court (-4.2 m), and twin oval wells (-4.2 m) are open through park and ground layers.
 for(const [x,z,expectedY] of [[-288.7,-245,-4.6],[-291.2,-95,-4.2],[-350.4,-231.5,-4.2],[-221.6,-231,-4.2]]){
  ray.set(new Vector3(x,15,z),new Vector3(0,-1,0));
  const hit=ray.intersectObject(scene,true)[0];assert.ok(hit,`sunken floor exists at ${x},${z}`);
  assert.ok(hit.point.y<expectedY+.35,`no flat park or ground cap covers (${x},${z}): got y=${hit.point.y}`);
 }
 // Musical fountain concentric plaza and animated water jets exist at (-290, -146.3).
 ray.set(new Vector3(-290,15,-146.3),new Vector3(0,-1,0));
 const fountainHit=ray.intersectObject(scene,true)[0];assert.ok(fountainHit);
 assert.ok(fountainHit.point.y>.2&&fountainHit.point.y<8,'musical fountain basin and jets are present');
 // Walkers can traverse from the musical fountain down the grand staircase into the sunken mall and back up to the north deck.
 const world=new WalkWorld();world.setMap(tiles);
 assert.equal(world.canStand(-290,-146.3),true);
 assert.ok(Math.abs(world.groundHeight(-290,-146.3)-.42)<.05);
 // Side retaining walls and oval wells block surface walkers from jumping into the pits.
 assert.equal(world.canStand(-305.5,-245),false);
 assert.equal(world.canStand(-350.4,-231.5),false);
 assert.equal(world.canStand(-221.6,-231),false);
 // Step continuously from the musical fountain (-184) down the grand stairs (-222) into the sunken mall (-267) and up the north stairs (-281).
 let pos=[-288.7,-184],h=world.groundHeight(pos[0],pos[1]);
 for(let z=-185;z>=-282;z-=1){
  pos=world.move(pos,0,-1,h);
  h=world.groundHeight(pos[0],pos[1],h);
  assert.ok(Math.abs(pos[1]-z)<.2,`walker advanced to z=${z} (at ${pos[1]})`);
 }
 assert.ok(Math.abs(world.groundHeight(-288.7,-245,-4.6)+4.6)<.1,'sunken mall floor is at -4.6 m');
 assert.ok(Math.abs(h-.42)<.15,'walker reaches the north surface deck at +0.42 m');
 for(const group of groups)disposeTile(group);ground.geometry.dispose();material.dispose();model.dispose();
});

test('central sunken mall side walkways contain no planted tree instances and remain walkable',()=>{
 const model=new SouthAxis();model.update(0,0,new Vector3(-288.7,60,-233));
 const sites=[];
 model.root.traverse(mesh=>{
  if(!mesh.isInstancedMesh||!mesh.name.startsWith('Trees_'))return;
  for(let i=0;i<mesh.count;i++){const m=mesh.instanceMatrix.array;sites.push({x:m[i*16+12],z:m[i*16+14]});}
 });
 try{
  assert.ok(sites.some(p=>p.x< -312&&p.z> -276&&p.z< -190),'western park trees remain');
  assert.ok(sites.some(p=>p.x> -265&&p.z> -276&&p.z< -190),'eastern park trees remain');
  assert.ok(sites.some(p=>Math.abs(p.x+288.7)<.1&&Math.abs(p.z+294.5)<.1),'north deck planter trees remain');
  const blocked=sites.filter(p=>p.z>=-280.88&&p.z<=-185.14&&((p.x>=-311.5&&p.x<=-306)||(p.x>=-271.4&&p.x<=-266)));
  assert.deepEqual(blocked,[],'both side walkways stay free of tree trunks');
  const world=new WalkWorld();world.setMap(tiles);
  for(const x of [-308.4,-269]){
   let p=[x,-280];
   for(let z=-279;z<=-186;z++){
    const next=world.move(p,0,1,.42,.45);
    assert.ok(Math.abs(next[0]-x)<.01&&Math.abs(next[1]-z)<.01,`side walkway is blocked at ${x},${z}`);
    assert.ok(Math.abs(world.groundHeight(...next)-.42)<.01);p=next;
   }
  }
 }finally{model.dispose();}
});
