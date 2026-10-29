"""Source-tied street furniture; commercial content and exact placements are visual estimates."""
import json
import math
import subprocess
from pathlib import Path
from shapely.geometry import Point, LineString, Polygon
from shapely.ops import unary_union
from shapely.strtree import STRtree
from collections import Counter

ROOT = Path(__file__).resolve().parents[1]
from static_data import write_static_data  # noqa: E402  (scripts/ is on sys.path when run directly)
data = json.loads(subprocess.check_output(['node', str(ROOT / 'scripts/street-detail-inputs.mjs')], text=True))
exclusions = json.loads(subprocess.check_output(['node', str(ROOT / 'scripts/forecourt-exclusions.mjs')], text=True))
protected = unary_union([Polygon(p[0], p[1:]).buffer(0) for p in exclusions]).buffer(1)
roads = data['roads']
lines = [LineString(r['p']) for r in roads]
by_road = {r['id']: r for r in roads}
walk_kinds = {'footway', 'pedestrian', 'path', 'cycleway', 'steps'}
route_space = unary_union([p.buffer(r['w'] / 2 + .3) for r, p in zip(roads, lines)])
motor_space = unary_union([p.buffer(r['w'] / 2 + .4) for r, p in zip(roads, lines) if r['kind'] not in walk_kinds])
water = []
manifest = json.loads((ROOT / 'public/data/manifest.json').read_text())
for tile in manifest['tiles']:
    t = json.loads((ROOT / ('public/data/' + tile['id'] + '.json')).read_text())
    water += [Polygon(a['p'][0], a['p'][1:]).buffer(0) for a in t['areas'] if a['kind'] == 'water']
water = unary_union(water)
# Keep every visible clipped part in obstacles, but create one frontage per source building.
footprints = unary_union([Polygon(b['p'][0], b['p'][1:]).buffer(0) for b in data['buildings']])
features = []

def rounded(v):
    return round(v, 3)

def footprint(x, z, angle, w, d):
    dx, dz = math.cos(angle), -math.sin(angle)
    nx, nz = math.sin(angle), math.cos(angle)
    return Polygon([(x + dx * u + nx * v, z + dz * u + nz * v) for u, v in [(-w/2, -d/2), (w/2, -d/2), (w/2, d/2), (-w/2, d/2), (-w/2, -d/2)]])

def add(kind, key, reference, reference_type, x, z, angle, y, w, h, text='', **extra):
    f = dict(id=kind + '/' + key, kind=kind, reference=reference, referenceType=reference_type,
             x=rounded(x), z=rounded(z), angle=round(angle, 6), y=rounded(y), w=rounded(w), h=rounded(h), text=text, **extra)
    features.append(f)
    return f

# Ground retail frontage and a restrained number of wall-mounted city-theme LED panels.
front_roads = [(r, p) for r, p in zip(roads, lines) if r['kind'] not in {'trunk', 'motorway', 'motorway_link', 'trunk_link', 'steps'}]
front_lines = [p for _, p in front_roads]
road_index = STRtree(front_lines)
named_front = [p for r,p in front_roads if r['name'] and r['kind'] not in walk_kinds]
named_index = STRtree(named_front)
seen = set()
led_cells = Counter()
shops = ['咖啡 COFFEE', '茶饮 TEA', '生活便利', '轻食 FRESH']
posters = ['广州 · 珠江新城', '花城生活 CITY LIFE', '沿江漫步 RIVERSIDE', 'Blessxu.cn']
for b in sorted(data['buildings'], key=lambda b: (b['id'], -Polygon(b['p'][0], b['p'][1:]).area)):
    if b['id'] in seen:
        continue
    seen.add(b['id'])
    name = b.get('name', '')
    commercial = b['kind'] in {'commercial', 'retail', 'office', 'hotel'} or any(t in name for t in ['商业', '商场', '商厦', '购物', '大厦', '商务'])
    if not commercial or b.get('landmark') or b['base'] > .5 or b['h'] < 8 or any(t in name for t in ['海关', '公安', '医院', '学校', '博物', '剧院']):
        continue
    poly = Polygon(b['p'][0], b['p'][1:]).buffer(0)
    if poly.geom_type != 'Polygon':
        continue
    choices = []
    ring = list(poly.exterior.coords)
    for i, (a, c) in enumerate(zip(ring, ring[1:])):
        length = math.dist(a, c)
        if length < 9:
            continue
        dx, dz = (c[0]-a[0])/length, (c[1]-a[1])/length
        nx, nz = -dz, dx
        mid = Point((a[0]+c[0])/2, (a[1]+c[1])/2)
        if poly.contains(Point(mid.x+nx*.5, mid.y+nz*.5)):
            nx, nz = -nx, -nz
        outside = Point(mid.x+nx*.4, mid.y+nz*.4)
        if footprints.contains(outside):
            continue
        r_i = int(road_index.nearest(outside))
        road, line = front_roads[r_i]
        q = line.interpolate(line.project(outside))
        distance = outside.distance(line)
        if distance > 55 or (q.x-mid.x)*nx+(q.y-mid.y)*nz < 1:
            continue
        angle = math.atan2(nx, nz)
        w = min(6, length*.5)
        x, z = mid.x+nx*.2, mid.y+nz*.2
        canopy = footprint(x+nx*.8, z+nz*.8, angle, w, 1.65)
        if canopy.intersects(footprints) or canopy.intersects(motor_space) or canopy.intersects(water) or canopy.intersects(protected):
            continue
        named = named_front[int(named_index.nearest(outside))]
        nq = named.interpolate(named.project(outside))
        primary = 0 if outside.distance(named) < 75 and (nq.x-mid.x)*nx+(nq.y-mid.y)*nz > 3 else 1
        choices.append((primary, distance, -length, i, x, z, angle, length, w))
    if not choices:
        continue
    _, _, _, i, x, z, angle, length, w = min(choices)
    key = b['id'] + '/facade-' + str(i)
    text = shops[len(seen) % len(shops)]
    add('shop', key, b['id'], 'building', x, z, angle, 3.65, w, .72, text)
    add('awning', key, b['id'], 'building', x, z, angle, 3.0, w, .08)
    cell = (math.floor(x/350), math.floor(z/350))
    if length >= 18 and b['h'] >= 12 and led_cells[cell] < 2:
        led_cells[cell] += 1
        add('led', key, b['id'], 'building', x, z, angle, min(10, b['h']*.52), min(10, length*.42), 3.6, posters[len(features) % len(posters)])

# Attach real street names to already-cleared street-lamp poles near actual junctions.
sign_positions = []
for lamp in sorted(data['lamps'], key=lambda p: (p['reference'], p['x'], p['z'])):
    road = by_road.get(lamp['reference'])
    if not road or not road['name'] or road['kind'] in walk_kinds or len(road['name']) > 18:
        continue
    point = Point(lamp['x'], lamp['z'])
    if not any(road['name'] in j['names'] and point.distance(Point(*j['p'])) < 55 for j in data['junctions']):
        continue
    if any(point.distance(q) < 65 for q in sign_positions):
        continue
    sign_positions.append(point)
    add('roadSign', road['id'] + '/' + str(len(sign_positions)), road['id'], 'road', lamp['x'], lamp['z'], lamp['angle']-math.pi/2, 3.5, min(4.8, max(2.6, len(road['name'])*.42+1.0)), .72, road['name'])

# Iron grates use existing trees in selected planting islands, not new invented tree sites.
for site in data['sites']:
    for i, bed in enumerate(site['beds']):
        if i % 3:
            continue
        for j, tree in enumerate(bed['trees']):
            add('grate', site['building']+'/'+str(i)+'/'+str(j), site['building'], 'building', tree['x'], tree['z'], 0, .215, 1.8, 1.8, bed=[bed['x'],bed['z']])

# A few food carts on generous paved forecourts. The whole canopy clears routes.
cart_cells = set()
all_beds = unary_union([Polygon(b['p'][0], b['p'][1:]) for s in data['sites'] for b in s['beds']])
walks = [(r,p) for r,p in zip(roads,lines) if r['kind'] in {'footway','pedestrian','path'}]
for site in data['sites']:
    paving = unary_union([Polygon(p[0],p[1:]) for p in site['paving']])
    safe = paving.buffer(-.25).difference(footprints.buffer(5)).difference(route_space.buffer(1.5)).difference(all_beds.buffer(1))
    placed = False
    for road,line in walks:
        if placed or line.distance(paving) > 4:
            continue
        for d in range(18, int(line.length)-12, 24):
            a,c = line.interpolate(d-.5),line.interpolate(d+.5)
            length = a.distance(c)
            if length < .1:
                continue
            dx,dz = (c.x-a.x)/length,(c.y-a.y)/length
            p = line.interpolate(d)
            for side in [-1,1]:
                x,z = p.x-dz*8*side,p.y+dx*8*side
                cell=(math.floor(x/300),math.floor(z/300))
                canopy = Point(x,z).buffer(1.7)
                if cell in cart_cells or not safe.contains(canopy):
                    continue
                cart_cells.add(cell)
                angle=math.atan2(dz*side,-dx*side)
                f=add('cart',site['building'],site['building'],'building',x,z,angle,.14,1.8,1.4,'花城茶点')
                f['p']=[[[rounded(a),rounded(b)] for a,b in footprint(x,z,angle,1.8,1.4).exterior.coords]]
                placed=True
                break
            if placed:
                break

# Source subway entrances: surface nodes only, with the access opening kept clear.
osm=json.loads((ROOT/'data/raw/osm.json').read_text())
entrances=[e for e in osm['elements'] if e.get('tags',{}).get('railway')=='subway_entrance']
walk_index=STRtree([p for _,p in walks])
omitted=[]
for entry in entrances:
    tags=entry['tags']
    if float(tags.get('level','0').split(';')[0])<0:
        omitted.append({'id':entry['id'],'reason':'underground source level'})
        continue
    x=(entry['lon']-113.322)*math.pi/180*6378137*math.cos(math.radians(23.119))
    z=-(entry['lat']-23.119)*math.pi/180*6378137
    road,line=walks[int(walk_index.nearest(Point(x,z)))]
    d=line.project(Point(x,z));q=line.interpolate(d);a,c=line.interpolate(max(0,d-.5)),line.interpolate(min(line.length,d+.5));length=a.distance(c)
    if length<.1:
        continue
    dx,dz=(c.x-a.x)/length,(c.y-a.y)/length
    candidates=[]
    for side in [-1,1]:
        for along in [0,1.5,-1.5]:
            px,pz=q.x-dz*(road['w']/2+1.0)*side+dx*along,q.y+dx*(road['w']/2+1.0)*side+dz*along
            post=footprint(px,pz,0,.46,.46)
            if math.hypot(px-x,pz-z)>9 or post.intersects(route_space) or post.intersects(footprints.buffer(.2)) or post.intersects(water) or post.intersects(protected) or post.intersects(all_beds):
                continue
            candidates.append((math.hypot(px-x,pz-z),px,pz,math.atan2(dz*side,-dx*side)))
    if not candidates:
        omitted.append({'id':entry['id'],'reason':'no clear surface position beside source entrance'})
        continue
    _,px,pz,angle=min(candidates)
    key='osm/node/'+str(entry['id'])
    f=add('metro',key,road['id'],'road',px,pz,angle,.28,1.9,.95,tags.get('name:zh',tags.get('name','地铁出入口')),source=key,origin=[rounded(x),rounded(z)],exit=tags.get('ref',''))
    f['p']=[[[rounded(a),rounded(b)] for a,b in footprint(px,pz,0,.46,.46).exterior.coords]]

features.sort(key=lambda f:f['id'])
write_static_data(ROOT,'street-detail-data',features,comment='Generated by scripts/prepare-street-details.py. Source-linked, inferred visual street details.',export='streetDetailData',type_='unknown[]')
report={'counts':dict(Counter(f['kind'] for f in features)),'omittedMetroEntrances':omitted}
(ROOT/'work/street-details-generation.json').write_text(json.dumps(report,ensure_ascii=False,indent=2))
print(json.dumps(report,ensure_ascii=False))
