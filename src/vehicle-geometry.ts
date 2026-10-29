import { type BufferGeometry } from 'three/webgpu';
import { box, beam, hull, joined } from './actor-geometry.ts';
import { vehicleSpecs } from './vehicle-model.ts';
export function vehicleGeometry(type:number){
 const v=vehicleSpecs[type],w=v.width,d=v.length,truck=type===6||type===8,pickup=type===9;
 const body:BufferGeometry[]=[],glass:BufferGeometry[]=[],trim:BufferGeometry[]=[],details:BufferGeometry[]=[];
 body.push(hull([{y:.28,w:w*.90,d:d*.95},{y:.45,w,d},{y:truck?1.02:.95,w,d:d*.98},{y:truck?1.10:1.05,w:w*.94,d:d*.94}]));
 const front=truck?d/2-1.05:pickup?.55:0,cabinDepth=truck?1.9:pickup?2.1:d*.65,roof=type===6?2.20:type===8?2.45:v.height-.08;
 glass.push(hull([{y:.94,w:w*.87,d:cabinDepth,z:front},{y:roof,w:w*.76,d:cabinDepth*.78,z:front-.12}]));
 trim.push(box(0,roof+.035,front-.12,w*.79,.08,cabinDepth*.80));
 for(const side of [-1,1]){
  for(const z of [-1,0,1])trim.push(beam([side*w*.435,.96,front+z*cabinDepth/2],[side*w*.38,roof,front-.12+z*cabinDepth*.39],.065));
  details.push(box(side*(w/2+.06),1.15,front+cabinDepth*.34,.17,.13,.28));
  for(const z of [-.6,.55])details.push(box(side*(w/2+.012),.92,z+front,.025,.045,.19));
  details.push(box(side*(w/2+.015),.46,0,.035,.12,d*.78));
 }
 if(truck){
  const cargoDepth=d-2.2,cargoZ=-1.04;
  body.push(box(0,(v.height+1.04)/2,cargoZ,w*.97,v.height-1.04,cargoDepth));
  if(type===8){
   for(const side of [-1,1])for(let i=0;i<4;i++){
    const z=-d/2+.65+i*1.02;trim.push(box(side*(w/2-.02),1.58,z,.035,1.03,.91));
    for(let j=0;j<6;j++)details.push(box(side*(w/2+.004),1.14+j*.17,z,.025,.018,.85));
   }
   // Roof ladder, longitudinal rails and individual rungs.
   for(const side of [-1,1])trim.push(box(side*.42,v.height+.13,-.5,.08,.10,d*.79));
   for(let i=0;i<18;i++)trim.push(box(0,v.height+.13,-d*.40+i*d*.044,.90,.06,.065));
  }else{
   for(const side of [-1,1])trim.push(box(side*(w/2-.015),1.18,cargoZ,.035,.13,cargoDepth*.97));
   details.push(box(0,2.04,-d/2-.01,.045,1.95,.03),box(0,1.08,-d/2-.025,w*.86,.07,.04));
  }
 }else if(pickup){
  // Open cargo bed: recessed floor, side walls and tailgate, rather than a solid box.
  body.push(box(0,.87,-1.76,w*.91,.12,1.65),box(0,1.10,-d/2+.12,w*.95,.49,.12));
  for(const side of [-1,1])body.push(box(side*(w/2-.10),1.10,-1.76,.16,.49,1.65));
  details.push(box(0,.95,-1.76,w*.77,.035,1.35));
 }
 details.push(box(0,.61,d/2+.005,w*.58,.20,.035),box(0,.43,-d/2-.005,w*.82,.11,.035));
 // Number plates, front grille slats and windscreen wipers.
 trim.push(box(0,.45,d/2+.035,.44,.14,.025),box(0,.55,-d/2-.035,.44,.14,.025));
 for(let i=0;i<3;i++)trim.push(box(0,.55+i*.07,d/2+.025,w*.52,.02,.025));
 for(const side of [-1,1])details.push(beam([side*w*.24,1.01,front+cabinDepth/2+.015],[side*w*.10,1.12,front+cabinDepth/2-.02],.025));
 return {body:joined(body.map(g=>g.deleteAttribute('uv'))),glass:joined(glass),trim:joined(trim),details:joined(details)};
}
