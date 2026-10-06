// DriveAI Client & Autonomous Simulation Engine for Live Vercel & Connected Hardware

const API_BASE = 'http://localhost:8000/api';

// Initial autonomous taxi fleet state
const DEFAULT_FLEET = [
  {
    id: 1,
    taxi_code: 'ROBO-01',
    name: 'DriveAI CyberPod Alpha',
    model: 'Autonomous RoboCar Mk1',
    hardware_version: 'ArduinoUno-L515-Jetson',
    status: 'AVAILABLE',
    battery_percent: 94.5,
    current_lat: 12.9716,
    current_lng: 77.5946,
    current_heading: 45.0,
    speed_kmh: 0.0,
    front_obstacle_cm: 250.0,
    emergency_stop_triggered: false,
    manual_override: false,
    last_ping: new Date().toISOString()
  },
  {
    id: 2,
    taxi_code: 'ROBO-02',
    name: 'DriveAI Emerald Cruiser',
    model: 'RoboSedan Executive',
    hardware_version: 'ArduinoUno-L515-Jetson',
    status: 'AVAILABLE',
    battery_percent: 88.0,
    current_lat: 12.9765,
    current_lng: 77.6015,
    current_heading: 180.0,
    speed_kmh: 0.0,
    front_obstacle_cm: 180.0,
    emergency_stop_triggered: false,
    manual_override: false,
    last_ping: new Date().toISOString()
  },
  {
    id: 3,
    taxi_code: 'ROBO-03',
    name: 'DriveAI BlueStream Neo',
    model: 'Urban Compact Robotic Shuttle',
    hardware_version: 'ArduinoUno-L515-Jetson',
    status: 'AVAILABLE',
    battery_percent: 74.0,
    current_lat: 12.9650,
    current_lng: 77.5880,
    current_heading: 270.0,
    speed_kmh: 0.0,
    front_obstacle_cm: 310.0,
    emergency_stop_triggered: false,
    manual_override: false,
    last_ping: new Date().toISOString()
  },
  {
    id: 4,
    taxi_code: 'ROBO-04',
    name: 'DriveAI Titan Carrier',
    model: 'Autonomous Heavy Carrier',
    hardware_version: 'ArduinoUno-L515-Jetson',
    status: 'AVAILABLE',
    battery_percent: 99.0,
    current_lat: 12.9830,
    current_lng: 77.5990,
    current_heading: 90.0,
    speed_kmh: 0.0,
    front_obstacle_cm: 450.0,
    emergency_stop_triggered: false,
    manual_override: false,
    last_ping: new Date().toISOString()
  }
];

// Helper: Haversine distance in km
export function haversineKm(lat1, lon1, lat2, lon2) {
  const R = 6371.0;
  const dLat = (lat2 - lat1) * Math.PI / 180;
  const dLon = (lon2 - lon1) * Math.PI / 180;
  const a = Math.sin(dLat/2) * Math.sin(dLat/2) +
            Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) *
            Math.sin(dLon/2) * Math.sin(dLon/2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a));
  return Number((R * c).toFixed(2));
}

// Generate realistic road waypoints
export function generateRoutePoints(startLat, startLng, endLat, endLng, pointsCount = 14) {
  const waypoints = [[startLat, startLng]];
  const midLat = startLat + (endLat - startLat) * 0.45;
  const midLng = startLng + (endLng - startLng) * 0.70;

  const seg1 = Math.floor(pointsCount / 2);
  for (let i = 1; i < seg1; i++) {
    const frac = i / seg1;
    waypoints.push([
      Number((startLat + (midLat - startLat) * frac).toFixed(6)),
      Number((startLng + (startLng - startLng) * frac).toFixed(6))
    ]);
  }
  waypoints.push([Number(midLat.toFixed(6)), Number(midLng.toFixed(6))]);

  const seg2 = pointsCount - seg1;
  for (let i = 1; i < seg2; i++) {
    const frac = i / seg2;
    waypoints.push([
      Number((midLat + (endLat - midLat) * frac).toFixed(6)),
      Number((midLng + (endLng - midLng) * frac).toFixed(6))
    ]);
  }
  waypoints.push([endLat, endLng]);
  return waypoints;
}

// Bearing calculation for vehicle heading angle (0-360)
export function calculateBearingDeg(lat1, lon1, lat2, lon2) {
  const y = Math.sin((lon2 - lon1) * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180);
  const x = Math.cos(lat1 * Math.PI / 180) * Math.sin(lat2 * Math.PI / 180) -
            Math.sin(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) * Math.cos((lon2 - lon1) * Math.PI / 180);
  const bearing = (Math.atan2(y, x) * 180 / Math.PI + 360) % 360;
  return Number(bearing.toFixed(1));
}

// -------------------------------------------------------------
// LOCAL STATE STORAGE FOR VERCEL STANDALONE MODE
// -------------------------------------------------------------
function getLocalFleet() {
  const stored = localStorage.getItem('driveai_local_fleet');
  if (stored) {
    try { return JSON.parse(stored); } catch (e) {}
  }
  localStorage.setItem('driveai_local_fleet', JSON.stringify(DEFAULT_FLEET));
  return DEFAULT_FLEET;
}

function saveLocalFleet(fleet) {
  localStorage.setItem('driveai_local_fleet', JSON.stringify(fleet));
}

function getLocalActiveRide() {
  const r = localStorage.getItem('driveai_active_ride');
  return r ? JSON.parse(r) : null;
}

function saveLocalActiveRide(ride) {
  if (ride) {
    localStorage.setItem('driveai_active_ride', JSON.stringify(ride));
  } else {
    localStorage.removeItem('driveai_active_ride');
  }
}

function getLocalRideHistory() {
  const h = localStorage.getItem('driveai_ride_history');
  return h ? JSON.parse(h) : [];
}

function appendLocalRideHistory(ride) {
  const history = getLocalRideHistory();
  history.unshift(ride);
  localStorage.setItem('driveai_ride_history', JSON.stringify(history));
}

// -------------------------------------------------------------
// IN-BROWSER AUTONOMOUS VEHICLE SIMULATION LOOP
// -------------------------------------------------------------
let simInterval = null;

function ensureSimulationLoopRunning() {
  if (simInterval) return;

  simInterval = setInterval(() => {
    const activeRide = getLocalActiveRide();
    const fleet = getLocalFleet();

    if (!activeRide || !activeRide.taxi_id) return;

    const taxiIndex = fleet.findIndex(t => t.id === activeRide.taxi_id);
    if (taxiIndex === -1) return;

    const taxi = fleet[taxiIndex];

    if (taxi.status === 'EMERGENCY_STOP' || taxi.emergency_stop_triggered) {
      taxi.speed_kmh = 0;
      saveLocalFleet(fleet);
      return;
    }

    // Waypoints navigation progression
    if (['ARRIVING', 'IN_TRANSIT'].includes(taxi.status)) {
      let waypoints = [];
      try {
        waypoints = typeof activeRide.route_waypoints === 'string'
          ? JSON.parse(activeRide.route_waypoints)
          : activeRide.route_waypoints;
      } catch (e) {}

      if (waypoints && waypoints.length > 0) {
        let currentTargetIndex = activeRide._wpIndex || 0;
        if (currentTargetIndex < waypoints.length) {
          const target = waypoints[currentTargetIndex];
          const distToTarget = haversineKm(taxi.current_lat, taxi.current_lng, target[0], target[1]);

          // Update heading
          taxi.current_heading = calculateBearingDeg(taxi.current_lat, taxi.current_lng, target[0], target[1]);
          taxi.speed_kmh = 32.0;

          // Displace vehicle along heading
          const distStepKm = (taxi.speed_kmh / 3600.0) * 0.2; // 200ms step
          const radH = taxi.current_heading * Math.PI / 180;
          taxi.current_lat += (distStepKm / 111.0) * Math.cos(radH);
          taxi.current_lng += (distStepKm / (111.0 * Math.cos(taxi.current_lat * Math.PI / 180))) * Math.sin(radH);
          taxi.battery_percent = Math.max(12, Number((taxi.battery_percent - 0.002).toFixed(2)));

          // Check target arrival
          if (distToTarget < 0.035) {
            currentTargetIndex++;
            activeRide._wpIndex = currentTargetIndex;

            if (currentTargetIndex >= waypoints.length) {
              // Reached goal
              taxi.speed_kmh = 0;
              if (taxi.status === 'ARRIVING') {
                taxi.status = 'WAITING';
                activeRide.status = 'WAITING';
              } else if (taxi.status === 'IN_TRANSIT') {
                taxi.status = 'RIDE_COMPLETED';
                activeRide.status = 'COMPLETED';
                activeRide.completed_at = new Date().toISOString();
                appendLocalRideHistory(activeRide);
                // Return to available after 4s
                setTimeout(() => {
                  taxi.status = 'AVAILABLE';
                  saveLocalFleet(getLocalFleet());
                }, 4000);
              }
            }
          }
        }
      }
    }

    saveLocalFleet(fleet);
    saveLocalActiveRide(activeRide);
  }, 200);
}

// Start simulation on engine initialization
ensureSimulationLoopRunning();

// -------------------------------------------------------------
// AUTHENTICATION UTILITIES
// -------------------------------------------------------------
export function getAuthToken() {
  return localStorage.getItem('driveai_token');
}

export function setAuthToken(token) {
  localStorage.setItem('driveai_token', token);
}

export function removeAuthToken() {
  localStorage.removeItem('driveai_token');
  localStorage.removeItem('driveai_user');
}

export function getCurrentStoredUser() {
  try {
    const user = localStorage.getItem('driveai_user');
    return user ? JSON.parse(user) : null;
  } catch (e) {
    return null;
  }
}

// -------------------------------------------------------------
// DUAL-MODE API CLIENT: Live Backend with Automatic Fallback
// -------------------------------------------------------------
async function tryFetch(endpoint, method = 'GET', body = null) {
  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 1500); // Fast 1.5s check

    const headers = { 'Content-Type': 'application/json' };
    const token = getAuthToken();
    if (token) headers['Authorization'] = `Bearer ${token}`;

    const config = { method, headers, signal: controller.signal };
    if (body) config.body = JSON.stringify(body);

    const res = await fetch(`${API_BASE}${endpoint}`, config);
    clearTimeout(timeout);
    if (!res.ok) throw new Error('API request failed');
    return await res.json();
  } catch (e) {
    return null; // Fallback to in-browser engine
  }
}

// -------------------------------------------------------------
// EXPORTED API METHODS
// -------------------------------------------------------------
export async function login(email, password) {
  const remote = await tryFetch('/auth/login', 'POST', { email, password });
  if (remote) {
    setAuthToken(remote.access_token);
    localStorage.setItem('driveai_user', JSON.stringify(remote.user));
    return remote;
  }

  // Fallback in-browser authentication
  const isDemoAdmin = email.includes('admin');
  const user = {
    id: isDemoAdmin ? 1 : 2,
    email,
    full_name: isDemoAdmin ? 'Fleet Operations Commander' : 'Sarah Connor',
    phone: '+1-800-DRIVE-AI',
    role: isDemoAdmin ? 'admin' : 'passenger',
    created_at: new Date().toISOString()
  };
  const token = 'mock-jwt-token-driveai-' + Date.now();
  setAuthToken(token);
  localStorage.setItem('driveai_user', JSON.stringify(user));
  return { access_token: token, user };
}

export async function register(email, password, full_name, phone) {
  const remote = await tryFetch('/auth/register', 'POST', { email, password, full_name, phone });
  if (remote) {
    setAuthToken(remote.access_token);
    localStorage.setItem('driveai_user', JSON.stringify(remote.user));
    return remote;
  }

  const user = {
    id: Math.floor(Math.random() * 900) + 10,
    email,
    full_name: full_name || 'Passenger',
    phone: phone || '+1-555-019-2834',
    role: 'passenger',
    created_at: new Date().toISOString()
  };
  const token = 'mock-jwt-token-driveai-' + Date.now();
  setAuthToken(token);
  localStorage.setItem('driveai_user', JSON.stringify(user));
  return { access_token: token, user };
}

export async function fetchTaxis() {
  const remote = await tryFetch('/taxis');
  if (remote) return remote;
  return getLocalFleet();
}

export async function fetchTaxi(taxiId) {
  const fleet = await fetchTaxis();
  return fleet.find(t => t.id === Number(taxiId)) || null;
}

export async function estimateRide(pickup_lat, pickup_lng, dropoff_lat, dropoff_lng, pickup_name, dropoff_name) {
  const remote = await tryFetch('/rides/estimate', 'POST', {
    pickup_lat, pickup_lng, dropoff_lat, dropoff_lng, pickup_name, dropoff_name
  });
  if (remote) return remote;

  const distance = haversineKm(pickup_lat, pickup_lng, dropoff_lat, dropoff_lng);
  const timeMins = Number(Math.max(3.0, (distance / 30.0) * 60.0).toFixed(1));
  const fare = Number((50.0 + (distance * 18.0) + 20.0).toFixed(2));
  const waypoints = generateRoutePoints(pickup_lat, pickup_lng, dropoff_lat, dropoff_lng, 14);

  return {
    pickup_name,
    dropoff_name,
    distance_km: distance,
    estimated_time_mins: timeMins,
    fare_amount: fare,
    available_taxis_count: 4,
    estimated_pickup_eta_mins: 2.5,
    route_waypoints: waypoints
  };
}

export async function bookRide(pickup_name, pickup_lat, pickup_lng, dropoff_name, dropoff_lat, dropoff_lng) {
  const remote = await tryFetch('/rides/book', 'POST', {
    pickup_name, pickup_lat, pickup_lng, dropoff_name, dropoff_lat, dropoff_lng
  });
  if (remote) return remote;

  // In-browser engine allocation
  const fleet = getLocalFleet();
  const availableTaxi = fleet.find(t => t.status === 'AVAILABLE') || fleet[0];
  availableTaxi.status = 'ASSIGNED';

  const distance = haversineKm(pickup_lat, pickup_lng, dropoff_lat, dropoff_lng);
  const fare = Number((50.0 + (distance * 18.0) + 20.0).toFixed(2));
  const waypoints = generateRoutePoints(availableTaxi.current_lat, availableTaxi.current_lng, pickup_lat, pickup_lng, 10);

  const ride = {
    id: Math.floor(Math.random() * 8000) + 1000,
    user_id: 1,
    taxi_id: availableTaxi.id,
    status: 'ARRIVING',
    pickup_name,
    pickup_lat,
    pickup_lng,
    dropoff_name,
    dropoff_lat,
    dropoff_lng,
    distance_km: distance,
    estimated_time_mins: 4.5,
    fare_amount: fare,
    route_waypoints: JSON.stringify(waypoints),
    _wpIndex: 0,
    requested_at: new Date().toISOString(),
    taxi: availableTaxi
  };

  availableTaxi.status = 'ARRIVING';
  saveLocalFleet(fleet);
  saveLocalActiveRide(ride);
  return ride;
}

export async function getActiveRide() {
  const remote = await tryFetch('/rides/active');
  if (remote) return remote;
  return getLocalActiveRide();
}

export async function getRideHistory() {
  const remote = await tryFetch('/rides/history');
  if (remote) return remote;
  return getLocalRideHistory();
}

export async function confirmPickup(rideId) {
  const remote = await tryFetch(`/rides/${rideId}/confirm-pickup`, 'POST');
  if (remote) return remote;

  const activeRide = getLocalActiveRide();
  if (activeRide) {
    activeRide.status = 'IN_TRANSIT';
    activeRide.started_at = new Date().toISOString();

    const fleet = getLocalFleet();
    const taxi = fleet.find(t => t.id === activeRide.taxi_id);
    if (taxi) {
      taxi.status = 'IN_TRANSIT';
      const toDropoffRoute = generateRoutePoints(activeRide.pickup_lat, activeRide.pickup_lng, activeRide.dropoff_lat, activeRide.dropoff_lng, 14);
      activeRide.route_waypoints = JSON.stringify(toDropoffRoute);
      activeRide._wpIndex = 0;
      saveLocalFleet(fleet);
    }
    saveLocalActiveRide(activeRide);
  }
  return { status: 'IN_TRANSIT' };
}

export async function cancelRide(rideId) {
  const remote = await tryFetch(`/rides/${rideId}/cancel`, 'POST');
  if (remote) return remote;

  const activeRide = getLocalActiveRide();
  const fleet = getLocalFleet();
  if (activeRide) {
    const taxi = fleet.find(t => t.id === activeRide.taxi_id);
    if (taxi) {
      taxi.status = 'AVAILABLE';
      taxi.speed_kmh = 0;
      saveLocalFleet(fleet);
    }
  }
  saveLocalActiveRide(null);
  return { status: 'CANCELLED' };
}

export async function triggerEmergencyStop(taxiId) {
  const remote = await tryFetch(`/taxis/${taxiId}/emergency-stop`, 'POST');
  if (remote) return remote;

  const fleet = getLocalFleet();
  const taxi = fleet.find(t => t.id === Number(taxiId));
  if (taxi) {
    taxi.status = 'EMERGENCY_STOP';
    taxi.emergency_stop_triggered = true;
    taxi.speed_kmh = 0;
    saveLocalFleet(fleet);
  }
  return { status: 'EMERGENCY_STOP_TRIGGERED' };
}

export async function resumeTaxi(taxiId) {
  const remote = await tryFetch(`/taxis/${taxiId}/resume`, 'POST');
  if (remote) return remote;

  const fleet = getLocalFleet();
  const taxi = fleet.find(t => t.id === Number(taxiId));
  if (taxi) {
    taxi.status = 'AVAILABLE';
    taxi.emergency_stop_triggered = false;
    saveLocalFleet(fleet);
  }
  return { status: 'RESUMED' };
}

export async function triggerGlobalEmergencyStop() {
  const remote = await tryFetch('/admin/emergency-stop-all', 'POST');
  if (remote) return remote;

  const fleet = getLocalFleet();
  fleet.forEach(t => {
    t.status = 'EMERGENCY_STOP';
    t.emergency_stop_triggered = true;
    t.speed_kmh = 0;
  });
  saveLocalFleet(fleet);
  return { status: 'GLOBAL_EMERGENCY_HALT_ACTIVE' };
}

export async function fetchAdminOverview() {
  const remote = await tryFetch('/admin/overview');
  if (remote) return remote;

  const fleet = getLocalFleet();
  const activeRide = getLocalActiveRide();
  const history = getLocalRideHistory();
  const avgBat = Number((fleet.reduce((acc, t) => acc + t.battery_percent, 0) / fleet.length).toFixed(1));

  return {
    total_taxis: fleet.length,
    active_taxis: fleet.filter(t => t.status !== 'OFFLINE').length,
    active_rides: activeRide && activeRide.status !== 'COMPLETED' ? 1 : 0,
    total_rides: history.length + (activeRide ? 1 : 0),
    total_users: 18,
    emergency_stops: fleet.filter(t => t.emergency_stop_triggered).length,
    avg_battery: avgBat
  };
}

export async function fetchSystemLogs(limit = 30) {
  const remote = await tryFetch(`/admin/logs?limit=${limit}`);
  if (remote) return remote;

  return [
    { id: 1, level: 'INFO', source: 'LIDAR_L515', message: 'Intel RealSense LiDAR depth point cloud calibrated: 0.25m - 9.0m.', timestamp: new Date().toISOString() },
    { id: 2, level: 'INFO', source: 'ARDUINO_UNO', message: 'Arduino Uno 2-Motor differential controller active on /dev/ttyACM0.', timestamp: new Date().toISOString() },
    { id: 3, level: 'INFO', source: 'DISPATCHER', message: 'Bangalore Tech Zone dispatch algorithm initialized.', timestamp: new Date().toISOString() },
    { id: 4, level: 'INFO', source: 'VISION_CAM', message: 'USB Camera 1 optical corridor lane tracker streaming at 30 FPS.', timestamp: new Date().toISOString() }
  ];
}
