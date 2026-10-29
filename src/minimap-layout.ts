import type { Point } from './types.ts';
export function minimapDestination(x:number,y:number,width:number,height:number):Point {
 return [Math.max(-1660,Math.min(1650,(x/width*440-220)*9)),Math.max(-1500,Math.min(1760,(y/height*440-220)*9))];
}

export interface MapView {center:Point;scale:number;width:number;height:number}
export function clampMapPoint(point:Point):Point {
 return [Math.max(-1660,Math.min(1650,point[0])),Math.max(-1500,Math.min(1760,point[1]))];
}
export function mapScreen(point:Point,view:MapView):Point {
 return [view.width/2+(point[0]-view.center[0])*view.scale,view.height/2+(point[1]-view.center[1])*view.scale];
}
export function mapPoint(x:number,y:number,view:MapView):Point {
 return [view.center[0]+(x-view.width/2)/view.scale,view.center[1]+(y-view.height/2)/view.scale];
}
export function mapDestination(x:number,y:number,view:MapView):Point {
 return clampMapPoint(mapPoint(x,y,view));
}

// One uniform scale fills the atlas; clamp panning to the downloaded geographic bounds.
export function expandedMapScale(width:number,height:number){return Math.max(width/3310,height/3260);}
export function clampMapCenter(point:Point,view:MapView):Point {
 const halfX=view.width/(2*view.scale),halfZ=view.height/(2*view.scale);
 return [halfX>=1655?-5:Math.max(-1660+halfX,Math.min(1650-halfX,point[0])),halfZ>=1630?130:Math.max(-1500+halfZ,Math.min(1760-halfZ,point[1]))];
}
