import test from 'node:test';import assert from 'node:assert/strict';import{readFileSync}from'node:fs';
import{bridgeRoadProfile}from'../src/road-level.ts';import{nearestPath}from'../src/south-axis-layout.ts';import{createRoadDividers}from'../src/road-dividers.ts';
const read=n=>JSON.parse(readFileSync(new URL('../public/data/'+n+'.json',import.meta.url))),data=read('manifest').tiles.map(t=>read(t.id)),roads=[...new Map(data.flatMap(t=>t.roads).map(r=>[r.id,r])).values()];
test('Xingsheng pedestrian overpass clears the road and its access lands on the ground',()=>{
 const r=roads.find(r=>r.id==='osm/way/529182857/0'),p=bridgeRoadProfile(r,.28),q=nearestPath(568,-465,p.p,p.y);assert.ok(q.y>=5.79,`deck is only ${q.y}m over the street`);assert.ok(p.y[0]<.4&&p.y.at(-1)<.4);
});
test('roadside planting also fills mapped road-to-sidewalk space on Xingsheng Road',()=>{
 const dividers=createRoadDividers(data);assert.ok(dividers.some(d=>d.x>450&&d.x<525&&d.z< -465&&d.z> -485&&d.kind==='planting'));
});

test('all reviewed pedestrian crossings keep car clearance above mapped roads',async()=>{
 const {pedestrianBridgeProfiles,bridgeUnderpasses,bridgeExitRoads}=await import('../src/bridge-joints.ts');let count=0;
 for(const r of roads.filter(r=>pedestrianBridgeProfiles[r.id]))for(const id of bridgeUnderpasses[r.id]??[]){const other=bridgeExitRoads[id],profile=bridgeRoadProfile(r,.28),lower=other.bridge?bridgeRoadProfile(other):{p:other.p,y:other.p.map(()=>.35)};
  for(let i=1;i<r.p.length;i++)for(let j=1;j<other.p.length;j++){const a=r.p[i-1],b=r.p[i],c=other.p[j-1],d=other.p[j],dx=b[0]-a[0],dz=b[1]-a[1],vx=d[0]-c[0],vz=d[1]-c[1],det=dx*vz-dz*vx;if(Math.abs(det)<1e-5)continue;const t=((c[0]-a[0])*vz-(c[1]-a[1])*vx)/det,u=((c[0]-a[0])*dz-(c[1]-a[1])*dx)/det;if(t<0||t>1||u<0||u>1)continue;const p=[a[0]+t*dx,a[1]+t*dz];const gap=nearestPath(...p,profile.p,profile.y).y-.65-nearestPath(...p,lower.p,lower.y).y;assert.ok(gap>=4.7,`${r.id} leaves only ${gap}m above ${other.id}`);count++;}
 }
 assert.ok(count>30);
});
test('reviewed stairs and bridge connections can be walked without a height jump or blocked landing',async()=>{
 const {pedestrianBridgeProfiles}=await import('../src/bridge-joints.ts'),{WalkWorld}=await import('../src/walk-world.ts'),world=new WalkWorld();world.setMap(data);let count=0;
 for(const [id,profile] of Object.entries(pedestrianBridgeProfiles)){let point=profile.p[0],height=profile.y[0];for(let i=1;i<profile.p.length;i++){const a=point,b=profile.p[i],steps=Math.ceil(Math.hypot(b[0]-a[0],b[1]-a[1])/.25);for(let j=1;j<=steps;j++){const p=[a[0]+(b[0]-a[0])*j/steps,a[1]+(b[1]-a[1])*j/steps];if(p[0]<-1659||p[0]>1499||p[1]<-1499||p[1]>1759){point=p;height=profile.y[i];continue;}const next=world.move(point,p[0]-point[0],p[1]-point[1],height,.45);assert.ok(Math.hypot(next[0]-p[0],next[1]-p[1])<.02,`${id} blocked at ${p}`);const y=world.groundHeight(...next,height);assert.ok(Math.abs(y-height)<.5,`${id} jumps ${height} to ${y}`);point=next;height=y;count++;}}}
 assert.ok(count>1000);
});
test('landscaping does not occupy mapped building or water footprints',async()=>{
 const {insidePolygon}=await import('../src/street-layout.ts');const synthetic=[{roads:[{id:'road',p:[[0,-80],[0,80]],w:10,kind:'tertiary',oneway:0,bridge:false,tunnel:false},{id:'walk',p:[[15,-80],[15,80]],w:2.6,kind:'footway',oneway:0,bridge:false,tunnel:false}],buildings:[{id:'building',p:[[[4,-30],[15,-30],[15,-10],[4,-10],[4,-30]]],base:0,h:20}],areas:[{kind:'water',p:[[[4,10],[15,10],[15,30],[4,30],[4,10]]]}]}];const ds=createRoadDividers(synthetic);assert.ok(ds.some(d=>d.placement==='roadside'));assert.ok(ds.every(d=>!insidePolygon([d.x,d.z],synthetic[0].buildings[0].p)&&!insidePolygon([d.x,d.z],synthetic[0].areas[0].p)));
});
