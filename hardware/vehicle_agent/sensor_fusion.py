import logging

logger = logging.getLogger("driveai.fusion")

class MultiSensorFusion:
    """
    Sensor Fusion Engine combining:
      1. Intel RealSense L515 LiDAR Depth Scanner
      2. USB Camera 1 Optical Edge / Lane Detector
      3. Arduino Uno HC-SR04 Ultrasonic Distance Sensor
      
    Adopts Automotive Fail-Safe Architecture:
    The most restrictive safety condition from ANY sensor immediately dominates!
    """
    def __init__(self):
        self.EMERGENCY_BRAKE_THRESHOLD_CM = 28.0
        self.SLOWDOWN_THRESHOLD_CM        = 90.0

    def fuse(self, lidar_data: dict, usb_cam_data: dict, ultrasonic_dist_cm: float) -> dict:
        """
        Combines sensor inputs and produces a single unified steering & throttle action.
        """
        lidar_dist_cm = lidar_data.get("min_distance_cm", 999.0)
        lidar_risk    = lidar_data.get("risk_level", "SAFE")
        lidar_zone    = lidar_data.get("obstacle_zone", "CLEAR")

        cam_obstacle  = usb_cam_data.get("visual_obstacle", False)
        
        # Effective closest distance across all perception sensors
        effective_min_cm = min(lidar_dist_cm, ultrasonic_dist_cm)

        # 1. Tier 1: Emergency Hard Brake Evaluation (< 28 cm)
        if effective_min_cm < self.EMERGENCY_BRAKE_THRESHOLD_CM or lidar_risk == "EMERGENCY_BRAKE":
            return {
                "action": "EMERGENCY_BRAKE",
                "obstacle_detected": True,
                "closest_sensor": "ULTRASONIC" if ultrasonic_dist_cm < lidar_dist_cm else "L515_LIDAR",
                "distance_cm": round(effective_min_cm, 1),
                "speed_multiplier": 0.0,
                "steer_bias": 0,
                "reason": f"Hazard breach at {effective_min_cm:.1f} cm! Full stop engaged."
            }

        # 2. Tier 2: Proximity Slowdown & Intelligent Evasion (28 cm - 90 cm)
        elif effective_min_cm < self.SLOWDOWN_THRESHOLD_CM or lidar_risk == "SLOWDOWN" or cam_obstacle:
            # Determine evasive steering direction based on L515 spatial sector:
            # If obstacle is CENTER or LEFT -> steer slightly RIGHT (+35)
            # If obstacle is RIGHT -> steer slightly LEFT (-35)
            steer_bias = 0
            if lidar_zone in ["CENTER", "LEFT"]:
                steer_bias = 35 # Steer right
            elif lidar_zone == "RIGHT":
                steer_bias = -35 # Steer left

            # Calculate gradual deceleration factor
            decel_factor = max(0.25, (effective_min_cm - self.EMERGENCY_BRAKE_THRESHOLD_CM) / (self.SLOWDOWN_THRESHOLD_CM - self.EMERGENCY_BRAKE_THRESHOLD_CM))

            return {
                "action": "SLOWDOWN",
                "obstacle_detected": True,
                "closest_sensor": "L515_LIDAR" if lidar_dist_cm <= ultrasonic_dist_cm else "ULTRASONIC",
                "distance_cm": round(effective_min_cm, 1),
                "speed_multiplier": round(decel_factor, 2),
                "steer_bias": steer_bias,
                "reason": f"Obstacle approaching ({lidar_zone} sector). Speed scaled by {int(decel_factor*100)}%."
            }

        # 3. Tier 3: All Sensors Clear
        else:
            return {
                "action": "SAFE",
                "obstacle_detected": False,
                "closest_sensor": "NONE",
                "distance_cm": round(effective_min_cm, 1),
                "speed_multiplier": 1.0,
                "steer_bias": 0,
                "reason": "All perception corridors clear."
            }
