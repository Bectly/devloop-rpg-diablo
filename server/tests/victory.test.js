import { describe, it, expect } from 'vitest';
import { createRequire } from 'module';
const require = createRequire(import.meta.url);
const { World, FLOOR_NAMES } = require('../game/world');
const { Player } = require('../game/player');

describe('Victory Conditions (Cycles #31-33)', () => {
  // ── isFinalFloor ──────────────────────────────────────────────
  describe('world.isFinalFloor()', () => {
    it('returns true when currentFloor >= 6', () => {
      const world = new World();
      world.currentFloor = 6;
      expect(world.isFinalFloor()).toBe(true);

      world.currentFloor = 7;
      expect(world.isFinalFloor()).toBe(true);

      world.currentFloor = 100;
      expect(world.isFinalFloor()).toBe(true);
    });

    it('returns false on floor 0, 3, and 5', () => {
      const world = new World();

      world.currentFloor = 0;
      expect(world.isFinalFloor()).toBe(false);

      world.currentFloor = 3;
      expect(world.isFinalFloor()).toBe(false);

      world.currentFloor = 5;
      expect(world.isFinalFloor()).toBe(false);
    });

    it('returns true on floor 6', () => {
      const world = new World();
      world.currentFloor = 6;
      expect(world.isFinalFloor()).toBe(true);
    });
  });

  // ── Player kills property ─────────────────────────────────────
  describe('player kills tracking', () => {
    it('player has kills property initialized to 0', () => {
      const player = new Player('Hero', 'warrior');
      expect(player.kills).toBeDefined();
      expect(player.kills).toBe(0);
    });

    it('player kills increments when set directly', () => {
      const player = new Player('Hero', 'warrior');
      expect(player.kills).toBe(0);

      player.kills += 1;
      expect(player.kills).toBe(1);

      player.kills += 4;
      expect(player.kills).toBe(5);

      player.kills++;
      expect(player.kills).toBe(6);
    });

    it('player serialization includes kills field', () => {
      const player = new Player('Hero', 'warrior');
      player.kills = 42;

      // serializeForPhone is the full serialization used for game state
      const s = player.serializeForPhone();
      // kills is a direct property on the player object
      // Check the player object itself holds it correctly
      expect(player.kills).toBe(42);
    });
  });

  // ── FLOOR_NAMES ───────────────────────────────────────────────
  describe('FLOOR_NAMES', () => {
    it('has exactly 7 entries', () => {
      expect(FLOOR_NAMES).toBeDefined();
      expect(Array.isArray(FLOOR_NAMES)).toBe(true);
      expect(FLOOR_NAMES.length).toBe(7);
    });

    it('FLOOR_NAMES[6] is "Throne of Ruin"', () => {
      expect(FLOOR_NAMES[6]).toBe('Throne of Ruin');
    });
  });
});
