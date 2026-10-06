import asyncio
import math
import time
import logging
from typing import Optional, List

from hardware.vehicle_agent.config import config
from hardware.vehicle_agent.hardware_bridge import HardwareBridge
from hardware.vehicle_agent.realsense_l515 import IntelRealSenseL515
from hardware.vehicle_agent.usb_camera import USBCamera
from hardware.vehicle_agent.sensor_fusion import MultiSensorFusion
from hardware.vehicle_agent.navigation import WaypointNavigator, haversine_km, calculate_bearing
from hardware.vehicle_agent.telemetry_client import TelemetryClient

logging.basicConfig(level=logging.INFO, format="%(asctime)s [%(levelname)s] %(name)s: %(message)s")
logger = logging.getLogger("driveai.uno_l515_agent")

class AutonomousVehicleUnoL515:
    """
    Dedicated Jetson Nano Autonomous Agent integrating:
      - Arduino Uno (2 DC Motors + HC-SR04 Ultrasonic) via USB Serial (/dev/ttyACM0)
      - Intel RealSense LiDAR Camera L515 via USB 3.0 Type-C
      - USB Camera 1 (RGB Optical Perception)
      - Multi-Sensor Fusion Engine
      - Real-Time WebSocket Telemetry Link to DriveAI Platform
    """
    def __init__(self, serial_port: str = "/dev/ttyACM0"):
        logger.info("Initializing Autonomous Vehicle Agent (Arduino Uno + RealSense L515)...")

        # 1. Hardware Subsystems
        self.arduino = HardwareBridge(port=serial_port, baud=115200)
        self.lidar = IntelRealSenseL515(width=640, height=480, fps=30)
        self.usb_cam = USBCamera(camera_index=0, width=640, height=480)
        self.fusion = MultiSensorFusion()

        # 2. Navigation & Telemetry
        self.navigator = WaypointNavigator(arrival_tolerance_km=0.0003)
        self.telemetry = TelemetryClient(ws_url=config.WS_URL, on_command_callback=self.handle_server_command)

        # 3. Vehicle State
        self.taxi_code = "ROBO-01"
        self.status = "AVAILABLE" # AVAILABLE, ASSIGNED, ARRIVING, WAITING, IN_TRANSIT, COMPLETED, EMERGENCY_STOP
        self.current_lat = 12.9716
        self.current_lng = 77.5946
        self.current_heading = 45.0
        self.speed_kmh = 0.0
        self.battery_percent = 95.0
        self.active_ride_id: Optional[int] = None

        self.ride_route_waypoints: List[List[float]] = []

    def handle_server_command(self, cmd_data: dict):
        cmd = cmd_data.get("command")
        logger.info(f"==> SERVER COMMAND RECEIVED: {cmd}")

        if cmd == "DISPATCH_MISSION":
            self.active_ride_id = cmd_data.get("ride_id")
            pickup_route = cmd_data.get("pickup_route_waypoints", [])
            self.ride_route_waypoints = cmd_data.get("ride_route_waypoints", [])
            
            if pickup_route:
                self.navigator.load_route(pickup_route)
            self.status = "ARRIVING"
            logger.info("Mission accepted: Navigating to passenger pickup location.")

        elif cmd == "START_TRANSIT_TO_DROPOFF":
            if self.ride_route_waypoints:
                self.navigator.load_route(self.ride_route_waypoints)
            self.status = "IN_TRANSIT"
            logger.info("Passenger boarded: En route to destination via autonomous navigation.")

        elif cmd == "EMERGENCY_STOP":
            self.status = "EMERGENCY_STOP"
            self.speed_kmh = 0.0
            self.arduino.send_emergency_stop()
            logger.warning("HARD EMERGENCY BRAKE ENGAGED VIA SERVER KILL-SWITCH!")

        elif cmd == "RESUME_OPERATION":
            if self.status == "EMERGENCY_STOP":
                self.status = "AVAILABLE"
                self.arduino.send_resume()
                logger.info("Emergency brake released. Status reset to AVAILABLE.")

        elif cmd == "ABORT_MISSION":
            self.status = "AVAILABLE"
            self.active_ride_id = None
            self.navigator.clear()
            self.arduino.send_drive_command(0, 0)
            logger.info("Mission aborted.")

    async def control_loop(self):
        """10 Hz High-Frequency Autonomous Loop."""
        logger.info("Autonomous Real-Time Control Loop started.")

        while True:
            t0 = time.time()

            # 1. Read Arduino Uno sensors (HC-SR04 ultrasonic distance & state)
            arduino_state = self.arduino.poll_telemetry()
            ultrasonic_dist_cm = arduino_state.get("dist_front", 999.0)

            # 2. Read Intel RealSense L515 LiDAR scan
            lidar_scan = self.lidar.get_lidar_scan()

            # 3. Read USB Camera 1 optical frame
            cam_data = self.usb_cam.process_frame()

            # 4. Multi-Sensor Fusion (LiDAR + Camera + Ultrasonic)
            safety = self.fusion.fuse(lidar_scan, cam_data, ultrasonic_dist_cm)
            action = safety["action"]
            obstacle_detected = safety["obstacle_detected"]
            closest_dist_cm = safety["distance_cm"]

            # 5. Motion Planning & Actuation
            if self.status == "EMERGENCY_STOP" or arduino_state.get("estop", False):
                self.speed_kmh = 0.0
                self.arduino.send_drive_command(0, 0)

            elif action == "EMERGENCY_BRAKE":
                self.speed_kmh = 0.0
                self.arduino.send_emergency_stop()
                logger.warning(f"EMERGENCY BRAKE ENGAGED: Obstacle at {closest_dist_cm:.1f} cm ({safety['closest_sensor']})")

            elif self.status in ["ARRIVING", "IN_TRANSIT"]:
                if self.navigator.has_active_route():
                    target = self.navigator.current_target()
                    if target:
                        # Compute bearing angle
                        target_bearing = calculate_bearing(self.current_lat, self.current_lng, target[0], target[1])
                        
                        # Heading correction
                        angle_diff = (target_bearing - self.current_heading + 180) % 360 - 180
                        turn_rate = max(-15.0, min(15.0, angle_diff * 0.4))
                        self.current_heading = (self.current_heading + turn_rate) % 360

                        # Cruise speed scaled by sensor safety factor
                        base_speed = 28.0 # km/h
                        effective_speed = base_speed * safety["speed_multiplier"]
                        self.speed_kmh = effective_speed

                        # Move vehicle along heading
                        dist_step_km = (self.speed_kmh / 3600.0) * 0.1
                        rad_h = math.radians(self.current_heading)
                        self.current_lat += (dist_step_km / 111.0) * math.cos(rad_h)
                        self.current_lng += (dist_step_km / (111.0 * math.cos(math.radians(self.current_lat)))) * math.sin(rad_h)

                        # Translate to Arduino Uno 2-motor differential commands
                        throttle = int((self.speed_kmh / base_speed) * 200) # PWM 0-200
                        steering = int(max(-100, min(100, angle_diff * 1.5 + safety["steer_bias"])))
                        self.arduino.send_drive_command(throttle, steering)

                        # Check arrival at waypoint
                        dist_to_wp = haversine_km(self.current_lat, self.current_lng, target[0], target[1])
                        if dist_to_wp <= 0.0003:
                            self.navigator.current_idx += 1
                            if self.navigator.is_route_completed():
                                self.speed_kmh = 0.0
                                self.arduino.send_drive_command(0, 0)
                                if self.status == "ARRIVING":
                                    self.status = "WAITING"
                                    logger.info("ARRIVED AT PASSENGER PICKUP! Status: WAITING.")
                                elif self.status == "IN_TRANSIT":
                                    self.status = "RIDE_COMPLETED"
                                    logger.info("ARRIVED AT DESTINATION! Ride completed safely.")
                else:
                    self.speed_kmh = 0.0
                    self.arduino.send_drive_command(0, 0)
            else:
                self.speed_kmh = 0.0
                self.arduino.send_drive_command(0, 0)

            # Battery discharge calculation
            if self.speed_kmh > 0:
                self.battery_percent = max(10.0, round(self.battery_percent - 0.001, 3))

            # 6. Stream Telemetry to DriveAI Web Platform
            telemetry_packet = {
                "type": "TELEMETRY",
                "taxi_code": self.taxi_code,
                "lat": round(self.current_lat, 6),
                "lng": round(self.current_lng, 6),
                "heading": round(self.current_heading, 1),
                "speed_kmh": round(self.speed_kmh, 1),
                "battery_percent": round(self.battery_percent, 1),
                "front_obstacle_cm": round(closest_dist_cm, 1),
                "obstacle_detected": obstacle_detected,
                "status": self.status,
                "active_ride_id": self.active_ride_id,
                "emergency_stop": (self.status == "EMERGENCY_STOP"),
                "sensors": {
                    "lidar_l515_online": lidar_scan["hardware_online"],
                    "usb_cam_online": cam_data["camera_online"],
                    "arduino_uno_online": self.arduino.is_connected
                }
            }
            await self.telemetry.send_telemetry(telemetry_packet)

            dt = time.time() - t0
            await asyncio.sleep(max(0.01, 0.1 - dt))

    async def run(self):
        await asyncio.gather(
            self.telemetry.connect_and_listen(),
            self.control_loop()
        )

if __name__ == "__main__":
    agent = AutonomousVehicleUnoL515(serial_port="/dev/ttyACM0")
    try:
        asyncio.run(agent.run())
    except KeyboardInterrupt:
        logger.info("Vehicle Agent stopped.")
