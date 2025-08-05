import json
from pyproj import Geod

def add_grace_community_church():
    """
    Add Grace Community Church with correct 86-acre property size
    and handle churches with missing area data
    """
    
    # Load the current churches data
    with open('houston_churches_processed_better.geojson', 'r') as f:
        data = json.load(f)
    
    print(f"Original churches: {len(data['features'])}")
    
    # Remove any existing Grace Community Church entries
    features_to_keep = []
    for feature in data['features']:
        name = feature['properties']['name']
        if 'grace' in name.lower() and 'community' in name.lower():
            print(f"Removing: {name} ({feature['properties']['area_sq_ft']:,.0f} sq ft)")
            continue
        features_to_keep.append(feature)
    
    # Add Grace Community Church with 86-acre property
    # 86 acres = 86 * 43,560 = 3,746,160 sq ft
    grace_church_feature = {
        "type": "Feature",
        "geometry": {
            "type": "Point",
            "coordinates": [-95.1928881, 29.5949468]  # Approximate location
        },
        "properties": {
            "name": "Grace Community Church",
            "area_sq_ft": 3746160,  # 86 acres
            "osm_id": "grace_community_church_main",
            "religion": "christian",
            "denomination": "non-denominational",
            "address": "Dixie Farm Road",
            "city": "Houston",
            "state": "TX"
        }
    }
    
    features_to_keep.append(grace_church_feature)
    
    # Handle churches with missing or invalid area data
    for feature in features_to_keep:
        area = feature['properties'].get('area_sq_ft', 0)
        try:
            area = float(area) if area else 0
        except (ValueError, TypeError):
            area = 0
        
        # If area is 0 or very small, set it to null/None
        if area <= 0:
            feature['properties']['area_sq_ft'] = None
            print(f"Nullified area for: {feature['properties']['name']}")
    
    # Create the updated GeoJSON
    updated_geojson = {
        "type": "FeatureCollection",
        "features": features_to_keep
    }
    
    # Save the updated data
    with open('houston_churches_with_grace.geojson', 'w') as f:
        json.dump(updated_geojson, f, indent=2)
    
    print(f"Updated churches: {len(features_to_keep)}")
    print("Added Grace Community Church: 3,746,160 sq ft (86 acres)")
    print("Saved to: houston_churches_with_grace.geojson")
    
    # Print some statistics
    areas = [f['properties']['area_sq_ft'] for f in features_to_keep if f['properties']['area_sq_ft'] is not None]
    if areas:
        print(f"Area statistics (excluding null values):")
        print(f"  Min: {min(areas):.0f} sq ft")
        print(f"  Max: {max(areas):.0f} sq ft")
        print(f"  Churches with valid area: {len(areas)}")
        print(f"  Churches with null area: {len(features_to_keep) - len(areas)}")
    
    return updated_geojson

if __name__ == "__main__":
    add_grace_community_church() 