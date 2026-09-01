/**
 * SIH26039: AI-POWERED MINE RESCUE ROVER - GROUND CONTROL STATION
 * Module: Realistic Mine Disaster Simulation Engine
 * Generates synthetic telemetry conforming strictly to APIs 1, 2, 4, 5, 6.
 * Essential for hackathon presentations, judging demos, and automated testing.
 */

class MineSimulator {
  constructor() {
    this.isRunning = false;
    this.activeScenario = 'NORMAL'; // 'NORMAL', 'METHANE_BURST', 'OBSTACLE', 'TRAPPED_MINER', 'FLOODING'
    this.timerId = null;
    this.lidarAngle = 0;
    this.lidarDirection = 1; // 1 = increasing, -1 = decreasing
    this.tickCount = 0;

    // Base environmental state
    this.simState = {
      ch4_raw: 350,
      co_raw: 220,
      temp_c: 26.5,
      humidity_pct: 62.0,
      pressure_hpa: 1024.0,
      ir_obstacle: false
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

    if (this.timerId) clearInterval(this.timerId);
    // Stream at ~20 Hz for smooth LiDAR sweep & telemetry (target 2-5 Hz for LiDAR points)
    this.timerId = setInterval(() => this.tick(), 50);
  }

  stop() {
    this.isRunning = false;
    if (this.timerId) clearInterval(this.timerId);
    this.timerId = null;
    if (window.serialManager && window.serialManager.transportType === 'SIMULATOR') {
      window.serialManager.notifyStatus('DISCONNECTED');
    }
  }

  setScenario(scenario) {
    this.activeScenario = scenario;
    if (window.cameraAi) {
      window.cameraAi.setSimulatedDetections(scenario);
    }

    if (scenario === 'NORMAL') {
      this.simState = { ch4_raw: 380, co_raw: 210, temp_c: 26.8, humidity_pct: 60.0, pressure_hpa: 1022.0, ir_obstacle: false };
      if (window.alarmSystem) window.alarmSystem.clearAlert();
    } else if (scenario === 'METHANE_BURST') {
      this.simState = { ch4_raw: 3100, co_raw: 1450, temp_c: 34.2, humidity_pct: 75.0, pressure_hpa: 1028.5, ir_obstacle: false };
      if (window.alarmSystem) {
        window.alarmSystem.setAlert('CRITICAL', 'Methane (CH4) level exceeds DGMS threshold (3100 ADC / 2.8% LEL)! Evacuate Sector 4.', 'Danger. High methane gas concentration detected in Sector 4. Immediate evacuation recommended.');
      }
    } else if (scenario === 'OBSTACLE') {
      this.simState = { ch4_raw: 600, co_raw: 300, temp_c: 27.5, humidity_pct: 65.0, pressure_hpa: 1023.0, ir_obstacle: true };
      if (window.alarmSystem) {
        window.alarmSystem.setAlert('WARNING', 'Tunnel collapse debris detected 38cm ahead! IR Proximity tripped.', 'Caution. Obstacle detected within 40 centimeters. Rover forward path blocked.');
      }
    } else if (scenario === 'TRAPPED_MINER') {
      this.simState = { ch4_raw: 450, co_raw: 280, temp_c: 28.0, humidity_pct: 68.0, pressure_hpa: 1024.0, ir_obstacle: false };
      if (window.alarmSystem) {
        window.alarmSystem.setAlert('WARNING', 'AI Computer Vision detected Trapped Miner signature (94% confidence) in Shaft 3.', 'Survivor located. Trapped worker detected with safety helmet in Shaft 3.');
      }
    } else if (scenario === 'FLOODING') {
      this.simState = { ch4_raw: 520, co_raw: 240, temp_c: 24.1, humidity_pct: 92.0, pressure_hpa: 1030.0, ir_obstacle: false };
      this.triggerSampleEvent(88);
      if (window.alarmSystem) {
        window.alarmSystem.setAlert('WARNING', 'High moisture / water slurry influx detected. Soil sample auto-captured.', 'Water influx hazard detected. Soil moisture 88 percent.');
      }
    }
  }

  tick() {
    this.tickCount++;

    // 1. Sweep LiDAR Servo Mirror (0 to 180 degrees back and forth)
    this.lidarAngle += this.lidarDirection * 4.5;
    if (this.lidarAngle >= 180) {
      this.lidarAngle = 180;
      this.lidarDirection = -1;
    } else if (this.lidarAngle <= 0) {
      this.lidarAngle = 0;
      this.lidarDirection = 1;
    }

    // Calculate synthetic distance based on tunnel geometry + scenario
    let distanceCm = 160 + Math.sin(this.lidarAngle * (Math.PI / 180)) * 60 + (Math.random() * 8 - 4);
    
    // In obstacle scenario, front arc (60° to 120°) has close rockfall
    if (this.activeScenario === 'OBSTACLE' && this.lidarAngle >= 60 && this.lidarAngle <= 120) {
      distanceCm = 35 + Math.random() * 8;
    } else if (this.activeScenario === 'TRAPPED_MINER' && this.lidarAngle >= 80 && this.lidarAngle <= 100) {
      distanceCm = 75 + Math.random() * 5; // human body reflection
    }

    // Emit API 1 LiDAR Point
    const lidarPacket = {
      type: "telemetry",
      angle_deg: parseFloat(this.lidarAngle.toFixed(1)),
      distance_cm: Math.round(distanceCm),
      timestamp: Date.now()
    };
    if (window.serialManager) {
      window.serialManager.routePacket(lidarPacket);
    }

    // Emit API 2 Gas & Environment Telemetry at ~2 Hz (every 10 ticks)
    if (this.tickCount % 10 === 0) {
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
        timestamp: Date.now()
      };

      if (window.serialManager) {
        window.serialManager.routePacket(gasPacket);
      }
    }
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
  }
}

window.simulator = new MineSimulator();
