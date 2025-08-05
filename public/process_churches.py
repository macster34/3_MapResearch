import json
import geopandas as gpd
from shapely.geometry import Point, Polygon
import numpy as np
from pyproj import Geod

def process_churches():
    """
    Process the OSM churches data to:
    1. Deduplicate churches by name
    2. Convert polygons to points (centroids)
    3. Calculate area for dynamic sizing
    4. Keep only unique churches
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
                # Convert coordinates for area calculation
                lons = [coord[0] for coord in coords]
                lats = [coord[1] for coord in coords]
                area_sq_meters, _ = geod.polygon_area_perimeter(lons, lats)
                area_sq_ft = abs(area_sq_meters) * 10.764  # Convert to square feet
            except:
                # Fallback to rough calculation
                polygon = Polygon(coords)
                area_sq_ft = polygon.area * 10000000
            
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
    
    print(f"Unique churches after deduplication: {len(unique_churches)}")
    
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
    with open('houston_churches_processed.geojson', 'w') as f:
        json.dump(processed_geojson, f, indent=2)
    
    print("Processed churches saved to: houston_churches_processed.geojson")
    
    # Print some statistics
    areas = [church['properties']['area_sq_ft'] for church in unique_churches.values()]
    print(f"Area statistics:")
    print(f"  Min: {min(areas):.0f} sq ft")
    print(f"  Max: {max(areas):.0f} sq ft")
    print(f"  Mean: {np.mean(areas):.0f} sq ft")
    print(f"  Median: {np.median(areas):.0f} sq ft")
    
    return processed_geojson

if __name__ == "__main__":
    process_churches() 