import React, { useRef, useEffect, useState, useCallback } from 'react';
import mapboxgl from 'mapbox-gl';
import 'mapbox-gl/dist/mapbox-gl.css';
import { MAP_CONFIG } from './constants';
import { buildingLayers } from './constants/layerConfigs';
import { askClaude, parseClaudeResponse, LOADING_STEPS } from '../../services/claude';
import { MapContainer, LayerToggleContainer, LayerCollapseButton, ToggleButton } from './styles/MapStyles';
import { Toggle3DButton, RotateButton } from './StyledComponents';
import AIChatPanel from './AIChatPanel';
import { useAIConsensusAnimation } from './hooks/useAIConsensusAnimation';
import { useMapInitialization } from './hooks/useMapInitialization';
import { PopupManager } from './components/PopupManager';
import { 
    highlightPOIBuildings,
    initializeRoadGrid,
    loadHarveyData
} from './utils';
import { createErcotPopup } from './intel';
import LayerToggle from './components/LayerToggle';
import { mockDisagreementData } from './constants/mockData';
import { ErcotManager } from './components/ErcotManager';
import { 
    initializeRoadParticles,
    animateRoadParticles,
    stopRoadParticles
} from './hooks/mapAnimations';
import { useCensusBlocksLayer } from '../../hooks/useCensusBlocksLayer';
import { useCommunityCentersLayer } from '../../hooks/useCommunityCentersLayer';
import styled from 'styled-components';
import { useFloodPlainsLayer } from '../../hooks/useFloodPlainsLayer';
import { useFloodplainDistanceLinesLayer } from '../../hooks/useFloodplainDistanceLinesLayer';
import { calcFloodplainDistanceLines } from '../../utils/calcFloodplainDistanceLines';
import { createCommunityCenterPopup, createFloodplainDistancePopup } from './popupUtils';
import { formatCensusBlockPopup, formatTop3Ethnicities, formatCensusBlockDemographicPopup } from './popupFormatters';
import Legend from './Legend';
import { handleCommunityCenterClick as handleCommunityCenterClickEvent, handleCensusBlockClick as handleCensusBlockClickEvent } from './handlers/popupHandlers';
import VulnerabilityAnimation from './components/VulnerabilityAnimation';

// Set mapbox access token
mapboxgl.accessToken = process.env.REACT_APP_MAPBOX_ACCESS_TOKEN;

const MapComponent = () => {
  const mapContainer = useRef(null);
  const map = useRef(null);
  const roadAnimationFrame = useRef(null);
  const [messages, setMessages] = useState([]);
  const [isLoading, setIsLoading] = useState(false);
  const [loadingMessage, setLoadingMessage] = useState('Processing...');
  const [inputValue, setInputValue] = useState('');
  const [isErcotMode, setIsErcotMode] = useState(false);
  const [showRoadGrid, setShowRoadGrid] = useState(false);
  const [showMUDLayer, setShowMUDLayer] = useState(false);
  const [showHarveyData, setShowHarveyData] = useState(false);
  const [showZipCodes, setShowZipCodes] = useState(false);
  const [showZipFloodAnalysis, setShowZipFloodAnalysis] = useState(false);
  const [isLayerMenuCollapsed, setIsLayerMenuCollapsed] = useState(false);
  const [showAIConsensus, setShowAIConsensus] = useState(false);
  const [showRoadParticles, setShowRoadParticles] = useState(true);
  const [is3DActive, setIs3DActive] = useState(false);
  const [currentRotation, setCurrentRotation] = useState(0);
  const roadParticleAnimation = useRef(null);
  const [showCensusBlocks, setShowCensusBlocks] = useState(false);
  const [showCommunityCenters, setShowCommunityCenters] = useState(false);
  const [showFlood100, setShowFlood100] = useState(false);
  const [showFlood500, setShowFlood500] = useState(false);
  const [showFloodplainDistanceLines, setShowFloodplainDistanceLines] = useState(false);
  const [communityCentersData, setCommunityCentersData] = useState(null);
  const [floodplain100Data, setFloodplain100Data] = useState(null);
  const [selectedCenter, setSelectedCenter] = useState(null);
  const [isCalculating, setIsCalculating] = useState(false);
  const [distanceLinesData, setDistanceLinesData] = useState(null);
  const [showChurches, setShowChurches] = useState(false);
  
  // New vulnerability animation state
  const [showVulnerabilityAnimation, setShowVulnerabilityAnimation] = useState(false);
  const [currentAnimationMonth, setCurrentAnimationMonth] = useState(0);
  const [isVulnerabilityAnimating, setIsVulnerabilityAnimating] = useState(false);
  const [fixedInfrastructureLoaded, setFixedInfrastructureLoaded] = useState(false);
  
  // Old animation state variables (needed to prevent errors)
  const [uniqueDays, setUniqueDays] = useState([]);
  const [animationTime, setAnimationTime] = useState(null);
  const [isAnimating, setIsAnimating] = useState(false);
  const [animationRange, setAnimationRange] = useState([null, null]);
  const [allDebrisFeatures, setAllDebrisFeatures] = useState([]);
  const [all311Features, setAll311Features] = useState([]);
  
  // Missing state variables that are referenced in the code
  const [showTreeDebris, setShowTreeDebris] = useState(false);
  const [show311Calls, setShow311Calls] = useState(false);
  const [showAugust311Calls, setShowAugust311Calls] = useState(false);
  const [showJune311Calls, setShowJune311Calls] = useState(false);
  const [showJuly311Calls, setShowJuly311Calls] = useState(false);
  const [showSuperNeighborhoods, setShowSuperNeighborhoods] = useState(false);
  const [showMedianIncome2022, setShowMedianIncome2022] = useState(false);
  const [showVulnerabilityIndex, setShowVulnerabilityIndex] = useState(false);
  
  // Animation timer ref
  const animationTimerRef = useRef(null);

  // Add these refs for drag functionality
  const isDraggingRef = useRef(false);
  const currentXRef = useRef(0);
  const currentYRef = useRef(0);
  const initialXRef = useRef(0);
  const initialYRef = useRef(0);
  const xOffsetRef = useRef(0);
  const yOffsetRef = useRef(0);
  const popupRef = useRef(null);

  // --- DERIVED STATE: Determine visibility based on toggles ---
  const isCommunityCentersVisible = showCommunityCenters || showFloodplainDistanceLines;
  const isFlood100Visible = showFlood100 || showFloodplainDistanceLines;

  const { initializeParticleLayer, generateParticles } = useAIConsensusAnimation(map, showAIConsensus, mockDisagreementData);
  useMapInitialization(map, mapContainer);

  const ercotManagerRef = useRef(null);

  const handleCommunityCenterClick = useCallback((feature, lngLat, showFloodplainDistanceLinesArg) => {
    handleCommunityCenterClickEvent({
      map,
      showFloodplainDistanceLines: showFloodplainDistanceLinesArg,
      setIsCalculating,
      setSelectedCenter,
      createFloodplainDistancePopup,
      createCommunityCenterPopup,
      feature,
      lngLat,
      distanceLinesData
    });
  }, [map, distanceLinesData, setSelectedCenter, setIsCalculating]);

  // Handler for census block click
  useCensusBlocksLayer(map, showCensusBlocks, (feature, lngLat) =>
    handleCensusBlockClickEvent({
      map,
      formatCensusBlockPopup,
      feature,
      lngLat
    })
  );

  useCommunityCentersLayer(
    map,
    isCommunityCentersVisible,
    communityCentersData,
    handleCommunityCenterClick,
    showFloodplainDistanceLines
  );

  useFloodPlainsLayer(map, isFlood100Visible, showFlood500);

  // Load community centers, floodplain data, and precomputed lines once
  useEffect(() => {
    const fetchData = async () => {
      try {
        const [ccRes, fpRes, linesRes] = await Promise.all([
          fetch('/houston-community-centers-vulnerability-4326.geojson'),
          fetch('/houston-texas-flood-100-500.geojson'),
          fetch('/houston-texas-community-centers-distance-lines.geojson')
        ]);
        if (!ccRes.ok || !fpRes.ok || !linesRes.ok) {
          throw new Error('One or more data files not found or not accessible');
        }
        const ccData = await ccRes.json();
        const fpData = await fpRes.json();
        const linesData = await linesRes.json();
        // Only keep 100-year floodplain polygons
        const flood100 = {
          ...fpData,
          features: fpData.features.filter(f =>
            ['AE', 'A', 'AO', 'VE'].includes(f.properties.FLD_ZONE)
          )
        };
        setCommunityCentersData(ccData);
        setFloodplain100Data(flood100);
        setDistanceLinesData(linesData);
        console.log('Floodplain data loaded:', flood100);
      } catch (e) {
        console.error('Error loading community centers, floodplain, or lines data:', e);
        setCommunityCentersData(null);
        setFloodplain100Data(null);
        setDistanceLinesData(null);
      }
    };
    fetchData();
  }, []);

  useEffect(() => {
    console.log('Floodplain Distance Lines toggle changed:', showFloodplainDistanceLines);
  }, [showFloodplainDistanceLines]);

  // Add this effect for road particles
  useEffect(() => {
    if (!map.current) return;

    const initializeParticles = async () => {
      try {
        // Wait for style to fully load
        if (!map.current.isStyleLoaded()) {
          await new Promise(resolve => {
            map.current.once('style.load', resolve);
          });
        }

        if (showRoadParticles) {
          console.log('Starting road particles animation...');
          initializeRoadParticles(map.current);
          roadParticleAnimation.current = animateRoadParticles({ map: map.current });
        } else {
          if (roadParticleAnimation.current) {
            stopRoadParticles(map.current);
            cancelAnimationFrame(roadParticleAnimation.current);
            roadParticleAnimation.current = null;
          }
        }
      } catch (error) {
        console.error('Failed to initialize road particles:', error);
      }
    };

    // Initialize when map is ready
    if (map.current.loaded()) {
      initializeParticles();
    } else {
      map.current.once('load', initializeParticles);
    }

    return () => {
      if (roadParticleAnimation.current) {
        cancelAnimationFrame(roadParticleAnimation.current);
        roadParticleAnimation.current = null;
      }
    };
  }, [showRoadParticles]);

  // Add cleanup effect
  useEffect(() => {
    return () => {
      if (roadParticleAnimation.current) {
        cancelAnimationFrame(roadParticleAnimation.current);
        roadParticleAnimation.current = null;
      }
    };
  }, []);

  const handleQuestion = async (question) => {
    setIsLoading(true);
    setMessages(prev => [...prev, { isUser: true, content: question }]);

    try {
      const bounds = map.current.getBounds();
      const mapBounds = {
        sw: bounds.getSouthWest(),
        ne: bounds.getNorthEast()
      };

      const response = await askClaude(question, {}, mapBounds);
      const parsedResponse = parseClaudeResponse(response);

      if (parsedResponse.mainText !== "Could not process the response. Please try again.") {
        setMessages(prev => [...prev, {
          isUser: false,
          content: parsedResponse
        }]);
        
        handleLLMResponse(parsedResponse);
      } else {
        throw new Error('Failed to parse response');
      }
    } catch (error) {
      console.error('Error in handleQuestion:', error);
      setMessages(prev => [...prev, {
        isUser: false,
        content: {
          mainText: "I apologize, but I encountered an error processing your request. Please try asking your question again.",
          poiInfo: null,
          followUps: []
        }
      }]);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    if (map.current) return;

    // Remove duplicate initialization since it's handled in useMapInitialization
    const handleMapLoad = async () => {
      if (!map.current.isStyleLoaded()) {
        await new Promise(resolve => map.current.once('style.load', resolve));
      }

      // Style water in the base map layers
      const waterLayers = [
        'water',
        'water-shadow',
        'waterway',
        'water-depth',
        'water-pattern'
      ];

      waterLayers.forEach(layerId => {
        if (!map.current.getLayer(layerId)) return;

        try {
          const layer = map.current.getLayer(layerId);
          if (!layer) return;

          // Handle fill layers
          if (layer.type === 'fill') {
            map.current.setPaintProperty(layerId, 'fill-color', '#0088cc');
            map.current.setPaintProperty(layerId, 'fill-opacity', 0.8);
          }
          
          // Handle line layers
          if (layer.type === 'line') {
            map.current.setPaintProperty(layerId, 'line-color', '#0088cc');
            map.current.setPaintProperty(layerId, 'line-opacity', 0.8);
          }
        } catch (error) {
          console.warn(`Could not style water layer ${layerId}:`, error);
        }
      });

      // Style parks and green areas
      const parkLayers = [
        'landuse',
        'park',
        'park-label',
        'national-park',
        'natural',
        'golf-course',
        'pitch',
        'grass'
      ];

      parkLayers.forEach(layerId => {
        if (!map.current.getLayer(layerId)) return;

        try {
          const layer = map.current.getLayer(layerId);
          if (!layer) return;

          if (layer.type === 'fill') {
            map.current.setPaintProperty(layerId, 'fill-color', '#3a9688');
            map.current.setPaintProperty(layerId, 'fill-opacity', 0.4);
          }
          if (layer.type === 'symbol' && map.current.getPaintProperty(layerId, 'background-color') !== undefined) {
            map.current.setPaintProperty(layerId, 'background-color', '#3a9688');
          }
        } catch (error) {
          console.warn(`Could not style park layer ${layerId}:`, error);
        }
      });
    };

    if (map.current) {
      handleMapLoad();
    } else {
      map.current.once('load', handleMapLoad);
    }
  }, [isErcotMode]);

  // Add cleanup effect for AI consensus animation
  useEffect(() => {
    if (!map.current) return;

    return () => {
      // Clean up AI consensus particles layer
      if (map.current.getLayer('ai-consensus-particles')) {
        map.current.removeLayer('ai-consensus-particles');
      }
      if (map.current.getSource('ai-consensus-particles')) {
        map.current.removeSource('ai-consensus-particles');
      }
    };
  }, []);

  const handleLLMResponse = (response) => {
    if (!map.current) return;

    const clearExistingElements = () => {
      const existingElements = document.querySelectorAll('.mapboxgl-popup, .callout-annotation, .mapboxgl-marker');
      existingElements.forEach(el => el.remove());
      
      if (map.current.getSource('area-highlights')) {
        map.current.getSource('area-highlights').setData({
          type: 'FeatureCollection',
          features: []
        });
      }
    };

    clearExistingElements();

    if (response?.coordinates) {
      map.current.flyTo({
        center: response.coordinates,
        zoom: response.zoomLevel,
        duration: 1000
      });

      map.current.once('moveend', () => {
        map.current.once('idle', () => {
          highlightPOIBuildings(['restaurant', 'bar', 'nightclub'], '#FF4500');
          
          if (map.current) {
            map.current.setLayoutProperty('houston-pois', 'visibility', 'none');
          }
        });
      });
    }
  };

  const dragStart = (e) => {
    if (e.type === "mousedown") {
      isDraggingRef.current = true;
      initialXRef.current = e.clientX - xOffsetRef.current;
      initialYRef.current = e.clientY - yOffsetRef.current;
    } else if (e.type === "touchstart") {
      isDraggingRef.current = true;
      initialXRef.current = e.touches[0].clientX - xOffsetRef.current;
      initialYRef.current = e.touches[0].clientY - yOffsetRef.current;
    }
  };

  const dragEnd = () => {
    isDraggingRef.current = false;
    initialXRef.current = currentXRef.current;
    initialYRef.current = currentYRef.current;
  };

  const drag = (e) => {
    if (isDraggingRef.current) {
      e.preventDefault();
      
      if (e.type === "mousemove") {
        currentXRef.current = e.clientX - initialXRef.current;
        currentYRef.current = e.clientY - initialXRef.current;
      } else if (e.type === "touchmove") {
        currentXRef.current = e.touches[0].clientX - initialXRef.current;
        currentYRef.current = e.touches[0].clientY - initialXRef.current;
      }

      xOffsetRef.current = currentXRef.current;
      yOffsetRef.current = currentYRef.current;
      
      if (popupRef.current) {
        popupRef.current.style.transform = 
          `translate3d(${currentXRef.current}px, ${currentYRef.current}px, 0)`;
      }
    }
  };

  useEffect(() => {
    if (!map.current) return;

    // Update bounds whenever the map moves
    const updateBounds = () => {
      const bounds = map.current.getBounds();
    };

    map.current.on('moveend', updateBounds);
    // Get initial bounds
    updateBounds();

    return () => {
      if (map.current) {
        map.current.off('moveend', updateBounds);
      }
    };
  }, []);

  useEffect(() => {
    if (!map.current) return;

    // Add touch event handlers
    const handleTouchStart = (e) => {
      if (!e || !e.touches) return;
      
      if (e.touches.length === 2) {
        e.preventDefault(); // Prevent default zoom behavior
      }
    };

    const handleTouchMove = (e) => {
      if (!e || !e.touches) return;
      
      if (e.touches.length === 2) {
        e.preventDefault();
      }
    };

    // Add the event listeners to the canvas container
    const mapCanvas = map.current.getCanvas();
    if (mapCanvas) {
      mapCanvas.addEventListener('touchstart', handleTouchStart, { passive: false });
      mapCanvas.addEventListener('touchmove', handleTouchMove, { passive: false });

      return () => {
        mapCanvas.removeEventListener('touchstart', handleTouchStart);
        mapCanvas.removeEventListener('touchmove', handleTouchMove);
      };
    }
  }, []);

  // Add the toggle3D function
  const toggle3D = () => {
    if (!map.current) return;
    
    const newPitch = is3DActive ? 0 : 60;
    
    map.current.easeTo({
      pitch: newPitch,
      duration: 1000
    });
    
    setIs3DActive(!is3DActive);
  };
  
  // Add the rotate function
  const rotateMap = () => {
    if (!map.current) return;
    
    // Increment rotation by 90 degrees (π/2 radians)
    const newRotation = (currentRotation + 90) % 360;
    
    map.current.easeTo({
      bearing: newRotation,
      duration: 1000
    });
    
    setCurrentRotation(newRotation);
  };

  // Add 2-mile radius circles for community centers
  // useEffect(() => {
  //   if (!map.current) return;
  //   const sourceId = 'community-center-2mile-circles';
  //   const layerId = 'community-center-2mile-circles';

  //   if (showGasStations) {
  //     // Add source/layer if not exists
  //     if (!map.current.getSource(sourceId)) {
  //       fetch('/community_center_2mile_circles.geojson')
  //         .then(res => res.json())
  //         .then(data => {
  //           map.current.addSource(sourceId, {
  //             type: 'geojson',
  //             data
  //           });
  //           map.current.addLayer({
  //             id: layerId,
  //             type: 'line',
  //             source: sourceId,
  //             paint: {
  //               'line-color': '#FF0000',
  //               'line-width': 4,
  //               'line-opacity': 1.0
  //             },
  //             layout: { visibility: 'visible' }
  //           });
  //         });
  //     } else {
  //       map.current.setLayoutProperty(layerId, 'visibility', 'visible');
  //     }
  //   } else {
  //     // Hide or remove the layer/source
  //     if (map.current.getLayer(layerId)) {
  //       map.current.removeLayer(layerId);
  //     }
  //     if (map.current.getSource(sourceId)) {
  //       map.current.removeSource(sourceId);
  //     }
  //   }
  // }, [showGasStations, map]);

  // Gas Stations (1 Mile) markers and circles
  // useEffect(() => {
  //   console.log('1-mile gas station useEffect running, showGasStations1Mile:', showGasStations1Mile);
  //   if (!map.current) return;
  //   const sourceId = 'gas-stations-1mile';
  //   const layerId = 'gas-stations-1mile';
  //   const reviewedSourceId = 'gas-stations-1mile-reviewed';
  //   const reviewedLayerId = 'gas-stations-1mile-reviewed';

  //   if (showGasStations1Mile) {
  //     // Add gas stations source/layer if not exists (semi-transparent blue markers - no July reviews)
  //     if (!map.current.getSource(sourceId)) {
  //       fetch('/gas_stations_1mile_no_july_reviews.geojson')
  //         .then(res => {
  //           console.log('Fetched no_july_reviews.geojson:', res);
  //           return res.json();
  //         })
  //         .then(data => {
  //           console.log('Loaded no_july_reviews.geojson data:', data);
  //           map.current.addSource(sourceId, {
  //             type: 'geojson',
  //             data
  //           });
  //           console.log('Added source:', sourceId);
  //           map.current.addLayer({
  //             id: layerId,
  //             type: 'circle',
  //             source: sourceId,
  //             paint: {
  //               'circle-radius': 7,
  //               'circle-color': '#005577',
  //               'circle-blur': 0.2,
  //               'circle-opacity': 0.6, // Semi-transparent
  //               'circle-stroke-width': 1,
  //               'circle-stroke-color': '#fff',
  //               'circle-stroke-opacity': 0.4
  //             },
  //             layout: { visibility: 'visible' }
  //           });
  //           console.log('Added layer:', layerId);
  //         });
  //     } else {
  //       map.current.setLayoutProperty(layerId, 'visibility', 'visible');
  //     }
  //     // Add reviewed gas stations source/layer if not exists (glowing blue markers - with July reviews)
  //     if (!map.current.getSource(reviewedSourceId)) {
  //       fetch('/gas_stations_1mile_july_reviews.geojson')
  //         .then(res => {
  //           console.log('Fetched july_reviews.geojson:', res);
  //           return res.json();
  //         })
  //         .then(data => {
  //           console.log('Loaded july_reviews.geojson data:', data);
  //           map.current.addSource(reviewedSourceId, {
  //             type: 'geojson',
  //             data
  //           });
  //           console.log('Added source:', reviewedSourceId);
  //           map.current.addLayer({
  //             id: reviewedLayerId,
  //             type: 'circle',
  //             source: reviewedSourceId,
  //             paint: {
  //               'circle-radius': 8,
  //               'circle-color': '#00eaff', // Glowing blue
  //               'circle-blur': 0.8, // More blur for glow effect
  //               'circle-opacity': 0.95,
  //               'circle-stroke-width': 3,
  //               'circle-stroke-color': '#fff',
  //               'circle-stroke-opacity': 0.9
  //             },
  //             layout: { visibility: 'visible' }
  //           });
  //           console.log('Added layer:', reviewedLayerId);
  //           // Move reviewed layer above blue markers
  //           map.current.moveLayer(reviewedLayerId);
  //         });
  //     } else {
  //       map.current.setLayoutProperty(reviewedLayerId, 'visibility', 'visible');
  //       map.current.moveLayer(reviewedLayerId);
  //     }
  //   } else {
  //     // Remove/hide gas stations layer/source
  //     if (map.current.getLayer(layerId)) {
  //       map.current.removeLayer(layerId);
  //     }
  //     if (map.current.getSource(sourceId)) {
  //       map.current.removeSource(sourceId);
  //     }
  //     // Remove/hide reviewed gas stations layer/source
  //     if (map.current.getLayer(reviewedLayerId)) {
  //       map.current.removeLayer(reviewedLayerId);
  //     }
  //   }
  // }, [showGasStations2Mile, map]);

  // Add click handler for reviewed 2-mile gas stations
  useEffect(() => {
    if (!map.current) return;
    const sourceId = 'churches';
    const layerId = 'churches';

    if (showChurches) {
      if (!map.current.getSource(sourceId)) {
        fetch('/houston_churches_with_grace.geojson')
          .then(res => res.json())
          .then(data => {
            map.current.addSource(sourceId, {
              type: 'geojson',
              data
            });
            map.current.addLayer({
              id: layerId,
              type: 'circle',
              source: sourceId,
              paint: {
                'circle-color': '#8e44ad',
                'circle-radius': [
                  'case',
                  ['all', ['has', 'area_sq_ft'], ['>', ['to-number', ['get', 'area_sq_ft']], 0]],
                  [
                    'interpolate',
                    ['linear'],
                    ['to-number', ['get', 'area_sq_ft'], 0],
                    0, 4,
                    2000, 6,
                    5000, 8,
                    10000, 12,
                    20000, 16
                  ],
                  6
                ],
                'circle-blur': 0.2,
                'circle-opacity': 0.8,
                'circle-stroke-width': 0
              },
              layout: { visibility: 'visible' }
            });
          });
      } else {
        map.current.setLayoutProperty(layerId, 'visibility', 'visible');
      }
    } else {
      if (map.current.getLayer(layerId)) {
        map.current.setLayoutProperty(layerId, 'visibility', 'none');
      }
      }
  }, [showChurches, map]);

  // Helper to get min/max created_date from 311 data and store all features and unique days
  useEffect(() => {
    fetch('/311_power_outages_Beryl_refined.geojson')
      .then(res => res.json())
      .then(data => {
        const dates = data.features.map(f => new Date(f.properties.created_date));
        const minDate = new Date(Math.min(...dates));
        const maxDate = new Date(Math.max(...dates));
        setAnimationRange([minDate, maxDate]);
        setAnimationTime(null); // Start with no markers visible
        setAll311Features(data.features);
        // Calculate unique days
        const daySet = new Set(dates.map(d => d.toISOString().slice(0, 10)));
        const sortedDays = Array.from(daySet).sort();
        setUniqueDays(sortedDays);
        console.log('[311 Animation] Data loaded, starting with no markers visible');
      });
  }, []);

  // Load debris GeoJSON for animation (on mount) - DISABLED
  // useEffect(() => {
  //   fetch('/debris_calls_2024-07-08_to_2024-07-30.geojson')
  //     .then(res => res.json())
  //     .then(data => {
  //       setAllDebrisFeatures(data.features);
  //       console.log('[DEBUG] Loaded debris features:', data.features.length, data.features.slice(0, 2));
  //     });
  // }, []);

  // 1. Create debris animation source/layer when map and data are ready - DISABLED
  // useEffect(() => {
  //   if (!map.current || !allDebrisFeatures.length) return;
  //   const sourceId = 'debris-animation';
  //   const layerId = 'debris-animation';
  //   // Only create if source doesn't exist
  //   if (!map.current.getSource(sourceId)) {
  //     const geojson = { type: 'FeatureCollection', features: [] };
  //     if (map.current.isStyleLoaded()) {
  //       map.current.addSource(sourceId, { type: 'geojson', data: geojson });
  //       map.current.addLayer({
  //       id: layerId,
  //       type: 'circle',
  //       source: sourceId,
  //       paint: {
  //         'circle-radius': 4,
  //         'circle-color': '#39FF14',
  //         'circle-blur': 0.2,
  //         'circle-opacity': 0.85
  //       },
  //       layout: { visibility: 'visible' }
  //     });
  //   } else {
  //     map.current.once('style.load', () => {
  //       map.current.addSource(sourceId, { type: 'geojson', data: geojson });
  //       map.current.addLayer({
  //         id: layerId,
  //         type: 'circle',
  //         source: sourceId,
  //         paint: {
  //           'circle-radius': 4,
  //           'circle-color': '#39FF14',
  //           'circle-blur': 0.2,
  //           'circle-opacity': 0.85
  //         },
  //         layout: { visibility: 'visible' }
  //       });
  //     });
  //   }
  // }, [map, allDebrisFeatures]);

  // 1. Create source/layer when map and data are ready
//   useEffect(() => {
//     if (!map.current || !all311Features.length) return;
//     const sourceId = 'power-outages-beryl';
//     const layerId = 'power-outages-beryl';
//     
//     // Only create if source doesn't exist
//     if (!map.current.getSource(sourceId)) {
//       const geojson = { type: 'FeatureCollection', features: [] };
//       
//       // Wait for style to be loaded
//       if (map.current.isStyleLoaded()) {
//         map.current.addSource(sourceId, { type: 'geojson', data: geojson });
//         map.current.addLayer({
//           id: layerId,
//           type: 'circle',
//           source: sourceId,
//           paint: {
//             'circle-radius': 7,
//             'circle-color': '#ff3333',
//             'circle-blur': 0.2,
//             'circle-opacity': 0.7,
//             'circle-stroke-width': 1,
//             'circle-stroke-color': '#fff',
//             'circle-stroke-opacity': 0.7
//           },
//           layout: { visibility: 'visible' }
//         });
//         console.log('[311 Animation] Source/layer created');
//       } else {
//         map.current.once('style.load', () => {
//           map.current.addSource(sourceId, { type: 'geojson', data: geojson });
//           map.current.addLayer({
//             id: layerId,
//             type: 'circle',
//             source: sourceId,
//             paint: {
//               'circle-radius': 7,
//               'circle-color': '#ff3333',
//               'circle-blur': 0.2,
//               'circle-opacity': 0.7,
//               'circle-stroke-width': 1,
//               'circle-stroke-color': '#fff',
//               'circle-stroke-opacity': 0.7
//             },
//             layout: { visibility: 'visible' }
//           });
//           console.log('[311 Animation] Source/layer created after style load');
//         });
//       }
//     }
//   }, [map, all311Features]);
// 
//   // Alternative source creation when map is ready
//   useEffect(() => {
//     if (!map.current) return;
//     
//     const createSourceIfNeeded = () => {
//       const sourceId = 'power-outages-beryl';
//       const layerId = 'power-outages-beryl';
//       
//       if (!map.current.getSource(sourceId) && all311Features.length > 0) {
//         const geojson = { type: 'FeatureCollection', features: [] };
//         map.current.addSource(sourceId, { type: 'geojson', data: geojson });
//         map.current.addLayer({
//           id: layerId,
//           type: 'circle',
//           source: sourceId,
//           paint: {
//             'circle-radius': 7,
//             'circle-color': '#ff3333',
//             'circle-blur': 0.2,
//             'circle-opacity': 0.7,
//             'circle-stroke-width': 1,
//             'circle-stroke-color': '#fff',
//             'circle-stroke-opacity': 0.7
//           },
//           layout: { visibility: 'visible' }
//         });
//         console.log('[311 Animation] Source/layer created in alternative effect');
//       }
//     };
// 
//     if (map.current.isStyleLoaded()) {
//       createSourceIfNeeded();
//     } else {
//       map.current.once('style.load', createSourceIfNeeded);
//     }
//   }, [map, all311Features]);
// 
//   // 2. Update data for both power outage and debris animation layers when animationTime changes
//   useEffect(() => {
//     if (!map.current) return;
//     // Power outage layer
//     if (all311Features.length) {
//       const sourceId = 'power-outages-beryl';
//       const source = map.current.getSource(sourceId);
//       if (source) {
//         const filtered = animationTime
//           ? all311Features.filter(f => new Date(f.properties.created_date) <= animationTime)
//           : [];
//         const geojson = { type: 'FeatureCollection', features: filtered };
//         source.setData(geojson);
//       }
//     }
//     // Debris layer
//     if (allDebrisFeatures.length) {
//       const sourceId = 'debris-animation';
//       const source = map.current.getSource(sourceId);
//       if (source) {
//         const filtered = animationTime
//           ? allDebrisFeatures.filter(f => new Date(f.properties.created_date) <= animationTime)
//           : [];
//         const geojson = { type: 'FeatureCollection', features: filtered };
//         source.setData(geojson);
//       }
//     }
//   }, [animationTime, all311Features, allDebrisFeatures, map]);
// 
//   // 3. Animation logic: by day, stop at end, hide all markers when finished
//   useEffect(() => {
//     if (!isAnimating || !animationRange[0] || !animationRange[1] || uniqueDays.length === 0) return;
//     
//     // Check if source exists before starting animation
//     const sourceId = 'power-outages-beryl';
//     if (!map.current || !map.current.getSource(sourceId)) {
//       console.log('[311 Animation] Source not found, cannot start animation');
//       setIsAnimating(false);
//       return;
//     }
//     
//     const steps = uniqueDays.length;
//     const stepMs = 1000;
//     let currentStep = uniqueDays.findIndex(day => animationTime && animationTime.toISOString().slice(0, 10) === day);
// 
//     function animateStep() {
//       if (!isAnimating) return;
//       
//       // Check if source still exists
//       if (!map.current || !map.current.getSource(sourceId)) {
//         console.log('[311 Animation] Source lost during animation, stopping');
//         setIsAnimating(false);
//         return;
//       }
//       
//       currentStep++;
//       if (currentStep >= steps) {
//         setIsAnimating(false);
//         setAnimationTime(null); // Hide all markers when animation ends
//         console.log('[311 Animation] Animation finished. All markers hidden. User must hit play to restart.');
//         return;
//       }
//       setAnimationTime(new Date(uniqueDays[currentStep] + 'T23:59:59'));
//       animationTimerRef.current = setTimeout(animateStep, stepMs);
//     }
//     animationTimerRef.current = setTimeout(animateStep, stepMs);
//     return () => clearTimeout(animationTimerRef.current);
//   }, [isAnimating, animationRange, animationTime, uniqueDays, map]);
// 
  // --- Cumulative call count logic for sliders ---
  const [outageCumulativeCounts, setOutageCumulativeCounts] = useState([]);
  const [debrisCumulativeCounts, setDebrisCumulativeCounts] = useState([]);
  const [outageDayToCount, setOutageDayToCount] = useState([]);
  const [debrisDayToCount, setDebrisDayToCount] = useState([]);
// 
//   // Compute unique days and cumulative counts for each dataset
  useEffect(() => {
    if (!all311Features.length) return;
    const days = Array.from(new Set(all311Features.map(f => f.properties.created_date.slice(0, 10)))).sort();
    let cum = 0;
    const counts = days.map(day => {
      const count = all311Features.filter(f => f.properties.created_date.slice(0, 10) === day).length;
      cum += count;
      return cum;
    });
    setOutageCumulativeCounts(counts);
    setOutageDayToCount(days.map((day, i) => ({ day, count: counts[i] })));
  }, [all311Features]);

  useEffect(() => {
    if (!allDebrisFeatures.length) return;
    const days = Array.from(new Set(allDebrisFeatures.map(f => f.properties.created_date.slice(0, 10)))).sort();
    let cum = 0;
    const counts = days.map(day => {
      const count = allDebrisFeatures.filter(f => f.properties.created_date.slice(0, 10) === day).length;
      cum += count;
      return cum;
    });
    setDebrisCumulativeCounts(counts);
    setDebrisDayToCount(days.map((day, i) => ({ day, count: counts[i] })));
  }, [allDebrisFeatures]);

  // Helper to get the day for a given cumulative count (for slider interaction)
  function getDayForCumulativeCount(dayToCountArr, value) {
    for (let i = 0; i < dayToCountArr.length; i++) {
      if (value <= dayToCountArr[i].count) {
        return dayToCountArr[i].day;
      }
    }
    return dayToCountArr[dayToCountArr.length - 1]?.day;
  }

  // --- Slider change handlers ---
  const handleOutageSliderChange = (e) => {
    const value = Number(e.target.value);
    setIsAnimating(false);
    if (outageDayToCount.length) {
      const day = getDayForCumulativeCount(outageDayToCount, value);
      if (day) setAnimationTime(new Date(day + 'T23:59:59'));
    }
  };
  const handleDebrisSliderChange = (e) => {
    const value = Number(e.target.value);
    setIsAnimating(false);
    if (debrisDayToCount.length) {
      const day = getDayForCumulativeCount(debrisDayToCount, value);
      if (day) setAnimationTime(new Date(day + 'T23:59:59'));
    }
  };

  // Slider: snap to days (end of day)
  const handleSliderChange = (e) => {
    const idx = Number(e.target.value);
    setAnimationTime(new Date(uniqueDays[idx] + 'T23:59:59'));
    setIsAnimating(false);
  };

  // Utility to set layer visibility
  const setLayerVisibility = (layerId, visible) => {
    if (map.current && map.current.getLayer(layerId)) {
      map.current.setLayoutProperty(layerId, 'visibility', visible ? 'visible' : 'none');
    }
  };

  // Show/hide animation-related layers
  const showAnimationLayers = () => {
    setLayerVisibility('community-center-1mile-circles', true);
    setLayerVisibility('churches', true);
    setLayerVisibility('community-centers', true); // Updated to 'community-centers'
  };
  const hideAnimationLayers = () => {
    setLayerVisibility('community-center-1mile-circles', false);
    setLayerVisibility('churches', false);
    setLayerVisibility('community-centers', false); // Updated to 'community-centers'
  };

  // --- Animation-specific marker logic (independent of sidebar) ---
  const ANIMATION_LAYERS = [
    {
      sourceId: 'animation-community-centers',
      layerId: 'animation-community-centers',
      url: '/houston-community-centers-vulnerability-4326.geojson',
      type: 'circle',
      paint: {
        'circle-radius': [
          'case',
          ['all', ['has', 'Square_Foo'], ['>', ['to-number', ['get', 'Square_Foo']], 0]],
            [
              'interpolate',
              ['linear'],
              ['to-number', ['get', 'Square_Foo'], 0],
              0, 4.8,
              2000, 6.4,
              5000, 9.6,
              10000, 14.4,
              20000, 19.2
            ],
            6.4
        ],
        'circle-color': '#FF00B7',
        'circle-stroke-width': 0,
        'circle-opacity': [
          'interpolate',
          ['linear'],
          ['get', 'vulnerability'],
          0, 0.1,
          1, 1.0
        ]
      }
    },
    {
      sourceId: 'animation-churches',
      layerId: 'animation-churches',
      url: '/houston_churches_with_grace.geojson',
      type: 'circle',
      paint: {
        'circle-color': '#8e44ad',
        'circle-radius': [
          'case',
          ['all', ['has', 'area_sq_ft'], ['>', ['to-number', ['get', 'area_sq_ft']], 0]],
          [
            'interpolate',
            ['linear'],
            ['to-number', ['get', 'area_sq_ft'], 0],
            0, 4,
            2000, 6,
            5000, 8,
            10000, 12,
            20000, 16
          ],
          6
        ],
        'circle-blur': 0.2,
        'circle-opacity': 0.8,
        'circle-stroke-width': 0
      }
    },
    {
      sourceId: 'animation-1mile-circles',
      layerId: 'animation-1mile-circles',
      url: '/community_center_1mile_circles.geojson',
      type: 'line',
      paint: {
        'line-color': '#fff',
        'line-width': 2,
        'line-dasharray': [2, 4],
        'line-opacity': 1
      }
    }
  ];

  // Add animation layers
  const addAnimationLayers = async () => {
    if (!map.current) return;
    for (const { sourceId, layerId, url, type, paint } of ANIMATION_LAYERS) {
      // Fetch data
      let data;
      try {
        const res = await fetch(url);
        data = await res.json();
      } catch (e) {
        console.error(`[Animation] Failed to fetch ${url}:`, e);
        continue;
      }
      // Add source if not present
      if (!map.current.getSource(sourceId)) {
        map.current.addSource(sourceId, { type: 'geojson', data });
      } else {
        map.current.getSource(sourceId).setData(data);
      }
      // Add layer if not present
      if (!map.current.getLayer(layerId)) {
        map.current.addLayer({
          id: layerId,
          type,
          source: sourceId,
          paint,
          layout: { visibility: 'visible' }
        });
      } else {
        map.current.setLayoutProperty(layerId, 'visibility', 'visible');
      }
    }
  };

  // Remove animation layers
  const removeAnimationLayers = () => {
    if (!map.current) return;
    for (const { sourceId, layerId } of ANIMATION_LAYERS) {
      if (map.current.getLayer(layerId)) {
        map.current.removeLayer(layerId);
      }
      if (map.current.getSource(sourceId)) {
        map.current.removeSource(sourceId);
      }
    }
    // Remove debris animation layer
    if (map.current.getLayer('debris-animation')) map.current.removeLayer('debris-animation');
    if (map.current.getSource('debris-animation')) map.current.removeSource('debris-animation');
  };

  // Update handlePlayPause to use new logic
  const handlePlayPause = async () => {
    if (!isAnimating) {
      // Ensure power outage source exists before starting animation
      const sourceId = 'power-outages-beryl';
      const layerId = 'power-outages-beryl';
      if (!map.current.getSource(sourceId) && all311Features.length > 0) {
        console.log('[311 Animation] Creating source on play button click');
        const geojson = { type: 'FeatureCollection', features: [] };
        map.current.addSource(sourceId, { type: 'geojson', data: geojson });
        map.current.addLayer({
          id: layerId,
          type: 'circle',
          source: sourceId,
          paint: {
            'circle-radius': 7,
            'circle-color': '#ff3333',
            'circle-blur': 0.2,
            'circle-opacity': 0.7,
            'circle-stroke-width': 1,
            'circle-stroke-color': '#fff',
            'circle-stroke-opacity': 0.7
          },
          layout: { visibility: 'visible' }
        });
      }
      // Ensure debris animation source/layer exists before starting animation - DISABLED
      // const debrisSourceId = 'debris-animation';
      // const debrisLayerId = 'debris-animation';
      // if (!map.current.getSource(debrisSourceId) && allDebrisFeatures.length > 0) {
      //   console.log('[Debris Animation] Creating source on play button click');
      //   const geojson = { type: 'FeatureCollection', features: [] };
      //   map.current.addSource(debrisSourceId, { type: 'geojson', data: geojson });
      //   map.current.addLayer({
      //     id: debrisLayerId,
      //     type: 'circle',
      //     source: debrisSourceId,
      //     paint: {
      //       'circle-radius': 4,
      //       'circle-color': '#39FF14',
      //       'circle-blur': 0.2,
      //       'circle-opacity': 0.85
      //     },
      //     layout: { visibility: 'visible' }
      //   });
      // }
      // Add animation marker layers
      // await addAnimationLayers(); // DISABLED - old animation system
      if (animationTime === null && uniqueDays.length > 0) {
        setAnimationTime(new Date(uniqueDays[0] + 'T23:59:59'));
      }
      setIsAnimating(true);
    } else {
      setIsAnimating(false);
      // Remove animation marker layers
      // removeAnimationLayers(); // DISABLED - old animation system
    }
  };

  // Also remove animation layers when animation ends
  // useEffect(() => {
  //   if (!isAnimating) {
  //     removeAnimationLayers();
  //   }
  // }, [isAnimating]);

  // 2. Add useEffect for Tree Debris markers and 1-mile circles - DISABLED
  // useEffect(() => {
  //   if (!map.current) return;
  //   const debrisSourceId = 'tree-debris';
  //   const debrisLayerId = 'tree-debris';
  //   const circleSourceId = 'tree-debris-1mile-circles';
  //   const circleLayerId = 'tree-debris-1mile-circles';

  //   if (showTreeDebris) {
  //     // Add debris markers without clustering
  //     if (!map.current.getSource(debrisSourceId)) {
  //       fetch('/debris_calls_2024-07-08_to_2024-07-30.geojson')
  //         .then(res => res.json())
  //         .then(data => {
  //           map.current.addSource(debrisSourceId, {
  //             type: 'geojson',
  //             data
  //           });
  //           map.current.addLayer({
  //             id: debrisLayerId,
  //             type: 'circle',
  //             source: debrisSourceId,
  //             paint: {
  //               'circle-radius': 4, // 50% smaller
  //               'circle-color': '#39FF14', // Highlight green
  //               'circle-blur': 0.2,
  //               'circle-opacity': 0.85
  //             },
  //             layout: { visibility: 'visible' }
  //           });
  //         });
  //     } else {
  //       map.current.setLayoutProperty(debrisLayerId, 'visibility', 'visible');
  //     }
  //     // Add 1-mile circles
  //     if (!map.current.getSource(circleSourceId)) {
  //       fetch('/community_center_1mile_circles.geojson')
  //         .then(res => res.json())
  //         .then(data => {
  //           map.current.addSource(circleSourceId, { type: 'geojson', data });
  //           map.current.addLayer({
  //             id: circleLayerId,
  //             type: 'line',
  //             source: circleSourceId,
  //             paint: {
  //               'line-color': '#fff',
  //               'line-width': 2,
  //               'line-dasharray': [2, 4],
  //               'line-opacity': 1
  //             },
  //             layout: { visibility: 'visible' }
  //           });
  //         });
  //     } else {
  //       map.current.setLayoutProperty(circleLayerId, 'visibility', 'visible');
  //     }
  //   } else {
  //     // Remove/hide debris markers and circles
  //     if (map.current.getLayer(debrisLayerId)) map.current.removeLayer(debrisLayerId);
  //     if (map.current.getSource(debrisSourceId)) map.current.removeSource(debrisSourceId);
  //     if (map.current.getLayer(circleLayerId)) map.current.removeLayer(circleLayerId);
  //     if (map.current.getSource(circleSourceId)) map.current.removeSource(circleSourceId);
  //   }
  // }, [showTreeDebris, map]);

  // Debug: Log uniqueDays and animationTime
  useEffect(() => {
    console.log('[DEBUG] uniqueDays:', uniqueDays);
  }, [uniqueDays]);
  useEffect(() => {
    console.log('[DEBUG] animationTime:', animationTime);
  }, [animationTime]);
  // Debug: Log debris features being set each frame
  useEffect(() => {
    if (!map.current) return;
    if (allDebrisFeatures.length) {
      const source = map.current.getSource('debris-animation');
      if (source) {
        const filtered = animationTime
          ? allDebrisFeatures.filter(f => new Date(f.properties.created_date) <= animationTime)
          : [];
        console.log(`[DEBUG] Setting ${filtered.length} debris features at`, animationTime);
      }
    }
  }, [animationTime, allDebrisFeatures, map]);

  useEffect(() => {
    if (!map.current) return;
    const sourceId = 'total-311-calls';
    const layerId = 'total-311-calls';

    if (show311Calls) {
      if (!map.current.getSource(sourceId)) {
        fetch('/aa_311calls_Filtered_1mile.geojson')
          .then(res => res.json())
          .then(data => {
            map.current.addSource(sourceId, { type: 'geojson', data });
            map.current.addLayer({
              id: layerId,
              type: 'circle',
              source: sourceId,
              paint: {
                'circle-radius': 6,
                'circle-color': '#FFA500', // Bright orange
                'circle-stroke-width': 1,
                'circle-stroke-color': '#fff',
                'circle-opacity': 0.8
              },
              layout: { visibility: 'visible' }
            });
          });
      } else {
        map.current.setLayoutProperty(layerId, 'visibility', 'visible');
      }
    } else {
      if (map.current.getLayer(layerId)) {
        map.current.setLayoutProperty(layerId, 'visibility', 'none');
      }
    }
  }, [show311Calls, map]);

  useEffect(() => {
    if (!map.current) return;
    const sourceId = 'august-311-calls';
    const layerId = 'august-311-calls';

    if (showAugust311Calls) {
      if (!map.current.getSource(sourceId)) {
        fetch('/August_Comprehensive_Category_Dataset.geojson')
          .then(res => res.json())
          .then(data => {
            map.current.addSource(sourceId, { type: 'geojson', data });
            
            // Add layers in priority order (back to front)
            // 1. Other (lowest priority)
            map.current.addLayer({
              id: `${layerId}-other`,
              type: 'circle',
              source: sourceId,
              filter: ['==', ['get', 'Category'], 'Other'],
              paint: {
                'circle-radius': 6,
                'circle-color': '#00E600',
                'circle-stroke-width': 0,
                'circle-opacity': 0.8
              },
              layout: { visibility: 'visible' }
            });
            
            // 2. Nuisance & Code
            map.current.addLayer({
              id: `${layerId}-nuisance`,
              type: 'circle',
              source: sourceId,
              filter: ['==', ['get', 'Category'], 'Nuisance & Code'],
              paint: {
                'circle-radius': 6,
                'circle-color': '#614F8A',
                'circle-stroke-width': 0,
                'circle-opacity': 0.8
              },
              layout: { visibility: 'visible' }
            });
            
            // 3. Maintenance
            map.current.addLayer({
              id: `${layerId}-maintenance`,
              type: 'circle',
              source: sourceId,
              filter: ['==', ['get', 'Category'], 'Maintenance'],
              paint: {
                'circle-radius': 6,
                'circle-color': '#0000B3',
                'circle-stroke-width': 0,
                'circle-opacity': 0.8
              },
              layout: { visibility: 'visible' }
            });
            
            // 4. Traffic & Infrastructure
            map.current.addLayer({
              id: `${layerId}-traffic`,
              type: 'circle',
              source: sourceId,
              filter: ['==', ['get', 'Category'], 'Traffic & Infrastructure'],
              paint: {
                'circle-radius': 6,
                'circle-color': '#00FFFF',
                'circle-stroke-width': 0,
                'circle-opacity': 0.8
              },
              layout: { visibility: 'visible' }
            });
            
            // 5. Flood & Drainage (high priority)
            map.current.addLayer({
              id: `${layerId}-flood`,
              type: 'circle',
              source: sourceId,
              filter: ['==', ['get', 'Category'], 'Flood & Drainage'],
              paint: {
                'circle-radius': 6,
                'circle-color': '#FFA500',
                'circle-stroke-width': 0,
                'circle-opacity': 0.8
              },
              layout: { visibility: 'visible' }
            });
            
            // 6. Storm Debris (higher priority)
            map.current.addLayer({
              id: `${layerId}-storm`,
              type: 'circle',
              source: sourceId,
              filter: ['==', ['get', 'Category'], 'Storm Debris'],
              paint: {
                'circle-radius': 6,
                'circle-color': '#FFFF00',
                'circle-stroke-width': 0,
                'circle-opacity': 0.8
              },
              layout: { visibility: 'visible' }
            });
            
            // 7. Power Outage (highest priority - on top)
            map.current.addLayer({
              id: `${layerId}-power`,
              type: 'circle',
              source: sourceId,
              filter: ['==', ['get', 'Category'], 'Power Outage'],
              paint: {
                'circle-radius': 6,
                'circle-color': '#FF0000',
                'circle-stroke-width': 0,
                'circle-opacity': 0.8
              },
              layout: { visibility: 'visible' }
            });
          });
      } else {
        // Show all sub-layers
        ['other', 'nuisance', 'maintenance', 'traffic', 'flood', 'storm', 'power'].forEach(suffix => {
          const subLayerId = `${layerId}-${suffix}`;
          if (map.current.getLayer(subLayerId)) {
            map.current.setLayoutProperty(subLayerId, 'visibility', 'visible');
          }
        });
      }
    } else {
      // Hide all sub-layers
      ['other', 'nuisance', 'maintenance', 'traffic', 'flood', 'storm', 'power'].forEach(suffix => {
        const subLayerId = `${layerId}-${suffix}`;
        if (map.current.getLayer(subLayerId)) {
          map.current.setLayoutProperty(subLayerId, 'visibility', 'none');
        }
      });
    }
  }, [showAugust311Calls, map]);

  useEffect(() => {
    if (!map.current) return;
    const sourceId = 'june-311-calls';
    const layerId = 'june-311-calls';

    if (showJune311Calls) {
      if (!map.current.getSource(sourceId)) {
        fetch('/June_Comprehensive_Category_Dataset.geojson')
          .then(res => res.json())
          .then(data => {
            map.current.addSource(sourceId, { type: 'geojson', data });
            
            // Add layers in priority order (back to front)
            // 1. Other (lowest priority)
            map.current.addLayer({
              id: `${layerId}-other`,
              type: 'circle',
              source: sourceId,
              filter: ['==', ['get', 'Category'], 'Other'],
              paint: {
                'circle-radius': 6,
                'circle-color': '#00E600',
                'circle-stroke-width': 0,
                'circle-opacity': 0.8
              },
              layout: { visibility: 'visible' }
            });
            
            // 2. Nuisance & Code
            map.current.addLayer({
              id: `${layerId}-nuisance`,
              type: 'circle',
              source: sourceId,
              filter: ['==', ['get', 'Category'], 'Nuisance & Code'],
              paint: {
                'circle-radius': 6,
                'circle-color': '#614F8A',
                'circle-stroke-width': 0,
                'circle-opacity': 0.8
              },
              layout: { visibility: 'visible' }
            });
            
            // 3. Maintenance
            map.current.addLayer({
              id: `${layerId}-maintenance`,
              type: 'circle',
              source: sourceId,
              filter: ['==', ['get', 'Category'], 'Maintenance'],
              paint: {
                'circle-radius': 6,
                'circle-color': '#0000B3',
                'circle-stroke-width': 0,
                'circle-opacity': 0.8
              },
              layout: { visibility: 'visible' }
            });
            
            // 4. Traffic & Infrastructure
            map.current.addLayer({
              id: `${layerId}-traffic`,
              type: 'circle',
              source: sourceId,
              filter: ['==', ['get', 'Category'], 'Traffic & Infrastructure'],
              paint: {
                'circle-radius': 6,
                'circle-color': '#00FFFF',
                'circle-stroke-width': 0,
                'circle-opacity': 0.8
              },
              layout: { visibility: 'visible' }
            });
            
            // 5. Flood & Drainage (high priority)
            map.current.addLayer({
              id: `${layerId}-flood`,
              type: 'circle',
              source: sourceId,
              filter: ['==', ['get', 'Category'], 'Flood & Drainage'],
              paint: {
                'circle-radius': 6,
                'circle-color': '#FFA500',
                'circle-stroke-width': 0,
                'circle-opacity': 0.8
              },
              layout: { visibility: 'visible' }
            });
            
            // 6. Storm Debris (higher priority)
            map.current.addLayer({
              id: `${layerId}-storm`,
              type: 'circle',
              source: sourceId,
              filter: ['==', ['get', 'Category'], 'Storm Debris'],
              paint: {
                'circle-radius': 6,
                'circle-color': '#FFFF00',
                'circle-stroke-width': 0,
                'circle-opacity': 0.8
              },
              layout: { visibility: 'visible' }
            });
            
            // 7. Power Outage (highest priority - on top)
            map.current.addLayer({
              id: `${layerId}-power`,
              type: 'circle',
              source: sourceId,
              filter: ['==', ['get', 'Category'], 'Power Outage'],
              paint: {
                'circle-radius': 6,
                'circle-color': '#FF0000',
                'circle-stroke-width': 0,
                'circle-opacity': 0.8
              },
              layout: { visibility: 'visible' }
            });
          });
      } else {
        // Show all sub-layers
        ['other', 'nuisance', 'maintenance', 'traffic', 'flood', 'storm', 'power'].forEach(suffix => {
          const subLayerId = `${layerId}-${suffix}`;
          if (map.current.getLayer(subLayerId)) {
            map.current.setLayoutProperty(subLayerId, 'visibility', 'visible');
          }
        });
      }
    } else {
      // Hide all sub-layers
      ['other', 'nuisance', 'maintenance', 'traffic', 'flood', 'storm', 'power'].forEach(suffix => {
        const subLayerId = `${layerId}-${suffix}`;
        if (map.current.getLayer(subLayerId)) {
          map.current.setLayoutProperty(subLayerId, 'visibility', 'none');
        }
      });
    }
  }, [showJune311Calls, map]);

  useEffect(() => {
    if (!map.current) return;
    const sourceId = 'july-311-calls';
    const layerId = 'july-311-calls';

    if (showJuly311Calls) {
      if (!map.current.getSource(sourceId)) {
        fetch('/July_Comprehensive_Category_Dataset.geojson')
          .then(res => res.json())
          .then(data => {
            map.current.addSource(sourceId, { type: 'geojson', data });
            
            // Add layers in priority order (back to front)
            // 1. Other (lowest priority)
            map.current.addLayer({
              id: `${layerId}-other`,
              type: 'circle',
              source: sourceId,
              filter: ['==', ['get', 'Category'], 'Other'],
              paint: {
                'circle-radius': 6,
                'circle-color': '#00E600',
                'circle-stroke-width': 0,
                'circle-opacity': 0.8
              },
              layout: { visibility: 'visible' }
            });
            
            // 2. Nuisance & Code
            map.current.addLayer({
              id: `${layerId}-nuisance`,
              type: 'circle',
              source: sourceId,
              filter: ['==', ['get', 'Category'], 'Nuisance & Code'],
              paint: {
                'circle-radius': 6,
                'circle-color': '#614F8A',
                'circle-stroke-width': 0,
                'circle-opacity': 0.8
              },
              layout: { visibility: 'visible' }
            });
            
            // 3. Maintenance
            map.current.addLayer({
              id: `${layerId}-maintenance`,
              type: 'circle',
              source: sourceId,
              filter: ['==', ['get', 'Category'], 'Maintenance'],
              paint: {
                'circle-radius': 6,
                'circle-color': '#0000B3',
                'circle-stroke-width': 0,
                'circle-opacity': 0.8
              },
              layout: { visibility: 'visible' }
            });
            
            // 4. Traffic & Infrastructure
            map.current.addLayer({
              id: `${layerId}-traffic`,
              type: 'circle',
              source: sourceId,
              filter: ['==', ['get', 'Category'], 'Traffic & Infrastructure'],
              paint: {
                'circle-radius': 6,
                'circle-color': '#00FFFF',
                'circle-stroke-width': 0,
                'circle-opacity': 0.8
              },
              layout: { visibility: 'visible' }
            });
            
            // 5. Flood & Drainage (high priority)
            map.current.addLayer({
              id: `${layerId}-flood`,
              type: 'circle',
              source: sourceId,
              filter: ['==', ['get', 'Category'], 'Flood & Drainage'],
              paint: {
                'circle-radius': 6,
                'circle-color': '#FFA500',
                'circle-stroke-width': 0,
                'circle-opacity': 0.8
              },
              layout: { visibility: 'visible' }
            });
            
            // 6. Storm Debris (higher priority)
            map.current.addLayer({
              id: `${layerId}-storm`,
              type: 'circle',
              source: sourceId,
              filter: ['==', ['get', 'Category'], 'Storm Debris'],
              paint: {
                'circle-radius': 6,
                'circle-color': '#FFFF00',
                'circle-stroke-width': 0,
                'circle-opacity': 0.8
              },
              layout: { visibility: 'visible' }
            });
            
            // 7. Power Outage (highest priority - on top)
            map.current.addLayer({
              id: `${layerId}-power`,
              type: 'circle',
              source: sourceId,
              filter: ['==', ['get', 'Category'], 'Power Outage'],
              paint: {
                'circle-radius': 6,
                'circle-color': '#FF0000',
                'circle-stroke-width': 0,
                'circle-opacity': 0.8
              },
              layout: { visibility: 'visible' }
            });
          });
      } else {
        // Show all sub-layers
        ['other', 'nuisance', 'maintenance', 'traffic', 'flood', 'storm', 'power'].forEach(suffix => {
          const subLayerId = `${layerId}-${suffix}`;
          if (map.current.getLayer(subLayerId)) {
            map.current.setLayoutProperty(subLayerId, 'visibility', 'visible');
          }
        });
      }
    } else {
      // Hide all sub-layers
      ['other', 'nuisance', 'maintenance', 'traffic', 'flood', 'storm', 'power'].forEach(suffix => {
        const subLayerId = `${layerId}-${suffix}`;
        if (map.current.getLayer(subLayerId)) {
          map.current.setLayoutProperty(subLayerId, 'visibility', 'none');
        }
      });
    }
  }, [showJuly311Calls, map]);

  // Super Neighborhoods layer
  useEffect(() => {
    if (!map.current) return;
    const sourceId = 'super-neighborhoods';
    const layerId = 'super-neighborhoods';

    if (showSuperNeighborhoods) {
      if (!map.current.getSource(sourceId)) {
        fetch('/houston-super-neighborhoods.geojson')
          .then(res => res.json())
          .then(data => {
            map.current.addSource(sourceId, { type: 'geojson', data });
            map.current.addLayer({
              id: `${layerId}-fill`,
              type: 'fill',
              source: sourceId,
              paint: {
                'fill-color': '#FF0000',
                'fill-opacity': 0.1
              },
              layout: { visibility: 'visible' }
            });
            map.current.addLayer({
              id: layerId,
              type: 'line',
              source: sourceId,
              paint: {
                'line-color': '#FF0000',
                'line-width': 4,
                'line-opacity': 1.0
              },
              layout: { visibility: 'visible' }
            });
          });
      } else {
        if (map.current.getLayer(layerId)) {
          map.current.setLayoutProperty(layerId, 'visibility', 'visible');
          map.current.setLayoutProperty(`${layerId}-fill`, 'visibility', 'visible');
        }
      }
    } else {
      if (map.current.getLayer(layerId)) {
        map.current.setLayoutProperty(layerId, 'visibility', 'none');
        map.current.setLayoutProperty(`${layerId}-fill`, 'visibility', 'none');
      }
    }
  }, [showSuperNeighborhoods, map]);

  // 2022 Median Income layer
  useEffect(() => {
    if (!map.current) return;
    const sourceId = 'median-income-2022';
    const layerId = 'median-income-2022';

    if (showMedianIncome2022) {
      if (!map.current.getSource(sourceId)) {
        fetch('/harris_tracts_2022_income copy.geojson')
          .then(res => res.json())
          .then(data => {
            map.current.addSource(sourceId, { type: 'geojson', data });
            map.current.addLayer({
              id: `${layerId}-fill`,
              type: 'fill',
              source: sourceId,
              paint: {
                'fill-color': [
                  'interpolate', ['linear'], ['get', 'median_income_2022'],
                  11936, '#fee5d9',    // Low income - light orange
                  30000, '#fdd0a2',    // Medium-low - orange
                  50000, '#fdae6b',    // Medium - orange
                  75000, '#fd8d3c',    // Medium-high - dark orange
                  100000, '#e6550d',   // High - darker orange
                  150000, '#a63603',   // Very high - very dark orange
                  248611, '#7f2704'    // Highest - darkest orange
                ],
                'fill-opacity': 0.7
              },
              layout: { visibility: 'visible' }
            });
            map.current.addLayer({
              id: layerId,
              type: 'line',
              source: sourceId,
              paint: {
                'line-color': '#FF6B35',
                'line-width': 1,
                'line-opacity': 0.8
              },
              layout: { visibility: 'visible' }
            });
          });
      } else {
        if (map.current.getLayer(layerId)) {
          map.current.setLayoutProperty(layerId, 'visibility', 'visible');
          map.current.setLayoutProperty(`${layerId}-fill`, 'visibility', 'visible');
        }
      }
    } else {
      if (map.current.getLayer(layerId)) {
        map.current.setLayoutProperty(layerId, 'visibility', 'none');
        map.current.setLayoutProperty(`${layerId}-fill`, 'visibility', 'none');
      }
    }
  }, [showMedianIncome2022, map]);

  // Super Neighborhoods Vulnerability Index layer
  useEffect(() => {
    if (!map.current) return;
    const sourceId = 'vulnerability-index';
    const layerId = 'vulnerability-index';

    if (showVulnerabilityIndex) {
      if (!map.current.getSource(sourceId)) {
        fetch('/super-neighborhoods-vulnerability-index.geojson')
          .then(res => res.json())
          .then(data => {
            map.current.addSource(sourceId, { type: 'geojson', data });
            map.current.addLayer({
              id: `${layerId}-fill`,
              type: 'fill',
              source: sourceId,
              paint: {
                'fill-color': '#ff0000',
                'fill-opacity': [
                  'interpolate', ['linear'], ['get', 'vulnerability_index'],
                  0.0, 0.1,    // Very light red for low vulnerability
                  0.3, 0.3,    // Light red for medium-low
                  0.5, 0.5,    // Medium red for medium
                  0.7, 0.7,    // Dark red for medium-high
                  1.0, 1.0     // Full red for high vulnerability
                ]
              },
              layout: { visibility: 'visible' }
            });
            map.current.addLayer({
              id: layerId,
              type: 'line',
              source: sourceId,
              paint: {
                'line-color': '#333',
                'line-width': 2,
                'line-opacity': 0.8
              },
              layout: { visibility: 'visible' }
            });
            // Add labels layer
            map.current.addLayer({
              id: `${layerId}-labels`,
              type: 'symbol',
              source: sourceId,
              layout: {
                'text-field': ['get', 'neighborhood_name'],
                'text-size': 13.8,
                'text-offset': [0, 0],
                'text-anchor': 'center',
                'text-allow-overlap': false,
                'text-ignore-placement': false,
                'visibility': 'visible'
              },
              paint: {
                'text-color': '#fff',
                'text-halo-color': '#fff',
                'text-halo-width': 0,
                'text-opacity': 1.0
              }
            });
          });
      } else {
        if (map.current.getLayer(layerId)) {
          map.current.setLayoutProperty(layerId, 'visibility', 'visible');
          map.current.setLayoutProperty(`${layerId}-fill`, 'visibility', 'visible');
          map.current.setLayoutProperty(`${layerId}-labels`, 'visibility', 'visible');
        }
      }
    } else {
      if (map.current.getLayer(layerId)) {
        map.current.setLayoutProperty(layerId, 'visibility', 'none');
        map.current.setLayoutProperty(`${layerId}-fill`, 'visibility', 'none');
        map.current.setLayoutProperty(`${layerId}-labels`, 'visibility', 'none');
      }
    }
  }, [showVulnerabilityIndex, map]);

  // Add click handler for vulnerability index
  useEffect(() => {
    if (!map.current || !showVulnerabilityIndex) return;

    const handleVulnerabilityClick = (e) => {
      const feature = e.features && e.features[0];
      if (!feature || feature.layer.id !== 'vulnerability-index-fill') return;

      const properties = feature.properties;
      const vulnerability = properties.vulnerability_index;
      const calls = properties.call_count;
      const income = properties.avg_median_income;
      const flood = properties.flood_percentage;
      const hasCommunityCenter = properties.has_community_center;
      const totalSquareFootage = properties.total_square_footage;

      // Create vulnerability level description
      let vulnerabilityLevel = '';
      if (vulnerability < 0.3) vulnerabilityLevel = 'Low';
      else if (vulnerability < 0.5) vulnerabilityLevel = 'Medium-Low';
      else if (vulnerability < 0.7) vulnerabilityLevel = 'Medium';
      else if (vulnerability < 0.8) vulnerabilityLevel = 'Medium-High';
      else vulnerabilityLevel = 'High';

      const popupContent = `
        <div style="max-width: 300px; font-family: Arial, sans-serif;">
          <h3 style="margin: 0 0 10px 0; color: #f5f5f5; font-size: 16px; font-weight: bold;">
            ${properties.neighborhood_name}
          </h3>
          <div style="margin-bottom: 15px;">
            <div style="display: flex; align-items: center; margin-bottom: 8px;">
              <div style="width: 12px; height: 12px; border-radius: 50%; background-color: #ff0000; opacity: ${vulnerability}; margin-right: 8px;"></div>
              <span style="font-weight: bold; color: #f5f5f5;">
                Vulnerability Level: ${vulnerabilityLevel}
              </span>
            </div>
            <p style="margin: 0; font-size: 14px; color: #e0e0e0;">
              Index Score: ${(vulnerability * 100).toFixed(1)}%
            </p>
          </div>
          <div style="border-top: 1px solid #eee; padding-top: 10px;">
            <p style="margin: 0 0 5px 0; font-size: 13px; color: #f5f5f5;">
              <strong>July 311 Calls:</strong> ${calls.toLocaleString()}
            </p>
            <p style="margin: 0 0 5px 0; font-size: 13px; color: #f5f5f5;">
              <strong>Median Income:</strong> $${income.toLocaleString()}
            </p>
            <p style="margin: 0 0 5px 0; font-size: 13px; color: #f5f5f5;">
              <strong>Flood Coverage:</strong> ${flood.toFixed(1)}%
            </p>
            <p style="margin: 0; font-size: 13px; color: #f5f5f5;">
              <strong>Community Center:</strong> ${hasCommunityCenter ? `${totalSquareFootage.toLocaleString()} sq ft` : 'None'}
            </p>
          </div>
        </div>
      `;

      new mapboxgl.Popup({
        closeButton: true,
        closeOnClick: false,
        maxWidth: '350px'
      })
      .setLngLat(e.lngLat)
      .setHTML(popupContent)
      .addTo(map.current);
    };

    map.current.on('click', 'vulnerability-index-fill', handleVulnerabilityClick);
    map.current.on('mouseenter', 'vulnerability-index-fill', () => {
      map.current.getCanvas().style.cursor = 'pointer';
    });
    map.current.on('mouseleave', 'vulnerability-index-fill', () => {
      map.current.getCanvas().style.cursor = '';
    });

    return () => {
      if (map.current) {
        map.current.off('click', 'vulnerability-index-fill', handleVulnerabilityClick);
        map.current.off('mouseenter', 'vulnerability-index-fill');
        map.current.off('mouseleave', 'vulnerability-index-fill');
      }
    };
  }, [showVulnerabilityIndex, map]);

  // Vulnerability Animation Layer - REMOVED: Redundant large circle markers
  // useEffect(() => {
  //   if (!map.current || !showVulnerabilityAnimation) return;

  //   const months = ['June', 'July', 'August'];
  //   const currentMonth = months[currentAnimationMonth];
    
  //   // Add layers for both neighborhoods
  //   const neighborhoods = [
  //     { name: 'Neighborhood_50', color: '#e74c3c', label: 'Most Vulnerable', filename: 'neighborhood_50_311_calls.geojson' },
  //     { name: 'Neighborhood_3', color: '#27ae60', label: 'Least Vulnerable', filename: 'neighborhood_3_311_calls.geojson' }
  //   ];

  //   neighborhoods.forEach((neighborhood, index) => {
  //     const sourceId = `vulnerability-animation-${neighborhood.name}`;
  //     const layerId = `vulnerability-animation-${neighborhood.name}`;

  //     // Remove existing layers if they exist
  //     if (map.current.getLayer(layerId)) {
  //       map.current.removeLayer(layerId);
  //     }
  //     if (map.current.getSource(sourceId)) {
  //       map.current.removeSource(sourceId);
  //     }

  //     // Load and add data for current month
  //     fetch(`/${neighborhood.filename}`)
  //       .then(response => response.json())
  //       .then(data => {
  //         // Filter data for current month
  //         const filteredData = {
  //           type: 'FeatureCollection',
  //           features: data.features.filter(feature => 
  //             feature.properties.month === currentMonth
  //           )
  //         };

  //         // Add source and layer
  //         map.current.addSource(sourceId, {
  //           type: 'geojson',
  //           data: filteredData
  //         });

  //         map.current.addLayer({
  //           id: layerId,
  //           type: 'circle',
  //           source: sourceId,
  //           paint: {
  //             'circle-radius': 6,
  //             'circle-color': neighborhood.color,
  //             'circle-opacity': 0.8,
  //             'circle-stroke-width': 1,
  //             'circle-stroke-color': '#fff',
  //             'circle-stroke-opacity': 0.5
  //           },
  //           layout: { visibility: 'visible' }
  //         });
  //       })
  //       .catch(error => {
  //         console.error(`Error loading ${neighborhood.name} data:`, error);
  //       });
  //   });

  //   return () => {
  //     // Cleanup layers when component unmounts or animation is hidden
  //     neighborhoods.forEach(neighborhood => {
  //       const layerId = `vulnerability-animation-${neighborhood.name}`;
  //       const sourceId = `vulnerability-animation-${neighborhood.name}`;
        
  //       if (map.current.getLayer(layerId)) {
  //         map.current.removeLayer(layerId);
  //       }
  //       if (map.current.getSource(sourceId)) {
  //         map.current.removeSource(sourceId);
  //       }
  //     });
  //   };
  // }, [showVulnerabilityAnimation, currentAnimationMonth, map]);

  // Super Neighborhood Polygons for Animation - DISABLED: Now handled in fixed infrastructure
  // useEffect(() => {
  //   if (!map.current || !showVulnerabilityAnimation) return;

  //   const sourceId = 'vulnerability-animation-polygons';
  //   const layerId = 'vulnerability-animation-polygons';

  //   // Remove existing layers if they exist
  //   if (map.current.getLayer(layerId)) {
  //     map.current.removeLayer(layerId);
  //   }
  //   if (map.current.getLayer(`${layerId}-fill`)) {
  //     map.current.removeLayer(`${layerId}-fill`);
  //   }
  //   if (map.current.getSource(sourceId)) {
  //     map.current.removeSource(sourceId);
  //   }

  //   // Load super neighborhood polygons for the two target neighborhoods
  //   fetch('/super-neighborhoods-vulnerability-index.geojson')
  //     .then(response => response.json())
  //     .then(data => {
  //       // Filter for only Neighborhood_50 and Neighborhood_3
  //       const filteredData = {
  //         type: 'FeatureCollection',
  //         features: data.features.filter(feature => 
  //           feature.properties.neighborhood_name === 'Neighborhood_50' || 
  //           feature.properties.neighborhood_name === 'Neighborhood_3'
  //         )
  //       };

  //       // Add source and layer
  //       if (!map.current.getSource(sourceId)) {
  //         map.current.addSource(sourceId, {
  //           type: 'geojson',
  //           data: filteredData
  //         });

  //         map.current.addLayer({
  //           id: `${layerId}-fill`,
  //           type: 'fill',
  //           source: sourceId,
  //           paint: {
  //             'fill-color': '#ff0000',
  //             'fill-opacity': [
  //               'interpolate', ['linear'], ['get', 'vulnerability_index'],
  //               0.0, 0.1,    // Very light red for low vulnerability
  //               0.3, 0.3,    // Light red for medium-low
  //               0.5, 0.5,    // Medium red for medium
  //               0.7, 0.7,    // Dark red for medium-high
  //               1.0, 1.0     // Full red for high vulnerability
  //             ]
  //           },
  //           layout: { visibility: 'visible' }
  //         });

  //         map.current.addLayer({
  //           id: layerId,
  //           type: 'line',
  //           source: sourceId,
  //           paint: {
  //             'line-color': '#333',
  //             'line-width': 2,
  //             'line-opacity': 0.8
  //           },
  //           layout: { visibility: 'visible' }
  //         });

  //         // Add text labels for the Super Neighborhoods
  //         map.current.addLayer({
  //           id: `${layerId}-labels`,
  //           type: 'symbol',
  //           source: sourceId,
  //           layout: {
  //             'text-field': [
  //               'case',
  //               ['==', ['get', 'neighborhood_name'], 'Neighborhood_50'],
  //               'Super Neighborhood 50',
  //               ['==', ['get', 'neighborhood_name'], 'Neighborhood_3'],
  //               'Super Neighborhood 3',
  //               ''
  //             ],
  //             'text-size': 14,
  //             'text-offset': [0, 0],
  //             'text-anchor': 'center',
  //             'text-allow-overlap': true,
  //             'text-ignore-placement': false,
  //             'visibility': 'visible'
  //           },
  //           paint: {
  //             'text-color': '#cccccc', // Changed to light grey
  //             'text-halo-color': '#000',
  //             'text-halo-width': 2,
  //             'text-opacity': 0.9
  //           }
  //         });
  //       }
  //     })
  //     .catch(error => {
  //       console.error('Error loading vulnerability animation polygons:', error);
  //     });

  //   return () => {
  //     if (map.current.getLayer(layerId)) {
  //       map.current.removeLayer(layerId);
  //     }
  //     if (map.current.getLayer(`${layerId}-fill`)) {
  //       map.current.removeLayer(`${layerId}-fill`);
  //     }
  //     if (map.current.getLayer(`${layerId}-labels`)) {
  //       map.current.removeLayer(`${layerId}-labels`);
  //     }
  //     if (map.current.getSource(sourceId)) {
  //       map.current.removeSource(sourceId);
  //     }
  //   };
  // }, [map, showVulnerabilityAnimation]);

  // Helper function to check if a point is inside a polygon
  const isPointInPolygon = (point, polygon) => {
    if (polygon.type !== 'Polygon' && polygon.type !== 'MultiPolygon') {
      return false;
    }
    
    const x = point.coordinates[0];
    const y = point.coordinates[1];
    
    if (polygon.type === 'Polygon') {
      return isPointInPolygonCoords(x, y, polygon.coordinates[0]);
    } else {
      // MultiPolygon
      return polygon.coordinates.some(ring => isPointInPolygonCoords(x, y, ring[0]));
    }
  };
  
  const isPointInPolygonCoords = (x, y, coords) => {
    let inside = false;
    for (let i = 0, j = coords.length - 1; i < coords.length; j = i++) {
      const xi = coords[i][0], yi = coords[i][1];
      const xj = coords[j][0], yj = coords[j][1];
      
      if (((yi > y) !== (yj > y)) && (x < (xj - xi) * (y - yi) / (yj - yi) + xi)) {
        inside = !inside;
      }
    }
    return inside;
  };

  // Debug function to log all sources and layers
  const logAllMapSourcesAndLayers = () => {
    if (!map.current) return;
    
    console.log('🔍 [DEBUG] === ALL MAP SOURCES ===');
    const sources = map.current.getStyle().sources;
    Object.keys(sources).forEach(sourceId => {
      console.log('Source:', sourceId, 'Type:', sources[sourceId].type);
    });
    
    console.log('🔍 [DEBUG] === ALL MAP LAYERS ===');
    const layers = map.current.getStyle().layers;
    layers.forEach(layer => {
      if (layer.type === 'circle') {
        console.log('Layer:', layer.id, 'Source:', layer.source, 'Type:', layer.type);
        if (layer.paint && layer.paint['circle-color']) {
          console.log('  Color:', layer.paint['circle-color']);
        }
      }
    });
  };

  // Animation 311 Call Markers
  useEffect(() => {
    if (!map.current || !showVulnerabilityAnimation) return;

    console.log('🔍 [VULNERABILITY ANIMATION] Starting animation with currentAnimationMonth:', currentAnimationMonth);

    // Calculate which month and day we're currently on
    const totalDays = 30 + 31 + 31; // June + July + August
    const currentDayIndex = currentAnimationMonth;
    
    let currentMonth = 0; // 0 = June, 1 = July, 2 = August
    let dayInMonth = currentDayIndex + 1;
    
    if (currentDayIndex >= 30 + 31) {
      currentMonth = 2; // August
      dayInMonth = currentDayIndex - 30 - 31 + 1;
    } else if (currentDayIndex >= 30) {
      currentMonth = 1; // July
      dayInMonth = currentDayIndex - 30 + 1;
    } else {
      currentMonth = 0; // June
      dayInMonth = currentDayIndex + 1;
    }
    
    const months = ['June', 'July', 'August'];
    const currentMonthName = months[currentMonth];
    
    console.log('🔍 [VULNERABILITY ANIMATION] Current month:', currentMonthName, 'Day:', dayInMonth);
    
    // Remove existing animation markers
    const existingLayers = [
      'animation-june-calls-other',
      'animation-june-calls-nuisance',
      'animation-june-calls-maintenance',
      'animation-june-calls-traffic',
      'animation-june-calls-flood',
      'animation-june-calls-storm',
      'animation-june-calls-power',
      'animation-july-calls-other',
      'animation-july-calls-nuisance',
      'animation-july-calls-maintenance',
      'animation-july-calls-traffic',
      'animation-july-calls-flood',
      'animation-july-calls-storm',
      'animation-july-calls-power',
      'animation-august-calls-other',
      'animation-august-calls-nuisance',
      'animation-august-calls-maintenance',
      'animation-august-calls-traffic',
      'animation-august-calls-flood',
      'animation-august-calls-storm',
      'animation-august-calls-power'
    ];
    
    console.log('🔍 [VULNERABILITY ANIMATION] Removing existing layers...');
    existingLayers.forEach(layerId => {
      if (map.current.getLayer(layerId)) {
        console.log('🗑️ Removing layer:', layerId);
        map.current.removeLayer(layerId);
      }
    });
    
    const existingSources = [
      'animation-june-calls',
      'animation-july-calls',
      'animation-august-calls'
    ];
    
    existingSources.forEach(sourceId => {
      if (map.current.getSource(sourceId)) {
        console.log('🗑️ Removing source:', sourceId);
        map.current.removeSource(sourceId);
      }
    });

    // Load the current month's data
    const monthFiles = {
      'June': '/June_Comprehensive_Category_Dataset.geojson',
      'July': '/July_Comprehensive_Category_Dataset.geojson', 
      'August': '/August_Comprehensive_Category_Dataset.geojson'
    };

    const currentFile = monthFiles[currentMonthName];
    if (!currentFile) return;

    console.log('🔍 [VULNERABILITY ANIMATION] Loading file:', currentFile);

    fetch(currentFile)
      .then(response => response.json())
      .then(data => {
        console.log('🔍 [VULNERABILITY ANIMATION] Loaded data with', data.features.length, 'features');
        
        const sourceId = `animation-${currentMonthName.toLowerCase()}-calls`;
        const layerId = `animation-${currentMonthName.toLowerCase()}-calls`;

        // Filter data for the current day based on animation state
        const currentDate = new Date(2024, currentMonth + 5, dayInMonth); // +5 because months are 0-indexed
        const dateString = currentDate.toISOString().split('T')[0];
        
        console.log('🔍 [VULNERABILITY ANIMATION] Filtering for date:', dateString);
        
        // Get the Super Neighborhood boundaries for spatial filtering
        const superNeighborhoods = [
          { name: 'Neighborhood_50', color: '#e74c3c' },
          { name: 'Neighborhood_3', color: '#27ae60' }
        ];
        
        // Load Super Neighborhood boundaries for spatial filtering
        fetch('/super-neighborhoods-vulnerability-index.geojson')
          .then(boundariesResponse => boundariesResponse.json())
          .then(boundariesData => {
            console.log('🔍 [VULNERABILITY ANIMATION] Loaded boundaries with', boundariesData.features.length, 'features');
            
            const targetBoundaries = boundariesData.features.filter(feature => 
              feature.properties.neighborhood_name === 'Neighborhood_50' || 
              feature.properties.neighborhood_name === 'Neighborhood_3'
            );
            
            console.log('🔍 [VULNERABILITY ANIMATION] Found', targetBoundaries.length, 'target boundaries');
            
            // Filter calls by date AND location (within Super Neighborhood boundaries)
            const filteredData = {
              type: 'FeatureCollection',
              features: data.features.filter(feature => {
                const callDate = feature.properties['Created Date Local'];
                if (!callDate || !callDate.startsWith(dateString)) {
                  return false;
                }
                
                // Check if call is within any of the target Super Neighborhood boundaries
                const callPoint = feature.geometry;
                return targetBoundaries.some(boundary => {
                  // Simple point-in-polygon check
                  return isPointInPolygon(callPoint, boundary.geometry);
                });
              })
            };
            
            console.log('🔍 [VULNERABILITY ANIMATION] Filtered to', filteredData.features.length, 'features for date', dateString);
            console.log('🔍 [VULNERABILITY ANIMATION] Total data features:', data.features.length);
            console.log('🔍 [VULNERABILITY ANIMATION] Date string being filtered:', dateString);
            
            // Debug: Check a few sample dates from the data
            const sampleDates = data.features.slice(0, 5).map(f => f.properties['Created Date Local']);
            console.log('🔍 [VULNERABILITY ANIMATION] Sample dates from data:', sampleDates);
            
            // Debug: Count calls by date before spatial filtering
            const callsByDate = {};
            data.features.forEach(feature => {
              const callDate = feature.properties['Created Date Local'];
              if (callDate) {
                const dateKey = callDate.split('T')[0];
                callsByDate[dateKey] = (callsByDate[dateKey] || 0) + 1;
              }
            });
            console.log('🔍 [VULNERABILITY ANIMATION] Calls by date (before spatial filtering):', callsByDate);
            
            // Log what categories we have
            const categories = [...new Set(filteredData.features.map(f => f.properties.Category))];
            console.log('🔍 [VULNERABILITY ANIMATION] Categories found:', categories);
            
            // Count features by category
            const categoryCounts = {};
            filteredData.features.forEach(feature => {
              const category = feature.properties.Category;
              categoryCounts[category] = (categoryCounts[category] || 0) + 1;
            });
            console.log('🔍 [VULNERABILITY ANIMATION] Category counts:', categoryCounts);
            
            if (filteredData.features.length === 0) {
              console.log('🔍 [VULNERABILITY ANIMATION] No features found for this date, skipping layer creation');
              return;
            }

            // Add source if not present
            if (!map.current.getSource(sourceId)) {
              console.log('🔍 [VULNERABILITY ANIMATION] Adding source:', sourceId);
              map.current.addSource(sourceId, { type: 'geojson', data: filteredData });
            } else {
              console.log('🔍 [VULNERABILITY ANIMATION] Updating source:', sourceId);
              map.current.getSource(sourceId).setData(filteredData);
            }

            // Add layers in priority order (back to front)
            // 1. Other (lowest priority)
            console.log('🔍 [VULNERABILITY ANIMATION] Adding layer: Other (green)');
            map.current.addLayer({
              id: `${layerId}-other`,
              type: 'circle',
              source: sourceId,
              filter: ['==', ['get', 'Category'], 'Other'],
              paint: {
                'circle-radius': 6,
                'circle-color': '#00E600',
                'circle-stroke-width': 0,
                'circle-opacity': 0.8
              },
              layout: { visibility: 'visible' }
            });
            
            // 2. Nuisance & Code
            console.log('🔍 [VULNERABILITY ANIMATION] Adding layer: Nuisance & Code (purple)');
            map.current.addLayer({
              id: `${layerId}-nuisance`,
              type: 'circle',
              source: sourceId,
              filter: ['==', ['get', 'Category'], 'Nuisance & Code'],
              paint: {
                'circle-radius': 6,
                'circle-color': '#614F8A',
                'circle-stroke-width': 0,
                'circle-opacity': 0.8
              },
              layout: { visibility: 'visible' }
            });
            
            // 3. Maintenance
            console.log('🔍 [VULNERABILITY ANIMATION] Adding layer: Maintenance (blue)');
            map.current.addLayer({
              id: `${layerId}-maintenance`,
              type: 'circle',
              source: sourceId,
              filter: ['==', ['get', 'Category'], 'Maintenance'],
              paint: {
                'circle-radius': 6,
                'circle-color': '#0000B3',
                'circle-stroke-width': 0,
                'circle-opacity': 0.8
              },
              layout: { visibility: 'visible' }
            });
            
            // 4. Traffic & Infrastructure
            console.log('🔍 [VULNERABILITY ANIMATION] Adding layer: Traffic & Infrastructure (light blue)');
            map.current.addLayer({
              id: `${layerId}-traffic`,
              type: 'circle',
              source: sourceId,
              filter: ['==', ['get', 'Category'], 'Traffic & Infrastructure'],
              paint: {
                'circle-radius': 6,
                'circle-color': '#00FFFF',
                'circle-stroke-width': 0,
                'circle-opacity': 0.8
              },
              layout: { visibility: 'visible' }
            });
            
            // 5. Flood & Drainage (high priority)
            console.log('🔍 [VULNERABILITY ANIMATION] Adding layer: Flood & Drainage (orange)');
            map.current.addLayer({
              id: `${layerId}-flood`,
              type: 'circle',
              source: sourceId,
              filter: ['==', ['get', 'Category'], 'Flood & Drainage'],
              paint: {
                'circle-radius': 6,
                'circle-color': '#FFA500',
                'circle-stroke-width': 0,
                'circle-opacity': 0.8
              },
              layout: { visibility: 'visible' }
            });
            
            // 6. Storm Debris (higher priority)
            console.log('🔍 [VULNERABILITY ANIMATION] Adding layer: Storm Debris (yellow)');
            map.current.addLayer({
              id: `${layerId}-storm`,
              type: 'circle',
              source: sourceId,
              filter: ['==', ['get', 'Category'], 'Storm Debris'],
              paint: {
                'circle-radius': 6,
                'circle-color': '#FFFF00',
                'circle-stroke-width': 0,
                'circle-opacity': 0.8
              },
              layout: { visibility: 'visible' }
            });
            
            // 7. Power Outage (highest priority - on top)
            console.log('🔍 [VULNERABILITY ANIMATION] Adding layer: Power Outage (red)');
            map.current.addLayer({
              id: `${layerId}-power`,
              type: 'circle',
              source: sourceId,
              filter: ['==', ['get', 'Category'], 'Power Outage'],
              paint: {
                'circle-radius': 6,
                'circle-color': '#FF0000',
                'circle-stroke-width': 0,
                'circle-opacity': 0.8
              },
              layout: { visibility: 'visible' }
            });
            
            console.log('🔍 [VULNERABILITY ANIMATION] All layers added for', currentMonthName);
            
            logAllMapSourcesAndLayers();
          })
          .catch(error => {
            console.error(`Error loading boundaries data:`, error);
          });
      })
      .catch(error => {
        console.error(`Error loading ${currentMonthName} animation data:`, error);
      });
  }, [showVulnerabilityAnimation, currentAnimationMonth, map]);

  // Fixed Infrastructure for Animation (Super Neighborhood polygons, community centers, churches)
  useEffect(() => {
    if (!map.current || !showVulnerabilityAnimation || fixedInfrastructureLoaded) return;

    console.log('🔍 [FIXED INFRASTRUCTURE] Loading fixed infrastructure for animation...');

    // Load Super Neighborhood boundaries for spatial filtering
    fetch('/super-neighborhoods-vulnerability-index.geojson')
      .then(boundariesResponse => boundariesResponse.json())
      .then(boundariesData => {
        const targetBoundaries = boundariesData.features.filter(feature => 
          feature.properties.neighborhood_name === 'Neighborhood_50' || 
          feature.properties.neighborhood_name === 'Neighborhood_3'
        );

        // Add Super Neighborhood polygons
        const sourceId = 'vulnerability-animation-polygons';
        const layerId = 'vulnerability-animation-polygons';
        
        // Filter for only Neighborhood_50 and Neighborhood_3
        const filteredData = {
          type: 'FeatureCollection',
          features: boundariesData.features.filter(feature => 
            feature.properties.neighborhood_name === 'Neighborhood_50' || 
            feature.properties.neighborhood_name === 'Neighborhood_3'
          )
        };

        // Add Super Neighborhood polygons source and layers
        if (!map.current.getSource(sourceId)) {
          map.current.addSource(sourceId, {
            type: 'geojson',
            data: filteredData
          });

          map.current.addLayer({
            id: `${layerId}-fill`,
            type: 'fill',
            source: sourceId,
            paint: {
              'fill-color': '#ff0000',
              'fill-opacity': [
                'interpolate', ['linear'], ['get', 'vulnerability_index'],
                0.0, 0.1,    // Very light red for low vulnerability
                0.3, 0.3,    // Light red for medium-low
                0.5, 0.5,    // Medium red for medium
                0.7, 0.7,    // Dark red for medium-high
                1.0, 1.0     // Full red for high vulnerability
              ]
            },
            layout: { visibility: 'visible' }
          });

          map.current.addLayer({
            id: layerId,
            type: 'line',
            source: sourceId,
            paint: {
              'line-color': '#333',
              'line-width': 2,
              'line-opacity': 0.8
            },
            layout: { visibility: 'visible' }
          });

          // Add text labels for the Super Neighborhoods
          map.current.addLayer({
            id: `${layerId}-labels`,
            type: 'symbol',
            source: sourceId,
            layout: {
              'text-field': [
                'case',
                ['==', ['get', 'neighborhood_name'], 'Neighborhood_50'],
                'Super Neighborhood 50',
                ['==', ['get', 'neighborhood_name'], 'Neighborhood_3'],
                'Super Neighborhood 3',
                ''
              ],
              'text-size': 14,
              'text-offset': [0, 0],
              'text-anchor': 'center',
              'text-allow-overlap': true,
              'text-ignore-placement': false,
              'visibility': 'visible'
            },
            paint: {
              'text-color': '#cccccc',
              'text-halo-color': '#000',
              'text-halo-width': 2,
              'text-opacity': 0.9
            }
          });
        }

        // Load and display community centers within Super Neighborhood boundaries
        console.log('🔍 [FIXED INFRASTRUCTURE] Loading community centers...');
        fetch('/houston-community-centers-vulnerability-4326.geojson')
          .then(ccResponse => ccResponse.json())
          .then(ccData => {
            // Filter community centers within Super Neighborhood boundaries
            const filteredCC = {
              type: 'FeatureCollection',
              features: ccData.features.filter(feature => {
                const ccPoint = feature.geometry;
                return targetBoundaries.some(boundary => {
                  return isPointInPolygon(ccPoint, boundary.geometry);
                });
              })
            };
            
            console.log('🔍 [FIXED INFRASTRUCTURE] Found', filteredCC.features.length, 'community centers within Super Neighborhoods');
            
            // Add community centers layer
            if (!map.current.getSource('animation-community-centers')) {
              map.current.addSource('animation-community-centers', {
                type: 'geojson',
                data: filteredCC
              });
              
              map.current.addLayer({
                id: 'animation-community-centers',
                type: 'circle',
                source: 'animation-community-centers',
                paint: {
                  'circle-radius': [
                    'case',
                    ['all', ['has', 'Square_Foo'], ['>', ['to-number', ['get', 'Square_Foo']], 0]],
                    [
                      'interpolate',
                      ['linear'],
                      ['to-number', ['get', 'Square_Foo'], 0],
                      0, 4.8,
                      2000, 6.4,
                      5000, 9.6,
                      10000, 14.4,
                      20000, 19.2
                    ],
                    6.4
                  ],
                  'circle-color': '#FF00B7',
                  'circle-stroke-width': 0,
                  'circle-opacity': 0.8
                },
                layout: { visibility: 'visible' }
              });
            }
          })
          .catch(error => {
            console.error('Error loading community centers:', error);
          });
        
        // Load and display churches within Super Neighborhood boundaries
        console.log('🔍 [FIXED INFRASTRUCTURE] Loading churches...');
        fetch('/houston_churches_with_grace.geojson')
          .then(churchResponse => churchResponse.json())
          .then(churchData => {
            // Filter churches within Super Neighborhood boundaries
            const filteredChurches = {
              type: 'FeatureCollection',
              features: churchData.features.filter(feature => {
                const churchPoint = feature.geometry;
                return targetBoundaries.some(boundary => {
                  return isPointInPolygon(churchPoint, boundary.geometry);
                });
              })
            };
            
            console.log('🔍 [FIXED INFRASTRUCTURE] Found', filteredChurches.features.length, 'churches within Super Neighborhoods');
            
            // Add churches layer
            if (!map.current.getSource('animation-churches')) {
              map.current.addSource('animation-churches', {
                type: 'geojson',
                data: filteredChurches
              });
              
              map.current.addLayer({
                id: 'animation-churches',
                type: 'circle',
                source: 'animation-churches',
                paint: {
                  'circle-color': '#8e44ad',
                  'circle-radius': [
                    'case',
                    ['all', ['has', 'area_sq_ft'], ['>', ['to-number', ['get', 'area_sq_ft']], 0]],
                    [
                      'interpolate',
                      ['linear'],
                      ['to-number', ['get', 'area_sq_ft'], 0],
                      0, 4,
                      2000, 6,
                      5000, 8,
                      10000, 12,
                      20000, 16
                    ],
                    6
                  ],
                  'circle-blur': 0.2,
                  'circle-opacity': 0.8,
                  'circle-stroke-width': 0
                },
                layout: { visibility: 'visible' }
              });
            }
            
            // Mark fixed infrastructure as loaded
            setFixedInfrastructureLoaded(true);
            console.log('🔍 [FIXED INFRASTRUCTURE] Fixed infrastructure loaded successfully');
          })
          .catch(error => {
            console.error('Error loading churches:', error);
          });
      })
      .catch(error => {
        console.error('Error loading boundaries data:', error);
      });

    return () => {
      // Cleanup fixed infrastructure when animation is hidden
      if (map.current.getLayer('animation-community-centers')) {
        map.current.removeLayer('animation-community-centers');
      }
      if (map.current.getSource('animation-community-centers')) {
        map.current.removeSource('animation-community-centers');
      }
      if (map.current.getLayer('animation-churches')) {
        map.current.removeLayer('animation-churches');
      }
      if (map.current.getSource('animation-churches')) {
        map.current.removeSource('animation-churches');
      }
      if (map.current.getLayer('vulnerability-animation-polygons')) {
        map.current.removeLayer('vulnerability-animation-polygons');
      }
      if (map.current.getLayer('vulnerability-animation-polygons-fill')) {
        map.current.removeLayer('vulnerability-animation-polygons-fill');
      }
      if (map.current.getLayer('vulnerability-animation-polygons-labels')) {
        map.current.removeLayer('vulnerability-animation-polygons-labels');
      }
      if (map.current.getSource('vulnerability-animation-polygons')) {
        map.current.removeSource('vulnerability-animation-polygons');
      }
      // Reset the flag when animation stops
      setFixedInfrastructureLoaded(false);
    };
  }, [showVulnerabilityAnimation, fixedInfrastructureLoaded, map]);

  return (
    <MapContainer>
      <div ref={mapContainer} style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0 }} />
      
      {/* Vulnerability Index Gradient Legend - Fixed Visual */}
      <div style={{
        position: 'absolute',
        top: 24,
        left: 24,
        zIndex: 1002,
        background: 'rgba(20,20,30,0.95)',
        color: '#fff',
        borderRadius: 12,
        padding: '16px',
        boxShadow: '0 2px 8px rgba(0,0,0,0.25)',
        minWidth: 250
      }}>
        <div style={{ fontWeight: 700, fontSize: 14, marginBottom: 12, textAlign: 'center' }}>
          Vulnerability Index
        </div>
        <div style={{ display: 'flex', alignItems: 'center', marginBottom: 8 }}>
          <div style={{ 
            width: 187.5, 
            height: 20, 
            background: 'linear-gradient(to right, rgba(255,0,0,0.1), rgba(255,0,0,0.3), rgba(255,0,0,0.5), rgba(255,0,0,0.7), rgba(255,0,0,1.0))',
            borderRadius: 4,
            marginRight: 8
          }}></div>
        </div>
        <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 11, color: '#fff' }}>
          <span>Low</span>
          <span>High</span>
        </div>
        <div style={{ marginTop: 8, fontSize: 11, color: '#aaa', textAlign: 'center' }}>
          <div style={{ marginBottom: 4 }}>Light Red: 0.0 - 0.3 (Low vulnerability)</div>
          <div style={{ marginBottom: 4 }}>Medium Red: 0.3 - 0.5 (Medium-Low)</div>
          <div style={{ marginBottom: 4 }}>Dark Red: 0.5 - 0.7 (Medium)</div>
          <div style={{ marginBottom: 4 }}>Full Red: 0.7 - 1.0 (High vulnerability)</div>
        </div>
      </div>
      
      <PopupManager map={map} />
      <ErcotManager ref={ercotManagerRef} map={map} isErcotMode={isErcotMode} setIsErcotMode={setIsErcotMode} />
      {/* Render legend if community centers are visible */}
      {isCommunityCentersVisible && (
        <div style={{ position: 'absolute', bottom: 24, left: 24, zIndex: 10, display: 'flex', flexDirection: 'column', alignItems: 'flex-start' }}>
          <Legend visible={false} showVulnerability={true} position="left" />
        </div>
      )}
      
      <LayerToggle
        map={map}
        isLayerMenuCollapsed={isLayerMenuCollapsed}
        setIsLayerMenuCollapsed={setIsLayerMenuCollapsed}
        isErcotMode={isErcotMode}
        setIsErcotMode={setIsErcotMode}
        showRoadGrid={showRoadGrid}
        setShowRoadGrid={setShowRoadGrid}
        showRoadParticles={showRoadParticles}
        setShowRoadParticles={setShowRoadParticles}
        showMUDLayer={showMUDLayer}
        setShowMUDLayer={setShowMUDLayer}
        showHarveyData={showHarveyData}
        setShowZipCodes={setShowZipCodes}
        showZipFloodAnalysis={showZipFloodAnalysis}
        setShowZipFloodAnalysis={setShowZipFloodAnalysis}
        showAIConsensus={showAIConsensus}
        setShowAIConsensus={setShowAIConsensus}
        showCensusBlocks={showCensusBlocks}
        setShowCensusBlocks={setShowCensusBlocks}
        showCommunityCenters={showCommunityCenters}
        setShowCommunityCenters={setShowCommunityCenters}
        showFlood100={showFlood100}
        setShowFlood100={setShowFlood100}
        showFlood500={showFlood500}
        setShowFlood500={setShowFlood500}
        showFloodplainDistanceLines={showFloodplainDistanceLines}
        setShowFloodplainDistanceLines={setShowFloodplainDistanceLines}
        fetchErcotData={() => ercotManagerRef.current?.fetchErcotData()}
        loadHarveyData={loadHarveyData}
        showChurches={showChurches}
        setShowChurches={setShowChurches}
        showTreeDebris={showTreeDebris}
        setShowTreeDebris={setShowTreeDebris}
        show311Calls={show311Calls}
        setShow311Calls={setShow311Calls}
        showAugust311Calls={showAugust311Calls}
        setShowAugust311Calls={setShowAugust311Calls}
        showJune311Calls={showJune311Calls}
        setShowJune311Calls={setShowJune311Calls}
        showJuly311Calls={showJuly311Calls}
        setShowJuly311Calls={setShowJuly311Calls}
        showSuperNeighborhoods={showSuperNeighborhoods}
        setShowSuperNeighborhoods={setShowSuperNeighborhoods}
        showMedianIncome2022={showMedianIncome2022}
        setShowMedianIncome2022={setShowMedianIncome2022}
        showVulnerabilityIndex={showVulnerabilityIndex}
        setShowVulnerabilityIndex={setShowVulnerabilityIndex}
      />

        <ToggleButton 
          $active={showRoadParticles}
          onClick={() => setShowRoadParticles(!showRoadParticles)}
          style={{ height: '32px', padding: '0 12px', fontSize: '14px', marginBottom: '8px' }}
        >
          {showRoadParticles ? 'Hide Flow' : 'Show Flow'}
        </ToggleButton>

        {/* 3D Mode Toggle Button */}
        <Toggle3DButton 
          $active={is3DActive}
          onClick={toggle3D}
          aria-label="Toggle 3D view"
        >
          {is3DActive ? '2D' : '3D'}
        </Toggle3DButton>
        
        {/* Rotation Button */}
        <RotateButton 
          onClick={rotateMap}
          aria-label="Rotate map"
        >
          ↻
        </RotateButton>

      <AIChatPanel 
        messages={messages}
        setMessages={setMessages}
        isLoading={isLoading}
        loadingMessage={loadingMessage}
        inputValue={inputValue}
        setInputValue={setInputValue}
        handleQuestion={async (question) => {
          try {
            const response = await handleQuestion(question, {
              center: map.current.getCenter(),
              zoom: map.current.getZoom()
            });
            return response;
          } catch (error) {
            console.error('Error handling question:', error);
            return null;
          }
        }}
        map={map.current}
        initialCollapsed={true}
      />

      {isCalculating && (
        <div style={{
          position: 'absolute',
          top: 80,
          left: '50%',
          transform: 'translateX(-50%)',
          zIndex: 1000,
          background: 'rgba(0,0,0,0.8)',
          color: '#fff',
          padding: '16px 32px',
          borderRadius: 8,
          fontSize: 18,
          fontWeight: 600,
          boxShadow: '0 2px 8px rgba(0,0,0,0.2)'
        }}>
          Calculating distance line...
        </div>
      )}

      {/* 311 Calls Color Legend - Fixed Visual */}
      <div style={{
        position: 'fixed',
        left: 24,
        bottom: 24,
        zIndex: 1002,
        background: 'rgba(20,20,30,0.95)',
        color: '#fff',
        borderRadius: 12,
        boxShadow: '0 2px 8px rgba(0,0,0,0.25)',
        padding: '16px 20px',
        minWidth: 280,
        maxWidth: 320,
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'flex-start',
        gap: 8
      }}>
        <div style={{ fontWeight: 700, fontSize: 16, marginBottom: 8, textAlign: 'center', width: '100%' }}>
          311 Calls Categories
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 12 }}>
          <div style={{ width: 12, height: 12, borderRadius: '50%', backgroundColor: '#FF0000' }}></div>
          <span>Power Outage</span>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 12 }}>
          <div style={{ width: 12, height: 12, borderRadius: '50%', backgroundColor: '#FFFF00' }}></div>
          <span>Storm Debris</span>
      </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 12 }}>
          <div style={{ width: 12, height: 12, borderRadius: '50%', backgroundColor: '#FFA500' }}></div>
          <span>Flood & Drainage</span>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 12 }}>
          <div style={{ width: 12, height: 12, borderRadius: '50%', backgroundColor: '#00FFFF' }}></div>
          <span>Traffic & Infrastructure</span>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 12 }}>
          <div style={{ width: 12, height: 12, borderRadius: '50%', backgroundColor: '#0000B3' }}></div>
          <span>Maintenance</span>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 12 }}>
          <div style={{ width: 12, height: 12, borderRadius: '50%', backgroundColor: '#614F8A' }}></div>
          <span>Nuisance & Code</span>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 12 }}>
          <div style={{ width: 12, height: 12, borderRadius: '50%', backgroundColor: '#00E600' }}></div>
          <span>Other</span>
        </div>
      </div>

      {/* Vulnerability Animation */}
      <VulnerabilityAnimation
        map={map.current}
        isVisible={true}
        onAnimationUpdate={(animationState) => {
          if (animationState !== null) {
            setShowVulnerabilityAnimation(true);
            setCurrentAnimationMonth(animationState);
          } else {
            setShowVulnerabilityAnimation(false);
          }
        }}
        currentDay={currentAnimationMonth}
      />
    </MapContainer>
  );
};

export default MapComponent;


