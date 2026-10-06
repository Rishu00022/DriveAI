/*
 * DriveAI - Autonomous Taxi Motor & Safety Controller Firmware
 * Target: ESP32 / Arduino Mega / ESP8266
 * Description:
 *   Handles real-time DC motor PWM control, ultrasonic collision detection,
 *   hardware watchdog fail-safe, and serial telemetry with Jetson Nano.
 */

#include <Arduino.h>

// -------------------------------------------------------------
// PIN DEFINITIONS (ESP32 DevKit V1)
// -------------------------------------------------------------

// Motor Driver (L298N / TB6612FNG)
#define PIN_ENA 14   // PWM Left Motors Speed (0-255)
#define PIN_IN1 27   // Left Motor Direction A
#define PIN_IN2 26   // Left Motor Direction B
#define PIN_IN3 25   // Right Motor Direction A
#define PIN_IN4 33   // Right Motor Direction B
#define PIN_ENB 32   // PWM Right Motors Speed (0-255)

// Front Ultrasonic Sensor (HC-SR04)
#define PIN_TRIG 12
#define PIN_ECHO 13

// Emergency Stop Hard Button & Status LED
#define PIN_ESTOP_BUTTON 34 // Input pull-up or external button
#define PIN_STATUS_LED   2  // Onboard blue LED
#define PIN_ESTOP_LED    4  // Red safety indicator LED

// Safety Thresholds
#define HARD_STOP_DISTANCE_CM 25.0   // Immediate emergency brake
#define SLOWDOWN_DISTANCE_CM  60.0   // Throttle reduction
#define WATCHDOG_TIMEOUT_MS   800    // Stop if Jetson communication lost

// State Variables
bool emergencyStop = false;
unsigned long lastHeartbeatTime = 0;
float currentFrontDistCm = 999.0;
int currentThrottle = 0; // -255 to 255
int currentSteering = 0; // -100 (left) to 100 (right)

// PWM Properties for ESP32
const int pwmFreq = 5000;
const int pwmResolution = 8;
const int pwmChannelLeft = 0;
const int pwmChannelRight = 1;

// Function Prototypes
void setupMotors();
void setupSensors();
float measureFrontDistance();
void applyMotorSpeeds(int leftSpeed, int rightSpeed);
void stopMotors();
void handleSerialCommands();
void sendTelemetryPacket();

void setup() {
  Serial.begin(115200); // High-speed UART to Jetson Nano
  delay(500);
  
  setupMotors();
  setupSensors();
  
  lastHeartbeatTime = millis();
  Serial.println("{\"status\":\"ESP32_BOOT_OK\",\"version\":\"DriveAI-ESP32-v2.0\"}");
}

void loop() {
  unsigned long now = millis();

  // 1. Measure Front Distance via Ultrasonic Sensor
  currentFrontDistCm = measureFrontDistance();

  // 2. Hardware Emergency Brake Safety Check
  if (currentFrontDistCm > 0.0 && currentFrontDistCm < HARD_STOP_DISTANCE_CM) {
    if (!emergencyStop) {
      emergencyStop = true;
      stopMotors();
      digitalWrite(PIN_ESTOP_LED, HIGH);
      Serial.print("{\"event\":\"OBSTACLE_HARD_STOP\",\"distance_cm\":");
      Serial.print(currentFrontDistCm);
      Serial.println("}");
    }
  }

  // 3. Watchdog Timer Fail-Safe (If Jetson Nano halts or crashes)
  if (now - lastHeartbeatTime > WATCHDOG_TIMEOUT_MS) {
    if (currentThrottle != 0 || currentSteering != 0) {
      stopMotors();
      currentThrottle = 0;
      currentSteering = 0;
    }
  }

  // 4. Read incoming commands from Jetson Nano
  if (Serial.available()) {
    handleSerialCommands();
  }

  // 5. Send periodic telemetry to Jetson Nano (10Hz = every 100ms)
  static unsigned long lastTelemetry = 0;
  if (now - lastTelemetry >= 100) {
    lastTelemetry = now;
    sendTelemetryPacket();
  }

  delay(10);
}

void setupMotors() {
  pinMode(PIN_IN1, OUTPUT);
  pinMode(PIN_IN2, OUTPUT);
  pinMode(PIN_IN3, OUTPUT);
  pinMode(PIN_IN4, OUTPUT);

  // Configure PWM using ESP32 ledc
  ledcSetup(pwmChannelLeft, pwmFreq, pwmResolution);
  ledcSetup(pwmChannelRight, pwmFreq, pwmResolution);
  ledcAttachPin(PIN_ENA, pwmChannelLeft);
  ledcAttachPin(PIN_ENB, pwmChannelRight);

  stopMotors();
}

void setupSensors() {
  pinMode(PIN_TRIG, OUTPUT);
  pinMode(PIN_ECHO, INPUT);
  pinMode(PIN_STATUS_LED, OUTPUT);
  pinMode(PIN_ESTOP_LED, OUTPUT);
  
  digitalWrite(PIN_TRIG, LOW);
  digitalWrite(PIN_ESTOP_LED, LOW);
}

float measureFrontDistance() {
  digitalWrite(PIN_TRIG, LOW);
  delayMicroseconds(2);
  digitalWrite(PIN_TRIG, HIGH);
  delayMicroseconds(10);
  digitalWrite(PIN_TRIG, LOW);

  // Timeout after 25ms (approx 4 meters)
  long duration = pulseIn(PIN_ECHO, HIGH, 25000);
  if (duration == 0) return 999.0; // No echo received (clear path)

  float distance = (duration * 0.0343) / 2.0;
  return distance;
}

void applyMotorSpeeds(int leftSpeed, int rightSpeed) {
  if (emergencyStop) {
    stopMotors();
    return;
  }

  // Left Motor Direction & PWM
  if (leftSpeed >= 0) {
    digitalWrite(PIN_IN1, HIGH);
    digitalWrite(PIN_IN2, LOW);
    ledcWrite(pwmChannelLeft, constrain(leftSpeed, 0, 255));
  } else {
    digitalWrite(PIN_IN1, LOW);
    digitalWrite(PIN_IN2, HIGH);
    ledcWrite(pwmChannelLeft, constrain(-leftSpeed, 0, 255));
  }

  // Right Motor Direction & PWM
  if (rightSpeed >= 0) {
    digitalWrite(PIN_IN3, HIGH);
    digitalWrite(PIN_IN4, LOW);
    ledcWrite(pwmChannelRight, constrain(rightSpeed, 0, 255));
  } else {
    digitalWrite(PIN_IN3, LOW);
    digitalWrite(PIN_IN4, HIGH);
    ledcWrite(pwmChannelRight, constrain(-rightSpeed, 0, 255));
  }
}

void stopMotors() {
  digitalWrite(PIN_IN1, LOW);
  digitalWrite(PIN_IN2, LOW);
  digitalWrite(PIN_IN3, LOW);
  digitalWrite(PIN_IN4, LOW);
  ledcWrite(pwmChannelLeft, 0);
  ledcWrite(pwmChannelRight, 0);
}

void handleSerialCommands() {
  String line = Serial.readStringUntil('\n');
  line.trim();
  if (line.length() == 0) return;

  lastHeartbeatTime = millis();

  // Simple and ultra-fast parser for embedded microcontroller:
  // e.g.: "DRIVE,120,0" -> Throttle=120, Steer=0
  // e.g.: "ESTOP"
  // e.g.: "RESUME"
  if (line.startsWith("DRIVE,")) {
    if (emergencyStop) return; // Cannot drive while e-stop is triggered
    
    int firstComma = line.indexOf(',');
    int secondComma = line.indexOf(',', firstComma + 1);
    
    if (firstComma != -1 && secondComma != -1) {
      currentThrottle = line.substring(firstComma + 1, secondComma).toInt();
      currentSteering = line.substring(secondComma + 1).toInt();

      // Slowdown scaling if approaching an obstacle (25cm to 60cm)
      if (currentFrontDistCm < SLOWDOWN_DISTANCE_CM && currentThrottle > 0) {
        float factor = (currentFrontDistCm - HARD_STOP_DISTANCE_CM) / (SLOWDOWN_DISTANCE_CM - HARD_STOP_DISTANCE_CM);
        factor = constrain(factor, 0.1, 1.0);
        currentThrottle = (int)(currentThrottle * factor);
      }

      // Differential drive kinematics
      // Steering: -100 (hard left) to +100 (hard right)
      float steerRatio = currentSteering / 100.0;
      int leftMotor = currentThrottle * (1.0 + steerRatio);
      int rightMotor = currentThrottle * (1.0 - steerRatio);

      applyMotorSpeeds(leftMotor, rightMotor);
    }
  } else if (line.equals("ESTOP")) {
    emergencyStop = true;
    stopMotors();
    digitalWrite(PIN_ESTOP_LED, HIGH);
    Serial.println("{\"ack\":\"ESTOP_ACTIVATED\"}");
  } else if (line.equals("RESUME")) {
    // Only resume if obstacle is clear
    if (currentFrontDistCm > HARD_STOP_DISTANCE_CM) {
      emergencyStop = false;
      digitalWrite(PIN_ESTOP_LED, LOW);
      Serial.println("{\"ack\":\"RESUME_OK\"}");
    } else {
      Serial.println("{\"ack\":\"RESUME_BLOCKED_BY_OBSTACLE\"}");
    }
  }
}

void sendTelemetryPacket() {
  Serial.print("{\"telemetry\":{\"dist_front\":");
  Serial.print(currentFrontDistCm, 1);
  Serial.print(",\"estop\":");
  Serial.print(emergencyStop ? "true" : "false");
  Serial.print(",\"throttle\":");
  Serial.print(currentThrottle);
  Serial.print(",\"steering\":");
  Serial.print(currentSteering);
  Serial.println("}}");
}
