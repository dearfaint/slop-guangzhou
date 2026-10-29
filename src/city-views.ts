import {Vector3} from 'three/webgpu';
import type {Landmark,Point} from './types.ts';

// Fixed city shots use landmark coordinates, independently of the player's view.
export function cityView(name:string,landmarks:Landmark[],origin:Point,aspect=1) {
 const at=(en:string,y=0)=>{const p=landmarks.find(p=>p.en===en)!;return new Vector3((p.lon-origin[0])*Math.PI/180*6378137*Math.cos(origin[1]*Math.PI/180),y,-(p.lat-origin[1])*Math.PI/180*6378137);};
 const east=at('CTF FINANCE CENTRE'),west=at('GUANGZHOU IFC');
 const cultural=at('GUANGZHOU OPERA HOUSE').add(at('GUANGZHOU LIBRARY')).multiplyScalar(.5);
 const twins=east.clone().add(west).multiplyScalar(.5);
 if(name==='cantonTop'){
  const tower=landmarks.find(p=>p.en==='CANTON TOWER')!;
  const position=at('CANTON TOWER',tower.h+3);position.z-=2;
  // Keep the viewpoint on the tower in portrait mode; widen the lens instead.
  const fov=2*Math.atan(Math.tan(65*Math.PI/360)/Math.min(1,aspect))*180/Math.PI;
  return {position,target:new Vector3(twins.x,70,100),fov};
 }
 const shots:Record<string,{target:Vector3;position:Vector3}>={
  centralPark:{target:new Vector3(-288,30,-300),position:new Vector3(-288,600,950)},
  fifthAve:{target:twins.clone().setY(210),position:new Vector3(twins.x,600,1000)},
  timesSquare:{target:new Vector3(-700,80,-650),position:new Vector3(-1100,650,450)},
  chryslerGCT:{target:cultural.clone().setY(30),position:new Vector3(cultural.x,330,750)},
  observatory:{target:east.clone().setY(380),position:east.clone().add(new Vector3(300,730,600))},
  bryantPark:{target:new Vector3(-200,40,0),position:new Vector3(200,480,800)},
  waterfront:{target:new Vector3(-280,200,300),position:new Vector3(1100,680,2100)},
  pearlPark:{target:new Vector3(1200,0,-410),position:new Vector3(1540,650,240)},
 };
 const shot=shots[name]??shots.centralPark;
 shot.position.sub(shot.target).multiplyScalar(Math.max(1,1/aspect)).add(shot.target);
 return {...shot,fov:42};
}
