import { MeshStandardNodeMaterial, RenderTarget, HalfFloatType, PerspectiveCamera, Vector2, Vector3, Light, Frustum, Matrix4, Box3, type LightShadow, type Scene, type WebGPURenderer } from 'three/webgpu';
import { texture, screenUV, vec2, sin, positionWorld, time, mix, float } from 'three/tsl';
import { cityNight } from './lighting-state.ts';

// Share a single small reflection image across all mapped water tiles.
const target=new RenderTarget(1,1,{type:HalfFloatType});
const wave=sin(positionWorld.z.mul(1.7).add(time.mul(.8))).mul(sin(positionWorld.x.mul(.11).sub(time.mul(.35))));
const reflected=texture(target.texture,screenUV.flipX().add(vec2(wave.mul(.0025),sin(positionWorld.z.mul(3.8).sub(time)).mul(.0007))));
export const riverWaterMaterial=new MeshStandardNodeMaterial({name:'Pearl River · rippled architectural reflections',color:'#33463e',roughness:.34,metalness:.2});
riverWaterMaterial.emissiveNode=reflected.rgb.mul(mix(float(.08),float(.62),cityNight)).mul(wave.mul(.18).add(.82));

export class RiverReflections {
  private mirror=new PerspectiveCamera();
  private size=new Vector2();
  private look=new Vector3();
  private frustum=new Frustum();
  private projection=new Matrix4();
  private riverBounds=new Box3(new Vector3(-1800,.1,300),new Vector3(1600,.1,1800));
  private last=-Infinity;
  constructor(){this.mirror.layers.set(1);}
  update(renderer:WebGPURenderer,scene:Scene,camera:PerspectiveCamera,now:number){
    if(now-this.last<1000/15)return;
    camera.updateMatrixWorld();
    this.frustum.setFromProjectionMatrix(this.projection.multiplyMatrices(camera.projectionMatrix,camera.matrixWorldInverse),camera.coordinateSystem,camera.reversedDepth);
    if(!this.frustum.intersectsBox(this.riverBounds))return;
    this.last=now;
    renderer.getDrawingBufferSize(this.size);
    const scale=Math.min(.3,640/Math.max(this.size.x,this.size.y)),w=Math.max(1,Math.round(this.size.x*scale)),h=Math.max(1,Math.round(this.size.y*scale));
    if(target.width!==w||target.height!==h)target.setSize(w,h);
    camera.updateMatrixWorld();camera.getWorldDirection(this.look).add(camera.position);this.look.y=.2-this.look.y;
    this.mirror.position.copy(camera.position);this.mirror.position.y=.2-camera.position.y;
    this.mirror.up.copy(camera.up);this.mirror.up.y*=-1;this.mirror.lookAt(this.look);
    this.mirror.fov=camera.fov;this.mirror.aspect=camera.aspect;this.mirror.near=camera.near;this.mirror.far=camera.far;this.mirror.updateProjectionMatrix();
    // Reflect only above-water architecture, lights and vessels. No oblique near-plane
    // rewrite is needed, keeping the main renderer's reversed depth buffer intact.
    const shadows:{shadow:LightShadow;autoUpdate:boolean}[]=[];
    scene.traverse(o=>{if(o instanceof Light){o.layers.enable(1);if('shadow' in o&&o.shadow){const shadow=o.shadow as LightShadow;shadows.push({shadow,autoUpdate:shadow.autoUpdate});shadow.autoUpdate=false;}}});
    const oldTarget=renderer.getRenderTarget(),oldAutoClear=renderer.autoClear;
    try{
      renderer.autoClear=true;renderer.setRenderTarget(target);renderer.render(scene,this.mirror);
    }finally{renderer.setRenderTarget(oldTarget);renderer.autoClear=oldAutoClear;for(const state of shadows)state.shadow.autoUpdate=state.autoUpdate;}
  }
}
