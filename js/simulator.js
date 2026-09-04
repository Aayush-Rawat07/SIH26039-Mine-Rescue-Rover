/**
 * SIH26039: AI-POWERED MINE RESCUE ROVER - GROUND CONTROL STATION
 * Module: Subterranean 3D Mine Tunnel Simulation Engine
 * Generates synthetic 3D LiDAR point clouds (Azimuth, Elevation, Distance)
 * and multi-gas / environmental / diagnostics telemetry conforming strictly to APIs 1-6.
 */

class MineSimulator {
  constructor() {
    this.isRunning = false;
    this.activeScenario = 'NORMAL'; // 'NORMAL', 'METHANE_BURST', 'OBSTACLE', 'TRAPPED_MINER', 'FLOODING'
    this.timerId = null;
    
    // 3D Pan-Tilt Sweep State
    this.azimuthDeg = 0;
    this.azimuthDirection = 1;
    this.elevationDeg = -20;
    this.elevationDirection = 1;
    this.tickCount = 0;

    // Environmental & Hardware State
    this.simState = {
      ch4_raw: 350,
      co_raw: 220,
      temp_c: 26.5,
      humidity_pct: 62.0,
      pressure_hpa: 1024.0,
      ir_obstacle: false,
      battery_v: 12.4,
      lora_rssi: -68,
      lora_snr: 9.5
    };
  }

  start(scenario = 'NORMAL') {
    this.isRunning = true;
    this.activeScenario = scenario;
    this.setScenario(scenario);

    if (window.serialManager) {
      window.serialManager.transportType = 'SIMULATOR';
      window.serialManager.notifyStatus('CONNECTED', { mode: `SIMULATOR [${scenario}]` });
    }

    if (window.eventLogger) {
      window.eventLogger.log('INFO', 'SIM', `Subterranean Disaster Simulation started: ${scenario}`);
    }

    if (this.timerId) clearInterval(this.timerId);
    // 30 Hz tick for rapid 3D point cloud generation
    this.timerId = setInterval(() => this.tick(), 35);
  }

  stop() {
    this.isRunning = false;
    if (this.timerId) clearInterval(this.timerId);
    this.timerId = null;

    if (window.serialManager && window.serialManager.transportType === 'SIMULATOR') {
      window.serialManager.notifyStatus('DISCONNECTED');
    }

    if (window.eventLogger) {
      window.eventLogger.log('INFO', 'SIM', 'Simulation stopped.');
    }
  }

  setScenario(scenario) {
    this.activeScenario = scenario;
    if (window.cameraAi) {
      window.cameraAi.setSimulatedDetections(scenario);
    }

    if (scenario === 'NORMAL') {
      this.simState.ch4_raw = 380;
      this.simState.co_raw = 210;
      this.simState.temp_c = 26.8;
      this.simState.humidity_pct = 60.0;
      this.simState.pressure_hpa = 1022.0;
      this.simState.ir_obstacle = false;
      if (window.alarmSystem) window.alarmSystem.clearAlert();
      if (window.eventLogger) window.eventLogger.log('INFO', 'SIM', 'Scenario set: Normal Subterranean Patrol.');
    } else if (scenario === 'METHANE_BURST') {
      this.simState.ch4_raw = 3100;
      this.simState.co_raw = 1450;
      this.simState.temp_c = 34.2;
      this.simState.humidity_pct = 75.0;
      this.simState.pressure_hpa = 1028.5;
      this.simState.ir_obstacle = false;
      if (window.alarmSystem) {
        window.alarmSystem.setAlert('CRITICAL', 'Methane (CH4) level exceeds DGMS threshold (3100 ADC / 2.8% LEL)! Evacuate Sector 4.', 'Danger. High methane gas concentration detected in Sector 4. Immediate evacuation recommended.');
      }
      if (window.eventLogger) window.eventLogger.log('CRIT', 'GAS', 'CH4 Spike > 3000 ADC detected! DGMS Reg 169 breached.');
    } else if (scenario === 'OBSTACLE') {
      this.simState.ch4_raw = 600;
      this.simState.co_raw = 300;
      this.simState.temp_c = 27.5;
      this.simState.humidity_pct = 65.0;
      this.simState.pressure_hpa = 1023.0;
      this.simState.ir_obstacle = true;
      if (window.alarmSystem) {
        window.alarmSystem.setAlert('WARNING', 'Tunnel collapse debris detected 38cm ahead! IR Proximity tripped.', 'Caution. Obstacle detected within 40 centimeters. Rover forward path blocked.');
      }
      if (window.eventLogger) window.eventLogger.log('WARN', 'LIDAR', '3D Tunnel Cross-Section blocked: Rockfall debris 38cm.');
    } else if (scenario === 'TRAPPED_MINER') {
      this.simState.ch4_raw = 450;
      this.simState.co_raw = 280;
      this.simState.temp_c = 28.0;
      this.simState.humidity_pct = 68.0;
      this.simState.pressure_hpa = 1024.0;
      this.simState.ir_obstacle = false;
      if (window.alarmSystem) {
        window.alarmSystem.setAlert('WARNING', 'AI Computer Vision detected Trapped Miner signature (94% confidence) in Shaft 3.', 'Survivor located. Trapped worker detected with safety helmet in Shaft 3.');
      }
      if (window.eventLogger) window.eventLogger.log('WARN', 'AI', 'Survivor detected in Shaft 3 (94% confidence).');
    } else if (scenario === 'FLOODING') {
      this.simState.ch4_raw = 520;
      this.simState.co_raw = 240;
      this.simState.temp_c = 24.1;
      this.simState.humidity_pct = 92.0;
      this.simState.pressure_hpa = 1030.0;
      this.simState.ir_obstacle = false;
      this.triggerSampleEvent(88);
      if (window.alarmSystem) {
        window.alarmSystem.setAlert('WARNING', 'High moisture / water slurry influx detected. Soil sample auto-captured.', 'Water influx hazard detected. Soil moisture 88 percent.');
      }
      if (window.eventLogger) window.eventLogger.log('WARN', 'SAMPLE', 'High moisture slurry event (88%). Auto-sampling soil.');
    }
  }

  tick() {
    this.tickCount++;

    // 1. Dual-Axis 3D LiDAR Sweep:
    // Azimuth sweeps 0° to 180° horizontally
    this.azimuthDeg += this.azimuthDirection * 6.0;
    if (this.azimuthDeg >= 180) {
      this.azimuthDeg = 180;
      this.azimuthDirection = -1;
      // Step elevation vertically
      this.stepElevation();
    } else if (this.azimuthDeg <= 0) {
      this.azimuthDeg = 0;
      this.azimuthDirection = 1;
      this.stepElevation();
    }

    // 2. Compute realistic 3D distance based on Subterranean Tunnel Cross-Section
    const distanceCm = this.calculate3DTunnelDistance(this.azimuthDeg, this.elevationDeg);

    // Emit 3D LiDAR Packet
    const lidarPacket = {
      type: "lidar_3d",
      azimuth_deg: parseFloat(this.azimuthDeg.toFixed(1)),
      elevation_deg: parseFloat(this.elevationDeg.toFixed(1)),
      distance_cm: Math.round(distanceCm),
      intensity: Math.round(120 + Math.random() * 50),
      timestamp: Date.now()
    };

    if (window.serialManager) {
      window.serialManager.routePacket(lidarPacket);
    }

    // 3. Emit API 2 Gas & Environmental Telemetry at ~2 Hz (every 15 ticks)
    if (this.tickCount % 15 === 0) {
      const gasNoise = () => Math.round(Math.random() * 20 - 10);
      const envNoise = () => (Math.random() * 0.4 - 0.2);

      const gasPacket = {
        type: "telemetry",
        ch4_raw: Math.max(0, this.simState.ch4_raw + gasNoise()),
        co_raw: Math.max(0, this.simState.co_raw + gasNoise()),
        temp_c: parseFloat((this.simState.temp_c + envNoise()).toFixed(1)),
        humidity_pct: parseFloat((this.simState.humidity_pct + envNoise()).toFixed(1)),
        pressure_hpa: parseFloat((this.simState.pressure_hpa + envNoise()).toFixed(1)),
        ir_obstacle: this.simState.ir_obstacle,
        battery_v: parseFloat((this.simState.battery_v - 0.0001).toFixed(2)),
        lora_rssi: Math.round(-65 + (Math.random() * 6 - 3)),
        lora_snr: parseFloat((9.5 + (Math.random() * 1.5 - 0.75)).toFixed(1)),
        timestamp: Date.now()
      };

      if (window.serialManager) {
        window.serialManager.routePacket(gasPacket);
      }
    }
  }

  stepElevation() {
    this.elevationDeg += this.elevationDirection * 5.0;
    if (this.elevationDeg >= 25) {
      this.elevationDeg = 25;
      this.elevationDirection = -1;
    } else if (this.elevationDeg <= -20) {
      this.elevationDeg = -20;
      this.elevationDirection = 1;
    }
  }

  /**
   * Ray-surface intersection model of a coal mine tunnel
   * Cross section: width = 280cm (x = -140 to +140), height = 220cm (z = 0 to 220)
   */
  calculate3DTunnelDistance(azimuthDeg, elevationDeg) {
    const azRad = (azimuthDeg - 90) * (Math.PI / 180);
    const elRad = elevationDeg * (Math.PI / 180);

    const cosEl = Math.cos(elRad);
    const sinEl = Math.sin(elRad);
    const sinAz = Math.sin(azRad);
    const cosAz = Math.cos(azRad);

    let d = 260; // Default distance forward

    // If pointing downward (floor collision)
    if (sinEl < -0.15) {
      const dFloor = -18 / sinEl; // sensor height ~18cm
      if (dFloor > 0 && dFloor < d) d = dFloor;
    }

    // If pointing upward (arched ceiling collision ~120cm above sensor)
    if (sinEl > 0.15) {
      const dCeil = 115 / sinEl;
      if (dCeil > 0 && dCeil < d) d = dCeil;
    }

    // If pointing sideways (left/right rib wall collision ~140cm from center)
    if (Math.abs(sinAz * cosEl) > 0.3) {
      const dWall = 140 / Math.abs(sinAz * cosEl);
      if (dWall > 0 && dWall < d) d = dWall;
    }

    // Add rugged subterranean rock noise
    d += (Math.random() * 10 - 5);

    // Scenario 1: Obstacle rockfall pile in front
    if (this.activeScenario === 'OBSTACLE' && azimuthDeg >= 60 && azimuthDeg <= 120 && elevationDeg <= 10) {
      d = 38 + Math.random() * 10;
    }

    // Scenario 2: Trapped miner silhouette
    if (this.activeScenario === 'TRAPPED_MINER' && azimuthDeg >= 80 && azimuthDeg <= 105 && elevationDeg >= -5 && elevationDeg <= 18) {
      d = 78 + Math.random() * 6;
    }

    return Math.max(15, Math.min(600, d));
  }

  triggerSampleEvent(moisture = null) {
    const moisturePct = moisture !== null ? moisture : Math.round(35 + Math.random() * 50);
    const samplePacket = {
      type: "sample_event",
      timestamp: Date.now(),
      hygrometer_pct: moisturePct
    };

    if (window.serialManager) {
      window.serialManager.routePacket(samplePacket);
    }
    if (window.eventLogger) {
      window.eventLogger.log('SAMPLE', 'SCOOP', `Soil moisture sampled: ${moisturePct}%`);
    }
  }
}

window.simulator = new MineSimulator();
