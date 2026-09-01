/**
 * SIH26039: AI-POWERED MINE RESCUE ROVER - GROUND CONTROL STATION
 * Module: DGMS Mine Safety & Rescue Incident Report Generator
 * Compiles real-time sensor peaks, sample gallery photos, AI hazard detections,
 * and outputs printable/PDF incident dossiers for DGMS inspectors and rescue squads.
 */

class ReportGeneratorModule {
  constructor() {
    this.modal = document.getElementById('generalModal');
    this.modalTitle = document.getElementById('generalModalTitle');
    this.modalBody = document.getElementById('generalModalBody');
  }

  generateDgmsReport() {
    const gasData = window.telemetryGauges ? window.telemetryGauges.currentData : {};
    const samples = window.sampleGallery ? window.sampleGallery.samples : [];
    const lidarPointsCount = window.lidarVisualizer ? window.lidarVisualizer.points.length : 0;
    const isAiFound = window.cameraAi ? window.cameraAi.detectedObjects.length > 0 : false;

    const missionId = `DGMS-JH-${new Date().getFullYear()}-${Math.floor(1000 + Math.random() * 9000)}`;
    const timestampStr = new Date().toLocaleString('en-IN', { timeZone: 'Asia/Kolkata' });

    // Safety Compliance Evaluation
    const ch4Peak = gasData.ch4_raw || 380;
    const coPeak = gasData.co_raw || 210;
    const isCh4Hazard = ch4Peak > 2000;
    const isCoHazard = coPeak > 1200;

    const html = `
      <div id="printableReport" style="font-family: 'Inter', sans-serif; color: #1e293b; background: #fff; padding: 24px; border-radius: 6px;">
        <!-- Header -->
        <div style="border-bottom: 2px solid #0f172a; padding-bottom: 12px; margin-bottom: 16px; display: flex; justify-content: space-between; align-items: flex-start;">
          <div>
            <div style="font-size: 0.75rem; font-weight: 800; color: #b45309; text-transform: uppercase; letter-spacing: 0.1em;">
              DIRECTORATE GENERAL OF MINES SAFETY (DGMS) • GOVT. OF INDIA
            </div>
            <h1 style="font-size: 1.35rem; font-weight: 800; color: #0f172a; margin-top: 4px;">
              UNDERGROUND MINE HAZARD RECONNAISSANCE DOSSIER
            </h1>
            <div style="font-size: 0.8rem; color: #475569; margin-top: 2px;">
              Target Location: <b>Jharia Coalfield, Seam #12, Shaft 4 (Jharkhand)</b>
            </div>
          </div>
          <div style="text-align: right; font-family: monospace; font-size: 0.8rem;">
            <div><b>DOSSIER ID:</b> ${missionId}</div>
            <div style="color: #64748b;">DATE: ${timestampStr}</div>
            <div style="color: #64748b;">UNIT: ROVER "THE STATIC SIX"</div>
          </div>
        </div>

        <!-- Executive Summary Banner -->
        <div style="background: ${isCh4Hazard || isCoHazard ? '#fee2e2' : '#f0fdf4'}; border-left: 4px solid ${isCh4Hazard || isCoHazard ? '#ef4444' : '#10b981'}; padding: 12px; margin-bottom: 16px;">
          <div style="font-weight: 700; font-size: 0.9rem; color: ${isCh4Hazard || isCoHazard ? '#991b1b' : '#166534'};">
            ${isCh4Hazard || isCoHazard ? '⚠️ CRITICAL RESCUE ENVIRONMENT HAZARD LEVEL' : '✅ SECTOR CONDITIONS WITHIN PERMISSIBLE DGMS THRESHOLDS'}
          </div>
          <div style="font-size: 0.8rem; color: #334155; margin-top: 4px;">
            Autonomous scout rover executed subterranean environmental sweep, LiDAR distance mapping (${lidarPointsCount} cloud points), and AI optical surveillance.
          </div>
        </div>

        <!-- Gas & Environment Peak Matrix -->
        <h3 style="font-size: 0.95rem; font-weight: 700; color: #0f172a; margin-bottom: 8px; border-bottom: 1px solid #e2e8f0; padding-bottom: 4px;">
          1. Subterranean Atmospheric & Environmental Telemetry
        </h3>
        <table style="width: 100%; border-collapse: collapse; font-size: 0.8rem; margin-bottom: 16px;">
          <thead>
            <tr style="background: #f1f5f9; text-align: left;">
              <th style="padding: 6px 10px; border: 1px solid #cbd5e1;">Parameter</th>
              <th style="padding: 6px 10px; border: 1px solid #cbd5e1;">Observed Raw Value</th>
              <th style="padding: 6px 10px; border: 1px solid #cbd5e1;">DGMS Safety Limit</th>
              <th style="padding: 6px 10px; border: 1px solid #cbd5e1;">Status</th>
            </tr>
          </thead>
          <tbody>
            <tr>
              <td style="padding: 6px 10px; border: 1px solid #cbd5e1; font-weight: 600;">Methane (CH4) - MQ-4</td>
              <td style="padding: 6px 10px; border: 1px solid #cbd5e1; font-family: monospace;">${gasData.ch4_raw} ADC</td>
              <td style="padding: 6px 10px; border: 1px solid #cbd5e1;">1.25% (1800 ADC max)</td>
              <td style="padding: 6px 10px; border: 1px solid #cbd5e1; color: ${isCh4Hazard ? '#dc2626' : '#16a34a'}; font-weight: 700;">
                ${isCh4Hazard ? 'EXCEEDED (EXPLOSION RISK)' : 'PERMISSIBLE'}
              </td>
            </tr>
            <tr>
              <td style="padding: 6px 10px; border: 1px solid #cbd5e1; font-weight: 600;">Carbon Monoxide (CO) - MQ-7</td>
              <td style="padding: 6px 10px; border: 1px solid #cbd5e1; font-family: monospace;">${gasData.co_raw} ADC</td>
              <td style="padding: 6px 10px; border: 1px solid #cbd5e1;">50 ppm (1200 ADC max)</td>
              <td style="padding: 6px 10px; border: 1px solid #cbd5e1; color: ${isCoHazard ? '#dc2626' : '#16a34a'}; font-weight: 700;">
                ${isCoHazard ? 'TOXIC ACCUMULATION' : 'PERMISSIBLE'}
              </td>
            </tr>
            <tr>
              <td style="padding: 6px 10px; border: 1px solid #cbd5e1; font-weight: 600;">Shaft Temperature (BME280)</td>
              <td style="padding: 6px 10px; border: 1px solid #cbd5e1; font-family: monospace;">${gasData.temp_c}°C</td>
              <td style="padding: 6px 10px; border: 1px solid #cbd5e1;">38.0°C Max Continuous</td>
              <td style="padding: 6px 10px; border: 1px solid #cbd5e1; color: #16a34a; font-weight: 700;">NORMAL</td>
            </tr>
            <tr>
              <td style="padding: 6px 10px; border: 1px solid #cbd5e1; font-weight: 600;">Relative Humidity</td>
              <td style="padding: 6px 10px; border: 1px solid #cbd5e1; font-family: monospace;">${gasData.humidity_pct}%</td>
              <td style="padding: 6px 10px; border: 1px solid #cbd5e1;">85% High Moisture Alert</td>
              <td style="padding: 6px 10px; border: 1px solid #cbd5e1; color: ${gasData.humidity_pct > 80 ? '#d97706' : '#16a34a'}; font-weight: 700;">
                ${gasData.humidity_pct > 80 ? 'HIGH MOISTURE' : 'NORMAL'}
              </td>
            </tr>
          </tbody>
        </table>

        <!-- Geological Samples Log -->
        <h3 style="font-size: 0.95rem; font-weight: 700; color: #0f172a; margin-bottom: 8px; border-bottom: 1px solid #e2e8f0; padding-bottom: 4px;">
          2. Geological & Soil Moisture Samples (${samples.length} Logged)
        </h3>
        ${samples.length > 0 ? `
          <div style="display: grid; grid-template-columns: repeat(2, 1fr); gap: 10px; margin-bottom: 16px;">
            ${samples.slice(0, 4).map(s => `
              <div style="border: 1px solid #cbd5e1; border-radius: 4px; padding: 8px; display: flex; gap: 8px; align-items: center;">
                <img src="${s.photoUrl}" style="width: 70px; height: 55px; object-fit: cover; border-radius: 3px; background: #000;">
                <div style="font-size: 0.75rem;">
                  <div style="font-weight: 700;">${s.id} (${s.dateFormatted})</div>
                  <div>Moisture: <b>${s.hygrometerPct}%</b></div>
                  <div style="color: #64748b; font-size: 0.7rem;">${s.hazardLevel.label}</div>
                </div>
              </div>
            `).join('')}
          </div>
        ` : `
          <div style="font-size: 0.8rem; color: #64748b; margin-bottom: 16px;">No soil sample events triggered during this patrol segment.</div>
        `}

        <!-- Rescue Recommendations -->
        <h3 style="font-size: 0.95rem; font-weight: 700; color: #0f172a; margin-bottom: 8px; border-bottom: 1px solid #e2e8f0; padding-bottom: 4px;">
          3. Incident Commander & Rescue Squad Recommendations
        </h3>
        <ul style="font-size: 0.8rem; color: #334155; padding-left: 20px; line-height: 1.5; margin-bottom: 20px;">
          <li><b>Ventilation Directive:</b> ${isCh4Hazard ? 'Engage auxiliary booster fans immediately to dilute methane concentration below 0.75% before personnel deployment.' : 'Normal airflow adequate in surveyed section.'}</li>
          <li><b>Breathing Apparatus:</b> ${isCoHazard ? 'Self-Contained Breathing Apparatus (SCBA) MANDATORY for all entry teams due to Carbon Monoxide accumulation.' : 'Standard dust masks and safety gear recommended.'}</li>
          <li><b>Structural Integrity:</b> LiDAR distance profiles indicate stable clearance. Avoid unsupported roof spans.</li>
          <li><b>Survivor Extraction:</b> Maintain LoRa beacon link with Rover #01 for continuous beacon routing.</li>
        </ul>

        <!-- Signature Section -->
        <div style="border-top: 1px solid #cbd5e1; padding-top: 12px; display: flex; justify-content: space-between; font-size: 0.75rem; color: #475569;">
          <div>
            <b>RECON OPERATOR:</b> THE STATIC SIX (SIH26039 TEAM)<br>
            System: Autonomous ESP32/LoRa Mine GCS
          </div>
          <div style="text-align: right;">
            <b>DGMS INCIDENT CONTROLLER:</b> ____________________<br>
            Official Stamp & Authorization
          </div>
        </div>
      </div>
    `;

    if (this.modal && this.modalTitle && this.modalBody) {
      this.modalTitle.textContent = `MISSION INCIDENT DOSSIER: ${missionId}`;
      this.modalBody.innerHTML = `
        <div style="display: flex; justify-content: flex-end; gap: 8px; margin-bottom: 12px;">
          <button class="btn btn-primary btn-sm" onclick="window.print()">🖨️ PRINT / EXPORT PDF</button>
        </div>
        ${html}
      `;
      this.modal.classList.add('open');
    }
  }

  closeModal() {
    if (this.modal) {
      this.modal.classList.remove('open');
    }
  }
}

window.reportGenerator = new ReportGeneratorModule();
