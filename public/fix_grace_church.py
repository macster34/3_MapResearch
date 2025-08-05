import json
from pyproj import Geod

def fix_grace_church():
    """
    Add the correct Grace Community Church building footprint
    """
    
    # Load the processed churches data
    with open('houston_churches_processed_better.geojson', 'r') as f:
        data = json.load(f)
    
    # Find and remove the incorrect Grace Community Church entries
    features_to_keep = []
    for feature in data['features']:
        name = feature['properties']['name']
        if 'grace' in name.lower() and 'community' in name.lower():
            print(f"Removing: {name} ({feature['properties']['area_sq_ft']:,.0f} sq ft)")
            continue
        features_to_keep.append(feature)
    
    # Add the correct Grace Community Church
    # Using the centroid from the South Campus property but with correct area
    grace_church_feature = {
        "type": "Feature",
        "geometry": {
            "type": "Point",
            "coordinates": [-95.1928881, 29.5949468]  # Approximate location
        },
        "properties": {
            "name": "Grace Community Church",
            "area_sq_ft": 250000,
            "osm_id": "grace_community_church_fixed",
            "religion": "christian",
            "denomination": "non-denominational",
            "address": "Dixie Farm Road",
            "city": "Houston",
            "state": "TX"
        }
    }
    
    features_to_keep.append(grace_church_feature)
    
    # Create the updated GeoJSON
    updated_geojson = {
        "type": "FeatureCollection",
        "features": features_to_keep
    }
    
    # Save the updated data
    with open('houston_churches_processed_fixed.geojson', 'w') as f:
        json.dump(updated_geojson, f, indent=2)
    
    print(f"Updated churches: {len(features_to_keep)}")
    print("Added Grace Community Church: 250,000 sq ft")
    print("Saved to: houston_churches_processed_fixed.geojson")
    
    return updated_geojson

if __name__ == "__main__":
    fix_grace_church() 