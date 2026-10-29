// Derive bridge/bridge seams from the packaged map, including interior OSM nodes.
import {readFileSync} from 'node:fs';
import {isVisibleRoad,isGroundRoad,bridgeRoadProfile,hiddenUndergroundBuildings} from '../src/road-level.ts';
import {islandRoadReplaced} from '../src/haixinsha-layout.ts';
import {writeStaticData} from './static-data.mjs';
import {bridgeJointsComment,bridgeJointsModule} from './bridge-joints-module.mjs';
const root=new URL('../public/data/',import.meta.url),read=name=>JSON.parse(readFileSync(new URL(name,root),'utf8'));
const manifest=read('manifest.json'),bounds=[(manifest.bbox[0]-manifest.origin[0])*Math.PI/180*6378137*Math.cos(manifest.origin[1]*Math.PI/180),(manifest.bbox[2]-manifest.origin[0])*Math.PI/180*6378137*Math.cos(manifest.origin[1]*Math.PI/180),-(manifest.bbox[3]-manifest.origin[1])*Math.PI/180*6378137,-(manifest.bbox[1]-manifest.origin[1])*Math.PI/180*6378137];
const boundary=k=>{const [x,z]=k.split(',').map(v=>Number(v)/2);return bounds.some((v,i)=>Math.abs((i<2?x:z)-v)<6);};
const roads=[...new Map(manifest.tiles.flatMap(t=>read(t.id+'.json').roads).map(r=>[r.id,r])).values()];
const key=p=>`${Math.round(p[0]*2)},${Math.round(p[1]*2)}`,bridges=new Map(),ground=new Set(),neighbors=new Map();
for(const r of roads)for(const p of r.p){const k=key(p);if(isGroundRoad(r))ground.add(k);if(r.bridge&&isVisibleRoad(r)){const ids=bridges.get(k)??new Set();ids.add(r.id);bridges.set(k,ids);}}
const joints=[...bridges].filter(([k,ids])=>(ids.size>1||boundary(k))&&(!ground.has(k)||boundary(k))).map(([k])=>k).sort();
for(const r of roads.filter(isVisibleRoad))for(let i=1;i<r.p.length;i++)for(const [a,b] of [[r.p[i-1],r.p[i]],[r.p[i],r.p[i-1]]]){const k=key(a),list=neighbors.get(k)??new Set();list.add(key(b));neighbors.set(k,list);}
const openings=[...neighbors].filter(([k,list])=>bridges.has(k)&&list.size>2).map(([k])=>k).sort();
const byNode=new Map();
for(const r of roads.filter(isVisibleRoad))for(const p of r.p){const k=key(p),list=byNode.get(k)??new Set();list.add(r.id);byNode.set(k,list);}
const groundClearances={};
for(const [k,ids] of byNode){const neighbors=[...ids].map(id=>roads.find(r=>r.id===id));const ground=neighbors.filter(isGroundRoad),elevated=neighbors.filter(r=>r.bridge);if(ground.length&&elevated.length)groundClearances[k]=(Math.max(...ground.map(r=>r.w))+Math.max(...elevated.map(r=>r.w)))/2+1;}
const bridgeJointHeights={};
for(const [k,ids] of bridges)if(ids.size>1||boundary(k))bridgeJointHeights[k]=ground.has(k)&&!boundary(k)?.35:Math.min(...[...ids].map(id=>Math.max(1,roads.find(r=>r.id===id).layer??1)*5));
const bridgeJointLandings={};
const distance=(p,r)=>Math.min(...r.p.slice(1).map((b,i)=>{const a=r.p[i],dx=b[0]-a[0],dz=b[1]-a[1],t=Math.max(0,Math.min(1,((p[0]-a[0])*dx+(p[1]-a[1])*dz)/(dx*dx+dz*dz||1)));return Math.hypot(p[0]-a[0]-dx*t,p[1]-a[1]-dz*t);}));
for(const r of roads.filter(r=>r.bridge&&isVisibleRoad(r))){
 const stations=[0];for(let i=1;i<r.p.length;i++)stations.push(stations.at(-1)+Math.hypot(r.p[i][0]-r.p[i-1][0],r.p[i][1]-r.p[i-1][1]));
 const point=s=>{let i=1;while(i<stations.length-1&&s>stations[i])i++;const t=(s-stations[i-1])/(stations[i]-stations[i-1]||1);return r.p[i-1].map((v,j)=>v+(r.p[i][j]-v)*t);};
 for(let i=0;i<r.p.length;i++){const k=key(r.p[i]);if(!joints.includes(k))continue;const others=[...(bridges.get(k)??[])].filter(id=>id!==r.id).map(id=>roads.find(r=>r.id===id));let landing=0;
  for(const other of others)for(const side of [-1,1])for(let d=4;d<=140;d+=4){const s=stations[i]+side*d;if(s<0||s>stations.at(-1)||distance(point(s),other)>(r.w+other.w)/2+1)break;landing=Math.max(landing,d);}
  (bridgeJointLandings[r.id]??={})[k]=landing;
 }
}
// Explicit OSM sidewalks on vehicular bridges share their supporting road profile.
const sidewalkIds=new Set(roads.filter(r=>r.tags?.footway==='sidewalk').map(r=>r.id));
const sidewalkBridgeRoads={};
for(const r of roads.filter(r=>r.bridge&&sidewalkIds.has(r.id))){
 const samples=r.p.slice(1).flatMap((b,i)=>{const a=r.p[i],n=Math.max(1,Math.ceil(Math.hypot(b[0]-a[0],b[1]-a[1])/4));return Array.from({length:n},(_,j)=>({p:a.map((v,k)=>v+(b[k]-v)*(j+.5)/n),dx:b[0]-a[0],dz:b[1]-a[1]}));});
 const candidates=roads.filter(o=>o.bridge&&o.layer===r.layer&&/^(trunk|primary|secondary|tertiary|residential|unclassified|service)(_link)?$/.test(o.kind)).map(o=>{
  let sum=0,aligned=0;
  for(const sample of samples){let best=Infinity,dot=0;for(let i=1;i<o.p.length;i++){const a=o.p[i-1],b=o.p[i],dx=b[0]-a[0],dz=b[1]-a[1],t=Math.max(0,Math.min(1,((sample.p[0]-a[0])*dx+(sample.p[1]-a[1])*dz)/(dx*dx+dz*dz||1))),d=Math.hypot(sample.p[0]-a[0]-dx*t,sample.p[1]-a[1]-dz*t);if(d<best){best=d;dot=Math.abs(dx*sample.dx+dz*sample.dz)/(Math.hypot(dx,dz)*Math.hypot(sample.dx,sample.dz)||1);}}
   sum+=best;if(best<o.w/2+14&&dot>.9)aligned++;
  }
  return {road:o,score:sum/samples.length,coverage:aligned/samples.length};
 }).filter(o=>o.coverage>.8).sort((a,b)=>a.score-b.score);
 if(candidates.length)sidewalkBridgeRoads[r.id]={road:candidates[0].road,groundStart:ground.has(key(r.p[0])),groundEnd:ground.has(key(r.p.at(-1)))};
}
const bridgeCrossings={},bridgeUnderpasses={},pedestrianCrossings={};
const walk=r=>/^(footway|path|pedestrian|steps|cycleway)$/.test(r.kind);
const motorProfiles=new Map();
const motorHeight=(r,p)=>{if(!r.bridge)return .35;if(!motorProfiles.has(r.id))motorProfiles.set(r.id,bridgeRoadProfile(r));const prof=motorProfiles.get(r.id);let best=Infinity,y=.35;for(let i=1;i<prof.p.length;i++){const a=prof.p[i-1],b=prof.p[i],dx=b[0]-a[0],dz=b[1]-a[1],t=Math.max(0,Math.min(1,((p[0]-a[0])*dx+(p[1]-a[1])*dz)/(dx*dx+dz*dz||1))),d=Math.hypot(p[0]-a[0]-dx*t,p[1]-a[1]-dz*t);if(d<best){best=d;y=prof.y[i-1]+(prof.y[i]-prof.y[i-1])*t;}}return y;};
const motor=r=>/^(trunk|primary|secondary|tertiary|residential|unclassified|living_street|service)(_link)?$/.test(r.kind);
for(const r of roads.filter(r=>r.bridge&&!sidewalkBridgeRoads[r.id]&&isVisibleRoad(r)&&(motor(r)||walk(r))&&!islandRoadReplaced(r.p,r.bridge))){let station=0;for(let i=1;i<r.p.length;i++){const a=r.p[i-1],b=r.p[i],ux=b[0]-a[0],uz=b[1]-a[1],length=Math.hypot(ux,uz);
 for(const other of roads.filter(o=>o.id!==r.id&&isVisibleRoad(o)&&motor(o)&&(walk(r)?(o.layer??0)<=(r.layer??1):(o.layer??0)<r.layer)))for(let j=1;j<other.p.length;j++){const c=other.p[j-1],d=other.p[j],vx=d[0]-c[0],vz=d[1]-c[1],det=ux*vz-uz*vx;if(Math.abs(det)<1e-5)continue;const t=((c[0]-a[0])*vz-(c[1]-a[1])*vx)/det,v=((c[0]-a[0])*uz-(c[1]-a[1])*ux)/det;if(t<0||t>1||v<0||v>1)continue;const p=[a[0]+t*ux,a[1]+t*uz];
 if(r.p.some(a=>other.p.some(b=>key(a)===key(b)&&Math.hypot(a[0]-p[0],a[1]-p[1])<20)))continue;
 (bridgeUnderpasses[r.id]??=new Set()).add(other.id);
 if(walk(r))(pedestrianCrossings[r.id]??=[]).push({s:station+t*length,span:(r.w+other.w)/2/Math.max(.2,Math.abs(det)/(length*Math.hypot(vx,vz)))+1.5,y:motorHeight(other,p)+5.45});
 else if(r.layer>=1)(bridgeCrossings[r.id]??=[]).push({s:station+t*length,span:(r.w+other.w)/2/Math.max(.2,Math.abs(det)/(length*Math.hypot(vx,vz)))+2,y:r.layer*5});
 }station+=length;
}}
// Pedestrian spans stay above the entire carriageway; only stairs and clear ends descend.
const buildings=[...new Map(manifest.tiles.flatMap(t=>read(t.id+'.json').buildings).filter(b=>b.base<2&&!hiddenUndergroundBuildings.has(b.id)).map(b=>[b.id,b])).values()].map(b=>({...b,minX:Math.min(...b.p[0].map(p=>p[0]))-.65,maxX:Math.max(...b.p[0].map(p=>p[0]))+.65,minZ:Math.min(...b.p[0].map(p=>p[1]))-.65,maxZ:Math.max(...b.p[0].map(p=>p[1]))+.65}));
const buildingBlocked=p=>buildings.some(b=>{if(p[0]<b.minX||p[0]>b.maxX||p[1]<b.minZ||p[1]>b.maxZ)return false;let inside=false;const ring=b.p[0];for(let i=0,j=ring.length-1;i<ring.length;j=i++){const a=ring[i],c=ring[j];if((a[1]>p[1])!==(c[1]>p[1])&&p[0]<(c[0]-a[0])*(p[1]-a[1])/(c[1]-a[1])+a[0])inside=!inside;}return inside||distance(p,{p:ring})<.65;});
const pedestrianBridgeProfiles={},footRoads=roads.filter(r=>r.bridge&&!sidewalkBridgeRoads[r.id]&&isVisibleRoad(r)&&walk(r)&&!islandRoadReplaced(r.p,r.bridge)),footNodes=new Map();
for(const r of footRoads)for(const p of r.p){const k=key(p),ids=footNodes.get(k)??new Set();ids.add(r.id);footNodes.set(k,ids);}
const visited=new Set();
const sampled=r=>{const p=[r.p[0]],stations=[0];for(let i=1;i<r.p.length;i++){const a=r.p[i-1],b=r.p[i],length=Math.hypot(b[0]-a[0],b[1]-a[1]),count=Math.max(1,Math.ceil(length));for(let j=1;j<=count;j++){p.push(a.map((v,k)=>v+(b[k]-v)*j/count));stations.push(stations.at(-1)+length/count);}}return {p,stations,total:stations.at(-1)};};
for(const seed of footRoads){if(visited.has(seed.id))continue;const pending=[seed],group=[];while(pending.length){const r=pending.pop();if(visited.has(r.id))continue;visited.add(r.id);group.push(r);for(const p of r.p)for(const id of footNodes.get(key(p))??[])if(!visited.has(id))pending.push(footRoads.find(r=>r.id===id));}
 const crossings=group.flatMap(r=>pedestrianCrossings[r.id]??[]);if(!crossings.length)continue;
 const deck=Math.max(5.8,...crossings.map(c=>c.y)),deckNodes=new Set(group.filter(r=>r.kind!=='steps').flatMap(r=>r.p.map(key))),stepEdges=new Map();
 for(const r of group.filter(r=>r.kind==='steps'))for(let i=1;i<r.p.length;i++){const a=key(r.p[i-1]),b=key(r.p[i]),length=Math.hypot(r.p[i][0]-r.p[i-1][0],r.p[i][1]-r.p[i-1][1]);for(const [from,to] of [[a,b],[b,a]]){const list=stepEdges.get(from)??[];list.push({to,length});stepEdges.set(from,list);}}
 const groundNodes=[...stepEdges].filter(([k,edges])=>!deckNodes.has(k)&&(edges.length===1||ground.has(k))).map(([k])=>k);
 const distances=seeds=>{const d=new Map(seeds.map(k=>[k,0])),queue=[...seeds];while(queue.length){queue.sort((a,b)=>d.get(b)-d.get(a));const k=queue.pop();for(const edge of stepEdges.get(k)??[]){const next=d.get(k)+edge.length;if(next<(d.get(edge.to)??Infinity)){d.set(edge.to,next);queue.push(edge.to);}}}return d;};
 const toDeck=distances([...deckNodes]),toGround=distances(groundNodes),height=k=>deckNodes.has(k)?deck:toGround.has(k)&&toDeck.has(k)?.28+(deck-.28)*toGround.get(k)/(toGround.get(k)+toDeck.get(k)||1):deck;
 for(const r of group){const sampledRoad=sampled(r),{stations,total}=sampledRoad;let p=sampledRoad.p,y;
  const access=(end,free)=>{const endpoint=r.p[end],out=end===0?[r.p[0][0]-r.p[1][0],r.p[0][1]-r.p[1][1]]:[r.p.at(-1)[0]-r.p.at(-2)[0],r.p.at(-1)[1]-r.p.at(-2)[1]];let path=[endpoint],seen=new Set([r.id]),explicitSteps=false;
   for(let count=0;count<8;count++){const current=path.at(-1),options=[];for(const id of byNode.get(key(current))??[]){const q=roads.find(r=>r.id===id);if(seen.has(id)||q.bridge||!walk(q)||q.tunnel||q.indoor||(count===0&&q.kind!=='steps'&&free>=3))continue;const i=q.p.findIndex(p=>key(p)===key(current));for(const points of [q.p.slice(i),q.p.slice(0,i+1).reverse()])if(points.length>1){const d=[points[1][0]-current[0],points[1][1]-current[1]],dot=(d[0]*out[0]+d[1]*out[1])/(Math.hypot(...d)*Math.hypot(...out)||1);options.push({q,points,dot});}}
    options.sort((a,b)=>Number(b.q.kind==='steps')-Number(a.q.kind==='steps')||b.dot-a.dot);const next=options[0];if(!next)break;if(count===0)explicitSteps=next.q.kind==='steps';seen.add(next.q.id);path.push(...next.points.slice(1));const length=path.slice(1).reduce((sum,p,i)=>sum+Math.hypot(p[0]-path[i][0],p[1]-path[i][1]),0);if(length>=16)break;
   }if(path.length<2)return undefined;const sampledPath=sampled({p:path});return {...sampledPath,explicitSteps};
  };
  if(r.kind==='steps'){let i=1,s0=0,s1=Math.hypot(r.p[1][0]-r.p[0][0],r.p[1][1]-r.p[0][1]);y=stations.map(s=>{while(i<r.p.length-1&&s>s1){s0=s1;i++;s1+=Math.hypot(r.p[i][0]-r.p[i-1][0],r.p[i][1]-r.p[i-1][1]);}return height(key(r.p[i-1]))+(height(key(r.p[i]))-height(key(r.p[i-1])))*(s-s0)/(s1-s0||1);});}
  else{const spans=pedestrianCrossings[r.id]??[],joins=[];let station=0;for(let i=0;i<r.p.length;i++){if(i)station+=Math.hypot(r.p[i][0]-r.p[i-1][0],r.p[i][1]-r.p[i-1][1]);if(i&&i<r.p.length-1&&(footNodes.get(key(r.p[i]))?.size??0)>1)joins.push(station);}const left=Math.min(total,...spans.map(c=>c.s-c.span),...joins.map(s=>s-1)),right=Math.min(total,...spans.map(c=>total-c.s-c.span),...joins.map(s=>total-s-1)),startAccess=(footNodes.get(key(r.p[0]))?.size??0)===1?access(0,left):undefined,endAccess=(footNodes.get(key(r.p.at(-1)))?.size??0)===1?access(r.p.length-1,right):undefined,start=(footNodes.get(key(r.p[0]))?.size??0)===1&&!startAccess&&left>=3?Math.min(16,left-1):0,end=(footNodes.get(key(r.p.at(-1)))?.size??0)===1&&!endAccess&&right>=3?Math.min(16,right-1):0;y=stations.map(s=>.28+(deck-.28)*Math.min(1,start?s/start:1,end?(total-s)/end:1));
   const attach=a=>{let run=a.explicitSteps?a.total:Math.min(16,a.total);for(let i=1;i<a.p.length;i++)for(const other of roads.filter(o=>o.bridge&&motor(o))){if(distance(a.p[i],other)>other.w/2+.5)continue;const maxFoot=motorHeight(other,a.p[i])-2.9;if(maxFoot>.28&&maxFoot<deck)run=Math.min(run,a.stations[i]*(deck-.28)/(deck-maxFoot));}const end=Math.max(1,a.stations.findIndex(s=>s>=run));return {p:a.p.slice(0,end+1),y:a.stations.slice(0,end+1).map(s=>deck-(deck-.28)*Math.min(1,s/run))};};
   if(startAccess){const a=attach(startAccess);p=[...a.p.slice(1).reverse(),...p];y=[...a.y.slice(1).reverse(),...y];}
   if(endAccess){const a=attach(endAccess);p.push(...a.p.slice(1));y.push(...a.y.slice(1));}
  }
  if(r.kind==='steps'&&(pedestrianCrossings[r.id]??[]).length){const spans=pedestrianCrossings[r.id],left=Math.min(...spans.map(c=>c.s-c.span)),right=total-Math.max(...spans.map(c=>c.s+c.span)),startY=y[0],endY=y.at(-1);y=y.map((h,i)=>Math.max(h,.28+(deck-.28)*Math.min(startY>deck-.1?1:Math.max(0,Math.min(1,stations[i]/Math.max(.1,left))),endY>deck-.1?1:Math.max(0,Math.min(1,(total-stations[i])/Math.max(.1,right))))));}
  if(y[0]<.4&&buildingBlocked(p[0])){let i=0;while(i<p.length-2&&y[i+1]<1.5&&Math.hypot(p[i+1][0]-p[0][0],p[i+1][1]-p[0][1])<1.5&&buildingBlocked(p[i]))i++;if(i){p=p.slice(i);y=y.slice(i);y[0]=.28;}}
  if(y.at(-1)<.4&&buildingBlocked(p.at(-1))){let i=p.length-1;while(i>1&&y[i-1]<1.5&&Math.hypot(p[i-1][0]-p.at(-1)[0],p[i-1][1]-p.at(-1)[1])<1.5&&buildingBlocked(p[i]))i--;if(i<p.length-1){p=p.slice(0,i+1);y=y.slice(0,i+1);y[y.length-1]=.28;}}
  pedestrianBridgeProfiles[r.id]={p,y};
 }
}
const connections={},exitRoads={};
for(const r of roads.filter(r=>r.bridge&&isVisibleRoad(r))){const ids=new Set(r.p.flatMap(p=>[...(byNode.get(key(p))??[])])).difference(new Set([r.id]));if(!ids.size)continue;connections[r.id]=[...ids];for(const id of ids){const other=roads.find(r=>r.id===id);exitRoads[id]=other;}}
for(const ids of Object.values(bridgeUnderpasses))for(const id of ids)exitRoads[id]=roads.find(r=>r.id===id);
writeStaticData('bridge-joints',{elevatedBridgeJoints:joints,bridgeJunctions:openings,bridgeConnections:connections,bridgeExitRoads:exitRoads,bridgeGroundClearances:groundClearances,bridgeJointHeights,bridgeJointLandings,bridgeCrossings,sidewalkBridgeRoads,pedestrianBridgeProfiles,bridgeUnderpasses:Object.fromEntries(Object.entries(bridgeUnderpasses).map(([id,ids])=>[id,[...ids]]))},{comment:bridgeJointsComment,module:bridgeJointsModule});
console.log(`${joints.length} elevated seams derived from ${roads.length} roads`);
