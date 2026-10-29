"""City-wide ordinary forecourts; inferred landscaping, never new survey/map features.
Uses the existing data-preparation Shapely environment. Does not alter source tiles.
"""
import json
import math
import subprocess
from pathlib import Path
from shapely.geometry import Polygon, LineString, Point
from shapely.ops import unary_union, polygonize
from shapely.strtree import STRtree

ROOT = Path(__file__).resolve().parents[1]
from static_data import write_static_data  # noqa: E402  (scripts/ is on sys.path when run directly)
raw = ROOT / 'public/data'
manifest = json.loads((raw / 'manifest.json').read_text())
tiles = [json.loads((raw / (t['id'] + '.json')).read_text()) for t in manifest['tiles']]
buildings = {b['id'] + json.dumps(b['p']): b for t in tiles for b in t['buildings']}
roads = {r['id'] + json.dumps(r['p']): r for t in tiles for r in t['roads']}
ground = [r for r in roads.values() if not r['bridge'] and not r['tunnel'] and r.get('layer', 0) == 0 and not r.get('indoor')]
walk = {'footway', 'pedestrian', 'path', 'cycleway', 'steps'}
building_list = list(buildings.values())
building_shapes = [Polygon(b['p'][0], b['p'][1:]).buffer(0) for b in building_list]
building_index = STRtree(building_shapes)
footprints = unary_union(building_shapes)
exclusions = json.loads(subprocess.check_output(['node', str(ROOT / 'scripts/forecourt-exclusions.mjs')], text=True))
protected = unary_union([Polygon(p[0], p[1:]).buffer(0) for p in exclusions]).buffer(3)
elevated = unary_union([LineString(r['p']).buffer(r['w'] / 2 + 3) for r in roads.values() if r['bridge']])
protected = protected.union(elevated)
route_space = unary_union([LineString(r['p']).buffer(r['w'] / 2 + 2) for r in ground])
asphalt = unary_union([LineString(r['p']).buffer(r['w'] / 2 + .6) for r in ground if r['kind'] not in walk])
areas = unary_union([Polygon(a['p'][0], a['p'][1:]) for t in tiles for a in t['areas']])
tree_rows = [LineString(r['p']).buffer(6) for t in tiles for r in t.get('treeRows', [])]
planting_obstacles = unary_union([footprints.buffer(7), *tree_rows])
faces = list(polygonize(unary_union([LineString(r['p']) for r in ground if r['kind'] != 'steps'])))

def polygons(g):
    if g.geom_type == 'Polygon':
        return [g]
    return [p for p in getattr(g, 'geoms', []) if p.geom_type == 'Polygon']

def rings(g):
    return [[[[round(x, 3), round(z, 3)] for x, z in r.coords] for r in [p.exterior, *p.interiors]] for p in polygons(g.simplify(.04, preserve_topology=True)) if p.area > .05]

sites = []
for face in sorted(faces, key=lambda p: (*p.bounds, p.area)):
    if not 800 < face.area < 100000:
        continue
    nearby = [int(i) for i in building_index.query(face) if building_shapes[int(i)].intersection(face).area > 100]
    if not nearby:
        continue
    local_buildings = unary_union([building_shapes[i] for i in nearby])
    if local_buildings.intersection(face).area / face.area < .05:
        continue
    # Leave unclassified open land alone; infer only the space near actual buildings.
    site = face.buffer(1.8, join_style=2).intersection(local_buildings.buffer(45)).difference(footprints.buffer(.12)).difference(asphalt).difference(areas).difference(protected)
    if site.area < 120:
        continue
    building = building_list[max(nearby, key=lambda i: building_shapes[i].intersection(face).area)]['id']
    safe = site.buffer(-2).difference(planting_obstacles).difference(route_space)
    beds = []
    occupied = []
    # Long planted islands alternate with generous open entry/cross-path gaps.
    for r in sorted(ground, key=lambda r: r['id']):
        line = LineString(r['p'])
        if r['kind'] not in walk or line.distance(face) > 4:
            continue
        for d in range(16, int(line.length) - 12, 30):
            a, b = line.interpolate(d - 1), line.interpolate(d + 1)
            dx, dz = b.x - a.x, b.y - a.y
            length = math.hypot(dx, dz)
            if length < 1e-6:
                continue
            dx, dz = dx / length, dz / length
            p = line.interpolate(d)
            for side in [-1, 1]:
                x, z = p.x - dz * 8 * side, p.y + dx * 8 * side
                corners = [(x + dx * u - dz * v, z + dz * u + dx * v) for u, v in [(-6, -1.8), (6, -1.8), (6, 1.8), (-6, 1.8), (-6, -1.8)]]
                bed = Polygon(corners)
                if len(beds) >= 24 or not safe.contains(bed) or any(bed.distance(q) < 12 for q in occupied):
                    continue
                occupied.append(bed)
                beds.append({'x': round(x, 3), 'z': round(z, 3), 'angle': math.atan2(dx, dz), 'p': rings(bed)[0],
                             'trees': [{'x': round(x + dx * u, 3), 'z': round(z + dz * u, 3), 'height': 7.5 + (len(beds) % 3) * .6, 'y': .2} for u in [-3.7, 3.7]]})
    planted = unary_union(occupied)
    paving = site.difference(planted)
    border = site.difference(site.buffer(-.55)).difference(planted)
    sites.append({'building': building, 'paving': rings(paving), 'border': rings(border), 'beds': beds})
write_static_data(ROOT, 'forecourt-data', sites, comment='Generated by scripts/prepare-forecourts.py. Inferred city-wide forecourts; custom sites excluded.', export='forecourtData', type_='unknown[]')
print(json.dumps({'sites': len(sites), 'beds': sum(len(s['beds']) for s in sites), 'trees': sum(len(b['trees']) for s in sites for b in s['beds'])}))
