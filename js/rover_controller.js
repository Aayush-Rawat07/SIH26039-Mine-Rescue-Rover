/**
 * SIH26039: AI-POWERED MINE RESCUE ROVER - GROUND CONTROL STATION
 * Module: Teleoperation & Motor Driver Controller
 * Handles WASD keyboard, Touch D-Pad, Speed PWM slider, Headlights, and E-Stop.
 * Formats JSON command packets transmitted over Serial / LoRa to Brain 1.
 */

class RoverController {
  constructor() {
    this.speedPwm = 200; // Default 0-255 PWM speed
    this.headlightsOn = false;
    this.isEstopActive = false;
    this.activeDirection = 'STOP';

    this.initKeyboard();
    this.initDpad();
  }

  setSpeed(val) {
    this.speedPwm = parseInt(val, 10);
    const speedEl = document.getElementById('teleopSpeedVal');
    if (speedEl) speedEl.textContent = `${this.speedPwm}`;
  }

  async sendDriveCommand(action) {
    if (this.isEstopActive && action !== 'STOP') {
      console.warn("E-STOP is active. Cannot drive until released.");
      return;
    }

    this.activeDirection = action;
    const cmdPacket = {
      type: "cmd",
      action: action,
      speed: action === 'STOP' ? 0 : this.speedPwm,
      timestamp: Date.now()
    };

    if (window.serialManager) {
      await window.serialManager.sendCommand(cmdPacket);
    }

    if (window.eventLogger && action !== 'STOP') {
      window.eventLogger.log('CMD', 'ROVER', `Drive: ${action} (PWM: ${this.speedPwm})`);
    }

    this.updateDpadUi(action);
  }

  async emergencyStop() {
    this.isEstopActive = !this.isEstopActive;
    const estopBtn = document.getElementById('estopBtn');

    if (this.isEstopActive) {
      if (estopBtn) {
        estopBtn.style.background = '#ef4444';
        estopBtn.innerHTML = '⚠️ E-STOP ENGAGED (CLICK TO RELEASE)';
      }
      await this.sendDriveCommand('STOP');
      if (window.alarmSystem) {
        window.alarmSystem.announceVoice("Emergency stop engaged. Rover halted.");
      }
      if (window.eventLogger) {
        window.eventLogger.log('CRIT', 'ROVER', 'EMERGENCY BRAKE ENGAGED.');
      }
    } else {
      if (estopBtn) {
        estopBtn.style.background = '';
        estopBtn.innerHTML = '🛑 EMERGENCY STOP (SPACE)';
      }
      if (window.alarmSystem) {
        window.alarmSystem.announceVoice("Emergency stop released.");
      }
      if (window.eventLogger) {
        window.eventLogger.log('INFO', 'ROVER', 'Emergency brake released.');
      }
    }
  }

  async toggleHeadlights() {
    this.headlightsOn = !this.headlightsOn;
    const lightBtn = document.getElementById('headlightToggleBtn');
    if (lightBtn) {
      lightBtn.classList.toggle('btn-warning', this.headlightsOn);
      lightBtn.classList.toggle('btn-outline', !this.headlightsOn);
      lightBtn.innerHTML = this.headlightsOn ? '💡 LIGHTS ON' : '💡 LIGHTS OFF';
    }

    const cmdPacket = {
      type: "cmd",
      action: "SET_LIGHTS",
      state: this.headlightsOn ? 1 : 0
    };
    if (window.serialManager) {
      await window.serialManager.sendCommand(cmdPacket);
    }
    if (window.eventLogger) {
      window.eventLogger.log('CMD', 'ROVER', `Headlights: ${this.headlightsOn ? 'ON' : 'OFF'}`);
    }
  }

  async triggerSoilSample() {
    const cmdPacket = {
      type: "cmd",
      action: "TRIGGER_SCOOP_CYCLE"
    };
    if (window.serialManager) {
      await window.serialManager.sendCommand(cmdPacket);
    }
    if (window.eventLogger) {
      window.eventLogger.log('CMD', 'SCOOP', 'Actuating passive soil scoop cycle & camera trigger pulse.');
    }
    // Also simulate receiving sample_event if testing in simulator
    if (window.simulator && window.simulator.isRunning) {
      window.simulator.triggerSampleEvent();
    }
  }

  initKeyboard() {
    const keyMap = {
      'KeyW': 'FORWARD',
      'ArrowUp': 'FORWARD',
      'KeyS': 'BACKWARD',
      'ArrowDown': 'BACKWARD',
      'KeyA': 'LEFT',
      'ArrowLeft': 'LEFT',
      'KeyD': 'RIGHT',
      'ArrowRight': 'RIGHT',
      'Space': 'ESTOP'
    };

    let pressedKey = null;

    window.addEventListener('keydown', (e) => {
      if (['INPUT', 'SELECT', 'TEXTAREA'].includes(e.target.tagName)) return;
      if (e.code === 'Space') {
        e.preventDefault();
        this.emergencyStop();
        return;
      }
      if (keyMap[e.code] && pressedKey !== e.code) {
        pressedKey = e.code;
        e.preventDefault();
        this.sendDriveCommand(keyMap[e.code]);
      }
    });

    window.addEventListener('keyup', (e) => {
      if (['INPUT', 'SELECT', 'TEXTAREA'].includes(e.target.tagName)) return;
      if (keyMap[e.code] && pressedKey === e.code) {
        pressedKey = null;
        e.preventDefault();
        this.sendDriveCommand('STOP');
      }
    });
  }

  initDpad() {
    const actions = [
      { id: 'dpadUp', action: 'FORWARD' },
      { id: 'dpadDown', action: 'BACKWARD' },
      { id: 'dpadLeft', action: 'LEFT' },
      { id: 'dpadRight', action: 'RIGHT' },
      { id: 'dpadStop', action: 'STOP' }
    ];

    actions.forEach(({ id, action }) => {
      const btn = document.getElementById(id);
      if (!btn) return;

      const handleStart = (e) => {
        e.preventDefault();
        this.sendDriveCommand(action);
      };

      const handleEnd = (e) => {
        e.preventDefault();
        if (action !== 'STOP') {
          this.sendDriveCommand('STOP');
        }
      };

      btn.addEventListener('mousedown', handleStart);
      btn.addEventListener('mouseup', handleEnd);
      btn.addEventListener('mouseleave', handleEnd);
      btn.addEventListener('touchstart', handleStart, { passive: false });
      btn.addEventListener('touchend', handleEnd, { passive: false });
    });
  }

  updateDpadUi(action) {
    const ids = ['dpadUp', 'dpadDown', 'dpadLeft', 'dpadRight', 'dpadStop'];
    ids.forEach(id => {
      const el = document.getElementById(id);
      if (el) el.classList.remove('pressed');
    });

    const activeMap = {
      'FORWARD': 'dpadUp',
      'BACKWARD': 'dpadDown',
      'LEFT': 'dpadLeft',
      'RIGHT': 'dpadRight',
      'STOP': 'dpadStop'
    };

    if (activeMap[action]) {
      const activeEl = document.getElementById(activeMap[action]);
      if (activeEl) activeEl.classList.add('pressed');
    }
  }
}

window.roverController = new RoverController();
