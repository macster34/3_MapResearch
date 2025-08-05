import json
import geopandas as gpd
from shapely.geometry import Point, Polygon
import numpy as np
from pyproj import Geod

def process_churches_better():
    """
    Process the OSM churches data to:
    1. Filter for actual building footprints (not entire properties)
    2. Deduplicate churches by name
    3. Convert polygons to points (centroids)
    4. Calculate reasonable area for dynamic sizing
    """
    
    print("Loading churches data...")
    
    # Load the original churches data
    with open('houston_churches_osm.geojson', 'r') as f:
        churches_data = json.load(f)
    
    print(f"Original churches: {len(churches_data['features'])}")
    
    # Create a dictionary to store unique churches by name
    unique_churches = {}
    
    # Initialize geodetic calculator
    geod = Geod(ellps='WGS84')
    
    for feature in churches_data['features']:
        properties = feature['properties']
        name = properties.get('name', 'Unnamed')
        
        # Skip unnamed churches
        if name == 'Unnamed':
            continue
            
        # Convert polygon to point (centroid)
        if feature['geometry']['type'] == 'Polygon':
            coords = feature['geometry']['coordinates'][0]  # Get exterior ring
            
            # Calculate centroid
            x_coords = [coord[0] for coord in coords]
            y_coords = [coord[1] for coord in coords]
            centroid_x = sum(x_coords) / len(x_coords)
            centroid_y = sum(y_coords) / len(y_coords)
            
            # Calculate area using geodesic area
            try:
                lons = [coord[0] for coord in coords]
                lats = [coord[1] for coord in coords]
                area_sq_meters, _ = geod.polygon_area_perimeter(lons, lats)
                area_sq_ft = abs(area_sq_meters) * 10.764
                
                # Filter out extremely large areas (likely entire properties)
                # Most church buildings are under 300,000 sq ft
                # Grace Community Church is 250,000 sq ft, so we need to allow for large buildings
                # But very large areas (>500,000 sq ft) are likely entire properties
                if area_sq_ft > 500000:  # More than ~11.5 acres (likely entire property)
                    print(f"Skipping {name}: {area_sq_ft:,.0f} sq ft (likely entire property)")
                    continue
                
                # Additional filter: If it's a very simple polygon (few points) with large area,
                # it's likely a property boundary, not a building
                if len(coords) <= 10 and area_sq_ft > 100000:
                    print(f"Skipping {name}: {area_sq_ft:,.0f} sq ft (simple polygon, likely property boundary)")
                    continue
                    
            except:
                # Fallback to rough calculation
                polygon = Polygon(coords)
                area_sq_ft = polygon.area * 10000000
                if area_sq_ft > 500000:
                    continue
            
            # Create point geometry
            point_geometry = {
                "type": "Point",
                "coordinates": [centroid_x, centroid_y]
            }
            
            # Keep the church with the largest area for each name
            if name not in unique_churches:
                unique_churches[name] = {
                    'geometry': point_geometry,
                    'properties': {
                        'name': name,
                        'area_sq_ft': area_sq_ft,
                        'osm_id': properties.get('osm_id'),
                        'religion': properties.get('religion'),
                        'denomination': properties.get('denomination'),
                        'address': properties.get('address'),
                        'city': properties.get('city'),
                        'state': properties.get('state')
                    }
                }
            elif area_sq_ft > unique_churches[name]['properties']['area_sq_ft']:
                # Replace with larger church
                unique_churches[name] = {
                    'geometry': point_geometry,
                    'properties': {
                        'name': name,
                        'area_sq_ft': area_sq_ft,
                        'osm_id': properties.get('osm_id'),
                        'religion': properties.get('religion'),
                        'denomination': properties.get('denomination'),
                        'address': properties.get('address'),
                        'city': properties.get('city'),
                        'state': properties.get('state')
                    }
                }
    
    print(f"Unique churches after filtering and deduplication: {len(unique_churches)}")
    
    # Create the new GeoJSON structure
    processed_features = []
    for name, church_data in unique_churches.items():
        feature = {
            "type": "Feature",
            "geometry": church_data['geometry'],
            "properties": church_data['properties']
        }
        processed_features.append(feature)
    
    # Create the final GeoJSON
    processed_geojson = {
        "type": "FeatureCollection",
        "features": processed_features
    }
    
    # Save the processed data
    with open('houston_churches_processed_better.geojson', 'w') as f:
        json.dump(processed_geojson, f, indent=2)
    
    print("Processed churches saved to: houston_churches_processed_better.geojson")
    
    # Print some statistics
    areas = [church['properties']['area_sq_ft'] for church in unique_churches.values()]
    print(f"Area statistics:")
    print(f"  Min: {min(areas):.0f} sq ft")
    print(f"  Max: {max(areas):.0f} sq ft")
    print(f"  Mean: {np.mean(areas):.0f} sq ft")
    print(f"  Median: {np.median(areas):.0f} sq ft")
    
    return processed_geojson

if __name__ == "__main__":
    process_churches_better() 