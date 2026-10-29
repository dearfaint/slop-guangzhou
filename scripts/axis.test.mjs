import test from 'node:test';import assert from 'node:assert/strict';import {readFileSync} from 'node:fs';
import {axisGroveTrees,northMeadow,inNorthGrove} from '../src/axis-groves.ts';
import {createStreetLayout,insidePolygon,segmentDistance} from '../src/street-layout.ts';
import {withPearlPark} from '../src/pearl-park-layout.ts';

const read=p=>JSON.parse(readFileSync(new URL('../public/data/'+p,import.meta.url))),tiles=read('manifest.json').tiles.map(t=>read(t.id+'.json'));
const data=withPearlPark(tiles),area=r=>{let s=0;for(let i=1;i<r.length;i++)s+=r[i-1][0]*r[i][1]-r[i][0]*r[i-1][1];return Math.abs(s/2);};
// Area-weighted centroid, as shapely's Polygon.centroid in prepare-data.py.
const centre=r=>{let a=0,x=0,z=0;for(let i=1;i<r.length;i++){const c=r[i-1][0]*r[i][1]-r[i][0]*r[i-1][1];a+=c;x+=(r[i-1][0]+r[i][0])*c;z+=(r[i-1][1]+r[i][1])*c;}return [x/(3*a),z/(3*a)];};

test('small default-height footprints in parks are low pavilions, not 18 m blocks',()=>{
 const greens=tiles.flatMap(t=>t.areas).filter(a=>a.kind==='park'||a.kind==='green');
 const buildings=[...new Map(tiles.flatMap(t=>t.buildings).map(b=>[b.id,b])).values()];
 const pavilions=buildings.filter(b=>b.hs==='estimate:park-pavilion');assert.ok(pavilions.length>50);
 for(const b of pavilions)assert.equal(b.h,4.5);
 const stray=buildings.filter(b=>b.hs==='estimate:18m'&&b.base<2&&area(b.p[0])<800&&greens.some(a=>insidePolygon(centre(b.p[0]),a.p)));
 assert.equal(stray.length,0,stray.map(b=>b.id).join(' '));
});

test('Huacheng Square north is a closed grove with its open north lawn, clear of paths and buildings',()=>{
 const trees=axisGroveTrees(data),north=trees.filter(t=>inNorthGrove(t.x,t.z));
 assert.ok(north.length>800,`grove ${north.length}`);
 assert.ok(!north.some(t=>insidePolygon([t.x,t.z],northMeadow)),'open lawn stays open');
 const paths=data.flatMap(t=>t.roads).filter(r=>['footway','path','pedestrian'].includes(r.kind)&&r.p.some(p=>inNorthGrove(...p)));
 for(const t of north)assert.ok(!paths.some(r=>r.p.some((a,i)=>i>0&&segmentDistance([t.x,t.z],r.p[i-1],a)<r.w/2+2.49)),`tree on a path at ${t.x},${t.z}`);
 // The sparse generic park grid no longer doubles up inside the grove.
 assert.equal(createStreetLayout(data).trees.filter(t=>inNorthGrove(t.x,t.z)).length,0);
 // South plaza strips now start at the Opera House / Museum frontage, as on the imagery.
 for(const [x0,x1] of [[-362,-326],[-266,-232]])assert.ok(trees.some(t=>t.x>x0&&t.x<x1&&t.z<80),`strip ${x0}`);
 assert.equal(axisGroveTrees([]).length,0,'nothing is planted before the tiles load');
});

import {Raycaster,Vector3} from 'three/webgpu';
import {SouthAxis} from '../src/south-axis.ts';
import {southAxisData} from '../src/south-axis-data.ts';
import {southAxisHeight} from '../src/south-axis-layout.ts';
import {palette} from '../src/materials.ts';
test('the Haixinsha bridge meets the square as a dark asphalt Y, with lawn south of it',()=>{
 const axis=new SouthAxis();axis.root.updateMatrixWorld(true);
 const top=(x,z)=>new Raycaster(new Vector3(x,10,z),new Vector3(0,-1,0)).intersectObject(axis.root,true)[0];
 try{
  // Points on the promenade U (456278900) and at the junction with the bridge read as asphalt.
  for(const [x,z] of [[-371,332],[-342,350],[-242,341],[-300,370]]){const h=top(x,z);assert.ok(h&&h.object.material.color?.getHexString()===palette.road.getHexString(),`asphalt at ${x},${z}`);}
  // The paved square stops at the Y: the wedges towards the river are no longer plaza.
  for(const [x,z] of [[-380,358],[-225,352]]){assert.equal(southAxisHeight(x,z),undefined,`plaza at ${x},${z}`);}
  assert.ok(Math.max(...southAxisData.plaza[0].map(p=>p[1]))<375);
 }finally{axis.dispose?.();}
});
