export interface VehicleBody {x:number;z:number;y:number;heading:number;length:number;width:number;height:number}
// Horizontal oriented boxes plus vertical intervals: bridges and tunnels stay separate.
export function vehiclesOverlap(a:VehicleBody,b:VehicleBody,margin=.08){
 if(a.y+a.height<=b.y||b.y+b.height<=a.y)return false;
 const dx=b.x-a.x,dz=b.z-a.z,reach=(a.length+a.width+b.length+b.width)/2+margin;
 if(Math.abs(dx)>reach||Math.abs(dz)>reach)return false;
 const af=[Math.sin(a.heading),Math.cos(a.heading)],ar=[af[1],-af[0]],bf=[Math.sin(b.heading),Math.cos(b.heading)],br=[bf[1],-bf[0]];
 if(Math.hypot(dx,dz)>(a.length+a.width+b.length+b.width)/2+margin)return false;
 for(const [x,z] of [af,ar,bf,br]){
  const ra=Math.abs(x*af[0]+z*af[1])*a.length/2+Math.abs(x*ar[0]+z*ar[1])*a.width/2;
  const rb=Math.abs(x*bf[0]+z*bf[1])*b.length/2+Math.abs(x*br[0]+z*br[1])*b.width/2;
  if(Math.abs(dx*x+dz*z)>=ra+rb+margin)return false;
 }
 return true;
}
