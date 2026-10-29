import test from 'node:test';import assert from 'node:assert/strict';
import {vehiclesOverlap} from '../src/vehicle-collision.ts';
import {WalkWorld} from '../src/walk-world.ts';
const car={x:0,z:0,y:.35,heading:0,length:4.4,width:1.9,height:1.5};
test('oriented vehicle boxes detect front, side and rotated contacts while preserving nearby lanes and height separation',()=>{
 for(const other of [{...car,z:4},{...car,x:1.8},{...car,x:2,heading:Math.PI/2}])assert.ok(vehiclesOverlap(car,other));
 assert.equal(vehiclesOverlap(car,{...car,x:3.2}),false);assert.equal(vehiclesOverlap(car,{...car,y:5}),false);
 assert.ok(vehiclesOverlap(car,{...car,z:7,length:12,width:2.6,height:3.1}));
});
test('player movement cannot tunnel through a stopped car, can reverse away, and passes underneath an elevated car',()=>{
 const world=new WalkWorld();world.setVehicles([car]);world.setVehicleHeading(0);
 const end=world.move([0,-20],0,50,.35,2.4);assert.ok(end[1]<-4.3,`passed through car: ${end}`);
 assert.ok(world.move(end,0,-5,.35,2.4)[1]<end[1]-4.9);
 world.setVehicles([{...car,y:5}]);assert.ok(world.move([0,-20],0,40,0,2.4)[1]>19.9);
});

test('crossing traffic cannot overlap and AI stops for a player car then resumes',async()=>{
 const {UrbanLife}=await import('../src/urban-life.ts');const {Vector3}=await import('three/webgpu');
 const life=new UrbanLife(),roads=[{id:'north',p:[[0,-40],[0,40]],w:6.4,kind:'secondary',oneway:1,bridge:false,tunnel:false,name:''},{id:'east',p:[[-40,0],[40,0]],w:6.4,kind:'secondary',oneway:1,bridge:false,tunnel:false,name:''}];
 try{life.setMap([{roads,buildings:[],areas:[]}]);for(const node of life.roads.nodes.values())node.signal=false;
  const edges=[...life.roads.edges.values()].filter(e=>e.permitted),north=edges.find(e=>e.roadId==='north'),east=edges.find(e=>e.roadId==='east');
  const actor=(e,x,z,heading)=>({edge:e.id,d:26,speed:10,seed:1,type:0,pause:0,x,z,heading,y:.35});
  life.cars=[actor(north,-1.6,-14,0),actor(east,-14,1.6,Math.PI/2)];
  for(let i=0;i<240;i++){life.update(.025,i*.025,0,new Vector3());const bodies=life.getVehicleBodies();assert.equal(vehiclesOverlap(bodies[0],bodies[1]),false,`traffic overlapped at frame ${i}`);}
  life.cars=[actor(north,-1.6,-14,0)];life.setPlayerVehicle({...car,x:-1.6,z:0});
  for(let i=0;i<200;i++)life.update(.025,i*.025,0,new Vector3());assert.ok(life.cars[0].z<-4.3);assert.equal(life.cars[0].speed,0);
  life.setPlayerVehicle(undefined);const start=life.cars[0].z;for(let i=0;i<100;i++)life.update(.025,i*.025,0,new Vector3());assert.ok(life.cars[0].z>start+2,'traffic must restart after the player leaves');
 }finally{life.dispose();}
});
