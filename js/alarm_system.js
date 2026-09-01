/**
 * SIH26039: AI-POWERED MINE RESCUE ROVER - GROUND CONTROL STATION
 * Module: Emergency Audio Siren & Web Speech Voice Synthesizer
 * Provides multi-tier mine hazard audio alarms & spoken rescue alerts.
 */

class AlarmSystemModule {
  constructor() {
    this.audioCtx = null;
    this.isMuted = false;
    this.isSirenPlaying = false;
    this.sirenOsc = null;
    this.sirenGain = null;
    this.lastVoiceTime = 0;
    this.voiceThrottleMs = 8000; // Speak at most once per 8 seconds to prevent overlap

    this.banner = document.getElementById('globalAlertBanner');
    this.bannerText = document.getElementById('alertBannerText');
    this.muteBtn = document.getElementById('audioMuteBtn');

    if (this.muteBtn) {
      this.muteBtn.addEventListener('click', () => this.toggleMute());
    }
  }

  initAudio() {
    if (!this.audioCtx) {
      const AudioContext = window.AudioContext || window.webkitAudioContext;
      if (AudioContext) {
        this.audioCtx = new AudioContext();
      }
    }
    if (this.audioCtx && this.audioCtx.state === 'suspended') {
      this.audioCtx.resume();
    }
  }

  toggleMute() {
    this.isMuted = !this.isMuted;
    if (this.muteBtn) {
      this.muteBtn.innerHTML = this.isMuted 
        ? `<svg width="14" height="14" fill="currentColor" viewBox="0 0 24 24"><path d="M16.5 12c0-1.77-1.02-3.29-2.5-4.03v2.21l2.45 2.45c.03-.2.05-.41.05-.63zm2.5 0c0 .94-.2 1.82-.54 2.64l1.51 1.51C20.63 14.91 21 13.5 21 12c0-4.28-2.99-7.86-7-8.77v2.06c2.89.86 5 3.54 5 6.71zM4.27 3L3 4.27 7.73 9H3v6h4l5 5v-6.73l4.25 4.25c-.67.52-1.42.93-2.25 1.18v2.06c1.38-.31 2.63-.95 3.69-1.81L19.73 21 21 19.73l-9-9L4.27 3zM12 4L9.91 6.09 12 8.18V4z"/></svg> MUTED`
        : `<svg width="14" height="14" fill="currentColor" viewBox="0 0 24 24"><path d="M3 9v6h4l5 5V4L7 9H3zm13.5 3c0-1.77-1.02-3.29-2.5-4.03v8.05c1.48-.73 2.5-2.25 2.5-4.02zM14 3.23v2.06c2.89.86 5 3.54 5 6.71s-2.11 5.85-5 6.71v2.06c4.01-.91 7-4.49 7-8.77s-2.99-7.86-7-8.77z"/></svg> AUDIO ON`;
      this.muteBtn.classList.toggle('btn-outline', !this.isMuted);
      this.muteBtn.classList.toggle('btn-warning', this.isMuted);
    }
    if (this.isMuted) {
      this.stopSiren();
    }
  }

  /**
   * Set alert state in UI & sound
   */
  setAlert(level, message, voicePhrase = null) {
    if (!this.banner || !this.bannerText) return;

    if (level === 'CRITICAL') {
      this.banner.classList.remove('hidden', 'warning-mode');
      this.bannerText.innerHTML = `<b>CRITICAL HAZARD:</b> ${message}`;
      this.startSiren(800, 1200);
      if (voicePhrase) this.announceVoice(voicePhrase);
    } else if (level === 'WARNING') {
      this.banner.classList.remove('hidden');
      this.banner.classList.add('warning-mode');
      this.bannerText.innerHTML = `<b>CAUTION:</b> ${message}`;
      this.stopSiren();
      if (voicePhrase) this.announceVoice(voicePhrase);
    } else {
      this.banner.classList.add('hidden');
      this.stopSiren();
    }
  }

  clearAlert() {
    this.setAlert('NORMAL', '');
  }

  startSiren(lowFreq = 600, highFreq = 1000) {
    if (this.isMuted || this.isSirenPlaying) return;
    this.initAudio();
    if (!this.audioCtx) return;

    try {
      this.sirenOsc = this.audioCtx.createOscillator();
      this.sirenGain = this.audioCtx.createGain();

      this.sirenOsc.type = 'sawtooth';
      const now = this.audioCtx.currentTime;

      // Frequency sweep modulation
      this.sirenOsc.frequency.setValueAtTime(lowFreq, now);
      for (let i = 0; i < 30; i++) {
        this.sirenOsc.frequency.exponentialRampToValueAtTime(highFreq, now + i * 0.8 + 0.4);
        this.sirenOsc.frequency.exponentialRampToValueAtTime(lowFreq, now + (i + 1) * 0.8);
      }

      this.sirenGain.gain.setValueAtTime(0.08, now); // comfortable volume
      this.sirenOsc.connect(this.sirenGain);
      this.sirenGain.connect(this.audioCtx.destination);

      this.sirenOsc.start();
      this.isSirenPlaying = true;
    } catch (e) {
      console.warn("Audio siren error:", e);
    }
  }

  stopSiren() {
    if (this.sirenOsc) {
      try {
        this.sirenOsc.stop();
        this.sirenOsc.disconnect();
      } catch (e) {}
      this.sirenOsc = null;
    }
    this.isSirenPlaying = false;
  }

  playChime() {
    if (this.isMuted) return;
    this.initAudio();
    if (!this.audioCtx) return;

    try {
      const osc = this.audioCtx.createOscillator();
      const gain = this.audioCtx.createGain();
      osc.type = 'sine';
      osc.frequency.setValueAtTime(880, this.audioCtx.currentTime); // A5
      osc.frequency.setValueAtTime(1320, this.audioCtx.currentTime + 0.15); // E6
      gain.gain.setValueAtTime(0.12, this.audioCtx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.001, this.audioCtx.currentTime + 0.5);

      osc.connect(gain);
      gain.connect(this.audioCtx.destination);
      osc.start();
      osc.stop(this.audioCtx.currentTime + 0.5);
    } catch (e) {}
  }

  announceVoice(text) {
    if (this.isMuted || !('speechSynthesis' in window)) return;
    const now = Date.now();
    if (now - this.lastVoiceTime < this.voiceThrottleMs) return;

    this.lastVoiceTime = now;
    window.speechSynthesis.cancel(); // cancel previous queued speech
    const utterance = new SpeechSynthesisUtterance(text);
    utterance.rate = 1.05;
    utterance.pitch = 0.95;
    window.speechSynthesis.speak(utterance);
  }
}

window.alarmSystem = new AlarmSystemModule();
