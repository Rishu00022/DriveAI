import os

class VehicleConfig:
    TAXI_ID: int = int(os.getenv("TAXI_ID", "1"))
    TAXI_CODE: str = os.getenv("TAXI_CODE", "ROBO-01")
    BACKEND_HOST: str = os.getenv("BACKEND_HOST", "localhost:8000")
    
    @property
    def WS_URL(self) -> str:
        return f"ws://{self.BACKEND_HOST}/ws/taxi/{self.TAXI_ID}"
    
    @property
    def REST_URL(self) -> str:
        return f"http://{self.BACKEND_HOST}/api"

    # Hardware Serial Port (ESP32 connection on Jetson Nano)
    SERIAL_PORT: str = os.getenv("SERIAL_PORT", "/dev/ttyUSB0")
    BAUD_RATE: int = 115200

    # Camera Configuration
    CAMERA_INDEX: int = int(os.getenv("CAMERA_INDEX", "0"))
    VISION_ENABLED: bool = os.getenv("VISION_ENABLED", "True").lower() == "true"

    # Autonomous Driving Parameters
    CRUISE_SPEED_KMH: float = 28.0
    WAYPOINT_ARRIVAL_RADIUS_KM: float = 0.0003 # ~30 meters in lat/lng units
    MAX_THROTTLE: int = 200 # ESP32 PWM (0-255)
    STEER_KP: float = 1.5   # Proportional gain for steering controller

    # Safety
    MIN_BRAKE_DISTANCE_CM: float = 30.0
    MIN_SLOWDOWN_DISTANCE_CM: float = 75.0

config = VehicleConfig()
