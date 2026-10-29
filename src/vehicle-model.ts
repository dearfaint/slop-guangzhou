// Generic metre-scale vehicle classes, not replicas of a particular manufacturer.
export const vehicleSpecs=[
 {name:'轿车',length:4.4,width:1.9,axle:1.4,wheel:.66,height:1.4,speed:11},
 {name:'出租车',length:4.4,width:1.9,axle:1.4,wheel:.66,height:1.4,speed:11},
 {name:'公交车',length:12,width:2.6,axle:3.6,wheel:.96,height:3.1,speed:7},
 {name:'警车',length:4.4,width:1.9,axle:1.4,wheel:.66,height:1.4,speed:11},
 {name:'SUV',length:4.8,width:1.98,axle:1.5,wheel:.78,height:1.75,speed:10},
 {name:'面包车',length:5.2,width:2.05,axle:1.65,wheel:.72,height:2.25,speed:9},
 {name:'厢式货车',length:7.4,width:2.45,axle:2.35,wheel:.94,height:3.15,speed:7},
 {name:'救护车',length:5.8,width:2.18,axle:1.85,wheel:.78,height:2.55,speed:9},
 {name:'消防车',length:8,width:2.5,axle:2.5,wheel:1.02,height:3.1,speed:7},
 {name:'皮卡',length:5.4,width:2.02,axle:1.7,wheel:.82,height:1.8,speed:9},
] as const;
// Keep ordinary traffic dominant, but guarantee every class in a full city population.
const fleet=[0,1,2,3,4,5,6,7,8,9,0,0,1,4,0,5,0,2,4,0,6,0,9,1];
export const vehicleType=(index:number)=>fleet[index%fleet.length];
export const sirenLevel=(distance:number)=>distance>=220?0:.16*Math.pow(1-distance/220,2)/(1+Math.pow(distance/35,2));

// Slop New York: 200 cars (20% taxis, occasional police, SUVs/sedans) plus 12 buses.
export const referenceVehicleType=(index:number)=>index>=200?2:index%40===6?3:index%5===0?1:index%2===0?4:0;
