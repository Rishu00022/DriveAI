import asyncio
import json
import math
import random
import time
import logging
import websockets
from typing import List, Optional

logging.basicConfig(level=logging.INFO, format="%(asctime)s [%(levelname)s] %(name)s: %(message)s")

def haversine_km(lat1: float, lon1: float, lat2: float, lon2: float) -> float:
    R = 6371.0
    dlat = math.radians(lat2 - lat1)
    dlon = math.radians(lon2 - lon1)
    a = (math.sin(dlat / 2) ** 2 +
         math.cos(math.radians(lat1)) * math.cos(math.radians(lat2)) *
         math.sin(dlon / 2) ** 2)
    c = 2 * math.atan2(math.sqrt(a), math.sqrt(1 - a))
    return R * c

def calculate_bearing(lat1: float, lon1: float, lat2: float, lon2: float) -> float:
    lat1, lon1, lat2, lon2 = map(math.radians, [lat1, lon1, lat2, lon2])
    dlon = lon2 - lon1
    x = math.sin(dlon) * math.cos(lat2)
    y = math.cos(lat1) * math.sin(lat2) - (math.sin(lat1) * math.cos(lat2) * math.cos(dlon))
    initial_bearing = math.atan2(x, y)
    return (math.degrees(initial_bearing) + 360) % 360

class VirtualTaxi:
    def __init__(self, taxi_id: int, taxi_code: str, name: str, start_lat: float, start_lng: float, ws_url: str):
        self.taxi_id = taxi_id
        self.taxi_code = taxi_code
        self.name = name
        self.lat = start_lat
        self.lng = start_lng
        self.heading = random.uniform(0, 360)
        self.speed_kmh = 0.0
        self.battery = random.uniform(85.0, 98.0)
        self.status = "AVAILABLE"
        self.ws_url = ws_url
        self.ws = None
        self.active_ride_id = None
        self.current_waypoints: List[List[float]] = []
        self.wp_index = 0
        self.simulated_obstacle_cm = 999.0
        self.logger = logging.getLogger(f"VirtualTaxi-{taxi_code}")
        self.is_running = True

    async def connect_websocket(self):
        while self.is_running:
            try:
                self.logger.info(f"Connecting to {self.ws_url}...")
                async with websockets.connect(self.ws_url) as ws:
                    self.ws = ws
                    self.logger.info("Connected to DriveAI server!")
                    
                    async for msg in ws:
                        data = json.loads(msg)
                        self.handle_command(data)
            except Exception as e:
                self.logger.warning(f"Connection dropped: {e}. Reconnecting in 3s...")
                await asyncio.sleep(3.0)

    def handle_command(self, cmd_data: dict):
        cmd = cmd_data.get("command")
        self.logger.info(f"Command received: {cmd}")

        if cmd == "DISPATCH_MISSION":
            self.active_ride_id = cmd_data.get("ride_id")
            pickup_route = cmd_data.get("pickup_route_waypoints", [])
            self.ride_route_waypoints = cmd_data.get("ride_route_waypoints", [])
            self.current_waypoints = pickup_route
            self.wp_index = 0
            self.status = "ARRIVING"
            self.logger.info(f"Dispatched! Navigating to passenger pickup with {len(pickup_route)} waypoints.")

        elif cmd == "START_TRANSIT_TO_DROPOFF":
            self.current_waypoints = getattr(self, "ride_route_waypoints", [])
            self.wp_index = 0
            self.status = "IN_TRANSIT"
            self.logger.info(f"Passenger boarded. Commencing autonomous transit to destination.")

        elif cmd == "EMERGENCY_STOP":
            self.status = "EMERGENCY_STOP"
            self.speed_kmh = 0.0
            self.logger.warning("HARD EMERGENCY BRAKE ENGAGED!")

        elif cmd == "RESUME_OPERATION":
            if self.status == "EMERGENCY_STOP":
                self.status = "AVAILABLE"
                self.logger.info("Emergency stop released. Resumed to AVAILABLE.")

        elif cmd == "ABORT_MISSION":
            self.status = "AVAILABLE"
            self.active_ride_id = None
            self.current_waypoints = []
            self.speed_kmh = 0.0
            self.logger.info("Mission aborted.")

    async def physics_loop(self):
        """Simulates GPS tracking, autonomous navigation, and sensor telemetry."""
        while self.is_running:
            t0 = time.time()

            # Random occasional pedestrian or obstacle event simulation (1% chance when moving)
            if self.status in ["ARRIVING", "IN_TRANSIT"] and random.random() < 0.01:
                self.simulated_obstacle_cm = random.uniform(18.0, 45.0)
            else:
                self.simulated_obstacle_cm = min(999.0, self.simulated_obstacle_cm + 15.0)

            obstacle_detected = self.simulated_obstacle_cm < 75.0
            hard_stop = self.simulated_obstacle_cm < 25.0

            if self.status == "EMERGENCY_STOP" or hard_stop:
                self.speed_kmh = 0.0
            elif self.status in ["ARRIVING", "IN_TRANSIT"]:
                if self.current_waypoints and self.wp_index < len(self.current_waypoints):
                    target = self.current_waypoints[self.wp_index]
                    target_bearing = calculate_bearing(self.lat, self.lng, target[0], target[1])
                    
                    # Smooth heading interpolation
                    angle_diff = (target_bearing - self.heading + 180) % 360 - 180
                    self.heading = (self.heading + angle_diff * 0.3) % 360

                    # Cruise speed (slow down if obstacle in distance)
                    self.speed_kmh = 24.0 if obstacle_detected else 35.0
                    
                    # Compute displacement
                    dist_step_km = (self.speed_kmh / 3600.0) * 0.2
                    rad_h = math.radians(self.heading)
                    self.lat += (dist_step_km / 111.0) * math.cos(rad_h)
                    self.lng += (dist_step_km / (111.0 * math.cos(math.radians(self.lat)))) * math.sin(rad_h)

                    # Check waypoint proximity
                    if haversine_km(self.lat, self.lng, target[0], target[1]) < 0.025: # ~25 meters
                        self.wp_index += 1
                        if self.wp_index >= len(self.current_waypoints):
                            # Reached final waypoint
                            self.speed_kmh = 0.0
                            if self.status == "ARRIVING":
                                self.status = "WAITING"
                                self.logger.info("ARRIVED AT PICKUP LOCATION. Waiting for passenger.")
                            elif self.status == "IN_TRANSIT":
                                self.status = "RIDE_COMPLETED"
                                self.logger.info("ARRIVED AT DESTINATION! Ride completed safely.")
                else:
                    self.speed_kmh = 0.0
            else:
                self.speed_kmh = 0.0

            # Battery discharge
            if self.speed_kmh > 0:
                self.battery = max(10.0, round(self.battery - 0.002, 3))

            # Send telemetry packet over WebSocket
            if self.ws:
                telemetry = {
                    "type": "TELEMETRY",
                    "taxi_code": self.taxi_code,
                    "lat": round(self.lat, 6),
                    "lng": round(self.lng, 6),
                    "heading": round(self.heading, 1),
                    "speed_kmh": round(self.speed_kmh, 1),
                    "battery_percent": round(self.battery, 1),
                    "front_obstacle_cm": round(self.simulated_obstacle_cm, 1),
                    "obstacle_detected": obstacle_detected,
                    "status": self.status,
                    "active_ride_id": self.active_ride_id,
                    "emergency_stop": (self.status == "EMERGENCY_STOP")
                }
                try:
                    await self.ws.send(json.dumps(telemetry))
                except Exception:
                    pass

            dt = time.time() - t0
            await asyncio.sleep(max(0.01, 0.2 - dt)) # 5 Hz update rate

    async def run(self):
        await asyncio.gather(
            self.connect_websocket(),
            self.physics_loop()
        )

async def main():
    # Launches 4 virtual autonomous taxis simultaneously
    taxis = [
        VirtualTaxi(1, "ROBO-01", "DriveAI CyberPod Alpha", 12.9716, 77.5946, "ws://localhost:8000/ws/taxi/1"),
        VirtualTaxi(2, "ROBO-02", "DriveAI RoboX Titan", 12.9765, 77.6015, "ws://localhost:8000/ws/taxi/2"),
        VirtualTaxi(3, "ROBO-03", "DriveAI MicroPod Neo", 12.9650, 77.5880, "ws://localhost:8000/ws/taxi/3"),
        VirtualTaxi(4, "ROBO-04", "DriveAI Autonomous Cruiser", 12.9830, 77.5990, "ws://localhost:8000/ws/taxi/4")
    ]
    await asyncio.gather(*(t.run() for t in taxis))

if __name__ == "__main__":
    asyncio.run(main())
