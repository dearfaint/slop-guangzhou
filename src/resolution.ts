// Dynamic render resolution: fill-rate (pixels × shading) is the measured bottleneck, so
// trade sharpness for frame rate only while the frame rate is actually low.
export const MAX_PIXEL_RATIO=1.25,MIN_PIXEL_RATIO=.75,PIXEL_RATIO_STEP=.125;
const LOW_FPS=45,HIGH_FPS=57,LOW_SAMPLES=2,HIGH_SAMPLES=4,RETRY_MS=30000;

export class DynamicResolution {
  readonly max:number;readonly min:number;
  ratio:number;
  private low=0;private high=0;
  private ceiling=Infinity;private ceilingTime=0;
  constructor(devicePixelRatio:number){
    this.max=Math.min(devicePixelRatio,MAX_PIXEL_RATIO);this.min=Math.min(this.max,MIN_PIXEL_RATIO);this.ratio=this.max;
  }
  /** Feed one averaged FPS sample; returns the new pixel ratio when it changes. */
  sample(fps:number,now:number):number|null{
    if(now-this.ceilingTime>RETRY_MS)this.ceiling=Infinity;
    this.low=fps<LOW_FPS?this.low+1:0;this.high=fps>HIGH_FPS?this.high+1:0;
    if(this.low>=LOW_SAMPLES&&this.ratio>this.min){
      // Remember the level that was too slow so recovery does not bounce straight back to it.
      this.ceiling=this.ratio-PIXEL_RATIO_STEP;this.ceilingTime=now;
      return this.set(this.ratio-PIXEL_RATIO_STEP);
    }
    if(this.high>=HIGH_SAMPLES&&this.ratio<Math.min(this.max,this.ceiling))return this.set(this.ratio+PIXEL_RATIO_STEP);
    return null;
  }
  private set(value:number){
    this.ratio=Math.max(this.min,Math.min(this.max,Math.round(value/PIXEL_RATIO_STEP)*PIXEL_RATIO_STEP));this.low=0;this.high=0;return this.ratio;
  }
}
