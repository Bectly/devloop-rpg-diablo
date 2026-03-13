import { describe, it, expect, beforeEach, vi } from 'vitest';
import { createRequire } from 'module';
const require = createRequire(import.meta.url);

const { ComboTracker, COMBO_DEFS } = require('../game/combos');
const { Player } = require('../game/player');

// ── Helpers ────────────────────────────────────────────────────────

function createPlayer(name, cls, id) {
  const p = new Player(name, cls);
  p.id = id || name;
  p.level = 10;
  p.recalcStats();
  p.hp = p.maxHp;
  p.mp = p.maxMp;
  p.alive = true;
  return p;
}

function createMonster(id, opts = {}) {
  return {
    id,
    name: opts.name || 'Skeleton',
    x: opts.x || 100,
    y: opts.y || 100,
    hp: opts.hp || 80,
    alive: true,
    stunned: opts.stunned || 0,
    _recentVolleyHit: opts._recentVolleyHit || null,
    _inBurningGround: opts._inBurningGround || false,
    friendly: opts.friendly || false,
  };
}

// ── COMBO_DEFS structure ───────────────────────────────────────────

describe('COMBO_DEFS structure', () => {
  it('should have 5 combo definitions', () => {
    expect(COMBO_DEFS).toHaveLength(5);
  });

  it('every combo has required fields', () => {
    for (const combo of COMBO_DEFS) {
      expect(combo.id).toBeTruthy();
      expect(combo.name).toBeTruthy();
      expect(combo.description).toBeTruthy();
      expect(typeof combo.check).toBe('function');
      expect(typeof combo.execute).toBe('function');
      expect(combo.cooldown).toBeGreaterThan(0);
    }
  });

  it('combo IDs are unique', () => {
    const ids = COMBO_DEFS.map(c => c.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it('all expected combos exist', () => {
    const ids = COMBO_DEFS.map(c => c.id);
    expect(ids).toContain('shatter_blast');
    expect(ids).toContain('chain_reaction');
    expect(ids).toContain('battle_fury');
    expect(ids).toContain('shadow_barrage');
    expect(ids).toContain('firestorm');
  });
});

// ── ComboTracker ───────────────────────────────────────────────────

describe('ComboTracker', () => {
  let tracker;
  let warrior, mage;
  let monsters;

  beforeEach(() => {
    tracker = new ComboTracker();
    warrior = createPlayer('Warrior1', 'warrior', 'w1');
    mage = createPlayer('Mage1', 'mage', 'm1');
    monsters = [createMonster('m1')];
  });

  it('should start with empty cooldowns', () => {
    expect(tracker.cooldowns).toEqual({});
  });

  it('should return empty array when no combos trigger', () => {
    const events = [{ type: 'combat:hit', targetId: 'm1', attackerId: 'w1', damage: 50, damageType: 'physical' }];
    const result = tracker.checkCombos(events, [warrior, mage], monsters, {});
    expect(result).toEqual([]);
  });

  it('reset() clears cooldowns', () => {
    tracker.cooldowns = { shatter_blast: Date.now() + 99999 };
    tracker.reset();
    expect(tracker.cooldowns).toEqual({});
  });
});

// ── Shatter Blast ──────────────────────────────────────────────────

describe('Shatter Blast combo', () => {
  let tracker, warrior, mage, monster;

  beforeEach(() => {
    tracker = new ComboTracker();
    warrior = createPlayer('Warrior1', 'warrior', 'w1');
    mage = createPlayer('Mage1', 'mage', 'm1');
    monster = createMonster('mon1', { stunned: 3000 }); // frozen
  });

  it('triggers on physical hit to stunned monster with 2 players', () => {
    const events = [{
      type: 'combat:hit', targetId: 'mon1', attackerId: 'w1',
      damage: 50, damageType: 'physical',
    }];
    const result = tracker.checkCombos(events, [warrior, mage], [monster], {});
    expect(result).toHaveLength(1);
    expect(result[0].comboId).toBe('shatter_blast');
    expect(result[0].comboName).toBe('Shatter Blast');
    expect(result[0].radius).toBe(100);
    expect(result[0].damage).toBe(100); // 50 * 2
    expect(typeof result[0].damage).toBe('number'); // not NaN
  });

  it('does NOT trigger on magical damage', () => {
    const events = [{
      type: 'combat:hit', targetId: 'mon1', attackerId: 'm1',
      damage: 50, damageType: 'magical',
    }];
    const result = tracker.checkCombos(events, [warrior, mage], [monster], {});
    expect(result).toEqual([]);
  });

  it('does NOT trigger if monster is not stunned', () => {
    monster.stunned = 0;
    const events = [{
      type: 'combat:hit', targetId: 'mon1', attackerId: 'w1',
      damage: 50, damageType: 'physical',
    }];
    const result = tracker.checkCombos(events, [warrior, mage], [monster], {});
    expect(result).toEqual([]);
  });

  it('does NOT trigger with only 1 player alive', () => {
    mage.alive = false;
    const events = [{
      type: 'combat:hit', targetId: 'mon1', attackerId: 'w1',
      damage: 50, damageType: 'physical',
    }];
    const result = tracker.checkCombos(events, [warrior, mage], [monster], {});
    expect(result).toEqual([]);
  });

  it('respects cooldown', () => {
    const events = [{
      type: 'combat:hit', targetId: 'mon1', attackerId: 'w1',
      damage: 50, damageType: 'physical',
    }];
    // First trigger
    const r1 = tracker.checkCombos(events, [warrior, mage], [monster], {});
    expect(r1).toHaveLength(1);
    // Second trigger immediately — should be blocked by cooldown
    const r2 = tracker.checkCombos(events, [warrior, mage], [monster], {});
    expect(r2).toEqual([]);
  });
});

// ── Chain Reaction ─────────────────────────────────────────────────

describe('Chain Reaction combo', () => {
  let tracker, ranger, mage, monster;

  beforeEach(() => {
    tracker = new ComboTracker();
    ranger = createPlayer('Ranger1', 'ranger', 'r1');
    mage = createPlayer('Mage1', 'mage', 'm1');
    monster = createMonster('mon1', { _recentVolleyHit: Date.now() });
  });

  it('triggers on Chain Lightning + recent Arrow Volley hit', () => {
    const events = [{
      type: 'combat:hit', targetId: 'mon1', attackerId: 'm1',
      skillName: 'Chain Lightning', damage: 60,
    }];
    const result = tracker.checkCombos(events, [ranger, mage], [monster], {});
    expect(result).toHaveLength(1);
    expect(result[0].comboId).toBe('chain_reaction');
    expect(result[0].radius).toBe(120);
  });

  it('does NOT trigger if volley hit is too old (>2s)', () => {
    monster._recentVolleyHit = Date.now() - 3000;
    const events = [{
      type: 'combat:hit', targetId: 'mon1', attackerId: 'm1',
      skillName: 'Chain Lightning', damage: 60,
    }];
    const result = tracker.checkCombos(events, [ranger, mage], [monster], {});
    expect(result).toEqual([]);
  });

  it('does NOT trigger on wrong skill name', () => {
    const events = [{
      type: 'combat:hit', targetId: 'mon1', attackerId: 'm1',
      skillName: 'Meteor Strike', damage: 60,
    }];
    const result = tracker.checkCombos(events, [ranger, mage], [monster], {});
    expect(result).toEqual([]);
  });

  it('Arrow Volley event sets _recentVolleyHit on monsters', () => {
    const freshMonster = createMonster('mon2');
    expect(freshMonster._recentVolleyHit).toBeNull();
    const events = [
      { type: 'combat:hit', targetId: 'mon2', attackerId: 'r1', skillName: 'Arrow Volley', damage: 30 },
      { type: 'combat:hit', targetId: 'mon2', attackerId: 'm1', skillName: 'Chain Lightning', damage: 60 },
    ];
    const result = tracker.checkCombos(events, [ranger, mage], [freshMonster], {});
    expect(freshMonster._recentVolleyHit).toBeGreaterThan(0);
    expect(result).toHaveLength(1);
    expect(result[0].comboId).toBe('chain_reaction');
  });
});

// ── Battle Fury ────────────────────────────────────────────────────

describe('Battle Fury combo', () => {
  let tracker, warrior1, warrior2, monster;

  beforeEach(() => {
    tracker = new ComboTracker();
    warrior1 = createPlayer('Warrior1', 'warrior', 'w1');
    warrior1.buffs = [{ effect: 'attack_up', value: 20, remaining: 8000 }];
    warrior2 = createPlayer('Warrior2', 'warrior', 'w2');
    monster = createMonster('mon1');
  });

  it('triggers on Whirlwind hit with attack_up buff and 2 players', () => {
    const events = [{
      type: 'combat:hit', targetId: 'mon1', attackerId: 'w1',
      skillName: 'Whirlwind', damage: 40,
    }];
    const result = tracker.checkCombos(events, [warrior1, warrior2], [monster], {});
    expect(result).toHaveLength(1);
    expect(result[0].comboId).toBe('battle_fury');
    expect(result[0].effect).toBe('pull');
    expect(result[0].radius).toBe(140);
  });

  it('does NOT trigger without attack_up buff', () => {
    warrior1.buffs = [];
    const events = [{
      type: 'combat:hit', targetId: 'mon1', attackerId: 'w1',
      skillName: 'Whirlwind', damage: 40,
    }];
    const result = tracker.checkCombos(events, [warrior1, warrior2], [monster], {});
    expect(result).toEqual([]);
  });

  it('does NOT trigger on non-Whirlwind skill', () => {
    const events = [{
      type: 'combat:hit', targetId: 'mon1', attackerId: 'w1',
      skillName: 'Charging Strike', damage: 40,
    }];
    const result = tracker.checkCombos(events, [warrior1, warrior2], [monster], {});
    expect(result).toEqual([]);
  });
});

// ── Shadow Barrage ─────────────────────────────────────────────────

describe('Shadow Barrage combo', () => {
  let tracker, ranger, mage, world;

  beforeEach(() => {
    tracker = new ComboTracker();
    ranger = createPlayer('Ranger1', 'ranger', 'r1');
    mage = createPlayer('Mage1', 'mage', 'm1');
    world = {
      monsters: [
        createMonster('decoy1', { name: 'Shadow Decoy', friendly: true, x: 200, y: 200 }),
      ],
    };
  });

  it('triggers on Sniper Shot projectile:create with active decoy', () => {
    const events = [{
      type: 'projectile:create', skillName: 'Sniper Shot',
      ownerId: 'r1', x: 100, y: 100, angle: 0.5,
    }];
    const result = tracker.checkCombos(events, [ranger, mage], [], world);
    expect(result).toHaveLength(1);
    expect(result[0].comboId).toBe('shadow_barrage');
    expect(result[0].effect).toBe('duplicate_projectile');
    expect(result[0].x).toBe(200); // decoy position
    expect(result[0].y).toBe(200);
  });

  it('does NOT trigger without a decoy', () => {
    world.monsters = [];
    const events = [{
      type: 'projectile:create', skillName: 'Sniper Shot',
      ownerId: 'r1', x: 100, y: 100, angle: 0.5,
    }];
    const result = tracker.checkCombos(events, [ranger, mage], [], world);
    expect(result).toEqual([]);
  });

  it('does NOT trigger if decoy is dead', () => {
    world.monsters[0].alive = false;
    const events = [{
      type: 'projectile:create', skillName: 'Sniper Shot',
      ownerId: 'r1', x: 100, y: 100, angle: 0.5,
    }];
    const result = tracker.checkCombos(events, [ranger, mage], [], world);
    expect(result).toEqual([]);
  });

  it('does NOT trigger on Arrow Volley projectile', () => {
    const events = [{
      type: 'projectile:create', skillName: 'Arrow Volley',
      ownerId: 'r1', x: 100, y: 100, angle: 0.5,
    }];
    const result = tracker.checkCombos(events, [ranger, mage], [], world);
    expect(result).toEqual([]);
  });
});

// ── Firestorm ──────────────────────────────────────────────────────

describe('Firestorm combo', () => {
  let tracker, warrior, mage, monster;

  beforeEach(() => {
    tracker = new ComboTracker();
    warrior = createPlayer('Warrior1', 'warrior', 'w1');
    mage = createPlayer('Mage1', 'mage', 'm1');
    monster = createMonster('mon1', { _inBurningGround: true });
  });

  it('triggers on Blizzard hit to monster in burning ground', () => {
    const events = [{
      type: 'combat:hit', targetId: 'mon1', attackerId: 'm1',
      skillName: 'Blizzard', damage: 70,
    }];
    const result = tracker.checkCombos(events, [warrior, mage], [monster], {});
    expect(result).toHaveLength(1);
    expect(result[0].comboId).toBe('firestorm');
    expect(result[0].effect).toBe('blind');
    expect(result[0].duration).toBe(3000);
  });

  it('does NOT trigger without burning ground', () => {
    monster._inBurningGround = false;
    const events = [{
      type: 'combat:hit', targetId: 'mon1', attackerId: 'm1',
      skillName: 'Blizzard', damage: 70,
    }];
    const result = tracker.checkCombos(events, [warrior, mage], [monster], {});
    expect(result).toEqual([]);
  });

  it('does NOT trigger on non-Blizzard skill', () => {
    const events = [{
      type: 'combat:hit', targetId: 'mon1', attackerId: 'm1',
      skillName: 'Chain Lightning', damage: 70,
    }];
    const result = tracker.checkCombos(events, [warrior, mage], [monster], {});
    expect(result).toEqual([]);
  });
});

// ── Cooldown system ────────────────────────────────────────────────

describe('Combo cooldown system', () => {
  let tracker;

  beforeEach(() => {
    tracker = new ComboTracker();
  });

  it('sets cooldown after combo triggers', () => {
    const warrior = createPlayer('W', 'warrior', 'w1');
    const mage = createPlayer('M', 'mage', 'm1');
    const monster = createMonster('mon1', { stunned: 5000 });
    const events = [{
      type: 'combat:hit', targetId: 'mon1', attackerId: 'w1',
      damage: 50, damageType: 'physical',
    }];
    tracker.checkCombos(events, [warrior, mage], [monster], {});
    expect(tracker.cooldowns.shatter_blast).toBeGreaterThan(Date.now());
  });

  it('cooldown expires after time passes', () => {
    const warrior = createPlayer('W', 'warrior', 'w1');
    const mage = createPlayer('M', 'mage', 'm1');
    const monster = createMonster('mon1', { stunned: 5000 });
    const events = [{
      type: 'combat:hit', targetId: 'mon1', attackerId: 'w1',
      damage: 50, damageType: 'physical',
    }];
    // First trigger
    tracker.checkCombos(events, [warrior, mage], [monster], {});
    // Manually expire cooldown
    tracker.cooldowns.shatter_blast = Date.now() - 1;
    // Should trigger again
    const r2 = tracker.checkCombos(events, [warrior, mage], [monster], {});
    expect(r2).toHaveLength(1);
  });

  it('different combos have independent cooldowns', () => {
    // Set shatter_blast on cooldown
    tracker.cooldowns.shatter_blast = Date.now() + 99999;
    // battle_fury should still be available
    const warrior1 = createPlayer('W1', 'warrior', 'w1');
    warrior1.buffs = [{ effect: 'attack_up', value: 20, remaining: 8000 }];
    const warrior2 = createPlayer('W2', 'warrior', 'w2');
    const monster = createMonster('mon1');
    const events = [{
      type: 'combat:hit', targetId: 'mon1', attackerId: 'w1',
      skillName: 'Whirlwind', damage: 40,
    }];
    const result = tracker.checkCombos(events, [warrior1, warrior2], [monster], {});
    expect(result).toHaveLength(1);
    expect(result[0].comboId).toBe('battle_fury');
  });
});

// ── Edge cases ─────────────────────────────────────────────────────

describe('Combo edge cases', () => {
  let tracker;

  beforeEach(() => {
    tracker = new ComboTracker();
  });

  it('dead monster does not trigger combos', () => {
    const warrior = createPlayer('W', 'warrior', 'w1');
    const mage = createPlayer('M', 'mage', 'm1');
    const monster = createMonster('mon1', { stunned: 5000 });
    monster.alive = false;
    const events = [{
      type: 'combat:hit', targetId: 'mon1', attackerId: 'w1',
      damage: 50, damageType: 'physical',
    }];
    const result = tracker.checkCombos(events, [warrior, mage], [monster], {});
    expect(result).toEqual([]);
  });

  it('empty events array returns no combos', () => {
    const result = tracker.checkCombos([], [], [], {});
    expect(result).toEqual([]);
  });

  it('only one combo fires per event (break after first match)', () => {
    // Create conditions that could match multiple combos
    // Stunned monster (shatter_blast) + in burning ground (firestorm)
    const warrior = createPlayer('W', 'warrior', 'w1');
    const mage = createPlayer('M', 'mage', 'm1');
    const monster = createMonster('mon1', { stunned: 5000, _inBurningGround: true });
    // Physical hit could match shatter_blast; Blizzard + burning could match firestorm
    // But physical + not Blizzard → only shatter_blast can match
    const events = [{
      type: 'combat:hit', targetId: 'mon1', attackerId: 'w1',
      damage: 50, damageType: 'physical',
    }];
    const result = tracker.checkCombos(events, [warrior, mage], [monster], {});
    // Should only be one combo
    expect(result).toHaveLength(1);
    expect(result[0].comboId).toBe('shatter_blast');
  });

  it('combo:trigger events have required fields', () => {
    const warrior = createPlayer('W', 'warrior', 'w1');
    const mage = createPlayer('M', 'mage', 'm1');
    const monster = createMonster('mon1', { stunned: 5000 });
    const events = [{
      type: 'combat:hit', targetId: 'mon1', attackerId: 'w1',
      damage: 50, damageType: 'physical',
    }];
    const result = tracker.checkCombos(events, [warrior, mage], [monster], {});
    const ev = result[0];
    expect(ev.type).toBe('combo:trigger');
    expect(ev.comboId).toBeTruthy();
    expect(ev.comboName).toBeTruthy();
    expect(typeof ev.x).toBe('number');
    expect(typeof ev.y).toBe('number');
  });
});
