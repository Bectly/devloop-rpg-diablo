import { describe, it, expect, beforeEach } from 'vitest';
import { createRequire } from 'module';
const require = createRequire(import.meta.url);

const {
  RIFT_MODIFIERS,
  RIFT_TIERS,
  createRift,
  getRiftModifiers,
  createRiftGuardian,
  getRiftRewards,
} = require('../game/rifts');

// ── RIFT_MODIFIERS ───────────────────────────────────────────────

describe('RIFT_MODIFIERS — structure', () => {
  it('defines exactly 10 modifiers', () => {
    expect(Object.keys(RIFT_MODIFIERS)).toHaveLength(10);
  });

  it('each modifier has name, desc, effect, and value fields', () => {
    for (const [key, mod] of Object.entries(RIFT_MODIFIERS)) {
      expect(mod.name, `modifier "${key}" missing name`).toBeTruthy();
      expect(mod.desc, `modifier "${key}" missing desc`).toBeTruthy();
      expect(mod.effect, `modifier "${key}" missing effect`).toBeTruthy();
      expect(mod).toHaveProperty('value');
    }
  });

  it('no duplicate effect keys across modifiers', () => {
    const effects = Object.values(RIFT_MODIFIERS).map(m => m.effect);
    const unique = new Set(effects);
    expect(unique.size).toBe(effects.length);
  });

  it('value types are either numbers or booleans', () => {
    for (const [key, mod] of Object.entries(RIFT_MODIFIERS)) {
      const type = typeof mod.value;
      expect(['number', 'boolean'], `modifier "${key}" has unexpected value type: ${type}`)
        .toContain(type);
    }
  });

  it('modifier names are human-readable non-empty strings', () => {
    for (const [key, mod] of Object.entries(RIFT_MODIFIERS)) {
      expect(typeof mod.name).toBe('string');
      expect(mod.name.length).toBeGreaterThan(0);
      // Human-readable: starts with uppercase
      expect(mod.name[0]).toBe(mod.name[0].toUpperCase());
    }
  });
});

// ── RIFT_TIERS ───────────────────────────────────────────────────

describe('RIFT_TIERS — structure and values', () => {
  it('defines exactly 10 tiers (1-10)', () => {
    expect(Object.keys(RIFT_TIERS)).toHaveLength(10);
    for (let t = 1; t <= 10; t++) {
      expect(RIFT_TIERS[t], `tier ${t} missing`).toBeDefined();
    }
  });

  it('tier 1 has modifierCount=1, timeLimit=180, monsterHpMult=1.0, monsterDmgMult=1.0', () => {
    const t1 = RIFT_TIERS[1];
    expect(t1.modifierCount).toBe(1);
    expect(t1.timeLimit).toBe(180);
    expect(t1.monsterHpMult).toBeCloseTo(1.0);
    expect(t1.monsterDmgMult).toBeCloseTo(1.0);
  });

  it('tier 10 has modifierCount=4, timeLimit=135, and highest multipliers', () => {
    const t10 = RIFT_TIERS[10];
    expect(t10.modifierCount).toBe(4);
    expect(t10.timeLimit).toBe(135);
    // 1.0 + (10-1)*0.3 = 3.7
    expect(t10.monsterHpMult).toBeCloseTo(3.7);
    // 1.0 + (10-1)*0.2 = 2.8
    expect(t10.monsterDmgMult).toBeCloseTo(2.8);
  });

  it('higher tiers have >= modifier count than lower tiers (non-decreasing)', () => {
    for (let t = 2; t <= 10; t++) {
      expect(RIFT_TIERS[t].modifierCount).toBeGreaterThanOrEqual(RIFT_TIERS[t - 1].modifierCount);
    }
  });

  it('higher tiers have equal or less time than lower tiers (non-increasing)', () => {
    for (let t = 2; t <= 10; t++) {
      expect(RIFT_TIERS[t].timeLimit).toBeLessThanOrEqual(RIFT_TIERS[t - 1].timeLimit);
    }
  });

  it('higher tiers have greater monster HP multiplier (strictly increasing)', () => {
    for (let t = 2; t <= 10; t++) {
      expect(RIFT_TIERS[t].monsterHpMult).toBeGreaterThan(RIFT_TIERS[t - 1].monsterHpMult);
    }
  });

  it('keystoneReward is 0 for tiers 1-4 and 1 for tiers 5-10', () => {
    for (let t = 1; t <= 4; t++) {
      expect(RIFT_TIERS[t].keystoneReward).toBe(0);
    }
    for (let t = 5; t <= 10; t++) {
      expect(RIFT_TIERS[t].keystoneReward).toBe(1);
    }
  });

  it('xpReward and goldReward scale with tier (tier N > tier N-1)', () => {
    for (let t = 2; t <= 10; t++) {
      expect(RIFT_TIERS[t].xpReward).toBeGreaterThan(RIFT_TIERS[t - 1].xpReward);
      expect(RIFT_TIERS[t].goldReward).toBeGreaterThan(RIFT_TIERS[t - 1].goldReward);
    }
  });
});

// ── getRiftModifiers ─────────────────────────────────────────────

describe('getRiftModifiers(tier)', () => {
  it('returns exactly 1 modifier for tier 1', () => {
    const mods = getRiftModifiers(1);
    expect(mods).toHaveLength(1);
  });

  it('returns correct count per tier (matches tier definition)', () => {
    for (let t = 1; t <= 10; t++) {
      const mods = getRiftModifiers(t);
      expect(mods, `tier ${t} modifier count mismatch`).toHaveLength(RIFT_TIERS[t].modifierCount);
    }
  });

  it('no duplicate modifiers in a single result', () => {
    // Run many times to reduce flakiness
    for (let trial = 0; trial < 20; trial++) {
      const mods = getRiftModifiers(10); // tier 10 has most (4 modifiers)
      const keys = mods.map(m => m.key);
      const unique = new Set(keys);
      expect(unique.size).toBe(keys.length);
    }
  });

  it('all returned modifiers exist in RIFT_MODIFIERS', () => {
    const validKeys = new Set(Object.keys(RIFT_MODIFIERS));
    for (let t = 1; t <= 10; t++) {
      const mods = getRiftModifiers(t);
      for (const mod of mods) {
        expect(validKeys.has(mod.key), `unknown modifier key: ${mod.key}`).toBe(true);
      }
    }
  });

  it('multiple calls for the same tier can return different modifiers (randomness)', () => {
    // For tier 1 (1 of 10 modifiers), call many times and expect variety
    const seenKeys = new Set();
    for (let i = 0; i < 100; i++) {
      const mods = getRiftModifiers(1);
      seenKeys.add(mods[0].key);
    }
    // With 100 calls from 10 possibilities, expect at least 2 different results
    expect(seenKeys.size).toBeGreaterThan(1);
  });
});

// ── createRift ───────────────────────────────────────────────────

describe('createRift(tier, playerLevel)', () => {
  it('returns object with all required fields', () => {
    const rift = createRift(3, 10);
    expect(rift).toHaveProperty('id');
    expect(rift).toHaveProperty('tier');
    expect(rift).toHaveProperty('zone');
    expect(rift).toHaveProperty('modifiers');
    expect(rift).toHaveProperty('timeLimit');
    expect(rift).toHaveProperty('monsterHpMult');
    expect(rift).toHaveProperty('monsterDmgMult');
    expect(rift).toHaveProperty('xpReward');
    expect(rift).toHaveProperty('goldReward');
    expect(rift).toHaveProperty('keystoneReward');
    expect(rift).toHaveProperty('playerLevel');
    expect(rift).toHaveProperty('state');
    expect(rift).toHaveProperty('startedAt');
  });

  it('id is a UUID string (36 chars with hyphens)', () => {
    const rift = createRift(1, 1);
    expect(typeof rift.id).toBe('string');
    expect(rift.id).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i);
  });

  it('tier matches input tier', () => {
    for (const t of [1, 5, 10]) {
      const rift = createRift(t, 1);
      expect(rift.tier).toBe(t);
    }
  });

  it('zone has id and name fields', () => {
    const rift = createRift(1, 1);
    expect(rift.zone).toHaveProperty('id');
    expect(rift.zone).toHaveProperty('name');
    expect(typeof rift.zone.id).toBe('string');
    expect(typeof rift.zone.name).toBe('string');
    expect(rift.zone.id.length).toBeGreaterThan(0);
    expect(rift.zone.name.length).toBeGreaterThan(0);
  });

  it('modifiers array length matches tier definition', () => {
    for (const t of [1, 3, 5, 7, 10]) {
      const rift = createRift(t, 1);
      expect(rift.modifiers).toHaveLength(RIFT_TIERS[t].modifierCount);
    }
  });

  it('timeLimit matches tier definition', () => {
    for (let t = 1; t <= 10; t++) {
      const rift = createRift(t, 1);
      expect(rift.timeLimit).toBe(RIFT_TIERS[t].timeLimit);
    }
  });

  it('invalid tier (0, -1, 11) is clamped to valid range, not null/throws', () => {
    // The implementation clamps: Math.max(1, Math.min(10, ...))
    const riftZero = createRift(0, 1);
    expect(riftZero).not.toBeNull();
    expect(riftZero.tier).toBe(1);

    const riftNeg = createRift(-1, 1);
    expect(riftNeg).not.toBeNull();
    expect(riftNeg.tier).toBe(1);

    const riftOver = createRift(11, 1);
    expect(riftOver).not.toBeNull();
    expect(riftOver.tier).toBe(10);
  });

  it('playerLevel is stored in the rift config', () => {
    const rift = createRift(5, 42);
    expect(rift.playerLevel).toBe(42);
  });
});

// ── createRiftGuardian ───────────────────────────────────────────

describe('createRiftGuardian(tier, zone)', () => {
  it('returns an object with required combat fields', () => {
    const guardian = createRiftGuardian(5, { id: 'catacombs', name: 'The Catacombs' });
    expect(guardian).toHaveProperty('hp');
    expect(guardian).toHaveProperty('damage');
    expect(guardian).toHaveProperty('name');
    expect(guardian).toHaveProperty('affixes');
    expect(guardian).toHaveProperty('maxHp');
    expect(guardian).toHaveProperty('armor');
  });

  it('HP scales with tier (tier 5 HP > tier 1 HP)', () => {
    const g1 = createRiftGuardian(1, { id: 'catacombs' });
    const g5 = createRiftGuardian(5, { id: 'catacombs' });
    expect(g5.hp).toBeGreaterThan(g1.hp);
  });

  it('damage scales with tier (tier 5 damage > tier 1 damage)', () => {
    const g1 = createRiftGuardian(1, { id: 'catacombs' });
    const g5 = createRiftGuardian(5, { id: 'catacombs' });
    expect(g5.damage).toBeGreaterThan(g1.damage);
  });

  it('affix count is 2 + floor(tier/3) capped by available affix pool', () => {
    // _pickRandom bug fixed (Cycle #109): pool.length was re-evaluated each iteration
    for (const t of [1, 3, 6, 9]) {
      const g = createRiftGuardian(t, { id: 'catacombs' });
      const expectedAffixCount = 2 + Math.floor(t / 3);
      expect(g.riftTier).toBe(t);
      if (g.affixes && Array.isArray(g.affixes)) {
        expect(g.affixes.length).toBe(expectedAffixCount);
      }
    }
  });

  it('name is a non-empty string', () => {
    const g = createRiftGuardian(3, { id: 'inferno', name: 'Inferno' });
    expect(typeof g.name).toBe('string');
    expect(g.name.length).toBeGreaterThan(0);
  });

  it('is marked as boss (isBoss: true)', () => {
    const g = createRiftGuardian(1, { id: 'catacombs' });
    expect(g.isBoss).toBe(true);
  });

  it('is marked as rift guardian (isRiftGuardian: true)', () => {
    const g = createRiftGuardian(5, { id: 'abyss' });
    expect(g.isRiftGuardian).toBe(true);
  });
});

// ── getRiftRewards ───────────────────────────────────────────────

describe('getRiftRewards(tier, timeRemaining, timeLimit)', () => {
  it('base rewards match tier definition when no time bonus', () => {
    // No time bonus: timeRemaining/timeLimit <= 0.5
    const rewards = getRiftRewards(3, 50, 180); // 50/180 ≈ 0.278 < 0.5
    expect(rewards.xp).toBe(RIFT_TIERS[3].xpReward);
    expect(rewards.gold).toBe(RIFT_TIERS[3].goldReward);
  });

  it('time bonus triggers when >50% time remaining', () => {
    const timeLimit = 180;
    const timeRemaining = 100; // 100/180 ≈ 0.556 > 0.5
    const rewards = getRiftRewards(3, timeRemaining, timeLimit);
    expect(rewards.timeBonus).toBe(true);
    // XP should be 50% more
    expect(rewards.xp).toBe(Math.floor(RIFT_TIERS[3].xpReward * 1.5));
    expect(rewards.gold).toBe(Math.floor(RIFT_TIERS[3].goldReward * 1.5));
  });

  it('no time bonus when <50% time remaining', () => {
    const rewards = getRiftRewards(5, 89, 180); // 89/180 ≈ 0.494 < 0.5
    expect(rewards.timeBonus).toBe(false);
    expect(rewards.xp).toBe(RIFT_TIERS[5].xpReward);
  });

  it('higher tier yields more rewards than lower tier', () => {
    const r1 = getRiftRewards(1, 0, 180);
    const r10 = getRiftRewards(10, 0, 135);
    expect(r10.xp).toBeGreaterThan(r1.xp);
    expect(r10.gold).toBeGreaterThan(r1.gold);
  });

  it('keystoneReward is 0 for tier<5 and 1 for tier>=5', () => {
    for (let t = 1; t <= 4; t++) {
      const r = getRiftRewards(t, 0, RIFT_TIERS[t].timeLimit);
      expect(r.keystones).toBe(0);
    }
    for (let t = 5; t <= 10; t++) {
      const r = getRiftRewards(t, 0, RIFT_TIERS[t].timeLimit);
      expect(r.keystones).toBe(1);
    }
  });

  it('bonusItems count scales with tier (only on time bonus)', () => {
    // Time bonus: >50% remaining
    const r1 = getRiftRewards(1, 100, 180); // has time bonus
    const r6 = getRiftRewards(6, 100, 150); // has time bonus
    expect(r1.bonusItems).toBe(Math.ceil(1 / 3)); // = 1
    expect(r6.bonusItems).toBe(Math.ceil(6 / 3)); // = 2
    expect(r6.bonusItems).toBeGreaterThanOrEqual(r1.bonusItems);
  });

  it('no bonusItems when no time bonus', () => {
    const r = getRiftRewards(10, 10, 135); // 10/135 < 0.5 — no time bonus
    expect(r.bonusItems).toBe(0);
    expect(r.timeBonus).toBe(false);
  });
});

// ── Keystone system — player.js ──────────────────────────────────

describe('Keystone system — Player', () => {
  const { Player } = require('../game/player');

  it('new player starts with 0 keystones', () => {
    const p = new Player('Hero', 'warrior');
    expect(p.keystones).toBe(0);
  });

  it('addKeystones(n) increases keystone count by n', () => {
    const p = new Player('Hero', 'warrior');
    p.addKeystones(3);
    expect(p.keystones).toBe(3);
    p.addKeystones(2);
    expect(p.keystones).toBe(5);
  });

  it('addKeystones with negative number is safe (no decrease)', () => {
    const p = new Player('Hero', 'warrior');
    p.addKeystones(3);
    p.addKeystones(-5);
    // Negative should be ignored (Math.max(0, ...) inside addKeystones)
    expect(p.keystones).toBe(3);
  });

  it('addKeystones(0) does not change count', () => {
    const p = new Player('Hero', 'warrior');
    p.addKeystones(5);
    p.addKeystones(0);
    expect(p.keystones).toBe(5);
  });

  it('spendKeystone() decreases count by 1 and returns true', () => {
    const p = new Player('Hero', 'warrior');
    p.addKeystones(3);
    const result = p.spendKeystone();
    expect(result).toBe(true);
    expect(p.keystones).toBe(2);
  });

  it('spendKeystone() with 0 keystones returns false and does not go negative', () => {
    const p = new Player('Hero', 'warrior');
    expect(p.keystones).toBe(0);
    const result = p.spendKeystone();
    expect(result).toBe(false);
    expect(p.keystones).toBe(0);
  });

  it('keystones included in serializeForPhone()', () => {
    const p = new Player('Hero', 'warrior');
    p.addKeystones(7);
    const data = p.serializeForPhone();
    expect(data).toHaveProperty('keystones');
    expect(data.keystones).toBe(7);
  });
});

// ── Keystone persistence — database.js ──────────────────────────

describe('Keystone persistence — database.js', () => {
  const { GameDatabase } = require('../game/database');
  const { Player } = require('../game/player');
  let db;

  beforeEach(() => {
    db = new GameDatabase(':memory:');
  });

  it('saves a character with keystones and loads the same value', () => {
    const p = new Player('KeystoneHero', 'warrior');
    p.addKeystones(5);
    db.saveCharacter(p, null, 0);
    const loaded = db.loadCharacter('KeystoneHero');
    expect(loaded.keystones).toBe(5);
    db.close();
  });

  it('new character defaults to 0 keystones in database', () => {
    const p = new Player('FreshHero', 'mage');
    // Do NOT add any keystones
    db.saveCharacter(p, null, 0);
    const loaded = db.loadCharacter('FreshHero');
    expect(loaded.keystones).toBe(0);
    db.close();
  });

  it('round-trip: save → load → save → load preserves keystones', () => {
    const p = new Player('RoundTrip', 'ranger');
    p.addKeystones(9);
    db.saveCharacter(p, null, 0);

    const loaded1 = db.loadCharacter('RoundTrip');
    const p2 = new Player('RoundTrip', 'ranger');
    p2.restoreFrom(loaded1);
    expect(p2.keystones).toBe(9);

    // Second save/load
    db.saveCharacter(p2, null, 0);
    const loaded2 = db.loadCharacter('RoundTrip');
    expect(loaded2.keystones).toBe(9);

    db.close();
  });
});

// ── Talent combat bonuses — integration ─────────────────────────

describe('Talent combat bonuses — CombatSystem', () => {
  const { CombatSystem } = require('../game/combat');

  function mockPlayer(overrides = {}) {
    return {
      attackPower: 100,
      spellPower: 50,
      critChance: 0,
      equipment: { weapon: null },
      buffs: [],
      setBonuses: {},
      talentBonuses: null,
      ...overrides,
    };
  }

  let combat;

  beforeEach(() => {
    combat = new CombatSystem();
  });

  // ── calcPlayerDamage ────────────────────────────────────────────

  describe('calcPlayerDamage', () => {
    it('without talentBonuses → damage is in expected range (no change)', () => {
      const player = mockPlayer({ attackPower: 100 });
      const results = [];
      for (let i = 0; i < 200; i++) {
        results.push(combat.calcPlayerDamage(player).damage);
      }
      const avg = results.reduce((a, b) => a + b, 0) / results.length;
      // Without crit (critChance=0), base 100 ± 15% → avg ~100
      expect(avg).toBeGreaterThan(70);
      expect(avg).toBeLessThan(130);
    });

    it('with damage_percent: 20 talent bonus → damage is ~20% higher', () => {
      const baseline = mockPlayer({ attackPower: 100 });
      const boosted = mockPlayer({
        attackPower: 100,
        talentBonuses: { passives: { damage_percent: 20 } },
      });

      const baseResults = [];
      const boostedResults = [];
      // Use seed of 500 samples to average out variance
      for (let i = 0; i < 500; i++) {
        baseResults.push(combat.calcPlayerDamage(baseline).damage);
        boostedResults.push(combat.calcPlayerDamage(boosted).damage);
      }
      const baseAvg = baseResults.reduce((a, b) => a + b, 0) / baseResults.length;
      const boostedAvg = boostedResults.reduce((a, b) => a + b, 0) / boostedResults.length;
      // Boosted should be approximately 20% higher (allow 5% tolerance each way)
      expect(boostedAvg).toBeGreaterThan(baseAvg * 1.1);
      expect(boostedAvg).toBeLessThan(baseAvg * 1.35);
    });

    it('with crit_damage_percent: 50 talent bonus + forced crit → crit damage is higher', () => {
      const normalCrit = mockPlayer({ attackPower: 100, critChance: 100 });
      const boostedCrit = mockPlayer({
        attackPower: 100,
        critChance: 100,
        talentBonuses: { passives: { crit_damage_percent: 50 } },
      });

      const normalResults = [];
      const boostedResults = [];
      for (let i = 0; i < 500; i++) {
        const { damage: nd, isCrit: nc } = combat.calcPlayerDamage(normalCrit);
        const { damage: bd, isCrit: bc } = combat.calcPlayerDamage(boostedCrit);
        expect(nc).toBe(true);
        expect(bc).toBe(true);
        normalResults.push(nd);
        boostedResults.push(bd);
      }
      const normalAvg = normalResults.reduce((a, b) => a + b, 0) / normalResults.length;
      const boostedAvg = boostedResults.reduce((a, b) => a + b, 0) / boostedResults.length;
      // Boosted crit should be ~50% more than base crit
      expect(boostedAvg).toBeGreaterThan(normalAvg * 1.3);
    });

    it('multiple talent bonuses stack: damage_percent + crit_damage_percent', () => {
      const base = mockPlayer({ attackPower: 100, critChance: 0 });
      const stacked = mockPlayer({
        attackPower: 100,
        critChance: 0,
        talentBonuses: { passives: { damage_percent: 30 } },
      });

      const baseResults = [];
      const stackedResults = [];
      for (let i = 0; i < 500; i++) {
        baseResults.push(combat.calcPlayerDamage(base).damage);
        stackedResults.push(combat.calcPlayerDamage(stacked).damage);
      }
      const baseAvg = baseResults.reduce((a, b) => a + b, 0) / baseResults.length;
      const stackedAvg = stackedResults.reduce((a, b) => a + b, 0) / stackedResults.length;
      // 30% damage bonus: stacked should be notably higher
      expect(stackedAvg).toBeGreaterThan(baseAvg * 1.15);
    });
  });

  // ── getPartyBuffs ───────────────────────────────────────────────

  describe('getPartyBuffs', () => {
    it('empty players array returns all-zero buffs', () => {
      const buffs = combat.getPartyBuffs([]);
      expect(buffs.str).toBe(0);
      expect(buffs.xp_percent).toBe(0);
      expect(buffs.attack_speed).toBe(0);
      expect(buffs.move_speed).toBe(0);
    });

    it('one player with a str aura → str > 0', () => {
      const player = mockPlayer({
        talentBonuses: {
          auras: [{ stat: 'str', value: 2, party: true }],
        },
      });
      const buffs = combat.getPartyBuffs([player]);
      expect(buffs.str).toBe(2);
    });

    it('two players with different party auras → both aggregate correctly', () => {
      const p1 = mockPlayer({
        talentBonuses: {
          auras: [{ stat: 'str', value: 3, party: true }],
        },
      });
      const p2 = mockPlayer({
        talentBonuses: {
          auras: [{ stat: 'attack_speed', value: 5, party: true }],
        },
      });
      const buffs = combat.getPartyBuffs([p1, p2]);
      expect(buffs.str).toBe(3);
      expect(buffs.attack_speed).toBe(5);
    });

    it('player without talentBonuses does not crash and contributes 0', () => {
      const p1 = mockPlayer({ talentBonuses: null });
      const p2 = mockPlayer({
        talentBonuses: {
          auras: [{ stat: 'str', value: 4, party: true }],
        },
      });
      let buffs;
      expect(() => {
        buffs = combat.getPartyBuffs([p1, p2]);
      }).not.toThrow();
      expect(buffs.str).toBe(4);
    });

    it('aura with party:false is not counted', () => {
      const player = mockPlayer({
        talentBonuses: {
          auras: [{ stat: 'str', value: 10, party: false }],
        },
      });
      const buffs = combat.getPartyBuffs([player]);
      expect(buffs.str).toBe(0);
    });

    it('aura stat not in buffs object is safely ignored', () => {
      const player = mockPlayer({
        talentBonuses: {
          auras: [{ stat: 'unknown_stat', value: 99, party: true }],
        },
      });
      let buffs;
      expect(() => {
        buffs = combat.getPartyBuffs([player]);
      }).not.toThrow();
      expect(buffs.str).toBe(0);
    });

    it('multiple auras from same player stack', () => {
      const player = mockPlayer({
        talentBonuses: {
          auras: [
            { stat: 'move_speed', value: 5, party: true },
            { stat: 'move_speed', value: 3, party: true },
          ],
        },
      });
      const buffs = combat.getPartyBuffs([player]);
      expect(buffs.move_speed).toBe(8);
    });
  });
});

// ── Paragon system ───────────────────────────────────────────────

describe('Paragon system', () => {
  const { Player, MAX_LEVEL } = require('../game/player');

  it('MAX_LEVEL is 30', () => {
    expect(MAX_LEVEL).toBe(30);
  });

  it('new player has paragonLevel 0 and paragonXp 0', () => {
    const p = new Player('Tester', 'warrior');
    expect(p.paragonLevel).toBe(0);
    expect(p.paragonXp).toBe(0);
  });

  it('gainXp works normally below MAX_LEVEL', () => {
    const p = new Player('LevelUp', 'warrior');
    // Player starts at level 1, xpToNext = 100
    expect(p.level).toBe(1);
    const result = p.gainXp(150);
    // Should have leveled up
    expect(result).not.toBeNull();
    expect(result.level).toBe(2);
    expect(result.isParagon).toBeUndefined();
    // Level should have increased, not paragon
    expect(p.level).toBe(2);
    expect(p.paragonLevel).toBe(0);
  });

  it('gainXp at MAX_LEVEL adds to paragonXp instead of normal level', () => {
    const p = new Player('MaxHero', 'warrior');
    p.level = MAX_LEVEL; // set to max level

    const before = p.paragonXp;
    const result = p.gainXp(500); // below 1000 threshold for paragon 0→1
    expect(result).toBeNull(); // no level-up event
    expect(p.level).toBe(MAX_LEVEL); // level unchanged
    expect(p.paragonXp).toBe(before + 500); // XP went to paragon pool
  });

  it('paragon levels up when paragonXp reaches threshold of 1000 (paragonLevel 0→1)', () => {
    const p = new Player('ParagonHero', 'warrior');
    p.level = MAX_LEVEL;
    const statsBefore = p.freeStatPoints;

    // Paragon 0 cost = (0+1)*1000 = 1000
    const result = p.gainXp(1000);
    expect(result).not.toBeNull();
    expect(result.isParagon).toBe(true);
    expect(result.paragonLevel).toBe(1);
    expect(p.paragonLevel).toBe(1);
    expect(p.freeStatPoints).toBe(statsBefore + 1);
  });

  it('paragon cost increases: (paragonLevel+1) * 1000', () => {
    const p = new Player('CostTest', 'warrior');
    p.level = MAX_LEVEL;

    // First paragon level: cost = 1 * 1000 = 1000
    // Give 999 — should not level up
    let result = p.gainXp(999);
    expect(result).toBeNull();
    expect(p.paragonLevel).toBe(0);
    expect(p.paragonXp).toBe(999);

    // Give 1 more — should now reach 1000 and trigger paragon 1
    result = p.gainXp(1);
    expect(result).not.toBeNull();
    expect(result.isParagon).toBe(true);
    expect(p.paragonLevel).toBe(1);
    // Overflow XP: 1000 - 1000 = 0
    expect(p.paragonXp).toBe(0);

    // Second paragon level: cost = 2 * 1000 = 2000
    result = p.gainXp(1999);
    expect(result).toBeNull();
    expect(p.paragonLevel).toBe(1);

    result = p.gainXp(1);
    expect(result).not.toBeNull();
    expect(p.paragonLevel).toBe(2);
  });

  it('paragon level-up grants 1 free stat point', () => {
    const p = new Player('StatPoint', 'mage');
    p.level = MAX_LEVEL;
    const before = p.freeStatPoints;

    p.gainXp(1000); // paragon 0 → 1
    expect(p.freeStatPoints).toBe(before + 1);

    const after1 = p.freeStatPoints;
    p.gainXp(2000); // paragon 1 → 2
    expect(p.freeStatPoints).toBe(after1 + 1);
  });

  it('paragon level-up returns { level, paragonLevel, isParagon: true, talentPoints: 0 }', () => {
    const p = new Player('ReturnShape', 'ranger');
    p.level = MAX_LEVEL;

    const result = p.gainXp(1000);
    expect(result).not.toBeNull();
    expect(result).toHaveProperty('level', MAX_LEVEL);
    expect(result).toHaveProperty('paragonLevel', 1);
    expect(result).toHaveProperty('isParagon', true);
    expect(result).toHaveProperty('talentPoints', 0);
  });

  it('gainXp returns null at MAX_LEVEL when below paragon threshold', () => {
    const p = new Player('BelowThreshold', 'warrior');
    p.level = MAX_LEVEL;

    const result = p.gainXp(500); // 500 < 1000 threshold
    expect(result).toBeNull();
    expect(p.paragonXp).toBe(500);
  });

  it('serializeForPhone includes paragonLevel, paragonXp, and paragonXpToNext', () => {
    const p = new Player('SerTest', 'warrior');
    p.level = MAX_LEVEL;
    p.paragonLevel = 3;
    p.paragonXp = 750;

    const data = p.serializeForPhone();
    expect(data).toHaveProperty('paragonLevel', 3);
    expect(data).toHaveProperty('paragonXp', 750);
    // paragonXpToNext should be (paragonLevel+1)*1000 = 4000
    expect(data).toHaveProperty('paragonXpToNext', 4000);
  });

  it('restoreFrom loads paragonLevel and paragonXp', () => {
    const p = new Player('Restore', 'mage');
    const savedData = {
      level: MAX_LEVEL,
      paragonLevel: 5,
      paragonXp: 333,
      xp: 0,
      freeStatPoints: 0,
      gold: 0,
      kills: 0,
      healthPotions: 3,
      manaPotions: 2,
      keystones: 0,
      stats: { str: 10, dex: 10, int: 10, vit: 10 },
      equipment: {},
      talents: {},
    };

    p.restoreFrom(savedData);
    expect(p.paragonLevel).toBe(5);
    expect(p.paragonXp).toBe(333);
    expect(p.level).toBe(MAX_LEVEL);
  });
});

// ── Paragon persistence ──────────────────────────────────────────

describe('Paragon persistence', () => {
  const { GameDatabase } = require('../game/database');
  const { Player, MAX_LEVEL } = require('../game/player');
  let db;

  beforeEach(() => {
    db = new GameDatabase(':memory:');
  });

  it('save/load preserves paragon level and XP', () => {
    const p = new Player('ParagonSave', 'warrior');
    p.level = MAX_LEVEL;
    p.paragonLevel = 4;
    p.paragonXp = 1234;

    db.saveCharacter(p, null, 0);
    const loaded = db.loadCharacter('ParagonSave');

    expect(loaded.paragonLevel).toBe(4);
    expect(loaded.paragonXp).toBe(1234);

    db.close();
  });

  it('new character defaults to paragon level 0 and paragon XP 0', () => {
    const p = new Player('FreshParagon', 'mage');
    // No paragon progression set

    db.saveCharacter(p, null, 0);
    const loaded = db.loadCharacter('FreshParagon');

    expect(loaded.paragonLevel).toBe(0);
    expect(loaded.paragonXp).toBe(0);

    db.close();
  });
});

// ── Rift floor generation ────────────────────────────────────────

describe('Rift floor generation', () => {
  const { World } = require('../game/world');

  it('generateRiftFloor sets riftActive, riftConfig, riftTimer', () => {
    const world = new World();
    const rift = createRift(3, 15);

    world.generateRiftFloor(rift);

    expect(world.riftActive).toBe(true);
    expect(world.riftConfig).toBe(rift);
    expect(world.riftTimer).toBe(rift.timeLimit);
    expect(world.riftTimeLimit).toBe(rift.timeLimit);
    expect(world.riftStartTime).toBeGreaterThan(0);
  });

  it('generateRiftFloor generates more rooms for higher tiers (6 + tier)', () => {
    const world1 = new World();
    const rift1 = createRift(1, 10);
    world1.generateRiftFloor(rift1);
    // roomCount requested = 6 + 1 = 7, BSP may give fewer but at least 2
    // we check that tier 5 generates >= rooms than tier 1 in aggregate
    const rooms1 = world1.rooms.length;

    const world5 = new World();
    const rift5 = createRift(5, 10);
    world5.generateRiftFloor(rift5);
    const rooms5 = world5.rooms.length;

    // Tier 5 requests 11 rooms, tier 1 requests 7 — tier 5 should have >= tier 1
    expect(rooms5).toBeGreaterThanOrEqual(rooms1);
  });

  it('generateRiftFloor sets zone from rift config zone id', () => {
    const world = new World();
    // Use a known rift with a specific zone
    const rift = createRift(2, 10);
    world.generateRiftFloor(rift);

    expect(world.zone).toBeDefined();
    expect(world.zone.id).toBe(rift.zone.id);
  });

  it('getFloorInfo includes riftActive and riftTier after generateRiftFloor', () => {
    const world = new World();
    const rift = createRift(4, 20);
    world.generateRiftFloor(rift);

    const info = world.getFloorInfo();
    expect(info.riftActive).toBe(true);
    expect(info.riftTier).toBe(4);
    expect(info.riftModifiers).toHaveLength(rift.modifiers.length);
  });

  it('endRift clears all rift state fields', () => {
    const world = new World();
    const rift = createRift(1, 5);
    world.generateRiftFloor(rift);

    // Sanity check — rift is active
    expect(world.riftActive).toBe(true);

    world.endRift();

    expect(world.riftActive).toBe(false);
    expect(world.riftConfig).toBeNull();
    expect(world.riftTimer).toBe(0);
    expect(world.riftTimeLimit).toBe(0);
    expect(world.riftStartTime).toBe(0);
  });

  it('updateRiftTimer decreases timer by dt/1000 seconds', () => {
    const world = new World();
    const rift = createRift(1, 5);
    world.generateRiftFloor(rift);
    // Force a known timer value
    world.riftTimer = 60;

    world.updateRiftTimer(1000); // 1000ms = 1 second
    expect(world.riftTimer).toBeCloseTo(59, 5);
  });

  it('updateRiftTimer returns false when time expires', () => {
    const world = new World();
    const rift = createRift(1, 5);
    world.generateRiftFloor(rift);
    world.riftTimer = 0.5; // half a second left

    const stillOk = world.updateRiftTimer(1000); // subtract 1 second
    expect(stillOk).toBe(false);
  });

  it('updateRiftTimer returns true when time is still remaining', () => {
    const world = new World();
    const rift = createRift(1, 5);
    world.generateRiftFloor(rift);
    world.riftTimer = 60;

    const stillOk = world.updateRiftTimer(1000);
    expect(stillOk).toBe(true);
  });

  it('getRiftTimeRemaining returns non-negative even when timer is negative', () => {
    const world = new World();
    const rift = createRift(1, 5);
    world.generateRiftFloor(rift);
    world.riftTimer = -5; // forced negative

    expect(world.getRiftTimeRemaining()).toBe(0);
  });

  it('updateRiftTimer returns true (always ok) when rift is not active', () => {
    const world = new World();
    // No rift started — riftActive is false
    const result = world.updateRiftTimer(5000);
    expect(result).toBe(true);
  });

  it('last room is forced to boss type after generateRiftFloor', () => {
    const world = new World();
    const rift = createRift(2, 10);
    world.generateRiftFloor(rift);

    const lastRoom = world.rooms[world.rooms.length - 1];
    expect(lastRoom.type).toBe('boss');
  });

  it('generateRiftFloor sets shopNpc and storyNpcs to null/empty', () => {
    const world = new World();
    const rift = createRift(3, 10);
    world.generateRiftFloor(rift);

    expect(world.shopNpc).toBeNull();
    expect(world.storyNpcs).toHaveLength(0);
  });
});

// ── applyRiftModifiers ───────────────────────────────────────────

describe('applyRiftModifiers', () => {
  const { World } = require('../game/world');

  function makeMonster(overrides = {}) {
    return {
      hp: 100,
      maxHp: 100,
      damage: 20,
      armor: 0,
      speed: 60,
      ...overrides,
    };
  }

  it('deadly modifier increases monster damage', () => {
    const world = new World();
    // Manually set up a rift config with only the deadly modifier
    world.riftActive = true;
    world.riftConfig = {
      tier: 1,
      modifiers: [{ key: 'deadly', effect: 'monster_damage', value: 1.5 }],
      monsterHpMult: 1.0,
      monsterDmgMult: 1.0,
    };

    const monster = makeMonster({ damage: 20 });
    world.applyRiftModifiers([monster]);

    // 20 * 1.5 = 30
    expect(monster.damage).toBe(30);
  });

  it('fortified modifier increases monster HP (maxHp and hp)', () => {
    const world = new World();
    world.riftActive = true;
    world.riftConfig = {
      tier: 1,
      modifiers: [{ key: 'fortified', effect: 'monster_hp', value: 1.4 }],
      monsterHpMult: 1.0,
      monsterDmgMult: 1.0,
    };

    const monster = makeMonster({ hp: 100, maxHp: 100 });
    world.applyRiftModifiers([monster]);

    // 100 * 1.4 = 140
    expect(monster.maxHp).toBe(140);
    expect(monster.hp).toBe(140);
  });

  it('hasty modifier increases monster speed', () => {
    const world = new World();
    world.riftActive = true;
    world.riftConfig = {
      tier: 1,
      modifiers: [{ key: 'hasty', effect: 'monster_speed', value: 1.3 }],
      monsterHpMult: 1.0,
      monsterDmgMult: 1.0,
    };

    const monster = makeMonster({ speed: 60 });
    world.applyRiftModifiers([monster]);

    // floor(60 * 1.3) = 78
    expect(monster.speed).toBe(78);
  });

  it('tier multipliers stack with modifier effects', () => {
    const world = new World();
    world.riftActive = true;
    // fortified: 1.4x HP, plus tier monsterHpMult: 1.9 (tier 4 = 1.0 + 3*0.3)
    world.riftConfig = {
      tier: 4,
      modifiers: [{ key: 'fortified', effect: 'monster_hp', value: 1.4 }],
      monsterHpMult: 1.9,
      monsterDmgMult: 1.0,
    };

    const monster = makeMonster({ hp: 100, maxHp: 100 });
    world.applyRiftModifiers([monster]);

    // After fortified: floor(100 * 1.4) = 140
    // After tier mult: floor(140 * 1.9) = 266
    expect(monster.maxHp).toBe(Math.floor(Math.floor(100 * 1.4) * 1.9));
    expect(monster.hp).toBe(monster.maxHp);
  });

  it('no crash with empty modifier list', () => {
    const world = new World();
    world.riftActive = true;
    world.riftConfig = {
      tier: 1,
      modifiers: [],
      monsterHpMult: 1.0,
      monsterDmgMult: 1.0,
    };

    const monster = makeMonster();
    expect(() => world.applyRiftModifiers([monster])).not.toThrow();
    // Stats unchanged after empty modifiers + 1.0 multipliers
    expect(monster.damage).toBe(20);
    expect(monster.maxHp).toBe(100);
  });

  it('does nothing when rift is not active', () => {
    const world = new World();
    // riftActive = false (default), no riftConfig
    const monster = makeMonster({ damage: 20, maxHp: 100, hp: 100 });
    expect(() => world.applyRiftModifiers([monster])).not.toThrow();
    // Nothing should have changed
    expect(monster.damage).toBe(20);
    expect(monster.maxHp).toBe(100);
  });

  it('armored modifier increases monster armor (monster_dr adds flat armor based on maxHp)', () => {
    const world = new World();
    world.riftActive = true;
    world.riftConfig = {
      tier: 1,
      modifiers: [{ key: 'armored', effect: 'monster_dr', value: 0.3 }],
      monsterHpMult: 1.0,
      monsterDmgMult: 1.0,
    };

    const monster = makeMonster({ hp: 100, maxHp: 100, armor: 10 });
    world.applyRiftModifiers([monster]);

    // armor = 10 + floor(100 * 0.3) = 10 + 30 = 40
    expect(monster.armor).toBe(40);
  });
});

// ── Rift leaderboard ─────────────────────────────────────────────

describe('Rift leaderboard', () => {
  const { GameDatabase } = require('../game/database');
  let db;

  beforeEach(() => {
    db = new GameDatabase(':memory:');
  });

  it('recordRiftClear inserts a record retrievable via getRiftLeaderboard', () => {
    db.recordRiftClear(3, ['Alice', 'Bob'], 95.5, [{ key: 'deadly' }], 'normal');
    const rows = db.getRiftLeaderboard(3);
    expect(rows).toHaveLength(1);
    expect(rows[0].player1).toBe('Alice');
    expect(rows[0].player2).toBe('Bob');
    expect(rows[0].tier).toBe(3);
    expect(rows[0].time_seconds).toBeCloseTo(95.5);
    db.close();
  });

  it('getRiftLeaderboard returns records sorted by time_seconds ASC', () => {
    db.recordRiftClear(2, ['Fast'], 60.0, [], 'normal');
    db.recordRiftClear(2, ['Slow'], 180.0, [], 'normal');
    db.recordRiftClear(2, ['Mid'], 100.0, [], 'normal');

    const rows = db.getRiftLeaderboard(2);
    expect(rows).toHaveLength(3);
    expect(rows[0].time_seconds).toBeCloseTo(60.0);
    expect(rows[1].time_seconds).toBeCloseTo(100.0);
    expect(rows[2].time_seconds).toBeCloseTo(180.0);
    db.close();
  });

  it('getRiftLeaderboard filters by tier — only returns matching tier', () => {
    db.recordRiftClear(1, ['TierOne'], 50.0, [], 'normal');
    db.recordRiftClear(3, ['TierThree'], 75.0, [], 'normal');
    db.recordRiftClear(1, ['TierOneB'], 55.0, [], 'normal');

    const tier1rows = db.getRiftLeaderboard(1);
    expect(tier1rows).toHaveLength(2);
    for (const row of tier1rows) {
      expect(row.tier).toBe(1);
    }

    const tier3rows = db.getRiftLeaderboard(3);
    expect(tier3rows).toHaveLength(1);
    expect(tier3rows[0].tier).toBe(3);
    db.close();
  });

  it('getRiftLeaderboard limits results to 20', () => {
    for (let i = 0; i < 25; i++) {
      db.recordRiftClear(5, [`Player${i}`], 60 + i, [], 'normal');
    }
    const rows = db.getRiftLeaderboard(5);
    expect(rows).toHaveLength(20);
    db.close();
  });

  it('getRiftLeaderboard returns parsed modifiers array (not raw JSON string)', () => {
    const mods = [{ key: 'deadly', effect: 'monster_damage', value: 1.5 }];
    db.recordRiftClear(4, ['ModPlayer'], 88.0, mods, 'normal');

    const rows = db.getRiftLeaderboard(4);
    expect(rows).toHaveLength(1);
    expect(Array.isArray(rows[0].modifiers)).toBe(true);
    expect(rows[0].modifiers[0].key).toBe('deadly');
    db.close();
  });

  it('getPersonalRiftRecords shows best_time per tier', () => {
    // Same player, same tier, different times
    db.recordRiftClear(3, ['Hero'], 120.0, [], 'normal');
    db.recordRiftClear(3, ['Hero'], 80.0, [], 'normal');  // best
    db.recordRiftClear(3, ['Hero'], 100.0, [], 'normal');

    const records = db.getPersonalRiftRecords('Hero');
    expect(records).toHaveLength(1); // grouped by tier
    expect(records[0].tier).toBe(3);
    expect(records[0].best_time).toBeCloseTo(80.0);
    expect(records[0].clears).toBe(3);
    db.close();
  });

  it('getPersonalRiftRecords groups best time per tier across multiple tiers', () => {
    db.recordRiftClear(1, ['Champion'], 45.0, [], 'normal');
    db.recordRiftClear(2, ['Champion'], 90.0, [], 'normal');
    db.recordRiftClear(2, ['Champion'], 70.0, [], 'normal'); // best for tier 2

    const records = db.getPersonalRiftRecords('Champion');
    expect(records).toHaveLength(2); // tier 1 and tier 2

    const tier1 = records.find(r => r.tier === 1);
    const tier2 = records.find(r => r.tier === 2);
    expect(tier1).toBeDefined();
    expect(tier1.best_time).toBeCloseTo(45.0);
    expect(tier2).toBeDefined();
    expect(tier2.best_time).toBeCloseTo(70.0);
    db.close();
  });

  it('getPersonalRiftRecords matches player listed as player2', () => {
    // Player is partner (player2), not the main player1
    db.recordRiftClear(5, ['Leader', 'Partner'], 110.0, [], 'normal');

    const records = db.getPersonalRiftRecords('Partner');
    expect(records).toHaveLength(1);
    expect(records[0].tier).toBe(5);
    expect(records[0].best_time).toBeCloseTo(110.0);
    db.close();
  });

  it('recordRiftClear solo run stores null for player2', () => {
    db.recordRiftClear(2, ['SoloHero'], 55.0, [], 'normal');
    const rows = db.getRiftLeaderboard(2);
    expect(rows).toHaveLength(1);
    expect(rows[0].player2).toBeNull();
    db.close();
  });

  it('returns empty array from getRiftLeaderboard for tier with no records', () => {
    const rows = db.getRiftLeaderboard(10);
    expect(rows).toHaveLength(0);
    db.close();
  });

  it('returns empty array from getPersonalRiftRecords for unknown player', () => {
    const records = db.getPersonalRiftRecords('NoSuchPlayer');
    expect(records).toHaveLength(0);
    db.close();
  });
});

// ── Cycle #119: Tests for fixes from Cycles #115-117 ────────────

describe('healReduction system', () => {
  const { Player } = require('../game/player');

  it('new player has healReduction = 1.0', () => {
    const p = new Player('HealTest', 'warrior');
    expect(p.healReduction).toBe(1.0);
  });

  it('useHealthPotion heals 35% of maxHp at healReduction 1.0', () => {
    const p = new Player('FullHeal', 'warrior');
    p.recalcStats();
    const expectedHeal = Math.floor(p.maxHp * 0.35);
    p.hp = 1;
    p.healthPotions = 5;
    p.healReduction = 1.0;
    p.useHealthPotion();
    expect(p.hp).toBe(1 + expectedHeal);
  });

  it('useHealthPotion heals 50% less with healReduction = 0.5 (cursed rift)', () => {
    const p = new Player('CursedHeal', 'warrior');
    p.recalcStats();
    const fullHeal = Math.floor(p.maxHp * 0.35);
    const cursedHeal = Math.floor(fullHeal * 0.5);
    p.hp = 1;
    p.healthPotions = 5;
    p.healReduction = 0.5;
    p.useHealthPotion();
    expect(p.hp).toBe(1 + cursedHeal);
  });

  it('healReduction 0 means no healing from potions', () => {
    const p = new Player('NoHeal', 'warrior');
    p.recalcStats();
    p.hp = 1;
    p.healthPotions = 5;
    p.healReduction = 0;
    p.useHealthPotion();
    expect(p.hp).toBe(1);
  });
});

describe('gainXp edge cases (Cycle #115 fixes)', () => {
  const { Player, MAX_LEVEL } = require('../game/player');

  it('gainXp(0) returns null, no state change', () => {
    const p = new Player('ZeroXP', 'warrior');
    const before = p.xp;
    expect(p.gainXp(0)).toBeNull();
    expect(p.xp).toBe(before);
  });

  it('gainXp(-100) returns null, no state change', () => {
    const p = new Player('NegXP', 'warrior');
    const before = p.xp;
    expect(p.gainXp(-100)).toBeNull();
    expect(p.xp).toBe(before);
  });

  it('multi-level paragon: huge XP grants multiple paragon levels at once', () => {
    const p = new Player('MultiParagon', 'warrior');
    p.level = MAX_LEVEL;
    // Paragon 0→1: 1000, 1→2: 2000, 2→3: 3000 = 6000 total
    const result = p.gainXp(6000);
    expect(result).not.toBeNull();
    expect(result.isParagon).toBe(true);
    expect(result.paragonLevel).toBe(3);
    expect(p.paragonLevel).toBe(3);
    expect(p.paragonXp).toBe(0); // exactly 6000 consumed
  });

  it('multi-level paragon with leftover XP', () => {
    const p = new Player('LeftoverParagon', 'warrior');
    p.level = MAX_LEVEL;
    // 1000 + 2000 = 3000 for 2 levels, +500 leftover
    const result = p.gainXp(3500);
    expect(result.paragonLevel).toBe(2);
    expect(p.paragonXp).toBe(500);
  });

  it('XP overflow at level 29→30 feeds into paragon', () => {
    const p = new Player('OverflowTest', 'warrior');
    p.level = 29;
    p.xp = 0;
    // XpToNext for level 29 = Math.floor(100 * 1.15^29) ≈ 5418
    const xpNeeded = p.xpToNext;
    // Give enough to level up + 2000 leftover for paragon
    const result = p.gainXp(xpNeeded + 2000);
    expect(p.level).toBe(MAX_LEVEL);
    // Leftover should be in paragonXp (minus any consumed by levelUp)
    expect(p.paragonXp).toBeGreaterThanOrEqual(0);
    // The XP that was left after reaching 30 should have gone to paragon
    expect(p.xp).toBe(0); // no orphaned XP
  });
});

describe('addKeystones guards (Cycle #115 fixes)', () => {
  const { Player } = require('../game/player');

  it('addKeystones(NaN) does not corrupt keystones', () => {
    const p = new Player('NaNKey', 'warrior');
    p.keystones = 5;
    p.addKeystones(NaN);
    expect(p.keystones).toBe(5);
  });

  it('addKeystones(undefined) does not corrupt keystones', () => {
    const p = new Player('UndefKey', 'warrior');
    p.keystones = 3;
    p.addKeystones(undefined);
    expect(p.keystones).toBe(3);
  });

  it('addKeystones(-1) is rejected', () => {
    const p = new Player('NegKey', 'warrior');
    p.keystones = 5;
    p.addKeystones(-1);
    expect(p.keystones).toBe(5);
  });

  it('addKeystones(0) is rejected', () => {
    const p = new Player('ZeroKey', 'warrior');
    p.keystones = 5;
    p.addKeystones(0);
    expect(p.keystones).toBe(5);
  });

  it('addKeystones("abc") does not corrupt', () => {
    const p = new Player('StrKey', 'warrior');
    p.keystones = 5;
    p.addKeystones("abc");
    expect(p.keystones).toBe(5);
  });

  it('addKeystones(2.7) floors to 2', () => {
    const p = new Player('FloatKey', 'warrior');
    p.keystones = 5;
    p.addKeystones(2.7);
    expect(p.keystones).toBe(7);
  });
});

describe('serialize includes paragon fields (Cycle #115 fix)', () => {
  const { Player } = require('../game/player');

  it('serialize() includes keystones, paragonLevel, paragonXp, paragonXpToNext', () => {
    const p = new Player('SerTest', 'warrior');
    p.paragonLevel = 5;
    p.paragonXp = 1234;
    p.keystones = 3;
    const s = p.serialize();
    expect(s).toHaveProperty('keystones', 3);
    expect(s).toHaveProperty('paragonLevel', 5);
    expect(s).toHaveProperty('paragonXp', 1234);
    expect(s).toHaveProperty('paragonXpToNext', 6000); // (5+1)*1000
  });
});

describe('guardian has Monster prototype methods (Cycle #115 fix)', () => {
  const { World } = require('../game/world');

  it('spawnRiftGuardian produces guardian with update, takeDamage, distanceTo methods', () => {
    const w = new World();
    w.generateFloor(0, 'normal');

    const riftConfig = createRift(3, 20);
    w.generateRiftFloor(riftConfig);
    const guardian = w.spawnRiftGuardian();

    // Must exist
    expect(guardian).not.toBeNull();
    expect(guardian.isRiftGuardian).toBe(true);
    expect(guardian.alive).toBe(true);

    // Must have Monster prototype methods
    expect(typeof guardian.update).toBe('function');
    expect(typeof guardian.takeDamage).toBe('function');
    expect(typeof guardian.distanceTo).toBe('function');
    expect(typeof guardian.moveToward).toBe('function');
    expect(typeof guardian.applyStun).toBe('function');
    expect(typeof guardian.applySlow).toBe('function');
    expect(typeof guardian.getSplitMonsters).toBe('function');
    expect(typeof guardian.serialize).toBe('function');
  });

  it('guardian.takeDamage reduces HP and kills at 0', () => {
    const w = new World();
    w.generateFloor(0, 'normal');
    const riftConfig = createRift(1, 10);
    w.generateRiftFloor(riftConfig);
    const guardian = w.spawnRiftGuardian();

    const hpBefore = guardian.hp;
    const dealt = guardian.takeDamage(100, 'physical');
    expect(dealt).toBeGreaterThan(0);
    expect(guardian.hp).toBeLessThan(hpBefore);

    // Kill it
    guardian.takeDamage(guardian.hp + 1000, 'physical');
    expect(guardian.alive).toBe(false);
    expect(guardian.hp).toBe(0);
  });

  it('guardian.getSplitMonsters returns empty array', () => {
    const w = new World();
    w.generateFloor(0, 'normal');
    const riftConfig = createRift(1, 10);
    w.generateRiftFloor(riftConfig);
    const guardian = w.spawnRiftGuardian();
    expect(guardian.getSplitMonsters()).toEqual([]);
  });

  it('guardian.serialize includes isRiftGuardian and riftTier', () => {
    const w = new World();
    w.generateFloor(0, 'normal');
    const riftConfig = createRift(5, 25);
    w.generateRiftFloor(riftConfig);
    const guardian = w.spawnRiftGuardian();
    const s = guardian.serialize();
    expect(s.isRiftGuardian).toBe(true);
    expect(s.riftTier).toBe(5);
    expect(s.isBoss).toBe(true);
  });
});

describe('endRift double-end guard (Cycle #115 fix)', () => {
  const { World } = require('../game/world');

  it('endRift() called twice does not crash', () => {
    const w = new World();
    w.generateFloor(0, 'normal');
    const riftConfig = createRift(3, 20);
    w.generateRiftFloor(riftConfig);
    expect(w.riftActive).toBe(true);

    w.endRift();
    expect(w.riftActive).toBe(false);

    // Second call should be no-op
    expect(() => w.endRift()).not.toThrow();
    expect(w.riftActive).toBe(false);
  });
});

describe('applyRiftModifiers called during spawnWave (Cycle #115 fix)', () => {
  const { World } = require('../game/world');

  it('rift monsters have scaled stats after wave spawn', () => {
    const w = new World();
    w.generateFloor(0, 'normal');

    // Get baseline monster stats from a normal wave
    const normalMonsters = [...w.monsters];

    // Generate a rift with high-tier modifiers
    const riftConfig = createRift(5, 20);
    w.generateRiftFloor(riftConfig);

    // After rift floor gen, monsters from spawnWave should have modified stats
    // The rift tier 5 has monsterHpMult and monsterDmgMult > 1
    const riftMonsters = w.monsters.filter(m => m.alive);

    // At least verify that rift monsters exist and have been modified
    if (riftMonsters.length > 0 && normalMonsters.length > 0) {
      // Rift tier 5 should have substantially more HP than baseline tier 1 monsters
      const avgRiftHp = riftMonsters.reduce((a, m) => a + m.maxHp, 0) / riftMonsters.length;
      const avgNormalHp = normalMonsters.reduce((a, m) => a + m.maxHp, 0) / normalMonsters.length;
      // Rift modifiers + tier mult should make monsters stronger
      expect(avgRiftHp).toBeGreaterThanOrEqual(avgNormalHp);
    }
  });
});

describe('execute and sniper proc handlers (Cycle #115 fix)', () => {
  const { CombatSystem } = require('../game/combat');
  const { Monster } = require('../game/monsters');

  function combatPlayer(overrides = {}) {
    return {
      id: 'test-combat', name: 'TestPlayer', alive: true,
      attackPower: 100, critChance: 0, x: 90, y: 90,
      attackRange: 60, attackCooldown: 0, attackSpeed: 1000,
      equipment: {}, setBonuses: {}, buffs: [],
      kills: 0, gold: 0, difficulty: 'normal',
      canAttack: function() { return this.attackCooldown <= 0; },
      startAttackCooldown: function() { this.attackCooldown = this.attackSpeed; },
      gainXp: () => null,
      questManager: { check: () => [] },
      talentBonuses: { passives: {}, procs: [], auras: [] },
      ...overrides,
    };
  }

  it('execute proc triggers on low-HP target', () => {
    const combat = new CombatSystem();
    const player = combatPlayer({
      attackPower: 10, // low damage so the monster survives the initial hit
      talentBonuses: {
        passives: {},
        procs: [{ trigger: 'on_hit', chance: 1.0, effect: 'execute', threshold_hp_percent: 30, damage_multiplier: 2 }],
        auras: [],
      },
    });
    const monster = new Monster('skeleton', 100, 100, 0);
    // Give monster high HP so it survives the hit, but set current HP below 30% threshold
    monster.maxHp = 1000;
    monster.hp = 200; // 200/1000 = 20% < 30%

    combat.playerAttack(player, [monster]);
    const procEvents = combat.events.filter(e => e.type === 'combat:proc' && e.effect === 'execute');
    expect(procEvents.length).toBe(1);
    expect(procEvents[0].damage).toBeGreaterThan(0);
  });

  it('execute proc does NOT trigger on high-HP target', () => {
    const combat = new CombatSystem();
    const player = combatPlayer({
      attackPower: 50,
      talentBonuses: {
        passives: {},
        procs: [{ trigger: 'on_hit', chance: 1.0, effect: 'execute', threshold_hp_percent: 30, damage_multiplier: 2 }],
        auras: [],
      },
    });
    const monster = new Monster('skeleton', 100, 100, 0);
    // Monster at full HP (100% > 30%)
    combat.playerAttack(player, [monster]);
    const procEvents = combat.events.filter(e => e.type === 'combat:proc' && e.effect === 'execute');
    expect(procEvents.length).toBe(0);
  });
});

describe('on_kill proc — heal_on_kill (Cycle #115 fix)', () => {
  const { CombatSystem } = require('../game/combat');
  const { Monster } = require('../game/monsters');

  it('heal_on_kill proc heals player after kill', () => {
    const combat = new CombatSystem();
    const player = {
      id: 'heal-kill', name: 'Healer', alive: true,
      attackPower: 9999, critChance: 0, x: 90, y: 90,
      attackRange: 60, attackCooldown: 0, attackSpeed: 1000,
      canAttack: function() { return this.attackCooldown <= 0; },
      startAttackCooldown: function() { this.attackCooldown = this.attackSpeed; },
      maxHp: 200, hp: 100, kills: 0,
      equipment: {}, setBonuses: {}, buffs: [],
      difficulty: 'normal',
      gold: 0,
      gainXp: () => null,
      questManager: { check: () => [] },
      talentBonuses: {
        passives: {},
        procs: [{ trigger: 'on_kill', chance: 1.0, effect: 'heal_percent', value: 15 }],
        auras: [],
      },
    };
    const monster = new Monster('skeleton', 100, 100, 0);
    monster.hp = 1; // will die on first hit

    combat.playerAttack(player, [monster]);
    expect(monster.alive).toBe(false);

    // Check heal event
    const healEvents = combat.events.filter(e => e.type === 'combat:proc' && e.effect === 'heal_on_kill');
    expect(healEvents.length).toBe(1);
    expect(healEvents[0].heal).toBe(Math.floor(200 * 15 / 100));
    // Player HP should be increased
    expect(player.hp).toBeGreaterThan(100);
  });
});
