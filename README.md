# SIH26039: AI-Powered Underground Coal Mine Safety & Rescue Rover
## Ground Control Station (GCS) & Hardware Integration Suite
**Team: The Static Six** • **Location Focus: Jharkhand Coalfield Operations (Jharia / Bokaro)**

---

## 📌 1. Project Background & SIH Problem Statement (SIH26039)
Underground coal mines in Jharkhand face catastrophic safety hazards including **methane gas explosions ($CH_4$), toxic carbon monoxide leaks ($CO$), tunnel collapses / rockfalls, slurry inundation / flooding, and zero visibility**. During emergencies, human rescue teams risk fatal exposure when entering unmapped shafts.

This solution provides an **Autonomous & Teleoperated Reconnaissance Ground Rover** with a tactical **Surface Ground Control Station (GCS)** capable of:
1. **Subterranean 3D LiDAR & 2D Polar Radar Tunnel Mapping** to detect cave-ins and safe path clearance.
2. **Multi-Gas & Environmental Telemetry** (MQ-4 Methane, MQ-7 Carbon Monoxide, BME280 Temperature, Humidity, Barometric Depth).
3. **AI-Powered Optical & Thermal Vision** with Trapped Miner / Survivor detection (hard hat & reflective vest recognition).
4. **Soil & Slurry Hygrometer Sampling (API 4)** with automatic camera snapshot capture and geological liquefaction analysis.
5. **Long-Range LoRa (433MHz) Wireless Transmission** with wired USB Serial fallback.
6. **DGMS Regulatory Compliance Dossier Generator**: 1-click export of official Directorate General of Mines Safety incident reports.

---

## ⚙️ 2. Hardware Architecture ("The Static Six" Specification)

```
[ TF-Luna LiDAR (UART) + Servo Mirror ]
[ MQ-4 (CH4) + MQ-7 (CO) + BME280 + IR ]  --->  [ BRAIN 1: ESP32 ]
[ Dual Motor Driver (L298N/TB6612)      ]           | (LoRa 433MHz / Serial)
[ Soil Scoop Actuator + Cam Trigger     ]           v
                                                [ BRAIN 2: ESP8266 ]
                                                    | (USB Serial @ 115200 Baud)
[ ESP32-CAM (AI-Thinker OV2640) ]                   v
  (Direct WiFi HTTP /stream & /capture) -------> [ LAPTOP DASHBOARD (GCS) ]
```

### Module Breakdown:
1. **Brain 1 (ESP32)**:
   - Sweeps TF-Luna LiDAR across a 0°–180° arc via a servo-actuated mirror.
   - Polls MQ-4, MQ-7, BME280, and IR obstacle sensor.
   - Controls motor driver H-Bridge for rover locomotion.
   - Sends telemetry packets over SX1278 LoRa (433MHz) to surface base station.
   - Sends a GPIO trigger pulse to the ESP32-CAM upon completing a soil scoop cycle.
2. **Brain 2 (ESP8266 Base Station Bridge)**:
   - Receives LoRa 433MHz packets from Brain 1.
   - Forwards newline-delimited JSON streams to the laptop dashboard via **USB Serial (Web Serial API)** or WiFi WebSocket.
3. **Camera Unit (ESP32-CAM AI-Thinker OV2640)**:
   - Hosts a standalone WiFi HTTP server with `/stream` (MJPEG video) and `/capture` (JPEG snapshot).
   - Direct WiFi connection to laptop (bypasses low-bandwidth LoRa channel).
4. **LiDAR Distance Sensor**: TF-Luna / TFmini-S (0.2m to 8m distance sensing).

---

## 📡 3. API Specifications & Data Formats

### API 1: LiDAR Point Cloud Stream
- **Source**: Brain 1 → LoRa → Brain 2 → Laptop GCS
- **Packet Format**:
  ```json
  {"type": "telemetry", "angle_deg": 92.5, "distance_cm": 145, "timestamp": 1725200000}
  ```
- **Action**: GCS converts Polar $(\theta, r)$ into Cartesian $(x, y, z)$ coordinates and updates the real-time 2D Polar Radar and 3D Tunnel Mesh.

### API 2: Gas Sensor & Environmental Telemetry
- **Source**: Brain 1 → LoRa → Brain 2 → Laptop GCS
- **Packet Format**:
  ```json
  {"type": "telemetry", "ch4_raw": 540, "co_raw": 310, "temp_c": 32.4, "humidity_pct": 78.2, "pressure_hpa": 1018.5}
  ```
- **Action**: Displays raw 12-bit ADC values (as required by hardware specs) and provides dynamic user-tunable calibration ($R_0 / R_L$) for PPM/LEL estimation.

### API 3: Live ESP32-CAM Capture
- **Endpoints**: `GET http://<esp32cam-ip>:81/stream` (MJPEG) and `GET http://<esp32cam-ip>/capture` (JPEG bytes).
- **Action**: Displayed in Optical & Thermal AI view with Night-Vision green phosphor filter and False-Color Thermal Heatmap LUT.

### API 4: Picture Interval / Soil Sample Event Trigger
- **Source**: Brain 1 → LoRa → Brain 2 → Laptop GCS
- **Packet Format**:
  ```json
  {"type": "sample_event", "timestamp": 1725200000, "hygrometer_pct": 82}
  ```
- **Action**: Dashboard automatically calls API 3 (`/capture`) to pull a high-resolution snapshot and logs a geological inspection card into the **Sample Gallery**.

### API 5: Obstacle Detection (IR Secondary Sensor)
- **Source**: Brain 1 → LoRa → Brain 2 → Laptop GCS
- **Packet Format**:
  ```json
  {"type": "telemetry", "ir_obstacle": true}
  ```
- **Action**: Highlights red obstacle cone on radar, trips hazard banner, and sounds proximity alert.

### API 6: Base Station Output Format
- **Transport**: Newline-delimited JSON over **Web Serial API** (USB COM @ 115200 Baud) or WebSocket (`ws://localhost:8765`).

---

## 🚀 4. How to Launch & Run the Dashboard

### Method 1: Instant Launch via Windows Batch File
Double-click `start_dashboard.bat` in the project root folder. It will start the local HTTP server and automatically open your default browser to:
```
http://localhost:8000
```

### Method 2: Manual Python Command
```powershell
python server/run_server.py
```

---

## 🔌 5. Connecting with Physical Hardware

1. Plug **Brain 2 (ESP8266 Base Station)** into your laptop via USB cable.
2. Open the dashboard in **Google Chrome** or **Microsoft Edge**.
3. Click the **"🔌 CONNECT SERIAL (COM)"** button on the top right.
4. Select your ESP8266 COM port and click **Connect** (115200 Baud is pre-configured).
5. The status pill will turn **green (ONLINE)** and real-time telemetry from Brain 1 will begin streaming instantly!

---

## 🎮 6. Disaster Scenario Simulator (For Hackathon Demos)

When presenting to judges or testing without hardware connected:
1. Select a scenario from the dropdown on the top bar:
   - **Normal Subterranean Patrol**: Steady tunnel navigation.
   - **Toxic Methane Gas Burst**: $CH_4$ surges past 3000 ADC, triggering red alarms and voice warnings.
   - **Tunnel Collapse / Rockfall**: 35cm obstacle appears on LiDAR and IR sensor.
   - **Trapped Miner Found**: AI optical detection highlights survivor silhouette with hard hat.
   - **Slurry Flooding**: Moisture spikes to 88%, auto-capturing a soil sample.
2. Click **"▶ START SIMULATION"** to run the live stream.

---

## 📄 7. Directorate General of Mines Safety (DGMS) Report Generator
Click the yellow **"📄 DGMS REPORT"** button on the top bar to generate a formal incident report containing:
- Mine Location & Mission Dossier ID.
- Methane & Carbon Monoxide peak readings against DGMS Indian Coal Mines statutory limits (Regulation 169 & 153).
- Geological moisture sample logs and photo thumbnails.
- Actionable recommendations for rescue squads (e.g., ventilation booster directives, SCBA breathing apparatus mandate).
- Print / Save as PDF button for judges and inspection panels.

---

## 🛠️ 8. Arduino Firmware Flashing Guide
The `firmware/` folder contains ready-to-flash sketches:
- `firmware/brain1_esp32/brain1_esp32.ino`: Requires `LoRa`, `ESP32Servo`, `Adafruit_BME280`, `ArduinoJson`.
- `firmware/brain2_esp8266/brain2_esp8266.ino`: Requires `LoRa`, `SPI`.
- `firmware/esp32_cam/esp32_cam.ino`: Select board **"AI Thinker ESP32-CAM"** in Arduino IDE.
