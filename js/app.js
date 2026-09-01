/**
 * SIH26039: AI-POWERED MINE RESCUE ROVER - GROUND CONTROL STATION
 * Main Application Orchestrator & Event Coordinator
 */

document.addEventListener('DOMContentLoaded', () => {
  console.log("Initializing SIH26039 Mine Rescue GCS...");

  // 1. Initialize Navigation Tabs
  const tabBtns = document.querySelectorAll('.tab-btn');
  const tabContents = document.querySelectorAll('.tab-content');

  tabBtns.forEach(btn => {
    btn.addEventListener('click', () => {
      const targetTab = btn.getAttribute('data-tab');
      tabBtns.forEach(b => b.classList.remove('active'));
      tabContents.forEach(tc => tc.classList.remove('active'));

      btn.classList.add('active');
      const targetContent = document.getElementById(targetTab);
      if (targetContent) {
        targetContent.classList.add('active');
        // Refresh canvas sizes if active
        if (targetTab === 'tabLidar' && window.lidarVisualizer) {
          window.lidarVisualizer.resizeRadar();
        }
      }
    });
  });

  // 2. Wire Web Serial API & Connection Buttons
  const connectSerialBtn = document.getElementById('connectSerialBtn');
  const connectWsBtn = document.getElementById('connectWsBtn');
  const disconnectBtn = document.getElementById('disconnectBtn');
  const statusPill = document.getElementById('connectionStatusPill');
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
      if (wsUrl) {
        window.serialManager.connectWebSocket(wsUrl);
      }
    });
  }

  if (disconnectBtn) {
    disconnectBtn.addEventListener('click', async () => {
      if (window.simulator && window.simulator.isRunning) {
        window.simulator.stop();
      }
      await window.serialManager.disconnect();
    });
  }

  // Update Connection Status in UI
  window.serialManager.on('statusChange', ({ status, transport, baudRate, url, mode, error }) => {
    if (!statusPill || !statusDot || !statusText) return;

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

  // 3. Dispatch Incoming Telemetry to Modules
  window.serialManager.on('telemetry', (packet) => {
    // API 1: LiDAR Point Cloud
    if (packet.angle_deg !== undefined && packet.distance_cm !== undefined) {
      if (window.lidarVisualizer) {
        window.lidarVisualizer.addPoint(packet.angle_deg, packet.distance_cm, packet.timestamp);
      }
    }

    // API 5: IR Obstacle Detection
    if (packet.ir_obstacle !== undefined) {
      if (window.lidarVisualizer) {
        window.lidarVisualizer.setIrObstacle(packet.ir_obstacle);
      }
    }

    // API 2: Gas & Environmental Telemetry
    if (packet.ch4_raw !== undefined || packet.co_raw !== undefined || packet.temp_c !== undefined) {
      if (window.telemetryGauges) {
        window.telemetryGauges.updateTelemetry(packet);
      }

      // Check DGMS limits for warning/critical alarms
      const ch4 = packet.ch4_raw || 0;
      const co = packet.co_raw || 0;
      if (ch4 >= 2600) {
        window.alarmSystem.setAlert('CRITICAL', `High Methane Leak (${ch4} ADC / Dangerous Explosibility)!`, 'Danger. High methane concentration detected.');
      } else if (co >= 1800) {
        window.alarmSystem.setAlert('CRITICAL', `Carbon Monoxide Poisoning Threshold Exceeded (${co} ADC)!`, 'Danger. High carbon monoxide levels detected.');
      } else if (packet.ir_obstacle) {
        window.alarmSystem.setAlert('WARNING', 'Obstacle / Wall in Proximity (<50cm)!', 'Warning. Obstacle detected in forward path.');
      } else if (ch4 >= 1800 || co >= 1200) {
        window.alarmSystem.setAlert('WARNING', 'Atmospheric gas readings elevated above standard baseline.', null);
      } else {
        // Clear if in normal range
        if (!window.simulator || window.simulator.activeScenario === 'NORMAL') {
          window.alarmSystem.clearAlert();
        }
      }
    }
  });

  // API 4: Picture interval / sample-event trigger
  window.serialManager.on('sample_event', (packet) => {
    if (window.sampleGallery) {
      window.sampleGallery.handleSampleEvent(packet);
    }
  });

  // 4. Simulator Scenario Selector
  const simSelect = document.getElementById('simScenarioSelect');
  const simStartBtn = document.getElementById('simStartBtn');
  const simStopBtn = document.getElementById('simStopBtn');

  if (simStartBtn && simSelect) {
    simStartBtn.addEventListener('click', () => {
      const scenario = simSelect.value;
      window.simulator.start(scenario);
      if (simStartBtn) simStartBtn.style.display = 'none';
      if (simStopBtn) simStopBtn.style.display = 'inline-flex';
    });
  }

  if (simStopBtn) {
    simStopBtn.addEventListener('click', () => {
      window.simulator.stop();
      if (simStartBtn) simStartBtn.style.display = 'inline-flex';
      if (simStopBtn) simStopBtn.style.display = 'none';
    });
  }

  if (simSelect) {
    simSelect.addEventListener('change', (e) => {
      if (window.simulator.isRunning) {
        window.simulator.setScenario(e.target.value);
      }
    });
  }

  // 5. Camera Controls
  const camIpInput = document.getElementById('espCamIpInput');
  const camConnectBtn = document.getElementById('espCamConnectBtn');
  const camFilterNormal = document.getElementById('camFilterNormal');
  const camFilterNight = document.getElementById('camFilterNight');
  const camFilterThermal = document.getElementById('camFilterThermal');
  const manualSnapshotBtn = document.getElementById('manualSnapshotBtn');

  if (camConnectBtn && camIpInput) {
    camConnectBtn.addEventListener('click', () => {
      window.cameraAi.setCamIp(camIpInput.value);
      window.cameraAi.connectStream();
    });
  }

  if (camFilterNormal) camFilterNormal.addEventListener('click', () => window.cameraAi.setFilter('NORMAL'));
  if (camFilterNight) camFilterNight.addEventListener('click', () => window.cameraAi.setFilter('NIGHT_VISION'));
  if (camFilterThermal) camFilterThermal.addEventListener('click', () => window.cameraAi.setFilter('THERMAL'));
  if (manualSnapshotBtn) manualSnapshotBtn.addEventListener('click', () => window.roverController.triggerSoilSample());

  // 6. LiDAR View Mode Controls
  const lidar2dBtn = document.getElementById('lidarMode2dBtn');
  const lidar3dBtn = document.getElementById('lidarMode3dBtn');
  const lidarClearBtn = document.getElementById('lidarClearBtn');
  const lidarExportBtn = document.getElementById('lidarExportBtn');

  if (lidar2dBtn) {
    lidar2dBtn.addEventListener('click', () => {
      window.lidarVisualizer.setViewMode('2D_RADAR');
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
      window.lidarVisualizer.setViewMode('3D_TUNNEL');
      lidar3dBtn.classList.add('btn-primary');
      lidar3dBtn.classList.remove('btn-outline');
      if (lidar2dBtn) {
        lidar2dBtn.classList.remove('btn-primary');
        lidar2dBtn.classList.add('btn-outline');
      }
    });
  }

  const lidarExportXyzBtn = document.getElementById('lidarExportXyzBtn');
  const lidarExportCsvBtn = document.getElementById('lidarExportCsvBtn');

  if (lidarExportXyzBtn) lidarExportXyzBtn.addEventListener('click', () => window.lidarVisualizer.exportXYZ());
  if (lidarExportCsvBtn) lidarExportCsvBtn.addEventListener('click', () => window.lidarVisualizer.exportPointCloudCSV());

  // 7. Teleoperation Speed Slider
  const speedSlider = document.getElementById('teleopSpeedSlider');
  if (speedSlider) {
    speedSlider.addEventListener('input', (e) => window.roverController.setSpeed(e.target.value));
  }

  const estopBtn = document.getElementById('estopBtn');
  if (estopBtn) estopBtn.addEventListener('click', () => window.roverController.emergencyStop());

  const headlightBtn = document.getElementById('headlightToggleBtn');
  if (headlightBtn) headlightBtn.addEventListener('click', () => window.roverController.toggleHeadlights());

  const sampleSoilBtn = document.getElementById('sampleSoilBtn');
  if (sampleSoilBtn) sampleSoilBtn.addEventListener('click', () => window.roverController.triggerSoilSample());

  // 8. DGMS Incident Report Generator
  const dgmsReportBtn = document.getElementById('generateDgmsReportBtn');
  if (dgmsReportBtn) {
    dgmsReportBtn.addEventListener('click', () => window.reportGenerator.generateDgmsReport());
  }

  // 9. Modal Close Handler
  const modalCloseBtn = document.getElementById('generalModalClose');
  const modal = document.getElementById('generalModal');
  if (modalCloseBtn && modal) {
    modalCloseBtn.addEventListener('click', () => modal.classList.remove('open'));
    modal.addEventListener('click', (e) => {
      if (e.target === modal) modal.classList.remove('open');
    });
  }

  // 10. Calibration Tuning Controls
  const calibToggle = document.getElementById('calibToggleCheckbox');
  const mq4R0Input = document.getElementById('mq4R0Input');
  const mq4RlInput = document.getElementById('mq4RlInput');
  const mq7R0Input = document.getElementById('mq7R0Input');
  const mq7RlInput = document.getElementById('mq7RlInput');

  if (calibToggle) {
    calibToggle.addEventListener('change', (e) => {
      window.telemetryGauges.calibration.enabled = e.target.checked;
      window.telemetryGauges.renderHUD();
    });
  }

  const updateCalibValues = () => {
    if (mq4R0Input) window.telemetryGauges.calibration.mq4_r0 = parseFloat(mq4R0Input.value) || 10.0;
    if (mq4RlInput) window.telemetryGauges.calibration.mq4_rl = parseFloat(mq4RlInput.value) || 20.0;
    if (mq7R0Input) window.telemetryGauges.calibration.mq7_r0 = parseFloat(mq7R0Input.value) || 10.0;
    if (mq7RlInput) window.telemetryGauges.calibration.mq7_rl = parseFloat(mq7RlInput.value) || 10.0;
    window.telemetryGauges.renderHUD();
  };

  [mq4R0Input, mq4RlInput, mq7R0Input, mq7RlInput].forEach(inp => {
    if (inp) inp.addEventListener('input', updateCalibValues);
  });

  // Start initial camera feed simulation
  window.cameraAi.connectStream();

  console.log("SIH26039 Mine Rescue GCS initialized successfully!");
});
