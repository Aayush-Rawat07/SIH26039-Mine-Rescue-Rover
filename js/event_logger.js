/**
 * SIH26039: AI-POWERED MINE RESCUE ROVER - GROUND CONTROL STATION
 * Module: Real-Time Tactical Event Logger
 * Logs system alerts, gas threshold violations, teleoperation commands, and sensor events.
 */

class EventLogger {
  constructor(containerId = 'eventLogContainer') {
    this.containerId = containerId;
    this.container = null;
    this.events = [];
    this.maxEvents = 300;
    this.autoScroll = true;
    this.currentFilter = 'ALL'; // 'ALL', 'HAZARDS', 'COMMANDS', 'SAMPLES', 'INFO'

    this.init();
  }

  init() {
    this.container = document.getElementById(this.containerId);
    this.log('INFO', 'SYSTEM', 'Tactical Mission Event Logger initialized.');
  }

  /**
   * Log an event
   * @param {string} level - 'INFO', 'WARN', 'CRIT', 'CMD', 'SAMPLE'
   * @param {string} source - e.g. 'LIDAR', 'GAS', 'ROVER', 'LoRa', 'AI'
   * @param {string} message - description of event
   * @param {object} metadata - optional extra data
   */
  log(level, source, message, metadata = null) {
    const now = new Date();
    const timeStr = now.toTimeString().split(' ')[0] + '.' + String(now.getMilliseconds()).padStart(3, '0');

    const entry = {
      id: Date.now() + Math.random(),
      time: timeStr,
      timestamp: now.getTime(),
      level: level.toUpperCase(),
      source: source.toUpperCase(),
      message,
      metadata
    };

    this.events.push(entry);
    if (this.events.length > this.maxEvents) {
      this.events.shift();
    }

    this.appendEntryToDom(entry);
  }

  setFilter(filter) {
    this.currentFilter = filter;
    this.renderAll();
  }

  toggleAutoScroll() {
    this.autoScroll = !this.autoScroll;
    return this.autoScroll;
  }

  clear() {
    this.events = [];
    if (this.container) {
      this.container.innerHTML = '';
    }
    this.log('INFO', 'SYSTEM', 'Event log cleared by operator.');
  }

  shouldDisplay(entry) {
    if (this.currentFilter === 'ALL') return true;
    if (this.currentFilter === 'HAZARDS') return entry.level === 'WARN' || entry.level === 'CRIT';
    if (this.currentFilter === 'COMMANDS') return entry.level === 'CMD';
    if (this.currentFilter === 'SAMPLES') return entry.level === 'SAMPLE';
    if (this.currentFilter === 'INFO') return entry.level === 'INFO';
    return true;
  }

  renderAll() {
    if (!this.container) this.container = document.getElementById(this.containerId);
    if (!this.container) return;

    this.container.innerHTML = '';
    this.events.forEach(entry => {
      if (this.shouldDisplay(entry)) {
        this.container.appendChild(this.createEntryElement(entry));
      }
    });

    if (this.autoScroll) {
      this.container.scrollTop = this.container.scrollHeight;
    }
  }

  createEntryElement(entry) {
    const div = document.createElement('div');
    div.className = `log-entry log-${entry.level.toLowerCase()}`;
    div.style.padding = '3px 6px';
    div.style.borderBottom = '1px solid rgba(255, 255, 255, 0.05)';
    div.style.fontFamily = 'var(--font-mono, monospace)';
    div.style.fontSize = '0.72rem';
    div.style.display = 'flex';
    div.style.alignItems = 'flex-start';
    div.style.gap = '8px';
    div.style.lineHeight = '1.4';

    let badgeColor = '#64748b';
    let badgeBg = 'rgba(100, 116, 139, 0.2)';
    if (entry.level === 'CRIT') {
      badgeColor = '#ef4444';
      badgeBg = 'rgba(239, 68, 68, 0.25)';
    } else if (entry.level === 'WARN') {
      badgeColor = '#f59e0b';
      badgeBg = 'rgba(245, 158, 11, 0.25)';
    } else if (entry.level === 'CMD') {
      badgeColor = '#06b6d4';
      badgeBg = 'rgba(6, 182, 212, 0.25)';
    } else if (entry.level === 'SAMPLE') {
      badgeColor = '#10b981';
      badgeBg = 'rgba(16, 185, 129, 0.25)';
    }

    div.innerHTML = `
      <span style="color: var(--text-muted, #64748b); white-space: nowrap;">${entry.time}</span>
      <span style="color: ${badgeColor}; background: ${badgeBg}; padding: 1px 5px; border-radius: 3px; font-weight: 700; font-size: 0.65rem; white-space: nowrap;">${entry.level}</span>
      <span style="color: var(--text-secondary, #94a3b8); font-weight: 600; white-space: nowrap;">[${entry.source}]</span>
      <span style="color: ${entry.level === 'CRIT' ? '#fca5a5' : (entry.level === 'WARN' ? '#fde68a' : '#e2e8f0')}; flex: 1; word-break: break-word;">${this.escapeHtml(entry.message)}</span>
    `;

    return div;
  }

  appendEntryToDom(entry) {
    if (!this.container) this.container = document.getElementById(this.containerId);
    if (!this.container) return;

    if (this.shouldDisplay(entry)) {
      this.container.appendChild(this.createEntryElement(entry));
      if (this.autoScroll) {
        this.container.scrollTop = this.container.scrollHeight;
      }
    }
  }

  escapeHtml(str) {
    return String(str)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;');
  }
}

window.eventLogger = new EventLogger();
