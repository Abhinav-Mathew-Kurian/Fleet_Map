import React, { useState, useEffect } from 'react';
import MapComponent from './MapComponent.jsx';
import WebSocketHandler from './WebSocketHandler.jsx';
import axios from 'axios';
import {
  Box,
  Typography,
  Select,
  MenuItem,
  FormControl,
  InputLabel,
  Grid,
  Paper,
  CircularProgress,
  Alert,
  Button,
  Divider,
  LinearProgress
} from '@mui/material';
import useMqttFleetUpdates from './useMqttFleetUpdates';

const MainLayout = () => {
  const [fleetData, setFleetData] = useState([]);
  const [facilityData, setFacilityData] = useState([]);
  const [selectedTruck, setSelectedTruck] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  const [routeData, setRouteData] = useState(null);
  const [routeLoading, setRouteLoading] = useState(false);
  const [navigationActive, setNavigationActive] = useState(false);
  const [navigationPaused, setNavigationPaused] = useState(false);
  const [navigationData, setNavigationData] = useState(null);
  const [livePosition, setLivePosition] = useState(null);

  const latestTruckUpdate = useMqttFleetUpdates();

  useEffect(() => {
    const fetchData = async () => {
      try {
        const fleetResponse = await fetch('http://localhost:5000/fleet');
        if (!fleetResponse.ok) {
          throw new Error(`HTTP error! Status: ${fleetResponse.status} for fleet data`);
        }
        const fleetJson = await fleetResponse.json();
        setFleetData(fleetJson);

        if (fleetJson.length > 0) {
          const firstTruckWithValidLocation = fleetJson.find(truck =>
            truck.location &&
            Array.isArray(truck.location.coordinates) &&
            truck.location.coordinates.length === 2 &&
            typeof truck.location.coordinates[0] === 'number' &&
            typeof truck.location.coordinates[1] === 'number'
          );
          setSelectedTruck(firstTruckWithValidLocation || fleetJson[0]);
        }

        const facilityResponse = await fetch('http://localhost:5000/facility');
        if (!facilityResponse.ok) {
          throw new Error(`HTTP error! Status: ${facilityResponse.status} for facility data`);
        }
        const facilityJson = await facilityResponse.json();
        setFacilityData(facilityJson);

      } catch (e) {
        console.error("Failed to fetch data:", e);
        setError(e.message);
      } finally {
        setLoading(false);
      }
    };

    fetchData();
  }, []);

  useEffect(() => {
    const checkActiveNavigation = async () => {
      if (selectedTruck) {
        try {
          const response = await axios.get('http://localhost:5001/getActiveNavigation', {
            params: { userId: selectedTruck._id }
          });

          if (response.data.activeNavigation) {
            const activeNav = response.data.activeNavigation;
            setNavigationActive(true);
            setNavigationData({
              routeId: activeNav.routeId,
              routeName: activeNav.routeName,
              progress: activeNav.progress,
              currentIndex: activeNav.currentIndex,
              totalPoints: activeNav.totalPoints,
              timeRemaining: (activeNav.totalPoints - activeNav.currentIndex)
            });
            setLivePosition(activeNav.currentPosition);
          }
        } catch (error) {
          console.error('Error checking active navigation:', error);
        }
      }
    };

    checkActiveNavigation();
  }, [selectedTruck]);

  useEffect(() => {
    if (latestTruckUpdate) {
      setFleetData(prevFleetData => {
        const updatedFleet = prevFleetData.map(truck =>
          truck._id === latestTruckUpdate._id ? latestTruckUpdate : truck
        );
        return updatedFleet;
      });

      setSelectedTruck(prevSelectedTruck =>
        prevSelectedTruck && prevSelectedTruck._id === latestTruckUpdate._id
          ? latestTruckUpdate
          : prevSelectedTruck
      );
    }
  }, [latestTruckUpdate]);

  const handleTruckChange = (event) => {
    const truckId = event.target.value;
    const truck = fleetData.find(t => t._id === truckId);
    setSelectedTruck(truck);
    setRouteData(null);
    setNavigationActive(false);
    setNavigationPaused(false);
    setNavigationData(null);
    setLivePosition(null);
  };

  const handleChangeStatus = async (status) => {
    if (!selectedTruck) return;

    try {
      await axios.patch(`http://localhost:5000/updateStatus`, {
        userId: selectedTruck._id,
        chargingStatus: status
      });

      setSelectedTruck(prevTruck => ({
        ...prevTruck,
        truck: {
          ...prevTruck.truck,
          chargingStatus: status
        }
      }));
    } catch (err) {
      console.error('Error updating charging status:', err);
      setError('Failed to update charging status');
    }
  };

  const handleGetRoute = async (startLat, startLng, endLat, endLng, routeName) => {
    console.log(startLat, startLng, endLat, endLng, routeName);
    if (!selectedTruck) return;

    setRouteLoading(true);
    try {
      const response = await axios.get('http://localhost:5001/getRoute', {
        params: {
          startLat,
          startLng,
          endLat,
          endLng,
          userId: selectedTruck._id,
          routeName: routeName || 'New Route'
        }
      });

      setRouteData(response.data);
      console.log('Route data received:', response.data);
    } catch (err) {
      console.error('Error getting route:', err);
      setError('Failed to get route');
    } finally {
      setRouteLoading(false);
    }
  };

  const handleStartNavigation = async () => {
    if (!routeData || !selectedTruck) return;

    try {
      const response = await axios.post('http://localhost:5001/startNavigation', {
        userId: selectedTruck._id,
        routeId: routeData.routeId
      });

      setNavigationActive(true);
      setNavigationPaused(false);
      setNavigationData({
        routeId: routeData.routeId,
        routeName: routeData.routeName,
        totalDistance: routeData.totalDistance,
        estimatedDuration: routeData.estimatedDuration,
        progress: 0,
        timeRemaining: routeData.estimatedDuration,
        totalPoints: routeData.movementPoints?.length || 0,
        currentIndex: 0
      });
      console.log('Navigation started:', response.data);
    } catch (err) {
      console.error('Error starting navigation:', err);
      setError('Failed to start navigation');
    }
  };

  const handlePauseNavigation = async () => {
    if (!selectedTruck) return;

    try {
      await axios.post('http://localhost:5001/pauseNavigation', {
        userId: selectedTruck._id
      });

      setNavigationPaused(true);
    } catch (err) {
      console.error('Error pausing navigation:', err);
      setError('Failed to pause navigation');
    }
  };

  const handleResumeNavigation = async () => {
    if (!selectedTruck) return;

    try {
      await axios.post('http://localhost:5001/resumeNavigation', {
        userId: selectedTruck._id
      });

      setNavigationPaused(false);
    } catch (err) {
      console.error('Error resuming navigation:', err);
      setError('Failed to resume navigation');
    }
  };

  const handleStopNavigation = async () => {
    if (!selectedTruck) return;

    try {
      await axios.post('http://localhost:5001/stopNavigation', {
        userId: selectedTruck._id
      });

      setNavigationActive(false);
      setNavigationPaused(false);
      setNavigationData(null);
      setLivePosition(null);
    } catch (err) {
      console.error('Error stopping navigation:', err);
      setError('Failed to stop navigation');
    }
  };

  const handleLocationUpdate = (data) => {
    console.log('Location update received:', data);
    setLivePosition(data.position);
    setNavigationData(prev => prev ? {
      ...prev,
      progress: data.progress,
      timeRemaining: data.estimatedTimeRemaining,
      currentIndex: data.currentIndex
    } : null);
  };

  const handleNavigationComplete = (data) => {
    setNavigationActive(false);
    setNavigationPaused(false);
    setNavigationData(null);
    setLivePosition(null);
    alert(`Navigation completed: ${data.routeName}`);
  };

  const handleNavigationStopped = (data) => {
    setNavigationActive(false);
    setNavigationPaused(false);
    setNavigationData(null);
    setLivePosition(null);
  };

  const formatDistance = (meters) => {
    if (!meters) return '0 km';
    return (meters / 1000).toFixed(1) + ' km';
  };

  const formatTime = (seconds) => {
    if (!seconds) return '0h 0m 0s';
    const hours = Math.floor(seconds / 3600);
    const minutes = Math.floor((seconds % 3600) / 60);
    const remainingSeconds = Math.floor(seconds % 60);
    return `${hours}h ${minutes}m ${remainingSeconds}s`;
  };

  return (
    <Box
      sx={{
        display: 'flex',
        height: '100vh',
        width: '100vw',
        fontFamily: 'Inter, sans-serif',
        overflow: 'hidden',
      }}
    >
      <WebSocketHandler
        selectedTruck={selectedTruck}
        onLocationUpdate={handleLocationUpdate}
        onNavigationComplete={handleNavigationComplete}
        onNavigationStopped={handleNavigationStopped}
      />

      <Box
        sx={{
          width: 350,
          flexShrink: 0,
          bgcolor: 'background.default',
          p: 2,
          borderRight: '1px solid #e0e0e0',
          display: 'flex',
          flexDirection: 'column',
          gap: 2,
          overflowY: 'auto',
          boxShadow: 1,
          borderRadius: '0 8px 8px 0',
        }}
      >
        <Typography variant="h6" gutterBottom sx={{ color: 'primary.main' }}>
          Fleet Management
        </Typography>

        {loading && <CircularProgress sx={{ alignSelf: 'center', mt: 4 }} />}
        {error && <Alert severity="error">{error}</Alert>}

        {!loading && !error && (
          <>
            <FormControl fullWidth size="small" sx={{ mb: 2 }}>
              <InputLabel id="truck-select-label">Select Truck</InputLabel>
              <Select
                labelId="truck-select-label"
                value={selectedTruck ? selectedTruck._id : ''}
                label="Select Truck"
                onChange={handleTruckChange}
                sx={{ borderRadius: 2 }}
              >
                {fleetData.map((truck) => (
                  <MenuItem key={truck._id} value={truck._id}>
                    {truck.fleetId} - {truck.name}
                  </MenuItem>
                ))}
              </Select>
            </FormControl>

            {selectedTruck && (
              <Paper elevation={3} sx={{ p: 2, borderRadius: 2, bgcolor: 'background.paper' }}>
                <Typography variant="subtitle1" gutterBottom sx={{ fontWeight: 'bold' }}>
                  Truck Details:
                </Typography>

                <Grid container spacing={1}>
                  <Grid item xs={12}>
                    <Typography variant="body2">
                      <strong>Model:</strong> {selectedTruck.truck.make} {selectedTruck.truck.model}
                    </Typography>
                  </Grid>
                  <Grid item xs={12}>
                    <Typography variant="body2">
                      <strong>Battery Capacity:</strong> {selectedTruck.truck.batterySize_kWh} kWh
                    </Typography>
                  </Grid>
                  <Grid item xs={12}>
                    <Typography variant="body2">
                      <strong>Battery SoC:</strong> {selectedTruck.truck.batterySOC_percent}%
                    </Typography>
                  </Grid>
                  <Grid item xs={12}>
                    <Typography variant="body2">
                      <strong>Battery Temp:</strong> {selectedTruck.truck.batteryTemperature_C}°C
                    </Typography>
                  </Grid>
                  <Grid item xs={12}>
                    <Typography variant="body2">
                      <strong>Charging Status:</strong> {selectedTruck.truck.chargingStatus}
                    </Typography>
                  </Grid>
                  <Grid item xs={12}>
                    <Typography variant="body2">
                      <strong>User ID:</strong> {selectedTruck.userId}
                    </Typography>
                  </Grid>
                </Grid>

                <Box mt={3} sx={{ display: 'flex', gap: 2 }}>
                  <Button
                    variant="contained"
                    color="error"
                    onClick={() => handleChangeStatus('discharging')}
                    disabled={selectedTruck.truck.chargingStatus === 'discharging'}
                    sx={{ flex: 1 }}
                  >
                    Discharge
                  </Button>
                  <Button
                    variant="outlined"
                    onClick={() => handleChangeStatus('idle')}
                    disabled={selectedTruck.truck.chargingStatus === 'idle'}
                    sx={{ flex: 1 }}
                  >
                    Idle
                  </Button>
                </Box>
              </Paper>
            )}

            <Divider />

            <Paper elevation={3} sx={{ p: 2, borderRadius: 2, bgcolor: 'background.paper' }}>
              <Typography variant="subtitle1" gutterBottom sx={{ fontWeight: 'bold' }}>
                Navigation:
              </Typography>

              {routeLoading && (
                <Box sx={{ display: 'flex', justifyContent: 'center', p: 2 }}>
                  <CircularProgress size={24} />
                  <Typography sx={{ ml: 2 }}>Getting route...</Typography>
                </Box>
              )}

              {routeData && !routeLoading && (
                <Box>
                  <Typography variant="body2" sx={{ mb: 1 }}>
                    <strong>Route:</strong> {routeData.routeName}
                  </Typography>
                  <Typography variant="body2" sx={{ mb: 1 }}>
                    <strong>Distance:</strong> {formatDistance(routeData.totalDistance)}
                  </Typography>
                  <Typography variant="body2" sx={{ mb: 2 }}>
                    <strong>Est. Time:</strong> {formatTime(routeData.estimatedDuration)}
                  </Typography>

                  {!navigationActive ? (
                    <Button
                      variant="contained"
                      color="success"
                      onClick={handleStartNavigation}
                      fullWidth
                      sx={{ mb: 1 }}
                    >
                      Start Navigation
                    </Button>
                  ) : (
                    <Box>
                      {navigationData && (
                        <Box sx={{ mb: 2 }}>
                          <Typography variant="body2" sx={{ mb: 1 }}>
                            <strong>Progress:</strong> {navigationData.progress.toFixed(2)}%
                          </Typography>
                          <LinearProgress
                            variant="determinate"
                            value={navigationData.progress}
                            sx={{ mb: 2 }}
                          />
                          <Typography variant="body2" sx={{ mb: 1 }}>
                            <strong>Time Remaining:</strong> {formatTime(navigationData.timeRemaining)}
                          </Typography>
                          <Typography variant="body2" sx={{ mb: 1 }}>
                            <strong>Status:</strong> {navigationPaused ? 'Paused' : 'Active'}
                          </Typography>
                        </Box>
                      )}

                      <Box sx={{ display: 'flex', gap: 1, mb: 1 }}>
                        {!navigationPaused ? (
                          <Button
                            variant="contained"
                            color="warning"
                            onClick={handlePauseNavigation}
                            sx={{ flex: 1 }}
                          >
                            Pause
                          </Button>
                        ) : (
                          <Button
                            variant="contained"
                            color="success"
                            onClick={handleResumeNavigation}
                            sx={{ flex: 1 }}
                          >
                            Resume
                          </Button>
                        )}

                        <Button
                          variant="contained"
                          color="error"
                          onClick={handleStopNavigation}
                          sx={{ flex: 1 }}
                        >
                          Stop
                        </Button>
                      </Box>
                    </Box>
                  )}
                </Box>
              )}

              {!routeData && !routeLoading && (
                <Typography variant="body2" color="text.secondary">
                  Click on a storage facility to get route
                </Typography>
              )}
            </Paper>
          </>
        )}
      </Box>

      <Box
        sx={{
          flex: 1,
          height: '100vh',
          position: 'relative',
          overflow: 'hidden',
        }}
      >
        <MapComponent
          fleetData={fleetData}
          facilityData={facilityData}
          selectedTruck={selectedTruck}
          routeData={routeData}
          livePosition={livePosition}
          onGetRoute={handleGetRoute}
        />
      </Box>
    </Box>
  );
};

export default MainLayout;
