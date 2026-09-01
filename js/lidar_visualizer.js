/**
 * SIH26039: AI-POWERED MINE RESCUE ROVER - GROUND CONTROL STATION
 * Module: LiDAR Point Cloud & 2D/3D SLAM Tunnel Visualizer
 * Implements API 1 (angle_deg, distance_cm) & API 5 (ir_obstacle)
 */

class LidarVisualizer {
  constructor(radarCanvasId, threejsContainerId) {
    this.radarCanvas = document.getElementById(radarCanvasId);
    this.threejsContainer = document.getElementById(threejsContainerId);
    
    this.points = []; // [{x, y, z, angle, distance, timestamp, isObstacle}]
    this.maxPoints = 1200;
    this.currentAngle = 0;
    this.currentDistance = 0;
    this.obstacleThresholdCm = 50; // Distance below which is flagged as hazard
    this.irObstacleFlag = false;
    this.viewMode = '2D_RADAR'; // '2D_RADAR' or '3D_TUNNEL'
    
    // 2D Radar Context
    if (this.radarCanvas) {
      this.ctx = this.radarCanvas.getContext('2d');
      this.resizeRadar();
      window.addEventListener('resize', () => this.resizeRadar());
    }

    // 3D Three.js scene setup
    this.scene = null;
    this.camera = null;
    this.renderer = null;
    this.pointCloudMesh = null;
    this.roverMarker = null;
    this.is3DInitialized = false;

    this.init3DScene();
    this.startRenderLoop();
  }

  resizeRadar() {
    if (!this.radarCanvas) return;
    const rect = this.radarCanvas.parentElement.getBoundingClientRect();
    this.radarCanvas.width = rect.width;
    this.radarCanvas.height = rect.height || 420;
  }

  /**
   * Ingest API 1 LiDAR telemetry point: { angle_deg, distance_cm, timestamp }
   */
  addPoint(angleDeg, distanceCm, timestamp = Date.now()) {
    if (isNaN(angleDeg) || isNaN(distanceCm) || distanceCm <= 0) return;

    this.currentAngle = angleDeg;
    this.currentDistance = distanceCm;

    // Convert Polar to Cartesian (Rover forward = Y axis, right = X axis)
    // TF-Luna servo sweep arc is typically 0 to 180 degrees (90 = straight ahead)
    const rad = (angleDeg - 90) * (Math.PI / 180);
    const x = distanceCm * Math.sin(rad);
    const y = distanceCm * Math.cos(rad);
    const z = 0; // Single-slice LiDAR scan; can accumulate along travel direction

    const isObstacle = distanceCm < this.obstacleThresholdCm || this.irObstacleFlag;

    this.points.push({
      x, y, z,
      angle: angleDeg,
      distance: distanceCm,
      timestamp,
      isObstacle
    });

    if (this.points.length > this.maxPoints) {
      this.points.shift();
    }

    this.update3DPoints();
  }

  setIrObstacle(detected) {
    this.irObstacleFlag = detected;
  }

  clearPoints() {
    this.points = [];
    if (this.pointCloudMesh && this.scene) {
      this.scene.remove(this.pointCloudMesh);
      this.pointCloudMesh = null;
    }
  }

  /**
   * 2D Polar Tactical Radar Rendering
   */
  drawRadar() {
    if (!this.radarCanvas || !this.ctx) return;
    const ctx = this.ctx;
    const w = this.radarCanvas.width;
    const h = this.radarCanvas.height;

    // Clear background
    ctx.fillStyle = '#05070a';
    ctx.fillRect(0, 0, w, h);

    const centerX = w / 2;
    const centerY = h - 30; // Rover base is at bottom center for 180 deg forward sweep
    const maxRadius = Math.min(w / 2 - 20, h - 50);
    const maxRangeCm = 300; // 3 meters visual range scale

    // Draw range rings
    ctx.lineWidth = 1;
    const ranges = [50, 100, 200, 300];
    ranges.forEach((range) => {
      const r = (range / maxRangeCm) * maxRadius;
      ctx.beginPath();
      ctx.arc(centerX, centerY, r, Math.PI, 0); // 180-degree top hemisphere
      ctx.strokeStyle = range === 50 ? 'rgba(239, 68, 68, 0.4)' : 'rgba(6, 182, 212, 0.2)';
      ctx.stroke();

      // Range text
      ctx.fillStyle = '#64748b';
      ctx.font = '10px monospace';
      ctx.fillText(`${range}cm`, centerX + 6, centerY - r + 4);
    });

    // Draw radial angle guidelines (0, 30, 45, 60, 90, 120, 135, 150, 180)
    const angles = [0, 30, 45, 60, 90, 120, 135, 150, 180];
    angles.forEach(deg => {
      const rad = deg * (Math.PI / 180);
      const endX = centerX - maxRadius * Math.cos(rad);
      const endY = centerY - maxRadius * Math.sin(rad);

      ctx.beginPath();
      ctx.moveTo(centerX, centerY);
      ctx.lineTo(endX, endY);
      ctx.strokeStyle = deg === 90 ? 'rgba(6, 182, 212, 0.4)' : 'rgba(36, 50, 82, 0.4)';
      ctx.stroke();

      ctx.fillStyle = '#64748b';
      ctx.font = '9px monospace';
      ctx.fillText(`${deg}°`, endX - 10, endY - 4);
    });

    // Draw Current Sweep Ray
    const sweepRad = this.currentAngle * (Math.PI / 180);
    const sweepX = centerX - maxRadius * Math.cos(sweepRad);
    const sweepY = centerY - maxRadius * Math.sin(sweepRad);

    ctx.beginPath();
    ctx.moveTo(centerX, centerY);
    ctx.lineTo(sweepX, sweepY);
    ctx.strokeStyle = '#06b6d4';
    ctx.lineWidth = 2;
    ctx.shadowBlur = 8;
    ctx.shadowColor = '#06b6d4';
    ctx.stroke();
    ctx.shadowBlur = 0;

    // Draw Point Cloud
    const now = Date.now();
    for (let i = 0; i < this.points.length; i++) {
      const p = this.points[i];
      const ageMs = now - p.timestamp;
      const alpha = Math.max(0.15, 1.0 - (ageMs / 8000));

      const scaledR = (p.distance / maxRangeCm) * maxRadius;
      const ptRad = p.angle * (Math.PI / 180);
      const px = centerX - scaledR * Math.cos(ptRad);
      const py = centerY - scaledR * Math.sin(ptRad);

      ctx.beginPath();
      ctx.arc(px, py, p.isObstacle ? 3.5 : 2.5, 0, Math.PI * 2);

      if (p.isObstacle) {
        ctx.fillStyle = `rgba(239, 68, 68, ${alpha})`;
        ctx.shadowBlur = 6;
        ctx.shadowColor = '#ef4444';
      } else if (p.distance < 100) {
        ctx.fillStyle = `rgba(245, 158, 11, ${alpha})`;
        ctx.shadowBlur = 0;
      } else {
        ctx.fillStyle = `rgba(16, 185, 129, ${alpha})`;
        ctx.shadowBlur = 0;
      }
      ctx.fill();
    }
    ctx.shadowBlur = 0;

    // Draw Rover base indicator
    ctx.beginPath();
    ctx.arc(centerX, centerY, 8, 0, Math.PI * 2);
    ctx.fillStyle = '#f59e0b';
    ctx.fill();
    ctx.strokeStyle = '#fff';
    ctx.lineWidth = 1.5;
    ctx.stroke();

    // IR Obstacle Red Alert Cone
    if (this.irObstacleFlag) {
      ctx.beginPath();
      ctx.arc(centerX, centerY, 40, Math.PI * 1.2, Math.PI * 1.8);
      ctx.lineTo(centerX, centerY);
      ctx.fillStyle = 'rgba(239, 68, 68, 0.35)';
      ctx.fill();
    }
  }

  /**
   * Three.js 3D Point Cloud Tunnel Scene Initialization
   */
  init3DScene() {
    if (typeof THREE === 'undefined' || !this.threejsContainer) return;

    try {
      const w = this.threejsContainer.clientWidth || 600;
      const h = this.threejsContainer.clientHeight || 420;

      this.scene = new THREE.Scene();
      this.scene.background = new THREE.Color(0x05070a);
      this.scene.fog = new THREE.FogExp2(0x05070a, 0.005);

      this.camera = new THREE.PerspectiveCamera(60, w / h, 0.1, 2000);
      this.camera.position.set(0, -180, 220);
      this.camera.lookAt(0, 80, 0);

      this.renderer = new THREE.WebGLRenderer({ antialias: true });
      this.renderer.setSize(w, h);
      this.threejsContainer.appendChild(this.renderer.domElement);

      // Tunnel grid & wireframe tunnel arch
      const gridHelper = new THREE.GridHelper(600, 30, 0x06b6d4, 0x1e293b);
      gridHelper.rotation.x = Math.PI / 2;
      this.scene.add(gridHelper);

      // Rover 3D Body Marker
      const roverGeo = new THREE.BoxGeometry(20, 30, 10);
      const roverMat = new THREE.MeshBasicMaterial({ color: 0xf59e0b, wireframe: true });
      this.roverMarker = new THREE.Mesh(roverGeo, roverMat);
      this.roverMarker.position.set(0, 0, 5);
      this.scene.add(this.roverMarker);

      this.is3DInitialized = true;
    } catch (e) {
      console.warn("WebGL 3D setup skipped (will use Canvas 2D):", e);
    }
  }

  update3DPoints() {
    if (!this.is3DInitialized || typeof THREE === 'undefined') return;

    if (this.pointCloudMesh) {
      this.scene.remove(this.pointCloudMesh);
    }

    const geometry = new THREE.BufferGeometry();
    const positions = [];
    const colors = [];

    const colorNear = new THREE.Color(0xef4444);
    const colorMid = new THREE.Color(0xf59e0b);
    const colorFar = new THREE.Color(0x10b981);

    this.points.forEach(p => {
      positions.push(p.x, p.y, p.z);

      if (p.isObstacle) {
        colors.push(colorNear.r, colorNear.g, colorNear.b);
      } else if (p.distance < 120) {
        colors.push(colorMid.r, colorMid.g, colorMid.b);
      } else {
        colors.push(colorFar.r, colorFar.g, colorFar.b);
      }
    });

    geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
    geometry.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3));

    const material = new THREE.PointsMaterial({ size: 3, vertexColors: true });
    this.pointCloudMesh = new THREE.Points(geometry, material);
    this.scene.add(this.pointCloudMesh);
  }

  startRenderLoop() {
    const loop = () => {
      requestAnimationFrame(loop);
      if (this.viewMode === '2D_RADAR') {
        this.drawRadar();
      } else if (this.viewMode === '3D_TUNNEL' && this.is3DInitialized && this.renderer) {
        this.renderer.render(this.scene, this.camera);
      }
    };
    requestAnimationFrame(loop);
  }

  setViewMode(mode) {
    this.viewMode = mode;
    if (mode === '2D_RADAR') {
      if (this.radarCanvas) this.radarCanvas.style.display = 'block';
      if (this.threejsContainer) this.threejsContainer.style.display = 'none';
      this.resizeRadar();
    } else {
      if (this.radarCanvas) this.radarCanvas.style.display = 'none';
      if (this.threejsContainer) this.threejsContainer.style.display = 'block';
    }
  }

  exportPointCloudCSV() {
    let csv = "timestamp_ms,angle_deg,distance_cm,cartesian_x,cartesian_y,cartesian_z,is_obstacle\n";
    this.points.forEach(p => {
      csv += `${p.timestamp},${p.angle.toFixed(1)},${p.distance},${p.x.toFixed(2)},${p.y.toFixed(2)},${p.z.toFixed(2)},${p.isObstacle ? 1 : 0}\n`;
    });
    
    const blob = new Blob([csv], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `mine_lidar_pointcloud_${Date.now()}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  }
}

window.LidarVisualizer = LidarVisualizer;
