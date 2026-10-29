export type Point = [number, number];
export interface Building { id: string; p: Point[][]; h: number; base: number; hs: string; source: string; name: string; kind: string; landmark?: 'ctf'|'ifc'|'opera'|'museum'|'library'|'canton'|'pearl'|'yingkai'|'leatop'|'fuli'|'ifp'|'kaihua'|'ritz'|'gtspring'|'gtsummer'|'gtautumn'|'gtwinterNorth'|'gtwinterSouth'|'gtwinterWest'|'youth'; landmarkPrimary?: boolean }
export interface Road { id: string; p: Point[]; w: number; kind: string; name: string; bridge: boolean; tunnel: boolean; layer?: number; indoor?: boolean; oneway?: number; widthSource?: string; tags?: Record<string,string>; nodeIds?: (number|null)[]; sourceVersion?:number; sourceTimestamp?:string; nodeTags?: Record<string,Record<string,string>> }
export interface Area { p: Point[][]; kind: 'water' | 'park' | 'green' | 'campus' | 'pitch' | 'track' | 'pool'; name: string; sport?: string }
export interface TreeRow { id: string; p: Point[]; source: string; spacing: number; height: number; heightSource: string }
export interface TileData { buildings: Building[]; roads: Road[]; areas: Area[]; treeRows?: TreeRow[] }
export interface TileEntry { id: string; center: Point; bounds: number[]; bytes: number; buildings: number; roads: number }
export interface Manifest { version: number; origin: Point; bbox: number[]; tileSize: number; tiles: TileEntry[]; stats: Record<string, number>; sources: Record<string, string>; generated: string }
export interface Landmark { name: string; en: string; lon: number; lat: number; h: number; description: string }
