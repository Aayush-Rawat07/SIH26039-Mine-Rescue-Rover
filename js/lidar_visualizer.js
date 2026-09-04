/**
 * SIH26039: AI-POWERED MINE RESCUE ROVER - GROUND CONTROL STATION
 * Module: Subterranean 3D LiDAR Point Cloud & Tunnel Cross-Section Engine
 * Implements 3D LiDAR point telemetry (azimuth, elevation, distance) -> (X, Y, Z)
 * Focused exclusively on Subterranean Tunnel Cross-Section & Clearance Analysis.
 */

class LidarVisualizer {
  constructor(canvasContainerId = 'lidarCrossSectionContainer', fullContainerId = 'fullLidarContainer') {
    this.containerId = canvasContainerId;
    this.fullContainerId = fullContainerId;
    this.container = document.getElementById(canvasContainerId);
    this.fullContainer = document.getElementById(fullContainerId);

    // 3D Point Cloud Store
    this.points = []; // [{x, y, z, azimuth, elevation, distance, intensity, timestamp, isObstacle}]
    this.maxPoints = 4000;
    this.depthFilterM = 5.0; // 5 meters depth view
    this.pointSize = 4.0;
    this.colormapMode = 'ELEVATION'; // 'ELEVATION' or 'HAZARD'

    // Real-time Tunnel Clearance Metrics
    this.metrics = {
      tunnelWidthM: 2.8,
      ceilingHeightM: 2.2,
      pathObstacleDistCm: 250,
      clearanceStatus: 'CLEAR',
      groundSlopeDeg: 0.0
    };

    // Current Laser Pointer Position
    this.currentSweep = {
      azimuth: 90,
      elevation: 0,
      distance: 180
    };
    this.irObstacleFlag = false;

    // Three.js Scenes & Renderers for both HUD and Full tab
    this.scene = null;
    this.camera = null;
    this.renderer = null;
    this.pointCloudMesh = null;
    this.laserBeam3D = null;
    this.clearanceBox = null;
    this.tunnelArches = null;
    this.roverModel = null;
    this.is3DInitialized = false;

    this.init3DScene();
    this.startRenderLoop();
  }

  /**
   * Ingest 3D LiDAR Point (Spherical to Cartesian)
   * @param {number} azimuthDeg - Horizontal angle (0° to 180°, 90° is forward)
   * @param {number} elevationDeg - Vertical angle (-30° down to +30° up)
   * @param {number} distanceCm - Measured distance in cm
   * @param {number} intensity - Signal reflectance/intensity (0-255)
   */
  add3DPoint(azimuthDeg, elevationDeg = 0, distanceCm, intensity = 100, timestamp = Date.now()) {
    if (isNaN(distanceCm) || distanceCm <= 0) return;

    this.currentSweep.azimuth = azimuthDeg;
    this.currentSweep.elevation = elevationDeg;
    this.currentSweep.distance = distanceCm;

    // Convert Spherical to Cartesian:
    // Rover coordinate frame: X = Right/Left, Y = Forward through tunnel, Z = Vertical Elevation
    const azRad = (azimuthDeg - 90) * (Math.PI / 180);
    const elRad = (elevationDeg) * (Math.PI / 180);

    const x = distanceCm * Math.cos(elRad) * Math.sin(azRad);
    const y = distanceCm * Math.cos(elRad) * Math.cos(azRad);
    const z = distanceCm * Math.sin(elRad); // Vertical height above rover

    const isObstacle = (distanceCm < 50) || (Math.abs(x) < 40 && y < 100 && z > -15 && z < 40) || this.irObstacleFlag;

    this.points.push({
      x, y, z,
      azimuth: azimuthDeg,
      elevation: elevationDeg,
      distance: distanceCm,
      intensity,
      timestamp,
      isObstacle
    });

    if (this.points.length > this.maxPoints) {
      this.points.shift();
    }

    this.computeTunnelMetrics();
    this.update3DPoints();
  }

  /**
   * Backward-compatible 2D point adapter
   */
  addPoint(angleDeg, distanceCm, timestamp = Date.now()) {
    // Generate subtle natural elevation variation if 2D packet received
    const syntheticElevation = Math.sin((angleDeg * 3) * (Math.PI / 180)) * 8;
    this.add3DPoint(angleDeg, syntheticElevation, distanceCm, 100, timestamp);
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
    if (window.eventLogger) {
      window.eventLogger.log('INFO', 'LIDAR', '3D Point cloud cleared by operator.');
    }
    this.computeTunnelMetrics();
  }

  computeTunnelMetrics() {
    if (this.points.length < 5) return;

    let minX = 0, maxX = 0;
    let maxZ = 10;
    let closestForwardDist = 999;
    let groundPoints = [];

    const now = Date.now();
    for (let i = 0; i < this.points.length; i++) {
      const p = this.points[i];
      if (now - p.timestamp > 15000) continue; // within 15s

      if (p.x < minX) minX = p.x;
      if (p.x > maxX) maxX = p.x;
      if (p.z > maxZ) maxZ = p.z;

      // Check forward corridor
      if (Math.abs(p.x) < 35 && p.y > 10 && p.y < closestForwardDist) {
        closestForwardDist = p.y;
      }

      if (p.z < 5 && p.y > 30 && p.y < 200) {
        groundPoints.push(p);
      }
    }

    // Width (meters)
    const rawWidth = Math.max(140, Math.min(450, maxX - minX));
    this.metrics.tunnelWidthM = parseFloat((rawWidth / 100).toFixed(2));

    // Ceiling clearance (meters)
    const rawCeil = Math.max(120, Math.min(380, maxZ + 30));
    this.metrics.ceilingHeightM = parseFloat((rawCeil / 100).toFixed(2));

    this.metrics.pathObstacleDistCm = closestForwardDist < 900 ? Math.round(closestForwardDist) : 300;

    if (this.metrics.pathObstacleDistCm < 50 || this.irObstacleFlag) {
      this.metrics.clearanceStatus = 'BLOCKED (HAZARD)';
    } else if (this.metrics.pathObstacleDistCm < 120 || this.metrics.ceilingHeightM < 1.4) {
      this.metrics.clearanceStatus = 'CONSTRICTED';
    } else {
      this.metrics.clearanceStatus = 'CLEAR';
    }

    this.renderCrossSectionHud();
  }

  renderCrossSectionHud() {
    const widthEl = document.getElementById('csTunnelWidthVal');
    const heightEl = document.getElementById('csCeilingHeightVal');
    const obstacleEl = document.getElementById('csObstacleDistVal');
    const statusEl = document.getElementById('csClearanceStatusVal');
    const countEl = document.getElementById('csPointCountVal');

    if (widthEl) widthEl.textContent = `${this.metrics.tunnelWidthM} m`;
    if (heightEl) heightEl.textContent = `${this.metrics.ceilingHeightM} m`;
    if (obstacleEl) obstacleEl.textContent = `${this.metrics.pathObstacleDistCm} cm`;
    if (countEl) countEl.textContent = `${this.points.length}`;

    if (statusEl) {
      statusEl.textContent = this.metrics.clearanceStatus;
      if (this.metrics.clearanceStatus.includes('BLOCKED')) {
        statusEl.style.color = '#ef4444';
      } else if (this.metrics.clearanceStatus.includes('CONSTRICTED')) {
        statusEl.style.color = '#f59e0b';
      } else {
        statusEl.style.color = '#10b981';
      }
    }

    // Sync with Tab 2 elements if available
    const t2Width = document.getElementById('tab2WidthVal');
    const t2Height = document.getElementById('tab2HeightVal');
    const t2Obstacle = document.getElementById('tab2ObstacleVal');
    const t2Status = document.getElementById('tab2StatusVal');
    const t2Count = document.getElementById('tab2PointCountVal');

    if (t2Width) t2Width.textContent = `${this.metrics.tunnelWidthM} m`;
    if (t2Height) t2Height.textContent = `${this.metrics.ceilingHeightM} m`;
    if (t2Obstacle) t2Obstacle.textContent = `${this.metrics.pathObstacleDistCm} cm`;
    if (t2Count) t2Count.textContent = `${this.points.length}`;
    if (t2Status) {
      t2Status.textContent = this.metrics.clearanceStatus;
      t2Status.style.color = statusEl ? statusEl.style.color : '#10b981';
    }
  }

  /**
   * Initialize Three.js Subterranean Tunnel Cross-Section Viewport
   */
  init3DScene() {
    this.container = document.getElementById(this.containerId) || this.container;
    if (!this.container) return;

    if (typeof THREE === 'undefined') {
      setTimeout(() => this.init3DScene(), 400);
      return;
    }

    try {
      const w = this.container.clientWidth || 600;
      const h = this.container.clientHeight || 420;

      this.scene = new THREE.Scene();
      this.scene.background = new THREE.Color(0x05070a);
      this.scene.fog = new THREE.FogExp2(0x05070a, 0.003);

      // Camera positioned directly in Tunnel Cross-Section axial view:
      // Positioned slightly behind rover, looking straight down the tunnel shaft
      this.camera = new THREE.PerspectiveCamera(50, w / (h || 1), 1, 3000);
      this.camera.position.set(0, -90, 45); // Behind rover, at eye level
      this.camera.lookAt(new THREE.Vector3(0, 160, 40)); // Looking through the tunnel cross-section

      this.renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: 'high-performance' });
      this.renderer.setSize(w, h);
      this.renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
      this.container.innerHTML = '';
      this.container.appendChild(this.renderer.domElement);

      // 1. Subterranean Ground Grid
      const gridHelper = new THREE.GridHelper(600, 24, 0x06b6d4, 0x1e293b);
      gridHelper.rotation.x = Math.PI / 2;
      gridHelper.position.set(0, 200, 0);
      this.scene.add(gridHelper);

      // 2. Mine Cart Rails (Subterranean Shaft Floor)
      const railMat = new THREE.LineBasicMaterial({ color: 0x475569 });
      const leftRailGeo = new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(-30, 0, 1), new THREE.Vector3(-30, 450, 1)]);
      const rightRailGeo = new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(30, 0, 1), new THREE.Vector3(30, 450, 1)]);
      this.scene.add(new THREE.Line(leftRailGeo, railMat));
      this.scene.add(new THREE.Line(rightRailGeo, railMat));

      // 3. Subterranean Mine Tunnel Timber Arches (Cross-Section Profile)
      const archGroup = new THREE.Group();
      const archMat = new THREE.LineBasicMaterial({ color: 0x1e3a5f, transparent: true, opacity: 0.75 });
      for (let y = 30; y <= 450; y += 70) {
        const archGeo = new THREE.BufferGeometry();
        const archPts = [];
        const r = 135;
        for (let a = 0; a <= Math.PI; a += Math.PI / 24) {
          archPts.push(new THREE.Vector3(-r * Math.cos(a), y, r * Math.sin(a)));
        }
        archGeo.setFromPoints(archPts);
        archGroup.add(new THREE.Line(archGeo, archMat));
      }
      this.tunnelArches = archGroup;
      this.scene.add(this.tunnelArches);

      // 4. Clearance Envelope Box (cross-section clearance profile in front of rover)
      const clearanceGeo = new THREE.BufferGeometry();
      const clearPts = [
        new THREE.Vector3(-60, 40, 0), new THREE.Vector3(60, 40, 0),
        new THREE.Vector3(60, 40, 90), new THREE.Vector3(-60, 40, 90),
        new THREE.Vector3(-60, 40, 0),
        new THREE.Vector3(-60, 180, 0), new THREE.Vector3(60, 180, 0),
        new THREE.Vector3(60, 180, 90), new THREE.Vector3(-60, 180, 90),
        new THREE.Vector3(-60, 180, 0)
      ];
      clearanceGeo.setFromPoints(clearPts);
      this.clearanceBox = new THREE.Line(clearanceGeo, new THREE.LineBasicMaterial({ color: 0x06b6d4, transparent: true, opacity: 0.35 }));
      this.scene.add(this.clearanceBox);

      // 5. 3D Rover Body at origin
      const roverGroup = new THREE.Group();
      const bodyGeo = new THREE.BoxGeometry(26, 36, 12);
      const bodyMat = new THREE.MeshBasicMaterial({ color: 0xf59e0b, wireframe: true });
      const body = new THREE.Mesh(bodyGeo, bodyMat);
      body.position.z = 8;
      roverGroup.add(body);

      // 3D Pan-Tilt LiDAR Turret
      const turretGeo = new THREE.CylinderGeometry(5, 5, 8, 12);
      const turretMat = new THREE.MeshBasicMaterial({ color: 0x06b6d4 });
      const turret = new THREE.Mesh(turretGeo, turretMat);
      turret.position.set(0, 10, 18);
      turret.rotation.x = Math.PI / 2;
      roverGroup.add(turret);

      this.roverModel = roverGroup;
      this.scene.add(this.roverModel);

      // 6. Active 3D Laser Beam
      const beamGeo = new THREE.BufferGeometry();
      beamGeo.setAttribute('position', new THREE.Float32BufferAttribute([0, 10, 18, 0, 160, 20], 3));
      this.laserBeam3D = new THREE.Line(beamGeo, new THREE.LineBasicMaterial({ color: 0x22d3ee, linewidth: 2 }));
      this.scene.add(this.laserBeam3D);

      this.is3DInitialized = true;
      window.addEventListener('resize', () => this.resize());
    } catch (e) {
      console.warn("Subterranean 3D Cross-Section init error:", e);
    }
  }

  update3DPoints() {
    if (!this.is3DInitialized || typeof THREE === 'undefined' || !this.scene) return;

    // Update 3D laser sweep beam
    if (this.laserBeam3D) {
      const azRad = (this.currentSweep.azimuth - 90) * (Math.PI / 180);
      const elRad = this.currentSweep.elevation * (Math.PI / 180);
      const tx = this.currentSweep.distance * Math.cos(elRad) * Math.sin(azRad);
      const ty = this.currentSweep.distance * Math.cos(elRad) * Math.cos(azRad);
      const tz = 18 + this.currentSweep.distance * Math.sin(elRad);

      const attr = this.laserBeam3D.geometry.attributes.position;
      attr.setXYZ(0, 0, 10, 18);
      attr.setXYZ(1, tx, ty, tz);
      attr.needsUpdate = true;
    }

    if (this.pointCloudMesh) {
      this.scene.remove(this.pointCloudMesh);
    }

    const geometry = new THREE.BufferGeometry();
    const positions = [];
    const colors = [];

    const colNear = new THREE.Color(0xef4444); // Hazard red
    const colFloor = new THREE.Color(0x06b6d4); // Ground cyan
    const colRoof = new THREE.Color(0xa855f7); // Roof purple
    const colWall = new THREE.Color(0x10b981); // Wall emerald

    const maxDepthCm = this.depthFilterM * 100;

    for (let i = 0; i < this.points.length; i++) {
      const p = this.points[i];
      if (p.y > maxDepthCm) continue; // Depth filter

      positions.push(p.x, p.y, p.z);

      if (p.isObstacle || (this.colormapMode === 'HAZARD' && p.distance < 70)) {
        colors.push(colNear.r, colNear.g, colNear.b);
      } else if (this.colormapMode === 'ELEVATION') {
        // Height-based gradient: 0cm (cyan floor) -> 60cm (emerald wall) -> 120cm+ (purple roof)
        const t = Math.max(0, Math.min(1, p.z / 140));
        if (t < 0.5) {
          const c = colFloor.clone().lerp(colWall, t * 2);
          colors.push(c.r, c.g, c.b);
        } else {
          const c = colWall.clone().lerp(colRoof, (t - 0.5) * 2);
          colors.push(c.r, c.g, c.b);
        }
      } else {
        colors.push(colWall.r, colWall.g, colWall.b);
      }
    }

    geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
    geometry.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3));

    const material = new THREE.PointsMaterial({
      size: this.pointSize,
      vertexColors: true,
      transparent: true,
      opacity: 0.95
    });

    this.pointCloudMesh = new THREE.Points(geometry, material);
    this.scene.add(this.pointCloudMesh);
  }

  setColormap(mode) {
    this.colormapMode = mode;
    this.update3DPoints();
  }

  setPointSize(size) {
    this.pointSize = parseFloat(size) || 4.0;
    this.update3DPoints();
  }

  setDepthFilter(meters) {
    this.depthFilterM = parseFloat(meters) || 5.0;
    this.update3DPoints();
  }

  resize() {
    if (!this.renderer || !this.container) return;
    const w = this.container.clientWidth || 600;
    const h = this.container.clientHeight || 420;
    if (this.camera) {
      this.camera.aspect = w / (h || 1);
      this.camera.updateProjectionMatrix();
    }
    this.renderer.setSize(w, h);
  }

  startRenderLoop() {
    const loop = () => {
      requestAnimationFrame(loop);
      if (this.is3DInitialized && this.renderer && this.scene && this.camera) {
        this.renderer.render(this.scene, this.camera);
      }
    };
    requestAnimationFrame(loop);
  }
}

// Global Singleton
window.lidarVisualizer = new LidarVisualizer('lidarCrossSectionContainer', 'fullLidarContainer');
