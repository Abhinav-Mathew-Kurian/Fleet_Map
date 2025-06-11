function interpolateCoordinates(start, end, progress) {
  const lat = start[1] + (end[1] - start[1]) * progress;
  const lng = start[0] + (end[0] - start[0]) * progress;
  return [lng, lat];
}


function processRouteForMovement(routeData) {
  const movementPoints = [];
  const routeCoordinates = routeData.features[0].geometry.coordinates;
  const steps = routeData.features[0].properties.segments[0].steps;
  
  // Calculate total points needed based on route duration (1 point per second)
  const totalDurationSeconds = Math.ceil(routeData.features[0].properties.summary.duration);
  const totalPoints = Math.max(totalDurationSeconds, routeCoordinates.length);
  
  // Simple approach: distribute points evenly across route coordinates
  for (let i = 0; i < totalPoints; i++) {
    const progress = i / (totalPoints - 1);
    const coordIndex = Math.floor(progress * (routeCoordinates.length - 1));
    const nextCoordIndex = Math.min(coordIndex + 1, routeCoordinates.length - 1);
    
    if (coordIndex === nextCoordIndex) {
      movementPoints.push(routeCoordinates[coordIndex]);
    } else {
      const localProgress = (progress * (routeCoordinates.length - 1)) - coordIndex;
      const interpolatedPoint = interpolateCoordinates(
        routeCoordinates[coordIndex], 
        routeCoordinates[nextCoordIndex], 
        localProgress
      );
      movementPoints.push(interpolatedPoint);
    }
  }
  
  return movementPoints;
}

module.exports = { interpolateCoordinates, processRouteForMovement };
