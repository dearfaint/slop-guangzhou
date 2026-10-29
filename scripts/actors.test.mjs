import test from 'node:test';
import assert from 'node:assert/strict';
import {actorGeometry} from '../src/actor-geometry.ts';
import {UrbanLife} from '../src/urban-life.ts';
import {Vector3} from 'three/webgpu';
const tile={buildings:[],areas:[],roads:[{id:'r',kind:'secondary',w:12,p:[[0,0],[0,100]],bridge:false,tunnel:false},{id:'w',kind:'footway',w:3,p:[[1,0],[1,100]],bridge:false,tunnel:false}]};
test('vehicle hulls have outward roofs and round axle-aligned tyres',()=>{
 const g=actorGeometry();for(const geometry of Object.values(g)){assert.ok([...geometry.attributes.position.array].every(Number.isFinite));geometry.computeBoundingBox();}
 for(const name of ['carBody','carGlass','busBody']){const p=g[name].attributes.position,n=g[name].attributes.normal;let top=-Infinity,bottom=Infinity;for(let i=0;i<p.count;i++){top=Math.max(top,p.getY(i));bottom=Math.min(bottom,p.getY(i));}let up=0,down=0;for(let i=0;i<p.count;i++){if(Math.abs(p.getY(i)-top)<1e-5&&n.getY(i)>.9)up++;if(Math.abs(p.getY(i)-bottom)<1e-5&&n.getY(i)<-.9)down++;}assert.ok(up>0&&down>0,name+' closed caps');}
 assert.ok(new Set([...g.tyre.attributes.position.array].filter((_,i)=>i%3===1).map(v=>v.toFixed(3))).size>5);assert.ok(g.carBody.boundingBox.max.z<=2.21);assert.ok(g.busBody.boundingBox.max.z<=5.01);for(const geometry of Object.values(g))geometry.dispose();
});
test('pedestrian appearance survives routing and crowd uses only real character geometry',()=>{
 const life=new UrbanLife();life.setMap([tile]);const edge=[...life.walks.edges.values()][0];const actor={edge:edge.id,d:10,speed:1.3,seed:3,look:3,type:0,pause:0,x:1,z:10,heading:Math.PI/2};life.cars=[];life.people=[actor];
 life.update(0,0,0,new Vector3());actor.seed=19;life.update(0,.2,0,new Vector3());assert.equal(actor.look,3);
 for(const name of ['torso','head','limbs','sleeves','skin','hair','shoes','face','backpack'])assert.equal(life.batches[name],undefined);
 assert.equal(life.getStats().pedestrians,1);life.dispose();
});
