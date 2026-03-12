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

  floorTransition() {
    // Low sweep + reverb-like decay
    if (!this.ctx || this._muted) return;
    const t = this.ctx.currentTime;
    const o = this.ctx.createOscillator();
    const g = this._gain(0.2, 1.0);
    o.type = 'sine';
    o.frequency.setValueAtTime(80, t);
    o.frequency.linearRampToValueAtTime(200, t + 0.5);
    o.frequency.exponentialRampToValueAtTime(60, t + 0.9);
    o.connect(g);
    o.start(t);
    o.stop(t + 1.1);
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
