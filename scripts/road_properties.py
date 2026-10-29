"""Preserve OSM carriageway direction and grade; widths remain estimates unless tagged."""
def road_properties(tags, number):
    kind = tags['highway']
    oneway = -1 if tags.get('oneway') == '-1' else 1 if tags.get('oneway') in ('yes', '1', 'true') or (tags.get('junction') == 'roundabout' and tags.get('oneway') != 'no') else 0
    lanes = number(tags.get('lanes'))
    if lanes is not None and lanes <= 0:
        lanes = None
    width = number(tags.get('width'))
    widths = {'motorway':22,'trunk':19,'primary':16,'secondary':13,'tertiary':10,'residential':7,'service':4,'footway':2.6,'pedestrian':6,'path':2,'cycleway':2.4,'steps':2}
    fallback = widths.get(kind, widths.get(kind.removesuffix('_link'), 5))
    if oneway and kind.removesuffix('_link') in ('motorway','trunk','primary','secondary','tertiary','residential'):
        fallback /= 2
    return dict(w=round(min(35,max(1,width or (lanes*3.2 if lanes else fallback))),1),
                widthSource='osm:width' if width else 'estimate:lanes' if lanes else 'estimate:class',
                oneway=oneway,layer=number(tags.get('layer')) or 0,
                bridge=tags.get('bridge','no') not in ('no','false','0'),
                tunnel=tags.get('tunnel','no') not in ('no','false','0'),
                indoor=tags.get('indoor') == 'yes', tags=dict(tags))


def road_node_properties(element, coordinates, project, tagged_nodes):
    """Retain IDs at original vertices; clipped endpoints have no invented OSM ID."""
    if not element.get('nodes'):
        return {}
    source = {}
    for node_id, point in zip(element['nodes'], element['geometry']):
        if point and 'lon' in point:
            x, z = project(point['lon'], point['lat'])
            source[(round(x, 6), round(z, 6))] = node_id
    node_ids = [source.get((round(x, 6), round(z, 6))) for x, z, *_ in coordinates]
    tags = {str(node_id): tagged_nodes[node_id] for node_id in node_ids if node_id in tagged_nodes}
    return dict(nodeIds=node_ids, **(dict(nodeTags=tags) if tags else {}),
                **(dict(sourceVersion=element['version']) if 'version' in element else {}),
                **(dict(sourceTimestamp=element['timestamp']) if 'timestamp' in element else {}))
