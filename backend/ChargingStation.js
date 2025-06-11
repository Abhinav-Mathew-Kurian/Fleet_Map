const mongoose = require('mongoose');

const ChargingStationSchema = new mongoose.Schema({
  stationId: {
    type: String,
    required: true,
    unique: true
  },
  name: {
    type: String,
    required: true
  },
  address: {
    type: String,
    required: true
  },
  location: {
    type: {
      type: String,
      enum: ['Point'],
      required: true
    },
    coordinates: {
      type: [Number], // [longitude, latitude]
      required: true
      // REMOVED: index: '2dsphere' - this was causing the duplicate
    }
  },
  connectorTypes: [{
    type: String,
    enum: ['CCS', 'CHAdeMO', 'Type2', 'Tesla', 'J1772', 'Other']
  }],
  powerKw: {
    type: Number,
    required: true
  },
  operatorName: String,
  isOperational: {
    type: Boolean,
    default: true
  },
  cost: {
    perKwh: Number,
    currency: String
  },
  amenities: [String], // ['restaurant', 'restroom', 'wifi', 'parking']
  openingHours: String,
  phoneNumber: String,
  website: String,
  rating: {
    type: Number,
    min: 0,
    max: 5
  },
  externalSource: {
    provider: String, // 'OpenChargeMap', 'PlugShare', etc.
    externalId: String,
    lastUpdated: Date
  }
}, { 
  timestamps: true 
});

// Keep only this 2dsphere index for geospatial queries
ChargingStationSchema.index({ location: '2dsphere' });

module.exports = mongoose.model('ChargingStation', ChargingStationSchema);