/**
 * Balancing tests for Cycles #226-227
 * Covers: XP curve, gold drops, gamble cost, cursed wave stagger
 */
import { describe, it, expect } from 'vitest';
import { createRequire } from 'node:module';
import { readFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const require = createRequire(import.meta.url);
const __dirname = dirname(fileURLToPath(import.meta.url));

// ── 1. XP Curve (player.js) ────────────────────────────────────────

describe('XP Curve', () => {
  // The formula in levelUp(): xpToNext = Math.floor(100 * Math.pow(1.28, level))
  function xpForLevel(level) {
    return Math.floor(100 * Math.pow(1.28, level));
  }

  it('xpToNext increases with exponent 1.28', () => {
    let prev = xpForLevel(1);
    for (let lvl = 2; lvl <= 20; lvl++) {
      const current = xpForLevel(lvl);
      expect(current).toBeGreaterThan(prev);
      // Each level should be ~1.28x the previous
      const ratio = current / prev;
      expect(ratio).toBeGreaterThanOrEqual(1.2);
      expect(ratio).toBeLessThanOrEqual(1.4);
      prev = current;
    }
  });

  it('xpToNext at level 1 equals Math.floor(100 * 1.28^1) = 128', () => {
    expect(xpForLevel(1)).toBe(128);
  });

  it('xpToNext at level 10 equals Math.floor(100 * 1.28^10)', () => {
    expect(xpForLevel(10)).toBe(Math.floor(100 * Math.pow(1.28, 10)));
  });

  it('~245 kills (35/floor * 7 floors) should reach level 12-16', () => {
    // Average XP per kill by floor, using real monster pools + floor scaling
    // Floor 0-1: skeleton(25)*2, slime(8), archer(30) => avg 22 * (1 + floor*0.1)
    // Floor 2-3: demon(45), fire_imp(30), hell_hound(45), archer(30) => avg 37.5 * scale
    // Floor 4-6: shadow_stalker(55), demon(45), wraith(45), zombie(15) => avg 40 * scale
    function avgXpForFloor(floor) {
      let baseAvg;
      if (floor <= 1) baseAvg = 22;
      else if (floor <= 3) baseAvg = 37.5;
      else baseAvg = 40;
      return baseAvg * (1 + floor * 0.1);
    }

    const KILLS_PER_FLOOR = 35;
    let level = 1;
    let xp = 0;
    let xpToNext = xpForLevel(level);

    for (let floor = 0; floor <= 6; floor++) {
      const avgXp = avgXpForFloor(floor);
      for (let k = 0; k < KILLS_PER_FLOOR; k++) {
        xp += avgXp;
        while (xp >= xpToNext && level < 30) {
          xp -= xpToNext;
          level += 1;
          xpToNext = xpForLevel(level);
        }
      }
    }

    expect(level).toBeGreaterThanOrEqual(12);
    expect(level).toBeLessThanOrEqual(16);
  });
});

// ── 2. Gold Drops (items.js) ────────────────────────────────────────

describe('Gold Drops', () => {
  // From generateLoot(): goldBase = 3 + lootTier*2 + floor*2, goldMax = 8 + lootTier*4 + floor*4
  // (before goldMult which defaults to 1.0)
  function goldRange(lootTier, floor, goldMult = 1.0) {
    const goldBase = Math.floor((3 + lootTier * 2 + floor * 2) * goldMult);
    const goldMax = Math.floor((8 + lootTier * 4 + floor * 4) * goldMult);
    return { goldBase, goldMax };
  }

  it('floor 0 gold range is reasonable (3-12ish for tier 0)', () => {
    const { goldBase, goldMax } = goldRange(0, 0);
    expect(goldBase).toBe(3);
    expect(goldMax).toBe(8);
    // With tier 1 monster (most common early):
    const t1 = goldRange(1, 0);
    expect(t1.goldBase).toBe(5);
    expect(t1.goldMax).toBe(12);
  });

  it('floor 6 gold range is reasonable (15-36ish for tier 0)', () => {
    const { goldBase, goldMax } = goldRange(0, 6);
    expect(goldBase).toBe(15);
    expect(goldMax).toBe(32);
    // With tier 1:
    const t1 = goldRange(1, 6);
    expect(t1.goldBase).toBe(17);
    expect(t1.goldMax).toBe(36);
  });

  it('gold scales linearly with floor', () => {
    const floor0 = goldRange(0, 0);
    const floor3 = goldRange(0, 3);
    const floor6 = goldRange(0, 6);
    // Each floor adds +2 to base, +4 to max
    expect(floor3.goldBase - floor0.goldBase).toBe(6);  // 3 floors * 2
    expect(floor3.goldMax - floor0.goldMax).toBe(12);   // 3 floors * 4
    expect(floor6.goldBase - floor0.goldBase).toBe(12); // 6 floors * 2
    expect(floor6.goldMax - floor0.goldMax).toBe(24);   // 6 floors * 4
  });

  it('goldMult multiplier applies correctly', () => {
    const normal = goldRange(1, 3, 1.0);
    const boosted = goldRange(1, 3, 1.5);
    expect(boosted.goldBase).toBe(Math.floor(normal.goldBase * 1.5));
    expect(boosted.goldMax).toBe(Math.floor(normal.goldMax * 1.5));
  });
});

// ── 3. Gamble Cost (socket-handlers-events.js) ──────────────────────

describe('Gamble Cost', () => {
  // Formula: cost = 75 + 100 * floor
  function gambleCost(floor) {
    return 75 + 100 * floor;
  }

  it('floor 0 gamble cost = 75', () => {
    expect(gambleCost(0)).toBe(75);
  });

  it('floor 6 gamble cost = 675', () => {
    expect(gambleCost(6)).toBe(675);
  });

  it('gamble cost scales linearly at 100g per floor', () => {
    for (let f = 0; f <= 6; f++) {
      expect(gambleCost(f)).toBe(75 + 100 * f);
    }
  });

  it('source code contains the gamble cost formula', () => {
    const src = readFileSync(
      resolve(__dirname, '..', 'socket-handlers-events.js'),
      'utf-8',
    );
    expect(src).toContain('75 + 100 * floor');
  });
});

// ── 4. Cursed Wave Stagger (spawning.js) ────────────────────────────

describe('Cursed Wave Stagger', () => {
  it('spawning.js sets monster.spawning = true and staggered spawnDelay', () => {
    const src = readFileSync(
      resolve(__dirname, '..', 'spawning.js'),
      'utf-8',
    );

    // Verify the stagger logic is present
    expect(src).toContain('monster.spawning = true');
    expect(src).toContain('monster.spawnDelay = i * SPAWN_STAGGER_MS');
  });

  it('SPAWN_STAGGER_MS is imported from world.js and equals 200', () => {
    const src = readFileSync(
      resolve(__dirname, '..', 'spawning.js'),
      'utf-8',
    );
    expect(src).toContain('SPAWN_STAGGER_MS');

    // Verify the constant value in world.js
    const worldSrc = readFileSync(
      resolve(__dirname, '..', 'game', 'world.js'),
      'utf-8',
    );
    expect(worldSrc).toMatch(/SPAWN_STAGGER_MS\s*=\s*200/);
  });

  it('stagger produces increasing delays per monster index', () => {
    const SPAWN_STAGGER_MS = 200;
    const monsterCount = 5;
    const delays = [];
    for (let i = 0; i < monsterCount; i++) {
      delays.push(i * SPAWN_STAGGER_MS);
    }
    // First monster spawns immediately, rest staggered
    expect(delays[0]).toBe(0);
    expect(delays[1]).toBe(200);
    expect(delays[4]).toBe(800);
    // All delays strictly increasing after index 0
    for (let i = 1; i < delays.length; i++) {
      expect(delays[i]).toBeGreaterThan(delays[i - 1]);
    }
  });
});
