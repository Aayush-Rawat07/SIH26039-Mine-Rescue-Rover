/**
 * SIH26039: AI-POWERED MINE RESCUE ROVER - GROUND CONTROL STATION
 * Module: Gas & Environmental Telemetry HUD (API 2)
 * Handles MQ-4 (CH4), MQ-7 (CO), BME280 (Temp, Humidity, Pressure)
 * Preserves RAW ADC values per hardware spec + provides live calibration tuning.
 */

class TelemetryGauges {
  constructor() {
    this.historyLength = 30; // 30 rolling data points
    this.history = {
      timestamps: [],
      ch4_raw: [],
      co_raw: [],
      temp_c: [],
      humidity_pct: [],
      pressure_hpa: []
    };

    // Sensor State
    this.currentData = {
      ch4_raw: 0,
      co_raw: 0,
      temp_c: 0,
      humidity_pct: 0,
      pressure_hpa: 1013.25,
      timestamp: Date.now()
    };

    // User-tunable calibration parameters (MQ-4 & MQ-7)
    this.calibration = {
      enabled: false, // Default to RAW ADC mode as per hardware spec
      mq4_r0: 10.0,   // Kohm sensor resistance in clean air
      mq4_rl: 20.0,   // Kohm load resistor
      mq7_r0: 10.0,
      mq7_rl: 10.0
    };

    // DGMS Mine Safety Hazard Limits (Indian Coal Mines Regulations)
    this.limits = {
      ch4_warning_adc: 1800,
      ch4_critical_adc: 2600,
      co_warning_adc: 1200,
      co_critical_adc: 2200,
      temp_warning_c: 38.0,
      temp_critical_c: 45.0
    };

    this.chart = null;
    this.initChart();
  }

  /**
   * Ingest API 2 telemetry packet:
   * { ch4_raw, co_raw, temp_c, humidity_pct, pressure_hpa }
   */
  updateTelemetry(packet) {
    if (!packet) return;

    if (packet.ch4_raw !== undefined) this.currentData.ch4_raw = parseInt(packet.ch4_raw, 10);
    if (packet.co_raw !== undefined) this.currentData.co_raw = parseInt(packet.co_raw, 10);
    if (packet.temp_c !== undefined) this.currentData.temp_c = parseFloat(packet.temp_c);
    if (packet.humidity_pct !== undefined) this.currentData.humidity_pct = parseFloat(packet.humidity_pct);
    if (packet.pressure_hpa !== undefined) this.currentData.pressure_hpa = parseFloat(packet.pressure_hpa);
    this.currentData.timestamp = packet.timestamp || Date.now();

    // Push into rolling history
    const timeLabel = new Date().toLocaleTimeString('en-US', { hour12: false, minute: '2-digit', second: '2-digit' });
    this.history.timestamps.push(timeLabel);
    this.history.ch4_raw.push(this.currentData.ch4_raw);
    this.history.co_raw.push(this.currentData.co_raw);
    this.history.temp_c.push(this.currentData.temp_c);
    this.history.humidity_pct.push(this.currentData.humidity_pct);
    this.history.pressure_hpa.push(this.currentData.pressure_hpa);

    if (this.history.timestamps.length > this.historyLength) {
      this.history.timestamps.shift();
      this.history.ch4_raw.shift();
      this.history.co_raw.shift();
      this.history.temp_c.shift();
      this.history.humidity_pct.shift();
      this.history.pressure_hpa.shift();
    }

    this.renderHUD();
    this.updateChart();
  }

  /**
   * Optional conversion from Raw ADC to PPM estimation (when calibration mode enabled)
   * Formula: Rs = ( (4095 - raw) / raw ) * RL
   * PPM = a * (Rs/R0)^b
   */
  rawToCh4Ppm(rawAdc) {
    if (!this.calibration.enabled || rawAdc <= 0 || rawAdc >= 4095) return null;
    const vRef = 4095;
    const rs = ((vRef - rawAdc) / rawAdc) * this.calibration.mq4_rl;
    const ratio = rs / this.calibration.mq4_r0;
    // MQ-4 Methane standard power curve approximation: ~ 1000 * ratio^-2.6
    const ppm = 1000 * Math.pow(ratio, -2.6);
    return Math.max(0, Math.round(ppm));
  }

  rawToCoPpm(rawAdc) {
    if (!this.calibration.enabled || rawAdc <= 0 || rawAdc >= 4095) return null;
    const vRef = 4095;
    const rs = ((vRef - rawAdc) / rawAdc) * this.calibration.mq7_rl;
    const ratio = rs / this.calibration.mq7_r0;
    // MQ-7 Carbon Monoxide approximation: ~ 100 * ratio^-1.5
    const ppm = 100 * Math.pow(ratio, -1.5);
    return Math.max(0, Math.round(ppm));
  }

  renderHUD() {
    const { ch4_raw, co_raw, temp_c, humidity_pct, pressure_hpa } = this.currentData;

    // 1. CH4 (Methane)
    const ch4ValEl = document.getElementById('gaugeCh4Val');
    const ch4SubEl = document.getElementById('gaugeCh4Sub');
    const ch4BarEl = document.getElementById('gaugeCh4Bar');
    const ch4Box = document.getElementById('gaugeCh4Box');

    if (ch4ValEl) {
      ch4ValEl.textContent = `${ch4_raw}`;
      const ch4Ppm = this.rawToCh4Ppm(ch4_raw);
      ch4SubEl.textContent = ch4Ppm !== null ? `~${ch4Ppm} ppm (${(ch4Ppm/10000).toFixed(2)}% LEL)` : `RAW ADC (12-bit)`;
      
      const pct = Math.min(100, (ch4_raw / 4095) * 100);
      if (ch4BarEl) ch4BarEl.style.width = `${pct}%`;

      if (ch4Box) {
        ch4Box.classList.remove('danger-glow', 'warning-glow');
        if (ch4_raw >= this.limits.ch4_critical_adc) {
          ch4Box.classList.add('danger-glow');
          if (ch4BarEl) ch4BarEl.style.backgroundColor = '#ef4444';
        } else if (ch4_raw >= this.limits.ch4_warning_adc) {
          ch4Box.classList.add('warning-glow');
          if (ch4BarEl) ch4BarEl.style.backgroundColor = '#f59e0b';
        } else {
          if (ch4BarEl) ch4BarEl.style.backgroundColor = '#06b6d4';
        }
      }
    }

    // 2. CO (Carbon Monoxide)
    const coValEl = document.getElementById('gaugeCoVal');
    const coSubEl = document.getElementById('gaugeCoSub');
    const coBarEl = document.getElementById('gaugeCoBar');
    const coBox = document.getElementById('gaugeCoBox');

    if (coValEl) {
      coValEl.textContent = `${co_raw}`;
      const coPpm = this.rawToCoPpm(co_raw);
      coSubEl.textContent = coPpm !== null ? `~${coPpm} ppm (Toxicity Hazard)` : `RAW ADC (12-bit)`;
      
      const pct = Math.min(100, (co_raw / 4095) * 100);
      if (coBarEl) coBarEl.style.width = `${pct}%`;

      if (coBox) {
        coBox.classList.remove('danger-glow', 'warning-glow');
        if (co_raw >= this.limits.co_critical_adc) {
          coBox.classList.add('danger-glow');
          if (coBarEl) coBarEl.style.backgroundColor = '#ef4444';
        } else if (co_raw >= this.limits.co_warning_adc) {
          coBox.classList.add('warning-glow');
          if (coBarEl) coBarEl.style.backgroundColor = '#f59e0b';
        } else {
          if (coBarEl) coBarEl.style.backgroundColor = '#06b6d4';
        }
      }
    }

    // 3. Temperature (BME280)
    const tempValEl = document.getElementById('gaugeTempVal');
    const tempBarEl = document.getElementById('gaugeTempBar');
    if (tempValEl) {
      tempValEl.textContent = `${temp_c.toFixed(1)} °C`;
      const pct = Math.min(100, Math.max(0, (temp_c / 60) * 100));
      if (tempBarEl) tempBarEl.style.width = `${pct}%`;
    }

    // 4. Humidity & Pressure
    const humValEl = document.getElementById('gaugeHumVal');
    const humBarEl = document.getElementById('gaugeHumBar');
    if (humValEl) {
      humValEl.textContent = `${humidity_pct.toFixed(1)} %`;
      if (humBarEl) humBarEl.style.width = `${humidity_pct}%`;
    }

    const pressValEl = document.getElementById('gaugePressVal');
    const depthValEl = document.getElementById('gaugeDepthVal');
    if (pressValEl) {
      pressValEl.textContent = `${pressure_hpa.toFixed(1)} hPa`;
      // Underground barometric depth estimation: delta P ~ 0.12 hPa per meter depth in mine shaft
      const deltaHpa = Math.max(0, pressure_hpa - 1013.25);
      const depthMeters = (deltaHpa / 0.12).toFixed(0);
      if (depthValEl) depthValEl.textContent = `Est. Depth: ~${depthMeters}m Below Surface`;
    }
  }

  initChart() {
    const canvas = document.getElementById('telemetryTrendChart');
    if (!canvas || typeof Chart === 'undefined') return;

    const ctx = canvas.getContext('2d');
    this.chart = new Chart(ctx, {
      type: 'line',
      data: {
        labels: [],
        datasets: [
          {
            label: 'CH4 Methane (Raw ADC)',
            data: [],
            borderColor: '#ef4444',
            backgroundColor: 'rgba(239, 68, 68, 0.1)',
            borderWidth: 1.5,
            yAxisID: 'yGas',
            tension: 0.2
          },
          {
            label: 'CO Monoxide (Raw ADC)',
            data: [],
            borderColor: '#f59e0b',
            backgroundColor: 'rgba(245, 158, 11, 0.1)',
            borderWidth: 1.5,
            yAxisID: 'yGas',
            tension: 0.2
          },
          {
            label: 'Temp (°C)',
            data: [],
            borderColor: '#06b6d4',
            borderWidth: 1.5,
            yAxisID: 'yEnv',
            tension: 0.2
          }
        ]
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        animation: false,
        scales: {
          x: {
            grid: { color: 'rgba(36, 50, 82, 0.4)' },
            ticks: { color: '#64748b', font: { size: 9 } }
          },
          yGas: {
            type: 'linear',
            position: 'left',
            min: 0,
            max: 4095,
            grid: { color: 'rgba(36, 50, 82, 0.4)' },
            ticks: { color: '#ef4444', font: { size: 9 } }
          },
          yEnv: {
            type: 'linear',
            position: 'right',
            min: 0,
            max: 60,
            grid: { drawOnChartArea: false },
            ticks: { color: '#06b6d4', font: { size: 9 } }
          }
        },
        plugins: {
          legend: {
            labels: { color: '#94a3b8', boxWidth: 10, font: { size: 10 } }
          }
        }
      }
    });
  }

  updateChart() {
    if (!this.chart) return;
    this.chart.data.labels = this.history.timestamps;
    this.chart.data.datasets[0].data = this.history.ch4_raw;
    this.chart.data.datasets[1].data = this.history.co_raw;
    this.chart.data.datasets[2].data = this.history.temp_c;
    this.chart.update('none');
  }
}

window.telemetryGauges = new TelemetryGauges();
