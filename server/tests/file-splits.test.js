import { describe, it, expect } from 'vitest';
import { createRequire } from 'module';
const require = createRequire(import.meta.url);

// ── Socket handlers: combat split ─────────────────────────────────
describe('socket-handlers-combat exports', () => {
  const combat = require('../socket-handlers-combat');

  it('exports handleAttack as a function', () => {
    expect(typeof combat.handleAttack).toBe('function');
  });

  it('exports handleSkill as a function', () => {
    expect(typeof combat.handleSkill).toBe('function');
  });

  it('exports handleUsePotion as a function', () => {
    expect(typeof combat.handleUsePotion).toBe('function');
  });

  it('exports handleLootPickup as a function', () => {
    expect(typeof combat.handleLootPickup).toBe('function');
  });

  it('exports handleLootPickupNearest as a function', () => {
    expect(typeof combat.handleLootPickupNearest).toBe('function');
  });

  it('exports handleChestOpen as a function', () => {
    expect(typeof combat.handleChestOpen).toBe('function');
  });

  it('exports handleLootFilter as a function', () => {
    expect(typeof combat.handleLootFilter).toBe('function');
  });
});

// ── Socket handlers: events split ─────────────────────────────────
describe('socket-handlers-events exports', () => {
  const events = require('../socket-handlers-events');

  it('exports handleEnchantPreview as a function', () => {
    expect(typeof events.handleEnchantPreview).toBe('function');
  });

  it('exports handleEnchantExecute as a function', () => {
    expect(typeof events.handleEnchantExecute).toBe('function');
  });

  it('exports handleGamble as a function', () => {
    expect(typeof events.handleGamble).toBe('function');
  });

  it('exports handleGemSocket as a function', () => {
    expect(typeof events.handleGemSocket).toBe('function');
  });

  it('exports handleGemUnsocket as a function', () => {
    expect(typeof events.handleGemUnsocket).toBe('function');
  });

  it('exports handleGemCombine as a function', () => {
    expect(typeof events.handleGemCombine).toBe('function');
  });
});

// ── Game loop split ───────────────────────────────────────────────
describe('game-loop exports', () => {
  const gameLoop = require('../game-loop');

  it('exports createGameLoop as a function', () => {
    expect(typeof gameLoop.createGameLoop).toBe('function');
  });
});

// ── Spawning split ────────────────────────────────────────────────
describe('spawning exports', () => {
  const spawning = require('../spawning');

  it('exports spawnCursedEventWave as a function', () => {
    expect(typeof spawning.spawnCursedEventWave).toBe('function');
  });

  it('exports trySpawnGoblin as a function', () => {
    expect(typeof spawning.trySpawnGoblin).toBe('function');
  });

  it('exports trySpawnCursedEvent as a function', () => {
    expect(typeof spawning.trySpawnCursedEvent).toBe('function');
  });
});

// ── All exports are functions (batch check) ───────────────────────
describe('all split module exports are functions', () => {
  const combat = require('../socket-handlers-combat');
  const events = require('../socket-handlers-events');
  const gameLoop = require('../game-loop');
  const spawning = require('../spawning');

  const combatExports = ['handleAttack', 'handleSkill', 'handleUsePotion',
    'handleLootPickup', 'handleLootPickupNearest', 'handleChestOpen', 'handleLootFilter'];
  const eventsExports = ['handleEnchantPreview', 'handleEnchantExecute',
    'handleGamble', 'handleGemSocket', 'handleGemUnsocket', 'handleGemCombine'];
  const gameLoopExports = ['createGameLoop'];
  const spawningExports = ['spawnCursedEventWave', 'trySpawnGoblin', 'trySpawnCursedEvent'];

  for (const name of combatExports) {
    it(`socket-handlers-combat.${name} is a function`, () => {
      expect(typeof combat[name]).toBe('function');
    });
  }

  for (const name of eventsExports) {
    it(`socket-handlers-events.${name} is a function`, () => {
      expect(typeof events[name]).toBe('function');
    });
  }

  for (const name of gameLoopExports) {
    it(`game-loop.${name} is a function`, () => {
      expect(typeof gameLoop[name]).toBe('function');
    });
  }

  for (const name of spawningExports) {
    it(`spawning.${name} is a function`, () => {
      expect(typeof spawning[name]).toBe('function');
    });
  }
});
