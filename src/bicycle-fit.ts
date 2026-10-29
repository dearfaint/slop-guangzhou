import { Vector3 } from 'three/webgpu';
// Metres in bicycle space (forward -Z). Rider skeleton faces +Z.
export const bicycleFit={wheelRadius:.345,tyreRadius:.022,axleY:.37,axleZ:.60,crankY:.33,crankRadius:.17,pedalX:.155,seatY:.86,seatZ:.25,hipY:.98,hipZ:-.20,gripX:.30,gripY:1.24,gripZ:-.32,pivot:[0,.94,-.43] as const};
export function bicycleGrip(sign:number,steering:number){const f=bicycleFit,pivot=new Vector3(...f.pivot);return new Vector3(-sign*f.gripX,f.gripY,f.gripZ).sub(pivot).applyAxisAngle(new Vector3(0,1,0),steering).add(pivot).multiply(new Vector3(-1,1,-1));}
export function bicycleFoot(sign:number,phase:number){const f=bicycleFit;return new Vector3(sign*f.pedalX,f.crankY-sign*Math.cos(phase)*f.crankRadius+.075,-sign*Math.sin(phase)*f.crankRadius-.08);}
