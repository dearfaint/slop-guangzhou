import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {Box3,Mesh,Scene,PerspectiveCamera,DirectionalLight} from 'three/webgpu';
import {Waterfront,shorelineLights,riverAreas,cruisePose,cruiseRouteLength} from '../src/waterfront.ts';
import {inPolygon} from '../src/south-axis-layout.ts';
import {RiverReflections,riverWaterMaterial} from '../src/river-water.ts';
const manifest=JSON.parse(readFileSync(new URL('../public/data/manifest.json',import.meta.url)));
const tiles=manifest.tiles.map(t=>JSON.parse(readFileSync(new URL('../public/data/'+t.id+'.json',import.meta.url))));
const water=riverAreas(tiles),wet=(x,z)=>water.some(a=>inPolygon(x,z,a.p));

test('river embankment lights follow real banks, including Haixinsha, without lighting tile seams or pools',()=>{
 const lights=shorelineLights(tiles);assert.ok(lights.length>300&&lights.length<1800);
 assert.ok(lights.some(({a})=>a[1]<500));assert.ok(lights.some(({a})=>a[1]>1000));
 for(const {a,b} of lights){
  const x=(a[0]+b[0])/2,z=(a[1]+b[1])/2,dx=b[0]-a[0],dz=b[1]-a[1],length=Math.hypot(dx,dz),nx=-dz/length,nz=dx/length;
  assert.notEqual(wet(x+nx*1.2,z+nz*1.2),wet(x-nx*1.2,z-nz*1.2),`not a real shoreline: ${x},${z}`);
 }
 const seam=[{buildings:[],roads:[],areas:[{kind:'water',name:'',p:[[[0,400],[600,400],[600,900],[0,900],[0,400]]]}]},{buildings:[],roads:[],areas:[{kind:'water',name:'',p:[[[600,400],[1200,400],[1200,900],[600,900],[600,400]]]}]}];
 assert.equal(shorelineLights([seam[0]]).filter(({a,b})=>Math.abs(a[0]-600)<1&&Math.abs(b[0]-600)<1).length,0,'an unloaded neighbour must not create a fake lit embankment');
 assert.equal(shorelineLights(seam).filter(({a,b})=>Math.abs(a[0]-600)<1&&Math.abs(b[0]-600)<1).length,0);
});

test('all three cruise hulls stay in river water for an entire lap and turn before Liede bridge',()=>{
 const period=cruiseRouteLength/3.2;
 for(let seconds=0;seconds<period;seconds+=2)for(let i=0;i<3;i++){
  const p=cruisePose(seconds,i),c=Math.cos(p.heading),s=Math.sin(p.heading);
  for(const x of [-5.2,5.2])for(const z of [-18,22])assert.ok(wet(p.x+c*x+s*z,p.z-s*x+c*z),`boat ${i} ashore at ${seconds}`);
  assert.ok(p.x<500,'do not pass under the simplified low Liede bridge');
 }
 const start=cruisePose(0,0),end=cruisePose(period,0),next=cruisePose(.1,0);
 assert.ok(Math.hypot(start.x-end.x,start.z-end.z)<1e-6);
 assert.ok(Math.abs(Math.hypot(start.x-next.x,start.z-next.z)/.1-3.2)<.2);
});

test('bank and vessel lighting switches with night, bounded meshes retain physical scale and finite geometry',()=>{
 const city=new Waterfront();city.setMap(tiles);city.update(0,0);assert.equal(city.root.children[0].visible,false);
 const boats=city.root.children.slice(1);assert.equal(boats.length,3);
 city.update(10,1);assert.equal(city.root.children[0].visible,true);
 let triangles=0,calls=0;
 city.root.traverse(o=>{if(o instanceof Mesh){calls++;assert.ok(o.geometry.attributes.position.array.every(Number.isFinite));triangles+=(o.geometry.index?.count??o.geometry.attributes.position.count)/3;assert.ok(o.layers.isEnabled(1));}});
 assert.ok(calls<=14);assert.ok(triangles<15000);
 for(const boat of boats){const bounds=new Box3().setFromObject(boat);assert.ok(bounds.max.y<10);assert.ok(bounds.max.y-bounds.min.y>8);}
 const cabin=boats[0].children.find(m=>m.material.name==='Cruise cabin windows').material;
 assert.ok(cabin.emissiveIntensity>0);city.update(10,0);assert.equal(cabin.emissiveIntensity,0);city.setMap([]);city.update(10,1);assert.ok(boats.every(b=>!b.visible),'hide vessels when their water tiles are not loaded');city.dispose();
});

test('river reflection preserves render state, excludes crowds and retains reversed depth compatibility',()=>{
 const scene=new Scene(),camera=new PerspectiveCamera(),capture=new RiverReflections(),sun=new DirectionalLight();scene.add(sun);camera.position.set(10,100,200);camera.lookAt(0,0,800);
 let active=null,mirrored,draws=0;const renderer={shadowMap:{autoUpdate:true},autoClear:false,getDrawingBufferSize:size=>size.set(1440,960),getRenderTarget:()=>active,setRenderTarget:value=>active=value,render:(_scene,view)=>{mirrored=view;draws++;}};
 capture.update(renderer,scene,camera,0);
 assert.equal(active,null);assert.equal(renderer.autoClear,false);assert.equal(sun.shadow.autoUpdate,true);
 assert.equal(mirrored.layers.mask,2);assert.ok(Math.abs(mirrored.position.y+99.8)<1e-6);
 capture.update(renderer,scene,camera,10);assert.equal(draws,1,'reflection updates are throttled');
 camera.lookAt(0,100,-500);capture.update(renderer,scene,camera,100);assert.equal(draws,1,'skip reflection when the river is behind the camera');
 assert.ok(riverWaterMaterial.emissiveNode);assert.equal(riverWaterMaterial.name.includes('reflections'),true);
});
