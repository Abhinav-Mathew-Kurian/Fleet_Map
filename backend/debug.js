const ChargingStation = require('./ChargingStation');
const mongoose = require('mongoose');
require('dotenv').config();

async function debugChargingStations() {
  try {
    // Connect to MongoDB
    await mongoose.connect(process.env.MONGODB_URI || 'mongodb://localhost:27017/fleetMap');
    
    console.log('=== DEBUGGING CHARGING STATIONS ===\n');
    
    // 1. Check total count of stations
    const totalStations = await ChargingStation.countDocuments();
    console.log(`1. Total charging stations in database: ${totalStations}`);
    
    if (totalStations === 0) {
      console.log('❌ NO STATIONS FOUND - Database is empty!');
      console.log('You need to populate the database first.\n');
      return;
    }
    
    // 2. Check operational stations
    const operationalStations = await ChargingStation.countDocuments({ isOperational: true });
    console.log(`2. Operational stations: ${operationalStations}`);
    
    // 3. Sample some stations
    const sampleStations = await ChargingStation.find().limit(5);
    console.log('\n3. Sample stations:');
    sampleStations.forEach((station, index) => {
      console.log(`   ${index + 1}. ${station.name}`);
      console.log(`      Location: [${station.location.coordinates[0]}, ${station.location.coordinates[1]}]`);
      console.log(`      Address: ${station.address}`);
      console.log(`      Operational: ${station.isOperational}`);
      console.log('');
    });
    
    // 4. Check stations by country (for Spain)
    const spainStations = await ChargingStation.countDocuments({
      address: { $regex: /spain|españa|madrid|barcelona|valencia/i }
    });
    console.log(`4. Stations mentioning Spain in address: ${spainStations}`);
    
    // 5. Check geographic bounds
    const bounds = await ChargingStation.aggregate([
      {
        $group: {
          _id: null,
          minLng: { $min: '$location.coordinates.0' },
          maxLng: { $max: '$location.coordinates.0' },
          minLat: { $min: '$location.coordinates.1' },
          maxLat: { $max: '$location.coordinates.1' }
        }
      }
    ]);
    
    if (bounds.length > 0) {
      console.log('\n5. Geographic bounds of your data:');
      console.log(`   Longitude: ${bounds[0].minLng} to ${bounds[0].maxLng}`);
      console.log(`   Latitude: ${bounds[0].minLat} to ${bounds[0].maxLat}`);
      
      // Spain bounds for reference: 
      // Longitude: -9.3 to 3.3, Latitude: 35.9 to 43.8
      const spainMinLng = -9.3, spainMaxLng = 3.3;
      const spainMinLat = 35.9, spainMaxLat = 43.8;
      
      const hasSpainData = bounds[0].minLng <= spainMaxLng && bounds[0].maxLng >= spainMinLng &&
                          bounds[0].minLat <= spainMaxLat && bounds[0].maxLat >= spainMinLat;
      
      console.log(`   Covers Spain area: ${hasSpainData ? '✅ YES' : '❌ NO'}`);
    }
    
    console.log('\n=== DEBUG COMPLETE ===');
    
  } catch (error) {
    console.error('Debug error:', error);
  } finally {
    await mongoose.disconnect();
  }
}

// Test the OpenChargeMap API connection
async function testOpenChargeMapAPI() {
  try {
    console.log('\n=== TESTING OPENCHARGE MAP API ===\n');
    
    const API_KEY = process.env.OPENCHARGE_MAP_API_KEY;
    
    if (!API_KEY) {
      console.log('❌ OpenChargeMap API key not found in environment variables');
      console.log('Add OPENCHARGE_MAP_API_KEY to your .env file');
      return;
    }
    
    console.log('✅ API Key found');
    
    const axios = require('axios');
    const url = 'https://api.openchargemap.io/v3/poi/';
    
    // Test with Spain data
    const params = {
      key: API_KEY,
      countrycode: 'ES', // Spain
      maxresults: 10,
      compact: true,
      verbose: false
    };
    
    console.log('Making API request to OpenChargeMap...');
    
    const response = await axios.get(url, { params });
    
    console.log(`✅ API Response received: ${response.data.length} stations`);
    
    if (response.data.length > 0) {
      console.log('\nSample station from API:');
      const station = response.data[0];
      console.log(`   Name: ${station.AddressInfo?.Title}`);
      console.log(`   Location: ${station.AddressInfo?.Town}, ${station.AddressInfo?.StateOrProvince}`);
      console.log(`   Coordinates: [${station.AddressInfo?.Longitude}, ${station.AddressInfo?.Latitude}]`);
      console.log(`   Operational: ${station.StatusType?.Title}`);
    }
    
  } catch (error) {
    console.error('❌ OpenChargeMap API Error:', error.message);
    if (error.response) {
      console.error('Response status:', error.response.status);
      console.error('Response data:', error.response.data);
    }
  }
}

// Manual population function for Spain
async function populateSpainStations() {
  try {
    await mongoose.connect(process.env.MONGODB_URI || 'mongodb://localhost:27017/fleetMap');
    
    console.log('\n=== POPULATING SPAIN STATIONS ===\n');
    
    const API_KEY = process.env.OPENCHARGE_MAP_API_KEY;
    
    if (!API_KEY) {
      console.log('❌ API key required');
      return;
    }
    
    const axios = require('axios');
    const url = 'https://api.openchargemap.io/v3/poi/';
    
    const params = {
      key: API_KEY,
      countrycode: 'ES', // Spain
      maxresults: 1000,
      compact: false,
      verbose: false
    };
    
    console.log('Fetching stations from OpenChargeMap...');
    const response = await axios.get(url, { params });
    const stations = response.data;
    
    console.log(`Found ${stations.length} stations to process`);
    
    let inserted = 0;
    let skipped = 0;
    
    for (const station of stations) {
      try {
        if (!station.AddressInfo || !station.AddressInfo.Latitude || !station.AddressInfo.Longitude) {
          skipped++;
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

        await ChargingStation.findOneAndUpdate(
          { stationId: stationData.stationId },
          stationData,
          { upsert: true, new: true }
        );
        
        inserted++;
        
        if (inserted % 100 === 0) {
          console.log(`Processed ${inserted} stations...`);
        }
        
      } catch (stationError) {
        console.error(`Error processing station ${station.ID}:`, stationError.message);
        skipped++;
      }
    }
    
    console.log(`\n✅ Population complete:`);
    console.log(`   Inserted/Updated: ${inserted} stations`);
    console.log(`   Skipped: ${skipped} stations`);
    
  } catch (error) {
    console.error('Population error:', error);
  } finally {
    await mongoose.disconnect();
  }
}

// Run the debug
if (require.main === module) {
  async function runDebug() {
    await debugChargingStations();
    await testOpenChargeMapAPI();
    
    console.log('\n=== NEXT STEPS ===');
    console.log('If you have no stations, run: node debug-script.js populate');
  }
  
  if (process.argv[2] === 'populate') {
    populateSpainStations();
  } else {
    runDebug();
  }
}

module.exports = {
  debugChargingStations,
  testOpenChargeMapAPI,
  populateSpainStations
};