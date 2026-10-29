import { Group, Vector3, Material } from 'three/webgpu';
import { createTile, disposeTile } from './geometry.ts';
import { Carriageways } from './curb.ts';
import type { Manifest, TileData, TileEntry } from './types';

export class Tiles {
  root = new Group();
  loaded = new Map<string,{group:Group;data:TileData}>();
  pending = new Set<string>();
  failed = new Map<string,number>();
  bytes=0; errors=0; buildings=0;
  radius=2100;
  private preloaded=false;
  async preload(onProgress:(loaded:number,total:number)=>void){
    // Fetch every tile first so kerbs are built against the whole road network, then build meshes.
    const queue=this.manifest.tiles.filter(t=>!this.loaded.has(t.id));let cursor=0,fetched=0;
    await Promise.all(Array.from({length:3},async()=>{
      while(cursor<queue.length){const tile=queue[cursor++];await this.fetchData(tile).catch(()=>undefined);onProgress(++fetched*.5,queue.length);}
    }));
    const all=[...this.cache.values()];this.curbs=new Carriageways(all.flatMap(t=>t.roads),all.flatMap(t=>t.areas));
    cursor=0;
    await Promise.all(Array.from({length:3},async()=>{
      while(cursor<queue.length){await this.load(queue[cursor++]);onProgress(fetched*.5+this.loaded.size*.5,this.manifest.tiles.length);}
    }));
    if(this.failed.size)throw new Error(`${this.failed.size} 个地图分块加载失败，请重试`);
    this.preloaded=true;
  }
  public manifest:Manifest;
  private material:Material;
  private onChange:()=>void;
  constructor(manifest:Manifest,material:Material,onChange:()=>void){this.manifest=manifest;this.material=material;this.onChange=onChange;}
  private loading=new Map<string,Promise<void>>();
  private cache=new Map<string,TileData>();
  private curbs?:Carriageways;
  private async fetchData(tile:TileEntry){
    const cached=this.cache.get(tile.id);if(cached)return cached;
    const response=await fetch(`${import.meta.env?.BASE_URL??'/'}data/${tile.id}.json`);
    if(!response.ok) throw new Error(`地图分块 ${response.status}`);
    const data:TileData=await response.json();this.cache.set(tile.id,data);return data;
  }
  load(tile:TileEntry):Promise<void> {
    if(this.loaded.has(tile.id))return Promise.resolve();
    const existing=this.loading.get(tile.id);if(existing)return existing;
    const task=this.loadTile(tile);this.loading.set(tile.id,task);
    void task.finally(()=>this.loading.delete(tile.id));return task;
  }
  private async loadTile(tile:TileEntry) {
    this.pending.add(tile.id);
    try {
      const data=await this.fetchData(tile);
      const group=createTile(data,this.material,false,this.curbs);this.root.add(group);
      this.loaded.set(tile.id,{group,data});this.bytes+=tile.bytes;this.buildings+=data.buildings.length;
      this.failed.delete(tile.id);
    } catch(e) { console.error(e);this.errors++;this.failed.set(tile.id,performance.now()); }
    finally { this.pending.delete(tile.id);this.onChange(); }
  }
  update(target:Vector3) {
    if(this.preloaded)return;
    const distance=(tile:TileEntry)=>Math.hypot(tile.center[0]-target.x,tile.center[1]-target.z);
    const desired=this.manifest.tiles.filter(t=>distance(t)<this.radius).sort((a,b)=>distance(a)-distance(b));
    for(const tile of desired) {
      if(this.pending.size>=3) break;
      if(!this.loaded.has(tile.id)&&!this.pending.has(tile.id)&&performance.now()-(this.failed.get(tile.id)??-Infinity)>15000) void this.load(tile);
    }
    let unloaded=false;
    for(const tile of this.manifest.tiles) {
      const old=this.loaded.get(tile.id);
      if(old&&distance(tile)>this.radius+650) {this.root.remove(old.group);disposeTile(old.group);this.loaded.delete(tile.id);this.bytes-=tile.bytes;this.buildings-=old.data.buildings.length;unloaded=true;}
    }
    if(unloaded)this.onChange();
  }
}
