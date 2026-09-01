/**
 * SIH26039: AI-POWERED MINE RESCUE ROVER - GROUND CONTROL STATION
 * Module: Soil/Water Sample Event Gallery (API 4)
 * Automatically triggers ESP32-CAM snapshot capture on sample_event telemetry
 * Logs moisture % (hygrometer) and geological environmental conditions.
 */

class SampleGalleryModule {
  constructor() {
    this.samples = [];
    this.container = document.getElementById('sampleGalleryContainer');
    this.sampleCountEl = document.getElementById('sampleCountBadge');
  }

  /**
   * Handle incoming API 4 packet:
   * { type: "sample_event", timestamp: 1725200000, hygrometer_pct: 45 }
   */
  async handleSampleEvent(packet) {
    const timestamp = packet.timestamp || Date.now();
    const hygrometerPct = packet.hygrometer_pct !== undefined ? packet.hygrometer_pct : 50;

    // Immediately trigger snapshot pull from Camera (API 3)
    let photoUrl = null;
    if (window.cameraAi) {
      photoUrl = await window.cameraAi.fetchSnapshot();
    }

    // Capture ambient telemetry snapshot
    const gasData = window.telemetryGauges ? window.telemetryGauges.currentData : {};

    const sampleEntry = {
      id: `SMP-${String(this.samples.length + 1).padStart(3, '0')}`,
      timestamp,
      dateFormatted: new Date(timestamp).toLocaleTimeString('en-US', { hour12: false }),
      hygrometerPct,
      photoUrl: photoUrl || 'assets/sample_placeholder.jpg',
      ch4_raw: gasData.ch4_raw || 0,
      co_raw: gasData.co_raw || 0,
      temp_c: gasData.temp_c || 28.0,
      pressure_hpa: gasData.pressure_hpa || 1013.25,
      hazardLevel: this.classifySoilHazard(hygrometerPct)
    };

    this.samples.unshift(sampleEntry);
    this.renderGallery();

    // Trigger audio confirmation
    if (window.alarmSystem) {
      window.alarmSystem.playChime();
      window.alarmSystem.announceVoice(`Soil sample ${sampleEntry.id} collected. Moisture ${hygrometerPct} percent.`);
    }
  }

  classifySoilHazard(moisturePct) {
    if (moisturePct > 80) return { label: 'CRITICAL: FLOODING / LIQUEFACTION', color: '#ef4444' };
    if (moisturePct > 50) return { label: 'WARNING: WATER SEEPAGE', color: '#f59e0b' };
    if (moisturePct < 15) return { label: 'DRY COAL DUST (EXPLOSION RISK)', color: '#f59e0b' };
    return { label: 'NORMAL COAL BED STABILITY', color: '#10b981' };
  }

  renderGallery() {
    if (!this.container) return;
    if (this.sampleCountEl) this.sampleCountEl.textContent = `${this.samples.length} Samples`;

    if (this.samples.length === 0) {
      this.container.innerHTML = `
        <div style="grid-column: 1/-1; text-align: center; padding: 40px 20px; color: var(--text-muted); font-size: 0.85rem;">
          No soil or water samples collected yet.<br>
          Trigger rover scoop cycle or click <b>"Sample Soil Now"</b> to record sample.
        </div>
      `;
      return;
    }

    this.container.innerHTML = this.samples.map(s => `
      <div class="sample-card">
        <div class="sample-img-wrap">
          <img src="${s.photoUrl}" alt="Sample ${s.id}" onclick="sampleGallery.openPhotoModal('${s.id}')">
          <div class="sample-badge">${s.id}</div>
        </div>
        <div class="sample-meta">
          <div style="display: flex; justify-content: space-between; align-items: center;">
            <span style="font-weight: 700; color: #fff;">${s.id}</span>
            <span style="color: var(--text-muted); font-family: var(--font-mono); font-size: 0.7rem;">${s.dateFormatted}</span>
          </div>
          <div style="display: flex; justify-content: space-between; font-size: 0.75rem;">
            <span style="color: var(--text-secondary);">Moisture:</span>
            <span style="font-weight: 700; color: var(--accent-cyan); font-family: var(--font-mono);">${s.hygrometerPct}%</span>
          </div>
          <div style="font-size: 0.7rem; padding: 3px 6px; border-radius: 4px; background: rgba(0,0,0,0.4); color: ${s.hazardLevel.color}; font-weight: 600;">
            ${s.hazardLevel.label}
          </div>
          <div style="color: var(--text-muted); font-size: 0.68rem; font-family: var(--font-mono); border-top: 1px solid var(--border-color); padding-top: 4px;">
            CH4: ${s.ch4_raw} | CO: ${s.co_raw} | Temp: ${s.temp_c}°C
          </div>
        </div>
      </div>
    `).join('');
  }

  openPhotoModal(sampleId) {
    const s = this.samples.find(item => item.id === sampleId);
    if (!s) return;

    const modalBody = document.getElementById('generalModalBody');
    const modalTitle = document.getElementById('generalModalTitle');
    const modal = document.getElementById('generalModal');

    if (modalBody && modalTitle && modal) {
      modalTitle.textContent = `GEOLOGICAL SAMPLE INSPECTION: ${s.id}`;
      modalBody.innerHTML = `
        <div style="display: flex; flex-direction: column; gap: 14px;">
          <div style="width: 100%; max-height: 380px; background: #000; border-radius: 6px; overflow: hidden; display: flex; align-items: center; justify-content: center;">
            <img src="${s.photoUrl}" style="max-width: 100%; max-height: 380px; object-fit: contain;">
          </div>
          <div style="display: grid; grid-template-columns: repeat(2, 1fr); gap: 10px;">
            <div class="gauge-box">
              <span class="gauge-label">HYGROMETER MOISTURE</span>
              <span class="gauge-value" style="color: var(--accent-cyan);">${s.hygrometerPct} %</span>
            </div>
            <div class="gauge-box">
              <span class="gauge-label">GEOLOGICAL RISK</span>
              <span class="gauge-value" style="color: ${s.hazardLevel.color}; font-size: 0.95rem;">${s.hazardLevel.label}</span>
            </div>
            <div class="gauge-box">
              <span class="gauge-label">GAS AT SAMPLING TIME</span>
              <span style="font-family: var(--font-mono); font-size: 0.85rem; color: #fff;">CH4: ${s.ch4_raw} ADC | CO: ${s.co_raw} ADC</span>
            </div>
            <div class="gauge-box">
              <span class="gauge-label">ENVIRONMENT AT SAMPLING</span>
              <span style="font-family: var(--font-mono); font-size: 0.85rem; color: #fff;">${s.temp_c}°C | ${s.pressure_hpa} hPa</span>
            </div>
          </div>
        </div>
      `;
      modal.classList.add('open');
    }
  }

  exportSamplesJson() {
    const blob = new Blob([JSON.stringify(this.samples, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `mine_samples_log_${Date.now()}.json`;
    a.click();
    URL.revokeObjectURL(url);
  }
}

window.sampleGallery = new SampleGalleryModule();
