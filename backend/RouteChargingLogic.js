const ChargingStation = require('./ChargingStation');
require('dotenv').config();

/**
 * Find charging stations along a route
 * @param {Array} routeCoordinates - Array of [lng, lat] coordinates defining the route
 * @param {Number} maxDistance - Maximum distance in kilometers from route (default: 5km)
 * @param {Number} maxStations - Maximum number of stations to return (default: 4)
 * @returns {Array} Array of charging stations with additional route info
 */
async function findChargingStationsAlongRoute(routeCoordinates, maxDistance = 5, maxStations = 4) {
  try {
    if (!routeCoordinates || routeCoordinates.length < 2) {
      return [];
    }

    // Method 1: Use $geoWithin with a buffered polygon around the route
    const stations = await findStationsWithinRouteBuffer(routeCoordinates, maxDistance, maxStations);
    
    if (stations.length > 0) {
      return stations;
    }

    // Method 2: Fallback to sampling points along the route
    return await findStationsNearRoutePoints(routeCoordinates, maxDistance, maxStations);

  } catch (error) {
    console.error('Error finding charging stations along route:', error);
    // Final fallback
    return await findStationsNearRoutePoints(routeCoordinates, maxDistance, maxStations);
  }
}

/**
 * Find stations within a buffered area around the route using $geoWithin
 * @param {Array} routeCoordinates - Array of [lng, lat] coordinates
 * @param {Number} maxDistance - Maximum distance in km
 * @param {Number} maxStations - Maximum stations to return
 * @returns {Array} Array of charging stations
 */
async function findStationsWithinRouteBuffer(routeCoordinates, maxDistance, maxStations) {
  try {
    // Create a bounding box around the route
    const bounds = calculateRouteBounds(routeCoordinates);
    
    // Expand bounds by maxDistance (approximate)
    const buffer = maxDistance / 111; // Rough conversion: 1 degree ≈ 111km
    const expandedBounds = {
      minLng: bounds.minLng - buffer,
      maxLng: bounds.maxLng + buffer,
      minLat: bounds.minLat - buffer,
      maxLat: bounds.maxLat + buffer
    };

    // Find stations within the expanded bounding box
    const nearbyStations = await ChargingStation.find({
      isOperational: true,
      'location.coordinates.0': { 
        $gte: expandedBounds.minLng, 
        $lte: expandedBounds.maxLng 
      },
      'location.coordinates.1': { 
        $gte: expandedBounds.minLat, 
        $lte: expandedBounds.maxLat 
      }
    }).limit(maxStations * 5); // Get more to filter better ones

    if (nearbyStations.length === 0) {
      return [];
    }

    // Calculate actual distance from route for each station
    const stationsWithDistance = nearbyStations.map(station => {
      const stationCoords = station.location.coordinates;
      const routePosition = findNearestPointOnRoute(stationCoords, routeCoordinates);
      
      // Only include stations within the specified distance
      if (routePosition.distanceKm <= maxDistance) {
        return {
          ...station.toObject(),
          routePosition: routePosition,
          distanceFromRouteKm: routePosition.distanceKm
        };
      }
      return null;
    }).filter(Boolean);

    // Sort by route position and select evenly spaced stations
    stationsWithDistance.sort((a, b) => a.routePosition.index - b.routePosition.index);
    
    return selectEvenlySpacedStations(stationsWithDistance, maxStations);

  } catch (error) {
    console.error('Error in findStationsWithinRouteBuffer:', error);
    return [];
  }
}

/**
 * Alternative method: Find stations near multiple points along the route
 * @param {Array} routeCoordinates - Array of [lng, lat] coordinates
 * @param {Number} maxDistance - Maximum distance in km
 * @param {Number} maxStations - Maximum stations to return
 * @returns {Array} Array of charging stations
 */
async function findStationsNearRoutePoints(routeCoordinates, maxDistance = 5, maxStations = 4) {
  try {
    // Sample points along the route (every 10th point or reduce based on route length)
    const sampleInterval = Math.max(1, Math.floor(routeCoordinates.length / 10));
    const samplePoints = routeCoordinates.filter((_, index) => index % sampleInterval === 0);
    
    const allStations = new Map(); // Use Map to avoid duplicates

    // Find stations near each sample point using $geoNear
    for (const point of samplePoints) {
      try {
        const nearbyStations = await ChargingStation.aggregate([
          {
            $geoNear: {
              near: {
                type: 'Point',
                coordinates: point
              },
              distanceField: 'distanceFromPoint',
              maxDistance: maxDistance * 1000, // Convert to meters
              spherical: true,
              query: { isOperational: true }
            }
          },
          {
            $limit: 10
          }
        ]);

        // Add stations to our collection, avoiding duplicates
        nearbyStations.forEach(station => {
          if (!allStations.has(station.stationId)) {
            const stationCoords = station.location.coordinates;
            const routePosition = findNearestPointOnRoute(stationCoords, routeCoordinates);
            
            allStations.set(station.stationId, {
              ...station,
              routePosition: routePosition,
              distanceFromRouteKm: Math.round((station.distanceFromPoint / 1000) * 10) / 10
            });
          }
        });
      } catch (pointError) {
        console.error(`Error finding stations near point ${point}:`, pointError);
      }
    }

    // Convert Map to Array and sort by route position
    const stationsArray = Array.from(allStations.values());
    stationsArray.sort((a, b) => a.routePosition.index - b.routePosition.index);

    // Select evenly spaced stations
    return selectEvenlySpacedStations(stationsArray, maxStations);

  } catch (error) {
    console.error('Error in findStationsNearRoutePoints:', error);
    return [];
  }
}

/**
 * Calculate bounding box for route coordinates
 * @param {Array} routeCoordinates - Array of [lng, lat] coordinates
 * @returns {Object} Bounding box with min/max lat/lng
 */
function calculateRouteBounds(routeCoordinates) {
  let minLng = Infinity, maxLng = -Infinity;
  let minLat = Infinity, maxLat = -Infinity;
  
  routeCoordinates.forEach(([lng, lat]) => {
    minLng = Math.min(minLng, lng);
    maxLng = Math.max(maxLng, lng);
    minLat = Math.min(minLat, lat);
    maxLat = Math.max(maxLat, lat);
  });
  
  return { minLng, maxLng, minLat, maxLat };
}

/**
 * Find the nearest point on route to a given station
 * @param {Array} stationCoords - [lng, lat] of the charging station
 * @param {Array} routeCoordinates - Array of route coordinates
 * @returns {Object} Nearest point info with index and distance
 */
function findNearestPointOnRoute(stationCoords, routeCoordinates) {
  let minDistance = Infinity;
  let nearestIndex = 0;
  let nearestPoint = routeCoordinates[0];

  for (let i = 0; i < routeCoordinates.length; i++) {
    const distance = calculateDistance(stationCoords, routeCoordinates[i]);
    if (distance < minDistance) {
      minDistance = distance;
      nearestIndex = i;
      nearestPoint = routeCoordinates[i];
    }
  }

  return {
    index: nearestIndex,
    coordinates: nearestPoint,
    distanceKm: Math.round(minDistance * 10) / 10
  };
}

/**
 * Select evenly spaced stations along the route
 * @param {Array} stations - Stations sorted by route position
 * @param {Number} maxStations - Maximum number of stations to select
 * @returns {Array} Selected stations
 */
function selectEvenlySpacedStations(stations, maxStations) {
  if (stations.length <= maxStations) {
    return stations;
  }

  const selected = [];
  const totalStations = stations.length;
  const spacing = Math.floor(totalStations / maxStations);

  for (let i = 0; i < maxStations; i++) {
    const index = Math.min(i * spacing, totalStations - 1);
    selected.push(stations[index]);
  }

  return selected;
}

/**
 * Calculate distance between two coordinates using Haversine formula
 * @param {Array} coord1 - [lng, lat]
 * @param {Array} coord2 - [lng, lat]
 * @returns {Number} Distance in kilometers
 */
function calculateDistance(coord1, coord2) {
  const R = 6371; // Earth's radius in kilometers
  const lat1 = coord1[1] * Math.PI / 180;
  const lat2 = coord2[1] * Math.PI / 180;
  const deltaLat = (coord2[1] - coord1[1]) * Math.PI / 180;
  const deltaLng = (coord2[0] - coord1[0]) * Math.PI / 180;

  const a = Math.sin(deltaLat / 2) * Math.sin(deltaLat / 2) +
    Math.cos(lat1) * Math.cos(lat2) *
    Math.sin(deltaLng / 2) * Math.sin(deltaLng / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));

  return R * c;
}


async function populateChargingStationsFromAPI(boundingBox, countryCode = 'ES') {
  try {
    
    const API_KEY = process.env.OPENCHARGE_MAP_API_KEY;
    
    if (!API_KEY) {
      console.log('OpenChargeMap API key not found. Skipping station population.');
      return;
    }

    const axios = require('axios');
    const url = `https://api.openchargemap.io/v3/poi/`;
    
    const params = {
      key: API_KEY,
      countrycode: 'ES',
      maxresults: 1000,
      compact: true,
      verbose: false,
   
      ...(boundingBox && {
        boundingbox: `${boundingBox.south},${boundingBox.west},${boundingBox.north},${boundingBox.east}`
      })
    };

    const response = await axios.get(url, { params });
    const stations = response.data;

    for (const station of stations) {
      if (!station.AddressInfo || !station.AddressInfo.Latitude || !station.AddressInfo.Longitude) {
        continue;
      }

      const stationData = {
        stationId: `ocm_${station.ID}`,
        name: station.AddressInfo.Title || 'Unknown Station',
        address: `${station.AddressInfo.AddressLine1 || ''} ${station.AddressInfo.Town || ''} ${station.AddressInfo.Postcode || ''}`.trim(),
        location: {
          type: 'Point',
          coordinates: [station.AddressInfo.Longitude, station.AddressInfo.Latitude]
        },
        connectorTypes: station.Connections?.map(conn => 
          conn.ConnectionType?.Title || 'Other'
        ).filter(Boolean) || ['Other'],
        powerKw: station.Connections?.[0]?.PowerKW || 0,
        operatorName: station.OperatorInfo?.Title || 'Unknown',
        isOperational: station.StatusType?.ID === 50, // 50 = Operational in OCM
        openingHours: station.AddressInfo?.AccessComments || 'Unknown',
        phoneNumber: station.AddressInfo?.ContactTelephone1,
        website: station.AddressInfo?.RelatedURL,
        externalSource: {
          provider: 'OpenChargeMap',
          externalId: station.ID.toString(),
          lastUpdated: new Date()
        }
      };

      // Upsert station (update if exists, insert if new)
      await ChargingStation.findOneAndUpdate(
        { stationId: stationData.stationId },
        stationData,
        { upsert: true, new: true }
      );
    }

    console.log(`Successfully populated ${stations.length} charging stations from OpenChargeMap`);
  } catch (error) {
    console.error('Error populating charging stations:', error);
  }
}

module.exports = {
  findChargingStationsAlongRoute,
  findStationsNearRoutePoints,
  findStationsWithinRouteBuffer,
  populateChargingStationsFromAPI,
  calculateDistance
};