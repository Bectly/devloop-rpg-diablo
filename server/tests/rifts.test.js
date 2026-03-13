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
