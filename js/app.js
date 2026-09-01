/**
 * SIH26039: AI-POWERED MINE RESCUE ROVER - GROUND CONTROL STATION
 * Main Application Orchestrator & Event Coordinator
 */

// 1. Global Tab Switching Function
window.switchTab = function(targetTab) {
  const tabBtns = document.querySelectorAll('.tab-btn');
  const tabContents = document.querySelectorAll('.tab-content');

  tabBtns.forEach(b => {
    if (b.getAttribute('data-tab') === targetTab) {
      b.classList.add('active');
    } else {
      b.classList.remove('active');
    }
  });

  tabContents.forEach(tc => {
    if (tc.id === targetTab) {
      tc.classList.add('active');
      tc.style.display = 'block';
    } else {
      tc.classList.remove('active');
      tc.style.display = 'none';
    }
  });

  if (targetTab === 'tabLidar' && window.lidarVisualizer) {
    window.lidarVisualizer.resizeRadar();
  }
};

// 2. Global Simulator Controls
window.startSimulation = function() {
  const simSelect = document.getElementById('simScenarioSelect');
  const scenario = simSelect ? simSelect.value : 'NORMAL';
  if (window.simulator) {
    window.simulator.start(scenario);
  }
  const simStartBtn = document.getElementById('simStartBtn');
  const simStopBtn = document.getElementById('simStopBtn');
  if (simStartBtn) simStartBtn.style.display = 'none';
  if (simStopBtn) simStopBtn.style.display = 'inline-flex';
};

window.stopSimulation = function() {
  if (window.simulator) {
    window.simulator.stop();
  }
  const simStartBtn = document.getElementById('simStartBtn');
  const simStopBtn = document.getElementById('simStopBtn');
  if (simStartBtn) simStartBtn.style.display = 'inline-flex';
  if (simStopBtn) simStopBtn.style.display = 'none';
};

// 3. Document Ready Initialization
function initializeApp() {
  console.log("SIH26039 App Initializing...");

  // Tab button listeners
  const tabBtns = document.querySelectorAll('.tab-btn');
  tabBtns.forEach(btn => {
    btn.addEventListener('click', () => {
      const tab = btn.getAttribute('data-tab');
      if (tab) window.switchTab(tab);
    });
  });

  // Simulator Start/Stop buttons
  const simStartBtn = document.getElementById('simStartBtn');
  const simStopBtn = document.getElementById('simStopBtn');
  const simSelect = document.getElementById('simScenarioSelect');

  if (simStartBtn) simStartBtn.addEventListener('click', window.startSimulation);
  if (simStopBtn) simStopBtn.addEventListener('click', window.stopSimulation);

  if (simSelect) {
    simSelect.addEventListener('change', (e) => {
      if (window.simulator && window.simulator.isRunning) {
        window.simulator.setScenario(e.target.value);
      }
    });
  }

  // Serial & Connection buttons
  const connectSerialBtn = document.getElementById('connectSerialBtn');
  const connectWsBtn = document.getElementById('connectWsBtn');
  const disconnectBtn = document.getElementById('disconnectBtn');
  const statusDot = document.getElementById('connectionStatusDot');
  const statusText = document.getElementById('connectionStatusText');

  if (connectSerialBtn) {
    connectSerialBtn.addEventListener('click', async () => {
      try {
        await window.serialManager.connectWebSerial(115200);
      } catch (e) {
        alert(`Serial Connection Error: ${e.message}`);
      }
    });
  }

  if (connectWsBtn) {
    connectWsBtn.addEventListener('click', () => {
      const wsUrl = prompt("Enter WebSocket Bridge URL:", "ws://localhost:8765");
      if (wsUrl) window.serialManager.connectWebSocket(wsUrl);
    });
  }

  if (disconnectBtn) {
    disconnectBtn.addEventListener('click', async () => {
      window.stopSimulation();
      if (window.serialManager) await window.serialManager.disconnect();
    });
  }

  // Status changes
  if (window.serialManager) {
    window.serialManager.on('statusChange', ({ status, transport, baudRate, url, mode, error }) => {
      if (!statusDot || !statusText) return;
      if (status === 'CONNECTED') {
        statusDot.className = 'status-dot online';
        statusText.textContent = mode || (transport === 'WEB_SERIAL' ? `USB SERIAL (COM @ ${baudRate})` : `WS LINK (${url})`);
        if (connectSerialBtn) connectSerialBtn.style.display = 'none';
        if (connectWsBtn) connectWsBtn.style.display = 'none';
        if (disconnectBtn) disconnectBtn.style.display = 'inline-flex';
      } else {
        statusDot.className = 'status-dot';
        statusText.textContent = error ? `ERROR: ${error}` : 'DISCONNECTED';
        if (connectSerialBtn) connectSerialBtn.style.display = 'inline-flex';
        if (connectWsBtn) connectWsBtn.style.display = 'inline-flex';
        if (disconnectBtn) disconnectBtn.style.display = 'none';
      }
    });

    // Telemetry routing
    window.serialManager.on('telemetry', (packet) => {
      // API 1: LiDAR Point Cloud
      if (packet.angle_deg !== undefined && packet.distance_cm !== undefined) {
        if (window.lidarVisualizer) {
          window.lidarVisualizer.addPoint(packet.angle_deg, packet.distance_cm, packet.timestamp);
        }
      }

      // API 5: IR Obstacle
      if (packet.ir_obstacle !== undefined) {
        if (window.lidarVisualizer) {
          window.lidarVisualizer.setIrObstacle(packet.ir_obstacle);
        }
      }

      // API 2: Gas readings
      if (packet.ch4_raw !== undefined || packet.co_raw !== undefined || packet.temp_c !== undefined) {
        if (window.telemetryGauges) {
          window.telemetryGauges.updateTelemetry(packet);
        }

        const ch4 = packet.ch4_raw || 0;
        const co = packet.co_raw || 0;
        if (ch4 >= 2600 && window.alarmSystem) {
          window.alarmSystem.setAlert('CRITICAL', `High Methane Leak (${ch4} ADC)!`, 'Danger. High methane concentration detected.');
        } else if (co >= 1800 && window.alarmSystem) {
          window.alarmSystem.setAlert('CRITICAL', `Carbon Monoxide Threshold Exceeded (${co} ADC)!`, 'Danger. High carbon monoxide levels detected.');
        } else if (packet.ir_obstacle && window.alarmSystem) {
          window.alarmSystem.setAlert('WARNING', 'Obstacle in Proximity (<50cm)!', 'Warning. Obstacle detected in forward path.');
        } else if (ch4 >= 1800 || co >= 1200) {
          if (window.alarmSystem) window.alarmSystem.setAlert('WARNING', 'Atmospheric gas readings elevated.', null);
        } else {
          if (window.alarmSystem && (!window.simulator || window.simulator.activeScenario === 'NORMAL')) {
            window.alarmSystem.clearAlert();
          }
        }
      }
    });

    // API 4: Sample event
    window.serialManager.on('sample_event', (packet) => {
      if (window.sampleGallery) {
        window.sampleGallery.handleSampleEvent(packet);
      }
    });
  }

  // Camera controls
  const camIpInput = document.getElementById('espCamIpInput');
  const camConnectBtn = document.getElementById('espCamConnectBtn');
  const camFilterNormal = document.getElementById('camFilterNormal');
  const camFilterNight = document.getElementById('camFilterNight');
  const camFilterThermal = document.getElementById('camFilterThermal');
  const manualSnapshotBtn = document.getElementById('manualSnapshotBtn');

  if (camConnectBtn && camIpInput && window.cameraAi) {
    camConnectBtn.addEventListener('click', () => {
      window.cameraAi.setCamIp(camIpInput.value);
      window.cameraAi.connectStream();
    });
  }

  if (camFilterNormal && window.cameraAi) camFilterNormal.addEventListener('click', () => window.cameraAi.setFilter('NORMAL'));
  if (camFilterNight && window.cameraAi) camFilterNight.addEventListener('click', () => window.cameraAi.setFilter('NIGHT_VISION'));
  if (camFilterThermal && window.cameraAi) camFilterThermal.addEventListener('click', () => window.cameraAi.setFilter('THERMAL'));
  if (manualSnapshotBtn && window.roverController) manualSnapshotBtn.addEventListener('click', () => window.roverController.triggerSoilSample());

  // LiDAR 2D / 3D Mode controls
  const lidar2dBtn = document.getElementById('lidarMode2dBtn');
  const lidar3dBtn = document.getElementById('lidarMode3dBtn');
  const lidarClearBtn = document.getElementById('lidarClearBtn');

  if (lidar2dBtn) {
    lidar2dBtn.addEventListener('click', () => {
      if (window.lidarVisualizer) window.lidarVisualizer.setViewMode('2D_RADAR');
      lidar2dBtn.classList.add('btn-primary');
      lidar2dBtn.classList.remove('btn-outline');
      if (lidar3dBtn) {
        lidar3dBtn.classList.remove('btn-primary');
        lidar3dBtn.classList.add('btn-outline');
      }
    });
  }

  if (lidar3dBtn) {
    lidar3dBtn.addEventListener('click', () => {
      if (window.lidarVisualizer) window.lidarVisualizer.setViewMode('3D_TUNNEL');
      lidar3dBtn.classList.add('btn-primary');
      lidar3dBtn.classList.remove('btn-outline');
      if (lidar2dBtn) {
        lidar2dBtn.classList.remove('btn-primary');
        lidar2dBtn.classList.add('btn-outline');
      }
    });
  }

  if (lidarClearBtn && window.lidarVisualizer) {
    lidarClearBtn.addEventListener('click', () => window.lidarVisualizer.clearPoints());
  }

  // Teleoperation speed slider & buttons
  const speedSlider = document.getElementById('teleopSpeedSlider');
  if (speedSlider && window.roverController) {
    speedSlider.addEventListener('input', (e) => window.roverController.setSpeed(e.target.value));
  }

  const estopBtn = document.getElementById('estopBtn');
  if (estopBtn && window.roverController) estopBtn.addEventListener('click', () => window.roverController.emergencyStop());

  const headlightBtn = document.getElementById('headlightToggleBtn');
  if (headlightBtn && window.roverController) headlightBtn.addEventListener('click', () => window.roverController.toggleHeadlights());

  const sampleSoilBtn = document.getElementById('sampleSoilBtn');
  if (sampleSoilBtn && window.roverController) sampleSoilBtn.addEventListener('click', () => window.roverController.triggerSoilSample());

  // DGMS Report
  const dgmsReportBtn = document.getElementById('generateDgmsReportBtn');
  if (dgmsReportBtn && window.reportGenerator) {
    dgmsReportBtn.addEventListener('click', () => window.reportGenerator.generateDgmsReport());
  }

  // Modal
  const modalCloseBtn = document.getElementById('generalModalClose');
  const modal = document.getElementById('generalModal');
  if (modalCloseBtn && modal) {
    modalCloseBtn.addEventListener('click', () => modal.classList.remove('open'));
    modal.addEventListener('click', (e) => {
      if (e.target === modal) modal.classList.remove('open');
    });
  }

  // Calibration controls
  const calibToggle = document.getElementById('calibToggleCheckbox');
  const mq4R0Input = document.getElementById('mq4R0Input');
  const mq4RlInput = document.getElementById('mq4RlInput');
  const mq7R0Input = document.getElementById('mq7R0Input');
  const mq7RlInput = document.getElementById('mq7RlInput');

  if (calibToggle && window.telemetryGauges) {
    calibToggle.addEventListener('change', (e) => {
      window.telemetryGauges.calibration.enabled = e.target.checked;
      window.telemetryGauges.renderHUD();
    });
  }

  const updateCalibValues = () => {
    if (!window.telemetryGauges) return;
    if (mq4R0Input) window.telemetryGauges.calibration.mq4_r0 = parseFloat(mq4R0Input.value) || 10.0;
    if (mq4RlInput) window.telemetryGauges.calibration.mq4_rl = parseFloat(mq4RlInput.value) || 20.0;
    if (mq7R0Input) window.telemetryGauges.calibration.mq7_r0 = parseFloat(mq7R0Input.value) || 10.0;
    if (mq7RlInput) window.telemetryGauges.calibration.mq7_rl = parseFloat(mq7RlInput.value) || 10.0;
    window.telemetryGauges.renderHUD();
  };

  [mq4R0Input, mq4RlInput, mq7R0Input, mq7RlInput].forEach(inp => {
    if (inp) inp.addEventListener('input', updateCalibValues);
  });

  // Start initial camera simulation
  if (window.cameraAi) window.cameraAi.connectStream();

  console.log("SIH26039 App Initialized Successfully!");
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', initializeApp);
} else {
  initializeApp();
}
