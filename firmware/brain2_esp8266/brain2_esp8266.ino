/**
 * =====================================================================================
 * SIH26039 — AI-POWERED MINE RESCUE ROVER: BRAIN 2 (BASE STATION BRIDGE)
 * Target MCU: ESP8266 (NodeMCU / Wemos D1 Mini)
 * Handles: LoRa SX1278 (433MHz) RX from Robot Brain 1,
 *          Forwards newline-delimited JSON over USB Serial (115200 Baud) to laptop GCS.
 *          Forwards GCS drive commands back over LoRa TX to Brain 1.
 * =====================================================================================
 */

#include <SPI.h>
#include <LoRa.h>

// ESP8266 SPI Pins for LoRa SX1278
#define LORA_SS    15 // D8 (GPIO15)
#define LORA_RST   16 // D0 (GPIO16)
#define LORA_DIO0  4  // D2 (GPIO4)
#define LORA_BAND  433E6

void setup() {
  // Initialize USB Serial at 115200 Baud for Web Serial API / Laptop
  Serial.begin(115200);
  delay(500);
  Serial.println(F("{\"status\":\"booting\",\"node\":\"BRAIN_2_ESP8266_BRIDGE\"}"));

  // Initialize LoRa
  LoRa.setPins(LORA_SS, LORA_RST, LORA_DIO0);
  if (!LoRa.begin(LORA_BAND)) {
    Serial.println(F("{\"error\":\"LoRa SX1278 init failed on Brain 2\"}"));
    while (1) { delay(1000); }
  }

  LoRa.setSyncWord(0x34); // Match Brain 1 private sync word
  LoRa.setSpreadingFactor(7);
  Serial.println(F("{\"status\":\"ready\",\"lora_freq\":433000000}"));
}

void loop() {
  // 1. Check for incoming LoRa packets from Robot Brain 1
  int packetSize = LoRa.parsePacket();
  if (packetSize) {
    String incomingJson = "";
    while (LoRa.available()) {
      incomingJson += (char)LoRa.read();
    }
    // Forward directly to laptop dashboard over USB Serial (newline-delimited)
    if (incomingJson.length() > 0) {
      Serial.println(incomingJson);
    }
  }

  // 2. Check for outgoing commands from Laptop Dashboard via USB Serial
  if (Serial.available()) {
    String commandJson = Serial.readStringUntil('\n');
    commandJson.trim();
    if (commandJson.length() > 0) {
      // Transmit command to Brain 1 over LoRa
      LoRa.beginPacket();
      LoRa.print(commandJson);
      LoRa.endPacket();
    }
  }
}
