import type { Point } from './types.ts';
// Traced against the user's 2026-10-24 satellite view; vertical sections use oblique photographs.
// West is the grandstand; the pointed performance apron faces east. All dimensions are approximate.
export const performanceApron:Point[][]=[[[-454,464],[-365,465],[-310,471],[-237,482],[-166,507],[-65,548],[-140,587],[-214,618],[-311,638],[-447,639],[-464,605],[-478,558],[-477,513],[-454,464]]];
export function seatPoint(t:number,row:number):Point {
 const front:Point=[-446.8-12*Math.sin(Math.PI*t),474.9+128.3*t];
 const back:Point=[-529-18*Math.sin(Math.PI*t),450+184*t];
 return [front[0]+(back[0]-front[0])*row,front[1]+(back[1]-front[1])*row];
}
export const seatingFootprint:Point[][]=[[
 ...Array.from({length:49},(_,i)=>seatPoint(i/48,0)),
 ...Array.from({length:49},(_,i)=>seatPoint(1-i/48,1)),seatPoint(0,0)
]];
export function canopyPoint(t:number,width:number):[number,number,number] {
 const rear:Point=[-529.7-18*Math.sin(Math.PI*t),446.9+186.5*t];
 const front:Point=[-446.8-12*Math.sin(Math.PI*t),474.9+128.3*t];
 const pleat=2.1*Math.pow(Math.sin(t*Math.PI*24),2)*Math.sin(Math.PI*width);
 return [rear[0]+(front[0]-rear[0])*width,44+4*width+pleat,rear[1]+(front[1]-rear[1])*width];
}
export const sailMasts:Point[]=[[-346,481],[-346,525],[-346,569],[-346,613]];

// South marina: centre lines from OSM 525314539/540/541, projected to local WGS84 metres.
// Deck widths, elevations and the two moored vessels are estimated from the supplied aerial photo.
export const marinaGangways=[
 {id:525314539,p:[[-403.376,660.948],[-400.785,692.830]] as Point[],w:3.5},
 {id:525314540,p:[[-373.829,659.112],[-372.109,690.214]] as Point[],w:3.5},
];
export const marinaPontoon={id:525314541,p:[[-414.218,693.387],[-400.785,692.830],[-386.340,691.828],[-372.109,690.214],[-358.656,689.491]] as Point[],w:4.2};
export const marinaTerrace:Point[][]=[[[-430,648],[-280,637],[-279,652],[-429,664],[-430,648]]];
export const marinaBoats=[{x:-406,z:704.5,length:28,width:7.2,yaw:Math.PI/2+.06},{x:-368,z:701.5,length:29,width:7.0,yaw:Math.PI/2+.06}];
// The rectangular quay apron is part of the source island boundary, not an extra floating lawn.
export const marinaQuayApron:Point[][]=[[[-373.829,659.112],[-372.897,674.863],[-271.961,666.403],[-271.879,657.453],[-373.829,659.112]]];

// OSM Qinglan Road 454892912 and connector 1372988688 meet bridge 4's source centre line.
export const westBridgeApproach:Point[]=[[-907.533,580.041],[-902.414,582.134],[-779.016,624.925],[-765.031,630.413],[-749.224,635.924],[-729.731,641.512],[-698.464,639.731],[-690.816,636.903],[-688.697,636.113]];
