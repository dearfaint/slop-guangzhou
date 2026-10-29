import { BufferGeometry, Color, CylinderGeometry, DataTexture, Euler, Float32BufferAttribute, InstancedMesh, LinearFilter, LinearMipmapLinearFilter, Matrix4, MeshStandardMaterial, Quaternion, SRGBColorSpace, Vector3 } from 'three/webgpu';

type Tree={x:number;z:number;height:number};
const randomAt=(x:number,z:number)=>{
  let seed=(Math.imul(Math.round(x*100),73856093)^Math.imul(Math.round(z*100),19349663))>>>0;
  return ()=>{seed=(Math.imul(seed,1664525)+1013904223)>>>0;return seed/4294967296;};
};

// Layered 3-tone botanical leaf-spray cutout mask (deep shadow core + mid emerald + sunlit tips)
// with porous interior sky gaps so crossed planes read as organic foliage rather than flat cards.
function leafMask() {
  const size=128,pixels=new Uint8Array(size*size*4),random=randomAt(18,47);
  const sprays=[
    [64,52,20],[42,58,17],[86,58,17],[52,36,16],[76,36,16],
    [32,46,13],[96,46,13],[48,76,15],[80,76,15],[64,68,17],
  ];
  for(let i=0;i<380;i++) {
    const layer=i/380,spray=sprays[i%sprays.length];
    const subAngle=random()*Math.PI*2,subDist=Math.pow(random(),.58)*spray[2]*(.48+layer*.58);
    const cx=spray[0]+Math.cos(subAngle)*subDist,cy=spray[1]+Math.sin(subAngle)*subDist*.92;
    if(Math.hypot(cx-64,cy-58)>55)continue;
    // Leave small natural sky-holes even inside the crown for airy botanical depth.
    if(Math.hypot(cx-54,cy-52)<6.5||Math.hypot(cx-75,cy-55)<6.0||Math.hypot(cx-63,cy-42)<5.5)if(random()<.78)continue;
    const length=(1-layer*.32)*(4.6+random()*3.6),width=length*(.42+random()*.16);
    const turn=Math.atan2(cy-spray[1],cx-spray[0])+(random()-.5)*1.35,c=Math.cos(turn),s=Math.sin(turn);
    const sunTop=Math.max(0,Math.min(1,(90-cy)/74*.62+(1-Math.hypot(cx-58,cy-48)/68)*.38));
    const tierShade=layer<.34?108+sunTop*34:layer<.72?148+sunTop*44:188+sunTop*54;
    const shadeBase=tierShade+(random()-.5)*18;
    const rMax=Math.ceil(length+2);
    for(let y=Math.max(0,Math.floor(cy-rMax));y<Math.min(size,Math.ceil(cy+rMax));y++)for(let x=Math.max(0,Math.floor(cx-rMax));x<Math.min(size,Math.ceil(cx+rMax));x++) {
      const dx=x-cx,dy=y-cy,u=(dx*c+dy*s)/length,v=(-dx*s+dy*c)/(width*(1-.26*u));
      const d2=u*u+v*v;if(d2>1)continue;
      const tipLift=1+u*.10-d2*.14;
      const shade=Math.max(92,Math.min(252,Math.round(shadeBase*tipLift)));
      const p=(y*size+x)*4;
      pixels[p]=Math.min(255,Math.round(shade*(.90+layer*.06+sunTop*.05)));
      pixels[p+1]=shade;
      pixels[p+2]=Math.max(76,Math.round(shade*(.82-layer*.04)));
      pixels[p+3]=255;
    }
  }
  const texture=new DataTexture(pixels,size,size);
  texture.colorSpace=SRGBColorSpace;
  texture.magFilter=LinearFilter;texture.minFilter=LinearMipmapLinearFilter;texture.generateMipmaps=true;
  texture.needsUpdate=true;return texture;
}
const bark=new MeshStandardMaterial({color:'#5c4a3a',roughness:.92});
const foliage=new MeshStandardMaterial({color:'#ffffff',map:leafMask(),alphaTest:.5,roughness:.86});
function clusterGeometry() {
  // Two canted vertical planes + two crossed overhead canopy planes rendered front-and-back
  // with shared spherical outward normals so both street-level and bird's-eye views stay lush and seamless.
  const g=new BufferGeometry();
  const c=Math.cos(.65),s=Math.sin(.65),t=.12;
  g.setAttribute('position',new Float32BufferAttribute([
    -.5*c,-.48,-.5*s, .5*c,-.48,.5*s, .5*c+t,.48,.5*s, -.5*c+t,.48,-.5*s,
    -.5*s,-.48,.5*c,  .5*s,-.48,-.5*c, .5*s,.48,-.5*c+t, -.5*s,.48,.5*c+t,
    -.48,-.14,-.46,   .48,-.14,-.46,  .46,.24,.48,     -.46,.24,.48,
    -.46,-.12,.48,    -.46,-.12,-.48, .48,.22,-.46,    .48,.22,.46,
  ],3));
  g.setAttribute('uv',new Float32BufferAttribute([
    0,0,1,0,1,1,0,1,
    0,0,1,0,1,1,0,1,
    0,0,1,0,1,1,0,1,
    0,0,1,0,1,1,0,1,
  ],2));
  g.setIndex([
    0,1,2, 0,2,3, 0,2,1, 0,3,2,
    4,5,6, 4,6,7, 4,6,5, 4,7,6,
    8,11,10, 8,10,9, 8,10,11, 8,9,10,
    12,15,14, 12,14,13, 12,14,15, 12,13,14,
  ]);
  const pos=g.getAttribute('position'),normals=new Float32Array(pos.count*3),v=new Vector3();
  for(let i=0;i<pos.count;i++) {
    v.fromBufferAttribute(pos,i);v.y+=.45;v.normalize();
    normals[i*3]=v.x;normals[i*3+1]=v.y;normals[i*3+2]=v.z;
  }
  g.setAttribute('normal',new Float32BufferAttribute(normals,3));
  return g;
}

export class ProceduralTrees {
  readonly meshes:InstancedMesh[]=[];
  private ranges:{x:number;z:number;start:number[];end:number[]}[]=[];
  private matrices:Float32Array[]=[];
  private colors:Float32Array[]=[];
  constructor(trees:Tree[]) {
    if(!trees.length)return;
    const trunks=new InstancedMesh(new CylinderGeometry(.56,1,1,5,1,true),bark,trees.length*8);
    const leaves=new InstancedMesh(clusterGeometry(),foliage,trees.length*13);
    trunks.name='Procedural tree branches';leaves.name='Procedural leaf clusters';this.meshes=[trunks,leaves];
    const matrix=new Matrix4(),q=new Quaternion(),euler=new Euler(),up=new Vector3(0,1,0),scale=new Vector3(),tint=new Color();
    const counts=[0,0];
    for(const tree of trees) {
      const random=randomAt(tree.x,tree.z),h=tree.height*(.9+random()*.22),width=h*(.31+random()*.09),turn=random()*Math.PI*2;
      const start=[...counts],base=new Vector3(tree.x,.05,tree.z);
      const fork=new Vector3(tree.x+(random()-.5)*.22,h*(.34+random()*.06),tree.z+(random()-.5)*.22);
      const top=new Vector3(fork.x+(random()-.5)*.28,h*(.72+random()*.06),fork.z+(random()-.5)*.28);
      const hue=.28+random()*.06,saturation=.34+random()*.14,lightness=.32+random()*.08;
      const branch=(a:Vector3,b:Vector3,radius:number)=>{
        const delta=b.clone().sub(a);q.setFromUnitVectors(up,delta.clone().normalize());
        matrix.compose(a.clone().add(b).multiplyScalar(.5),q,scale.set(radius,delta.length(),radius));
        trunks.setMatrixAt(counts[0],matrix);trunks.setColorAt(counts[0]++,tint.setScalar(.74+random()*.28));
      };
      const cluster=(center:Vector3,sx:number,sy:number,sz:number)=>{
        euler.set((random()-.5)*.44,random()*Math.PI*2,(random()-.5)*.44);
        q.setFromEuler(euler);
        matrix.compose(center,q,scale.set(sx,sy,sz));
        leaves.setMatrixAt(counts[1],matrix);
        const sunLift=Math.max(-.05,Math.min(.07,(center.y/h-.65)*.28));
        leaves.setColorAt(counts[1]++,tint.setHSL(hue-sunLift*.18,saturation,lightness+sunLift+(random()-.5)*.04,SRGBColorSpace));
      };
      const thickness=h*(.029+random()*.007);
      branch(base,fork,thickness);branch(fork,top,thickness*.58);
      // Central overarching dome + heart cluster so the crown apex is always full and rounded.
      cluster(new Vector3(top.x,h*.84,top.z),h*.48,h*.40,h*.48);
      cluster(fork.clone().lerp(top,.60),h*.54,h*.42,h*.54);
      cluster(new Vector3(fork.x+(top.x-fork.x)*.3,h*.64,fork.z+(top.z-fork.z)*.3),h*.48,h*.38,h*.48);
      const branches=4+Math.floor(random()*2);
      for(let i=0;i<branches;i++) {
        const angle=turn+i*(Math.PI*2/branches)+(random()-.5)*.42,reach=width*(.74+random()*.28);
        const a=fork.clone().lerp(top,.08+(i%3)*.18+random()*.10);
        const tip=new Vector3(fork.x+Math.cos(angle)*reach,h*(.56+(i%2)*.08+random()*.12),fork.z+Math.sin(angle)*reach);
        branch(a,tip,thickness*(.34+random()*.10));
        const size=h*(.38+random()*.08);
        cluster(new Vector3(tip.x*.94+fork.x*.06,tip.y+h*.05,tip.z*.94+fork.z*.06),size*(1.04+random()*.14),size*(.84+random()*.14),size*(1.04+random()*.14));
        if(i<4) {
          const mid=a.clone().lerp(tip,.54);mid.y+=h*.08;
          cluster(mid,size*.92,size*.78,size*.92);
        }
      }
      this.ranges.push({x:tree.x,z:tree.z,start,end:[...counts]});
    }
    this.meshes.forEach((mesh,i)=>{
      mesh.count=counts[i];mesh.castShadow=true;mesh.receiveShadow=true;mesh.computeBoundingSphere();
      // Preserve immutable source transforms/tints for compaction when the camera moves.
      this.matrices.push(mesh.instanceMatrix.array.slice() as Float32Array);
      this.colors.push(mesh.instanceColor!.array.slice() as Float32Array);
    });
  }
  update(camera:Vector3,distance=1900) {
    const counts=[0,0];
    for(const tree of this.ranges)if((tree.x-camera.x)**2+(tree.z-camera.z)**2<distance*distance) {
      this.meshes.forEach((mesh,i)=>{
        const begin=tree.start[i],end=tree.end[i];
        mesh.instanceMatrix.array.set(this.matrices[i].subarray(begin*16,end*16),counts[i]*16);
        mesh.instanceColor!.array.set(this.colors[i].subarray(begin*3,end*3),counts[i]*3);
        counts[i]+=end-begin;
      });
    }
    this.meshes.forEach((mesh,i)=>{mesh.count=counts[i];mesh.instanceMatrix.needsUpdate=true;mesh.instanceColor!.needsUpdate=true;});
  }
  dispose(){for(const mesh of this.meshes){mesh.geometry.dispose();mesh.dispose();}}
}
