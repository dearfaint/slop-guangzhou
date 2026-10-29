// Huacheng Square canopy. Satellite imagery (Esri World Imagery, viewed 2026-10-28) shows the
// park between Jinsui Road and the CBD tunnel almost entirely under closed tree canopy, with an
// open lawn at its north tip, and full tree strips beside the south plaza from the Opera House /
// Museum frontage down to the river road. Zones are hand-fitted to that imagery; individual tree
// positions are inferred, not surveyed.
import { insidePolygon, segmentDistance } from './street-layout.ts';
import { isFootway } from './curb.ts';
import {inSouthAxisPlanting} from './south-axis-layout.ts';
import { isVisibleRoad } from './road-level.ts';
import type { StreetItem } from './street-layout.ts';
import type { Point, TileData } from './types';

/** North park extent, where generic sparse park trees are replaced by the grove. */
export const northGroveBounds={x0:-460,x1:-130,z0:-800,z1:-330};
/** Open lawn at the park's north tip, kept clear of trees. */
export const northMeadow:Point[][]=[[[-323.4,-782.4],[-269.1,-786.5],[-244,-761.4],[-248.2,-694.5],[-269.1,-640.2],[-302.5,-627.6],[-319.3,-677.8],[-327.6,-736.4],[-323.4,-782.4]]];
/** Tree strips beside the south plaza, north of the existing south-axis beds (which start at z 150). */
export const southStrips:Point[][][]=[
  [[[-362,38],[-326,38],[-326,148],[-362,148],[-362,38]]],
  [[[-266,38],[-232,38],[-232,148],[-266,148],[-266,38]]],
];
const jitter=(x:number,z:number)=>{const n=Math.sin(x*12.9898+z*78.233)*43758.5453;return n-Math.floor(n);};
export const inNorthGrove=(x:number,z:number)=>x>=northGroveBounds.x0&&x<=northGroveBounds.x1&&z>=northGroveBounds.z0&&z<=northGroveBounds.z1;

export function axisGroveTrees(data:TileData[]):StreetItem[]{
  const roads=[...new Map(data.flatMap(t=>t.roads).map(r=>[r.id,r])).values()].filter(isVisibleRoad);
  const buildings=[...new Map(data.flatMap(t=>t.buildings).map(b=>[b.id,b])).values()].filter(b=>(b.base??0)<2);
  const lawns=[...new Map(data.flatMap(t=>t.areas).filter(a=>a.kind==='park'||a.kind==='green').map(a=>[JSON.stringify(a.p),a])).values()];
  const near=(p:Point,x0:number,x1:number,z0:number,z1:number)=>p[0]>=x0&&p[0]<=x1&&p[1]>=z0&&p[1]<=z1;
  const local=(x0:number,x1:number,z0:number,z1:number)=>({
    roads:roads.filter(r=>r.p.some(p=>near(p,x0-60,x1+60,z0-60,z1+60))),
    buildings:buildings.filter(b=>b.p[0].some(p=>near(p,x0-60,x1+60,z0-60,z1+60))),
  });
  // Trunks keep 2.5 m off paths and 3.5 m off carriageways, and stay out of buildings.
  const clear=(p:Point,o:ReturnType<typeof local>)=>!o.buildings.some(b=>insidePolygon(p,b.p)||b.p[0].some((a,i)=>i>0&&segmentDistance(p,b.p[0][i-1],a)<2))
    &&!o.roads.some(r=>r.p.some((a,i)=>i>0&&segmentDistance(p,r.p[i-1],a)<r.w/2+(isFootway(r.kind)?2.5:3.5)));
  const trees:StreetItem[]=[];
  const plant=(x0:number,x1:number,z0:number,z1:number,spacing:number,accept:(p:Point)=>boolean,reference:string)=>{
    // Only plant once the tiles around the zone are loaded.
    const o=local(x0,x1,z0,z1);if(!o.roads.length)return;
    for(let x=Math.ceil(x0/spacing)*spacing;x<=x1;x+=spacing)for(let z=Math.ceil(z0/spacing)*spacing;z<=z1;z+=spacing){
      const p:Point=[x+(jitter(x,z)-.5)*spacing*.55,z+(jitter(z,x)-.5)*spacing*.55];
      if(!accept(p)||!clear(p,o)||inSouthAxisPlanting(...p))continue;
      // Mature canopy trees: 11–16 m, which SlopTrees scales to wide crowns that close over the paths.
      trees.push({x:p[0],z:p[1],angle:jitter(x+3,z)*Math.PI*2,height:11+jitter(x+1,z+1)*5,source:'inferred:park',reference});
    }
  };
  const {x0,x1,z0,z1}=northGroveBounds;
  plant(x0,x1,z0,z1,8,p=>lawns.some(a=>insidePolygon(p,a.p))&&!insidePolygon(p,northMeadow),'Huacheng Square north grove (satellite canopy extent)');
  for(const strip of southStrips){const r=strip[0];plant(Math.min(...r.map(p=>p[0])),Math.max(...r.map(p=>p[0])),Math.min(...r.map(p=>p[1])),Math.max(...r.map(p=>p[1])),6.5,p=>insidePolygon(p,strip),'Huacheng Square south plaza tree strips (satellite)');}
  return trees;
}
