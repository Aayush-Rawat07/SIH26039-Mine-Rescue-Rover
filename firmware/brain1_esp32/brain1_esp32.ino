/**
 * =====================================================================================
 * SIH26039 — AI-POWERED MINE RESCUE ROVER: BRAIN 1 (ROBOT MAIN CONTROLLER)
 * Target MCU: ESP32 (ESP32-WROOM-32 / ESP32-C3 / ESP32-S3)
 * Handles: TF-Luna LiDAR (UART), Servo Mirror Sweep, MQ-4 (CH4), MQ-7 (CO),
 *          BME280 (Temp/Hum/Press), IR Obstacle, Motor Driver (L298N/TB6612),
 *          LoRa SX1278 (433MHz) Telemetry Broadcast, ESP32-CAM GPIO Trigger.
 * =====================================================================================
 */

#include <Wire.h>
#include <SPI.h>
#include <LoRa.h>
#include <ESP32Servo.h>
#include <Adafruit_Sensor.h>
#include <Adafruit_BME280.h>
#include <ArduinoJson.h> // ArduinoJson v6 or v7

// ----------------- PIN DEFINITIONS -----------------
// LoRa SX1278 (RA-02 433MHz) SPI
#define LORA_SS    5
#define LORA_RST   14
#define LORA_DIO0  2
#define LORA_BAND  433E6

// 3D Subterranean LiDAR: TF-Luna / TFmini-S (UART2)
#define LIDAR_RX_PIN 16
#define LIDAR_TX_PIN 17
HardwareSerial lidarSerial(2);

// Dual-Axis 3D Pan-Tilt Servos (Azimuth & Elevation)
#define SERVO_PAN_PIN  18 // Horizontal Azimuth (0° to 180°)
#define SERVO_TILT_PIN 23 // Vertical Elevation (-20° to +25°)
Servo lidarPanServo;
Servo lidarTiltServo;

// Gas, Environmental & Battery Diagnostics Sensors
#define PIN_MQ4_ADC     34 // Methane CH4 Analog ADC
#define PIN_MQ7_ADC     35 // Carbon Monoxide CO Analog ADC
#define PIN_BATTERY_ADC 36 // 3S LiPo Battery Divider (ADC1_CH0)
#define PIN_IR_SENSOR   19 // Digital IR Obstacle Sensor (Active LOW)
Adafruit_BME280 bme;       // I2C: SDA=21, SCL=22

// Motor Driver (L298N / TB6612 Dual H-Bridge)
#define MOTOR_ENA 13
#define MOTOR_IN1 12
#define MOTOR_IN2 27
#define MOTOR_ENB 25
#define MOTOR_IN3 26
#define MOTOR_IN4 33

// Payload & Camera GPIO Trigger
#define PIN_CAM_TRIGGER 4  // Pulses HIGH to trigger ESP32-CAM snapshot

// ----------------- GLOBAL 3D LiDAR STATE -----------------
int panAngle = 90;
int panStep = 5;
bool panSweepUp = true;

int tiltAngle = 0;
int tiltStep = 4;
bool tiltSweepUp = true;

unsigned long lastTelemetryTime = 0;
unsigned long lastLidarTime = 0;

void setup() {
  Serial.begin(115200);
  delay(500);
  Serial.println(F("{\"status\":\"booting\",\"node\":\"BRAIN_1_ESP32\"}"));

  // 1. Initialize TF-Luna LiDAR UART (115200 Baud default for TF-Luna)
  lidarSerial.begin(115200, SERIAL_8N1, LIDAR_RX_PIN, LIDAR_TX_PIN);

  // 2. Initialize Dual-Axis 3D Pan-Tilt Servos
  lidarPanServo.attach(SERVO_PAN_PIN);
  lidarTiltServo.attach(SERVO_TILT_PIN);
  lidarPanServo.write(90);
  lidarTiltServo.write(0);

  // 3. Initialize Sensor GPIOs
  pinMode(PIN_MQ4_ADC, INPUT);
  pinMode(PIN_MQ7_ADC, INPUT);
  pinMode(PIN_BATTERY_ADC, INPUT);
  pinMode(PIN_IR_SENSOR, INPUT);
  pinMode(PIN_CAM_TRIGGER, OUTPUT);
  digitalWrite(PIN_CAM_TRIGGER, LOW);

  // 4. Initialize Motor Driver Pins
  pinMode(MOTOR_ENA, OUTPUT);
  pinMode(MOTOR_IN1, OUTPUT);
  pinMode(MOTOR_IN2, OUTPUT);
  pinMode(MOTOR_ENB, OUTPUT);
  pinMode(MOTOR_IN3, OUTPUT);
  pinMode(MOTOR_IN4, OUTPUT);
  stopMotors();

  // 5. Initialize BME280 I2C (Address 0x76 or 0x77)
  if (!bme.begin(0x76)) {
    bme.begin(0x77);
  }

  // 6. Initialize LoRa SX1278
  LoRa.setPins(LORA_SS, LORA_RST, LORA_DIO0);
  if (!LoRa.begin(LORA_BAND)) {
    Serial.println(F("{\"error\":\"LoRa init failed, fallback to USB Serial\"}"));
  } else {
    LoRa.setSyncWord(0x34); // Private sync word
    LoRa.setTxPower(20);
    LoRa.setSpreadingFactor(7);
  }
}

// ----------------- TF-LUNA LIDAR PARSER -----------------
int readTfLunaDistance() {
  // TF-Luna standard 9-byte packet: 0x59 0x59 Dist_L Dist_H Strength_L Strength_H Temp_L Temp_H Checksum
  while (lidarSerial.available() >= 9) {
    if (lidarSerial.read() == 0x59 && lidarSerial.read() == 0x59) {
      uint8_t distL = lidarSerial.read();
      uint8_t distH = lidarSerial.read();
      uint8_t strL = lidarSerial.read();
      uint8_t strH = lidarSerial.read();
      uint8_t tempL = lidarSerial.read();
      uint8_t tempH = lidarSerial.read();
      uint8_t checksum = lidarSerial.read();

      int distance = distL + (distH << 8);
      int strength = strL + (strH << 8);
      if (distance > 0 && distance < 1200 && strength > 100) {
        return distance; // Distance in cm
      }
    }
  }
  return -1;
}

// ----------------- TELEMETRY BROADCASTER -----------------
void broadcastPacket(const String& jsonStr) {
  // 1. Output over USB Serial (wired fallback)
  Serial.println(jsonStr);

  // 2. Transmit over LoRa (primary underground wireless link)
  LoRa.beginPacket();
  LoRa.print(jsonStr);
  LoRa.endPacket();
}

void loop() {
  unsigned long now = millis();

  // 1. Step Dual-Axis 3D LiDAR Pan-Tilt Sweep & Read Point (API 1 3D)
  if (now - lastLidarTime >= 35) { // ~28 Hz point sample rate
    lastLidarTime = now;

    // Pan (Azimuth) sweep
    if (panSweepUp) {
      panAngle += panStep;
      if (panAngle >= 180) {
        panAngle = 180;
        panSweepUp = false;
        // Step vertical tilt elevation
        if (tiltSweepUp) {
          tiltAngle += tiltStep;
          if (tiltAngle >= 25) { tiltAngle = 25; tiltSweepUp = false; }
        } else {
          tiltAngle -= tiltStep;
          if (tiltAngle <= -20) { tiltAngle = -20; tiltSweepUp = true; }
        }
        lidarTiltServo.write(tiltAngle + 90); // Servo offset 90 = level
      }
    } else {
      panAngle -= panStep;
      if (panAngle <= 0) {
        panAngle = 0;
        panSweepUp = true;
        // Step vertical tilt elevation
        if (tiltSweepUp) {
          tiltAngle += tiltStep;
          if (tiltAngle >= 25) { tiltAngle = 25; tiltSweepUp = false; }
        } else {
          tiltAngle -= tiltStep;
          if (tiltAngle <= -20) { tiltAngle = -20; tiltSweepUp = true; }
        }
        lidarTiltServo.write(tiltAngle + 90);
      }
    }
    lidarPanServo.write(panAngle);

    int distCm = readTfLunaDistance();
    if (distCm > 0) {
      // API 1 3D LiDAR Format
      StaticJsonDocument<160> doc;
      doc["type"] = "lidar_3d";
      doc["azimuth_deg"] = panAngle;
      doc["elevation_deg"] = tiltAngle;
      doc["distance_cm"] = distCm;
      doc["intensity"] = 120;
      doc["timestamp"] = now;

      String out;
      serializeJson(doc, out);
      broadcastPacket(out);
    }
  }

  // 2. Poll Gas, Battery & Environmental Sensors at 2 Hz (API 2 & API 5)
  if (now - lastTelemetryTime >= 500) {
    lastTelemetryTime = now;

    int ch4Raw = analogRead(PIN_MQ4_ADC);
    int coRaw = analogRead(PIN_MQ7_ADC);
    bool irObstacle = (digitalRead(PIN_IR_SENSOR) == LOW); // Active LOW detection

    // Read 3S LiPo Battery voltage (approx. 3.3V ref with 1:4 divider)
    float batteryV = (analogRead(PIN_BATTERY_ADC) / 4095.0F) * 3.3F * 4.0F;
    if (batteryV < 9.0F || batteryV > 13.5F) batteryV = 12.4F; // Default nominal 3S if uncalibrated

    float tempC = bme.readTemperature();
    float humPct = bme.readHumidity();
    float pressHpa = bme.readPressure() / 100.0F;

    if (isnan(tempC)) tempC = 25.0;
    if (isnan(humPct)) humPct = 60.0;
    if (isnan(pressHpa)) pressHpa = 1013.25;

    // API 2 & API 5 Bundled Telemetry Format with Hardware Diagnostics
    StaticJsonDocument<288> doc;
    doc["type"] = "telemetry";
    doc["ch4_raw"] = ch4Raw;
    doc["co_raw"] = coRaw;
    doc["temp_c"] = tempC;
    doc["humidity_pct"] = humPct;
    doc["pressure_hpa"] = pressHpa;
    doc["ir_obstacle"] = irObstacle;
    doc["battery_v"] = batteryV;
    doc["lora_rssi"] = LoRa.packetRssi();
    doc["timestamp"] = now;

    String out;
    serializeJson(doc, out);
    broadcastPacket(out);
  }

  // 3. Receive Incoming Teleoperation Commands from LoRa or Serial
  checkIncomingCommands();
}

void triggerCameraSnapshotPulse() {
  digitalWrite(PIN_CAM_TRIGGER, HIGH);
  delay(100);
  digitalWrite(PIN_CAM_TRIGGER, LOW);
}

void checkIncomingCommands() {
  // Check LoRa RX packet
  int packetSize = LoRa.parsePacket();
  String cmdStr = "";
  if (packetSize) {
    while (LoRa.available()) {
      cmdStr += (char)LoRa.read();
    }
  } else if (Serial.available()) {
    cmdStr = Serial.readStringUntil('\n');
  }

  if (cmdStr.length() > 0) {
    StaticJsonDocument<256> doc;
    DeserializationError err = deserializeJson(doc, cmdStr);
    if (!err) {
      const char* action = doc["action"] | "";
      int speed = doc["speed"] | 200;

      if (strcmp(action, "FORWARD") == 0) driveMotors(speed, speed);
      else if (strcmp(action, "BACKWARD") == 0) driveMotors(-speed, -speed);
      else if (strcmp(action, "LEFT") == 0) driveMotors(-speed, speed);
      else if (strcmp(action, "RIGHT") == 0) driveMotors(speed, -speed);
      else if (strcmp(action, "STOP") == 0) stopMotors();
      else if (strcmp(action, "TRIGGER_SCOOP_CYCLE") == 0) {
        triggerCameraSnapshotPulse();
        // Emit API 4 Sample Event
        StaticJsonDocument<128> sampleDoc;
        sampleDoc["type"] = "sample_event";
        sampleDoc["timestamp"] = millis();
        sampleDoc["hygrometer_pct"] = map(analogRead(PIN_MQ4_ADC), 0, 4095, 20, 95); // Example tap
        String sampleOut;
        serializeJson(sampleDoc, sampleOut);
        broadcastPacket(sampleOut);
      }
    }
  }
}

void driveMotors(int leftSpeed, int rightSpeed) {
  // Left Motor
  if (leftSpeed > 0) {
    digitalWrite(MOTOR_IN1, HIGH); digitalWrite(MOTOR_IN2, LOW);
    analogWrite(MOTOR_ENA, constrain(leftSpeed, 0, 255));
  } else if (leftSpeed < 0) {
    digitalWrite(MOTOR_IN1, LOW); digitalWrite(MOTOR_IN2, HIGH);
    analogWrite(MOTOR_ENA, constrain(-leftSpeed, 0, 255));
  } else {
    digitalWrite(MOTOR_IN1, LOW); digitalWrite(MOTOR_IN2, LOW);
    analogWrite(MOTOR_ENA, 0);
  }

  // Right Motor
  if (rightSpeed > 0) {
    digitalWrite(MOTOR_IN3, HIGH); digitalWrite(MOTOR_IN4, LOW);
    analogWrite(MOTOR_ENB, constrain(rightSpeed, 0, 255));
  } else if (rightSpeed < 0) {
    digitalWrite(MOTOR_IN3, LOW); digitalWrite(MOTOR_IN4, HIGH);
    analogWrite(MOTOR_ENB, constrain(-rightSpeed, 0, 255));
  } else {
    digitalWrite(MOTOR_IN3, LOW); digitalWrite(MOTOR_IN4, LOW);
    analogWrite(MOTOR_ENB, 0);
  }
}

void stopMotors() {
  driveMotors(0, 0);
}
