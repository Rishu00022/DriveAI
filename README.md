# DriveAI — Autonomous Self-Driving Robotic Taxi System

An end-to-end, production-grade **Autonomous Robotic Taxi Platform** that integrates a physical robotic vehicle with a web-based ride-booking and fleet operations platform (similar to **Waymo, Cruise, Uber, and Ola**).

Instead of dispatching a human driver, DriveAI communicates directly with an **onboard autonomous vehicle computer (NVIDIA Jetson Nano)** and a **low-level real-time safety microcontroller (ESP32 / Arduino)** over high-speed bidirectional WebSockets, executing autonomous waypoint navigation, obstacle detection, collision braking, and real-time live telemetry tracking.

---

## 🌟 Key Features

### 1. Self-Driving Taxi Hardware & Robotics
- **Dual-Processor Architecture**:
  - **NVIDIA Jetson Nano** (Edge Computer): High-level waypoint navigation, Pure Pursuit steering, OpenCV computer vision obstacle detection, and WebSocket telemetry bridge.
  - **ESP32 DevKit** (Real-Time Microcontroller): Dual H-Bridge motor PWM control, hardware watchdog timer (800ms fail-safe), ultrasonic rangefinder interrupt (< 25cm hard brake), and physical emergency stop switch.
- **Sensor Fusion Safety**: Fuses OpenCV camera corridor analysis with HC-SR04 ultrasonic rangefinding. Automatically executes emergency stop when obstacles breach 25 cm, and scales vehicle cruise speed down when obstacles approach within 60 cm.
- **Fail-Safe Mechanism**: Dedicated hardware watchdog immediately cuts motor power if communication from the Jetson Nano drops for more than 800ms.

### 2. Passenger Ride-Booking Web Application
- **Modern Responsive UI**: Cyberpunk/autonomous dark aesthetic built with React, Vite, Tailwind CSS, Lucide Icons, and Leaflet Maps.
- **Ride Booking**: Select pickup and destination points via interactive map or quick presets.
- **Live Fare & ETA Estimation**: Real-time calculation of distance, travel time, and transparent fare breakdown (Base Fare + Rate per km + Autonomous Service Fee).
- **Interactive Live Map Tracking**: Watch your assigned robotic taxi approach your pickup point and cruise along interpolated road waypoints with animated compass heading rotation.
- **Real-Time Telemetry HUD**: Live vehicle telemetry directly on the passenger interface: linear speed (km/h), LiPo battery level (%), front obstacle radar distance (cm), and step-by-step ride status (`ASSIGNED` → `ARRIVING` → `WAITING` → `IN_TRANSIT` → `COMPLETED`).
- **Safety Controls**: Passenger Boarded confirmation ("Start Ride"), Ride Cancellation, and Instant Emergency Brake.

### 3. Fleet Operations & Admin Dashboard
- **Fleet Map Overview**: Monitor the live locations, headings, and operational states of all registered robotic taxis simultaneously.
- **Vehicle Telemetry Inspector**: Click any vehicle in the fleet to inspect real-time sensor streams, microcontroller heartbeat, speed, and battery health.
- **Remote Fleet Control**: Individual vehicle E-Stop/Resume switches, plus a **Global Fleet Kill-Switch** that halts all active vehicles across the entire network in < 100ms.
- **System & Hardware Audit Logs**: Live streaming audit log of all backend dispatches, vision detections, hardware timeouts, and safety events.

### 4. Hardware Lab & SITL Fleet Simulator
- **Software-in-the-Loop (SITL) Multi-Vehicle Simulator**: Test the entire platform out of the box with 4 virtual autonomous taxis navigating realistic urban routes, responding to dispatches, draining battery, and reporting telemetry at 5 Hz.
- **Interactive Obstacle Injector**: Simulate pedestrian crossings (< 25 cm) and slow traffic (50 cm) directly from the browser testbench to verify automated safety braking without needing a physical car on day 1.

---

## 🏛️ System Architecture

```
+---------------------------------------------------------------------------------------+
|                                    PASSENGER APP & ADMIN UI                           |
|  - Modern React / Tailwind CSS / Leaflet Map                                          |
|  - Real-time GPS Tracking, Speedometer HUD, Battery Gauge, Emergency Stop Controls   |
+-------------------------------------------+-------------------------------------------+
                                            ^
                         HTTP REST & WebSocket (bi-directional)
                                            v
+---------------------------------------------------------------------------------------+
|                                  DRIVEAI BACKEND SERVER                               |
|  - High-performance FastAPI Asynchronous Server                                      |
|  - Autonomous Dispatcher & Waypoint Interpolation Engine                              |
|  - SQLite / PostgreSQL WAL Database                                                   |
|  - WebSocket Hub (/ws/taxi, /ws/passenger, /ws/admin)                                 |
+-------------------------------------------+-------------------------------------------+
                                            ^
                                     WebSocket / Wi-Fi
                                            v
+---------------------------------------------------------------------------------------+
|                           ONBOARD ROBOTIC VEHICLE COMPUTER                            |
|                                 (NVIDIA Jetson Nano)                                  |
|  - Autonomous Vehicle Agent (Python Async State Machine)                              |
|  - OpenCV Computer Vision Obstacle Detection & Sensor Fusion Pipeline                 |
|  - Pure Pursuit / GPS Waypoint Path Following Navigator                               |
|  - High-Frequency Telemetry Streamer (5-10 Hz)                                        |
+-------------------------------------------+-------------------------------------------+
                                            ^
                              High-Speed Serial UART (115200 Baud)
                                            v
+---------------------------------------------------------------------------------------+
|                             LOW-LEVEL SAFETY CONTROLLER                               |
|                                    (ESP32 DevKit)                                     |
|  - Hardware Watchdog Timer (800ms fail-safe cutoff)                                   |
|  - Ultrasonic Radar Collision Hard-Stop Interrupt (< 25cm)                            |
|  - Dual H-Bridge Motor PWM Kinematics (L298N / TB6612FNG)                             |
+-------------------------------------------+-------------------------------------------+
                                            |
                                            v
                                 [Actuators & Chassis]
                                 - 4x High-Torque Geared DC Motors
                                 - HC-SR04 Ultrasonic Sensors
                                 - Hardware Emergency Pushbutton
```

---

## 🔌 Hardware Wiring & Pinout Table

### ESP32 to L298N Motor Driver
| ESP32 GPIO Pin | L298N Pin | Function | Logic Level |
| :--- | :--- | :--- | :--- |
| **GPIO 14** | `ENA` | Left Motors PWM Speed Control (0–255) | 3.3V PWM |
| **GPIO 27** | `IN1` | Left Motor Direction Forward | 3.3V Logic |
| **GPIO 26** | `IN2` | Left Motor Direction Reverse | 3.3V Logic |
| **GPIO 25** | `IN3` | Right Motor Direction Forward | 3.3V Logic |
| **GPIO 33** | `IN4` | Right Motor Direction Reverse | 3.3V Logic |
| **GPIO 32** | `ENB` | Right Motors PWM Speed Control (0–255) | 3.3V PWM |
| **GND** | `GND` | Common Ground Reference | 0V |

### ESP32 to HC-SR04 Ultrasonic Sensor
| Sensor Pin | ESP32 Pin | Note / Circuit Protection |
| :--- | :--- | :--- |
| `VCC` | +5V Rail | 5V supply |
| `TRIG` | **GPIO 12** | 3.3V trigger pulse |
| `ECHO` | **GPIO 13** | **Voltage Divider Required!** (5V to 3.3V using 1kΩ and 2kΩ resistors) |
| `GND` | Common GND | System Ground |

---

## 📁 Repository Structure

```
DriveAI/
├── backend/                  # FastAPI Backend Server & WebSocket Hub
│   ├── app/
│   │   ├── config.py         # App configuration & settings
│   │   ├── database.py       # SQLAlchemy engine with SQLite WAL mode
│   │   ├── models.py         # ORM models (User, Taxi, Ride, TelemetryLog, SystemLog)
│   │   ├── schemas.py        # Pydantic validation schemas
│   │   ├── auth.py           # JWT auth & bcrypt password hashing
│   │   ├── dispatch.py       # Autonomous taxi allocation & route planner
│   │   ├── ws_manager.py     # Real-time WebSocket connection manager
│   │   ├── seed_data.py      # Pre-seeded users, fleet of taxis, sample logs
│   │   └── main.py           # FastAPI entrypoint, REST & WebSocket routes
│   ├── requirements.txt
│   └── run.py
├── frontend/                 # Modern React + Vite + Tailwind CSS + Leaflet UI
│   ├── index.html
│   ├── package.json
│   ├── vite.config.js
│   ├── tailwind.config.js
│   └── src/
│       ├── App.jsx           # Main App with Mode Switcher
│       ├── main.jsx
│       ├── index.css
│       ├── components/
│       │   ├── Navbar.jsx    # Top Navigation with Auth & Mode controls
│       │   ├── MapView.jsx   # Leaflet Map with rotating robotaxi markers & routes
│       │   ├── RideStatusHud.jsx # Live Telemetry HUD (Speed, Battery, Radar)
│       │   └── AuthModal.jsx # Login/Register modal with 1-click Demo credentials
│       ├── pages/
│       │   ├── PassengerApp.jsx   # Passenger ride hailing & live tracking interface
│       │   ├── AdminDashboard.jsx # Fleet management, live grid, kill-switch
│       │   └── HardwareLab.jsx    # Vehicle hardware simulator & testbench
│       └── utils/
│           └── api.js        # API & WebSocket client
├── hardware/                 # Physical Autonomous Taxi Hardware Stack
│   ├── firmware/             # Arduino / ESP32 C++ Firmware
│   │   └── esp32_firmware.ino # Low-level motor PID, Ultrasonic safety interrupt, Watchdog
│   ├── vehicle_agent/        # Jetson Nano High-Level Autonomous Agent (Python)
│   │   ├── vehicle_agent.py  # Main autonomous loop & state machine
│   │   ├── hardware_bridge.py# Serial UART communication with ESP32
│   │   ├── navigation.py     # Pure pursuit waypoint navigation & GPS math
│   │   ├── obstacle_detector.py # Vision (OpenCV) + Ultrasonic sensor fusion
│   │   ├── telemetry_client.py # WebSocket real-time link to Backend
│   │   └── config.py         # Vehicle credentials & thresholds
│   ├── simulator/            # Software-in-the-Loop (SITL) Multi-Vehicle Simulator
│   │   └── virtual_taxi.py   # Multi-vehicle simulator with physics & obstacles
│   └── schematics/           # Hardware Circuit Diagrams & Pinout Guides
│       ├── WIRING_DIAGRAM.md # Complete ASCII & Markdown pin mapping
│       └── BILL_OF_MATERIALS.md # Complete parts list with specs
├── docs/                     # Comprehensive Architecture, API & Protocol Specs
│   ├── SYSTEM_ARCHITECTURE.md
│   ├── COMMUNICATION_PROTOCOL.md
│   └── HARDWARE_SETUP_GUIDE.md
├── start_backend.sh          # Backend startup script (Port 8000)
├── start_frontend.sh         # Frontend startup script (Port 5173)
├── start_fleet_sim.sh        # Multi-vehicle simulator launcher
├── start_all.sh              # One-click startup for all services
└── README.md
```

---

## 🚀 Quick Start Guide

### Prerequisites
- **Python 3.10+**
- **Node.js 18+** & **npm**

### Option A: One-Click Launch (Recommended)

Run the unified startup script:
```bash
./start_all.sh
```

This automatically starts:
1. **Backend Server** at `http://localhost:8000` (Swagger docs at `http://localhost:8000/docs`)
2. **Autonomous Fleet Simulator (4 Taxis)** reporting real-time telemetry
3. **Web Application** at `http://localhost:5173`

---

### Option B: Step-by-Step Manual Launch

#### Step 1: Start Backend
```bash
# In project root
source venv/bin/activate
uvicorn backend.app.main:app --host 0.0.0.0 --port 8000 --reload
```

#### Step 2: Start Multi-Vehicle Fleet Simulator
```bash
# In a separate terminal
source venv/bin/activate
python3 hardware/simulator/virtual_taxi.py
```

#### Step 3: Start Web Application
```bash
# In a separate terminal
cd frontend
npm run dev
```

Open your browser at **`http://localhost:5173`**.

---

## 🧪 Testing the Autonomous Taxi Workflow

1. **Sign In**:
   - Click **Sign In** in the top-right corner.
   - Click **Demo Passenger** (pre-fills `passenger@driveai.com` / `pass123`) or **Demo Fleet Admin**.
2. **Book a Self-Driving Taxi**:
   - In the **Passenger App**, select a Pickup and Destination location.
   - Choose vehicle tier (**RoboSedan** or **CyberPod VIP**).
   - Review estimated route distance, travel time, and guaranteed fare.
   - Click **Confirm & Book Self-Driving Taxi**.
3. **Watch Autonomous Navigation & Telemetry**:
   - The nearest robotic taxi (e.g., `ROBO-01`) is immediately allocated.
   - Observe the taxi navigate along the road towards your pickup point.
   - Telemetry HUD updates live: speed, battery %, radar distance, heading.
4. **Board Vehicle & Start Ride**:
   - Once the taxi reaches the pickup point, status transitions to `WAITING`.
   - Click **I've Boarded: Start Autonomous Ride**.
   - The vehicle accelerates and autonomously navigates to the destination.
5. **Test Safety Braking**:
   - Switch to **Hardware Lab** tab.
   - Click **Inject Hard Obstacle (< 25 cm)** → observe instant emergency brake engagement and vehicle speed dropping to 0 km/h!
   - Click **Clear Road Ahead** → observe the vehicle resume autonomous travel.
6. **Fleet Operations Command**:
   - Switch to **Fleet Control** tab to view all vehicles, live sensor grids, and audit logs.
   - Test individual vehicle E-Stops or the global **GLOBAL KILL** switch.

---

## 🛠️ Deploying to Physical Robotic Hardware

1. Flash the ESP32 with `hardware/firmware/esp32_firmware.ino` using the Arduino IDE.
2. Wire the motor driver, ultrasonic sensor, and power buck converters according to `hardware/schematics/WIRING_DIAGRAM.md`.
3. Connect the ESP32 to the Jetson Nano via USB cable (`/dev/ttyUSB0`).
4. On the Jetson Nano, run:
   ```bash
   export TAXI_ID=1
   export TAXI_CODE="ROBO-01"
   export BACKEND_HOST="<YOUR_SERVER_IP>:8000"
   python3 hardware/vehicle_agent/vehicle_agent.py
   ```
5. The physical car will connect to the web server and accept ride requests!
