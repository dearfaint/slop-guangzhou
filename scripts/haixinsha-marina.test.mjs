import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {marinaGangways,marinaPontoon,marinaQuayApron,marinaBoats} from '../src/haixinsha-site.ts';
import {haixinshaData} from '../src/haixinsha-data.ts';
import {inPolygon} from '../src/south-axis-layout.ts';
import {WalkWorld} from '../src/walk-world.ts';
import {Haixinsha} from '../src/haixinsha.ts';
import {Raycaster,Vector3} from 'three/webgpu';
test('south marina keeps both gangways and the connected pontoon on their actual source centre lines',()=>{
 const raw=JSON.parse(readFileSync(new URL('../data/raw/osm.json',import.meta.url),'utf8'));
 for(const item of [...marinaGangways,marinaPontoon]){const source=raw.elements.find(e=>e.id===item.id);assert.equal(source.tags.man_made,'pier');assert.equal(item.p.length,source.geometry.length);source.geometry.forEach((p,i)=>{const x=(p.lon-113.322)*Math.PI/180*6378137*Math.cos(23.119*Math.PI/180),z=-(p.lat-23.119)*Math.PI/180*6378137;assert.ok(Math.hypot(x-item.p[i][0],z-item.p[i][1])<.001);});}
 for(const g of marinaGangways)assert.ok(marinaPontoon.p.some(p=>Math.hypot(p[0]-g.p[1][0],p[1]-g.p[1][1])<.001));
 for(const p of marinaQuayApron[0])assert.ok(haixinshaData.island[0].some(q=>Math.hypot(p[0]-q[0],p[1]-q[1])<.001));
 assert.equal(marinaBoats.length,2);for(const boat of marinaBoats)assert.equal(inPolygon(boat.x,boat.z,haixinshaData.island),false);
});
test('marina deck is reachable over the water without making the surrounding river walkable',()=>{
 const world=new WalkWorld();world.setMap([{buildings:[],roads:[],areas:[{kind:'water',name:'river',p:[[[-800,630],[0,630],[0,800],[-800,800],[-800,630]]]}]}]);
 for(const g of marinaGangways)for(let i=0;i<=20;i++){const t=i/20,x=g.p[0][0]+(g.p[1][0]-g.p[0][0])*t,z=g.p[0][1]+(g.p[1][1]-g.p[0][1])*t;assert.ok(world.canStand(x,z));const h=world.groundHeight(x,z);assert.ok(h>=.47&&h<=.63);}
 assert.equal(world.canStand(-380,730),false);assert.equal(world.canStand(marinaBoats[0].x,marinaBoats[0].z),false);assert.ok(world.canStand(-320,646));assert.equal(world.groundHeight(-320,665),.48);
});
test('pier floor matches rendering and no geometry overflows the island budget',()=>{
 const model=new Haixinsha(),ray=new Raycaster();model.root.updateMatrixWorld(true);ray.set(new Vector3(-386.340,10,691.828),new Vector3(0,-1,0));const hit=ray.intersectObject(model.root,true)[0];assert.ok(hit&&Math.abs(hit.point.y-.78)<.2);
 let triangles=0;for(const mesh of model.root.children.filter(child=>child.isMesh)){assert.ok([...mesh.geometry.attributes.position.array].every(Number.isFinite));triangles+=mesh.geometry.attributes.position.count/3;mesh.geometry.dispose();mesh.material.dispose();}assert.ok(triangles<100000);assert.ok(model.root.children.length<=13);model.dispose();
});
