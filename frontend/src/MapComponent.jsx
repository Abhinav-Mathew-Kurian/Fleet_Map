import React, { useEffect, useRef, useState } from 'react';
import { MapContainer, TileLayer, Marker, Popup, useMap, Polyline } from 'react-leaflet';
import 'leaflet/dist/leaflet.css';
import L from 'leaflet';

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

// NEW: Charging station icon
const chargingStationIcon = new L.divIcon({
  html: '<span style="font-size: 24px;">⚡</span>',
  className: 'custom-charging-icon',
  iconSize: [24, 24],
  iconAnchor: [12, 24],
  popupAnchor: [0, -20]
});

function InitialMapUpdater({ center, zoom }) {
  const map = useMap();
  const hasUpdated = useRef(false);

  useEffect(() => {
    if (!hasUpdated.current && Array.isArray(center) && center.length === 2 && 
        typeof center[0] === 'number' && typeof center[1] === 'number' && 
        typeof zoom === 'number' && center[0] !== 0 && center[1] !== 0) {
      map.setView(center, zoom, { animate: true, duration: 0.5 });
      hasUpdated.current = true;
    }
  }, [center, zoom, map]);

  return null;
}

function MyLocationButton({ truckLocation }) {
  const map = useMap();

  const handleGoToTruck = () => {
    if (truckLocation && truckLocation.length === 2) {
      map.setView(truckLocation, 13, { animate: true, duration: 0.5 });
    }
  };

  return (
    <div style={{
      position: 'absolute',
      top: '10px',
      right: '10px',
      zIndex: 1000,
    }}>
      <button
        onClick={handleGoToTruck}
        disabled={!truckLocation}
        style={{
          padding: '10px',
          backgroundColor: 'white',
          border: '2px solid #ccc',
          borderRadius: '4px',
          cursor: truckLocation ? 'pointer' : 'not-allowed',
          fontSize: '16px',
          boxShadow: '0 2px 4px rgba(0,0,0,0.2)',
          opacity: truckLocation ? 1 : 0.6
        }}
        title="Go to truck location"
      >
        🚚
      </button>
    </div>
  );
}

const MapComponent = ({ selectedTruck, facilityData, routeData, livePosition, onGetRoute }) => {
  const defaultCenter = [0, 0];
  const defaultZoom = 2;

  const latitude = selectedTruck?.location?.coordinates?.[1];
  const longitude = selectedTruck?.location?.coordinates?.[0];

  // Use live position if available, otherwise use truck's stored position
  const currentLatitude = livePosition ? livePosition[1] : latitude;
  const currentLongitude = livePosition ? livePosition[0] : longitude;

  const mapCenter = (typeof currentLatitude === 'number' && typeof currentLongitude === 'number')
    ? [currentLatitude, currentLongitude]
    : defaultCenter;

  const currentZoom = (typeof currentLatitude === 'number' && typeof currentLongitude === 'number')
    ? 13
    : defaultZoom;

  const showMarker = (typeof currentLatitude === 'number' && typeof currentLongitude === 'number');

  // Process route data for polyline
  const routeCoordinates = routeData?.features?.[0]?.geometry?.coordinates?.map(coord => [coord[1], coord[0]]) || [];
  
  // NEW: Get charging stations from route data
  const chargingStations = routeData?.chargingStations || [];

  const FacilityPopup = ({ facility }) => {
    const [loading, setLoading] = useState(false);

    const handleGetRoute = async () => {
      if (!selectedTruck || !facility.location?.coordinates) return;

      setLoading(true);
      try {
        const startLat = currentLatitude;
        const startLng = currentLongitude;
        const endLat = facility.location.coordinates[1];
        const endLng = facility.location.coordinates[0];

        await onGetRoute(startLat, startLng, endLat, endLng, facility.title);
      } catch (error) {
        console.error('Error getting route:', error);
      } finally {
        setLoading(false);
      }
    };

    return (
      <div style={{ minWidth: '200px' }}>
        <div style={{ fontWeight: 'bold', marginBottom: '8px' }}>
          {facility.title}
        </div>
        <div style={{ marginBottom: '12px', fontSize: '14px' }}>
          {facility.address}
        </div>
        <button
          onClick={handleGetRoute}
          disabled={loading || !selectedTruck}
          style={{
            width: '100%',
            padding: '8px 16px',
            backgroundColor: loading || !selectedTruck ? '#ccc' : '#1976d2',
            color: 'white',
            border: 'none',
            borderRadius: '4px',
            cursor: loading || !selectedTruck ? 'not-allowed' : 'pointer',
            fontSize: '14px'
          }}
        >
          {loading ? 'Getting Route...' : 'Get Route'}
        </button>
      </div>
    );
  };

  // NEW: Charging Station Popup Component
  const ChargingStationPopup = ({ station }) => {
    const formatConnectors = (connectors) => {
      if (!connectors || connectors.length === 0) return 'N/A';
      return connectors.join(', ');
    };

    const formatPower = (powerKw) => {
      return powerKw ? `${powerKw} kW` : 'N/A';
    };

    const formatDistance = (distanceKm) => {
      return distanceKm ? `${distanceKm} km from route` : '';
    };

    return (
      <div style={{ minWidth: '250px', fontSize: '14px' }}>
        <div style={{ fontWeight: 'bold', marginBottom: '8px', color: '#1976d2' }}>
          ⚡ {station.name}
        </div>
        
        <div style={{ marginBottom: '6px' }}>
          <strong>Address:</strong> {station.address}
        </div>
        
        <div style={{ marginBottom: '6px' }}>
          <strong>Power:</strong> {formatPower(station.powerKw)}
        </div>
        
        <div style={{ marginBottom: '6px' }}>
          <strong>Connectors:</strong> {formatConnectors(station.connectorTypes)}
        </div>
        
        {station.operatorName && (
          <div style={{ marginBottom: '6px' }}>
            <strong>Operator:</strong> {station.operatorName}
          </div>
        )}
        
        {station.distanceFromRouteKm && (
          <div style={{ marginBottom: '6px', color: '#666' }}>
            📍 {formatDistance(station.distanceFromRouteKm)}
          </div>
        )}
        
        {station.openingHours && station.openingHours !== 'Unknown' && (
          <div style={{ marginBottom: '6px', fontSize: '12px' }}>
            <strong>Hours:</strong> {station.openingHours}
          </div>
        )}
        
        {station.phoneNumber && (
          <div style={{ marginBottom: '6px', fontSize: '12px' }}>
            <strong>Phone:</strong> {station.phoneNumber}
          </div>
        )}
        
        <div style={{ 
          marginTop: '8px', 
          padding: '4px 8px', 
          backgroundColor: station.isOperational ? '#e8f5e8' : '#ffeaea',
          borderRadius: '4px',
          fontSize: '12px',
          color: station.isOperational ? '#2e7d32' : '#d32f2f'
        }}>
          Status: {station.isOperational ? 'Operational' : 'Out of Order'}
        </div>
      </div>
    );
  };

  return (
    <div style={{ position: 'relative', height: '100%', width: '100%' }}>
      <MapContainer
        center={mapCenter}
        zoom={currentZoom}
        scrollWheelZoom={true}
        style={{ height: '100%', width: '100%', borderRadius: '8px' }}
      >
        <TileLayer
          attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
          url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
        />

        <InitialMapUpdater center={mapCenter} zoom={currentZoom} />
        <MyLocationButton truckLocation={showMarker ? mapCenter : null} />

        {/* Route Polyline */}
        {routeCoordinates.length > 0 && (
          <Polyline
            positions={routeCoordinates}
            color="blue"
            weight={4}
            opacity={0.7}
          />
        )}

        {/* Truck Marker */}
        {showMarker && (
          <Marker position={mapCenter} icon={truckIcon}>
            <Popup>
              <strong>{selectedTruck.fleetId} - {selectedTruck.name}</strong><br />
              Model: {selectedTruck.truck.make} {selectedTruck.truck.model}<br />
              Battery SoC: {selectedTruck.truck.batterySOC_percent}%<br />
              Charging Status: {selectedTruck.truck.chargingStatus}
            </Popup>
          </Marker>
        )}

        {/* Facility Markers */}
        {facilityData.map((facility) => {
          const facilityLatitude = facility?.location?.coordinates?.[1];
          const facilityLongitude = facility?.location?.coordinates?.[0];

          if (typeof facilityLatitude === 'number' && typeof facilityLongitude === 'number') {
            return (
              <Marker
                key={facility._id}
                position={[facilityLatitude, facilityLongitude]}
                icon={storageBuildingIcon}
              >
                <Popup>
                  <FacilityPopup facility={facility} />
                </Popup>
              </Marker>
            );
          }
          return null;
        })}

        {/* NEW: Charging Station Markers */}
        {chargingStations.map((station) => {
          const stationLatitude = station?.location?.coordinates?.[1];
          const stationLongitude = station?.location?.coordinates?.[0];

          if (typeof stationLatitude === 'number' && typeof stationLongitude === 'number') {
            return (
              <Marker
                key={station._id || station.stationId}
                position={[stationLatitude, stationLongitude]}
                icon={chargingStationIcon}
              >
                <Popup>
                  <ChargingStationPopup station={station} />
                </Popup>
              </Marker>
            );
          }
          return null;
        })}

        {!showMarker && (
          <div style={{
            position: 'absolute',
            top: '50%',
            left: '50%',
            transform: 'translate(-50%, -50%)',
            backgroundColor: 'rgba(255, 255, 255, 0.8)',
            padding: '15px',
            borderRadius: '8px',
            zIndex: 1000,
            textAlign: 'center',
            boxShadow: '0 2px 10px rgba(0,0,0,0.1)'
          }}>
            <p>No truck selected or location data unavailable.</p>
            <p>Please select a truck from the sidebar.</p>
          </div>
        )}
      </MapContainer>
      
      {/* NEW: Charging Stations Legend */}
      {chargingStations.length > 0 && (
        <div style={{
          position: 'absolute',
          bottom: '20px',
          left: '20px',
          backgroundColor: 'rgba(255, 255, 255, 0.95)',
          padding: '12px',
          borderRadius: '8px',
          boxShadow: '0 2px 10px rgba(0,0,0,0.2)',
          zIndex: 1000,
          fontSize: '14px',
          maxWidth: '300px'
        }}>
          <div style={{ fontWeight: 'bold', marginBottom: '8px' }}>
            ⚡ Charging Stations ({chargingStations.length})
          </div>
          <div style={{ fontSize: '12px', color: '#666' }}>
            Found {chargingStations.length} charging station{chargingStations.length !== 1 ? 's' : ''} along your route
          </div>
        </div>
      )}
    </div>
  );
};

export default MapComponent;