const mongoose = require('mongoose');

const StepSchema = new mongoose.Schema({
  distance: Number,
  duration: Number,
  type: Number,
  instruction: String,
  name: String,
  way_points: [Number]
}, { _id: false });

const SegmentSchema = new mongoose.Schema({
  distance: Number,
  duration: Number,
  steps: [StepSchema]
}, { _id: false });

const RoadAccessSummarySchema = new mongoose.Schema({
  value: Number,
  distance: Number,
  amount: Number
}, { _id: false });

const ExtrasSchema = new mongoose.Schema({
  roadaccessrestrictions: {
    values: [[Number]],
    summary: [RoadAccessSummarySchema]
  }
}, { _id: false });

const WarningSchema = new mongoose.Schema({
  code: Number,
  message: String
}, { _id: false });

const FeaturePropertiesSchema = new mongoose.Schema({
  segments: [SegmentSchema],
  extras: ExtrasSchema,
  warnings: [WarningSchema],
  way_points: [Number],
  summary: {
    distance: Number,
    duration: Number
  }
}, { _id: false });

const GeometrySchema = new mongoose.Schema({
  coordinates: [[Number]],
  type: { type: String }
}, { _id: false });

const FeatureSchema = new mongoose.Schema({
  bbox: [Number],
  type: { type: String },
  properties: FeaturePropertiesSchema,
  geometry: GeometrySchema
}, { _id: false });

const MetadataSchema = new mongoose.Schema({
  attribution: String,
  service: String,
  timestamp: Number,
  query: {
    coordinates: [[Number]],
    profile: String,
    profileName: String,
    format: String
  },
  engine: {
    version: String,
    build_date: String,
    graph_date: String
  }
}, { _id: false });

const RouteSchema = new mongoose.Schema({
  userId: {
    type: String,
    required: true,
    ref: 'User'
  },
  routeName: {
    type: String,
    required: true
  },
  type: { type: String },
  bbox: [Number],
  features: [FeatureSchema],
  metadata: MetadataSchema,
  startCoordinates: {
    type: [Number],
    required: true
  },
  endCoordinates: {
    type: [Number],
    required: true
  },
  status: {
    type: String,
    enum: ['created', 'alive', 'dead'],
    default: 'created'
  },
  isActive: {
    type: Boolean,
    default: false
  }
}, { timestamps: true });

module.exports = mongoose.model('Route', RouteSchema);