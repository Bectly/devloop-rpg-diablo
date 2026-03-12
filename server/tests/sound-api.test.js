import { describe, it, expect, beforeEach, vi } from 'vitest';

// Mock AudioContext for Node.js environment
class MockOscillator {
  constructor() { this.type = 'sine'; this.frequency = { setValueAtTime: vi.fn(), exponentialRampToValueAtTime: vi.fn(), linearRampToValueAtTime: vi.fn() }; }
  connect() { return this; }
  start() {}
  stop() {}
}

class MockGainNode {
  constructor() { this.gain = { setValueAtTime: vi.fn(), exponentialRampToValueAtTime: vi.fn(), linearRampToValueAtTime: vi.fn() }; }
  connect() { return this; }
}

class MockBiquadFilter {
  constructor() { this.frequency = { setValueAtTime: vi.fn(), linearRampToValueAtTime: vi.fn() }; this.Q = { value: 0 }; this.type = 'lowpass'; }
  connect() { return this; }
}

class MockAudioContext {
  constructor() {
    this.state = 'running';
    this.currentTime = 0;
    this.sampleRate = 44100;
    this.destination = {};
  }
  createOscillator() { return new MockOscillator(); }
  createGain() { return new MockGainNode(); }
  createBiquadFilter() { return new MockBiquadFilter(); }
  createBuffer(channels, length, sampleRate) {
    return { getChannelData: () => new Float32Array(length) };
  }
  createBufferSource() {
    return { buffer: null, connect() { return this; }, start() {}, stop() {} };
  }
  resume() { this.state = 'running'; return Promise.resolve(); }
}

// Load Sound module
globalThis.window = globalThis;
globalThis.AudioContext = MockAudioContext;

// Import sound.js (it assigns to window.Sound)
await import('../../client/shared/sound.js');
const Sound = globalThis.Sound;

describe('Sound Engine — API surface', () => {
  beforeEach(() => {
    Sound.ctx = null;
    Sound._muted = false;
    Sound.masterVol = 0.3;
  });

  it('should have all 13 sound methods', () => {
    const methods = ['hit', 'critHit', 'playerHurt', 'monsterDie', 'loot', 'gold',
      'levelUp', 'questComplete', 'bossSpawn', 'shrineUse', 'floorTransition',
      'uiClick', 'dialogueOpen'];
    for (const m of methods) {
      expect(typeof Sound[m]).toBe('function');
    }
  });

  it('should have init, unlock, mute, unmute, toggle methods', () => {
    for (const m of ['init', 'unlock', 'mute', 'unmute', 'toggle']) {
      expect(typeof Sound[m]).toBe('function');
    }
  });

  it('init() creates AudioContext', () => {
    expect(Sound.ctx).toBeNull();
    Sound.init();
    expect(Sound.ctx).not.toBeNull();
    expect(Sound.ctx).toBeInstanceOf(MockAudioContext);
  });

  it('init() is idempotent', () => {
    Sound.init();
    const ctx1 = Sound.ctx;
    Sound.init();
    expect(Sound.ctx).toBe(ctx1);
  });

  it('unlock() creates context if not exists', () => {
    expect(Sound.ctx).toBeNull();
    Sound.unlock();
    expect(Sound.ctx).not.toBeNull();
  });

  it('unlock() resumes suspended context', () => {
    Sound.init();
    Sound.ctx.state = 'suspended';
    Sound.unlock();
    expect(Sound.ctx.state).toBe('running');
  });

  it('mute() sets _muted to true', () => {
    expect(Sound._muted).toBe(false);
    Sound.mute();
    expect(Sound._muted).toBe(true);
  });

  it('unmute() sets _muted to false', () => {
    Sound.mute();
    Sound.unmute();
    expect(Sound._muted).toBe(false);
  });

  it('toggle() flips mute state and returns new state', () => {
    expect(Sound._muted).toBe(false);
    const result1 = Sound.toggle();
    expect(result1).toBe(false); // toggle returns !_muted (i.e., is sound ON?)
    expect(Sound._muted).toBe(true);
    const result2 = Sound.toggle();
    expect(result2).toBe(true);
    expect(Sound._muted).toBe(false);
  });

  it('sound methods do nothing when muted', () => {
    Sound.init();
    Sound.mute();
    // Should not throw
    Sound.hit(0.5);
    Sound.critHit();
    Sound.playerHurt();
    Sound.monsterDie();
    Sound.loot();
    Sound.gold();
    Sound.levelUp();
    Sound.questComplete();
    Sound.bossSpawn();
    Sound.shrineUse();
    Sound.floorTransition();
    Sound.uiClick();
    Sound.dialogueOpen();
  });

  it('sound methods do nothing when ctx is null', () => {
    Sound.ctx = null;
    // Should not throw
    Sound.hit(0.5);
    Sound.loot();
    Sound.bossSpawn();
    Sound.dialogueOpen();
  });

  it('sound methods work when initialized and unmuted', () => {
    Sound.init();
    Sound.unmute();
    // Should not throw
    Sound.hit(0.5);
    Sound.critHit();
    Sound.playerHurt();
    Sound.monsterDie();
    Sound.loot();
    Sound.gold();
    Sound.levelUp();
    Sound.questComplete();
    Sound.bossSpawn();
    Sound.shrineUse();
    Sound.floorTransition();
    Sound.uiClick();
    Sound.dialogueOpen();
  });

  it('masterVol defaults to 0.3', () => {
    expect(Sound.masterVol).toBe(0.3);
  });

  it('_noise helper does not throw', () => {
    Sound.init();
    Sound._noise(0.1, 0.2);
  });
});
