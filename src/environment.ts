import { BackSide, Color, DirectionalLight, Fog, Group, HemisphereLight, Mesh, MeshBasicNodeMaterial, Scene, SphereGeometry, SRGBColorSpace, Vector3, type WebGPURenderer } from 'three/webgpu';
import { mix, positionLocal, smoothstep, uniform } from 'three/tsl';
import { advanceHours, timeLighting, type SkyRGB } from './time-model';

function setRGB(color:Color,rgb:SkyRGB) {color.setRGB(rgb[0],rgb[1],rgb[2],SRGBColorSpace);}

// The sky follows the observer; its lighting remains in the city coordinate frame.
export class CityEnvironment {
  autoCycle=false;
  private currentHours=12;
  private nightValue=0;
  private root=new Group();
  private ambient=new HemisphereLight('#f5f5e5','#809786',1.7);
  private sun=new DirectionalLight('#fff3dd',4.4);
  private moon=new DirectionalLight('#9cb9df',0);
  private skyTop=uniform(new Color());
  private skyHorizon=uniform(new Color());
  private sunMaterial=new MeshBasicNodeMaterial({color:'#fff5dc',fog:false,toneMapped:false,depthWrite:false});
  private moonMaterial=new MeshBasicNodeMaterial({color:'#c8ddf5',fog:false,toneMapped:false,depthWrite:false});
  private skyMaterial=new MeshBasicNodeMaterial({side:BackSide,depthWrite:false,fog:false,toneMapped:false});
  private sky=new Mesh(new SphereGeometry(7000,32,16),this.skyMaterial);
  private sunDisc=new Mesh(new SphereGeometry(48,16,12),this.sunMaterial);
  private moonDisc=new Mesh(new SphereGeometry(28,16,12),this.moonMaterial);
  private sunDirection=new Vector3();
  private fog=new Fog('#c5dce0',3300,8100);
  private background=new Color();
  private originalBackground;
  private originalFog;
  private originalExposure:number;
  constructor(private scene:Scene,private renderer:WebGPURenderer) {
    this.originalBackground=scene.background;this.originalFog=scene.fog;this.originalExposure=renderer.toneMappingExposure;
    this.skyMaterial.colorNode=mix(this.skyHorizon,this.skyTop,smoothstep(0,.72,positionLocal.y.div(7000)));
    this.sky.renderOrder=-1000;this.sky.frustumCulled=false;
    this.sunDisc.renderOrder=-999;this.moonDisc.renderOrder=-999;
    this.root.name='city-environment';
    this.root.add(this.ambient,this.sun,this.moon,this.sky,this.sunDisc,this.moonDisc);
    scene.add(this.root);scene.fog=this.fog;scene.background=this.background;
    this.setTime(12);
  }
  get night(){return this.nightValue;}
  get hours(){return this.currentHours;}
  setTime(hours:number) {
    if(!Number.isFinite(hours))return;
    const light=timeLighting(hours);this.currentHours=light.hours;this.nightValue=light.night;
    setRGB(this.skyTop.value,light.zenith);setRGB(this.skyHorizon.value,light.horizon);
    setRGB(this.background,light.horizon);setRGB(this.fog.color,light.fog);
    setRGB(this.ambient.color,light.ambient);setRGB(this.ambient.groundColor,light.ground);
    setRGB(this.sun.color,light.sun);setRGB(this.sunMaterial.color,light.sun);
    this.ambient.intensity=light.ambientIntensity;this.sun.intensity=light.sunIntensity;this.moon.intensity=light.moonIntensity;
    const angle=(light.hours-6)*Math.PI/12;
    this.sunDirection.set(Math.cos(angle),Math.sin(angle)*.85,.34).normalize();
    this.sun.position.copy(this.sunDirection).multiplyScalar(4000);
    this.moon.position.copy(this.sunDirection).multiplyScalar(-4000);
    this.sunDisc.visible=light.solarElevation>-.08;this.moonDisc.visible=light.solarElevation<.1;
    this.renderer.toneMappingExposure=light.exposure;
  }
  update(dt:number,cameraPosition:Vector3) {
    if(this.autoCycle)this.setTime(advanceHours(this.currentHours,dt));
    this.sky.position.copy(cameraPosition);
    this.sunDisc.position.copy(this.sunDirection).multiplyScalar(6200).add(cameraPosition);
    this.moonDisc.position.copy(this.sunDirection).multiplyScalar(-6200).add(cameraPosition);
  }
  dispose() {
    this.scene.remove(this.root);
    for(const mesh of [this.sky,this.sunDisc,this.moonDisc])mesh.geometry.dispose();
    for(const material of [this.skyMaterial,this.sunMaterial,this.moonMaterial])material.dispose();
    this.sun.dispose();this.moon.dispose();
    if(this.scene.background===this.background)this.scene.background=this.originalBackground;
    if(this.scene.fog===this.fog)this.scene.fog=this.originalFog;
    this.renderer.toneMappingExposure=this.originalExposure;
  }
}
