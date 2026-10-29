import test from 'node:test';import assert from 'node:assert/strict';import {readFileSync} from 'node:fs';
import {Raycaster,Vector3} from 'three/webgpu';
import {Forecourts} from '../src/forecourts.ts';
import {forecourtSites} from '../src/forecourt-layout.ts';
import {CURB_RISE,FOOT_TOP,ROAD_TOP} from '../src/curb.ts';
import {WalkWorld} from '../src/walk-world.ts';
const read=p=>JSON.parse(readFileSync(new URL('../public/data/'+p,import.meta.url))),data=read('manifest.json').tiles.map(t=>read(t.id+'.json'));
const height=(model,x,z)=>new Raycaster(new Vector3(x,4,z),new Vector3(0,-1,0)).intersectObject(model,true).map(h=>h.point.y);
test('ordinary forecourt paving joins mapped footways at the same level',()=>{
 const model=new Forecourts();model.setMap(data);model.root.updateMatrixWorld(true);
 try{
  let count=0;for(const s of forecourtSites)for(const p of s.paving.slice(0,1)){const a=p[0][0],b=p[0][1],x=a[0]*.999+b[0]*.001,z=a[1]*.999+b[1]*.001;
   const hits=height(model.root,x,z);assert.ok(hits.every(y=>Math.abs(y-.14)>.001),'old lower paving creates a step against the footway');if(hits.some(y=>Math.abs(y-(.275+CURB_RISE))<.001))count++;
  }assert.ok(count>100);
 }finally{model.dispose();}
});
test('forecourt and apron paving sit on their own levels below mapped footways',()=>{
 // Forecourt sites overlap footway ribbons and the apron fill; equal heights z-fight in the browser.
 const model=new Forecourts();model.setMap(data);
 try{
  // Children: apron top, apron kerb face, forecourt paving, ...
  const range=m=>{const y=m.geometry.attributes.position;let lo=Infinity,hi=-Infinity;for(let i=0;i<y.count;i++){lo=Math.min(lo,y.getY(i));hi=Math.max(hi,y.getY(i));}return [lo,hi];};
  const levels=[model.root.children[0],model.root.children[2]].map(range);
  for(const [lo,hi] of levels)assert.ok(hi-lo<1e-6,'paving layer is flat');
  const [apron,paving]=levels.map(l=>l[0]),footway=FOOT_TOP;
  // The kerb face drops from the apron to just under the carriageway deck.
  const [kerbLo,kerbHi]=range(model.root.children[1]);assert.ok(Math.abs(kerbHi-apron)<1e-6&&kerbLo<ROAD_TOP);
  assert.ok(footway-paving>=.004&&paving-apron>=.004,`levels apron ${apron}, paving ${paving}, footway ${footway}`);
 }finally{model.dispose();}
});
test('Huacheng Avenue and Huasui Road ground gaps have continuous low paving',()=>{
 const model=new Forecourts();model.setMap(data);model.root.updateMatrixWorld(true);
 try{for(const [x,z] of [[-920.7,-322],[-930,-330],[-909,-330]])assert.ok(height(model.root,x,z).some(y=>y>=.269+CURB_RISE&&y<=.296+CURB_RISE),`bare ground at ${x}, ${z}`);}
 finally{model.dispose();}
});

test('Huacheng Square east entrance paving fills both gaps beside the service-road loop',()=>{
 const model=new Forecourts();model.setMap(data);model.root.updateMatrixWorld(true);
 const world=new WalkWorld();world.setMap(data);
 try{
  for(const [x,z] of [[-240,-65],[-239,-75],[-215,-64],[-214,-80],[-214,-95],[-205,-90],[-210,-80],[-200,-70],[-205,-75],[-208,-65]]){
   const deck=.27+CURB_RISE;
   assert.ok(height(model.root,x,z).some(y=>Math.abs(y-deck)<.001),`missing entrance paving at ${x}, ${z}`);
   assert.ok(height(model.root,x,z).some(y=>Math.abs(y-(.275+CURB_RISE))<.001),`missing plaza slab finish at ${x}, ${z}`);
   assert.ok(Math.abs(world.groundHeight(x,z)-deck)<.011,`standing height differs from paving at ${x}, ${z}`);
   assert.equal(world.canStand(x,z,.3),true,`entrance paving is blocked at ${x}, ${z}`);
  }
 }finally{model.dispose();}
});

import {createRoadLayout} from '../src/road-layout.ts';
test('crosswalk ends at the screenshot junction have paved landing areas',()=>{
 const model=new Forecourts();model.setMap(data);model.root.updateMatrixWorld(true);
 try{
  const groups=new Map();
  for(const p of createRoadLayout(data).paint.filter(p=>p.kind==='crossing'&&Math.hypot(p.x+921,p.z+341)<65)){
   const key=p.roadId+':'+(p.x*p.dx+p.z*p.dz).toFixed(1),list=groups.get(key)??[];list.push(p);groups.set(key,list);
  }
  assert.ok(groups.size>=4);
  for(const list of groups.values()){const p=list[0],a=[...list].sort((a,b)=>(-a.x*p.dz+a.z*p.dx)-(-b.x*p.dz+b.z*p.dx));
   for(const [stripe,sign] of [[a[0],-1],[a.at(-1),1]]){const x=stripe.x-p.dz*1.5*sign,z=stripe.z+p.dx*1.5*sign;assert.ok(height(model.root,x,z).some(y=>y>=.269+CURB_RISE&&y<=.296+CURB_RISE),`unconnected crossing ${p.roadId} at ${x},${z}`);}
  }
 }finally{model.dispose();}
});
