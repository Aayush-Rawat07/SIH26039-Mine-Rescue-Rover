/**
 * SIH26039: AI-POWERED MINE RESCUE ROVER - GROUND CONTROL STATION
 * Module: LiDAR Point Cloud & 2D/3D SLAM Tunnel Visualizer
 * Implements API 1 (angle_deg, distance_cm) & API 5 (ir_obstacle)
 * Includes Native WebGL Three.js + Standalone 3D Engine Fallback
 */

class LidarVisualizer {
  constructor(radarCanvasId, threejsContainerId) {
    this.radarCanvasId = radarCanvasId;
    this.threejsContainerId = threejsContainerId;
    
    this.radarCanvas = document.getElementById(radarCanvasId);
    this.threejsContainer = document.getElementById(threejsContainerId);
    this.full3dContainer = document.getElementById('fullLidarContainer');
    
    this.points = []; // [{x, y, z, angle, distance, timestamp, isObstacle}]
    this.maxPoints = 1200;
    this.currentAngle = 90;
    this.currentDistance = 150;
    this.obstacleThresholdCm = 50;
    this.irObstacleFlag = false;
    this.viewMode = '2D_RADAR'; // '2D_RADAR' or '3D_TUNNEL'
    
    // 2D Canvas Context
    if (this.radarCanvas) {
      this.ctx = this.radarCanvas.getContext('2d');
      this.resizeRadar();
      window.addEventListener('resize', () => this.resizeRadar());
    }

    // 3D Scene Properties
    this.scene = null;
    this.camera = null;
    this.renderer = null;
    this.pointCloudMesh = null;
    this.laserBeam3D = null;
    this.roverMarker = null;
    this.is3DInitialized = false;

    // 3D Orbit Camera angles
    this.cameraRadius = 320;
    this.cameraTheta = Math.PI / 2;
    this.cameraPhi = Math.PI / 4;
    this.cameraTarget = { x: 0, y: 80, z: 0 };

    this.init3DScene();
    this.startRenderLoop();
  }

  resizeRadar() {
    if (!this.radarCanvas) return;
    const rect = this.radarCanvas.parentElement.getBoundingClientRect();
    this.radarCanvas.width = rect.width || 600;
    this.radarCanvas.height = rect.height || 420;
  }

  addPoint(angleDeg, distanceCm, timestamp = Date.now()) {
    if (isNaN(angleDeg) || isNaN(distanceCm) || distanceCm <= 0) return;

    this.currentAngle = angleDeg;
    this.currentDistance = distanceCm;

    // Convert Polar to Cartesian (Rover forward = Y, right = X)
    const rad = (angleDeg - 90) * (Math.PI / 180);
    const x = distanceCm * Math.sin(rad);
    const y = distanceCm * Math.cos(rad);
    const z = (Math.sin(angleDeg * (Math.PI / 180)) * 5) - 2; // subtle elevation slice

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
   * 2D Polar Tactical Radar
   */
  drawRadar() {
    if (!this.radarCanvas || !this.ctx) {
      this.radarCanvas = document.getElementById(this.radarCanvasId);
      if (this.radarCanvas) this.ctx = this.radarCanvas.getContext('2d');
      return;
    }

    const ctx = this.ctx;
    const w = this.radarCanvas.width;
    const h = this.radarCanvas.height;

    ctx.fillStyle = '#05070a';
    ctx.fillRect(0, 0, w, h);

    const centerX = w / 2;
    const centerY = h - 35;
    const maxRadius = Math.min(w / 2 - 20, h - 55);
    const maxRangeCm = 300;

    // Range rings
    ctx.lineWidth = 1;
    const ranges = [50, 100, 200, 300];
    ranges.forEach((range) => {
      const r = (range / maxRangeCm) * maxRadius;
      ctx.beginPath();
      ctx.arc(centerX, centerY, r, Math.PI, 0);
      ctx.strokeStyle = range === 50 ? 'rgba(239, 68, 68, 0.4)' : 'rgba(6, 182, 212, 0.2)';
      ctx.stroke();

      ctx.fillStyle = '#64748b';
      ctx.font = '10px monospace';
      ctx.fillText(`${range}cm`, centerX + 6, centerY - r + 4);
    });

    // Azimuth lines
    const angles = [0, 30, 45, 60, 90, 120, 135, 150, 180];
    angles.forEach(deg => {
      const rad = deg * (Math.PI / 180);
      const endX = centerX - maxRadius * Math.cos(rad);
      const endY = centerY - maxRadius * Math.sin(rad);

      ctx.beginPath();
      ctx.moveTo(centerX, centerY);
      ctx.lineTo(endX, endY);
      ctx.strokeStyle = deg === 90 ? 'rgba(6, 182, 212, 0.4)' : 'rgba(36, 50, 82, 0.35)';
      ctx.stroke();

      ctx.fillStyle = '#64748b';
      ctx.font = '9px monospace';
      ctx.fillText(`${deg}°`, endX - 10, endY - 4);
    });

    // Active Laser Sweep Line
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
      const alpha = Math.max(0.2, 1.0 - (ageMs / 8000));

      const scaledR = (p.distance / maxRangeCm) * maxRadius;
      const ptRad = p.angle * (Math.PI / 180);
      const px = centerX - scaledR * Math.cos(ptRad);
      const py = centerY - scaledR * Math.sin(ptRad);

      ctx.beginPath();
      ctx.arc(px, py, p.isObstacle ? 4 : 2.5, 0, Math.PI * 2);

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

    // Rover Marker
    ctx.beginPath();
    ctx.arc(centerX, centerY, 8, 0, Math.PI * 2);
    ctx.fillStyle = '#f59e0b';
    ctx.fill();
    ctx.strokeStyle = '#fff';
    ctx.lineWidth = 1.5;
    ctx.stroke();

    // IR Obstacle Indicator
    if (this.irObstacleFlag) {
      ctx.beginPath();
      ctx.arc(centerX, centerY, 45, Math.PI * 1.25, Math.PI * 1.75);
      ctx.lineTo(centerX, centerY);
      ctx.fillStyle = 'rgba(239, 68, 68, 0.4)';
      ctx.fill();
    }
  }

  /**
   * Three.js 3D WebGL Initialization
   */
  init3DScene() {
    this.threejsContainer = document.getElementById(this.threejsContainerId) || this.threejsContainer;
    if (!this.threejsContainer) return;

    if (typeof THREE === 'undefined') {
      console.warn("Three.js not loaded yet. Retrying in 500ms...");
      setTimeout(() => this.init3DScene(), 500);
      return;
    }

    try {
      const w = this.threejsContainer.clientWidth || 600;
      const h = this.threejsContainer.clientHeight || 420;

      this.scene = new THREE.Scene();
      this.scene.background = new THREE.Color(0x05070a);
      this.scene.fog = new THREE.FogExp2(0x05070a, 0.0035);

      this.camera = new THREE.PerspectiveCamera(55, w / (h || 1), 1, 3000);
      this.updateCameraPosition();

      this.renderer = new THREE.WebGLRenderer({ antialias: true });
      this.renderer.setSize(w, h);
      this.renderer.setPixelRatio(window.devicePixelRatio || 1);
      this.threejsContainer.innerHTML = '';
      this.threejsContainer.appendChild(this.renderer.domElement);

      // Floor Grid
      const gridHelper = new THREE.GridHelper(800, 32, 0x06b6d4, 0x1e293b);
      gridHelper.rotation.x = Math.PI / 2;
      this.scene.add(gridHelper);

      // Tunnel Arches
      const archMat = new THREE.LineBasicMaterial({ color: 0x1e3a5f, transparent: true, opacity: 0.6 });
      for (let y = 0; y <= 400; y += 80) {
        const archGeo = new THREE.BufferGeometry();
        const archPts = [];
        const r = 140;
        for (let a = 0; a <= Math.PI; a += Math.PI / 16) {
          archPts.push(new THREE.Vector3(-r * Math.cos(a), y, r * Math.sin(a)));
        }
        archGeo.setFromPoints(archPts);
        this.scene.add(new THREE.Line(archGeo, archMat));
      }

      // Rover 3D Body
      const roverGroup = new THREE.Group();
      const bodyGeo = new THREE.BoxGeometry(26, 38, 12);
      const bodyMat = new THREE.MeshBasicMaterial({ color: 0xf59e0b, wireframe: true });
      const body = new THREE.Mesh(bodyGeo, bodyMat);
      body.position.z = 6;
      roverGroup.add(body);

      // Turret
      const turretGeo = new THREE.CylinderGeometry(4, 4, 6, 12);
      const turretMat = new THREE.MeshBasicMaterial({ color: 0x06b6d4 });
      const turret = new THREE.Mesh(turretGeo, turretMat);
      turret.position.set(0, 10, 14);
      turret.rotation.x = Math.PI / 2;
      roverGroup.add(turret);

      this.roverMarker = roverGroup;
      this.scene.add(this.roverMarker);

      // 3D Laser Beam
      const beamGeo = new THREE.BufferGeometry();
      beamGeo.setAttribute('position', new THREE.Float32BufferAttribute([0, 0, 14, 0, 150, 14], 3));
      this.laserBeam3D = new THREE.Line(beamGeo, new THREE.LineBasicMaterial({ color: 0x06b6d4, linewidth: 2 }));
      this.scene.add(this.laserBeam3D);

      this.initOrbitMouseControls(this.renderer.domElement);
      this.is3DInitialized = true;
    } catch (e) {
      console.warn("WebGL 3D setup error:", e);
    }
  }

  updateCameraPosition() {
    if (!this.camera || typeof THREE === 'undefined') return;
    this.camera.position.x = this.cameraTarget.x + this.cameraRadius * Math.sin(this.cameraPhi) * Math.sin(this.cameraTheta);
    this.camera.position.y = this.cameraTarget.y - this.cameraRadius * Math.sin(this.cameraPhi) * Math.cos(this.cameraTheta);
    this.camera.position.z = this.cameraTarget.z + this.cameraRadius * Math.cos(this.cameraPhi);
    this.camera.lookAt(new THREE.Vector3(this.cameraTarget.x, this.cameraTarget.y, this.cameraTarget.z));
  }

  initOrbitMouseControls(element) {
    let isDragging = false;
    let prevMouse = { x: 0, y: 0 };

    element.addEventListener('mousedown', (e) => {
      isDragging = true;
      prevMouse = { x: e.clientX, y: e.clientY };
    });

    window.addEventListener('mousemove', (e) => {
      if (!isDragging) return;
      const dx = e.clientX - prevMouse.x;
      const dy = e.clientY - prevMouse.y;

      if (e.buttons === 1) {
        this.cameraTheta -= dx * 0.008;
        this.cameraPhi = Math.max(0.1, Math.min(Math.PI / 2 - 0.05, this.cameraPhi - dy * 0.008));
        this.updateCameraPosition();
      } else if (e.buttons === 2) {
        this.cameraTarget.x -= dx * 0.4;
        this.cameraTarget.y += dy * 0.4;
        this.updateCameraPosition();
      }
      prevMouse = { x: e.clientX, y: e.clientY };
    });

    window.addEventListener('mouseup', () => { isDragging = false; });
    element.addEventListener('contextmenu', (e) => e.preventDefault());

    element.addEventListener('wheel', (e) => {
      e.preventDefault();
      this.cameraRadius = Math.max(60, Math.min(1000, this.cameraRadius + e.deltaY * 0.4));
      this.updateCameraPosition();
    }, { passive: false });
  }

  update3DPoints() {
    if (!this.is3DInitialized || typeof THREE === 'undefined' || !this.scene) return;

    if (this.laserBeam3D) {
      const rad = (this.currentAngle - 90) * (Math.PI / 180);
      const tx = this.currentDistance * Math.sin(rad);
      const ty = this.currentDistance * Math.cos(rad);
      const attr = this.laserBeam3D.geometry.attributes.position;
      attr.setXYZ(0, 0, 0, 14);
      attr.setXYZ(1, tx, ty, 0);
      attr.needsUpdate = true;
    }

    if (this.pointCloudMesh) {
      this.scene.remove(this.pointCloudMesh);
    }

    const geometry = new THREE.BufferGeometry();
    const positions = [];
    const colors = [];

    const colNear = new THREE.Color(0xef4444);
    const colMid = new THREE.Color(0xf59e0b);
    const colFar = new THREE.Color(0x10b981);

    this.points.forEach(p => {
      positions.push(p.x, p.y, p.z);
      if (p.isObstacle) colors.push(colNear.r, colNear.g, colNear.b);
      else if (p.distance < 100) colors.push(colMid.r, colMid.g, colMid.b);
      else colors.push(colFar.r, colFar.g, colFar.b);
    });

    geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
    geometry.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3));

    const material = new THREE.PointsMaterial({ size: 4.5, vertexColors: true, transparent: true, opacity: 0.95 });
    this.pointCloudMesh = new THREE.Points(geometry, material);
    this.scene.add(this.pointCloudMesh);
  }

  resize3D() {
    if (!this.renderer || !this.threejsContainer) return;
    const w = this.threejsContainer.clientWidth || 600;
    const h = this.threejsContainer.clientHeight || 420;
    if (this.camera) {
      this.camera.aspect = w / (h || 1);
      this.camera.updateProjectionMatrix();
    }
    this.renderer.setSize(w, h);
  }

  setViewMode(mode) {
    this.viewMode = mode;
    this.radarCanvas = document.getElementById(this.radarCanvasId);
    this.threejsContainer = document.getElementById(this.threejsContainerId);

    if (mode === '2D_RADAR') {
      if (this.radarCanvas) this.radarCanvas.style.display = 'block';
      if (this.threejsContainer) this.threejsContainer.style.display = 'none';
      this.resizeRadar();
    } else {
      if (this.radarCanvas) this.radarCanvas.style.display = 'none';
      if (this.threejsContainer) {
        this.threejsContainer.style.display = 'block';
        if (!this.is3DInitialized) {
          this.init3DScene();
        }
        this.resize3D();
      }
    }
  }

  startRenderLoop() {
    const loop = () => {
      requestAnimationFrame(loop);
      if (this.viewMode === '2D_RADAR') {
        this.drawRadar();
      } else if (this.viewMode === '3D_TUNNEL' && this.is3DInitialized && this.renderer && this.scene && this.camera) {
        this.renderer.render(this.scene, this.camera);
      }
    };
    requestAnimationFrame(loop);
  }
}

// Global Singleton
window.lidarVisualizer = new LidarVisualizer('lidarRadarCanvas', 'lidar3dContainer');
