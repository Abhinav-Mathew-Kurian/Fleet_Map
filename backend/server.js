require('dotenv').config();
const express = require('express');
const mongoose = require('mongoose');
const cors = require('cors');
const http = require('http');
const socketIo = require('socket.io');
const axios = require('axios');
const { processRouteForMovement } = require('./RouteLogic');
const Route = require('./Route');
const Fleet=require('./Fleet')
const { findChargingStationsAlongRoute } = require('./RouteChargingLogic');
const ChargingStation = require('./ChargingStation');

const app = express();
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(cors());

const server = http.createServer(app);
const io = socketIo(server, {
  cors: {
    origin: "*",
    methods: ["GET", "POST"]
  }
});

const PORT2 = process.env.PORT2;
const url = process.env.MONGO_URL;

// Single active navigation per user
const activeNavigations = new Map(); // userId -> navigation object

io.on('connection', (socket) => {
  console.log(`User connected: ${socket.id}`);
  
  socket.on('join-user', (userId) => {
    socket.join(userId);
    socket.userId = userId;
    console.log(`User ${userId} joined room`);
  });
  
  socket.on('join-fleet-manager', () => {
    socket.join('fleet-manager');
    console.log('Fleet manager joined');
  });
  
  socket.on('disconnect', () => {
    console.log(`User disconnected: ${socket.id}`);
    // Stop navigation if user disconnects
    if (socket.userId && activeNavigations.has(socket.userId)) {
      const navigation = activeNavigations.get(socket.userId);
      if (navigation.interval) {
        clearInterval(navigation.interval);
      }
      activeNavigations.delete(socket.userId);
    }
  });
});

const connectDB = async () => {
  try {
    await mongoose.connect(url);
    console.log("Connection successful with MongoDB Atlas");
  } catch (err) {
    console.error("Error connecting to MongoDB", err);
  }
};

// Create and save route
app.get('/getRoute', async (req, res) => {
  try {
    const { startLat, startLng, endLat, endLng, userId, routeName } = req.query;
    const API = process.env.ORS_API;

    if (!API) {
      return res.status(500).json({ error: "Server configuration error: API key missing." });
    }
    if (!startLat || !startLng || !endLat || !endLng || !userId) {
      return res.status(400).json({ error: 'Missing required parameters.' });
    }

    // Check if user already has an active route
    if (activeNavigations.has(userId)) {
      return res.status(400).json({ error: 'User already has an active route. Stop current route first.' });
    }

    const routeUrl = `https://api.openrouteservice.org/v2/directions/driving-car?api_key=${API}&start=${startLng},${startLat}&end=${endLng},${endLat}`;
    const response = await axios.get(routeUrl);
    const data = response.data;
    
    const newRoute = new Route({
      userId: userId,
      routeName: routeName || `Route ${new Date().toISOString()}`,
      type: data.type,
      bbox: data.bbox,
      features: data.features,
      metadata: data.metadata,
      startCoordinates: [parseFloat(startLng), parseFloat(startLat)],
      endCoordinates: [parseFloat(endLng), parseFloat(endLat)],
      status: 'created',
      isActive: false
    });

    await newRoute.save();
    console.log("Route saved to MongoDB with ID:", newRoute._id);
    
    const movementPoints = processRouteForMovement(data);
    
    // NEW: Find charging stations along the route
    let chargingStations = [];
    try {
      const routeCoordinates = data.features[0]?.geometry?.coordinates || [];
      if (routeCoordinates.length > 0) {
        chargingStations = await findChargingStationsAlongRoute(routeCoordinates, 5, 4);
        console.log(`Found ${chargingStations.length} charging stations along the route`);
      }
    } catch (error) {
      console.error('Error finding charging stations:', error);
      // Continue without charging stations if there's an error
    }
    
    res.json({
      ...data,
      routeId: newRoute._id,
      routeName: newRoute.routeName,
      movementPoints: movementPoints,
      totalDistance: data.features[0].properties.summary.distance,
      estimatedDuration: data.features[0].properties.summary.duration,
      status: newRoute.status,
      chargingStations: chargingStations // NEW: Include charging stations in response
    });

  } catch (err) {
    console.error('Error getting and saving route:', err);
    res.status(500).json({ error: 'Failed to get route' });
  }
});

// NEW: Add endpoint to populate charging stations (for admin use)
app.post('/populateChargingStations', async (req, res) => {
  try {
    const { populateChargingStationsFromAPI } = require('./RouteChargingLogic');
    
    // You can specify a bounding box or country code
    const { boundingBox, countryCode } = req.body;
    
    await populateChargingStationsFromAPI(boundingBox, countryCode || 'US');
    
    res.json({ 
      success: true, 
      message: 'Charging stations populated successfully' 
    });
  } catch (error) {
    console.error('Error populating charging stations:', error);
    res.status(500).json({ error: 'Failed to populate charging stations' });
  }
});

// NEW: Add endpoint to get charging stations in an area (for testing)
app.get('/getChargingStations', async (req, res) => {
  try {
    const { lat, lng, radius = 10 } = req.query;
    
    if (!lat || !lng) {
      return res.status(400).json({ error: 'Latitude and longitude are required' });
    }
    
    const stations = await ChargingStation.find({
      location: {
        $near: {
          $geometry: {
            type: 'Point',
            coordinates: [parseFloat(lng), parseFloat(lat)]
          },
          $maxDistance: radius * 1000 // Convert km to meters
        }
      },
      isOperational: true
    }).limit(50);
    
    res.json({
      success: true,
      stations: stations,
      count: stations.length
    });
  } catch (error) {
    console.error('Error fetching charging stations:', error);
    res.status(500).json({ error: 'Failed to fetch charging stations' });
  }
});

// Get all routes for a user
app.get('/getUserRoutes', async (req, res) => {
  try {
    const { userId } = req.query;
    
    if (!userId) {
      return res.status(400).json({ error: 'userId is required' });
    }

    const routes = await Route.find({ userId: userId }).sort({ createdAt: -1 });
    
    const routesWithDetails = routes.map(route => ({
      routeId: route._id,
      routeName: route.routeName,
      startCoordinates: route.startCoordinates,
      endCoordinates: route.endCoordinates,
      totalDistance: route.features[0]?.properties?.summary?.distance || 0,
      estimatedDuration: route.features[0]?.properties?.summary?.duration || 0,
      status: route.status,
      isActive: route.isActive,
      createdAt: route.createdAt
    }));

    res.json({
      success: true,
      routes: routesWithDetails,
      activeRoute: activeNavigations.has(userId) ? activeNavigations.get(userId).routeId : null
    });

  } catch (error) {
    console.error('Error fetching routes:', error);
    res.status(500).json({ error: 'Failed to fetch routes' });
  }
});

// Fleet Manager: Get all routes (alive and dead)
app.get('/getFleetRoutes', async (req, res) => {
  try {
    const routes = await Route.find({}).sort({ createdAt: -1 });
    
    const routesWithDetails = routes.map(route => ({
      routeId: route._id,
      routeName: route.routeName,
      userId: route.userId,
      startCoordinates: route.startCoordinates,
      endCoordinates: route.endCoordinates,
      totalDistance: route.features[0]?.properties?.summary?.distance || 0,
      estimatedDuration: route.features[0]?.properties?.summary?.duration || 0,
      status: route.status,
      isActive: route.isActive,
      createdAt: route.createdAt,
      currentPosition: activeNavigations.has(route.userId) ? 
        activeNavigations.get(route.userId).currentPosition : null
    }));

    // Separate alive and dead routes
    const aliveRoutes = routesWithDetails.filter(route => route.status === 'alive');
    const deadRoutes = routesWithDetails.filter(route => route.status === 'dead');

    res.json({
      success: true,
      aliveRoutes: aliveRoutes,
      deadRoutes: deadRoutes,
      totalRoutes: routes.length,
      activeNavigations: activeNavigations.size
    });

  } catch (error) {
    console.error('Error fetching fleet routes:', error);
    res.status(500).json({ error: 'Failed to fetch fleet routes' });
  }
});

app.post('/startNavigation', async (req, res) => {
  try {
    const { userId, routeId } = req.body;

    if (activeNavigations.has(userId)) {
      return res.status(400).json({ error: 'User already has an active navigation. Stop current navigation first.' });
    }

    const route = await Route.findById(routeId);
    if (!route || route.userId !== userId) {
      return res.status(404).json({ error: 'Route not found or access denied' });
    }

    await Route.findByIdAndUpdate(routeId, {
      status: 'alive',
      isActive: true
    });

    const movementPoints = processRouteForMovement(route);

    const navigation = {
      userId,
      routeId,
      routeName: route.routeName,
      movementPoints,
      currentIndex: 0,
      currentPosition: movementPoints[0],
      status: 'active',
      startTime: new Date(),
      interval: null
    };

   navigation.interval = setInterval(async () => {
  if (navigation.currentIndex >= navigation.movementPoints.length) {
    clearInterval(navigation.interval);
    activeNavigations.delete(userId);

    await Route.findByIdAndUpdate(routeId, {
      status: 'dead',
      isActive: false
    });

    io.to(userId).emit('navigation-completed', {
      routeId: routeId,
      routeName: navigation.routeName,
      message: `Navigation completed for ${navigation.routeName}!`
    });

    io.to('fleet-manager').emit('route-completed', {
      userId: userId,
      routeId: routeId,
      routeName: navigation.routeName,
      completedAt: new Date()
    });

    console.log(`Navigation completed for user ${userId}, route ${routeId}`);
    return;
  }

  const currentPosition = navigation.movementPoints[navigation.currentIndex];
  navigation.currentPosition = currentPosition;

  try {
    // Method 1: Try to find and update existing fleet document
    const fleetUpdate = await Fleet.findOneAndUpdate(
      { _id: userId },
      {
        $set: {
          'location.coordinates': currentPosition,
          'location.type': 'Point'
        }
      },
      { 
        new: true,
        upsert: false // Don't create if doesn't exist
      }
    );

    if (fleetUpdate) {
      console.log(`Fleet location updated for user ${userId} to [${currentPosition[0]}, ${currentPosition[1]}]`);
    } else {
      console.log(`No fleet document found for user ${userId}. Fleet update skipped.`);
      
      // Optional: Check if fleet document exists
      const fleetExists = await Fleet.findOne({ userId: userId });
      if (!fleetExists) {
        console.log(`Fleet document does not exist for user ${userId}. Consider creating one first.`);
      }
    }

    const progress = (navigation.currentIndex / navigation.movementPoints.length) * 100;
    const remainingPoints = navigation.movementPoints.length - navigation.currentIndex;

    io.to(userId).emit('location-update', {
      routeId: routeId,
      routeName: navigation.routeName,
      position: currentPosition,
      progress: progress,
      currentIndex: navigation.currentIndex,
      totalPoints: navigation.movementPoints.length,
      estimatedTimeRemaining: remainingPoints
    });

    io.to('fleet-manager').emit('live-location-update', {
      userId: userId,
      routeId: routeId,
      routeName: navigation.routeName,
      position: currentPosition,
      progress: progress,
      timestamp: new Date()
    });

    navigation.currentIndex++;
  } catch (error) {
    console.error('Error updating fleet location or emitting updates:', error);
    console.error('Error details:', error.message);
    
    // Continue navigation even if fleet update fails
    const progress = (navigation.currentIndex / navigation.movementPoints.length) * 100;
    const remainingPoints = navigation.movementPoints.length - navigation.currentIndex;

    io.to(userId).emit('location-update', {
      routeId: routeId,
      routeName: navigation.routeName,
      position: currentPosition,
      progress: progress,
      currentIndex: navigation.currentIndex,
      totalPoints: navigation.movementPoints.length,
      estimatedTimeRemaining: remainingPoints
    });

    io.to('fleet-manager').emit('live-location-update', {
      userId: userId,
      routeId: routeId,
      routeName: navigation.routeName,
      position: currentPosition,
      progress: progress,
      timestamp: new Date()
    });

    navigation.currentIndex++;
  }

}, 1000);

    activeNavigations.set(userId, navigation);

    res.json({
      success: true,
      message: `Navigation started for ${route.routeName}`,
      routeId: routeId,
      routeName: route.routeName,
      totalPoints: movementPoints.length
    });

  } catch (error) {
    console.error('Error starting navigation:', error);
    res.status(500).json({ error: 'Failed to start navigation' });
  }
});



// Stop navigation
app.post('/stopNavigation', async (req, res) => {
  try {
    const { userId } = req.body;
    
    if (!activeNavigations.has(userId)) {
      return res.status(404).json({ error: 'No active navigation found' });
    }
    
    const navigation = activeNavigations.get(userId);
    
    clearInterval(navigation.interval);
    activeNavigations.delete(userId);
    
    // Update route status to dead (stopped)
    await Route.findByIdAndUpdate(navigation.routeId, { 
      status: 'dead', 
      isActive: false 
    });
    
    // Notify user and fleet manager
    io.to(userId).emit('navigation-stopped', {
      routeId: navigation.routeId,
      routeName: navigation.routeName
    });
    
    io.to('fleet-manager').emit('route-stopped', {
      userId: userId,
      routeId: navigation.routeId,
      routeName: navigation.routeName,
      stoppedAt: new Date()
    });
    
    res.json({ 
      success: true, 
      message: `Navigation stopped for ${navigation.routeName}`,
      routeId: navigation.routeId 
    });
  } catch (error) {
    console.error('Error stopping navigation:', error);
    res.status(500).json({ error: 'Failed to stop navigation' });
  }
});


// Get user's current active navigation
app.get('/getActiveNavigation', (req, res) => {
  try {
    const { userId } = req.query;
    
    if (!userId) {
      return res.status(400).json({ error: 'userId is required' });
    }
    
    if (!activeNavigations.has(userId)) {
      return res.json({ activeNavigation: null });
    }
    
    const navigation = activeNavigations.get(userId);
    
    res.json({
      activeNavigation: {
        routeId: navigation.routeId,
        routeName: navigation.routeName,
        status: navigation.status,
        progress: (navigation.currentIndex / navigation.movementPoints.length) * 100,
        currentIndex: navigation.currentIndex,
        totalPoints: navigation.movementPoints.length,
        currentPosition: navigation.currentPosition,
        startTime: navigation.startTime
      }
    });
    
  } catch (error) {
    console.error('Error fetching active navigation:', error);
    res.status(500).json({ error: 'Failed to fetch active navigation' });
  }
});

// Fleet Manager: Get all live tracking data
app.get('/getLiveTracking', (req, res) => {
  try {
    const liveTrackingData = [];
    
    activeNavigations.forEach((navigation, userId) => {
      liveTrackingData.push({
        userId: userId,
        routeId: navigation.routeId,
        routeName: navigation.routeName,
        currentPosition: navigation.currentPosition,
        progress: (navigation.currentIndex / navigation.movementPoints.length) * 100,
        startTime: navigation.startTime,
        status: 'alive'
      });
    });
    
    res.json({
      success: true,
      liveRoutes: liveTrackingData,
      totalLiveRoutes: liveTrackingData.length
    });
    
  } catch (error) {
    console.error('Error fetching live tracking data:', error);
    res.status(500).json({ error: 'Failed to fetch live tracking data' });
  }
});

app.post('/pauseNavigation', async (req, res) => {
  try {
    const { userId } = req.body;
    
    if (!activeNavigations.has(userId)) {
      return res.status(404).json({ error: 'No active navigation found' });
    }
    
    const navigation = activeNavigations.get(userId);
    
    if (navigation.interval) {
      clearInterval(navigation.interval);
      navigation.interval = null;
      navigation.status = 'paused';
    }
    
    res.json({ 
      success: true, 
      message: `Navigation paused for ${navigation.routeName}`,
      routeId: navigation.routeId 
    });
  } catch (error) {
    console.error('Error pausing navigation:', error);
    res.status(500).json({ error: 'Failed to pause navigation' });
  }
});

// Resume navigation
app.post('/resumeNavigation', async (req, res) => {
  try {
    const { userId } = req.body;
    
    if (!activeNavigations.has(userId)) {
      return res.status(404).json({ error: 'No active navigation found' });
    }
    
    const navigation = activeNavigations.get(userId);
    
    if (navigation.status === 'paused') {
      navigation.interval = setInterval(async () => {
        if (navigation.currentIndex >= navigation.movementPoints.length) {
          // Navigation completed
          clearInterval(navigation.interval);
          activeNavigations.delete(userId);
          
          // Update route status to dead (completed)
          await Route.findByIdAndUpdate(navigation.routeId, { 
            status: 'dead', 
            isActive: false 
          });
          
          // Notify user and fleet manager
          io.to(userId).emit('navigation-completed', {
            routeId: navigation.routeId,
            routeName: navigation.routeName,
            message: `Navigation completed for ${navigation.routeName}!`
          });
          
          io.to('fleet-manager').emit('route-completed', {
            userId: userId,
            routeId: navigation.routeId,
            routeName: navigation.routeName,
            completedAt: new Date()
          });
          
          console.log(`Navigation completed for user ${userId}, route ${navigation.routeId}`);
          return;
        }

        const currentPosition = navigation.movementPoints[navigation.currentIndex];
        navigation.currentPosition = currentPosition;
        
        const progress = (navigation.currentIndex / navigation.movementPoints.length) * 100;
        const remainingPoints = navigation.movementPoints.length - navigation.currentIndex;
        
        // Emit to user
        io.to(userId).emit('location-update', {
          routeId: navigation.routeId,
          routeName: navigation.routeName,
          position: currentPosition,
          progress: progress,
          currentIndex: navigation.currentIndex,
          totalPoints: navigation.movementPoints.length,
          estimatedTimeRemaining: remainingPoints
        });

        // Emit to fleet manager for live tracking
        io.to('fleet-manager').emit('live-location-update', {
          userId: userId,
          routeId: navigation.routeId,
          routeName: navigation.routeName,
          position: currentPosition,
          progress: progress,
          timestamp: new Date()
        });

        navigation.currentIndex++;
        
      }, 1000); // Update every second

      navigation.status = 'active';
    }
    
    res.json({ 
      success: true, 
      message: `Navigation resumed for ${navigation.routeName}`,
      routeId: navigation.routeId 
    });
  } catch (error) {
    console.error('Error resuming navigation:', error);
    res.status(500).json({ error: 'Failed to resume navigation' });
  }
});
app.get('/getRoute/:routeId', async (req, res) => {
  try {
    const { routeId } = req.params;
    
    const route = await Route.findById(routeId);
    if (!route) {
      return res.status(404).json({ error: 'Route not found' });
    }
    
    // Return the route data in GeoJSON format
    res.json({
      type: route.type,
      features: route.features,
      bbox: route.bbox,
      metadata: route.metadata
    });
    
  } catch (error) {
    console.error('Error fetching route geometry:', error);
    res.status(500).json({ error: 'Failed to fetch route geometry' });
  }
});

const startServer = async () => {
  try {
    await connectDB();
    server.listen(PORT2, () => {
      console.log(`The backend has been running on server ${PORT2}`);
    });
  } catch (err) {
    console.error("Error starting server:", err);
    process.exit(1);
  }
};

process.on('SIGINT', async () => {
  // Clean up all active navigations
  activeNavigations.forEach((navigation, userId) => {
    if (navigation.interval) {
      clearInterval(navigation.interval);
    }
  });
  
  await mongoose.connection.close();
  console.log("MongoDB connection closed");
  process.exit(0);
});

startServer();