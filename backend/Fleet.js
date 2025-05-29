const mongoose = require('mongoose');

const FleetSchema = new mongoose.Schema({
  fleetId: { type: String, required: true, index: true }, 
  userId: { type: String, required: true },
  name: { type: String, required: true }, 
  location: {
    type: {
      type: String,
      enum: ['Point'],
      required: true,
      default: 'Point'
    },
    coordinates: {
      type: [Number], 
      required: true,
      validate: {
        validator: function(v) {
          return v.length === 2;
        },
        message: 'Coordinates must be an array of two numbers [longitude, latitude]'
      }
    }
  },
  truck: {
    make: { type: String, required: true },
    model: { type: String, required: true },
    batterySize_kWh: { type: Number, required: true },
    batterySOC_percent: { type: Number, required: true },
    batteryTemperature_C: { type: Number, required: true },
    chargingStatus: {
      type: String,
      enum: ['charging', 'discharging', 'idle'],
      required: true
    },
    range_km: { type: Number, required: true }
  }
}, {
  timestamps: true 
});

FleetSchema.index({ location: '2dsphere' });

const Fleet=mongoose.model('Fleet', FleetSchema);

module.exports = Fleet;