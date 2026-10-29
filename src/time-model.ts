export type SkyRGB = readonly [number, number, number];
export interface TimeLighting {
  hours:number; night:number; solarElevation:number;
  zenith:SkyRGB; horizon:SkyRGB; fog:SkyRGB;
  sun:SkyRGB; ambient:SkyRGB; ground:SkyRGB;
  sunIntensity:number; ambientIntensity:number; moonIntensity:number; exposure:number;
}
const clamp=(v:number)=>Math.max(0,Math.min(1,v));
const smooth=(a:number,b:number,v:number)=>{const t=clamp((v-a)/(b-a));return t*t*(3-2*t);};
export function wrapHours(hours:number):number {return ((hours%24)+24)%24;}
export function advanceHours(hours:number,dt:number,daySeconds=480):number {return wrapHours(hours+Math.max(0,dt)*24/daySeconds);}
const rgb=(hex:number):SkyRGB=>[(hex>>16&255)/255,(hex>>8&255)/255,(hex&255)/255];
const keys = [
  [0,0x071022,0x18283f,0x152439],
  [5,0x132443,0x6e6e8c,0x5a6479],
  [6.5,0x7495bf,0xf4c19c,0xc7b7ae],
  [9,0x347fc4,0x9cc6e4,0xa8c9db],
  [12,0x2477c4,0x86bbe4,0x9cc4dc],
  [16,0x4f8bc0,0xd9d0bd,0xc9cfcb],
  [18,0x667baf,0xf2b184,0xcbb4a6],
  [19.3,0x293958,0x9d6e7e,0x665e73],
  [20.5,0x0b1730,0x263c57,0x223249],
  [24,0x071022,0x18283f,0x152439],
];
function blendRGB(x:SkyRGB,y:SkyRGB,t:number):SkyRGB {return [x[0]+(y[0]-x[0])*t,x[1]+(y[1]-x[1])*t,x[2]+(y[2]-x[2])*t];}
function blendHex(a:number,b:number,t:number):SkyRGB {return blendRGB(rgb(a),rgb(b),t);}
export function timeLighting(input:number):TimeLighting {
  const hours=wrapHours(input),solarElevation=Math.sin((hours-6)*Math.PI/12);
  const daylight=smooth(-.16,.30,solarElevation),night=1-daylight;
  const golden=1-smooth(0,.48,Math.abs(solarElevation));
  const warm=golden*Math.min(1,daylight*3);
  const i=keys.findIndex((k,j)=>j<keys.length-1&&hours>=k[0]&&hours<keys[j+1][0]);
  const a=keys[Math.max(0,i)],b=keys[Math.max(0,i)+1],t=smooth(a[0],b[0],hours);
  return {
    hours,night,solarElevation,
    zenith:blendHex(a[1],b[1],t),horizon:blendHex(a[2],b[2],t),fog:blendHex(a[3],b[3],t),
    sun:blendHex(0xfff3dd,0xffb578,golden),ambient:blendRGB(blendHex(0x8fafd9,0xf5f5e5,daylight),rgb(0xffc095),warm),ground:blendRGB(blendHex(0x17212c,0x809786,daylight),rgb(0xb69f85),warm*.55),
    sunIntensity:4.4*smooth(-.06,.42,solarElevation),ambientIntensity:.30+1.40*daylight,
    moonIntensity:.32*night,exposure:.95+.05*daylight,
  };
}
