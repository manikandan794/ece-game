/**
 * Procedural Web Audio API sound generator for GLITCH HUNT.
 * 100% royalty-free, zero external asset dependencies, zero network latency.
 */
class GlitchHuntAudio {
  constructor() {
    this.ctx = null;
    this.masterGain = null;
    this.isMuted = false;
    this.volume = 0.8;
    this.ambienceOsc = null;
    this.ambienceGain = null;
  }

  init() {
    if (!this.ctx) {
      const AudioCtx = window.AudioContext || window.webkitAudioContext;
      if (AudioCtx) {
        this.ctx = new AudioCtx();
        this.masterGain = this.ctx.createGain();
        this.masterGain.gain.setValueAtTime(this.isMuted ? 0 : this.volume, this.ctx.currentTime);
        this.masterGain.connect(this.ctx.destination);
      }
    }
    if (this.ctx && this.ctx.state === 'suspended') {
      this.ctx.resume();
    }
  }

  setMuted(muted) {
    this.isMuted = Boolean(muted);
    if (this.masterGain && this.ctx) {
      this.masterGain.gain.setValueAtTime(this.isMuted ? 0 : this.volume, this.ctx.currentTime);
    }
  }

  setVolume(vol) {
    this.volume = Math.max(0, Math.min(1, Number(vol)));
    if (this.masterGain && this.ctx && !this.isMuted) {
      this.masterGain.gain.setValueAtTime(this.volume, this.ctx.currentTime);
    }
  }

  /**
   * Countdown Tick: crisp high-tech radar click
   */
  playTick(urgency = false) {
    try {
      this.init();
      if (!this.ctx || this.isMuted) return;

      const osc = this.ctx.createOscillator();
      const gain = this.ctx.createGain();
      const freq = urgency ? 1200 : 880;

      osc.type = 'sine';
      osc.frequency.setValueAtTime(freq, this.ctx.currentTime);
      osc.frequency.exponentialRampToValueAtTime(300, this.ctx.currentTime + 0.04);

      gain.gain.setValueAtTime(urgency ? 0.35 : 0.18, this.ctx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.001, this.ctx.currentTime + 0.04);

      osc.connect(gain);
      gain.connect(this.masterGain);

      osc.start();
      osc.stop(this.ctx.currentTime + 0.045);
    } catch (e) {}
  }

  /**
   * TIME UP: Electronic buzzer alarm
   */
  playTimeUp() {
    try {
      this.init();
      if (!this.ctx || this.isMuted) return;

      const now = this.ctx.currentTime;
      for (let i = 0; i < 3; i++) {
        const osc = this.ctx.createOscillator();
        const gain = this.ctx.createGain();

        osc.type = 'sawtooth';
        osc.frequency.setValueAtTime(220, now + (i * 0.15));
        osc.frequency.setValueAtTime(180, now + (i * 0.15) + 0.05);

        gain.gain.setValueAtTime(0.25, now + (i * 0.15));
        gain.gain.exponentialRampToValueAtTime(0.001, now + (i * 0.15) + 0.12);

        osc.connect(gain);
        gain.connect(this.masterGain);

        osc.start(now + (i * 0.15));
        osc.stop(now + (i * 0.15) + 0.13);
      }
    } catch (e) {}
  }

  /**
   * GLITCH: Digital static noise burst
   */
  playGlitch() {
    try {
      this.init();
      if (!this.ctx || this.isMuted) return;

      const bufferSize = this.ctx.sampleRate * 0.1;
      const buffer = this.ctx.createBuffer(1, bufferSize, this.ctx.sampleRate);
      const data = buffer.getChannelData(0);
      for (let i = 0; i < bufferSize; i++) {
        data[i] = (Math.random() * 2 - 1) * Math.exp(-i / (bufferSize * 0.5));
      }

      const noise = this.ctx.createBufferSource();
      noise.buffer = buffer;

      const filter = this.ctx.createBiquadFilter();
      filter.type = 'bandpass';
      filter.frequency.setValueAtTime(1500, this.ctx.currentTime);
      filter.Q.setValueAtTime(4, this.ctx.currentTime);

      const gain = this.ctx.createGain();
      gain.gain.setValueAtTime(0.2, this.ctx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.001, this.ctx.currentTime + 0.1);

      noise.connect(filter);
      filter.connect(gain);
      gain.connect(this.masterGain);

      noise.start();
    } catch (e) {}
  }

  /**
   * Transition Whoosh / Stage Ready
   */
  playTransition() {
    try {
      this.init();
      if (!this.ctx || this.isMuted) return;

      const osc = this.ctx.createOscillator();
      const gain = this.ctx.createGain();

      osc.type = 'triangle';
      osc.frequency.setValueAtTime(150, this.ctx.currentTime);
      osc.frequency.exponentialRampToValueAtTime(600, this.ctx.currentTime + 0.25);

      gain.gain.setValueAtTime(0.2, this.ctx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.001, this.ctx.currentTime + 0.25);

      osc.connect(gain);
      gain.connect(this.masterGain);

      osc.start();
      osc.stop(this.ctx.currentTime + 0.26);
    } catch (e) {}
  }

  /**
   * Low Ambient Cyber Drone for Projector
   */
  startAmbience() {
    try {
      this.init();
      if (!this.ctx || this.ambienceOsc) return;

      this.ambienceOsc = this.ctx.createOscillator();
      this.ambienceGain = this.ctx.createGain();

      this.ambienceOsc.type = 'sine';
      this.ambienceOsc.frequency.setValueAtTime(55, this.ctx.currentTime); // 55 Hz A1 note

      const filter = this.ctx.createBiquadFilter();
      filter.type = 'lowpass';
      filter.frequency.setValueAtTime(200, this.ctx.currentTime);

      this.ambienceGain.gain.setValueAtTime(0.04, this.ctx.currentTime);

      this.ambienceOsc.connect(filter);
      filter.connect(this.ambienceGain);
      this.ambienceGain.connect(this.masterGain);

      this.ambienceOsc.start();
    } catch (e) {}
  }

  stopAmbience() {
    if (this.ambienceOsc) {
      try {
        this.ambienceOsc.stop();
        this.ambienceOsc.disconnect();
      } catch (e) {}
      this.ambienceOsc = null;
    }
  }
}

export const audioService = new GlitchHuntAudio();
