# DriveAI - Physical Hardware Assembly & Setup Guide

This guide walks you through building, flashing, wiring, and calibrating your physical autonomous robotic taxi prototype.

---

## 1. Mechanical Assembly

1. **Mount Motors & Wheels**:
   - Secure the 4x geared DC motors to the lower deck of the aluminum/acrylic robot chassis using motor brackets and M3 screws.
   - Attach rubber wheels to the D-shaft of each motor.
2. **Mount Microcontrollers & Drivers**:
   - Install the **L298N motor driver** on the lower chassis plate close to the motors to minimize high-current wire lengths.
   - Mount the **ESP32 microcontroller** on a prototype breadboard or standoff on the upper deck.
   - Mount the **NVIDIA Jetson Nano** with standoffs to ensure adequate heatsink airflow.
3. **Mount Sensors & Cameras**:
   - Affix the **HC-SR04 ultrasonic sensor** directly on the front bumper facing straight ahead.
   - Mount the **USB or CSI Camera** 10-15 cm above the chassis facing forward with a slight 10° downward tilt to capture the road corridor.

---

## 2. Flashing ESP32 Firmware

### Using Arduino IDE
1. Open Arduino IDE and install the **ESP32 by Espressif Systems** board package in Board Manager.
2. Open `hardware/firmware/esp32_firmware.ino`.
3. Under **Tools > Board**, select **ESP32 Dev Module**.
4. Set **Upload Speed** to `921600`.
5. Connect your ESP32 via Micro-USB to your computer.
6. Click **Upload**.
7. Open Serial Monitor at **115200 baud** to verify boot message:
   ```json
   {"status":"ESP32_BOOT_OK","version":"DriveAI-ESP32-v2.0"}
   ```

---

## 3. Configuring the NVIDIA Jetson Nano

### A. OS & System Requirements
- Flash **NVIDIA JetPack 4.6.1+** to a high-speed MicroSD card (64GB Class 10 U3 recommended).
- Boot the Jetson Nano and ensure Wi-Fi or Ethernet connectivity is active.

### B. Grant Serial Port Permissions
Grant the default user access to UART serial devices:
```bash
sudo usermod -a -G dialout $USER
```
Reboot or log out and back in for changes to take effect.

### C. Install Jetson Python Environment
Clone this repository on your Jetson Nano and set up dependencies:
```bash
cd DriveAI/hardware/vehicle_agent
python3 -m venv venv
source venv/bin/activate
pip install pyserial websockets opencv-python numpy
```

### D. Configure Vehicle Parameters
Edit `hardware/vehicle_agent/config.py` or set environment variables:
```bash
export TAXI_ID=1
export TAXI_CODE="ROBO-01"
export BACKEND_HOST="192.168.1.100:8000" # Replace with your backend server IP
export SERIAL_PORT="/dev/ttyUSB0"        # Or /dev/ttyTHS1 for J41 pins
```

---

## 4. Bench Testing & Calibration Checklist

Before putting the robotic car on the floor, perform the following bench test:

1. **Bench Test (Wheels Off Ground)**:
   - Place the robot on a stand so the wheels can spin freely.
   - Power on the 12V LiPo battery.
   - Run the vehicle agent:
     ```bash
     python3 hardware/vehicle_agent/vehicle_agent.py
     ```
   - Verify connection to the DriveAI backend server over WebSocket.
2. **Ultrasonic Safety Cutoff Test**:
   - While wheels are turning, hold an obstacle (your hand or a book) **20 cm in front of the HC-SR04**.
   - **Verification**: The ESP32 must halt the wheels within 50ms, the red LED must illuminate, and the terminal should log `OBSTACLE_HARD_STOP`.
   - Remove your hand: wheels should resume normal operation.
3. **Web Emergency Stop Test**:
   - In the DriveAI web interface, click the red **EMERGENCY BRAKE** button.
   - **Verification**: The vehicle must halt immediately, and status should switch to `EMERGENCY_STOP`.
4. **End-to-End Live Ride**:
   - Place the robot car on the floor.
   - Open the web app on your phone or laptop.
   - Select a pickup point and destination.
   - Click **Book Self-Driving Taxi**.
   - Watch the robot navigate autonomously along the path!
