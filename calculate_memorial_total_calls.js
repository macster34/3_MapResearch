const fs = require('fs');
const turf = require('@turf/turf');

async function calculateMemorialTotalCalls() {
  try {
    console.log('Loading data...');
    
    // Load Memorial neighborhood boundary
    const boundariesData = JSON.parse(fs.readFileSync('public/super-neighborhoods-vulnerability-index.geojson', 'utf8'));
    const memorialPolygon = boundariesData.features.find(f => f.properties.neighborhood_name === 'MEMORIAL');
    
    if (!memorialPolygon) {
      console.error('Memorial polygon not found');
      return;
    }
    
    // Load 311 calls data
    const data = JSON.parse(fs.readFileSync('public/July_Comprehensive_Category_Dataset.geojson', 'utf8'));
    
    // Filter calls for July 8-31, 2024
    const startDate = '2024-07-08';
    const endDate = '2024-07-31';
    
    const filteredCalls = data.features.filter(call => {
      const callDate = call.properties['Created Date Local'];
      if (!callDate) return false;
      
      // Check if date is within range
      const date = callDate.split('T')[0]; // Get just the date part
      return date >= startDate && date <= endDate;
    });
    
    console.log(`Total 311 calls in July 8-31: ${filteredCalls.length}`);
    
    // Filter calls within Memorial polygon
    const memorialCalls = filteredCalls.filter(call => {
      if (!call.geometry) return false;
      return turf.booleanPointInPolygon(call.geometry, memorialPolygon.geometry);
    });
    
    console.log(`Total 311 calls in Memorial neighborhood July 8-31: ${memorialCalls.length}`);
    
    // Save the result
    const result = {
      total_houston_calls: filteredCalls.length,
      total_memorial_calls: memorialCalls.length,
      date_range: `${startDate} to ${endDate}`
    };
    
    fs.writeFileSync('memorial_total_calls.json', JSON.stringify(result, null, 2));
    
    console.log('Result saved to memorial_total_calls.json');
    console.log('Memorial total calls:', memorialCalls.length);
    
  } catch (error) {
    console.error('Error calculating Memorial total calls:', error);
  }
}

calculateMemorialTotalCalls(); 