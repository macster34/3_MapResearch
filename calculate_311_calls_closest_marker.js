const fs = require('fs');
const turf = require('@turf/turf');

// Function to calculate 311 calls within 1-mile radius of each marker, assigning to closest when overlap
async function calculate311CallsClosestMarker() {
  try {
    console.log('Loading data...');
    
    // Load the memorial markers (churches and community centers)
    const memorialMarkersData = JSON.parse(fs.readFileSync('public/memorial-markers.geojson', 'utf8'));
    
    // Load July 311 calls data
    const july311Data = JSON.parse(fs.readFileSync('public/July_Comprehensive_Category_Dataset.geojson', 'utf8'));
    
    console.log(`Loaded ${memorialMarkersData.features.length} markers`);
    console.log(`Loaded ${july311Data.features.length} July 311 calls`);
    
    // Filter 311 calls to July 8th to July 31st
    const startDate = new Date('2024-07-08');
    const endDate = new Date('2024-07-31');
    
    const filtered311Calls = july311Data.features.filter(call => {
      const callDate = new Date(call.properties['Created Date Local']);
      return callDate >= startDate && callDate <= endDate;
    });
    
    console.log(`Filtered to ${filtered311Calls.length} 311 calls from July 8th to July 31st`);
    
    // Create 1-mile radius for each marker
    const markerRadii = memorialMarkersData.features.map(marker => {
      const markerPoint = turf.point(marker.geometry.coordinates);
      const oneMileRadius = turf.circle(markerPoint, 1, { units: 'miles' });
      return {
        marker: marker,
        radius: oneMileRadius,
        point: markerPoint
      };
    });
    
    // Initialize results for each marker
    const results = memorialMarkersData.features.map(marker => ({
      marker_name: marker.properties.display_name,
      marker_type: marker.properties.marker_type,
      coordinates: marker.geometry.coordinates,
      total_calls: 0,
      call_breakdown: {},
      calls_within_1mile: 0,
      assigned_calls: [] // Track which calls were assigned to this marker
    }));
    
    // Process each 311 call
    filtered311Calls.forEach(call => {
      if (!call.geometry || !call.geometry.coordinates) return;
      
      const callPoint = turf.point(call.geometry.coordinates);
      const category = call.properties.Category || 'Unknown';
      
      // Find all markers within 1 mile of this call
      const nearbyMarkers = [];
      
      markerRadii.forEach((markerRadius, index) => {
        if (turf.booleanPointInPolygon(callPoint, markerRadius.radius)) {
          // Calculate distance to marker center
          const distance = turf.distance(callPoint, markerRadius.point, { units: 'miles' });
          nearbyMarkers.push({
            index: index,
            distance: distance,
            marker: markerRadius.marker
          });
        }
      });
      
      // If call is within range of any markers, assign to closest one
      if (nearbyMarkers.length > 0) {
        // Sort by distance (closest first)
        nearbyMarkers.sort((a, b) => a.distance - b.distance);
        const closestMarkerIndex = nearbyMarkers[0].index;
        
        // Assign call to closest marker
        results[closestMarkerIndex].total_calls++;
        results[closestMarkerIndex].call_breakdown[category] = (results[closestMarkerIndex].call_breakdown[category] || 0) + 1;
        results[closestMarkerIndex].assigned_calls.push({
          category: category,
          distance: nearbyMarkers[0].distance,
          coordinates: call.geometry.coordinates
        });
      }
    });
    
    // Calculate percentages and get top 3 categories for each marker
    results.forEach(result => {
      result.calls_within_1mile = result.total_calls;
      
      // Calculate percentages and get top 3
      const totalCalls = result.total_calls;
      if (totalCalls > 0) {
        const sortedCategories = Object.entries(result.call_breakdown)
          .sort(([,a], [,b]) => b - a) // Sort by count descending
          .slice(0, 3); // Take top 3
        
        result.top_3_categories = sortedCategories.map(([category, count]) => ({
          category: category,
          count: count,
          percentage: Math.round((count / totalCalls) * 100)
        }));
      } else {
        result.top_3_categories = [];
      }
      
      console.log(`${result.marker_name} (${result.marker_type}): ${result.total_calls} calls within 1 mile`);
      if (result.top_3_categories.length > 0) {
        result.top_3_categories.forEach(cat => {
          console.log(`  - ${cat.category}: ${cat.count} (${cat.percentage}%)`);
        });
      }
    });
    
    // Sort results by total calls (descending)
    results.sort((a, b) => b.total_calls - a.total_calls);
    
    // Save results to file
    const outputData = {
      calculation_date: new Date().toISOString(),
      date_range: {
        start: '2024-07-08',
        end: '2024-07-31'
      },
      total_311_calls_in_period: filtered311Calls.length,
      markers_analyzed: results.length,
      assignment_method: 'closest_marker_when_overlap',
      results: results
    };
    
    fs.writeFileSync('memorial_markers_311_analysis_closest.json', JSON.stringify(outputData, null, 2));
    
    console.log('\n=== SUMMARY ===');
    console.log(`Total 311 calls from July 8-31: ${filtered311Calls.length}`);
    console.log(`Markers analyzed: ${results.length}`);
    console.log('\n=== CALLS BY MARKER (sorted by total calls) ===');
    
    results.forEach(result => {
      console.log(`${result.marker_name} (${result.marker_type}): ${result.total_calls} calls`);
      if (result.top_3_categories.length > 0) {
        result.top_3_categories.forEach(cat => {
          console.log(`  - ${cat.category}: ${cat.count} (${cat.percentage}%)`);
        });
      }
    });
    
    console.log('\nResults saved to: memorial_markers_311_analysis_closest.json');
    
  } catch (error) {
    console.error('Error calculating 311 calls:', error);
  }
}

// Run the calculation
calculate311CallsClosestMarker(); 