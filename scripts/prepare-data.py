"""Project WGS84 to a local tangent plane, clip, simplify and tile real map data.
Requires shapely. No geocoding, random footprints, or online work at runtime.
"""
import collections, datetime, gzip, hashlib, json, math, pathlib, re
from road_properties import road_properties, road_node_properties
from shapely.geometry import shape, Polygon, LineString, box, mapping
from shapely.ops import polygonize, unary_union
from shapely import transform as shapely_transform

def transform(fn, geometry):
    return shapely_transform(geometry, fn, interleaved=False)
ROOT = pathlib.Path(__file__).resolve().parents[1]
RAW, OUT = ROOT/'data/raw', ROOT/'public/data'
ORIGIN = [113.322, 23.119]
BBOX = [113.305, 23.103, 113.337, 23.133]
SIZE = 600

GREEN_LANDUSE={'village_green','greenery','forest','meadow','flowerbed','recreation_ground'}
CAMPUS_AMENITY={'school','college','university','kindergarten','hospital'}
EXTRA_AREA_KINDS=['green','campus','track','pitch','pool']
def extra_area_kind(tags):
    if tags.get('landuse') in GREEN_LANDUSE or tags.get('leisure')=='garden': return 'green'
    if tags.get('amenity') in CAMPUS_AMENITY or tags.get('landuse')=='education': return 'campus'
    # Indoor, covered or raised sport surfaces are not ground features.
    if tags.get('indoor')=='yes' or tags.get('covered')=='yes' or tags.get('location') in ('indoor','roof','rooftop'): return None
    try:
        if float(tags.get('layer','0'))>0 or float(str(tags.get('level','0')).split(';')[0])>0: return None
    except ValueError: return None
    # A closed leisure=track way without area=yes is a jogging loop (a line), not a track surface.
    if tags.get('leisure')=='track' and tags.get('area')!='yes': return None
    return {'pitch':'pitch','track':'track','swimming_pool':'pool'}.get(tags.get('leisure'))

def project(lon, lat, z=None):
    return ((lon-ORIGIN[0])*math.pi/180*6378137*math.cos(math.radians(ORIGIN[1])),
            -(lat-ORIGIN[1])*math.pi/180*6378137)

MIN = project(BBOX[0], BBOX[3]); MAX = project(BBOX[2], BBOX[1])
CLIP = box(MIN[0], MIN[1], MAX[0], MAX[1])

def parts(geom, kind):
    if geom.is_empty: return []
    if geom.geom_type == kind: return [geom]
    return [p for g in getattr(geom, 'geoms', []) for p in parts(g, kind)]

def points(coords):
    return [[round(x, 1), round(y, 1)] for x,y,*_ in coords]

def rings(poly):
    return [points(poly.exterior.coords)] + [points(r.coords) for r in poly.interiors]

def number(value):
    try: return float(str(value).replace(' m','').split(';')[0])
    except (ValueError,TypeError): return None

def main():
    OUT.mkdir(parents=True, exist_ok=True)
    osm = json.loads((RAW/'osm.json').read_text())
    tagged_nodes = {e['id']: e['tags'] for e in osm['elements'] if e['type']=='node' and e.get('tags')}
    tiles = collections.defaultdict(lambda: dict(buildings=[], roads=[], areas=[], treeRows=[]))
    stats = collections.Counter()
    buildings = []
    overture_path = RAW/'overture.geojson'
    overture_shapes = []
    # Retain Overture footprints, enrich missing height with overlapping OSM records.
    osm_heights=[]
    for e in osm['elements']:
        t=e.get('tags',{}); g=e.get('geometry',[])
        if t.get('building') and (number(t.get('height')) or number(t.get('building:levels'))):
            pts=[project(p['lon'],p['lat']) for p in g if p and 'lon' in p]
            if len(pts)>3 and pts[0]==pts[-1]:
                poly=Polygon(pts).buffer(0)
                osm_heights.append((poly,t))
    if overture_path.exists():
        for feature in json.loads(overture_path.read_text())['features']:
            prop = feature['properties']; geom = transform(project, shape(feature['geometry'])).buffer(0).intersection(CLIP).simplify(.6, preserve_topology=True)
            h = number(prop.get('height')); levels = number(prop.get('num_floors'))
            hs = 'overture:height' if h else 'overture:num_floors' if levels else 'estimate:18m'
            h = h or (levels*3.2 if levels else 18)
            name = (prop.get('names') or {}).get('primary','')
            for i,p in enumerate(parts(geom,'Polygon')):
                if p.area < 12: continue
                if not prop.get('height'):
                    for op,ot in osm_heights:
                        if op.intersects(p) and op.intersection(p).area/p.area>.65:
                            oh=number(ot.get('height')); ol=number(ot.get('building:levels'))
                            h=oh or ol*3.2; hs='osm:height' if oh else 'osm:building:levels'
                            name=name or ot.get('name','');break
                buildings.append(dict(id='overture/'+feature['id']+f'/{i}',p=rings(p),h=round(max(3,h),1),base=0,hs=hs,source='Overture',provenance=[{'dataset':v.get('dataset'),'version':v.get('version'),'license':v.get('license')} for v in prop.get('sources',[])],name=name,kind=prop.get('class') or 'building'))
                overture_shapes.append(p)
    cover = unary_union(overture_shapes) if overture_shapes else None
    for el in osm['elements']:
        tags = el.get('tags', {}); geo = el.get('geometry',[])
        rawpts = [(g['lon'],g['lat']) for g in geo if g and 'lon' in g]
        eid = f"osm/{el['type']}/{el['id']}"
        if (tags.get('building') or tags.get('building:part')) and len(rawpts)>3 and rawpts[0]==rawpts[-1]:
            geom=transform(project,Polygon(rawpts)).buffer(0).intersection(CLIP).simplify(.6,preserve_topology=True)
            h = number(tags.get('height')); levels=number(tags.get('building:levels'))
            hs='osm:height' if h else 'osm:building:levels' if levels else 'estimate:18m'
            for i,p in enumerate(parts(geom,'Polygon')):
                if p.area<12 or (not tags.get('building:part') and cover is not None and cover.intersection(p).area/p.area>.35): continue
                buildings.append(dict(id=eid+f'/{i}',p=rings(p),h=round(max(3,h or (levels*3.2 if levels else 18)),1),base=number(tags.get('min_height')) or 0,hs=hs,source='OSM',name=tags.get('name',''),kind=tags.get('building',tags.get('building:part','building'))))
        if tags.get('highway') and len(rawpts)>1 and tags.get('area')!='yes':
            kind=tags['highway']
            # Keep source junction vertices: simplifying each way independently disconnects turns.
            geom=transform(project,LineString(rawpts)).intersection(CLIP)
            for i,line in enumerate(parts(geom,'LineString')):
                road=dict(id=eid+f'/{i}',p=points(line.coords),kind=kind,name=tags.get('name',''),**road_properties(tags,number),**road_node_properties(el,line.coords,project,tagged_nodes))
                c=line.centroid; tiles[(math.floor(c.x/SIZE),math.floor(c.y/SIZE))]['roads'].append(road)
        if tags.get('natural')=='tree_row' and len(rawpts)>1:
            geom=transform(project,LineString(rawpts)).intersection(CLIP).simplify(.6)
            for i,line in enumerate(parts(geom,'LineString')):
                c=line.centroid
                tiles[math.floor(c.x/SIZE),math.floor(c.y/SIZE)]['treeRows'].append(dict(id=eid+f'/{i}',p=points(line.coords),source='OSM:natural=tree_row',spacing=8,height=7,heightSource='estimate:landscape'))
        kind='water' if tags.get('natural')=='water' else 'park' if tags.get('leisure')=='park' or tags.get('landuse')=='grass' or tags.get('natural') in ['wood','scrub'] else extra_area_kind(tags)
        if kind:
            polygons=[]
            if el['type']=='relation':
                for role in ['outer','inner']:
                    lines=[]
                    for member in el.get('members',[]):
                        if member.get('role')!=role: continue
                        pts=[(g['lon'],g['lat']) for g in member.get('geometry',[]) if g and 'lon' in g]
                        if len(pts)>1: lines.append(LineString(pts))
                    ringpolys=list(polygonize(unary_union(lines)))
                    if role=='outer': polygons=ringpolys
                    elif ringpolys: polygons=[p.difference(unary_union(ringpolys)) for p in polygons]
            elif len(rawpts)>3 and rawpts[0]==rawpts[-1]: polygons=[Polygon(rawpts)]
            for poly in polygons:
                geom=transform(project,poly).buffer(0).intersection(CLIP).simplify(1,preserve_topology=True)
                for p in parts(geom,'Polygon'):
                    # Split areas at grid edges so the river also streams in tiles.
                    for x in range(math.floor(p.bounds[0]/SIZE),math.floor(p.bounds[2]/SIZE)+1):
                        for y in range(math.floor(p.bounds[1]/SIZE),math.floor(p.bounds[3]/SIZE)+1):
                            for cut in parts(p.intersection(box(x*SIZE,y*SIZE,(x+1)*SIZE,(y+1)*SIZE)),'Polygon'):
                                tiles[x,y]['areas'].append(dict(p=rings(cut),kind=kind,name=tags.get('name',''),**({'sport':tags['sport']} if kind=='pitch' and tags.get('sport') else {})))
    footprints=unary_union([Polygon(b['p'][0],b['p'][1:]).buffer(0) for b in buildings if b['base']<2]) if buildings else None
    # Small default-height footprints inside parks and green areas are pavilions, kiosks and toilet
    # blocks (white low roofs on satellite imagery), not 18 m towers.
    greens=unary_union([Polygon(x['p'][0],x['p'][1:]).buffer(0) for t in tiles.values() for x in t['areas'] if x['kind'] in ('park','green')])
    for b in buildings:
        if b['hs']!='estimate:18m' or b['base']>=2: continue
        poly=Polygon(b['p'][0],b['p'][1:]).buffer(0)
        if poly.area<800 and greens.contains(poly.centroid): b['h']=4.5;b['hs']='estimate:park-pavilion'
    # Water relations and member ways can overlap. Union per tile before rendering
    # so coplanar polygons do not produce flickering triangulation patterns.
    for tile in tiles.values():
        areas=[]
        for kind in ['water','park']:
            polygons=[Polygon(a['p'][0],a['p'][1:]) for a in tile['areas'] if a['kind']==kind]
            if polygons:
                for poly in parts(unary_union(polygons).buffer(0),'Polygon'):
                    areas.append(dict(p=rings(poly),kind=kind,name=''))
        # Green, campus and sport grounds are kept apart from 'park' so park polygons (and the
        # site cuts keyed by their exact rings) are unchanged. Sport surfaces covered by
        # buildings are rooftop/indoor courts and are dropped.
        for kind in EXTRA_AREA_KINDS:
            source=[a for a in tile['areas'] if a['kind']==kind]
            if kind in ('pitch','track','pool'):
                for a in source:
                    poly=Polygon(a['p'][0],a['p'][1:]).buffer(0)
                    if poly.area<20 or (footprints is not None and footprints.intersection(poly).area/poly.area>.5): continue
                    for part in parts(poly,'Polygon'): areas.append(dict(p=rings(part),kind=kind,name=a['name'],**({'sport':a['sport']} if a.get('sport') else {})))
            elif source:
                for poly in parts(unary_union([Polygon(a['p'][0],a['p'][1:]) for a in source]).buffer(0),'Polygon'):
                    areas.append(dict(p=rings(poly),kind=kind,name=''))
        tile['areas']=areas
    # Replace only identified landmark footprints and their overlapping parts.
    # A large podium whose outline extends beyond the tower is retained.
    overrides=json.loads((ROOT/'data/landmark-overrides.json').read_text())
    for spec in overrides:
        seed=next(b for b in buildings if b['id']==spec['seed'])
        footprint=Polygon(seed['p'][0],seed['p'][1:]).buffer(0)
        for b in buildings:
            poly=Polygon(b['p'][0],b['p'][1:]).buffer(0)
            if b['id']==seed['id'] or (poly.area and poly.intersects(footprint) and poly.intersection(footprint).area/poly.area>.65):
                b['landmark']=spec['model']
                b['landmarkPrimary']=b['id']==seed['id']
        seed['h']=spec['height'];seed['hs']=spec['heightSource'];seed['heightReference']=spec['reference']
    stats['landmarks']=len(overrides)
    stats['replacedLandmarkRecords']=sum('landmark' in b for b in buildings)
    provenance_index={}
    provenance_keys={}
    for b in buildings:
        if 'provenance' in b:
            key=json.dumps(b['provenance'],sort_keys=True)
            if key not in provenance_keys:
                ref=f's{len(provenance_keys)}';provenance_keys[key]=ref;provenance_index[ref]=b['provenance']
            b['provenance']=provenance_keys[key]
        if '广州西塔' in b['name'] or '广州国际金融中心' in b['name']:
            b['h']=438.6; b['hs']='CTBUH:architectural-height'; b['heightReference']='https://www.skyscrapercenter.com/building/wd/174'
        p=Polygon(b['p'][0]); c=p.centroid
        tiles[math.floor(c.x/SIZE),math.floor(c.y/SIZE)]['buildings'].append(b)
        stats['buildings']+=1; stats[b['source']]+=1
        stats['estimatedHeight' if b['hs'].startswith('estimate') else 'sourceHeight']+=1
    manifest=dict(provenance=provenance_index,version=1,origin=ORIGIN,bbox=BBOX,tileSize=SIZE,tiles=[],stats=stats,sources={'OSM':'https://www.openstreetmap.org/copyright','Overture':'https://docs.overturemaps.org/attribution/'},generated=datetime.datetime.now(datetime.timezone.utc).isoformat(),osmTimestamp=osm.get('osm3s',{}).get('timestamp_osm_base'))
    if osm.get('connectivitySource'):
        manifest['connectivitySource']=osm['connectivitySource']
    stats['roads']=sum(len(t['roads']) for t in tiles.values()); stats['areas']=sum(len(t['areas']) for t in tiles.values())
    stats['treeRows']=sum(len(t['treeRows']) for t in tiles.values())
    for (x,y),data in sorted(tiles.items()):
        content=json.dumps(data,separators=(',',':'),ensure_ascii=False).encode()
        tid=f'{x}_{y}-{hashlib.sha256(content).hexdigest()[:8]}'
        (OUT/f'{tid}.json').write_bytes(content)
        # Kept for hosts configured to serve precompressed responses; plain JSON is universal.
        (OUT/f'{tid}.json.gz').write_bytes(gzip.compress(content,mtime=0))
        manifest['tiles'].append(dict(id=tid,center=[(x+.5)*SIZE,(y+.5)*SIZE],bounds=[x*SIZE,y*SIZE,(x+1)*SIZE,(y+1)*SIZE],bytes=len(content),buildings=len(data['buildings']),roads=len(data['roads'])))
    # Tile names are content-hashed, so drop copies from earlier runs that the new manifest no longer references.
    current={f"{t['id']}{ext}" for t in manifest['tiles'] for ext in ('.json','.json.gz')}
    for old in OUT.iterdir():
        if old.name not in current and re.fullmatch(r'-?\d+_-?\d+-[0-9a-f]{8}\.json(\.gz)?',old.name): old.unlink()
    stats['jsonBytes']=sum(t['bytes'] for t in manifest['tiles'])
    stats['gzipBytes']=sum((OUT/f"{t['id']}.json.gz").stat().st_size for t in manifest['tiles'])
    (OUT/'manifest.json').write_text(json.dumps(manifest,ensure_ascii=False,indent=2))
    # Camera destinations derived from source geometry, rather than hand-placed coordinates.
    places=[('花城广场','HUACHENG SQUARE','osm',243319596,0),
      ('东塔 · 周大福中心','CTF FINANCE CENTRE','osm',511404889,530),
      ('西塔 · 国际金融中心','GUANGZHOU IFC','overture','ebcbae5c-e7d2-4c9c-ba55-a7dd62155113',438.6),
      ('广州大剧院','GUANGZHOU OPERA HOUSE','overture','ab0b520c-05f1-4280-a640-ea203386401d',18),
      ('广东省博物馆','GUANGDONG MUSEUM','osm',240896442,16),
      ('广州图书馆','GUANGZHOU LIBRARY','osm',240896441,22.4),
      ('广州塔','CANTON TOWER','overture','8a3ca89e-d721-4d1b-845d-945cbd7dd969',600)]
    destinations=[]
    features=json.loads(overture_path.read_text())['features'] if overture_path.exists() else []
    for name,en,source,ident,h in places:
        if source=='osm':
            e=next(e for e in osm['elements'] if e['id']==ident)
            g=Polygon([(p['lon'],p['lat']) for p in e['geometry'] if p])
        else: g=shape(next(e for e in features if e['id']==ident)['geometry'])
        c=g.centroid
        spec=next((v for v in overrides if ('东塔' in name and v['model']=='ctf') or v['seed'].startswith(f'{source}/'+ ('way/' if source=='osm' else '') +str(ident)+'/') or ('博物馆' in name and v['model']=='museum') or ('图书馆' in name and v['model']=='library')),None)
        destinations.append(dict(name=name,en=en,lon=c.x,lat=c.y,h=spec['height'] if spec else h,description=spec['description'] if spec else '地理骨架',source=f'{source}/{ident}'))
    # Additional reviewed axis buildings use their selected source footprint centroids.
    for model,name,en in [('fuli','富力中心','R&F CENTRE'),('ifp','合景国际金融广场','INTERNATIONAL FINANCE PLACE'),('kaihua','凯华国际中心','KAIHUA INTERNATIONAL CENTER'),('ritz','丽思卡尔顿酒店','THE RITZ-CARLTON'),('gtspring','高德置地 · 春广场','GT LAND SPRING'),('gtsummer','高德置地 · 夏广场','GT LAND SUMMER'),('gtautumn','高德置地 · 秋广场','GT LAND AUTUMN'),('gtwinterNorth','高德置地 · 冬北塔','GT LAND WINTER NORTH'),('gtwinterSouth','高德置地 · 冬南塔','GT LAND WINTER SOUTH'),('gtwinterWest','高德置地 · 冬西楼','GT LAND WINTER WEST'),('youth','广州市第二少年宫','SECOND YOUTH PALACE')]:
        spec=next(v for v in overrides if v['model']==model)
        b=next(b for b in buildings if b['id']==spec['seed'])
        c=Polygon(b['p'][0]).centroid
        lon=ORIGIN[0]+c.x/(math.pi/180*6378137*math.cos(math.radians(ORIGIN[1])))
        lat=ORIGIN[1]-c.y/(math.pi/180*6378137)
        destinations.append(dict(name=name,en=en,lon=lon,lat=lat,h=b['h'],description=spec['description'],source=b['id']))
    (OUT/'landmarks.json').write_text(json.dumps(destinations,ensure_ascii=False,indent=2))
    print(json.dumps(stats,ensure_ascii=False,indent=2))

if __name__=='__main__':
    main()
    import runpy
    runpy.run_path(str(ROOT/'scripts/prepare-south-axis.py'),run_name='__main__')
    runpy.run_path(str(ROOT/'scripts/prepare-tunnels.py'),run_name='__main__')
