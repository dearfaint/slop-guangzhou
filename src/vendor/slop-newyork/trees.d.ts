import type {Scene,Group,InstancedMesh,Vector3} from 'three/webgpu';
export function createTreeField(scene:Scene,sites:object[]):{group:Group;meshes:InstancedMesh[];update(position:Vector3):boolean};
