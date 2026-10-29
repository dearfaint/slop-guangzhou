import type { TileData } from './types.ts';
import { Group, Scene, Vector3, type InstancedMesh } from 'three/webgpu';
import { createTreeField } from './vendor/slop-newyork/trees.js';

// MIT Slop New York tree geometry/atlas, placed on Guangzhou's mapped planting sites.
export class SlopTrees {
  readonly meshes:InstancedMesh[]=[];
  readonly root=new Group();
  private field?:ReturnType<typeof createTreeField>;
  constructor(trees:{x:number;z:number;height:number;y?:number}[]){
    if(!trees.length)return;
    this.field=createTreeField(new Scene(),trees.map(t=>({...t,y:t.y??.18,scale:t.height/11,species:Math.abs(Math.round(t.x+t.z))%3})));
    this.meshes=this.field.meshes;this.root.add(...this.meshes);
    // Tile meshes are also used without the vendor's cell groups.
    for(const mesh of this.meshes)mesh.visible=true;
  }
  update(camera:Vector3){this.field?.update(camera);}
  dispose(){for(const mesh of this.meshes){mesh.geometry.dispose();mesh.dispose();}}
}

// All mapped rows share the same spatial tree field as inferred park planting.
export function mappedTreeSites(data:TileData[]){
  const trees:{x:number;z:number;height:number;y?:number}[]=[];
  for(const row of data.flatMap(tile=>tile.treeRows??[])){
    let carry=0;
    for(let i=1;i<row.p.length;i++){
      const a=row.p[i-1],b=row.p[i],length=Math.hypot(b[0]-a[0],b[1]-a[1]);
      if(length<.01)continue;
      let distance=carry;
      for(;distance<length;distance+=row.spacing){
        const t=distance/length;trees.push({x:a[0]+(b[0]-a[0])*t,z:a[1]+(b[1]-a[1])*t,height:row.height});
      }
      carry=distance-length;
    }
  }
  return trees;
}
