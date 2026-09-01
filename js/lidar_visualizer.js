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
  /**
   * Three.js 3D Point Cloud Tunnel Scene Initialization with Interactive Orbit Controls
   */
  init3DScene() {
    if (typeof THREE === 'undefined' || !this.threejsContainer) return;

    try {
      const w = this.threejsContainer.clientWidth || 600;
      const h = this.threejsContainer.clientHeight || 420;

      this.scene = new THREE.Scene();
      this.scene.background = new THREE.Color(0x05070a);
      this.scene.fog = new THREE.FogExp2(0x05070a, 0.0035);

      this.camera = new THREE.PerspectiveCamera(55, w / h, 1, 3000);
      
      // Orbit parameters
      this.cameraRadius = 320;
      this.cameraTheta = Math.PI / 2; // azimuth
      this.cameraPhi = Math.PI / 4;   // elevation
      this.cameraTarget = new THREE.Vector3(0, 80, 0);

      this.updateCameraPosition();

      this.renderer = new THREE.WebGLRenderer({ antialias: true });
      this.renderer.setSize(w, h);
      this.renderer.setPixelRatio(window.devicePixelRatio || 1);
      this.threejsContainer.innerHTML = '';
      this.threejsContainer.appendChild(this.renderer.domElement);

      // 1. Mine Shaft Floor Grid
      const gridHelper = new THREE.GridHelper(800, 40, 0x06b6d4, 0x1e293b);
      gridHelper.rotation.x = Math.PI / 2;
      this.scene.add(gridHelper);

      // 2. Subterranean Mine Tunnel Arches (Simulating underground coal gallery)
      const archMat = new THREE.LineBasicMaterial({ color: 0x1e3a5f, transparent: true, opacity: 0.6 });
      for (let y = 0; y <= 400; y += 80) {
        const archGeo = new THREE.BufferGeometry();
        const archPts = [];
        const archRadius = 140;
        for (let a = 0; a <= Math.PI; a += Math.PI / 16) {
          archPts.push(new THREE.Vector3(-archRadius * Math.cos(a), y, archRadius * Math.sin(a)));
        }
        archGeo.setFromPoints(archPts);
        const archMesh = new THREE.Line(archGeo, archMat);
        this.scene.add(archMesh);
      }

      // 3. Rover 3D Chassis
      const roverGroup = new THREE.Group();
      const roverBodyGeo = new THREE.BoxGeometry(26, 38, 12);
      const roverBodyMat = new THREE.MeshBasicMaterial({ color: 0xf59e0b, wireframe: true });
      const roverBody = new THREE.Mesh(roverBodyGeo, roverBodyMat);
      roverBody.position.z = 6;
      roverGroup.add(roverBody);

      // 3D Laser Turret Mirror
      const turretGeo = new THREE.CylinderGeometry(4, 4, 6, 12);
      const turretMat = new THREE.MeshBasicMaterial({ color: 0x06b6d4 });
      const turret = new THREE.Mesh(turretGeo, turretMat);
      turret.position.set(0, 10, 14);
      turret.rotation.x = Math.PI / 2;
      roverGroup.add(turret);

      this.roverMarker = roverGroup;
      this.scene.add(this.roverMarker);

      // 4. Active Laser Beam in 3D
      const beamGeo = new THREE.BufferGeometry();
      beamGeo.setAttribute('position', new THREE.Float32BufferAttribute([0, 0, 14, 0, 150, 14], 3));
      this.laserBeamMat = new THREE.LineBasicMaterial({ color: 0x06b6d4, linewidth: 2 });
      this.laserBeam3D = new THREE.Line(beamGeo, this.laserBeamMat);
      this.scene.add(this.laserBeam3D);

      // 5. Mouse / Touch Orbit Controls
      this.initOrbitMouseControls(this.renderer.domElement);

      this.is3DInitialized = true;
    } catch (e) {
      console.warn("WebGL 3D setup skipped (will use Canvas 2D):", e);
    }
  }

  updateCameraPosition() {
    if (!this.camera) return;
    this.camera.position.x = this.cameraTarget.x + this.cameraRadius * Math.sin(this.cameraPhi) * Math.sin(this.cameraTheta);
    this.camera.position.y = this.cameraTarget.y - this.cameraRadius * Math.sin(this.cameraPhi) * Math.cos(this.cameraTheta);
    this.camera.position.z = this.cameraTarget.z + this.cameraRadius * Math.cos(this.cameraPhi);
    this.camera.lookAt(this.cameraTarget);
  }

  initOrbitMouseControls(element) {
    let isDragging = false;
    let previousMousePosition = { x: 0, y: 0 };

    element.addEventListener('mousedown', (e) => {
      isDragging = true;
      previousMousePosition = { x: e.clientX, y: e.clientY };
    });

    window.addEventListener('mousemove', (e) => {
      if (!isDragging) return;
      const deltaX = e.clientX - previousMousePosition.x;
      const deltaY = e.clientY - previousMousePosition.y;

      if (e.buttons === 1) { // Left click: Orbit
        this.cameraTheta -= deltaX * 0.008;
        this.cameraPhi = Math.max(0.1, Math.min(Math.PI / 2 - 0.05, this.cameraPhi - deltaY * 0.008));
        this.updateCameraPosition();
      } else if (e.buttons === 2) { // Right click: Pan
        this.cameraTarget.x -= deltaX * 0.4;
        this.cameraTarget.y += deltaY * 0.4;
        this.updateCameraPosition();
      }

      previousMousePosition = { x: e.clientX, y: e.clientY };
    });

    window.addEventListener('mouseup', () => { isDragging = false; });
    element.addEventListener('contextmenu', (e) => e.preventDefault());

    // Scroll Zoom
    element.addEventListener('wheel', (e) => {
      e.preventDefault();
      this.cameraRadius = Math.max(60, Math.min(1000, this.cameraRadius + e.deltaY * 0.4));
      this.updateCameraPosition();
    }, { passive: false });

    // Touch Support for Mobile / Tablet
    let touchStartDist = 0;
    element.addEventListener('touchstart', (e) => {
      if (e.touches.length === 1) {
        isDragging = true;
        previousMousePosition = { x: e.touches[0].clientX, y: e.touches[0].clientY };
      } else if (e.touches.length === 2) {
        touchStartDist = Math.hypot(
          e.touches[0].clientX - e.touches[1].clientX,
          e.touches[0].clientY - e.touches[1].clientY
        );
      }
    });

    element.addEventListener('touchmove', (e) => {
      if (e.touches.length === 1 && isDragging) {
        const deltaX = e.touches[0].clientX - previousMousePosition.x;
        const deltaY = e.touches[0].clientY - previousMousePosition.y;
        this.cameraTheta -= deltaX * 0.008;
        this.cameraPhi = Math.max(0.1, Math.min(Math.PI / 2 - 0.05, this.cameraPhi - deltaY * 0.008));
        this.updateCameraPosition();
        previousMousePosition = { x: e.touches[0].clientX, y: e.touches[0].clientY };
      } else if (e.touches.length === 2) {
        const dist = Math.hypot(
          e.touches[0].clientX - e.touches[1].clientX,
          e.touches[0].clientY - e.touches[1].clientY
        );
        const delta = touchStartDist - dist;
        this.cameraRadius = Math.max(60, Math.min(1000, this.cameraRadius + delta * 0.8));
        this.updateCameraPosition();
        touchStartDist = dist;
      }
    }, { passive: false });

    element.addEventListener('touchend', () => { isDragging = false; });
  }

  update3DPoints() {
    if (!this.is3DInitialized || typeof THREE === 'undefined') return;

    // Update active 3D laser beam direction
    if (this.laserBeam3D) {
      const rad = (this.currentAngle - 90) * (Math.PI / 180);
      const targetX = this.currentDistance * Math.sin(rad);
      const targetY = this.currentDistance * Math.cos(rad);
      const posAttr = this.laserBeam3D.geometry.attributes.position;
      posAttr.setXYZ(0, 0, 0, 14);
      posAttr.setXYZ(1, targetX, targetY, 0);
      posAttr.needsUpdate = true;
    }

    if (this.pointCloudMesh) {
      this.scene.remove(this.pointCloudMesh);
    }

    const geometry = new THREE.BufferGeometry();
    const positions = [];
    const colors = [];

    const colorNear = new THREE.Color(0xef4444); // Red (Hazard / Collision < 50cm)
    const colorMid = new THREE.Color(0xf59e0b);  // Amber (Caution < 100cm)
    const colorFar = new THREE.Color(0x10b981);  // Emerald Green (Clear Wall)

    this.points.forEach(p => {
      positions.push(p.x, p.y, p.z);

      if (p.isObstacle) {
        colors.push(colorNear.r, colorNear.g, colorNear.b);
      } else if (p.distance < 100) {
        colors.push(colorMid.r, colorMid.g, colorMid.b);
      } else {
        colors.push(colorFar.r, colorFar.g, colorFar.b);
      }
    });

    geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
    geometry.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3));

    const material = new THREE.PointsMaterial({ 
      size: 4.5, 
      vertexColors: true,
      transparent: true,
      opacity: 0.95
    });

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

  resize3D() {
    if (!this.is3DInitialized || !this.renderer || !this.threejsContainer) return;
    const w = this.threejsContainer.clientWidth || 600;
    const h = this.threejsContainer.clientHeight || 420;
    if (this.camera) {
      this.camera.aspect = w / h;
      this.camera.updateProjectionMatrix();
    }
    this.renderer.setSize(w, h);
  }

  setViewMode(mode) {
    this.viewMode = mode;
    if (mode === '2D_RADAR') {
      if (this.radarCanvas) this.radarCanvas.style.display = 'block';
      if (this.threejsContainer) this.threejsContainer.style.display = 'none';
      this.resizeRadar();
    } else {
      if (this.radarCanvas) this.radarCanvas.style.display = 'none';
      if (this.threejsContainer) {
        this.threejsContainer.style.display = 'block';
        this.resize3D();
      }
    }
  }

  /**
   * Export standard .xyz Point Cloud format (X Y Z R G B or X Y Z Intensity)
   * Compatible with CloudCompare, MeshLab, AutoCAD, Blender, ROS RViz
   */
  exportXYZ() {
    if (!this.points || this.points.length === 0) {
      alert("No point cloud data recorded yet. Please connect hardware or start the simulator first!");
      return;
    }

    let xyzContent = "# SIH26039 Mine Rescue Rover Point Cloud Map (.xyz)\n";
    xyzContent += "# Format: X Y Z Intensity Red Green Blue\n";

    this.points.forEach(p => {
      // Calculate color based on obstacle status or distance
      let r = 16, g = 185, b = 129; // Green (safe)
      let intensity = Math.min(255, Math.round((p.distance / 300) * 255));

      if (p.isObstacle) {
        r = 239; g = 68; b = 68; // Red (obstacle)
      } else if (p.distance < 100) {
        r = 245; g = 158; b = 11; // Amber (warning)
      }

      // X Y Z Intensity R G B (cm units)
      xyzContent += `${p.x.toFixed(2)} ${p.y.toFixed(2)} ${p.z.toFixed(2)} ${intensity} ${r} ${g} ${b}\n`;
    });

    const blob = new Blob([xyzContent], { type: 'text/plain;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `mine_tunnel_map_${Date.now()}.xyz`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);

    if (window.alarmSystem) {
      window.alarmSystem.playChime();
    }
  }

  /**
   * Export CSV format for Excel, Python Pandas, MATLAB analysis
   */
  exportPointCloudCSV() {
    if (!this.points || this.points.length === 0) {
      alert("No point cloud data recorded yet. Please connect hardware or start the simulator first!");
      return;
    }

    let csv = "timestamp_ms,angle_deg,distance_cm,cartesian_x_cm,cartesian_y_cm,cartesian_z_cm,is_obstacle,hazard_level\n";
    this.points.forEach(p => {
      const hazard = p.isObstacle ? "CRITICAL_OBSTACLE" : (p.distance < 100 ? "WARNING_PROXIMITY" : "SAFE_PASSAGE");
      csv += `${p.timestamp},${p.angle.toFixed(1)},${p.distance},${p.x.toFixed(2)},${p.y.toFixed(2)},${p.z.toFixed(2)},${p.isObstacle ? 1 : 0},${hazard}\n`;
    });
    
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `mine_lidar_pointcloud_${Date.now()}.csv`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);

    if (window.alarmSystem) {
      window.alarmSystem.playChime();
    }
  }

  /**
   * Export GeoJSON format for GIS & surface rescue mapping
   */
  exportGeoJSON() {
    if (!this.points || this.points.length === 0) {
      alert("No point cloud data recorded yet. Please connect hardware or start the simulator first!");
      return;
    }

    const geojson = {
      type: "FeatureCollection",
      metadata: {
        mission: "SIH26039 Underground Reconnaissance",
        timestamp: Date.now(),
        pointCount: this.points.length
      },
      features: this.points.map((p, idx) => ({
        type: "Feature",
        id: idx,
        geometry: {
          type: "Point",
          coordinates: [parseFloat(p.x.toFixed(2)), parseFloat(p.y.toFixed(2)), parseFloat(p.z.toFixed(2))]
        },
        properties: {
          angle_deg: p.angle,
          distance_cm: p.distance,
          is_obstacle: p.isObstacle,
          timestamp: p.timestamp
        }
      }))
    };

    const blob = new Blob([JSON.stringify(geojson, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `mine_tunnel_map_${Date.now()}.geojson`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  }
}

window.LidarVisualizer = LidarVisualizer;
