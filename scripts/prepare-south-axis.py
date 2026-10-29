"""Build the south-axis detail from the bounded OSM snapshot and reviewed satellite plan.
XY follows WGS84 OSM; planting, paving and vertical dimensions are visual estimates.
No commercial map tiles or credentials are copied into the application.
"""
import json, math, pathlib
from shapely.geometry import Polygon, LineString, Point, box
from shapely.ops import unary_union
ROOT=pathlib.Path(__file__).resolve().parents[1]
from static_data import write_static_data  # noqa: E402  (scripts/ is on sys.path when run directly)
raw=json.loads((ROOT/'data/raw/osm.json').read_text())
ways={e['id']:e for e in raw['elements'] if e['type']=='way'}
def project(lon,lat):return [(lon-113.322)*math.pi/180*6378137*math.cos(math.radians(23.119)),-(lat-23.119)*math.pi/180*6378137]
def coords(e):return [project(p['lon'],p['lat']) for p in e['geometry'] if p]
def poly(points):return Polygon([project(*p) for p in points])
def polygons(g):
 if g.is_empty:return []
 if g.geom_type=='Polygon':return [g]
 return [p for c in getattr(g,'geoms',[]) for p in polygons(c)]
def rings(g):return [[[round(x,3),round(z,3)] for x,z in ring.coords] for ring in [g.exterior,*g.interiors]]
def lines(g):
 if g.is_empty:return []
 if g.geom_type=='LineString':return [g]
 return [p for c in getattr(g,'geoms',[]) for p in lines(c)]
# Actual southern outline of Huacheng Square and the full scalloped bridge polygon.
plaza=Polygon(coords(ways[243319596])).intersection(box(*[project(113.3177,23.11765)[0],project(113.3177,23.11765)[1],project(113.3203,23.11559)[0],project(113.3203,23.11559)[1]]))
bridge=Polygon(coords(ways[877475630]))
# Imagery: the square ends at the dark asphalt Y (promenade 456278900 curving into the bridge); south of
# it are lawn, trees and the riverside walk. Keep the paved square north of the promenade only.
_u=coords(ways[456278900]);_below=Polygon([*_u,(_u[-1][0],max(z for _,z in _u)+40),(_u[0][0],max(z for _,z in _u)+40)]).buffer(0)
plaza=polygons(plaza.difference(_below.difference(LineString(_u).buffer(4.5))))
plaza=max(plaza,key=lambda p:p.area)
ramp_ids=[248282332,759851919,624728716,248284668,80912591,923953845,449070492,102596669,444149841,27318117]
portal_first={248282332,248284668,80912591,102596669,27318117}
mainline_ids={80912591,923953845,449070492,102596669}
excluded=set(ramp_ids+[184738715,496397369,617780114,1062033385])
root=ROOT/'public/data';manifest=json.loads((root/'manifest.json').read_text())
tiles=[json.loads((root/(t['id']+'.json')).read_text()) for t in manifest['tiles']]
# Keep Y-bifurcation / merge gore zones flush with adjacent surface frontage roads;
# excavate the open trench only after the ramp carriageway separates from surface lanes.
frontage_ids={444422638,624720031,248284670,458696117,458696110,737631342,444149844,188246593,1140707305}
frontage_carriageways=unary_union([LineString(coords(ways[wid])).buffer(3.5,cap_style=1,join_style=2) for wid in frontage_ids])
ramps=[]
for wid in ramp_ids:
 p=coords(ways[wid]);portal=0 if wid in portal_first else len(p)-1
 depth=11.15 if wid in mainline_ids else 6.0
 exp=1.12 if wid==27318117 else 1.25
 # Longitudinal subdivision permits a continuous slope and lane paint in 3D.
 line=LineString(p);samples=[line.interpolate(min(i*3,line.length)) for i in range(math.ceil(line.length/3)+1)]
 points=[[q.x,q.y] for q in samples];h=[]
 ground=Point(p[-1] if portal==0 else p[0])
 # Fraction of the length, from the ground end, that overlaps frontage carriageways near that end.
 near=[line.project(q)/line.length for q in samples if frontage_carriageways.contains(q) and q.distance(ground)<40]
 hold=0 if not near else (max(1-f for f in near) if portal==0 else max(near))
 # Keep the steepest grade under 6.8%: flatten the curve first, then shorten the hold if needed.
 if hold>0:
  if depth/(line.length*(1-hold))>.068: hold=max(0,1-depth/(.068*line.length))
  exp=min(exp,max(1,.068*line.length*(1-hold)/depth))
 for i in range(len(points)):
  t=min(i*3,line.length)/line.length;distance=t if portal==0 else 1-t
  # Stay at grade while the ramp still shares the carriageway with a frontage road (merges and
  # junctions such as service road 1140707305), then descend over the remaining length.
  u=max(0,(1-distance-hold)/(1-hold)) if hold<1 else 0
  h.append(round(.35-depth*u**exp,3))
 ramps.append(dict(id=f'osm/way/{wid}/0',p=[[round(x,3),round(z,3)] for x,z in points],y=h,w=6.4,source=f'OSM/way/{wid}',heightSource='estimate:mainline-layer-2' if wid in mainline_ids else 'estimate:6m-ramp'))
# Pair the eight Linjiang carriageways; the two Musical Fountain side ramps are single-carriageway cuttings.
portal_zones=unary_union([Point(r['p'][0 if int(r['id'].split('/')[2]) in portal_first else -1]).buffer(12) for r in ramps])
gore_zones=unary_union([Point(r['p'][-1 if int(r['id'].split('/')[2]) in portal_first else 0]).buffer(68) for r in ramps]).difference(portal_zones)
frontage_gore=frontage_carriageways.intersection(gore_zones)
trenches=[]
for start in range(0,8,2):
 pair=ramps[start:start+2]
 trench=unary_union([LineString(r['p']).buffer(5.5,cap_style=2,join_style=1) for r in pair]).difference(frontage_gore)
 trenches+=polygons(trench)
for single in ramps[8:]:
 trench=LineString(single['p']).buffer(4.9,cap_style=2,join_style=1).difference(frontage_gore)
 trenches+=polygons(trench)
# Adjacent eastern approaches touch; overlapping Shape holes would fill parts back in.
trenches=[p for p in polygons(unary_union(trenches)) if p.area>50]
# Green tongues seen on the satellite image; fitted inside the source plaza outline.
bed_specs=[
 [(113.31848,23.11765),(113.31878,23.11765),(113.31884,23.11678),(113.31876,23.11659),(113.31857,23.11654),(113.31848,23.1170)],
 [(113.31943,23.11765),(113.31975,23.11765),(113.31972,23.11668),(113.31960,23.11648),(113.31943,23.11660)],
 [(113.31816,23.11631),(113.31850,23.11629),(113.31867,23.11604),(113.31849,23.11609)],
 [(113.31965,23.11622),(113.31994,23.11619),(113.32002,23.11608),(113.31977,23.11600)],
]
beds=[p for spec in bed_specs for p in polygons(poly(spec).intersection(plaza))]
# South Plaza circular rotunda opens directly down to the -5.65 m underground roundabout roadway;
# North circular skylight (OSM way/554611954) sits inside the northern underground roundabout (way/603486756).
court=Point(project(113.31912,23.11633))
court_opening=court.buffer(16,quad_segs=64);court_excavation=court.buffer(19.8,quad_segs=64)
north_court=Point(-291.6,-12.2)
north_opening=north_court.buffer(14.2,quad_segs=64);north_surface=north_court.buffer(15.4,quad_segs=64);north_underground=north_court.buffer(23.2,quad_segs=64)
def ellipse_poly(cx,cz,rx,rz,tilt,segs=48):
 c,s=math.cos(tilt),math.sin(tilt)
 return Polygon([(cx+math.cos(i/segs*math.pi*2)*rx*c-math.sin(i/segs*math.pi*2)*rz*s,cz+math.cos(i/segs*math.pi*2)*rx*s+math.sin(i/segs*math.pi*2)*rz*c) for i in range(segs)])
mall_cutouts=unary_union([
 box(-306.0,-280.88,-271.4,-185.14),
 box(-307.6,-113.0,-274.9,-60.3),
 box(-303.0,-323.0,-275.0,-309.5),
 ellipse_poly(-350.4,-231.5,14.8,11.2,-.16),
 ellipse_poly(-221.6,-231.0,15.2,11.4,.16),
])
mask=unary_union([plaza,bridge,*trenches,north_surface])
park_mask=unary_union([mask,mall_cutouts])
area_replacements=[];road_replacements=[]
for t in tiles:
 for a in t['areas']:
  if a['kind']!='park':continue
  p=Polygon(a['p'][0],a['p'][1:])
  if p.intersects(park_mask):
   key=f"{a['p'][0][0][0]:g}:{a['p'][0][0][1]:g}:{a['name']}"
   area_replacements.append(dict(key=key,p=[rings(q) for q in polygons(p.difference(park_mask))]))
 for r in t['roads']:
  if r['tunnel'] or r.get('layer',0)<0:continue
  line=LineString(r['p']);wid=int(r['id'].split('/')[2])
  surface=line.buffer(r['w']/2,cap_style=2,join_style=2)
  if wid in excluded or surface.intersects(mask):
   # Surface, markings and traffic must agree about the removed footprint.
   visible_lines=[] if wid in excluded else lines(line.difference(mask.buffer(r['w']/2)))
   road_replacements.append(dict(id=r['id'],
    p=[] if wid in excluded else [rings(q) for q in polygons(surface.difference(mask)) if q.area>1],
    lines=[[[round(x,3),round(z,3)] for x,z in q.coords] for q in visible_lines if q.length>max(1,r['w']/2)]))
# Preserve source connections in the floor, roof and walls across the entire South Plaza <-> Musical Fountain underground ring.
underground=[]
mainline_tunnels={102596674,248284676}
for wid in [248284666,248284675,444419547,444419548,444420600,449070493,449070494,759851918,102596674,248284676,603486754,603486757,603486756,603486755,603486758,444149842]:
 e=ways[wid];p=coords(e)
 underground.append(dict(id=f'osm/way/{wid}/0',p=p,y=-10.8 if wid in mainline_tunnels else -5.65,w=6.5 if wid in {603486754,603486757,603486756,603486755,603486758,444149842} else 6.4,source=f'OSM/way/{wid}'))
def node(p):return (round(p[0]*2),round(p[1]*2))
node_heights={}
for r in underground:
 for p in r['p']:node_heights[node(p)]=min(node_heights.get(node(p),r['y']),r['y'])
for r in ramps:
 for p,y in zip([r['p'][0],r['p'][-1]],[r['y'][0],r['y'][-1]]):node_heights[node(p)]=min(node_heights.get(node(p),y),y)
for r in underground:
 line=LineString(r['p']);start=node_heights[node(r['p'][0])];finish=node_heights[node(r['p'][-1])]
 r['heights']=[round(r['y'] if abs(start-finish)<1e-3 else start+(finish-start)*line.project(Point(p))/line.length,4) for p in r['p']]
 w2=r['w']/2
 r['floorSurfaces']=[rings(q) for q in polygons(line.buffer(w2,cap_style=2,join_style=2))]
 ceiling_cut=unary_union([court_excavation,north_underground]) if r['y']>-8 else court_excavation
 r['ceilingSurfaces']=[rings(q) for q in polygons(line.buffer(w2+.3,cap_style=2,join_style=2).difference(ceiling_cut))]
 # Cut side walls at all shared source vertices (including interior bifurcations along roundabouts and distributor ways).
 r_nodes={node(pt) for pt in r['p']}
 neighbors=[LineString(q['p']).buffer(q['w']/2+.15,cap_style=1,join_style=2) for q in underground if q is not r and abs(q['y']-r['y'])<2 and r_nodes.intersection({node(pt) for pt in q['p']})]
 neighbors += [LineString(q['p']).buffer(q['w']/2+.15,cap_style=1,join_style=2) for q in ramps if r_nodes.intersection({node(q['p'][0]),node(q['p'][-1])})]
 openings=unary_union([*( [court_excavation,north_underground] if r['y']>-8 else [court_excavation] ),*neighbors])
 r['wallEdges']=[[[round(x,3),round(z,3)] for x,z in q.coords] for side in [-1,1] for q in lines(line.offset_curve(side*w2,join_style=2).difference(openings))]
layer1_tubes=unary_union([LineString(u['p']).buffer(u['w']/2+.35,cap_style=1,join_style=2) for u in underground if u['y']>-8])
court_wall_edges=[[[round(x,3),round(z,3)] for x,z in q.coords] for q in lines(court.buffer(19.6,quad_segs=64).exterior.difference(layer1_tubes))]
# Add border/planting detail to existing shoreline paths and lawns without moving them.
shore_ids=[309367383,456278900,455109655,532955179,455096004,1429898555,1429898566,1429898567]
shore_clip=box(project(113.3157,23.1170)[0],project(113.3157,23.1170)[1],project(113.3222,23.11485)[0],project(113.3222,23.11485)[1])
paths=[]
for wid in shore_ids:
 for line in lines(LineString(coords(ways[wid])).intersection(shore_clip)):
  paths.append(dict(id=f'osm/way/{wid}',p=[[round(x,3),round(z,3)] for x,z in line.coords],w=4 if wid==456278900 else 3))
trees=[]
for bed in beds:
 minx,minz,maxx,maxz=bed.bounds
 for x in range(math.ceil(minx/6)*6,math.floor(maxx/6)*6+1,6):
  for z in range(math.ceil(minz/6)*6,math.floor(maxz/6)*6+1,6):
   if bed.buffer(-2).contains(Point(x,z)):trees.append(dict(x=x,z=z,height=10.5+((x*7+z*3)%4)))
# Diagonal stone bands seen in the oblique photograph; clip out grass and the open courtyard.
paving_mask=plaza.difference(unary_union([court_excavation,*beds]))
paving_lines=[]
minx,minz,maxx,maxz=plaza.bounds
for slope in [-1.25,1.25]:
 for intercept in range(math.floor(minz-100),math.ceil(maxz+100),48):
  line=LineString([(minx-1,intercept+slope*(minx-court.x-1)),(maxx+1,intercept+slope*(maxx-court.x+1))])
  paving_lines += [[[round(x,3),round(z,3)] for x,z in q.coords] for q in lines(line.intersection(paving_mask)) if q.length>1]
bridge_bands=[rings(p) for z in range(math.floor(bridge.bounds[1]),math.ceil(bridge.bounds[3]),2) for p in polygons(bridge.intersection(box(bridge.bounds[0]-1,z,bridge.bounds[2]+1,z+2)))]
result=dict(bridgeBands=bridge_bands,source='OSM snapshot 2026-10-23; reviewed AMap satellite 2026-10-24',
 heightSource='visual estimates; not surveyed elevations',plaza=rings(plaza.difference(court_opening)),bridge=rings(bridge),
 beds=[rings(p) for p in beds],courtyard=dict(center=list(court.coords)[0],radius=16,outerRadius=19.8,depth=6.07,opening=rings(court_opening),excavation=rings(court_excavation),wallEdges=court_wall_edges),pavingLines=paving_lines,trenches=[rings(p) for p in trenches],ramps=ramps,
 underground=underground,paths=paths,trees=trees,areaReplacements=area_replacements,roadReplacements=road_replacements,
 trafficExcluded=[f'osm/way/{wid}/0' for wid in excluded],
 bridgeSource='OSM/way/877475630',plazaSource='OSM/way/243319596')
# Retain enough decimal places to avoid gaps at the replacement boundaries.
write_static_data(ROOT,'south-axis-data',result,comment='Generated by scripts/prepare-south-axis.py; source XY preserved, elevations estimated.',export='southAxisData',type_='SouthAxisData',type_imports="import type {SouthAxisData} from './south-axis-layout.ts';\n")
print(json.dumps({k:len(result[k]) for k in ['ramps','trenches','underground','paths','trees','areaReplacements','roadReplacements']},indent=2))
