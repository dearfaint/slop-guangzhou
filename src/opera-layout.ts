import type {Point} from './types.ts';
import {inPolygon} from './south-axis-layout.ts';

// The two lobes follow the mapped building footprint; roof and landscape heights are photo estimates.
export const operaMain:Point[]=[[-591.7,69.3],[-538.7,66.7],[-492.3,74.3],[-475.6,113.8],[-495.2,150.7],[-517.2,204.7],[-568.2,178.5],[-595.5,141]];
export const operaStudio:Point[]=[[-464.6,82.4],[-435.9,79.6],[-412,102.5],[-405.4,130.3],[-422.9,160.6],[-468,171.9],[-481.8,157.4],[-473.7,100.2]];
export const operaPool:Point[]=[[-380.1,166.7],[-366.5,158.4],[-364.8,143.3],[-367.8,137.4],[-393.2,135.4],[-405.4,130.3],[-422.9,160.6],[-468,171.9],[-452.6,179.6],[-437.3,183.3],[-405.7,178.2]];
export const operaPlaza:Point[]=[[-605,78],[-591,64],[-492,78],[-466,85],[-435,82],[-403,100],[-367,120],[-361,179],[-372,234],[-508,233],[-609,218],[-613,174],[-603,145]];
export const operaLawn:Point[]=[[-507,211],[-468,208],[-373,211],[-380,234],[-464,231],[-533,225]];
export const operaEastLawn:Point[]=[[-399,105],[-373,96],[-367,116],[-369,128],[-391,123]];
export const operaEntry:Point[]=[[-511,210],[-488,192],[-475,211]];
export const operaEntryHeight=(z:number)=>.42-2.4*Math.max(0,Math.min(1,(211-z)/19));
export const operaLawnHeight=(z:number)=>.42+1.2*Math.max(0,Math.min(1,(234-z)/24));
export function operaGroundHeight(x:number,z:number){
 if(!inPolygon(x,z,[operaPlaza]))return undefined;
 if(inPolygon(x,z,[operaEntry]))return operaEntryHeight(z);
 if(inPolygon(x,z,[operaLawn]))return operaLawnHeight(z);
 if(x>=-466&&x<=-370&&z>=185&&z<=210)return z<197?.42+Math.floor((z-185)/1)*.1:1.62;
 return .42;
}
