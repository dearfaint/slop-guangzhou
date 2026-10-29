// Adapted from mrdoob/slop-newyork/js/street-details.js, MIT (see vendor license).
import { BoxGeometry, CylinderGeometry, SphereGeometry } from 'three/webgpu';
import { joined } from './actor-geometry.ts';
export function signalHousingGeometry(){
 const width=.4,height=1.12,depth=.28,radius=.145;
 const bothFaces=(g:CylinderGeometry)=>[g,g.clone().rotateY(Math.PI)];
 return joined([
  new BoxGeometry(width,height,depth),
  new BoxGeometry(.07,.2,.07).translate(0,height/2+.1,0),
  ...[.36,0,-.36].flatMap(y=>bothFaces(new CylinderGeometry(radius+.03,radius+.03,.24,14,1,true,Math.PI/2,Math.PI).rotateX(Math.PI/2).translate(0,y,depth/2+.12))),
 ]);
}
export function streetLampHousing(){return new SphereGeometry(1,14,8,0,Math.PI*2,0,Math.PI/2).scale(.7,.2,.3);}
export function hydrantGeometry(){return new CylinderGeometry(.22,.26,.85,8);}
export function mailboxGeometry(){return new BoxGeometry(.65,1.25,.65);}
