// Inspect packaged source coverage without fetching or changing map geometry.
import {readFileSync} from 'node:fs';
import {bridgeRoadProfile,isVisibleRoad,isPedestrianRoad,isGroundRoad} from '../src/road-level.ts';
import {sidewalkBridgeRoads} from '../src/bridge-joints.ts';
const read=p=>JSON.parse(readFileSync(new URL(p,import.meta.url),'utf8'));
const raw=read('../data/raw/osm.json'),manifest=read('../public/data/manifest.json');
const roads=manifest.tiles.flatMap(t=>read('../public/data/'+t.id+'.json').roads);
const groups=new Map(),nodeTags=new Map(),nodeRoads=new Map();
for(const r of roads){
 r.nodeIds?.forEach((id,i)=>{if(id===null)return;const connected=nodeRoads.get(id)??new Set();connected.add(r);nodeRoads.set(id,connected);const p=r.p[i],key=p.map(v=>Math.round(v*2)).join(','),list=groups.get(key)??[];list.push({id,road:r.id,p});groups.set(key,list);});
 for(const [id,tags] of Object.entries(r.nodeTags??{}))nodeTags.set(id,tags);
}
const snapConflicts=[...groups.values()].filter(list=>new Set(list.map(p=>p.id)).size>1);
const endpointEvidence=(r,index)=>{
 const id=r.nodeIds?.[index],neighbors=[...(nodeRoads.get(id)??[])].filter(other=>other.id!==r.id&&/^(footway|path|pedestrian|steps)$/.test(other.kind));
 return {nodeId:id??null,deckRoads:neighbors.filter(other=>other.bridge&&other.kind!=='steps').map(other=>other.id),groundRoads:neighbors.filter(isGroundRoad).map(other=>other.id)};
};
const inclineReview=roads.filter(r=>r.tags?.incline&&isVisibleRoad(r)).map(r=>{
 const profile=r.bridge?bridgeRoadProfile(r,.28):undefined,delta=profile?profile.y.at(-1)-profile.y[0]:0;
 const direction=r.tags.incline,start=endpointEvidence(r,0),end=endpointEvidence(r,r.p.length-1);
 const topologyDirection=start.deckRoads.length&&!start.groundRoads.length&&end.groundRoads.length&&!end.deckRoads.length?'down':end.deckRoads.length&&!end.groundRoads.length&&start.groundRoads.length&&!start.deckRoads.length?'up':null;
 const reviewedConflict=topologyDirection&&topologyDirection!==direction&&(topologyDirection==='down'?delta<-.1:delta>.1);
 return {id:r.id,incline:direction,kind:r.kind,bridge:r.bridge,topologyDirection,endpointEvidence:{start,end},resolution:reviewedConflict?'preserve_topology_and_source_tag_conflict':null,delta:Math.round(delta*100)/100,status:!profile?'no_measured_vertical_profile':Math.abs(delta)<.1?'no_net_height':direction==='up'&&delta<0||direction==='down'&&delta>0?'direction_conflicts_with_estimate':'direction_consistent_with_estimate'};
});
const tags=['footway','sidewalk','incline','foot','access','surface','step_count','level','lanes','ele'];
console.log(JSON.stringify({
 roads:roads.length,sourceTagsRetained:roads.filter(r=>r.tags).length,
 taggedRoads:Object.fromEntries(tags.map(tag=>[tag,roads.filter(r=>r.tags?.[tag]!==undefined).length])),
 widths:{source:roads.filter(r=>r.widthSource==='osm:width').length,estimated:roads.filter(r=>r.widthSource!=='osm:width').length,invalidLaneTags:roads.filter(r=>Number(r.tags?.lanes)<0).map(r=>({id:r.id,lanes:r.tags.lanes,width:r.w,widthSource:r.widthSource}))},
 nodeReferences:{roads:roads.filter(r=>r.nodeIds).length,unverifiedRoads:roads.filter(r=>!r.nodeIds).map(r=>r.id),taggedNodes:nodeTags.size,signals:[...nodeTags.values()].filter(t=>t.highway==='traffic_signals').length,crossings:[...nodeTags.values()].filter(t=>t.highway==='crossing').length,oldSnapConflicts:snapConflicts},
 walking:{sidewalks:roads.filter(r=>r.tags?.footway==='sidewalk').length,crossingWays:roads.filter(r=>r.tags?.footway==='crossing').length,bridgeSidewalks:Object.keys(sidewalkBridgeRoads).length,restrictedPaths:roads.filter(r=>/^(footway|path|pedestrian|steps|living_street)$/.test(r.kind)&&!isPedestrianRoad(r)).map(r=>({id:r.id,foot:r.tags?.foot,access:r.tags?.access})),undergroundOnly:roads.filter(r=>r.tags?.level&&r.tags.level.split(';').every(v=>Number(v)<0)).map(r=>r.id),inclineReview},
 connectivitySource:raw.connectivitySource,
 verticalReference:'layer and level are ordering/floor labels; incline up/down is directional. Elevation tag coverage is reported separately. Estimated bridge profiles are not survey evidence.'
},null,2));
