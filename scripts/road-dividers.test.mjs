import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {createRoadDividers} from '../src/road-dividers.ts';
import {createRoadLayout} from '../src/road-layout.ts';
import {WalkWorld} from '../src/walk-world.ts';
const road=(id,p,extra={})=>({id,p,w:8,kind:'trunk',name:'',bridge:false,tunnel:false,layer:0,oneway:1,...extra});
const tile=roads=>({roads,buildings:[],areas:[]});
const source=tile([road('west',[[-6,-80],[-6,80]]),road('east',[[6,80],[6,-80]]),road('cross',[[-60,0],[60,0]],{kind:'secondary',w:12,oneway:0})]);
test('parallel carriageways receive medians while their crossing stays open',()=>{
 const dividers=createRoadDividers([source]);assert.ok(dividers.length>10);assert.ok(dividers.some(d=>d.z>30)&&dividers.some(d=>d.z< -30));
 assert.ok(dividers.every(d=>Math.abs(d.z)>10));assert.ok(dividers.every(d=>Math.abs(d.x)<.1&&d.width<=3));
 assert.deepEqual(createRoadDividers([source,source]),dividers);
});
test('median is physical but does not obstruct through lanes or cross-street access',()=>{
 const world=new WalkWorld();world.setMap([source]);world.setVehicleHeading(Math.PI/2);
 const stop=world.move([-6,40],12,0,0,2.4);assert.ok(stop[0]< -1.4,`drove through median: ${stop}`);
 const free=world.move([-6,0],12,0,0,2.4);assert.ok(free[0]>5.9,`crossing blocked: ${free}`);
 world.setVehicleHeading(0);const along=world.move([-6,40],0,20,0,2.4);assert.ok(along[1]>59.9);
});
test('Liede main and frontage roads have markings and a separated median',()=>{
 const root=new URL('../public/data/',import.meta.url),read=name=>JSON.parse(readFileSync(new URL(name,root),'utf8')),tiles=read('manifest.json').tiles.map(t=>read(t.id+'.json'));
 const ds=createRoadDividers(tiles);assert.ok(ds.some(d=>d.x>603&&d.x<608&&d.z< -800&&d.z> -900));
 const markings=createRoadLayout(tiles).paint;assert.ok(markings.some(p=>p.roadId==='osm/way/576645490/0'&&p.kind==='lane'));
});

test('mapped carriageway lanes remain clear of the added dividers',async()=>{
 const {isGroundRoad}=await import('../src/road-level.ts'),{groundRoadPaths}=await import('../src/south-axis-layout.ts'),{vehicleLaneOffset}=await import('../src/traffic-model.ts');
 const root=new URL('../public/data/',import.meta.url),read=name=>JSON.parse(readFileSync(new URL(name,root),'utf8')),roads=[...new Map(read('manifest.json').tiles.flatMap(t=>read(t.id+'.json').roads).map(r=>[r.id,r])).values()],data=[tile(roads)],withDivider=new WalkWorld(),baseline=new WalkWorld();
 withDivider.setMap(data);baseline.setMap(data);for(const [key,barriers] of baseline.railCells)baseline.railCells.set(key,barriers.filter(b=>!b.halfWidth));let checked=0;
 for(const r of roads.filter(r=>isGroundRoad(r)&&/^(trunk|primary|secondary|tertiary|residential|unclassified)(_link)?$/.test(r.kind)))for(const p of groundRoadPaths(r))for(let i=1;i<p.length;i++){
  const a=p[i-1],b=p[i],dx=b[0]-a[0],dz=b[1]-a[1],length=Math.hypot(dx,dz);if(!length)continue;const count=Math.ceil(length/4),offset=vehicleLaneOffset(r.w,r.oneway);
  for(const side of (r.oneway?[r.oneway===-1?-1:1]:[-1,1])){const heading=Math.atan2(-dx*side,-dz*side);withDivider.setVehicleHeading(heading);baseline.setVehicleHeading(heading);
   for(let j=0;j<=count;j++){const x=a[0]+dx*j/count-dz/length*offset*side,z=a[1]+dz*j/count+dx/length*offset*side;if(x< -1660||x>1500||z< -1500||z>1760)continue;checked++;if(baseline.canStand(x,z,2.4,.35))assert.ok(withDivider.canStand(x,z,2.4,.35),`${r.id} is blocked at ${x},${z}`);}
  }
 }
 assert.ok(checked>40000);
});

test('narrow medians use a physical rail without widening into the lanes',()=>{
 const roads=[road('a',[[-4.55,-80],[-4.55,80]]),road('b',[[4.55,80],[4.55,-80]])],data=tile(roads),dividers=createRoadDividers([data]);assert.ok(dividers.length>10);assert.ok(dividers.every(d=>d.kind==='rail'&&d.width===.24));
 const world=new WalkWorld();world.setMap([data]);world.setVehicleHeading(Math.PI/2);const stopped=world.move([-4.55,10],9.1,0,0,2.4);assert.ok(stopped[0]<-2.1);
});
