/**
 * SIH26039: AI-POWERED MINE RESCUE ROVER - GROUND CONTROL STATION
 * Module: ESP32-CAM & AI Trapped Miner Computer Vision Detector (API 3 & API 4)
 * Handles live MJPEG stream, JPEG snapshot, Night Vision / Thermal LUT shaders, and AI bounding boxes.
 */

class CameraAiModule {
  constructor() {
    this.streamImg = document.getElementById('espCamStream');
    this.aiCanvas = document.getElementById('cameraAiCanvas');
    this.ctx = this.aiCanvas ? this.aiCanvas.getContext('2d') : null;
    
    this.camIp = '192.168.4.1'; // Default ESP32-CAM AP IP or station IP
    this.streamUrl = `http://${this.camIp}:81/stream`;
    this.captureUrl = `http://${this.camIp}/capture`;
    
    this.filterMode = 'NORMAL'; // 'NORMAL', 'NIGHT_VISION', 'THERMAL'
    this.isAiDetecting = true;
    this.isLiveConnected = false;

    this.detectedObjects = []; // [{label, confidence, x, y, width, height, color}]
    this.simulationFrame = 0;

    this.initCanvas();
    this.startAiLoop();
  }

  initCanvas() {
    if (!this.aiCanvas) return;
    this.aiCanvas.width = 640;
    this.aiCanvas.height = 480;
  }

  setCamIp(ip) {
    this.camIp = ip.trim();
    this.streamUrl = `http://${this.camIp}:81/stream`;
    this.captureUrl = `http://${this.camIp}/capture`;
  }

  connectStream() {
    if (!this.streamImg) return;
    this.streamImg.crossOrigin = "anonymous";
    this.streamImg.src = this.streamUrl;
    this.streamImg.onload = () => {
      this.isLiveConnected = true;
      const statusEl = document.getElementById('camStatusPill');
      if (statusEl) statusEl.textContent = 'ESP32-CAM LIVE';
    };
    this.streamImg.onerror = () => {
      this.isLiveConnected = false;
      const statusEl = document.getElementById('camStatusPill');
      if (statusEl) statusEl.textContent = 'NO STREAM (SIMULATION)';
    };
  }

  setFilter(mode) {
    this.filterMode = mode;
    if (this.streamImg) {
      if (mode === 'NIGHT_VISION') {
        this.streamImg.style.filter = 'contrast(180%) brightness(140%) sepia(100%) hue-rotate(85deg) saturate(300%)';
      } else if (mode === 'THERMAL') {
        this.streamImg.style.filter = 'invert(100%) contrast(200%) saturate(400%) hue-rotate(180deg)';
      } else {
        this.streamImg.style.filter = 'none';
      }
    }
  }

  /**
   * Fetch a single snapshot from ESP32-CAM (API 3 GET /capture)
   */
  async fetchSnapshot() {
    try {
      // In physical hardware setup, direct fetch:
      // const res = await fetch(this.captureUrl, { cache: 'no-cache' });
      // const blob = await res.blob();
      // return URL.createObjectURL(blob);
      
      // Canvas snapshot from active video stream or simulated tactical feed
      const offscreen = document.createElement('canvas');
      offscreen.width = 640;
      offscreen.height = 480;
      const offCtx = offscreen.getContext('2d');

      if (this.isLiveConnected && this.streamImg) {
        offCtx.drawImage(this.streamImg, 0, 0, 640, 480);
      } else {
        // Render tactical mine simulation photo
        this.renderSimulatedMineFeed(offCtx, 640, 480);
      }
      return offscreen.toDataURL('image/jpeg', 0.9);
    } catch (e) {
      console.error("Failed to capture snapshot:", e);
      return null;
    }
  }

  /**
   * AI Trapped Miner & Hazard Computer Vision Loop
   */
  startAiLoop() {
    const loop = () => {
      this.renderAiOverlay();
      requestAnimationFrame(loop);
    };
    requestAnimationFrame(loop);
  }

  renderAiOverlay() {
    if (!this.ctx || !this.aiCanvas) return;
    const ctx = this.ctx;
    const w = this.aiCanvas.width;
    const h = this.aiCanvas.height;

    ctx.clearRect(0, 0, w, h);

    // If live stream is not connected, draw simulated synthetic underground mine visual
    if (!this.isLiveConnected) {
      this.renderSimulatedMineFeed(ctx, w, h);
    }

    if (!this.isAiDetecting) return;

    // Render AI Detection Bounding Boxes
    this.detectedObjects.forEach(obj => {
      ctx.strokeStyle = obj.color || '#10b981';
      ctx.lineWidth = 2.5;
      ctx.strokeRect(obj.x, obj.y, obj.width, obj.height);

      // Label background & text
      ctx.fillStyle = obj.color || '#10b981';
      const labelText = `${obj.label} ${(obj.confidence * 100).toFixed(0)}%`;
      ctx.font = 'bold 12px monospace';
      const textWidth = ctx.measureText(labelText).width;
      ctx.fillRect(obj.x, obj.y - 18, textWidth + 8, 18);

      ctx.fillStyle = '#000';
      ctx.fillText(labelText, obj.x + 4, obj.y - 4);

      // Corner accent markers
      this.drawBoxAccents(ctx, obj.x, obj.y, obj.width, obj.height, obj.color);
    });

    // Draw Crosshair / Optical Center HUD
    ctx.strokeStyle = 'rgba(6, 182, 212, 0.4)';
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(w / 2 - 20, h / 2);
    ctx.lineTo(w / 2 + 20, h / 2);
    ctx.moveTo(w / 2, h / 2 - 20);
    ctx.lineTo(w / 2, h / 2 + 20);
    ctx.stroke();

    // Mode HUD watermark
    ctx.fillStyle = '#64748b';
    ctx.font = '11px monospace';
    ctx.fillText(`CAM MODE: ${this.filterMode} | AI DETECT: ACTIVE`, 12, h - 12);
  }

  drawBoxAccents(ctx, x, y, w, h, color) {
    const len = 10;
    ctx.strokeStyle = '#fff';
    ctx.lineWidth = 2;
    // Top-left
    ctx.beginPath();
    ctx.moveTo(x, y + len); ctx.lineTo(x, y); ctx.lineTo(x + len, y);
    ctx.stroke();
    // Bottom-right
    ctx.beginPath();
    ctx.moveTo(x + w, y + h - len); ctx.lineTo(x + w, y + h); ctx.lineTo(x + w - len, y + h);
    ctx.stroke();
  }

  /**
   * Simulated Dark Underground Coal Mine Camera Feed for Demos
   */
  renderSimulatedMineFeed(ctx, w, h) {
    this.simulationFrame++;
    // Dark tunnel gradient
    const grad = ctx.createRadialGradient(w / 2, h / 2, 40, w / 2, h / 2, w / 1.5);
    grad.addColorStop(0, '#151c2e');
    grad.addColorStop(0.5, '#0a0e1a');
    grad.addColorStop(1, '#020408');
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, w, h);

    // Tunnel wall perspective lines
    ctx.strokeStyle = 'rgba(36, 50, 82, 0.5)';
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.moveTo(0, 0); ctx.lineTo(w * 0.35, h * 0.4);
    ctx.moveTo(w, 0); ctx.lineTo(w * 0.65, h * 0.4);
    ctx.moveTo(0, h); ctx.lineTo(w * 0.35, h * 0.6);
    ctx.moveTo(w, h); ctx.lineTo(w * 0.65, h * 0.6);
    ctx.stroke();

    // Distant mine passage
    ctx.fillStyle = '#05070d';
    ctx.fillRect(w * 0.35, h * 0.4, w * 0.3, h * 0.2);

    // Coal Rock Textures / Mine Timber Supports
    ctx.strokeStyle = '#27354a';
    ctx.strokeRect(w * 0.25, h * 0.25, 20, h * 0.55);
    ctx.strokeRect(w * 0.72, h * 0.25, 20, h * 0.55);

    // Simulated Trapped Miner silhouette if scenario active
    if (this.isMinerInFrame) {
      ctx.fillStyle = '#d97706'; // Reflective vest orange
      ctx.beginPath();
      ctx.arc(w * 0.52, h * 0.48, 14, 0, Math.PI * 2); // Helmet
      ctx.fill();
      ctx.fillStyle = '#fbbf24'; // Hard hat yellow
      ctx.fillRect(w * 0.46, h * 0.44, 18, 6);
      ctx.fillStyle = '#b45309'; // Body / torso
      ctx.fillRect(w * 0.46, h * 0.52, 22, 34);
    }
  }

  setSimulatedDetections(scenario) {
    if (scenario === 'TRAPPED_MINER') {
      this.isMinerInFrame = true;
      this.detectedObjects = [
        { label: 'TRAPPED MINER (SOS)', confidence: 0.94, x: 270, y: 190, width: 120, height: 160, color: '#ef4444' },
        { label: 'SAFETY HELMET', confidence: 0.89, x: 290, y: 195, width: 60, height: 40, color: '#f59e0b' }
      ];
    } else if (scenario === 'GAS_LEAK') {
      this.isMinerInFrame = false;
      this.detectedObjects = [
        { label: 'HAZARD ZONE (CH4 ACCUMULATION)', confidence: 0.91, x: 220, y: 160, width: 220, height: 140, color: '#ef4444' }
      ];
    } else if (scenario === 'OBSTACLE') {
      this.isMinerInFrame = false;
      this.detectedObjects = [
        { label: 'COLLAPSED DEBRIS / ROCKFALL', confidence: 0.88, x: 180, y: 220, width: 280, height: 150, color: '#f59e0b' }
      ];
    } else {
      this.isMinerInFrame = false;
      this.detectedObjects = [
        { label: 'MINE TUNNEL (CLEAR)', confidence: 0.96, x: 210, y: 170, width: 220, height: 150, color: '#10b981' }
      ];
    }
  }
}

window.cameraAi = new CameraAiModule();
