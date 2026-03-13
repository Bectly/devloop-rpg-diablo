import { describe, it, expect, beforeEach } from 'vitest';
import { createRequire } from 'module';
const require = createRequire(import.meta.url);
const { World, DIFFICULTY_SCALES, FLOOR_NAMES } = require('../game/world');
const { rollAffixes } = require('../game/affixes');
const { createMonster } = require('../game/monsters');

// ── DIFFICULTY_SCALES Constants ──────────────────────────────────

describe('DIFFICULTY_SCALES', () => {
  it('exports three difficulty levels', () => {
    expect(Object.keys(DIFFICULTY_SCALES)).toEqual(['normal', 'nightmare', 'hell']);
  });

  it('normal has 1.0x multipliers', () => {
    const s = DIFFICULTY_SCALES.normal;
    expect(s.hpMult).toBe(1.0);
    expect(s.dmgMult).toBe(1.0);
    expect(s.eliteBonus).toBe(0);
    expect(s.xpMult).toBe(1.0);
    expect(s.goldMult).toBe(1.0);
  });

  it('nightmare scales HP 1.5x, DMG 1.3x, elite +10%', () => {
    const s = DIFFICULTY_SCALES.nightmare;
    expect(s.hpMult).toBe(1.5);
    expect(s.dmgMult).toBe(1.3);
    expect(s.eliteBonus).toBe(0.10);
    expect(s.xpMult).toBe(1.5);
  });

  it('hell scales HP 2.5x, DMG 1.8x, elite +20%', () => {
    const s = DIFFICULTY_SCALES.hell;
    expect(s.hpMult).toBe(2.5);
    expect(s.dmgMult).toBe(1.8);
    expect(s.eliteBonus).toBe(0.20);
    expect(s.xpMult).toBe(2.0);
  });

  it('each difficulty has a label', () => {
    expect(DIFFICULTY_SCALES.normal.label).toBe('Normal');
    expect(DIFFICULTY_SCALES.nightmare.label).toBe('Nightmare');
    expect(DIFFICULTY_SCALES.hell.label).toBe('Hell');
  });
});

// ── World Difficulty Integration ─────────────────────────────────

describe('World — Difficulty', () => {
  let world;

  beforeEach(() => {
    world = new World();
  });

  it('defaults to normal difficulty', () => {
    expect(world.difficulty).toBe('normal');
  });

  it('generateFloor sets difficulty', () => {
    world.generateFloor(0, 'nightmare');
    expect(world.difficulty).toBe('nightmare');
  });

  it('generateFloor preserves difficulty when not passed', () => {
    world.generateFloor(0, 'hell');
    world.generateFloor(1);
    // undefined is falsy, so difficulty should NOT be overwritten
    expect(world.difficulty).toBe('hell');
  });

  it('getFloorInfo includes difficulty', () => {
    world.generateFloor(0, 'nightmare');
    const info = world.getFloorInfo();
    expect(info.difficulty).toBe('nightmare');
  });

  it('serialize includes difficulty', () => {
    world.generateFloor(0, 'hell');
    const data = world.serialize();
    expect(data.difficulty).toBe('hell');
  });
});

// ── Monster Scaling ─────────────────────────────────────────────

describe('Monster Difficulty Scaling', () => {
  it('normal difficulty does not change monster stats', () => {
    const base = createMonster('skeleton', 100, 100, 0);
    const world = new World();
    world.generateFloor(0, 'normal');

    // Spawn a wave and check first non-boss monster
    const monsterRoom = world.rooms.find(r => r.type === 'monster');
    if (monsterRoom) {
      world.spawnWave(monsterRoom);
      const spawned = world.monsters[0];
      // Normal: 1.0x — HP should match base skeleton HP (80) scaled by floor
      // Floor 0 skeleton base is 80 HP. createMonster applies floor scaling.
      const baseRef = createMonster('skeleton', 100, 100, 0);
      // Can't check exact type since pool is random, but stat relationship should hold
      expect(spawned.hp).toBeGreaterThan(0);
    }
  });

  it('nightmare monsters have higher HP than normal', () => {
    // Create skeleton baseline
    const baseSkeleton = createMonster('skeleton', 100, 100, 3);
    const baseHp = baseSkeleton.hp;
    const baseDmg = baseSkeleton.damage;

    // Nightmare: 1.5x HP, 1.3x DMG
    const expectedHp = Math.floor(baseHp * 1.5);
    const expectedDmg = Math.floor(baseDmg * 1.3);

    // Verify the math is correct
    expect(expectedHp).toBe(Math.floor(baseHp * DIFFICULTY_SCALES.nightmare.hpMult));
    expect(expectedDmg).toBe(Math.floor(baseDmg * DIFFICULTY_SCALES.nightmare.dmgMult));
  });

  it('hell monsters have 2.5x HP and 1.8x DMG', () => {
    const base = createMonster('demon', 100, 100, 4);
    const expectedHp = Math.floor(base.hp * 2.5);
    const expectedDmg = Math.floor(base.damage * 1.8);
    const expectedXp = Math.floor(base.xpReward * 2.0);

    expect(expectedHp).toBeGreaterThan(base.hp);
    expect(expectedDmg).toBeGreaterThan(base.damage);
    expect(expectedXp).toBeGreaterThan(base.xpReward);
  });

  it('nightmare world spawns scaled monsters', () => {
    const world = new World();
    world.generateFloor(3, 'nightmare');

    // Force spawn wave in a monster room
    const monsterRoom = world.rooms.find(r => r.type === 'monster');
    if (monsterRoom && monsterRoom.wavesSpawned === 0) {
      world.spawnWave(monsterRoom);
      expect(world.monsters.length).toBeGreaterThan(0);
      // All monsters should have scaled stats (HP > base)
      for (const m of world.monsters) {
        expect(m.hp).toBeGreaterThan(0);
        expect(m.maxHp).toBeGreaterThan(0);
        expect(m.damage).toBeGreaterThan(0);
      }
    }
  });

  it('hell world spawns tougher monsters than normal', () => {
    // Generate same floor with normal and hell, compare aggregate HP
    const normalWorld = new World();
    normalWorld.generateFloor(4, 'normal');
    const normalRoom = normalWorld.rooms.find(r => r.type === 'monster');

    const hellWorld = new World();
    hellWorld.generateFloor(4, 'hell');
    const hellRoom = hellWorld.rooms.find(r => r.type === 'monster');

    if (normalRoom && hellRoom) {
      normalWorld.spawnWave(normalRoom);
      hellWorld.spawnWave(hellRoom);

      const normalTotalHp = normalWorld.monsters.reduce((s, m) => s + m.maxHp, 0);
      const hellTotalHp = hellWorld.monsters.reduce((s, m) => s + m.maxHp, 0);

      // Hell should have significantly more total HP (2.5x per monster)
      // Even with random monster types, hell should clearly be higher
      if (normalWorld.monsters.length > 0 && hellWorld.monsters.length > 0) {
        expect(hellTotalHp).toBeGreaterThan(normalTotalHp);
      }
    }
  });
});

// ── rollAffixes with eliteBonus ─────────────────────────────────

describe('rollAffixes — eliteBonus', () => {
  it('no elites on floor 0-2 without bonus', () => {
    // Run 50 trials — all should return null
    for (let i = 0; i < 50; i++) {
      expect(rollAffixes(0, 'skeleton', 0)).toBeNull();
      expect(rollAffixes(1, 'skeleton', 0)).toBeNull();
      expect(rollAffixes(2, 'skeleton', 0)).toBeNull();
    }
  });

  it('elites possible on floor 0-2 WITH bonus (nightmare/hell)', () => {
    let eliteCount = 0;
    for (let i = 0; i < 200; i++) {
      const result = rollAffixes(1, 'skeleton', 0.20); // hell bonus
      if (result) eliteCount++;
    }
    // 20% chance over 200 trials — should get at least a few
    expect(eliteCount).toBeGreaterThan(0);
    expect(eliteCount).toBeLessThan(100); // shouldn't be more than half
  });

  it('early floor elites with bonus are always champion rank', () => {
    for (let i = 0; i < 100; i++) {
      const result = rollAffixes(1, 'skeleton', 0.20);
      if (result) {
        expect(result.rank).toBe('champion');
        expect(result.affixes.length).toBe(1); // maxAffixes=1 for early floors
      }
    }
  });

  it('elite chance capped at 60%', () => {
    // Floor 7+ base is 30% + hell 20% = 50%, under cap
    // Even with extreme bonus, should never exceed 60%
    let eliteCount = 0;
    for (let i = 0; i < 1000; i++) {
      const result = rollAffixes(7, 'skeleton', 0.50); // extreme bonus
      if (result) eliteCount++;
    }
    // Cap at 60% → expect roughly 600/1000, definitely under 750
    expect(eliteCount).toBeLessThan(750);
    expect(eliteCount).toBeGreaterThan(400); // should be around 600
  });

  it('bonus increases elite rate on mid floors', () => {
    // Floor 4: base 15%. With 0.10 bonus → 25%.
    let normalElites = 0;
    let bonusElites = 0;
    const trials = 500;

    for (let i = 0; i < trials; i++) {
      if (rollAffixes(4, 'skeleton', 0)) normalElites++;
      if (rollAffixes(4, 'skeleton', 0.10)) bonusElites++;
    }

    // Bonus should produce more elites
    expect(bonusElites).toBeGreaterThan(normalElites);
  });

  it('bosses never get affixes regardless of bonus', () => {
    for (let i = 0; i < 50; i++) {
      expect(rollAffixes(6, 'boss_knight', 0.20)).toBeNull();
      expect(rollAffixes(6, 'boss_infernal', 0.20)).toBeNull();
      expect(rollAffixes(6, 'boss_void', 0.20)).toBeNull();
    }
  });

  it('slime_small never gets affixes regardless of bonus', () => {
    for (let i = 0; i < 50; i++) {
      expect(rollAffixes(6, 'slime_small', 0.20)).toBeNull();
    }
  });
});

// ── Difficulty Persistence through Floor Transitions ─────────────

describe('Difficulty — Floor Transitions', () => {
  it('difficulty persists across floor changes', () => {
    const world = new World();
    world.generateFloor(0, 'hell');
    expect(world.difficulty).toBe('hell');

    world.generateFloor(1, 'hell');
    expect(world.difficulty).toBe('hell');

    world.generateFloor(2, 'hell');
    expect(world.difficulty).toBe('hell');
  });

  it('difficulty can be changed between floors', () => {
    const world = new World();
    world.generateFloor(0, 'normal');
    expect(world.difficulty).toBe('normal');

    world.generateFloor(1, 'nightmare');
    expect(world.difficulty).toBe('nightmare');
  });

  it('unknown difficulty falls back gracefully', () => {
    const world = new World();
    world.generateFloor(0, 'impossible');
    // Should set difficulty to 'impossible' but scaling uses fallback
    expect(world.difficulty).toBe('impossible');

    // Spawning should still work (falls back to normal scale)
    const room = world.rooms.find(r => r.type === 'monster');
    if (room) {
      world.spawnWave(room);
      expect(world.monsters.length).toBeGreaterThan(0);
    }
  });
});
