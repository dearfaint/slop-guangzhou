"""Fetch the official bounded OSM map extract; runtime has no remote map dependency."""
import datetime, json, pathlib, urllib.request, xml.etree.ElementTree as ET
ROOT = pathlib.Path(__file__).resolve().parents[1]
RAW = ROOT / 'data/raw'
URL = 'https://api.openstreetmap.org/api/0.6/map?bbox=113.305,23.103,113.337,23.133'

def convert(data):
    root=ET.fromstring(data)
    nodes={n.attrib['id']:{'lon':float(n.attrib['lon']),'lat':float(n.attrib['lat'])} for n in root.findall('node')}
    ways={}
    for w in root.findall('way'):
        ways[w.attrib['id']]={'type':'way','id':int(w.attrib['id']),
            'tags':{t.attrib['k']:t.attrib['v'] for t in w.findall('tag')},
            'nodes':[int(n.attrib['ref']) for n in w.findall('nd')],
            'geometry':[nodes.get(n.attrib['ref']) for n in w.findall('nd')],
            **({'version':int(w.attrib['version'])} if 'version' in w.attrib else {}),
            **({'timestamp':w.attrib['timestamp']} if 'timestamp' in w.attrib else {})}
    relations=[]
    for rel in root.findall('relation'):
        tags={t.attrib['k']:t.attrib['v'] for t in rel.findall('tag')}
        if tags.get('natural')!='water': continue
        members=[{'role':m.attrib.get('role',''),'geometry':ways.get(m.attrib['ref'],{}).get('geometry',[])}
                 for m in rel.findall('member') if m.attrib['type']=='way']
        relations.append({'type':'relation','id':int(rel.attrib['id']),'tags':tags,'members':members})
    tagged_nodes=[dict(type='node',id=int(n.attrib['id']),lon=float(n.attrib['lon']),lat=float(n.attrib['lat']),tags={t.attrib['k']:t.attrib['v'] for t in n.findall('tag')}) for n in root.findall('node') if n.findall('tag')]
    return {'elements':list(ways.values())+relations+tagged_nodes,'osm3s':{'timestamp_osm_base':datetime.datetime.now(datetime.timezone.utc).isoformat()},'source':URL}

def refresh_roads(existing, downloaded):
    """Refresh one coherent road network without replacing buildings or water rings."""
    is_road = lambda e: e['type']=='way' and bool(e.get('tags',{}).get('highway'))
    roads = {e['id']: e for e in downloaded['elements'] if is_road(e)}
    old_ids = {e['id'] for e in existing['elements'] if is_road(e)}
    if old_ids - roads.keys():
        raise ValueError('Source extract is missing existing roads; review before removal')
    if any(not e.get('nodes') or len(e['nodes'])!=len(e.get('geometry',[])) or any(p is None for p in e['geometry']) for e in roads.values()):
        raise ValueError('Source extract contains incomplete road geometry')
    referenced = {node for e in roads.values() for node in e['nodes']}
    tagged = {e['id']:e for e in downloaded['elements'] if e['type']=='node' and e['id'] in referenced}
    elements = []
    for e in existing['elements']:
        if is_road(e):
            elements.append(roads[e['id']])
        elif e['type']=='node' and e['id'] in tagged:
            elements.append(tagged.pop(e['id']))
        else:
            elements.append(e)
    elements.extend(e for id,e in roads.items() if id not in old_ids)
    elements.extend(tagged.values())
    return {**existing, 'elements':elements}

if __name__ == '__main__':
    RAW.mkdir(parents=True,exist_ok=True)
    req=urllib.request.Request(URL,headers={'User-Agent':'ZhujiangCity/0.1'})
    data=convert(urllib.request.urlopen(req,timeout=120).read())
    # A bbox extract includes relations but can omit member ways outside the box.
    # Fetch their complete rings before polygonization, then clip during data:build.
    for relation in data['elements']:
        if relation['type']!='relation' or not any(not m['geometry'] or any(p is None for p in m['geometry']) for m in relation['members']): continue
        url=f"https://api.openstreetmap.org/api/0.6/relation/{relation['id']}/full"
        req=urllib.request.Request(url,headers={'User-Agent':'ZhujiangCity/0.1'})
        complete=convert(urllib.request.urlopen(req,timeout=120).read())
        relation['members']=next(e['members'] for e in complete['elements'] if e['type']=='relation' and e['id']==relation['id'])
    (RAW/'osm.json').write_text(json.dumps(data,ensure_ascii=False))
    print(f"Saved {len(data['elements'])} OSM elements")
