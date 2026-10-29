import {armPoint,junctionAxis,junctionArms,stopLineDistance} from './traffic-model.ts';
import type {TrafficGraph,TrafficNode} from './traffic-model.ts';

// Crossings, stop lines and lights all follow the same physical approach.
export function junctionApproaches(graph:TrafficGraph,node:TrafficNode){
 return junctionArms(graph,node).flatMap(e=>{
  if(e.width<(e.oneway?5.5:7.5))return [];
  const distance=stopLineDistance(graph,node),crossing=armPoint(graph,e,distance-3),line=armPoint(graph,e,distance);
  if(!crossing||!line||!armPoint(graph,e,distance+3))return [];
  const incoming=graph.nodes.get(e.to)!.outgoing.map(id=>graph.edges.get(id)!).some(n=>n.to===e.from&&n.permitted!==false);
  const side=line.width/2+1;
  return [{edge:e,crossing,line,incoming,axis:junctionAxis(graph,node,e),signal:{id:node.id,axis:junctionAxis(graph,node,e),x:line.p[0]+line.dz*side,z:line.p[1]-line.dx*side,heading:Math.atan2(line.dx,line.dz)}}];
 });
}
