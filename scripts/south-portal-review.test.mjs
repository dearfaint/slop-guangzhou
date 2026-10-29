import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {Group,Mesh,MeshStandardMaterial,Raycaster,Vector3} from 'three/webgpu';
import {SouthAxis,southAxisGround} from '../src/south-axis.ts';
import {southAxisData as data} from '../src/south-axis-data.ts';
import {southAxisHeight,southAxisBlocked,northRotunda,nearestPath} from '../src/south-axis-layout.ts';
import {createTile,disposeTile} from '../src/geometry.ts';
const read=p=>JSON.parse(readFileSync(new URL(p,import.meta.url),'utf8'));
const tiles=read('../public/data/manifest.json').tiles.map(t=>read('../public/data/'+t.id+'.json'));
function scene(){const root=new Group(),axis=new SouthAxis(),material=new MeshStandardMaterial(),ground=new Mesh(southAxisGround(),material),groups=tiles.map(t=>createTile(t,material));root.add(axis.root,ground,...groups);root.updateMatrixWorld(true);return {root,dispose(){axis.dispose();ground.geometry.dispose();groups.forEach(disposeTile);material.dispose();}};}
test('south promenade is a continuous pedestrian deck above the underground motor corridor',()=>{
 const model=scene(),ray=new Raycaster();
 try{for(const z of [15,40,80,120,149,165]){assert.equal(southAxisHeight(-293,z),.42);ray.set(new Vector3(-293,20,z),new Vector3(0,-1,0));ray.far=30;const hit=ray.intersectObject(model.root,true)[0];assert.ok(hit);assert.ok(Math.abs(hit.point.y-.42)<.08,`paving instead of a lawn / tower at ${z}`);}}
 finally{model.dispose();}
});
test('north rotunda has a real deck opening and cannot be entered by dropping from the surface',()=>{
 const model=scene(),ray=new Raycaster();const [x,z]=northRotunda.center;
 try{assert.ok(southAxisBlocked(x,z));ray.set(new Vector3(x,20,z),new Vector3(0,-1,0));ray.far=30;const hit=ray.intersectObject(model.root,true)[0];assert.ok(hit);assert.ok(hit.point.y< -4,'no ground or park cover across the opening');}
 finally{model.dispose();}
});
test('both shallow portal pairs have clear approach lanes into their source underground connections',()=>{
 const model=scene(),ray=new Raycaster();
 try{for(const id of [248282332,759851919,624728716,248284668]){
  const r=data.ramps.find(r=>r.id===`osm/way/${id}/0`),inner=r.y[0]<r.y.at(-1)?0:r.p.length-1,near=inner===0?1:inner-1,a=r.p[near],b=r.p[inner],length=Math.hypot(b[0]-a[0],b[1]-a[1]),dx=(b[0]-a[0])/length,dz=(b[1]-a[1])/length;
  for(const offset of [-1.4,1.4]){const from=new Vector3(b[0]-dx*8-dz*offset,nearestPath(b[0]-dx*8,b[1]-dz*8,r.p,r.y).y+1.3,b[1]-dz*8+dx*offset),to=new Vector3(b[0]+dx*2-dz*offset,r.y[inner]+1.3,b[1]+dz*2+dx*offset);ray.set(from,to.clone().sub(from).normalize());ray.far=from.distanceTo(to);assert.equal(ray.intersectObject(model.root,true).length,0,`${id} lane ${offset} portal is blocked`);}
 }}finally{model.dispose();}
});

test('minimap paints the underground north-south link after the plaza fill',async()=>{
 const ts=await import('typescript'),url=new URL('../src/minimap.ts',import.meta.url);
 const source=readFileSync(url,'utf8').replace(/from '(\.\/[^']+)'/g,(_,path)=>`from '${new URL(path,url)}'`);
 const compiled=ts.transpileModule(source,{compilerOptions:{module:ts.ModuleKind.ESNext,target:ts.ScriptTarget.ES2022}}).outputText;
 const {Minimap}=await import('data:text/javascript;base64,'+Buffer.from(compiled).toString('base64'));let points=[],dash=[];const draws=[];
 const context={setTransform(){},beginPath(){points=[];},moveTo(x,y){points.push([x,y]);},lineTo(x,y){points.push([x,y]);},closePath(){},fill(){draws.push({kind:'fill'});},stroke(){draws.push({kind:'stroke',points:[...points],dash:[...dash]});},fillRect(){},fillText(){},strokeRect(){},save(){},restore(){},setLineDash(value){dash=value;}};
 const map=Object.create(Minimap.prototype);map.base={getContext:()=>context};map.setMap([{buildings:[],areas:[],roads:[]}]);
 const road=data.underground.find(r=>r.id==='osm/way/603486754/0'),start=road.p[0].map(v=>220+v/9),index=draws.findIndex(d=>d.kind==='stroke'&&d.points.length===road.p.length&&Math.hypot(d.points[0][0]-start[0],d.points[0][1]-start[1])<1e-8);
 assert.ok(index>draws.findLastIndex(d=>d.kind==='fill'),'the underground link must remain above every plaza / courtyard fill');assert.deepEqual(draws[index].dash,[3,2]);
});
