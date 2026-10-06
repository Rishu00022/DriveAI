import time
import json
import logging

logger = logging.getLogger("driveai.hw_bridge")

class HardwareBridge:
    """
    Serial UART bridge between Jetson Nano and ESP32 motor/safety microcontroller.
    Supports real PySerial connection, with fallback simulation mode.
    """
    def __init__(self, port: str = "/dev/ttyUSB0", baud: int = 115200):
        self.port = port
        self.baud = baud
        self.serial_conn = None
        self.is_connected = False
        
        # Internal sensor state
        self.front_dist_cm: float = 999.0
        self.hardware_estop: bool = False
        self.throttle: int = 0
        self.steering: int = 0

        self._init_connection()

    def _init_connection(self):
        try:
            import serial
            self.serial_conn = serial.Serial(self.port, self.baud, timeout=0.1)
            self.is_connected = True
            logger.info(f"Hardware Bridge connected to ESP32 on {self.port} at {self.baud} baud.")
        except Exception as e:
            self.is_connected = False
            logger.warning(f"Could not open serial port {self.port} ({e}). Operating in SITL / Simulated Hardware Mode.")

    def send_drive_command(self, throttle: int, steering: int):
        self.throttle = throttle
        self.steering = steering
        cmd = f"DRIVE,{throttle},{steering}\n"
        if self.is_connected and self.serial_conn:
            try:
                self.serial_conn.write(cmd.encode('utf-8'))
            except Exception as e:
                logger.error(f"Failed to write to serial: {e}")

    def send_emergency_stop(self):
        self.hardware_estop = True
        self.throttle = 0
        self.steering = 0
        cmd = "ESTOP\n"
        if self.is_connected and self.serial_conn:
            try:
                self.serial_conn.write(cmd.encode('utf-8'))
            except Exception as e:
                logger.error(f"Failed to send ESTOP to serial: {e}")

    def send_resume(self):
        self.hardware_estop = False
        cmd = "RESUME\n"
        if self.is_connected and self.serial_conn:
            try:
                self.serial_conn.write(cmd.encode('utf-8'))
            except Exception as e:
                logger.error(f"Failed to send RESUME to serial: {e}")

    def poll_telemetry(self) -> dict:
        """Reads latest distance and status from ESP32."""
        if self.is_connected and self.serial_conn:
            try:
                while self.serial_conn.in_waiting:
                    line = self.serial_conn.readline().decode('utf-8', errors='ignore').strip()
                    if line.startswith("{") and "telemetry" in line:
                        data = json.loads(line).get("telemetry", {})
                        self.front_dist_cm = float(data.get("dist_front", 999.0))
                        self.hardware_estop = bool(data.get("estop", False))
            except Exception as e:
                logger.debug(f"Serial read error: {e}")

        return {
            "dist_front": self.front_dist_cm,
            "estop": self.hardware_estop,
            "throttle": self.throttle,
            "steering": self.steering
        }
