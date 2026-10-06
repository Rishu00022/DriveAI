# DriveAI: Arduino Uno + Intel RealSense L515 + Jetson Nano Complete Hardware Guide

This guide details the complete hardware wiring, pin assignments, software installation, and step-by-step configuration for your autonomous robotic taxi using:
- **Arduino Uno** (Low-level 2-motor controller & ultrasonic safety interrupt)
- **Intel RealSense LiDAR Camera L515** (High-resolution solid-state LiDAR depth scanner)
- **NVIDIA Jetson Nano** (Edge computing brain & autonomous navigation)
- **USB Camera 1** (RGB optical road/lane detection)
- **HC-SR04 Ultrasonic Distance Sensor** (Front bumper collision radar)
- **2x Geared DC Motors with L298N Driver** (Differential steering propulsion)

---

## 1. System Interconnection Architecture

```
                                  +------------------------------------+
                                  |    11.1V - 12V LiPo 3S Battery     |
                                  +--------+------------------+--------+
                                           |                  |
                                     (12V Direct)       (Step-Down Buck)
                                           |              (5.1V @ 4A DC)
                                           v                  |
                                  +-----------------+         v
                                  |   L298N Dual    |  +--------------------+
                                  |  Motor Driver   |  | NVIDIA Jetson Nano |
                                  +---+---------+---+  |   (Edge Computer)  |
                                      |         |      +---+-----+-----+----+
                        +-------------+         |          |     |     |
                        |                       |          |     |     |
                        v                       v          |     |     |
                 +--------------+       +--------------+   |     |     |
                 | Motor 1 (L)  |       | Motor 2 (R)  |   |     |     |
                 |  Left Wheel  |       | Right Wheel  |   |     |     |
                 +--------------+       +--------------+   |     |     |
                                                           |     |     |
               +-------------------------------------------+     |     |
               | USB 3.0 Type-C                                  |     |
               v                                                 |     |
   +-----------------------+                                     |     |
   | Intel RealSense L515  | (LiDAR Depth Stream)                |     |
   +-----------------------+                                     |     |
                                                                 |     |
               +-------------------------------------------------+     |
               | USB Port 2                                            |
               v                                                       |
   +-----------------------+                                           |
   |     USB Camera 1      | (RGB Video Stream)                        |
   +-----------------------+                                           |
                                                                       |
               +-------------------------------------------------------+
               | USB Type-B to Type-A (/dev/ttyACM0 @ 115200 Baud)
               v
      +-----------------+
      |   Arduino Uno   | <== Powered by Jetson USB Cable (5V)
      +---+---------+---+
          |         |
          |         | (Digital & PWM Control Wires)
          |         v
          |   +-------------------+
          |   | L298N Logic Pins  | (ENA, IN1, IN2, IN3, IN4, ENB)
          |   +-------------------+
          |
          | (5V, TRIG, ECHO, GND)
          v
   +-----------------------+
   |   Ultrasonic HC-SR04  | (Front Collision Radar)
   +-----------------------+
```

---

## 2. Pin-by-Pin Hardware Wiring Table

### A. Arduino Uno to L298N Motor Driver
| Arduino Uno Pin | L298N Pin | Function | Notes |
| :--- | :--- | :--- | :--- |
| **Pin ~5** (PWM) | `ENA` | Left Motor (Motor 1) Speed Control | Remove jumper on ENA |
| **Pin 7** (Digital) | `IN1` | Left Motor Direction A | |
| **Pin 8** (Digital) | `IN2` | Left Motor Direction B | |
| **Pin ~6** (PWM) | `ENB` | Right Motor (Motor 2) Speed Control | Remove jumper on ENB |
| **Pin 4** (Digital) | `IN3` | Right Motor Direction A | |
| **Pin 2** (Digital) | `IN4` | Right Motor Direction B | |
| **GND** | `GND` | Common Ground Reference | **Must be connected to L298N GND** |

### B. L298N to 2 DC Motors
| L298N Output Terminal | Connected Motor | Description |
| :--- | :--- | :--- |
| `OUT1` & `OUT2` | **Motor 1 (Left DC Motor)** | Left chassis wheel propulsion |
| `OUT3` & `OUT4` | **Motor 2 (Right DC Motor)** | Right chassis wheel propulsion |

### C. Arduino Uno to HC-SR04 Ultrasonic Distance Sensor
| HC-SR04 Pin | Arduino Uno Pin | Description |
| :--- | :--- | :--- |
| `VCC` | `5V` | Powered directly from Arduino 5V pin |
| `TRIG` | **Pin 12** | Digital trigger pulse from Arduino |
| `ECHO` | **Pin 11** | Digital echo return (5V native to Uno) |
| `GND` | `GND` | Ground reference |

> [!NOTE]
> Unlike 3.3V microcontrollers (such as ESP32 or Raspberry Pi), the **Arduino Uno operates at native 5V logic**. Therefore, the HC-SR04 `ECHO` pin can be connected **directly to Pin 11 without any voltage divider resistors!**

### D. Safety LEDs (Optional but Recommended)
| Component | Arduino Uno Pin | Description |
| :--- | :--- | :--- |
| Blue Status LED | `Pin 13` | Built-in LED (flashes during heartbeat) |
| Red E-Stop LED | `Pin 3` | Lights up during Emergency Brake or obstacle breach (<25cm) |

---

## 3. NVIDIA Jetson Nano USB Port Connections

The Jetson Nano has 4 USB 3.0 Type-A ports. Connect devices as follows:

| Jetson Nano USB Port | Connected Device | Purpose & Bandwidth |
| :--- | :--- | :--- |
| **USB Port 1 (Top-Left - Blue)** | **Intel RealSense LiDAR L515** | Plug using high-quality USB 3.1 Type-C cable. Requires USB 3.0 high speed for LiDAR point cloud! |
| **USB Port 2 (Bottom-Left)** | **USB Camera 1** | Standard USB webcam for RGB lane & optical obstacle detection |
| **USB Port 3 (Top-Right)** | **Arduino Uno** | Standard USB Type-A to Type-B cable (`/dev/ttyACM0`). Provides data & powers the Uno! |
| **USB Port 4 (Bottom-Right)** | Keyboard / Wi-Fi Dongle | Wireless network dongle or maintenance keyboard |

---

## 4. Power Distribution & Safety Guidelines

> [!CAUTION]
> **COMMON GROUND RULE**: Connect the `GND` of the 12V LiPo Battery and the `GND` of the L298N Motor Driver together with the Arduino Uno `GND`. Without a common ground reference, serial signals will corrupt and motor PWM will jitter!

1. **Jetson Nano Power**:
   - Power the Jetson Nano via the **Barrel Jack (5.5mm x 2.1mm, J28)** using a DC-DC Buck Converter set to **5.1V @ 4A**.
   - Place a jumper across **J48 pins** on the Jetson Nano to enable Barrel Jack power mode (instead of Micro-USB).
2. **Motor Power**:
   - Connect the **12V LiPo Battery (+)** to the `12V IN` terminal on the L298N.
   - Connect the **LiPo Battery (-)** to the `GND` terminal on the L298N.
   - Leave the L298N 5V regulator jumper installed if running under 12V.

---

## 5. Step-by-Step Software Installation

### Step 1: Flash Firmware to Arduino Uno
1. Connect the Arduino Uno to your laptop via USB cable.
2. Open **Arduino IDE**.
3. Under **Tools > Board**, select **Arduino Uno**.
4. Under **Tools > Port**, select the port corresponding to the Uno (`/dev/ttyACM0` on Linux, `COM3` on Windows, or `/dev/cu.usbmodem...` on Mac).
5. Open the firmware file:
   ```
   hardware/firmware/arduino_uno/arduino_uno_firmware.ino
   ```
6. Click **Upload**.
7. Open **Serial Monitor** at **115200 Baud**. You will see:
   ```json
   {"status":"ARDUINO_UNO_BOOT_OK","hardware":"ArduinoUno-2Motor-HCSR04","version":"1.0.0"}
   ```

---

### Step 2: Configure Intel RealSense L515 on Jetson Nano

Log in to the Jetson Nano terminal and run:

1. **Register the Intel RealSense Public Key and Repository**:
   ```bash
   sudo apt-key adv --keyserver keyserver.ubuntu.com --recv-key F6E65AC044F831AC80A06380C8B3A55A6F3EFCDE || sudo apt-key adv --keyserver hkp://keyserver.ubuntu.com:80 --recv-key F6E65AC044F831AC80A06380C8B3A55A6F3EFCDE
   sudo add-apt-repository "deb https://librealsense.intel.com/Debian/apt-repo $(lsb_release -cs) main" -u
   ```

2. **Install librealsense2 libraries & development tools**:
   ```bash
   sudo apt-get update
   sudo apt-get install -y librealsense2-utils librealsense2-dev
   ```

3. **Install RealSense Python Wrapper (pyrealsense2)**:
   ```bash
   pip3 install pyrealsense2
   ```

4. **Verify L515 is Detected**:
   Plug in the L515 to the Blue USB 3.0 port and test:
   ```bash
   rs-enumerate-devices
   ```
   You should see:
   ```
   Device Name: Intel RealSense L515
   Serial Number: ...
   Firmware Version: ...
   Recommended USB: 3.2 Gen 1
   ```

---

### Step 3: Configure Jetson Nano Serial Permissions

Grant your user access to the USB serial device (`/dev/ttyACM0`):
```bash
sudo usermod -a -G dialout $USER
```
Apply rules:
```bash
sudo udevadm control --reload-rules && sudo udevadm trigger
```

---

### Step 4: Run the Jetson Nano Autonomous Agent

1. Clone or navigate to the DriveAI directory on the Jetson:
   ```bash
   cd DriveAI
   source venv/bin/activate
   ```

2. Set vehicle environment variables:
   ```bash
   export TAXI_ID=1
   export TAXI_CODE="ROBO-01"
   export BACKEND_HOST="192.168.1.100:8000" # Replace with your server IP
   ```

3. Start the agent:
   ```bash
   python3 hardware/vehicle_agent/vehicle_agent_uno_l515.py
   ```

---

## 6. End-to-End Verification Checklist

| Test Step | Action | Expected Result | Pass? |
| :--- | :--- | :--- | :--- |
| **1. Motor Direction** | Run script; command `DRIVE,100,0` | Both Left & Right wheels spin forward | [ ] |
| **2. Differential Turn** | Command `DRIVE,100,50` | Left wheel spins faster than Right wheel (turns right) | [ ] |
| **3. RealSense L515 Depth** | Stand 1.5m in front of L515 | Terminal logs `min_distance_m: 1.50`, risk `SAFE` | [ ] |
| **4. LiDAR Braking** | Place box 20cm in front of L515 | Wheels stop instantly; logs `EMERGENCY_BRAKE` | [ ] |
| **5. Ultrasonic Cutoff** | Place hand 15cm from HC-SR04 | Arduino Uno hardware interrupt stops wheels within 20ms | [ ] |
| **6. Watchdog Fail-Safe** | Unplug USB cable from Jetson | Arduino Uno cuts motor PWM within 800ms | [ ] |
| **7. Web App Dispatch** | Book ride on web app `http://localhost:5173` | Robot drives autonomously towards pickup point | [ ] |
