import {forwardTrafficEdges,type TrafficGraph} from './traffic-model.ts';
// Ambient vehicles need a continuation at both ends without an immediate U-turn.
// Keep the source graph intact for local access, navigation and road rendering.
export function circulatingTrafficEdges(graph:TrafficGraph){
 const active=new Set([...graph.edges.values()].filter(e=>e.permitted!==false).map(e=>e.id));
 const next=new Map<string,Set<string>>(),previous=new Map<string,Set<string>>();
 for(const id of active){next.set(id,new Set());previous.set(id,new Set());}
 for(const id of active)for(const edge of forwardTrafficEdges(graph,graph.edges.get(id)!)){
  next.get(id)!.add(edge.id);previous.get(edge.id)!.add(id);
 }
 const queue=[...active].filter(id=>!next.get(id)!.size||!previous.get(id)!.size);
 for(let i=0;i<queue.length;i++){
  const id=queue[i];if(!active.delete(id))continue;
  for(const p of previous.get(id)!){next.get(p)!.delete(id);if(!next.get(p)!.size)queue.push(p);}
  for(const n of next.get(id)!){previous.get(n)!.delete(id);if(!previous.get(n)!.size)queue.push(n);}
 }
 return active;
}
