import React, { useState, useEffect, useRef } from 'react';
import { MapContainer, TileLayer, Marker, Popup, Polyline } from 'react-leaflet';
import 'leaflet/dist/leaflet.css';
import L from 'leaflet';

// Custom icons
const truckIcon = new L.divIcon({
  html: '<span style="font-size: 30px;">🚚</span>',
  className: 'custom-truck-icon',
  iconSize: [30, 30],
  iconAnchor: [15, 30],
  popupAnchor: [0, -25]
});

const storageBuildingIcon = new L.divIcon({
  html: '<span style="font-size: 30px;">📦</span>',
  className: 'custom-storage-icon',
  iconSize: [30, 30],
  iconAnchor: [15, 30],
  popupAnchor: [0, -25]
});

const liveMarkerIcon = new L.divIcon({
  html: '<div style="background: #ff4444; color: white; border-radius: 50%; width: 20px; height: 20px; display: flex; align-items: center; justify-content: center; font-weight: bold; border: 2px solid white; box-shadow: 0 2px 4px rgba(0,0,0,0.3);">●</div>',
  className: 'custom-live-icon',
  iconSize: [20, 20],
  iconAnchor: [10, 10],
  popupAnchor: [0, -10]
});

const FleetManager = () => {
  const [liveRoutes, setLiveRoutes] = useState([]);
  const [fleetData, setFleetData] = useState([]);
  const [facilities, setFacilities] = useState([]);
  const [loading, setLoading] = useState(true);
  const [routeGeometries, setRouteGeometries] = useState({});
  const [loadingRoutes, setLoadingRoutes] = useState(new Set());
  
  // Cache to avoid refetching route geometries
  const routeGeometryCache = useRef({});
  
  useEffect(() => {
    fetchData();
    // Set up periodic data refresh
    const interval = setInterval(fetchData, 5000);
    return () => clearInterval(interval);
  }, []);

  const fetchData = async () => {
    try {
      // Fetch live tracking data
      const liveResponse = await fetch('http://localhost:5001/getLiveTracking');
      const liveData = await liveResponse.json();
      
      if (liveData.success) {
        setLiveRoutes(liveData.liveRoutes);
        // Batch fetch route geometries for new routes only
        await fetchRouteGeometriesBatch(liveData.liveRoutes);
      }

      // Fetch fleet data
      const fleetResponse = await fetch('http://localhost:5000/fleet');
      const fleetData = await fleetResponse.json();
      setFleetData(Array.isArray(fleetData) ? fleetData : []);

      // Fetch facilities data
      const facilitiesResponse = await fetch('http://localhost:5000/facility');
      const facilitiesData = await facilitiesResponse.json();
      setFacilities(Array.isArray(facilitiesData) ? facilitiesData : []);

      setLoading(false);
    } catch (error) {
      console.error('Error fetching data:', error);
      setLoading(false);
    }
  };

  const fetchRouteGeometriesBatch = async (routes) => {
    // Get routes that need geometry and aren't already being loaded
    const routesToFetch = routes.filter(route => 
      !routeGeometryCache.current[route.routeId] && 
      !loadingRoutes.has(route.routeId)
    );

    if (routesToFetch.length === 0) {
      // All routes already cached, update state with cached data
      const cachedGeometries = {};
      routes.forEach(route => {
        if (routeGeometryCache.current[route.routeId]) {
          cachedGeometries[route.routeId] = routeGeometryCache.current[route.routeId];
        }
      });
      setRouteGeometries(cachedGeometries);
      return;
    }

    // Mark routes as loading
    setLoadingRoutes(prev => {
      const newSet = new Set(prev);
      routesToFetch.forEach(route => newSet.add(route.routeId));
      return newSet;
    });

    // Fetch geometries in parallel with a limit to avoid overwhelming the server
    const batchSize = 5; // Process 5 routes at a time
    const batches = [];
    
    for (let i = 0; i < routesToFetch.length; i += batchSize) {
      batches.push(routesToFetch.slice(i, i + batchSize));
    }

    const newGeometries = {};

    for (const batch of batches) {
      const batchPromises = batch.map(async (route) => {
        try {
          const response = await fetch(`http://localhost:5001/getRoute/${route.routeId}`);
          if (response.ok) {
            const routeData = await response.json();
            if (routeData.features?.[0]?.geometry?.coordinates) {
              // Convert coordinates from [lng, lat] to [lat, lng] for Leaflet
              const coordinates = routeData.features[0].geometry.coordinates.map(coord => [coord[1], coord[0]]);
              
              // Cache the geometry
              routeGeometryCache.current[route.routeId] = coordinates;
              newGeometries[route.routeId] = coordinates;
            }
          }
        } catch (error) {
          console.error(`Error fetching route geometry for ${route.routeId}:`, error);
        }
      });

      await Promise.all(batchPromises);
    }

    // Update state with all geometries (cached + new)
    setRouteGeometries(prev => {
      const updated = { ...prev };
      // Add cached geometries for current routes
      routes.forEach(route => {
        if (routeGeometryCache.current[route.routeId]) {
          updated[route.routeId] = routeGeometryCache.current[route.routeId];
        }
      });
      return updated;
    });

    // Clear loading state
    setLoadingRoutes(prev => {
      const newSet = new Set(prev);
      routesToFetch.forEach(route => newSet.delete(route.routeId));
      return newSet;
    });
  };

  const getStatusColor = (status) => {
    switch (status) {
      case 'charging': return '#4caf50';
      case 'discharging': return '#ff9800';
      case 'idle': return '#9e9e9e';
      default: return '#9e9e9e';
    }
  };

  const getSOCColor = (soc) => {
    if (soc > 70) return '#4caf50';
    if (soc > 30) return '#ff9800';
    return '#f44336';
  };

  // Generate different colors for different routes
  const getRouteColor = (routeId, index) => {
    const colors = ['#ff4444', '#44ff44', '#4444ff', '#ffff44', '#ff44ff', '#44ffff', '#ff8844', '#8844ff', '#44ff88', '#ff4488'];
    return colors[index % colors.length];
  };

  const cardStyle = {
    background: 'white',
    border: '1px solid #ddd',
    borderRadius: '8px',
    padding: '16px',
    marginBottom: '12px',
    boxShadow: '0 2px 4px rgba(0,0,0,0.1)'
  };

  const progressBarStyle = {
    width: '100%',
    height: '8px',
    backgroundColor: '#e0e0e0',
    borderRadius: '4px',
    overflow: 'hidden',
    marginTop: '4px'
  };

  const progressFillStyle = (value, color = '#2196f3') => ({
    height: '100%',
    width: `${Math.min(100, Math.max(0, value))}%`,
    backgroundColor: color,
    transition: 'width 0.3s ease'
  });

  const chipStyle = (color) => ({
    display: 'inline-block',
    padding: '4px 8px',
    borderRadius: '12px',
    fontSize: '12px',
    fontWeight: 'bold',
    color: 'white',
    backgroundColor: color
  });

  if (loading) {
    return (
      <div style={{ 
        display: 'flex', 
        justifyContent: 'center', 
        alignItems: 'center', 
        minHeight: '100vh',
        fontSize: '18px'
      }}>
        Loading Fleet Manager...
      </div>
    );
  }

  return (
    <div style={{ padding: '20px', backgroundColor: '#f5f5f5', minHeight: '100vh' }}>
      <h1 style={{ marginBottom: '30px', color: '#333' }}>Fleet Manager Dashboard</h1>

      {/* Summary Stats */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '16px', marginBottom: '30px' }}>
        <div style={{ ...cardStyle, textAlign: 'center' }}>
          <h2 style={{ color: '#2196f3', margin: '0 0 8px 0' }}>{liveRoutes.length}</h2>
          <p style={{ margin: 0, color: '#666' }}>Active Routes</p>
        </div>
        <div style={{ ...cardStyle, textAlign: 'center' }}>
          <h2 style={{ color: '#4caf50', margin: '0 0 8px 0' }}>
            {fleetData.filter(f => f.truck && f.truck.batterySOC_percent > 70).length}
          </h2>
          <p style={{ margin: 0, color: '#666' }}>High Battery</p>
        </div>
        <div style={{ ...cardStyle, textAlign: 'center' }}>
          <h2 style={{ color: '#ff9800', margin: '0 0 8px 0' }}>
            {Object.keys(routeGeometries).length}
          </h2>
          <p style={{ margin: 0, color: '#666' }}>Routes Loaded</p>
        </div>
        <div style={{ ...cardStyle, textAlign: 'center' }}>
          <h2 style={{ color: '#9c27b0', margin: '0 0 8px 0' }}>{facilities.length}</h2>
          <p style={{ margin: 0, color: '#666' }}>Facilities</p>
        </div>
      </div>

      {/* Map Section */}
      <div style={{ ...cardStyle, marginBottom: '30px' }}>
        <h2 style={{ margin: '0 0 20px 0', color: '#333' }}>Live Fleet & Route Tracking</h2>
        <div style={{ height: '500px', width: '100%', borderRadius: '8px', border: '1px solid #ddd' }}>
          <MapContainer
            center={[9.9312, 76.2673]} // Kerala, India
            zoom={8}
            scrollWheelZoom={true}
            style={{ height: '100%', width: '100%', borderRadius: '8px' }}
          >
            <TileLayer
              attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
              url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
            />

            {/* Fleet Markers */}
            {fleetData.map((fleet, index) => {
              if (fleet.location && fleet.location.coordinates) {
                const [lng, lat] = fleet.location.coordinates;
                return (
                  <Marker key={`fleet-${fleet.fleetId || fleet._id}-${index}`} position={[lat, lng]} icon={truckIcon}>
                    <Popup>
                      <div>
                        <h3>{fleet.name}</h3>
                        <p><strong>Fleet ID:</strong> {fleet.fleetId}</p>
                        {fleet.truck && (
                          <>
                            <p><strong>Vehicle:</strong> {fleet.truck.make} {fleet.truck.model}</p>
                            <p><strong>Battery SOC:</strong> {fleet.truck.batterySOC_percent}%</p>
                            <p><strong>Range:</strong> {fleet.truck.range_km} km</p>
                            <p><strong>Status:</strong> {fleet.truck.chargingStatus}</p>
                            <p><strong>Temperature:</strong> {fleet.truck.batteryTemperature_C}°C</p>
                          </>
                        )}
                      </div>
                    </Popup>
                  </Marker>
                );
              }
              return null;
            })}

            {/* Facility Markers */}
            {facilities.map((facility, index) => {
              if (facility.location && facility.location.coordinates) {
                const [lng, lat] = facility.location.coordinates;
                return (
                  <Marker key={`facility-${facility._id || facility.facilityId}-${index}`} position={[lat, lng]} icon={storageBuildingIcon}>
                    <Popup>
                      <div>
                        <h3>{facility.name}</h3>
                        <p><strong>Type:</strong> {facility.type}</p>
                        <p><strong>Capacity:</strong> {facility.capacity} units</p>
                        <p><strong>Current Stock:</strong> {facility.currentStock} units</p>
                        <p><strong>Status:</strong> {facility.status}</p>
                      </div>
                    </Popup>
                  </Marker>
                );
              }
              return null;
            })}

            {/* Live Route Polylines and Markers */}
            {liveRoutes.map((route, index) => {
              const elements = [];
              const routeColor = getRouteColor(route.routeId, index);

              // Add route polyline if geometry is available
              if (routeGeometries[route.routeId] && routeGeometries[route.routeId].length > 0) {
                elements.push(
                  <Polyline
                    key={`polyline-${route.routeId}`}
                    positions={routeGeometries[route.routeId]}
                    color={routeColor}
                    weight={4}
                    opacity={0.8}
                    dashArray="10, 5"
                  />
                );
              }

              // Add live position marker
              if (route.currentPosition) {
                const [lng, lat] = route.currentPosition;
                elements.push(
                  <Marker key={`live-${route.routeId}`} position={[lat, lng]} icon={liveMarkerIcon}>
                    <Popup>
                      <div>
                        <h3>🔴 LIVE: {route.routeName}</h3>
                        <p><strong>User:</strong> {route.userId}</p>
                        <p><strong>Progress:</strong> {route.progress?.toFixed(1) || 0}%</p>
                        <p><strong>Position:</strong> [{lng.toFixed(4)}, {lat.toFixed(4)}]</p>
                        <p><strong>Started:</strong> {route.startTime ? new Date(route.startTime).toLocaleTimeString() : 'N/A'}</p>
                        <div style={{ 
                          width: '12px', 
                          height: '12px', 
                          backgroundColor: routeColor, 
                          borderRadius: '2px',
                          display: 'inline-block',
                          marginRight: '4px'
                        }}></div>
                        <span style={{ fontSize: '12px' }}>Route Color</span>
                      </div>
                    </Popup>
                  </Marker>
                );
              }

              return elements;
            })}
          </MapContainer>
        </div>
        <div style={{ marginTop: '10px', display: 'flex', gap: '20px', fontSize: '14px', color: '#666', flexWrap: 'wrap' }}>
          <span>🚚 Fleet Vehicles ({fleetData.length})</span>
          <span>🔴 Live Routes ({liveRoutes.length})</span>
          <span>📍 Route Geometries Loaded ({Object.keys(routeGeometries).length})</span>
          {loadingRoutes.size > 0 && <span>⏳ Loading Routes ({loadingRoutes.size})</span>}
        </div>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '20px', marginBottom: '30px' }}>
        {/* Live Routes Section */}
        <div style={{ ...cardStyle, height: '400px', overflow: 'auto' }}>
          <h2 style={{ margin: '0 0 20px 0', color: '#333' }}>
            Live Routes ({liveRoutes.length})
          </h2>
          
          {liveRoutes.length === 0 ? (
            <p style={{ color: '#666' }}>No active routes</p>
          ) : (
            liveRoutes.map((route, index) => (
              <div key={`${route.routeId}-${index}`} style={cardStyle}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '8px' }}>
                  <h3 style={{ margin: 0, color: '#333' }}>{route.routeName}</h3>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                    <div style={{ 
                      width: '12px', 
                      height: '12px', 
                      backgroundColor: getRouteColor(route.routeId, index), 
                      borderRadius: '2px' 
                    }}></div>
                    <span style={chipStyle('#4caf50')}>LIVE</span>
                  </div>
                </div>
                <p style={{ margin: '4px 0', color: '#666', fontSize: '14px' }}>
                  User: {route.userId}
                </p>
                <div style={{ marginTop: '12px' }}>
                  <p style={{ margin: '0 0 4px 0', fontSize: '14px' }}>
                    Progress: {route.progress ? route.progress.toFixed(1) : '0.0'}%
                  </p>
                  <div style={progressBarStyle}>
                    <div style={progressFillStyle(route.progress || 0, getRouteColor(route.routeId, index))}></div>
                  </div>
                </div>
                {route.currentPosition && (
                  <p style={{ margin: '8px 0 4px 0', fontSize: '14px' }}>
                    Position: [{route.currentPosition[0].toFixed(4)}, {route.currentPosition[1].toFixed(4)}]
                  </p>
                )}
                <p style={{ margin: '4px 0 0 0', fontSize: '14px', color: '#666' }}>
                  Started: {route.startTime ? new Date(route.startTime).toLocaleTimeString() : 'N/A'}
                </p>
                <p style={{ margin: '4px 0 0 0', fontSize: '12px', color: routeGeometries[route.routeId] ? '#4caf50' : '#ff9800' }}>
                  Route: {routeGeometries[route.routeId] ? '✓ Loaded' : loadingRoutes.has(route.routeId) ? '⏳ Loading...' : '⚠ Not loaded'}
                </p>
              </div>
            ))
          )}
        </div>

        {/* Fleet Status Section */}
        <div style={{ ...cardStyle, height: '400px', overflow: 'auto' }}>
          <h2 style={{ margin: '0 0 20px 0', color: '#333' }}>
            Fleet Status ({fleetData.length})
          </h2>
          
          {fleetData.length === 0 ? (
            <p style={{ color: '#666' }}>No fleet data available</p>
          ) : (
            fleetData.map((fleet, index) => (
              <div key={`${fleet.fleetId || fleet._id}-${index}`} style={cardStyle}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '8px' }}>
                  <h3 style={{ margin: 0, color: '#333' }}>{fleet.name}</h3>
                  {fleet.truck && (
                    <span style={chipStyle(getStatusColor(fleet.truck.chargingStatus))}>
                      {fleet.truck.chargingStatus ? fleet.truck.chargingStatus.toUpperCase() : 'UNKNOWN'}
                    </span>
                  )}
                </div>
                
                {fleet.truck && (
                  <>
                    <p style={{ margin: '4px 0', color: '#666', fontSize: '14px' }}>
                      {fleet.truck.make} {fleet.truck.model}
                    </p>
                    
                    <div style={{ marginTop: '12px' }}>
                      <p style={{ margin: '0 0 4px 0', fontSize: '14px' }}>
                        Battery SOC: {fleet.truck.batterySOC_percent}%
                      </p>
                      <div style={progressBarStyle}>
                        <div style={progressFillStyle(fleet.truck.batterySOC_percent, getSOCColor(fleet.truck.batterySOC_percent))}></div>
                      </div>
                    </div>
                    
                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px', marginTop: '12px' }}>
                      <p style={{ margin: 0, fontSize: '14px' }}>
                        Range: {fleet.truck.range_km} km
                      </p>
                      <p style={{ margin: 0, fontSize: '14px' }}>
                        Temp: {fleet.truck.batteryTemperature_C}°C
                      </p>
                    </div>
                    <p style={{ margin: '8px 0 4px 0', fontSize: '14px' }}>
                      Battery: {fleet.truck.batterySize_kWh} kWh
                    </p>
                  </>
                )}
                
                {fleet.location && fleet.location.coordinates && (
                  <p style={{ margin: '4px 0 0 0', fontSize: '14px', color: '#666' }}>
                    Location: [{fleet.location.coordinates[0].toFixed(4)}, {fleet.location.coordinates[1].toFixed(4)}]
                  </p>
                )}
              </div>
            ))
          )}
        </div>
      </div>
    </div>
  );
};

export default FleetManager;