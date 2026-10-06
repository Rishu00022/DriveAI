# DriveAI - Communication Protocol & API Specification

This document specifies all communication interfaces within the DriveAI ecosystem:
1. **REST APIs** (Web Clients <-> Backend Server)
2. **WebSocket Channels** (Vehicle Hardware <-> Backend Server <-> Web Clients)
3. **Serial UART Protocol** (Jetson Nano <-> ESP32 Microcontroller)

---

## 1. REST APIs

Base URL: `http://localhost:8000/api`

### Authentication Endpoints
- `POST /auth/register`
  - Body: `{"email": "user@example.com", "password": "secret", "full_name": "John Doe", "phone": "+1234567890"}`
  - Response: `{"access_token": "...", "token_type": "bearer", "user": {...}}`
- `POST /auth/login`
  - Body: `{"email": "user@example.com", "password": "secret"}`
  - Response: `{"access_token": "...", "token_type": "bearer", "user": {...}}`
- `GET /auth/me` (Bearer Token required)
  - Returns authenticated user profile.

### Autonomous Taxi Fleet Endpoints
- `GET /taxis`
  - Returns array of all registered autonomous taxis with live position, status, battery, speed, and heading.
- `GET /taxis/{taxi_id}`
  - Returns details for a single taxi.
- `POST /taxis/{taxi_id}/emergency-stop`
  - Dispatches immediate emergency stop command to vehicle hardware and sets taxi status to `EMERGENCY_STOP`.
- `POST /taxis/{taxi_id}/resume`
  - Clears emergency stop and restores vehicle status to `AVAILABLE`.

### Ride Booking Endpoints
- `POST /rides/estimate`
  - Body: `{"pickup_lat": 12.9716, "pickup_lng": 77.5946, "dropoff_lat": 12.9790, "dropoff_lng": 77.6040, "pickup_name": "A", "dropoff_name": "B"}`
  - Response: `{"distance_km": 1.4, "estimated_time_mins": 4.5, "fare_amount": 95.2, "available_taxis_count": 4, "route_waypoints": [...]}`
- `POST /rides/book` (Bearer Token required)
  - Allocates nearest available taxi and transmits mission waypoints directly to the vehicle over WebSocket.
- `GET /rides/active` (Bearer Token required)
  - Returns passenger's current active ride (if any).
- `GET /rides/history` (Bearer Token required)
  - Returns historical rides for the passenger.
- `POST /rides/{ride_id}/confirm-pickup`
  - Passenger confirms boarded; informs vehicle to start transit toward destination.
- `POST /rides/{ride_id}/cancel`
  - Cancels ride and releases vehicle back to available pool.

### Admin Fleet Control Endpoints
- `GET /admin/overview`
  - Fleet metrics: `total_taxis`, `active_taxis`, `active_rides`, `avg_battery`, `emergency_stops`.
- `GET /admin/logs?limit=50`
  - Returns recent system, vision, and hardware error logs.
- `POST /admin/emergency-stop-all`
  - Global emergency stop broadcast to all vehicles simultaneously.

---

## 2. WebSocket Real-Time Protocols

### A. Vehicle Hardware Channel (`/ws/taxi/{taxi_id}`)

#### 1. Hardware -> Server: Telemetry Stream (5–10 Hz)
```json
{
  "type": "TELEMETRY",
  "taxi_code": "ROBO-01",
  "lat": 12.972145,
  "lng": 77.595120,
  "heading": 48.5,
  "speed_kmh": 26.2,
  "battery_percent": 93.8,
  "front_obstacle_cm": 145.0,
  "obstacle_detected": false,
  "status": "IN_TRANSIT",
  "active_ride_id": 14,
  "emergency_stop": false
}
```

#### 2. Server -> Hardware: Dispatch Mission Command
```json
{
  "command": "DISPATCH_MISSION",
  "ride_id": 14,
  "passenger_id": 2,
  "passenger_name": "Sarah Connor",
  "pickup": {"lat": 12.9716, "lng": 77.5946, "name": "Tech Park Central"},
  "dropoff": {"lat": 12.9790, "lng": 77.6040, "name": "Cyber Innovation Zone"},
  "pickup_route_waypoints": [[12.9716, 77.5946], [12.9725, 77.5960], ...],
  "ride_route_waypoints": [[12.9716, 77.5946], [12.9750, 77.5980], ...]
}
```

#### 3. Server -> Hardware: Start Transit
```json
{
  "command": "START_TRANSIT_TO_DROPOFF",
  "ride_id": 14
}
```

#### 4. Server -> Hardware: Hard Emergency Halt
```json
{
  "command": "EMERGENCY_STOP",
  "reason": "PASSENGER_OR_ADMIN_TRIGGERED"
}
```

---

## 3. Serial UART Protocol (Jetson Nano <-> ESP32)

Serial Settings: `115200 Baud, 8 Data bits, 1 Stop bit, No Parity`

### Jetson Nano -> ESP32 Commands
- `DRIVE,<throttle>,<steering>\n`
  - `<throttle>`: `-255` (Full Reverse) to `+255` (Full Forward).
  - `<steering>`: `-100` (Full Left Spin) to `+100` (Full Right Spin).
  - Example: `DRIVE,180,15\n`
- `ESTOP\n`: Instantaneous motor cutoff.
- `RESUME\n`: Re-arms motor drive after obstacle clearance.

### ESP32 -> Jetson Nano Telemetry & Interrupts
- Periodic Telemetry (10 Hz):
  ```json
  {"telemetry":{"dist_front":124.5,"estop":false,"throttle":180,"steering":15}}
  ```
- Instantaneous Hardware Safety Event:
  ```json
  {"event":"OBSTACLE_HARD_STOP","distance_cm":21.4}
  ```
