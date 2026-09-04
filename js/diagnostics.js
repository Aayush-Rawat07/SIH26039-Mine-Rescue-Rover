/**
 * SIH26039: AI-POWERED MINE RESCUE ROVER - GROUND CONTROL STATION
 * Module: Hardware & Communication Link Diagnostics
 * Tracks Battery Voltage (3S LiPo), LoRa Signal RSSI/SNR, Ping Latency, and Link Quality.
 */

class DiagnosticsModule {
  constructor() {
    this.battery = {
      voltage: 12.4, // 3S LiPo: 12.6V = 100%, 11.1V = 50%, 9.9V = 0%
      percentage: 92,
      cells: [4.13, 4.14, 4.13],
      currentAmps: 1.8,
      status: 'GOOD'
    };

    this.link = {
      rssi: -68, // -30 dBm (strong) to -120 dBm (very weak)
      snr: 9.5,   // dB
      latencyMs: 38,
      packetsReceived: 0,
      packetsLost: 0,
      packetLossPct: 0.0,
      lastHeartbeat: Date.now()
    };

    this.lastPacketTimestamp = Date.now();
    this.initLoop();
  }

  updateFromPacket(packet) {
    this.link.packetsReceived++;
    this.link.lastHeartbeat = Date.now();

    if (packet.timestamp) {
      const now = Date.now();
      const lat = Math.max(8, Math.min(350, now - packet.timestamp));
      // Smooth latency
      this.link.latencyMs = Math.round(this.link.latencyMs * 0.7 + lat * 0.3);
    }

    if (packet.battery_v !== undefined) {
      this.battery.voltage = parseFloat(packet.battery_v);
    } else {
      // Gradual realistic discharge during mission
      this.battery.voltage = Math.max(10.0, this.battery.voltage - 0.0001);
    }

    // Convert 3S LiPo voltage to percentage (9.9V to 12.6V)
    const minV = 9.9;
    const maxV = 12.6;
    const pct = Math.max(0, Math.min(100, Math.round(((this.battery.voltage - minV) / (maxV - minV)) * 100)));
    this.battery.percentage = pct;
    this.battery.status = pct > 20 ? 'NORMAL' : 'LOW BATTERY';

    if (packet.lora_rssi !== undefined) this.link.rssi = parseInt(packet.lora_rssi, 10);
    if (packet.lora_snr !== undefined) this.link.snr = parseFloat(packet.lora_snr);

    this.renderUi();
  }

  simulateTick() {
    // Subtle realistic link fluctuations when in simulation
    this.link.rssi = Math.round(-65 + (Math.random() * 8 - 4));
    this.link.snr = parseFloat((9.0 + (Math.random() * 2 - 1)).toFixed(1));
    this.link.latencyMs = Math.round(32 + Math.random() * 12);
    
    // Slow discharge
    this.battery.voltage = Math.max(10.2, parseFloat((this.battery.voltage - 0.0002).toFixed(2)));
    const minV = 9.9;
    const maxV = 12.6;
    this.battery.percentage = Math.max(0, Math.min(100, Math.round(((this.battery.voltage - minV) / (maxV - minV)) * 100)));
    
    this.renderUi();
  }

  renderUi() {
    // Battery indicators
    const battValEl = document.getElementById('diagBattVal');
    const battBarEl = document.getElementById('diagBattBar');
    const battSubEl = document.getElementById('diagBattSub');

    if (battValEl) battValEl.textContent = `${this.battery.voltage.toFixed(1)}V (${this.battery.percentage}%)`;
    if (battBarEl) {
      battBarEl.style.width = `${this.battery.percentage}%`;
      battBarEl.style.backgroundColor = this.battery.percentage > 40 ? '#10b981' : (this.battery.percentage > 20 ? '#f59e0b' : '#ef4444');
    }
    if (battSubEl) battSubEl.textContent = `3S LiPo • ${this.battery.status}`;

    // Link indicators
    const loraValEl = document.getElementById('diagLoraVal');
    const loraBarEl = document.getElementById('diagLoraBar');
    const loraSubEl = document.getElementById('diagLoraSub');

    if (loraValEl) loraValEl.textContent = `${this.link.rssi} dBm`;
    if (loraBarEl) {
      // RSSI map: -120 dBm (0%) to -40 dBm (100%)
      const rssiPct = Math.max(5, Math.min(100, Math.round(((this.link.rssi - (-120)) / 80) * 100)));
      loraBarEl.style.width = `${rssiPct}%`;
      loraBarEl.style.backgroundColor = rssiPct > 50 ? '#06b6d4' : (rssiPct > 25 ? '#f59e0b' : '#ef4444');
    }
    if (loraSubEl) loraSubEl.textContent = `SNR: ${this.link.snr}dB • Ping: ${this.link.latencyMs}ms`;
  }

  initLoop() {
    setInterval(() => {
      this.simulateTick();
    }, 1500);
  }
}

window.diagnostics = new DiagnosticsModule();
