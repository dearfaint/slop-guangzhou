import test from 'node:test';
import assert from 'node:assert/strict';
import {buildingAppearance,buildingMaterial} from '../src/materials.ts';
import {createTile,disposeTile} from '../src/geometry.ts';

test('ordinary buildings consume their vertex tint and vary by building, with separate masonry and glazing',()=>{
 const mat=buildingMaterial();assert.equal(mat.vertexColors,true);
 for(const kind of ['apartments','residential','school','detached'])assert.equal(buildingAppearance({id:'home',kind,h:70}).masonry,1);
 assert.equal(buildingAppearance({id:'office',kind:'office',h:70}).masonry,0);
 assert.equal(buildingAppearance({id:'low',kind:'building',h:20}).masonry,1);
 assert.equal(buildingAppearance({id:'high',kind:'building',h:80}).masonry,0);
 const tones=new Set(Array.from({length:25},(_,i)=>buildingAppearance({id:String(i),kind:'apartments',h:30}).tint.getHex()));assert.ok(tones.size>=4);
 const b={id:'same',kind:'residential',h:30};assert.equal(buildingAppearance(b).tint.getHex(),buildingAppearance(b).tint.getHex());
 assert.ok(mat.roughnessNode&&mat.metalnessNode&&mat.emissiveNode);mat.dispose();
});

test('merged city buildings carry facade class and tint without adding draw calls or changing footprint heights',()=>{
 const make=(id,kind,x,h)=>({id,kind,p:[[[x,0],[x+20,0],[x+20,20],[x,20],[x,0]]],h,base:0,hs:'source',source:'OSM',name:''});
 const mat=buildingMaterial(),tile=createTile({buildings:[make('house','apartments',0,30),make('office','office',50,90)],roads:[],areas:[]},mat);
 assert.equal(tile.children.length,1);
 const geometry=tile.children[0].geometry,facade=geometry.getAttribute('cityMasonry'),tint=geometry.getAttribute('color');
 assert.equal(facade.count,geometry.getAttribute('position').count);assert.equal(tint.count,facade.count);
 assert.deepEqual([...new Set(facade.array)].sort(),[0,1]);
 geometry.computeBoundingBox();assert.equal(geometry.boundingBox.max.y,90.5);
 assert.ok([...tint.array].every(Number.isFinite));disposeTile(tile);mat.dispose();
});
