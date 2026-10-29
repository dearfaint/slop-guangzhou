"""Build only Pearl River Park detail from the official OSM API snapshot.
Footprints and routes are geographic records; heights/styles and planting are visual estimates.
Run with a Python environment containing shapely. Does not rewrite city tiles.
"""
import json, math, pathlib, xml.etree.ElementTree as ET
from shapely.geometry import Polygon, LineString, Point, box
from shapely.ops import unary_union, polygonize, substring
import numpy as np
ROOT=pathlib.Path(__file__).resolve().parents[1]
from static_data import write_static_data  # noqa: E402  (scripts/ is on sys.path when run directly)
xml=ET.parse(ROOT/'data/raw/pearl-park-osm.xml').getroot()
def tags(e):return {t.get('k'):t.get('v') for t in e.findall('tag')}
def project(x,y):return [(x-113.322)*math.pi/180*6378137*math.cos(math.radians(23.119)),-(y-23.119)*math.pi/180*6378137]
nodes={e.get('id'):project(float(e.get('lon')),float(e.get('lat'))) for e in xml.findall('node')}
ways={e.get('id'):e for e in xml.findall('way')}
def coords(e):return [nodes[n.get('ref')] for n in e.findall('nd') if n.get('ref') in nodes]
def poly(e):return Polygon(coords(e)).buffer(0)
boundary=poly(ways['80912583'])
def parts(g,typ):
 if g.is_empty:return []
 if g.geom_type==typ:return [g]
 return [v for c in getattr(g,'geoms',[]) for v in parts(c,typ)]
def rings(p):return [[[round(x,2),round(z,2)] for x,z in ring.coords] for ring in [p.exterior,*p.interiors]]
waters=[]
for e in xml.findall('relation'):
 t=tags(e)
 if t.get('natural')!='water':continue
 def joined(role):
  lines=[LineString(coords(ways[m.get('ref')])) for m in e.findall('member') if m.get('type')=='way' and m.get('role')==role and m.get('ref') in ways]
  return unary_union(list(polygonize(unary_union(lines)))) if lines else Polygon()
 g=joined('outer').difference(joined('inner')).intersection(boundary)
 for p in parts(g,'Polygon'):waters.append(dict(id='osm/relation/'+e.get('id'),name=t.get('name','水池'),p=rings(p.simplify(.15))))
for id,e in ways.items():
 t=tags(e);ps=coords(e)
 if len(ps)<2:continue
 if t.get('natural')=='water' and ps[0]==ps[-1]:g=poly(e)
 elif t.get('waterway') in ['stream','river']:
  g=LineString(ps).buffer(float(t.get('width',5))/2,cap_style=2,join_style=1)
 else:continue
 for p in parts(g.intersection(boundary.buffer(35) if t.get('waterway') else boundary),'Polygon'):waters.append(dict(id='osm/way/'+id,name=t.get('name','溪涧'),p=rings(p.simplify(.15))))
# Approximate the unmapped northern creek from the official park plan, registered by four OSM gates.
# These reviewed-plan coordinates are not survey data or OSM records.
pixels=np.array([[454,350,1],[562,97,1],[735,151,1],[195,195,1]])
world=np.array([nodes[k] for k in ['4402343568','4402362162','4402362280','5141107217']])
affine=np.linalg.lstsq(pixels,world,rcond=None)[0]
creek=[list(np.array([x,y,1])@affine) for x,y in [(467,82),(458,94),(465,105),(461,117),(469,126),(464,139),(470,149),(460,160),(454,176)]]
lake=Polygon(waters[0]['p'][0],waters[0]['p'][1:]);end=lake.exterior.interpolate(lake.exterior.project(Point(creek[-1])));creek.append([end.x,end.y])
for p in parts(LineString(creek).buffer(1.6,join_style=1).intersection(boundary),'Polygon'):waters.append(dict(id='reviewed-plan/northern-creek',name='北部溪涧（导览图描绘）',p=rings(p)))
water=unary_union([Polygon(w['p'][0],w['p'][1:]) for w in waters])
roads=[];buildings=[];gardens=[]
for id,e in ways.items():
 t=tags(e);ps=coords(e)
 if len(ps)<2:continue
 if t.get('highway') in ['footway','path','pedestrian','steps','cycleway']:
  for i,line in enumerate(parts((LineString(ps) if t.get('bridge')=='yes' and LineString(ps).intersects(boundary.buffer(30)) else LineString(ps).intersection(boundary.buffer(3))),'LineString')):
   if line.length<.5:continue
   roads.append(dict(id='pearl-park/way/'+id+'/'+str(i),sourceId='osm/way/'+id,p=[[round(x,2),round(z,2)] for x,z in line.coords],w=float(t.get('width',2 if t['highway']=='steps' else 3)),kind=t['highway'],name=t.get('name','园路'),bridge=t.get('bridge')=='yes',tunnel=False,layer=0))
 if t.get('highway') in ['primary','secondary','tertiary','secondary_link']:
  # Complete only the missing eastern edge beyond the old city clip, retaining original city roads.
  fringe=LineString(ps).intersection(boundary.buffer(42)).intersection(box(project(113.337,23.119)[0],-700,1660,-140))
  for j,line in enumerate(parts(fringe,'LineString')):
   if line.length<1:continue
   roads.append(dict(id='pearl-park/edge/'+id+'/'+str(j),sourceId='osm/way/'+id,p=[[round(x,2),round(z,2)] for x,z in line.coords],w=float(t.get('lanes',2))*3.2+1,kind=t['highway'],name=t.get('name','外围道路'),bridge=False,tunnel=False,layer=0,oneway=-1 if t.get('oneway')=='-1' else 1 if t.get('oneway')=='yes' else 0))
 if t.get('building') and len(ps)>3 and boundary.covers(poly(e).representative_point()):
  style='pavilion' if t.get('amenity')=='shelter' else 'service'
  if id=='1016781059':style='yutang'
  if id=='1016781058':style='stage'
  if id=='1144924594':style='bookhouse'
  if id=='1144924599':style='baozhu'
  height={'pavilion':4,'yutang':4.8,'stage':4.5,'service':4.2,'bookhouse':5,'baozhu':8.6}[style]
  buildings.append(dict(id='osm/way/'+id,name=t.get('name',{'baozhu':'抱珠楼（导览图对应）','pavilion':'休憩亭','service':'服务建筑'}.get(style,style)),p=rings(poly(e)),style=style,h=height))
 if t.get('leisure')=='garden' and len(ps)>3 and boundary.covers(poly(e).representative_point()):gardens.append(dict(id='osm/way/'+id,name=t.get('name','花园'),p=rings(poly(e))))
pois=[]
for e in xml.findall('node'):
 t=tags(e);p=nodes[e.get('id')]
 if not t or not boundary.buffer(3).covers(Point(p)):continue
 if t.get('entrance') or t.get('amenity') in ['bench','shelter','toilets','restaurant','cafe','drinking_water'] or t.get('tourism'):
  pois.append(dict(id='osm/node/'+e.get('id'),name=t.get('name','兴盛门' if e.get('id')=='5141107217' else ''),kind='gate' if t.get('entrance') else t.get('amenity',t.get('tourism','')),p=[round(v,2) for v in p]))
# A path crossing mapped water gets a short inferred bridge rather than a walk-through lake.
for road in list(roads):
 if road['bridge'] or road['kind'] not in ['footway','path','pedestrian','steps','cycleway']:continue
 line=LineString(road['p'])
 for i,crossing in enumerate(parts(line.intersection(water),'LineString')):
  if crossing.length<.8 or crossing.length>30:continue
  ds=sorted([line.project(Point(crossing.coords[0])),line.project(Point(crossing.coords[-1]))])
  bridge=substring(line,max(0,ds[0]-5),min(line.length,ds[1]+5))
  if bridge.geom_type=='LineString':roads.append(dict(road,id=road['id']+'/crossing/'+str(i),p=[[round(x,2),round(z,2)] for x,z in bridge.coords],bridge=True,name='园内跨水步桥（路线交点推定）'))
for w in waters:
 if w['id'].startswith('reviewed-plan'):
  for b in buildings:assert Polygon(w['p'][0],w['p'][1:]).intersection(Polygon(b['p'][0],b['p'][1:])).area<1, 'Reviewed creek overlaps a source building'
paths=unary_union([LineString(r['p']).buffer(r['w']/2+2.8) for r in roads])
blocked=unary_union([water.buffer(3),paths,*[Polygon(b['p'][0],b['p'][1:]).buffer(3) for b in buildings]])
# Keep the mapped west lawn open; reserve the north-central hill and east wooded gardens for trees.
trees=[]
for x in range(math.ceil(boundary.bounds[0]/24)*24,int(boundary.bounds[2]),24):
 for z in range(math.ceil(boundary.bounds[1]/24)*24,int(boundary.bounds[3]),24):
  seed=math.sin(x*12.9898+z*78.233)*43758.5453;f=seed-math.floor(seed);p=Point(x+(f-.5)*5,z+(f*7%1-.5)*5)
  lawn=((p.x-985)/115)**2+((p.y+410)/100)**2<1
  if not boundary.buffer(-5).covers(p) or blocked.covers(p) or lawn:continue
  trees.append(dict(x=round(p.x,2),z=round(p.y,2),height=round(10+f*7,2)))
# Remove only the old surfaces/volumes replaced by this park module.
cuts=[];hidden=[];road_ids=set(r['sourceId'] for r in roads if r['kind'] in ['footway','path','pedestrian','steps','cycleway'])
for tile in (ROOT/'public/data').glob('*.json'):
 if tile.stem in ['manifest','landmarks']:continue
 d=json.loads(tile.read_text())
 for a in d.get('areas',[]):
  if a['kind']!='park':continue
  g=Polygon(a['p'][0],a['p'][1:])
  if g.intersection(boundary.union(water)).area<.1:continue
  cuts.append(dict(source=a['p'],outside=[rings(p) for p in parts(g.difference(boundary.union(water)),'Polygon')]))
 for b in d.get('buildings',[]):
  g=Polygon(b['p'][0],b['p'][1:])
  if g.area and boundary.intersection(g).area/g.area>.7:hidden.append(b['id'])
ground=[]
for x in range(math.floor(boundary.bounds[0]/18)*18,int(boundary.bounds[2])+18,18):
 for z in range(math.floor(boundary.bounds[1]/18)*18,int(boundary.bounds[3])+18,18):
  ground.extend(rings(p) for p in parts(boundary.difference(water).intersection(box(x,z,x+18,z+18)),'Polygon') if p.area>.1)
value=dict(ground=ground,boundary=rings(boundary),waters=waters,roads=roads,buildings=buildings,gardens=gardens,pois=pois,trees=trees,cuts=cuts,hiddenBuildings=sorted(set(hidden)),roadIds=sorted(road_ids))
data_file=write_static_data(ROOT,'pearl-park-data',value,comment='Generated by scripts/prepare-pearl-park.py from OSM WGS84. Heights and architecture are estimates.',export='pearlParkData',type_='{ground:Point[][][];boundary:Point[][];waters:{id:string;name:string;p:Point[][]}[];roads:(Road&{sourceId:string})[];buildings:{id:string;name:string;p:Point[][];style:string;h:number}[];gardens:{id:string;name:string;p:Point[][]}[];pois:{id:string;name:string;kind:string;p:Point}[];trees:{x:number;z:number;height:number}[];cuts:{source:Point[][];outside:Point[][][]}[];hiddenBuildings:string[];roadIds:string[]}',type_imports="import type {Point,Road} from './types.ts';\n")
print({k:len(v) for k,v in value.items()},'bytes',data_file.stat().st_size)
