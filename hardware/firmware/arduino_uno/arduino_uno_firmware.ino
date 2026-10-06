/*
 * ============================================================================
 * DriveAI - Arduino Uno 2-Motor & Ultrasonic Safety Controller Firmware
 * ============================================================================
 * Target Board: Arduino Uno (ATmega328P @ 16MHz, 5V Logic)
 * Hardware Controlled:
 *   - 2x DC Motors via L298N Dual H-Bridge Driver
 *   - 1x HC-SR04 Ultrasonic Distance Sensor (Front Collision Radar)
 *   - USB Serial UART Interface to NVIDIA Jetson Nano @ 115200 Baud
 *   - Multi-layer Hardware Safety Cutoff & Watchdog Fail-Safe
 * ============================================================================
 */

#include <Arduino.h>

// -------------------------------------------------------------
// ARDUINO UNO PIN ASSIGNMENTS
// -------------------------------------------------------------

// MOTOR 1 (LEFT MOTOR) - Connected to L298N OUT1 & OUT2
const int PIN_ENA = 5;  // PWM Speed Control (Timer0 PWM, 0-255)
const int PIN_IN1 = 7;  // Direction Pin A
const int PIN_IN2 = 8;  // Direction Pin B

// MOTOR 2 (RIGHT MOTOR) - Connected to L298N OUT3 & OUT4
const int PIN_ENB = 6;  // PWM Speed Control (Timer0 PWM, 0-255)
const int PIN_IN3 = 4;  // Direction Pin A
const int PIN_IN4 = 2;  // Direction Pin B

// HC-SR04 ULTRASONIC DISTANCE SENSOR (Front Bumper)
const int PIN_TRIG = 12; // Ultrasonic Trigger (Output)
const int PIN_ECHO = 11; // Ultrasonic Echo (Input - 5V direct to Uno)

// STATUS & SAFETY LED INDICATORS
const int PIN_STATUS_LED = 13; // Built-in Uno LED (Heartbeat)
const int PIN_ESTOP_LED  = 3;  // Red Emergency Stop Warning LED

// -------------------------------------------------------------
// SAFETY THRESHOLDS & PARAMETERS
// -------------------------------------------------------------
const float HARD_STOP_DISTANCE_CM = 25.0; // Automatic hard emergency brake
const float SLOWDOWN_DISTANCE_CM  = 60.0; // Dynamic throttle reduction
const unsigned long WATCHDOG_TIMEOUT_MS = 800; // Stop if Jetson Nano stalls

// -------------------------------------------------------------
// STATE VARIABLES
// -------------------------------------------------------------
bool emergencyStopActive = false;
unsigned long lastHeartbeatMillis = 0;
float currentFrontDistanceCm = 999.0;
int currentThrottle = 0; // -255 to +255
int currentSteering = 0; // -100 (left) to +100 (right)

// -------------------------------------------------------------
// FUNCTION PROTOTYPES
// -------------------------------------------------------------
void initMotors();
void initSensors();
float readUltrasonicDistance();
void driveMotors(int leftPwm, int rightPwm);
void hardStopMotors();
void parseSerialCommand(String cmd);
void transmitTelemetryPacket();

// =============================================================
// SETUP - Runs Once on Boot
// =============================================================
void setup() {
  // Initialize USB Serial link to NVIDIA Jetson Nano (/dev/ttyACM0)
  Serial.begin(115200);
  while (!Serial && millis() < 3000) {
    ; // Wait for USB serial connection
  }

  initMotors();
  initSensors();

  lastHeartbeatMillis = millis();

  // Transmit boot confirmation JSON packet to Jetson Nano
  Serial.println(F("{\"status\":\"ARDUINO_UNO_BOOT_OK\",\"hardware\":\"ArduinoUno-2Motor-HCSR04\",\"version\":\"1.0.0\"}"));
}

// =============================================================
// MAIN LOOP - High-Frequency Control Loop
// =============================================================
void loop() {
  unsigned long currentMillis = millis();

  // 1. Sample Front Obstacle Distance via HC-SR04
  currentFrontDistanceCm = readUltrasonicDistance();

  // 2. Hardware-Level Collision Hard-Stop Interrupt Check
  if (currentFrontDistanceCm > 0.0 && currentFrontDistanceCm < HARD_STOP_DISTANCE_CM) {
    if (!emergencyStopActive) {
      emergencyStopActive = true;
      hardStopMotors();
      digitalWrite(PIN_ESTOP_LED, HIGH);
      
      // Notify Jetson Nano of physical collision prevention override
      Serial.print(F("{\"event\":\"OBSTACLE_HARD_STOP\",\"distance_cm\":"));
      Serial.print(currentFrontDistanceCm, 1);
      Serial.println(F("}"));
    }
  }

  // 3. Hardware Watchdog Check
  // If no communication received from Jetson Nano within 800ms, immediately halt!
  if (currentMillis - lastHeartbeatMillis > WATCHDOG_TIMEOUT_MS) {
    if (currentThrottle != 0 || currentSteering != 0) {
      hardStopMotors();
      currentThrottle = 0;
      currentSteering = 0;
      digitalWrite(PIN_STATUS_LED, LOW);
    }
  } else {
    // Blink heartbeat LED when healthy
    digitalWrite(PIN_STATUS_LED, (currentMillis / 250) % 2 == 0 ? HIGH : LOW);
  }

  // 4. Process Incoming Commands from Jetson Nano
  if (Serial.available() > 0) {
    String incomingLine = Serial.readStringUntil('\n');
    incomingLine.trim();
    if (incomingLine.length() > 0) {
      parseSerialCommand(incomingLine);
    }
  }

  // 5. Send High-Speed Telemetry to Jetson Nano (10 Hz = every 100ms)
  static unsigned long lastTelemetryMillis = 0;
  if (currentMillis - lastTelemetryMillis >= 100) {
    lastTelemetryMillis = currentMillis;
    transmitTelemetryPacket();
  }

  delay(5);
}

// =============================================================
// MOTOR SUBSYSTEM INITIALIZATION & CONTROL
// =============================================================
void initMotors() {
  pinMode(PIN_ENA, OUTPUT);
  pinMode(PIN_IN1, OUTPUT);
  pinMode(PIN_IN2, OUTPUT);
  
  pinMode(PIN_ENB, OUTPUT);
  pinMode(PIN_IN3, OUTPUT);
  pinMode(PIN_IN4, OUTPUT);

  hardStopMotors();
}

void initSensors() {
  pinMode(PIN_TRIG, OUTPUT);
  pinMode(PIN_ECHO, INPUT);
  pinMode(PIN_STATUS_LED, OUTPUT);
  pinMode(PIN_ESTOP_LED, OUTPUT);

  digitalWrite(PIN_TRIG, LOW);
  digitalWrite(PIN_ESTOP_LED, LOW);
}

float readUltrasonicDistance() {
  // Generate 10-microsecond trigger pulse
  digitalWrite(PIN_TRIG, LOW);
  delayMicroseconds(2);
  digitalWrite(PIN_TRIG, HIGH);
  delayMicroseconds(10);
  digitalWrite(PIN_TRIG, LOW);

  // Measure echo pulse width (timeout after 25ms ~ 4.2 meters)
  unsigned long pulseDurationUs = pulseIn(PIN_ECHO, HIGH, 25000UL);
  if (pulseDurationUs == 0) {
    return 999.0; // Path clear, no obstacle within 4 meters
  }

  // Speed of sound = 343 m/s = 0.0343 cm/us
  float distanceCm = (pulseDurationUs * 0.0343) / 2.0;
  return distanceCm;
}

void driveMotors(int leftPwm, int rightPwm) {
  if (emergencyStopActive) {
    hardStopMotors();
    return;
  }

  // MOTOR 1 (LEFT MOTOR)
  if (leftPwm >= 0) {
    digitalWrite(PIN_IN1, HIGH);
    digitalWrite(PIN_IN2, LOW);
    analogWrite(PIN_ENA, constrain(leftPwm, 0, 255));
  } else {
    digitalWrite(PIN_IN1, LOW);
    digitalWrite(PIN_IN2, HIGH);
    analogWrite(PIN_ENA, constrain(-leftPwm, 0, 255));
  }

  // MOTOR 2 (RIGHT MOTOR)
  if (rightPwm >= 0) {
    digitalWrite(PIN_IN3, HIGH);
    digitalWrite(PIN_IN4, LOW);
    analogWrite(PIN_ENB, constrain(rightPwm, 0, 255));
  } else {
    digitalWrite(PIN_IN3, LOW);
    digitalWrite(PIN_IN4, HIGH);
    analogWrite(PIN_ENB, constrain(-rightPwm, 0, 255));
  }
}

void hardStopMotors() {
  digitalWrite(PIN_IN1, LOW);
  digitalWrite(PIN_IN2, LOW);
  digitalWrite(PIN_IN3, LOW);
  digitalWrite(PIN_IN4, LOW);
  analogWrite(PIN_ENA, 0);
  analogWrite(PIN_ENB, 0);
}

// =============================================================
// COMMAND PARSER (Jetson Nano -> Arduino Uno)
// =============================================================
void parseSerialCommand(String cmd) {
  lastHeartbeatMillis = millis(); // Refresh watchdog timer

  // Command 1: DRIVE,<throttle>,<steering>
  // Example: "DRIVE,180,0" (Straight at 70% speed)
  // Example: "DRIVE,150,40" (Turn right while moving forward)
  if (cmd.startsWith("DRIVE,")) {
    if (emergencyStopActive) return; // Disallow drive while E-stop active

    int firstComma = cmd.indexOf(',');
    int secondComma = cmd.indexOf(',', firstComma + 1);

    if (firstComma != -1 && secondComma != -1) {
      currentThrottle = cmd.substring(firstComma + 1, secondComma).toInt();
      currentSteering = cmd.substring(secondComma + 1).toInt();

      // Dynamic obstacle slowdown: Scale down throttle if obstacle between 25cm and 60cm
      if (currentFrontDistanceCm < SLOWDOWN_DISTANCE_CM && currentThrottle > 0) {
        float factor = (currentFrontDistanceCm - HARD_STOP_DISTANCE_CM) / (SLOWDOWN_DISTANCE_CM - HARD_STOP_DISTANCE_CM);
        factor = constrain(factor, 0.15, 1.0);
        currentThrottle = (int)(currentThrottle * factor);
      }

      // 2-Motor Differential Steering Kinematics:
      // currentSteering: -100 (full left spin) to +100 (full right spin)
      float steerRatio = (float)currentSteering / 100.0;
      int leftMotorSpeed  = (int)(currentThrottle * (1.0 + steerRatio));
      int rightMotorSpeed = (int)(currentThrottle * (1.0 - steerRatio));

      driveMotors(leftMotorSpeed, rightMotorSpeed);
    }
  }
  // Command 2: ESTOP (Immediate Software Emergency Brake)
  else if (cmd.equals("ESTOP")) {
    emergencyStopActive = true;
    hardStopMotors();
    digitalWrite(PIN_ESTOP_LED, HIGH);
    Serial.println(F("{\"ack\":\"ESTOP_ACTIVATED\"}"));
  }
  // Command 3: RESUME (Clear E-Stop and Re-arm Motors)
  else if (cmd.equals("RESUME")) {
    // Only allow resume if path is physically clear (> 25cm)
    if (currentFrontDistanceCm > HARD_STOP_DISTANCE_CM) {
      emergencyStopActive = false;
      digitalWrite(PIN_ESTOP_LED, LOW);
      Serial.println(F("{\"ack\":\"RESUME_OK\"}"));
    } else {
      Serial.println(F("{\"ack\":\"RESUME_BLOCKED_BY_OBSTACLE\"}"));
    }
  }
}

// =============================================================
// TELEMETRY TRANSMITTER (Arduino Uno -> Jetson Nano)
// =============================================================
void transmitTelemetryPacket() {
  Serial.print(F("{\"telemetry\":{\"dist_front\":"));
  Serial.print(currentFrontDistanceCm, 1);
  Serial.print(F(",\"estop\":"));
  Serial.print(emergencyStopActive ? F("true") : F("false"));
  Serial.print(F(",\"throttle\":"));
  Serial.print(currentThrottle);
  Serial.print(F(",\"steering\":"));
  Serial.print(currentSteering);
  Serial.println(F("}}"));
}
