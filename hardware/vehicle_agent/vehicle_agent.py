import asyncio
import math
import time
import logging
from typing import Optional, List
from hardware.vehicle_agent.config import config
from hardware.vehicle_agent.hardware_bridge import HardwareBridge
from hardware.vehicle_agent.obstacle_detector import ObstacleDetector
from hardware.vehicle_agent.navigation import WaypointNavigator, haversine_km, calculate_bearing
from hardware.vehicle_agent.telemetry_client import TelemetryClient

logging.basicConfig(level=logging.INFO, format="%(asctime)s [%(levelname)s] %(name)s: %(message)s")
logger = logging.getLogger("driveai.agent")

class AutonomousVehicleAgent:
    def __init__(self):
        self.config = config
        
        # Subsystems
        self.hw_bridge = HardwareBridge(port=config.SERIAL_PORT, baud=config.BAUD_RATE)
        self.detector = ObstacleDetector(camera_idx=config.CAMERA_INDEX, enable_vision=config.VISION_ENABLED)
        self.navigator = WaypointNavigator(arrival_tolerance_km=config.WAYPOINT_ARRIVAL_RADIUS_KM)
        self.telemetry = TelemetryClient(ws_url=config.WS_URL, on_command_callback=self.handle_server_command)

        # Vehicle State
        self.status: str = "AVAILABLE" # AVAILABLE, ASSIGNED, ARRIVING, WAITING, RIDE_STARTED, IN_TRANSIT, RIDE_COMPLETED, EMERGENCY_STOP
        self.current_lat: float = 12.9716
        self.current_lng: float = 77.5946
        self.current_heading: float = 45.0
        self.speed_kmh: float = 0.0
        self.battery_percent: float = 95.0
        self.active_ride_id: Optional[int] = None

        # Mission Waypoints Cache
        self.pickup_coords: Optional[dict] = None
        self.dropoff_coords: Optional[dict] = None
        self.ride_route_waypoints: List[List[float]] = []

    def handle_server_command(self, cmd_data: dict):
        command = cmd_data.get("command")
        logger.info(f"==> EXECUTING COMMAND: {command}")

        if command == "DISPATCH_MISSION":
            self.active_ride_id = cmd_data.get("ride_id")
            self.pickup_coords = cmd_data.get("pickup")
            self.dropoff_coords = cmd_data.get("dropoff")
            self.ride_route_waypoints = cmd_data.get("ride_route_waypoints", [])
            
            # Load route towards pickup
            pickup_route = cmd_data.get("pickup_route_waypoints", [])
            if pickup_route:
                self.navigator.load_route(pickup_route)
            elif self.pickup_coords:
                self.navigator.load_route([[self.pickup_coords['lat'], self.pickup_coords['lng']]])
            
            self.status = "ARRIVING"
            logger.info(f"Dispatched to pickup: {self.pickup_coords.get('name')}. Navigation started.")

        elif command == "START_TRANSIT_TO_DROPOFF":
            # Passenger boarded and clicked "Start Ride"
            if self.ride_route_waypoints:
                self.navigator.load_route(self.ride_route_waypoints)
            elif self.dropoff_coords:
                self.navigator.load_route([[self.dropoff_coords['lat'], self.dropoff_coords['lng']]])
                
            self.status = "IN_TRANSIT"
            logger.info("Passenger on board. En route to destination!")

        elif command == "EMERGENCY_STOP":
            self.status = "EMERGENCY_STOP"
            self.speed_kmh = 0.0
            self.hw_bridge.send_emergency_stop()
            logger.warning("!!! HARD EMERGENCY BRAKE EXECUTED VIA SERVER COMMAND !!!")

        elif command == "RESUME_OPERATION":
            if self.status == "EMERGENCY_STOP":
                self.status = "AVAILABLE"
                self.hw_bridge.send_resume()
                logger.info("Emergency brake cleared. Returning to normal operational state.")

        elif command == "ABORT_MISSION":
            self.status = "AVAILABLE"
            self.active_ride_id = None
            self.navigator.clear()
            self.hw_bridge.send_drive_command(0, 0)
            logger.info("Mission aborted by user/admin.")

    async def control_loop(self):
        """High-frequency (10Hz) autonomous control loop."""
        while True:
            t_start = time.time()

            # 1. Read hardware sensors (ESP32 serial)
            hw_state = self.hw_bridge.poll_telemetry()
            ultrasonic_dist = hw_state.get("dist_front", 999.0)

            # 2. Obstacle perception & sensor fusion
            safety_assessment = self.detector.detect(ultrasonic_dist)
            obstacle_detected = safety_assessment["obstacle_detected"]
            action = safety_assessment["action"]

            # 3. Emergency stop handling
            if self.status == "EMERGENCY_STOP" or hw_state.get("estop", False):
                self.speed_kmh = 0.0
                self.hw_bridge.send_drive_command(0, 0)
            elif obstacle_detected and action == "EMERGENCY_BRAKE":
                # Front obstacle within 30cm -> automated emergency stop
                self.speed_kmh = 0.0
                self.hw_bridge.send_drive_command(0, 0)
                logger.warning(f"Obstacle Emergency Stop: Object at {safety_assessment['distance_cm']} cm")
            elif self.status in ["ARRIVING", "IN_TRANSIT"]:
                # Normal autonomous navigation along route
                if self.navigator.has_active_route():
                    target = self.navigator.current_target()
                    if target:
                        # Compute bearing
                        target_bearing = calculate_bearing(self.current_lat, self.current_lng, target[0], target[1])
                        
                        # Smoothly rotate heading towards target
                        heading_diff = (target_bearing - self.current_heading + 180) % 360 - 180
                        turn_rate = max(-15.0, min(15.0, heading_diff * 0.4))
                        self.current_heading = (self.current_heading + turn_rate) % 360

                        # Speed adjustment if slowdown warned
                        target_speed = config.CRUISE_SPEED_KMH
                        if action == "SLOWDOWN":
                            target_speed *= 0.4

                        # Step vehicle forward along heading (simulate physics / dead reckoning)
                        self.speed_kmh = target_speed
                        dist_step_km = (self.speed_kmh / 3600.0) * 0.1 # Distance in 100ms
                        
                        # Lat/Lng displacement
                        rad_heading = math.radians(self.current_heading)
                        d_lat = (dist_step_km / 111.0) * math.cos(rad_heading)
                        d_lng = (dist_step_km / (111.0 * math.cos(math.radians(self.current_lat)))) * math.sin(rad_heading)
                        
                        self.current_lat += d_lat
                        self.current_lng += d_lng

                        # Send drive commands to microcontroller
                        throttle = int((target_speed / config.CRUISE_SPEED_KMH) * config.MAX_THROTTLE)
                        steer = int(max(-100, min(100, heading_diff * config.STEER_KP)))
                        self.hw_bridge.send_drive_command(throttle, steer)

                        # Check if arrived at waypoint or final point
                        dist_to_wp = haversine_km(self.current_lat, self.current_lng, target[0], target[1])
                        if dist_to_wp <= config.WAYPOINT_ARRIVAL_RADIUS_KM:
                            self.navigator.current_idx += 1
                            if self.navigator.is_route_completed():
                                # Arrived at destination!
                                self.speed_kmh = 0.0
                                self.hw_bridge.send_drive_command(0, 0)
                                
                                if self.status == "ARRIVING":
                                    self.status = "WAITING"
                                    logger.info("ARRIVED AT PASSENGER PICKUP. Status: WAITING.")
                                elif self.status == "IN_TRANSIT":
                                    self.status = "RIDE_COMPLETED"
                                    logger.info("ARRIVED AT DESTINATION! Ride completed successfully.")
                else:
                    self.speed_kmh = 0.0
                    self.hw_bridge.send_drive_command(0, 0)
            else:
                self.speed_kmh = 0.0
                self.hw_bridge.send_drive_command(0, 0)

            # Battery drain simulation (slight decay during movement)
            if self.speed_kmh > 0:
                self.battery_percent = max(5.0, round(self.battery_percent - 0.001, 3))

            # 4. Transmit telemetry to server
            telemetry_packet = {
                "type": "TELEMETRY",
                "taxi_code": config.TAXI_CODE,
                "lat": round(self.current_lat, 6),
                "lng": round(self.current_lng, 6),
                "heading": round(self.current_heading, 1),
                "speed_kmh": round(self.speed_kmh, 1),
                "battery_percent": round(self.battery_percent, 1),
                "front_obstacle_cm": safety_assessment["distance_cm"],
                "obstacle_detected": obstacle_detected,
                "status": self.status,
                "active_ride_id": self.active_ride_id,
                "emergency_stop": (self.status == "EMERGENCY_STOP")
            }
            await self.telemetry.send_telemetry(telemetry_packet)

            elapsed = time.time() - t_start
            await asyncio.sleep(max(0.01, 0.1 - elapsed)) # Maintain ~10Hz loop

    async def run(self):
        logger.info(f"Starting Autonomous Vehicle Agent for {config.TAXI_CODE} (ID {config.TAXI_ID})...")
        await asyncio.gather(
            self.telemetry.connect_and_listen(),
            self.control_loop()
        )

if __name__ == "__main__":
    agent = AutonomousVehicleAgent()
    try:
        asyncio.run(agent.run())
    except KeyboardInterrupt:
        logger.info("Vehicle Agent stopped.")
