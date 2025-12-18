# Fleet_Map

## Project Overview

Fleet_Map is a simulation-driven Electric Vehicle (EV) fleet navigation and charging-discovery platform focused on **route-based vehicle movement, live fleet tracking, and geospatial charging station discovery**.

The system does **not** use a real OCPP charging server such as SteVe. Instead, it relies on **OpenRouteService for routing** and **MongoDB geospatial (2dsphere) queries** to dynamically discover charging stations along a route.

The repository demonstrates real-world backend geospatial logic, including:

* Route geometry processing
* Charging station discovery along a live route
* MongoDB `$geoNear`, `$near`, and bounding-box queries
* Real-time fleet movement simulation via Socket.IO

---

## Features

* Secure user authentication using JWT
* Real‑time EV battery simulation (SoC, temperature, charge/discharge rates)
* Support for multiple vehicles and parallel charging simulations
* Individual battery tracking per vehicle
* Temperature‑aware discharge logic using live weather data
* MQTT‑based real‑time communication
* OCPP‑based charging session simulation (SteVe server)
* Interactive dashboards with charts and analytics
* Charging station discovery with live route planning
* Role‑based access (end users vs charging station operators)

---

## Package-Level Documentation

This section describes **key packages used in the frontend and backend**, their responsibility, and how they interact within the system.

---

## Frontend Packages

### react

Core library for building the user interface. Used to create component-based dashboards, simulation controls, and map views.

### material-ui (MUI)

Provides UI components such as cards, grids, dialogs, tables, and theming. Used for consistent dashboard layouts and responsive design.

### recharts

Charting library used to visualize battery State of Charge (SoC), temperature trends, and charge/discharge rates in real time.

### react-leaflet

Wrapper around Leaflet.js for rendering interactive maps. Used for charging station discovery and displaying station markers.

### axios

HTTP client used for communicating with backend REST APIs (authentication, reports, station data, history).

### socket.io-client

Used for real-time UI updates where WebSocket-based communication is required (status indicators, live session updates).

### jwt-decode

Decodes JWT tokens on the client to determine user roles and control conditional routing.

### tailwindcss

Utility-first CSS framework used for rapid styling in specific UI sections alongside MUI.

---

## Backend Packages

### express

Core REST API framework handling routing, navigation lifecycle, and admin endpoints.

### mongoose

ODM for MongoDB. Used extensively for:

* GeoJSON route storage
* Charging station 2dsphere indexing
* Fleet location updates

### socket.io

Real-time communication layer for:

* Live vehicle position updates
* Fleet manager dashboards
* Navigation lifecycle events

### axios

HTTP client used for:

* OpenRouteService routing requests
* OpenChargeMap station ingestion

### dotenv

Manages environment variables such as API keys and database URLs.

---

## Database Packages

### mongodb / mongoose

Used to persist vehicle data, battery states, charging sessions, and user information in MongoDB Atlas.

---

## Infrastructure & External Services

### mosquitto

MQTT broker responsible for handling real-time message exchange between simulators and services.

### steve (OCPP server)

Implements the Open Charge Point Protocol to simulate real-world charging stations and sessions.

### openweathermap-api

Provides real-time weather data used to dynamically adjust battery discharge rates.

### openrouteservice-api

Used for calculating optimal routes from vehicle location to charging stations.

---

## Architecture

The system follows a **geospatial, event-driven architecture** centered around live route simulation.

### 1. Routing & Navigation

* Routes are fetched from **OpenRouteService (ORS)** using start/end coordinates.
* Full route geometry is stored in MongoDB as GeoJSON.
* Route points are processed into movement points for simulation.

### 2. Charging Station Discovery (Core Logic)

Charging stations are stored in MongoDB with a **2dsphere index** on `location`.

Two discovery strategies are implemented:

**Method 1: Route Buffer Search**

* Creates a bounding box around the route
* Filters candidate stations
* Calculates exact distance from each station to the nearest route point

**Method 2: Route Sampling + `$geoNear` (Fallback)**

* Samples points along the route
* Uses MongoDB `$geoNear` to find stations near each sample
* Deduplicates and orders stations by route position

Stations are then evenly spaced along the route.

### 3. Real-Time Fleet Simulation

* Vehicle movement is simulated point-by-point along the route
* Live location updates emitted via Socket.IO
* Fleet managers receive aggregated live tracking

### 4. Data Persistence

* Routes, fleet locations, and charging stations stored in MongoDB
* Charging stations populated from **OpenChargeMap API**

---

## Setup Instructions

### Prerequisites

* Node.js (v16+ recommended)
* npm
* MongoDB (local or Atlas)
* Mosquitto MQTT Broker

### Install Mosquitto (Ubuntu)

```bash
sudo apt update
sudo apt install mosquitto mosquitto-clients
sudo systemctl enable mosquitto
sudo systemctl start mosquitto
```

### Clone Repository

```bash
git clone https://github.com/Abhinav-Mathew-Kurian/Fleet_Map.git
cd Fleet_Map
```

### Frontend

```bash
cd frontend
npm install
npm start
```

### Backend

```bash
cd backend
npm install
nodemon index.js
```


> Note: A SteVe OCPP server must be installed separately on Amazon Lightsail and a charge box ID must be registered for charging simulations to function.

---

## Known Issues / Risks

* MQTT message loss if QoS is not configured correctly
* OCPP simulations depend on correct SteVe configuration
* Weather API rate limits may affect discharge accuracy
* Not optimized for large‑scale fleets
* Local environment setup can be complex for first‑time users

---



## Author

Abhinav Mathew Kurian
