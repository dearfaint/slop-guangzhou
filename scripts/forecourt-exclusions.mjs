// Reuse the actual custom-site boundaries when preparing ordinary forecourts.
import {centralPromenade,mallPlazaOuter,mallExcavationRings} from '../src/south-axis-layout.ts';
import {southAxisData as s} from '../src/south-axis-data.ts';
import {haixinshaData as h} from '../src/haixinsha-data.ts';
import {pearlParkData as p} from '../src/pearl-park-data.ts';
import {operaPlaza} from '../src/opera-layout.ts';
import {tunnelData} from '../src/tunnel-data.ts';
import {westBridgeApproach} from '../src/haixinsha-site.ts';
// Open approach ramps start at grade before their excavation; keep their whole corridor clear too.
const corridor=(r)=>r.p.slice(1).map((b,i)=>{const a=r.p[i],dx=b[0]-a[0],dz=b[1]-a[1],l=Math.hypot(dx,dz)||1,h=r.w/2+.6,nx=-dz/l*h,nz=dx/l*h;return [[[a[0]+nx,a[1]+nz],[b[0]+nx,b[1]+nz],[b[0]-nx,b[1]-nz],[a[0]-nx,a[1]-nz],[a[0]+nx,a[1]+nz]]];});
// Haixinsha draws its west approach road itself (7.5 m deck), outside the island outline.
const ramps=[...tunnelData.routes.filter(r=>!r.covered),...s.ramps,{p:westBridgeApproach,w:7.5}].flatMap(corridor);
// Keep the planting margin, but let paving join the east entrance beside the service-road loop.
// The shared deck outline and sunken wells still protect every authored surface within that opening.
const mall=process.argv.includes('--paving')?[
 [[[-368,-325],[-204,-325],[-204,-180],[-258,-180],[-258,-56],[-368,-56],[-368,-325]]],
 [mallPlazaOuter],...mallExcavationRings.map(r=>[r]),
]:[[[[-368,-325],[-204,-325],[-204,-56],[-368,-56],[-368,-325]]]];
console.log(JSON.stringify([...ramps,s.plaza,s.bridge,centralPromenade,...mall,...s.beds,...s.trenches,s.courtyard.excavation,h.island,...h.bridges.map(b=>b.p),h.haixin.p,...(h.haixin.branches??[]),p.boundary,[operaPlaza],...tunnelData.excavations]));
