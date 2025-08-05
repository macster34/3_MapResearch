import geopandas as gpd
import pandas as pd
import json
from shapely.geometry import Point
import numpy as np

def extract_neighborhood_311_data():
    """
    Extract 311 call data for the most vulnerable (Neighborhood_50) and 
    least vulnerable (Neighborhood_3) super neighborhoods.
    """
    
    # Load vulnerability index data (contains the correct neighborhood geometries)
    print("Loading vulnerability index data...")
    vulnerability_data = gpd.read_file('super-neighborhoods-vulnerability-index.geojson')
    
    # Load 311 call data for all three months
    print("Loading 311 call data...")
    june_data = gpd.read_file('June_Comprehensive_Category_Dataset.geojson')
    july_data = gpd.read_file('July_Comprehensive_Category_Dataset.geojson')
    august_data = gpd.read_file('August_Comprehensive_Category_Dataset.geojson')
    
    # Add month column to each dataset
    june_data['month'] = 'June'
    july_data['month'] = 'July'
    august_data['month'] = 'August'
    
    # Combine all data
    all_311_data = pd.concat([june_data, july_data, august_data], ignore_index=True)
    
    # Convert to GeoDataFrame if not already
    if not isinstance(all_311_data, gpd.GeoDataFrame):
        all_311_data = gpd.GeoDataFrame(all_311_data, geometry='geometry')
    
    # Set CRS if not set
    if all_311_data.crs is None:
        all_311_data.set_crs('EPSG:4326', inplace=True)
    
    # Ensure vulnerability data has same CRS
    if vulnerability_data.crs != all_311_data.crs:
        vulnerability_data = vulnerability_data.to_crs(all_311_data.crs)
    
    # Get the target neighborhoods
    target_neighborhoods = ['Neighborhood_50', 'Neighborhood_3']
    
    # Extract data for each target neighborhood
    neighborhood_data = {}
    
    for neighborhood_name in target_neighborhoods:
        print(f"Processing {neighborhood_name}...")
        
        # Get the neighborhood boundary from vulnerability data
        neighborhood_boundary = vulnerability_data[vulnerability_data['neighborhood_name'] == neighborhood_name]
        
        if neighborhood_boundary.empty:
            print(f"Warning: {neighborhood_name} not found in vulnerability data")
            continue
        
        # Spatial join to find 311 calls within this neighborhood
        calls_in_neighborhood = gpd.sjoin(all_311_data, neighborhood_boundary, how='inner', predicate='within')
        
        # Convert to GeoJSON format
        neighborhood_geojson = {
            'type': 'FeatureCollection',
            'features': []
        }
        
        for idx, row in calls_in_neighborhood.iterrows():
            # Convert timestamp to string if it's a timestamp
            created_date = row.get('Created Date Local', '')
            if pd.isna(created_date):
                created_date = ''
            elif hasattr(created_date, 'strftime'):
                created_date = created_date.strftime('%Y-%m-%d %H:%M:%S')
            else:
                created_date = str(created_date)
            
            feature = {
                'type': 'Feature',
                'geometry': {
                    'type': 'Point',
                    'coordinates': [row.geometry.x, row.geometry.y]
                },
                'properties': {
                    'incident_type': str(row.get('Incident Case Type', 'Unknown')),
                    'category': str(row.get('Category', 'Unknown')),
                    'subcategory': str(row.get('Subcategory', 'Unknown')),
                    'created_date': created_date,
                    'month': str(row.get('month', '')),
                    'priority': str(row.get('Status', '')),
                    'description': str(row.get('Description', '')),
                    'case_number': str(row.get('Case Number', '')),
                    'address': str(row.get('Incident Address', '')),
                    'hurricane_related': str(row.get('Hurricane_Related', 'No'))
                }
            }
            neighborhood_geojson['features'].append(feature)
        
        neighborhood_data[neighborhood_name] = neighborhood_geojson
        
        # Print summary statistics
        print(f"  Total calls: {len(calls_in_neighborhood)}")
        print(f"  June calls: {len(calls_in_neighborhood[calls_in_neighborhood['month'] == 'June'])}")
        print(f"  July calls: {len(calls_in_neighborhood[calls_in_neighborhood['month'] == 'July'])}")
        print(f"  August calls: {len(calls_in_neighborhood[calls_in_neighborhood['month'] == 'August'])}")
        
        # Category breakdown
        category_counts = calls_in_neighborhood['Category'].value_counts()
        print(f"  Category breakdown:")
        for category, count in category_counts.items():
            print(f"    {category}: {count}")
    
    # Save the extracted data
    for neighborhood_name, geojson_data in neighborhood_data.items():
        filename = f'{neighborhood_name.lower()}_311_calls.geojson'
        with open(filename, 'w') as f:
            json.dump(geojson_data, f, indent=2)
        print(f"Saved {filename}")
    
    # Create a combined analysis file
    analysis_data = {}
    for neighborhood_name, geojson_data in neighborhood_data.items():
        df = pd.DataFrame([f['properties'] for f in geojson_data['features']])
        
        # Monthly breakdown
        monthly_counts = df['month'].value_counts().to_dict()
        
        # Category breakdown
        category_counts = df['category'].value_counts().to_dict()
        
        # Subcategory breakdown (for pie charts)
        subcategory_counts = df['subcategory'].value_counts().to_dict()
        
        analysis_data[neighborhood_name] = {
            'total_calls': len(df),
            'monthly_breakdown': monthly_counts,
            'category_breakdown': category_counts,
            'subcategory_breakdown': subcategory_counts
        }
    
    # Save analysis
    with open('neighborhood_311_analysis.json', 'w') as f:
        json.dump(analysis_data, f, indent=2)
    
    print("\nAnalysis saved to neighborhood_311_analysis.json")
    print("\nSummary:")
    for neighborhood_name, data in analysis_data.items():
        print(f"\n{neighborhood_name}:")
        print(f"  Total calls: {data['total_calls']}")
        print(f"  Monthly breakdown: {data['monthly_breakdown']}")
        print(f"  Top categories: {dict(list(data['category_breakdown'].items())[:5])}")

if __name__ == "__main__":
    extract_neighborhood_311_data() 