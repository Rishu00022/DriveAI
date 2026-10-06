# DriveAI - Autonomous Taxi Hardware Architecture & Wiring Guide

This document details the complete physical wiring, power distribution, and pinout connections between the **Jetson Nano**, **ESP32 Microcontroller**, **Motor Drivers**, **Sensors**, and **Power Rail**.

---

## 1. System Architecture Block Diagram

```
+--------------------------------------------------------------------------+
|                            11.1V / 12V LiPo Battery                      |
+---------------------+-------------------------------+--------------------+
                      |                               |
              [Buck Converter 1]              [Buck Converter 2]
                (5V @ 4A DC)                     (5V @ 2A DC)
                      |                               |
                      v                               v
             +-----------------+             +-----------------+
             |   Jetson Nano   |             |  ESP32 DevKit   |
             | (Brain & Vision)|             | (Motor Safety)  |
             +--------+--------+             +--------+--------+
                      |                               |
                      | <=== High-Speed Serial UART ==| (TX/RX)
                      |      (115200 Baud / USB)      |
                      |                               |
                      v                               v
             +-----------------+             +-----------------+
             | Camera & LiDAR  |             | Ultrasonic HC-SR04
             | (USB / CSI Bus) |             | L298N Motor Driver
             +-----------------+             | Emergency Kill Relay
                                             +-----------------+
                                                      |
                                                      v
                                             +-----------------+
                                             | 4x DC Motors    |
                                             | with Encoders   |
                                             +-----------------+
```

---

## 2. Pinout & Interconnection Table

### A. ESP32 to L298N Motor Driver
| ESP32 GPIO Pin | L298N Pin | Function | Logic Level |
| :--- | :--- | :--- | :--- |
| **GPIO 14** | `ENA` | Left Motors PWM Speed Control (0–255) | 3.3V PWM (Compatible with L298N) |
| **GPIO 27** | `IN1` | Left Motor Direction Forward | 3.3V Logic |
| **GPIO 26** | `IN2` | Left Motor Direction Reverse | 3.3V Logic |
| **GPIO 25** | `IN3` | Right Motor Direction Forward | 3.3V Logic |
| **GPIO 33** | `IN4` | Right Motor Direction Reverse | 3.3V Logic |
| **GPIO 32** | `ENB` | Right Motors PWM Speed Control (0–255) | 3.3V PWM |
| **GND** | `GND` | Common Ground Reference | 0V |

### B. ESP32 to HC-SR04 Ultrasonic Sensor (Front Obstacle Collision Radar)
| Sensor Pin | ESP32 Pin | Note / Circuit Protection |
| :--- | :--- | :--- |
| `VCC` | +5V Rail | Sensor requires 5V supply |
| `TRIG` | **GPIO 12** | 3.3V pulse from ESP32 triggers 5V sensor |
| `ECHO` | **GPIO 13** | **CRITICAL: Use Voltage Divider!** (5V echo to 3.3V GPIO using 1kΩ and 2kΩ resistors) |
| `GND` | Common GND | System Ground |

### C. Emergency Brake Button & Status Indicators
| Component | ESP32 Pin | Function |
| :--- | :--- | :--- |
| Hard E-Stop Pushbutton | **GPIO 34** | Pull-up switch; activates instantaneous hardware stop when pressed |
| Blue Status LED | **GPIO 2** | Blinks during active navigation and heartbeat |
| Red Safety Alert LED | **GPIO 4** | Solid ON during Emergency Brake or Obstacle proximity (<25cm) |

### D. Jetson Nano to ESP32 Inter-Processor Link
Two connection options are supported:
1. **Option 1 (Recommended - Plug & Play)**: Micro-USB cable from ESP32 to Jetson Nano USB 3.0 port (`/dev/ttyUSB0` or `/dev/ttyACM0`). Provides clean ground isolation, data transfer, and automatic enumeration.
2. **Option 2 (Direct UART Pins)**:
   - Jetson Nano Pin 8 (`UART2_TXD`) -> ESP32 Pin `RX0` (GPIO 3)
   - Jetson Nano Pin 10 (`UART2_RXD`) -> ESP32 Pin `TX0` (GPIO 1)
   - Jetson Nano Pin 9 (`GND`) -> ESP32 `GND`

---

## 3. Power Distribution & Common Ground Architecture

> [!CAUTION]
> **Ground Loop Warning**: All ground lines (`GND`) from the Battery, Jetson Nano, ESP32, Motor Driver, and Sensors MUST be tied together to a **single common ground point**. Failure to do so will cause serial corruption, false ultrasonic readings, and erratic motor behavior.

1. **Battery Output (11.1V – 12V LiPo 3S 2200–5000 mAh)**:
   - Feeds directly into `12V IN` of the L298N Motor Driver.
   - Feeds parallel inputs of two DC-DC Step-Down Buck Converters (LM2596 or XL4015).
2. **Buck Converter 1**:
   - Adjusted to exactly **5.1V @ 4A**.
   - Connected to Jetson Nano Barrel Jack (J28) with Jumper J48 bridged for barrel jack power mode.
3. **Buck Converter 2**:
   - Adjusted to **5.0V @ 2A**.
   - Powers the ESP32 `VIN` pin and HC-SR04 ultrasonic sensor.

---

## 4. Multi-Layer Safety & Fail-Safe Matrix

| Failure Mode | Detection Mechanism | Immediate Action |
| :--- | :--- | :--- |
| **Physical Obstacle < 25cm** | ESP32 Ultrasonic Echo Interrupt | Microcontroller cuts all motor PWM to 0 immediately; triggers buzzer/LED; reports `OBSTACLE_HARD_STOP` to Jetson. |
| **Computer Crash / Jetson Frozen** | ESP32 800ms Watchdog Timer | If no heartbeat is received from Jetson within 800ms, ESP32 safely deactivates motors. |
| **Communication Drop with Web Server** | Jetson Python WebSocket Timeout | If Wi-Fi link drops for > 5 seconds, vehicle brings speed to a controlled stop at roadside and enters safe state. |
| **Remote Emergency Halt from Web** | WebSocket command `EMERGENCY_STOP` | Jetson commands ESP32 hard brake instantly; all web dashboards updated in < 100ms. |
| **Low Battery (< 15%)** | Software Voltage Sensor / BMS | Taxi automatically finishes current leg or rejects new dispatch; marks status `OFFLINE/CHARGING`. |
