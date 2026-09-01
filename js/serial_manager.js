/**
 * SIH26039: AI-POWERED MINE RESCUE ROVER - GROUND CONTROL STATION
 * Module: Web Serial API & Network Bridge Manager (API 6 Transport)
 * Handles direct USB COM port connection to Brain 2 (ESP8266) & WebSocket fallback.
 */

class SerialManager {
  constructor() {
    this.port = null;
    this.reader = null;
    this.writer = null;
    this.readableStreamClosed = null;
    this.writableStreamClosed = null;
    this.keepReading = false;
    this.isConnected = false;
    this.transportType = 'NONE'; // 'WEB_SERIAL', 'WEBSOCKET', 'SIMULATOR'
    
    this.ws = null;
    this.baudRate = 115200;
    this.packetCount = 0;
    this.byteCount = 0;
    this.errorCount = 0;
    this.lastPacketTime = 0;
    
    this.listeners = {
      telemetry: [],
      sample_event: [],
      raw: [],
      statusChange: []
    };

    this.inputBuffer = '';
  }

  isWebSerialSupported() {
    return 'serial' in navigator;
  }

  on(eventType, callback) {
    if (this.listeners[eventType]) {
      this.listeners[eventType].push(callback);
    }
  }

  emit(eventType, data) {
    if (this.listeners[eventType]) {
      this.listeners[eventType].forEach(cb => {
        try { cb(data); } catch (err) { console.error(`Error in ${eventType} listener:`, err); }
      });
    }
  }

  notifyStatus(status, details = {}) {
    this.isConnected = (status === 'CONNECTED');
    this.emit('statusChange', { status, transport: this.transportType, ...details });
  }

  /**
   * Connect via Web Serial API directly to ESP8266 Brain 2
   */
  async connectWebSerial(baudRate = 115200) {
    if (!this.isWebSerialSupported()) {
      throw new Error("Web Serial API is not supported in this browser. Please use Google Chrome or Microsoft Edge, or use WebSocket mode.");
    }

    try {
      this.baudRate = baudRate;
      this.port = await navigator.serial.requestPort();
      await this.port.open({ baudRate: this.baudRate });
      
      this.transportType = 'WEB_SERIAL';
      this.keepReading = true;
      this.notifyStatus('CONNECTED', { baudRate: this.baudRate });
      
      this.readSerialLoop();
      return true;
    } catch (err) {
      console.error("Web Serial connection failed:", err);
      this.notifyStatus('ERROR', { error: err.message });
      throw err;
    }
  }

  async readSerialLoop() {
    const textDecoder = new TextDecoderStream();
    this.readableStreamClosed = this.port.readable.pipeTo(textDecoder.writable);
    const reader = textDecoder.readable.getReader();
    this.reader = reader;

    try {
      while (this.keepReading) {
        const { value, done } = await reader.read();
        if (done) break;
        if (value) {
          this.byteCount += value.length;
          this.processStreamChunk(value);
        }
      }
    } catch (error) {
      console.warn("Serial read error:", error);
      this.errorCount++;
    } finally {
      reader.releaseLock();
      this.notifyStatus('DISCONNECTED');
    }
  }

  /**
   * Connect via WebSocket (e.g. Python Bridge or ESP8266 WiFi TCP/WS)
   */
  connectWebSocket(wsUrl = 'ws://localhost:8765') {
    if (this.ws) {
      this.ws.close();
    }

    try {
      this.ws = new WebSocket(wsUrl);
      this.transportType = 'WEBSOCKET';

      this.ws.onopen = () => {
        this.notifyStatus('CONNECTED', { url: wsUrl });
      };

      this.ws.onmessage = (event) => {
        this.byteCount += event.data.length;
        this.processStreamChunk(event.data);
      };

      this.ws.onerror = (err) => {
        console.error("WebSocket Error:", err);
        this.notifyStatus('ERROR', { error: 'WebSocket connection failed' });
      };

      this.ws.onclose = () => {
        this.notifyStatus('DISCONNECTED');
      };
    } catch (e) {
      console.error("WebSocket init error:", e);
      this.notifyStatus('ERROR', { error: e.message });
    }
  }

  /**
   * Parse newline-delimited JSON stream (API 6)
   */
  processStreamChunk(chunk) {
    this.inputBuffer += chunk;
    const lines = this.inputBuffer.split('\n');
    // Keep incomplete line chunk in buffer
    this.inputBuffer = lines.pop();

    for (let line of lines) {
      line = line.trim();
      if (!line) continue;

      this.emit('raw', line);
      try {
        const packet = JSON.parse(line);
        this.packetCount++;
        this.lastPacketTime = Date.now();
        this.routePacket(packet);
      } catch (jsonErr) {
        this.errorCount++;
        // Ignore noise or corrupted serial frames gracefully
      }
    }
  }

  /**
   * Routes JSON packets to UI components by 'type' field
   */
  routePacket(packet) {
    if (!packet || typeof packet !== 'object') return;

    const type = packet.type || 'telemetry';
    if (type === 'telemetry') {
      this.emit('telemetry', packet);
    } else if (type === 'sample_event') {
      this.emit('sample_event', packet);
    } else {
      this.emit(type, packet);
    }
  }

  /**
   * Send JSON command to Robot Brain 1 (via Brain 2 LoRa / Serial)
   */
  async sendCommand(cmdObject) {
    const jsonStr = JSON.stringify(cmdObject) + '\n';

    if (this.transportType === 'WEB_SERIAL' && this.port && this.port.writable) {
      try {
        const textEncoder = new TextEncoder();
        const writer = this.port.writable.getWriter();
        await writer.write(textEncoder.encode(jsonStr));
        writer.releaseLock();
        return true;
      } catch (err) {
        console.error("Failed to send serial command:", err);
        return false;
      }
    } else if (this.transportType === 'WEBSOCKET' && this.ws && this.ws.readyState === WebSocket.OPEN) {
      this.ws.send(jsonStr);
      return true;
    }
    return false;
  }

  async disconnect() {
    this.keepReading = false;
    if (this.reader) {
      try { await this.reader.cancel(); } catch (e) {}
    }
    if (this.port) {
      try { await this.port.close(); } catch (e) {}
      this.port = null;
    }
    if (this.ws) {
      try { this.ws.close(); } catch (e) {}
      this.ws = null;
    }
    this.transportType = 'NONE';
    this.notifyStatus('DISCONNECTED');
  }
}

// Export singleton instance
window.serialManager = new SerialManager();
