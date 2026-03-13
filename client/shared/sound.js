// ─── DevLoop RPG — Procedural Sound Engine ─────────────────────
// No audio files needed. All sounds generated via Web Audio API.
// Shared between TV (game.js) and Phone (controller.js).
// Loaded as window.Sound global.

window.Sound = {
  ctx: null,
  masterVol: 0.3,
  _muted: false,

  init() {
    if (this.ctx) return;
    this.ctx = new (window.AudioContext || window.webkitAudioContext)();
  },

  // Must be called from a user gesture (click/touch) to unlock audio
  unlock() {
    if (!this.ctx) this.init();
    if (this.ctx.state === 'suspended') {
      this.ctx.resume();
    }
  },

  _gain(vol = 1, rampDown = 0.1) {
    const g = this.ctx.createGain();
    g.gain.setValueAtTime(vol * this.masterVol, this.ctx.currentTime);
    if (rampDown > 0) {
      g.gain.exponentialRampToValueAtTime(0.001, this.ctx.currentTime + rampDown);
    }
    g.connect(this.ctx.destination);
    return g;
  },

  _osc(type, freq, duration, gain) {
    // Helper: create oscillator → gain → destination, auto-stop
    if (!this.ctx || this._muted) return;
    const o = this.ctx.createOscillator();
    const g = this._gain(gain, duration);
    o.type = type;
    o.frequency.setValueAtTime(freq, this.ctx.currentTime);
    o.connect(g);
    o.start();
    o.stop(this.ctx.currentTime + duration + 0.05);
  },

  // ── Combat Sounds ──

  hit(intensity = 0.5) {
    // Short noise burst with pitch drop — sword/fist impact
    if (!this.ctx || this._muted) return;
    const t = this.ctx.currentTime;
    const o = this.ctx.createOscillator();
    const g = this._gain(0.3 * intensity, 0.15);
    o.type = 'sawtooth';
    o.frequency.setValueAtTime(200 + intensity * 200, t);
    o.frequency.exponentialRampToValueAtTime(60, t + 0.12);
    o.connect(g);
    o.start(t);
    o.stop(t + 0.15);
    // Add noise layer
    this._noise(0.08, 0.2 * intensity);
  },

  critHit() {
    // Higher pitch hit + metallic ring
    if (!this.ctx || this._muted) return;
    const t = this.ctx.currentTime;
    // Impact
    const o = this.ctx.createOscillator();
    const g = this._gain(0.4, 0.2);
    o.type = 'sawtooth';
    o.frequency.setValueAtTime(600, t);
    o.frequency.exponentialRampToValueAtTime(100, t + 0.15);
    o.connect(g);
    o.start(t);
    o.stop(t + 0.2);
    // Ring
    this._osc('sine', 1200, 0.3, 0.15);
    this._osc('sine', 1800, 0.2, 0.08);
  },

  playerHurt() {
    // Low thud — damage taken
    if (!this.ctx || this._muted) return;
    const t = this.ctx.currentTime;
    const o = this.ctx.createOscillator();
    const g = this._gain(0.35, 0.2);
    o.type = 'sine';
    o.frequency.setValueAtTime(120, t);
    o.frequency.exponentialRampToValueAtTime(40, t + 0.18);
    o.connect(g);
    o.start(t);
    o.stop(t + 0.22);
  },

  monsterDie() {
    // Descending tone — enemy death
    if (!this.ctx || this._muted) return;
    const t = this.ctx.currentTime;
    const o = this.ctx.createOscillator();
    const g = this._gain(0.25, 0.4);
    o.type = 'square';
    o.frequency.setValueAtTime(400, t);
    o.frequency.exponentialRampToValueAtTime(50, t + 0.35);
    o.connect(g);
    o.start(t);
    o.stop(t + 0.4);
    this._noise(0.15, 0.12);
  },

  // ── Loot & Items ──

  loot() {
    // Ascending 3-note chime — item pickup
    if (!this.ctx || this._muted) return;
    const notes = [523, 659, 784]; // C5, E5, G5
    notes.forEach((freq, i) => {
      setTimeout(() => this._osc('sine', freq, 0.2, 0.2), i * 70);
    });
  },

  gold() {
    // Single coin clink
    if (!this.ctx || this._muted) return;
    this._osc('sine', 2000, 0.08, 0.15);
    setTimeout(() => this._osc('sine', 2500, 0.06, 0.1), 30);
  },

  // ── Progression ──

  levelUp() {
    // Major chord arpeggio C-E-G-C ascending
    if (!this.ctx || this._muted) return;
    const notes = [523, 659, 784, 1047]; // C5-E5-G5-C6
    notes.forEach((freq, i) => {
      setTimeout(() => this._osc('sine', freq, 0.35, 0.2), i * 100);
    });
  },

  questComplete() {
    // Short fanfare — 2 ascending notes + chord
    if (!this.ctx || this._muted) return;
    this._osc('sine', 523, 0.15, 0.2);
    setTimeout(() => {
      this._osc('sine', 784, 0.3, 0.2);
      this._osc('sine', 659, 0.3, 0.12);
    }, 120);
  },

  // ── Environment ──

  bossSpawn() {
    // Deep rumble + crescendo
    if (!this.ctx || this._muted) return;
    const t = this.ctx.currentTime;
    const o = this.ctx.createOscillator();
    const g = this.ctx.createGain();
    g.gain.setValueAtTime(0.01, t);
    g.gain.linearRampToValueAtTime(0.3 * this.masterVol, t + 0.8);
    g.gain.exponentialRampToValueAtTime(0.001, t + 1.5);
    g.connect(this.ctx.destination);
    o.type = 'sawtooth';
    o.frequency.setValueAtTime(40, t);
    o.frequency.linearRampToValueAtTime(80, t + 1.0);
    o.connect(g);
    o.start(t);
    o.stop(t + 1.6);
    // Add sub-bass
    const sub = this.ctx.createOscillator();
    const sg = this._gain(0.2, 1.2);
    sub.type = 'sine';
    sub.frequency.setValueAtTime(30, t);
    sub.connect(sg);
    sub.start(t);
    sub.stop(t + 1.3);
  },

  shrineUse() {
    // Ethereal pad — filtered noise + sine sweep
    if (!this.ctx || this._muted) return;
    const t = this.ctx.currentTime;
    // Sine sweep up
    const o = this.ctx.createOscillator();
    const g = this._gain(0.15, 0.8);
    o.type = 'sine';
    o.frequency.setValueAtTime(300, t);
    o.frequency.linearRampToValueAtTime(800, t + 0.6);
    o.connect(g);
    o.start(t);
    o.stop(t + 0.8);
    // Chord
    setTimeout(() => {
      this._osc('sine', 523, 0.5, 0.1);
      this._osc('sine', 659, 0.5, 0.08);
      this._osc('sine', 784, 0.5, 0.06);
    }, 200);
  },

  victory() {
    // Epic victory fanfare — ascending major chord arpeggio + triumphant finale
    if (!this.ctx || this._muted) return;
    const t = this.ctx.currentTime;
    // First: ascending arpeggio C-E-G-C (celebratory)
    const notes = [523, 659, 784, 1047, 1319];
    notes.forEach((freq, i) => {
      const o = this.ctx.createOscillator();
      const g = this.ctx.createGain();
      g.gain.setValueAtTime(0.2 * this.masterVol, t + i * 0.12);
      g.gain.exponentialRampToValueAtTime(0.001, t + i * 0.12 + 0.5);
      g.connect(this.ctx.destination);
      o.type = 'sine';
      o.frequency.setValueAtTime(freq, t + i * 0.12);
      o.connect(g);
      o.start(t + i * 0.12);
      o.stop(t + i * 0.12 + 0.5);
    });
    // Triumphant chord at the end
    const chordStart = t + 0.7;
    [523, 659, 784, 1047].forEach(freq => {
      const o = this.ctx.createOscillator();
      const g = this.ctx.createGain();
      g.gain.setValueAtTime(0.15 * this.masterVol, chordStart);
      g.gain.exponentialRampToValueAtTime(0.001, chordStart + 1.5);
      g.connect(this.ctx.destination);
      o.type = 'sine';
      o.frequency.setValueAtTime(freq, chordStart);
      o.connect(g);
      o.start(chordStart);
      o.stop(chordStart + 1.6);
    });
    // Sub-bass rumble for grandeur
    const sub = this.ctx.createOscillator();
    const sg = this.ctx.createGain();
    sg.gain.setValueAtTime(0.15 * this.masterVol, chordStart);
    sg.gain.exponentialRampToValueAtTime(0.001, chordStart + 1.8);
    sg.connect(this.ctx.destination);
    sub.type = 'sine';
    sub.frequency.setValueAtTime(65, chordStart);
    sub.connect(sg);
    sub.start(chordStart);
    sub.stop(chordStart + 2.0);
  },

  floorTransition(zoneId) {
    // Enhanced floor transition — deeper sub-bass, longer duration, zone-specific pitch
    if (!this.ctx || this._muted) return;
    const t = this.ctx.currentTime;

    // Zone-specific pitch center
    const zonePitch = { catacombs: 80, inferno: 60, abyss: 50 };
    const basePitch = zonePitch[zoneId] || 80;

    // Main sweep oscillator (longer: 2s vs old 1.1s)
    const o = this.ctx.createOscillator();
    const g = this.ctx.createGain();
    g.gain.setValueAtTime(0.2 * this.masterVol, t);
    g.gain.linearRampToValueAtTime(0.25 * this.masterVol, t + 0.6);
    g.gain.exponentialRampToValueAtTime(0.001, t + 2.0);
    g.connect(this.ctx.destination);
    o.type = 'sine';
    o.frequency.setValueAtTime(basePitch, t);
    o.frequency.linearRampToValueAtTime(basePitch * 2.5, t + 0.7);
    o.frequency.exponentialRampToValueAtTime(basePitch * 0.6, t + 1.8);
    o.connect(g);
    o.start(t);
    o.stop(t + 2.1);

    // Deep sub-bass layer (20Hz rumble)
    const sub = this.ctx.createOscillator();
    const sg = this.ctx.createGain();
    sg.gain.setValueAtTime(0.15 * this.masterVol, t);
    sg.gain.exponentialRampToValueAtTime(0.001, t + 2.0);
    sg.connect(this.ctx.destination);
    sub.type = 'sine';
    sub.frequency.setValueAtTime(20, t);
    sub.frequency.linearRampToValueAtTime(35, t + 1.0);
    sub.connect(sg);
    sub.start(t);
    sub.stop(t + 2.1);

    // Filtered noise sweep for texture
    this._noise(0.4, 0.08);
  },

  // ── Ambient Drone (continuous background sound) ──

  _ambientNodes: null,

  ambientDroneStart(zoneId) {
    // Start a continuous ambient drone — zone-specific timbre
    if (!this.ctx || this._muted) return;
    this.ambientDroneStop(); // Stop any existing drone

    const t = this.ctx.currentTime;

    // Master gain for drone (fade in over 2s)
    const master = this.ctx.createGain();
    master.gain.setValueAtTime(0, t);
    master.gain.linearRampToValueAtTime(0.05 * this.masterVol, t + 2.0);
    master.connect(this.ctx.destination);

    // Zone configs: { freq, type, noiseVol, detune }
    const zones = {
      catacombs: { freq: 55, type: 'sine', noiseVol: 0.02, detune: 0 },
      inferno:   { freq: 70, type: 'sawtooth', noiseVol: 0.06, detune: 5 },
      abyss:     { freq: 40, type: 'sine', noiseVol: 0.01, detune: -8 },
    };
    const cfg = zones[zoneId] || zones.catacombs;

    // Low oscillator
    const osc = this.ctx.createOscillator();
    osc.type = cfg.type;
    osc.frequency.setValueAtTime(cfg.freq, t);
    osc.detune.setValueAtTime(cfg.detune, t);
    osc.connect(master);
    osc.start(t);

    // Second detuned oscillator for richness (abyss = ethereal beating)
    const osc2 = this.ctx.createOscillator();
    osc2.type = 'sine';
    osc2.frequency.setValueAtTime(cfg.freq * 1.002, t); // Slight detune = slow beating
    osc2.connect(master);
    osc2.start(t);

    // Filtered noise layer
    const noiseLen = 4; // 4s buffer, looped
    const bufSize = Math.round(this.ctx.sampleRate * noiseLen);
    const buf = this.ctx.createBuffer(1, bufSize, this.ctx.sampleRate);
    const noiseData = buf.getChannelData(0);
    for (let i = 0; i < bufSize; i++) noiseData[i] = (Math.random() * 2 - 1);
    const noiseSrc = this.ctx.createBufferSource();
    noiseSrc.buffer = buf;
    noiseSrc.loop = true;

    const noiseFilter = this.ctx.createBiquadFilter();
    noiseFilter.type = 'lowpass';
    noiseFilter.frequency.setValueAtTime(200, t);
    noiseFilter.Q.value = 1;

    const noiseGain = this.ctx.createGain();
    noiseGain.gain.setValueAtTime(cfg.noiseVol * this.masterVol, t);

    noiseSrc.connect(noiseFilter);
    noiseFilter.connect(noiseGain);
    noiseGain.connect(this.ctx.destination);
    noiseSrc.start(t);

    this._ambientNodes = { master, osc, osc2, noiseSrc, noiseGain, noiseFilter };
  },

  ambientDroneStop() {
    if (!this._ambientNodes) return;
    const t = this.ctx ? this.ctx.currentTime : 0;
    const { master, osc, osc2, noiseSrc } = this._ambientNodes;
    try {
      master.gain.cancelScheduledValues(t);
      master.gain.setValueAtTime(master.gain.value, t);
      master.gain.linearRampToValueAtTime(0, t + 1.0);
      setTimeout(() => {
        try { osc.stop(); osc.disconnect(); } catch (_) {}
        try { osc2.stop(); osc2.disconnect(); } catch (_) {}
        try { noiseSrc.stop(); noiseSrc.disconnect(); } catch (_) {}
        try { master.disconnect(); } catch (_) {}
      }, 1200);
    } catch (_) {}
    this._ambientNodes = null;
  },

  // ── Boss Music (tension chord) ──

  _bossNodes: null,

  bossMusic() {
    // Start boss tension chord: C-Eb-Gb diminished, sustained pad
    if (!this.ctx || this._muted) return;
    this.bossStop();

    const t = this.ctx.currentTime;
    const master = this.ctx.createGain();
    master.gain.setValueAtTime(0, t);
    master.gain.linearRampToValueAtTime(0.08 * this.masterVol, t + 1.5);
    master.connect(this.ctx.destination);

    // C-Eb-Gb diminished triad (C3=130.8, Eb3=155.6, Gb3=185.0)
    const freqs = [130.81, 155.56, 185.00];
    const oscs = [];

    for (const freq of freqs) {
      // Main tone
      const o = this.ctx.createOscillator();
      o.type = 'sine';
      o.frequency.setValueAtTime(freq, t);
      o.connect(master);
      o.start(t);
      oscs.push(o);

      // Detuned double for thickness
      const o2 = this.ctx.createOscillator();
      o2.type = 'sine';
      o2.frequency.setValueAtTime(freq * 1.003, t);
      const detGain = this.ctx.createGain();
      detGain.gain.setValueAtTime(0.6, t);
      o2.connect(detGain);
      detGain.connect(master);
      o2.start(t);
      oscs.push(o2);
    }

    // Slow LFO on master volume for pulsing tension
    const lfo = this.ctx.createOscillator();
    lfo.type = 'sine';
    lfo.frequency.setValueAtTime(0.3, t); // Slow pulse ~3s cycle
    const lfoGain = this.ctx.createGain();
    lfoGain.gain.setValueAtTime(0.02 * this.masterVol, t);
    lfo.connect(lfoGain);
    lfoGain.connect(master.gain);
    lfo.start(t);
    oscs.push(lfo);

    this._bossNodes = { master, oscs };
  },

  bossStop() {
    if (!this._bossNodes) return;
    const t = this.ctx ? this.ctx.currentTime : 0;
    const { master, oscs } = this._bossNodes;
    try {
      master.gain.cancelScheduledValues(t);
      master.gain.setValueAtTime(master.gain.value, t);
      master.gain.linearRampToValueAtTime(0, t + 1.0);
      setTimeout(() => {
        for (const o of oscs) { try { o.stop(); o.disconnect(); } catch (_) {} }
        try { master.disconnect(); } catch (_) {}
      }, 1200);
    } catch (_) {}
    this._bossNodes = null;
  },

  // ── UI ──

  uiClick() {
    // Tiny tick for button presses
    if (!this.ctx || this._muted) return;
    this._osc('sine', 800, 0.04, 0.1);
  },

  dialogueOpen() {
    // Soft ascending whoosh
    if (!this.ctx || this._muted) return;
    const t = this.ctx.currentTime;
    const o = this.ctx.createOscillator();
    const f = this.ctx.createBiquadFilter();
    const g = this._gain(0.12, 0.3);
    f.type = 'bandpass';
    f.frequency.setValueAtTime(400, t);
    f.frequency.linearRampToValueAtTime(1200, t + 0.2);
    f.Q.value = 2;
    o.type = 'sawtooth';
    o.frequency.setValueAtTime(200, t);
    o.frequency.linearRampToValueAtTime(600, t + 0.25);
    o.connect(f);
    f.connect(g);
    o.start(t);
    o.stop(t + 0.3);
  },

  // ── Helpers ──

  _noise(duration, vol) {
    // White noise burst via buffer
    if (!this.ctx || this._muted) return;
    const bufSize = Math.round(this.ctx.sampleRate * duration);
    const buf = this.ctx.createBuffer(1, bufSize, this.ctx.sampleRate);
    const data = buf.getChannelData(0);
    for (let i = 0; i < bufSize; i++) {
      data[i] = (Math.random() * 2 - 1);
    }
    const src = this.ctx.createBufferSource();
    src.buffer = buf;
    const g = this._gain(vol, duration);
    src.connect(g);
    src.start();
    src.stop(this.ctx.currentTime + duration + 0.02);
  },

  mute()   { this._muted = true; },
  unmute() { this._muted = false; },
  toggle() { this._muted = !this._muted; return !this._muted; },
};
