const mongoose = require('mongoose');

const LocationSchema = new mongoose.Schema({
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
});

const FacilitySchema = new mongoose.Schema({
  title: { type: String, required: true },
  address: { type: String, required: true },
  location: { type: LocationSchema, required: true }
}, {
  timestamps: true
});

FacilitySchema.index({ location: '2dsphere' });
const Facility=  mongoose.model('Facility', FacilitySchema);
module.exports = Facility;
