const fs = require('fs');

// Function to update memorial-markers.geojson with closest-marker 311 call data
async function updateMemorialMarkersWithClosest311Data() {
  try {
    console.log('Loading data...');
    
    // Load the original memorial markers
    const memorialMarkersData = JSON.parse(fs.readFileSync('public/memorial-markers.geojson', 'utf8'));
    
    // Load the closest-marker 311 analysis results
    const analysisData = JSON.parse(fs.readFileSync('memorial_markers_311_analysis_closest.json', 'utf8'));
    
    console.log(`Loaded ${memorialMarkersData.features.length} markers`);
    console.log(`Loaded ${analysisData.results.length} analysis results`);
    
    // Create a lookup map for the analysis results
    const analysisLookup = {};
    analysisData.results.forEach(result => {
      analysisLookup[result.marker_name] = result;
    });
    
    // Update each marker with 311 call data
    memorialMarkersData.features.forEach(marker => {
      const markerName = marker.properties.display_name;
      const analysis = analysisLookup[markerName];
      
      if (analysis) {
        // Add 311 call data to properties
        marker.properties.total_311_calls = analysis.total_calls;
        marker.properties.call_breakdown = analysis.call_breakdown;
        marker.properties.calls_within_1mile = analysis.calls_within_1mile;
        marker.properties.top_3_categories = analysis.top_3_categories;
        
        // Create enhanced popup content
        let popupContent = '';
        
        // Add original info if it exists
        if (marker.properties.popup_content && !marker.properties.popup_content.includes('311 Calls')) {
          popupContent += marker.properties.popup_content;
        }
        
        // Add 311 call information
        if (analysis.total_calls > 0) {
          // Calculate percentage of Memorial neighborhood calls in the period
          const memorialTotalCalls = 1067; // Total Memorial calls from July 8-31
          const callsPercentage = ((analysis.total_calls / memorialTotalCalls) * 100).toFixed(1);
          
          popupContent += `<div style="margin-top: 12px; padding-top: 12px; border-top: 1px solid #eee;">`;
          popupContent += `<div style="font-weight: bold; font-size: 14px; color: #fff; margin-bottom: 8px;">`;
          popupContent += `📞 311 Calls (July 8-31, 1-mile radius)`;
          popupContent += `</div>`;
          popupContent += `<div style="font-size: 16px; font-weight: bold; color: #fff; margin-bottom: 8px;">`;
          popupContent += `Total: ${analysis.total_calls} calls (${callsPercentage}% of Memorial calls)`;
          popupContent += `</div>`;
          
          // Add top 3 categories with percentages
          if (analysis.top_3_categories.length > 0) {
            popupContent += `<div style="font-size: 12px; color: #fff; line-height: 1.4;">`;
            popupContent += `<div style="font-weight: bold; margin-bottom: 4px;">Top 3 Categories:</div>`;
            analysis.top_3_categories.forEach((cat, index) => {
              const icon = cat.category === 'Storm Debris' ? '🌪️' : 
                          cat.category === 'Power Outage' ? '⚡' : 
                          cat.category === 'Flood & Drainage' ? '🌊' : 
                          cat.category === 'Traffic & Infrastructure' ? '🚧' : 
                          cat.category === 'Maintenance' ? '🔧' : 
                          cat.category === 'Nuisance & Code' ? '📋' : '📞';
              
              popupContent += `<div style="display: flex; justify-content: space-between; margin-bottom: 2px;">`;
              popupContent += `<span>${icon} ${cat.category}</span>`;
              popupContent += `<span style="font-weight: bold;">${cat.percentage}%</span>`;
              popupContent += `</div>`;
            });
            popupContent += `</div>`;
          }
          
          popupContent += `</div>`;
        } else {
          popupContent += `<div style="margin-top: 12px; padding-top: 12px; border-top: 1px solid #eee;">`;
          popupContent += `<div style="font-weight: bold; font-size: 14px; color: #fff; margin-bottom: 8px;">`;
          popupContent += `📞 311 Calls (July 8-31, 1-mile radius)`;
          popupContent += `</div>`;
          popupContent += `<div style="font-size: 12px; color: #fff; font-style: italic;">`;
          popupContent += `No calls in this period`;
          popupContent += `</div>`;
          popupContent += `</div>`;
        }
        
        // Add instruction
        popupContent += `<div style="font-size: 10px; color: #999; margin-top: 8px; font-style: italic; text-align: center;">`;
        popupContent += `Click to create 1-mile radius`;
        popupContent += `</div>`;
        
        marker.properties.popup_content = popupContent;
        
        console.log(`Updated ${markerName}: ${analysis.total_calls} calls`);
      } else {
        console.log(`No analysis data found for ${markerName}`);
      }
    });
    
    // Save the updated memorial markers
    fs.writeFileSync('public/memorial-markers.geojson', JSON.stringify(memorialMarkersData, null, 2));
    
    console.log('\nUpdated memorial-markers.geojson with closest-marker 311 call data');
    console.log('The popups will now show top 3 categories as percentages when you click on markers');
    
  } catch (error) {
    console.error('Error updating memorial markers:', error);
  }
}

// Run the update
updateMemorialMarkersWithClosest311Data(); 