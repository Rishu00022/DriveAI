# DriveAI - Autonomous Self-Driving Taxi Bill of Materials (BOM)

| Item | Component | Specification | Quantity | Primary Purpose |
| :--- | :--- | :--- | :--- | :--- |
| **1** | **NVIDIA Jetson Nano** (or Jetson Orin Nano / Raspberry Pi 4/5) | 4GB RAM, Quad-Core ARM A57, 128 Maxwell GPU cores | 1 | High-level autonomous navigation, path planning, OpenCV vision, WebSocket client |
| **2** | **ESP32 DevKit V1** (or Arduino Mega 2560) | 32-bit Dual Core 240MHz, 36 GPIOs, Hardware PWM, Timers | 1 | Real-time motor speed control, ultrasonic collision detection, safety watchdog |
| **3** | **L298N Dual H-Bridge Motor Driver** (or TB6612FNG) | Dual channel, 2A peak per bridge, 5V-35V input | 1 | Drives 4x DC motors with forward/backward directional control |
| **4** | **Geared DC Motors with Wheels** | 12V 100-300 RPM High Torque DC Motors with 65mm rubber wheels | 4 | Robot chassis propulsion and differential steering |
| **5** | **Ultrasonic Distance Sensor** | HC-SR04 (2cm – 400cm range, 3mm accuracy) | 1-3 | Front/Side obstacle detection and emergency hardware brake |
| **6** | **Wide-Angle USB Camera** or **Sony IMX219 CSI** | 1080p @ 30fps / 720p @ 60fps, 120-160° FOV | 1 | Computer vision lane keeping, visual obstacle identification |
| **7** | **GPS Module** (Optional for outdoors) | u-blox NEO-6M / NEO-M8N with ceramic active antenna | 1 | Outdoor real-world coordinates and velocity tracking |
| **8** | **3S LiPo Battery** | 11.1V – 12V, 2200mAh – 5000mAh, 25C XT60 connector | 1 | Primary mobile vehicle power source |
| **9** | **Step-Down DC-DC Buck Converters** | LM2596 / XL4015 (Output 5V @ 3A-5A) | 2 | Clean 5V regulation for Jetson Nano and ESP32 |
| **10** | **Emergency Stop Push Button** | Red latching mushroom pushbutton switch | 1 | Physical hard safety emergency stop cutoff |
| **11** | **Robot Chassis Frame** | 4WD Aluminum / Acrylic double-deck robotic chassis | 1 | Mechanical structural frame for mounting all components |
| **12** | **Resistors & Jumper Wires** | 1kΩ, 2kΩ resistors (for 5V->3.3V logic shift), Dupont cables | 1 pack | Circuit breadboard / solder wiring |
