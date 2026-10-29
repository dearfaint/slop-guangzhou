import {elevatedBridgeJoints,bridgeGroundClearances,bridgeJointHeights,bridgeJointLandings,bridgeCrossings,pedestrianBridgeProfiles,sidewalkBridgeRoads} from './bridge-joints.ts';
import {bridge4Height,bridge5Height} from './haixinsha-layout.ts';
import type { Point, Road } from './types.ts';

// Carriageway deck and the raised footway level behind the kerb (see curb.ts).
export const ROAD_TOP=.35,FOOT_TOP=.5;

// Underground metro station footprints in Overture (level < 0) have no surface volume;
// extruding them to the generic 18 m fallback blocked major surface intersections.
export const hiddenUndergroundBuildings=new Set([
 'overture/f3ff298f-4977-4715-980e-5d51bc9026ff/0',
 'overture/c69ab435-f1c2-4f17-bda7-41ce5c307f5a/0',
 'overture/53523c40-8b10-40a9-8281-ea71f28b5fd4/0',
 'overture/224fe8b1-f055-46f2-b373-4677179c66c6/0',
 'overture/eeecd3c2-1363-41df-ac5a-89989d645e24/0',
 'overture/90dca98a-1353-4bf2-b7b0-bc3558e76bd9/0',
 'overture/fb19a803-8aec-48d0-b7ec-e45cd4e2b715/0',
 'overture/c91fbeea-ef25-4e1c-b4a3-454c9fcf9795/0',
 'overture/15f3b35d-43b2-4fac-a7f7-1d1859dab3c8/0',
 'overture/2e5d2a32-48bd-4b50-9a3f-d91abbdc1995/0',
 'overture/f02e9d8f-0f58-44f5-a85b-3dc210044091/0',
 'overture/29fc166e-5fff-43a7-93cb-25b900d82f68/0',
 'overture/e007b33f-2da2-41f6-b42a-2193aeed50d0/0',
]);

// Grade-level (layer = 0) riverside under-deck passages on Binjiang / Yuejiang Rd
// whose upper viewing decks are not separately modelled as solid road covers.
export const surfacePassages=new Set([
 'osm/way/545834707/0',
 'osm/way/545834708/0',
 'osm/way/1540072636/0',
 'osm/way/102826699/0',
 'osm/way/102826700/0',
]);

const roadNodeKey=(p:Point)=>`${Math.round(p[0]*2)},${Math.round(p[1]*2)}`;
// Bridge-to-bridge viaduct joints across tile boundaries stay at full deck height;
// all other bridge endpoints ramp smoothly down to meet the connected ground road.


export function bridgeRoadProfile(road:Road,baseY=.35):{p:Point[];y:number[]} {
 const sidewalk=sidewalkBridgeRoads[road.id];
 if(!sidewalk&&pedestrianBridgeProfiles[road.id])return pedestrianBridgeProfiles[road.id];
 const pts:Point[]=[],cumulative:number[]=[0];
 for(let i=0;i<road.p.length;i++){
  if(i===0){pts.push(road.p[0]);continue;}
  const a=road.p[i-1],b=road.p[i],seg=Math.hypot(b[0]-a[0],b[1]-a[1]),steps=Math.max(1,Math.ceil(seg/4));
  for(let j=1;j<=steps;j++){
   const p:Point=[a[0]+(b[0]-a[0])*j/steps,a[1]+(b[1]-a[1])*j/steps];
   const prev=pts[pts.length-1];
   pts.push(p);cumulative.push(cumulative[cumulative.length-1]+Math.hypot(p[0]-prev[0],p[1]-prev[1]));
  }
 }
 if(road.id==='osm/way/721099986/0'||road.id==='osm/way/721099987/0'){const height=road.id==='osm/way/721099986/0'?bridge4Height:bridge5Height;return {p:pts,y:pts.map(p=>height(p[1]))};}
 // These four overlapping access legs share one deck, rather than four
 // independently arched surfaces intersecting at different heights.
 if(['440769426','440769428','686143525','686143527'].some(id=>road.id===`osm/way/${id}/0`)){
  return {p:pts,y:pts.map(p=>baseY+(p[1]<=55||p[1]>=109?0:1.25*Math.sin((p[1]-55)/54*Math.PI)**2))};
 }
 if(sidewalk){
  const motor=bridgeRoadProfile(sidewalk.road),total=cumulative.at(-1)!;
  const y=pts.map((p,i)=>{
   let distance=Infinity,height=.35;
   for(let j=1;j<motor.p.length;j++){
    const a=motor.p[j-1],b=motor.p[j],dx=b[0]-a[0],dz=b[1]-a[1],t=Math.max(0,Math.min(1,((p[0]-a[0])*dx+(p[1]-a[1])*dz)/(dx*dx+dz*dz||1))),d=Math.hypot(p[0]-a[0]-dx*t,p[1]-a[1]-dz*t);
    if(d<distance){distance=d;height=motor.y[j-1]+(motor.y[j]-motor.y[j-1])*t;}
   }
   const blend=Math.min(1,sidewalk.groundStart?cumulative[i]/6:1,sidewalk.groundEnd?(total-cumulative[i])/6:1);
   return FOOT_TOP+(height+.04-FOOT_TOP)*blend;
  });
  return {p:pts,y};
 }
 const total=cumulative[cumulative.length-1]||1;
 const startGrounded=!elevatedBridgeJoints.has(roadNodeKey(road.p[0])),endGrounded=!elevatedBridgeJoints.has(roadNodeKey(road.p[road.p.length-1]));
 const deckY=Math.max(1,road.layer??1)*5;
 const peakY=startGrounded&&endGrounded?Math.min(deckY,baseY+total*.045):deckY;
 const startFlat=startGrounded?(bridgeGroundClearances[roadNodeKey(road.p[0])]??0):0,endFlat=endGrounded?(bridgeGroundClearances[roadNodeKey(road.p.at(-1)!)]??0):0;
 const anchors=[{s:0,grounded:startGrounded,flat:startGrounded?startFlat:bridgeJointLandings[road.id]?.[roadNodeKey(road.p[0])]??0,y:startGrounded?baseY:bridgeJointHeights[roadNodeKey(road.p[0])]??deckY}];let station=0;
 for(let i=1;i<road.p.length;i++){
  station+=Math.hypot(road.p[i][0]-road.p[i-1][0],road.p[i][1]-road.p[i-1][1]);
  if(i<road.p.length-1&&elevatedBridgeJoints.has(roadNodeKey(road.p[i])))anchors.push({s:station,grounded:false,flat:bridgeJointLandings[road.id]?.[roadNodeKey(road.p[i])]??0,y:bridgeJointHeights[roadNodeKey(road.p[i])]??deckY});
 }
 anchors.push({s:total,grounded:endGrounded,flat:endGrounded?endFlat:bridgeJointLandings[road.id]?.[roadNodeKey(road.p.at(-1)!)]??0,y:endGrounded?baseY:bridgeJointHeights[roadNodeKey(road.p.at(-1)!)]??deckY});
 const smooth=(t:number)=>{const u=Math.max(0,Math.min(1,t));return u*u*(3-2*u);};
 const baseHeights=cumulative.map(s=>{
  let i=0;while(i<anchors.length-2&&s>anchors[i+1].s)i++;
  const a=anchors[i],b=anchors[i+1],length=b.s-a.s;
  if(!a.grounded&&!b.grounded){const scale=Math.min(1,length*.75/(a.flat+b.flat||1)),t=Math.max(0,Math.min(1,(s-a.s-a.flat*scale)/(length-(a.flat+b.flat)*scale)));return a.y+(b.y-a.y)*smooth(t)+Math.max(0,deckY-Math.max(a.y,b.y))*Math.sin(Math.PI*t)**2;}
  const peak=a.grounded&&b.grounded?Math.min(peakY,baseY+length*.045):a.grounded?b.y:a.y;
  const rampLen=Math.min(Math.max(36,(peak-baseY)*12),Math.max(1,length-a.flat-b.flat));
  let f=1;
  if(a.grounded)f=Math.min(f,smooth((s-a.s-a.flat)/rampLen));
  if(b.grounded)f=Math.min(f,smooth((b.s-s-b.flat)/rampLen));
  return baseY+(peak-baseY)*f;
 });
 const y=baseHeights.map((height,i)=>{const s=cumulative[i];for(const cross of bridgeCrossings[road.id]??[]){let j=0;while(j<anchors.length-2&&cross.s>anchors[j+1].s)j++;const a=anchors[j],b=anchors[j+1];if(s<a.s||s>b.s)continue;const f=Math.min(smooth((s-a.s)/Math.max(1,cross.s-a.s-cross.span)),smooth((b.s-s)/Math.max(1,b.s-cross.s-cross.span)));height=Math.max(height,baseHeights[i]+Math.max(0,cross.y-baseHeights[i])*f);}return height;});
 return {p:pts,y};
}

const undergroundOnly=(road:Road)=>{
 const levels=road.tags?.level?.split(';').map(v=>Number(v));
 return !!levels?.length&&levels.every(v=>Number.isFinite(v)&&v<0);
};
// A negative layer may describe an underground road even without tunnel=yes.
export const isGroundRoad=(road:Road)=>(!road.tunnel||surfacePassages.has(road.id))&&!road.bridge&&!road.indoor&&!undergroundOnly(road)&&(road.layer??0)>=0&&!['construction','proposed'].includes(road.kind);
export const isVisibleRoad=(road:Road)=>(!road.tunnel||surfacePassages.has(road.id))&&!road.indoor&&!undergroundOnly(road)&&(road.layer??0)>=0&&!['construction','proposed'].includes(road.kind);

// A source foot permission overrides the general access tag; a missing tag is
// unknown, so retain the existing public-path behaviour rather than invent it.
export function isPedestrianRoad(road:Road){
 const tags=road.tags??{},foot=tags.foot;
 if(['no','private','use_sidepath'].includes(foot))return false;
 if(['no','private'].includes(tags.access)&&!['yes','designated','permissive'].includes(foot))return false;
 return /^(footway|path|pedestrian|living_street|steps)$/.test(road.kind)||road.kind==='cycleway'&&['yes','designated','permissive'].includes(foot);
}
