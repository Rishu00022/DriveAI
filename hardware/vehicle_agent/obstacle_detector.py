import time
import logging
import numpy as np

logger = logging.getLogger("driveai.vision")

try:
    import cv2
    OPENCV_AVAILABLE = True
except ImportError:
    OPENCV_AVAILABLE = False

class ObstacleDetector:
    """
    Sensor fusion module combining Camera Computer Vision & Ultrasonic Sensor data.
    """
    def __init__(self, camera_idx: int = 0, enable_vision: bool = True):
        self.enable_vision = enable_vision and OPENCV_AVAILABLE
        self.cap = None
        self.last_detection_time = 0
        self.synthetic_obstacle_active = False

        if self.enable_vision:
            try:
                # Attempt to open hardware camera
                self.cap = cv2.VideoCapture(camera_idx)
                if not self.cap.isOpened():
                    logger.info("Physical camera not found on index. Using synthetic perception stream.")
                    self.cap = None
            except Exception as e:
                logger.warning(f"OpenCV camera init exception: {e}")
                self.cap = None

    def trigger_simulated_obstacle(self, active: bool = True):
        """Allows injecting an obstacle event for testing/simulation."""
        self.synthetic_obstacle_active = active

    def detect(self, ultrasonic_distance_cm: float) -> dict:
        """
        Fuses vision and ultrasonic readings.
        Returns:
            {
               "obstacle_detected": bool,
               "distance_cm": float,
               "action": "SAFE" | "SLOWDOWN" | "EMERGENCY_BRAKE"
            }
        """
        vision_obstacle_detected = False
        vision_confidence = 0.0

        if self.synthetic_obstacle_active:
            ultrasonic_distance_cm = min(ultrasonic_distance_cm, 22.0)
            vision_obstacle_detected = True

        # Process OpenCV Camera Feed if available
        if self.cap and self.cap.isOpened():
            ret, frame = self.cap.read()
            if ret and frame is not None:
                # Downsample for high-speed Jetson Nano performance
                small_frame = cv2.resize(frame, (320, 240))
                # Focus on lower half (region of interest for roadway)
                roi = small_frame[120:240, :]
                gray = cv2.cvtColor(roi, cv2.COLOR_BGR2GRAY)
                blurred = cv2.GaussianBlur(gray, (5, 5), 0)
                edges = cv2.Canny(blurred, 50, 150)
                
                # Check pixel density of edges in center driving corridor
                center_corridor = edges[:, 80:240]
                edge_count = np.count_nonzero(center_corridor)
                if edge_count > 1200: # Threshold for large object in front corridor
                    vision_obstacle_detected = True
                    vision_confidence = 0.85

        # Sensor Fusion Decision Logic:
        # Distance thresholds:
        # < 30 cm -> Emergency Brake
        # 30 cm - 75 cm -> Slowdown
        # > 75 cm -> Safe
        effective_dist = ultrasonic_distance_cm

        if effective_dist < 30.0:
            return {
                "obstacle_detected": True,
                "distance_cm": round(effective_dist, 1),
                "action": "EMERGENCY_BRAKE",
                "reason": "Ultrasonic threshold breached (< 30cm)"
            }
        elif effective_dist < 75.0 or vision_obstacle_detected:
            return {
                "obstacle_detected": True,
                "distance_cm": round(effective_dist, 1),
                "action": "SLOWDOWN",
                "reason": "Vehicle / obstacle approaching path"
            }
        else:
            return {
                "obstacle_detected": False,
                "distance_cm": round(effective_dist, 1),
                "action": "SAFE",
                "reason": "Path clear"
            }

    def cleanup(self):
        if self.cap and self.cap.isOpened():
            self.cap.release()
