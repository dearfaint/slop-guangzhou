import { attribute, normalWorldGeometry, positionWorld, abs, step, mix, color, float, vec3, fract, floor, sin } from 'three/tsl';
import { cityNight } from './lighting-state.ts';
import { hash } from './traffic-model.ts';
import { Color } from 'three/webgpu';
import { createCurtainWallMaterial } from './vendor/slop-newyork/tsl-materials.js';

// Retain the reference glazing, but keep Guangzhou's masonry, roof and per-building tones.
export function buildingAppearance(building:{id:string;kind:string;h:number}) {
  const masonry=/^(apartments|residential|detached|terrace|dormitory|school|hospital|public|public_building|shelter|roof)$/.test(building.kind)||(/^(building|yes)$/.test(building.kind)&&building.h<=36);
  const tones=masonry?['#e5d9c4','#d4c6b2','#d9dcd6','#e1d2bf','#bdc9c5','#cbbcae']:['#c3dce0','#a9c5d2','#dae0df','#c6cbbf','#a7bbb9','#d7cfbf'];
  return {masonry:masonry?1:0,tint:new Color(tones[hash(building.id)%tones.length])};
}
export function buildingMaterial() {
  // Clone the cached reference material so this adaptation cannot alter other consumers.
  const mat=createCurtainWallMaterial({glassTint:0x9bb9bf,frameTint:0x9ba6a3,windowWidth:3.8,floorHeight:3.6,litProbability:.32}).clone();
  mat.vertexColors=true;
  const masonry=float(attribute('cityMasonry','float')),roof=step(.75,abs(normalWorldGeometry.y));
  const along=mix(positionWorld.x,positionWorld.z,step(.5,abs(normalWorldGeometry.x)));
  const u=fract(along.div(3.8)),v=fract(positionWorld.y.div(3.3));
  // Solid wall between individual residential windows rather than continuous curtain wall.
  const pane=step(.23,u).mul(step(u,.78)).mul(step(.24,v)).mul(step(v,.84));
  const masonryColor=mix(color('#cbd0cd'),color('#66848e'),pane);
  mat.colorNode=mix(mix(vec3(mat.colorNode!),masonryColor,masonry),color('#adb6b3'),roof);
  mat.roughnessNode=mix(mix(float(mat.roughnessNode!),float(.78),masonry),float(.9),roof);
  mat.metalnessNode=mix(mix(float(mat.metalnessNode!).mul(.65),float(.04),masonry),float(.02),roof);
  const occupied=step(.72,fract(sin(floor(along.div(3.8)).mul(12.98).add(floor(positionWorld.y.div(3.3)).mul(78.23))).mul(43758.5)));
  const homeGlow=color('#ffd49b').mul(pane).mul(occupied).mul(cityNight).mul(.75);
  // Reference offices already filter their window masks; retain unlit wall panels and room depth.
  const officeGlow=vec3(mat.emissiveNode!).mul(float(1).add(cityNight.mul(.4)));
  mat.emissiveNode=mix(officeGlow,homeGlow,masonry).mul(roof.oneMinus());
  return mat;
}
export const palette = {
  ground: new Color('#8c9279'), sky: new Color('#dce9e8'), water: new Color('#1c5f73'),
  park: new Color('#4c7a40'), road: new Color('#3e4446'), path: new Color('#85887a'),
};
