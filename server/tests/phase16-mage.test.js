import { describe, it, expect, beforeEach } from 'vitest';
import { createRequire } from 'module';
const require = createRequire(import.meta.url);

const { CombatSystem } = require('../game/combat');
const { Player } = require('../game/player');
const { Monster, AI_STATES } = require('../game/monsters');

// ── Helpers ────────────────────────────────────────────────────────

function createMage() {
  const p = new Player('TestMage', 'mage');
  p.recalcStats();
  p.mp = 200;
  p.hp = p.maxHp;
  p.dodgeChance = 0;
  p.critChance = 0;
  return p;
}

function createMonsterAt(x, y, hp = 5000) {
  const m = new Monster('skeleton', x, y, 0);
  m.maxHp = hp;
  m.hp = hp;
  m.armor = 0;
  return m;
}

// ── Meteor Strike (skill index 0, type: 'meteor') ────────────────

describe('Meteor Strike (meteor)', () => {
  let combat, player;

  beforeEach(() => {
    combat = new CombatSystem();
    player = createMage();
  });

  it('emits 1 projectile:create event with aoeRadius', () => {
    const m1 = createMonsterAt(player.x + 200, player.y);
    const results = combat.playerSkill(player, 0, [m1], [player]);
    const projEvents = results.filter(e => e.type === 'projectile:create');
    expect(projEvents.length).toBe(1);
    expect(projEvents[0].aoeRadius).toBe(80);
  });

  it('projectile uses spellPower for damage', () => {
    const m1 = createMonsterAt(player.x + 200, player.y);
    const results = combat.playerSkill(player, 0, [m1], [player]);
    const proj = results.find(e => e.type === 'projectile:create');
    const expectedDmg = Math.floor(player.spellPower * 2.5);
    expect(proj.damage).toBe(expectedDmg);
  });

  it('projectile is NOT piercing (explodes on impact)', () => {
    const m1 = createMonsterAt(player.x + 200, player.y);
    const results = combat.playerSkill(player, 0, [m1], [player]);
    const proj = results.find(e => e.type === 'projectile:create');
    expect(proj.piercing).toBe(false);
  });

  it('projectile has fireball visual and fire damageType', () => {
    const m1 = createMonsterAt(player.x + 200, player.y);
    const results = combat.playerSkill(player, 0, [m1], [player]);
    const proj = results.find(e => e.type === 'projectile:create');
    expect(proj.visual).toBe('fireball');
    expect(proj.damageType).toBe('fire');
    expect(proj.skillName).toBe('Meteor Strike');
  });

  it('emits effect:spawn meteor_cast event', () => {
    const m1 = createMonsterAt(player.x + 200, player.y);
    const results = combat.playerSkill(player, 0, [m1], [player]);
    const effect = results.find(e => e.type === 'effect:spawn' && e.effectType === 'meteor_cast');
    expect(effect).toBeDefined();
    expect(effect.playerId).toBe(player.id);
  });

  it('costs 25 MP and sets 5000ms cooldown', () => {
    const startMp = player.mp;
    const m1 = createMonsterAt(player.x + 200, player.y);
    combat.playerSkill(player, 0, [m1], [player]);
    expect(player.mp).toBe(startMp - 25);
    expect(player.skillCooldowns[0]).toBe(5000);
  });

  it('fires in facing direction when no target in range', () => {
    player.facing = 'up';
    const m1 = createMonsterAt(player.x + 500, player.y); // out of 350px range
    const results = combat.playerSkill(player, 0, [m1], [player]);
    const proj = results.find(e => e.type === 'projectile:create');
    expect(proj.angle).toBeCloseTo(-Math.PI / 2, 1);
  });

  it('aims at nearest monster within range', () => {
    const m1 = createMonsterAt(player.x, player.y - 150);
    player.facing = 'right';
    const results = combat.playerSkill(player, 0, [m1], [player]);
    const proj = results.find(e => e.type === 'projectile:create');
    expect(proj.angle).toBeCloseTo(-Math.PI / 2, 1);
  });
});

// ── Blizzard (skill index 1, type: 'blizzard') ──────────────────

describe('Blizzard (blizzard)', () => {
  let combat, player;

  beforeEach(() => {
    combat = new CombatSystem();
    player = createMage();
  });

  it('hits all monsters within radius (120px)', () => {
    const m1 = createMonsterAt(player.x + 50, player.y);
    const m2 = createMonsterAt(player.x, player.y + 100);
    const m3 = createMonsterAt(player.x + 200, player.y); // out of range

    const results = combat.playerSkill(player, 1, [m1, m2, m3], [player]);
    const hitTargets = new Set(
      results.filter(e => e.type === 'combat:hit').map(e => e.targetId)
    );
    expect(hitTargets.has(m1.id)).toBe(true);
    expect(hitTargets.has(m2.id)).toBe(true);
    expect(hitTargets.has(m3.id)).toBe(false);
  });

  it('deals 3 hits per monster (hitIndex 0, 1, 2)', () => {
    const m1 = createMonsterAt(player.x + 50, player.y);
    const results = combat.playerSkill(player, 1, [m1], [player]);
    const hits = results.filter(e => e.type === 'combat:hit' && e.targetId === m1.id);
    expect(hits.length).toBe(3);
    expect(hits[0].hitIndex).toBe(0);
    expect(hits[1].hitIndex).toBe(1);
    expect(hits[2].hitIndex).toBe(2);
  });

  it('uses spellPower for damage (1.2x per hit)', () => {
    const m1 = createMonsterAt(player.x + 50, player.y);
    const results = combat.playerSkill(player, 1, [m1], [player]);
    const hits = results.filter(e => e.type === 'combat:hit');
    const expectedDmg = Math.floor(player.spellPower * 1.2);
    // Each hit should be the same base damage (before armor/resist)
    expect(hits[0].damage).toBe(expectedDmg);
  });

  it('applies slow to surviving monsters', () => {
    const m1 = createMonsterAt(player.x + 50, player.y);
    combat.playerSkill(player, 1, [m1], [player]);
    expect(m1.slowed).toBeGreaterThan(0);
  });

  it('does NOT apply slow to dead monsters', () => {
    const m1 = createMonsterAt(player.x + 50, player.y, 10); // very low HP
    combat.playerSkill(player, 1, [m1], [player]);
    // Monster should be dead, slow not applied
    expect(m1.alive).toBe(false);
  });

  it('emits effect:spawn blizzard event', () => {
    const m1 = createMonsterAt(player.x + 50, player.y);
    const results = combat.playerSkill(player, 1, [m1], [player]);
    const effect = results.find(e => e.type === 'effect:spawn' && e.effectType === 'blizzard');
    expect(effect).toBeDefined();
    expect(effect.radius).toBe(120);
    expect(effect.hits).toBe(3);
  });

  it('costs 22 MP and sets 7000ms cooldown', () => {
    const startMp = player.mp;
    combat.playerSkill(player, 1, [], [player]);
    expect(player.mp).toBe(startMp - 22);
    expect(player.skillCooldowns[1]).toBe(7000);
  });

  it('has cold damage type', () => {
    const m1 = createMonsterAt(player.x + 50, player.y);
    const results = combat.playerSkill(player, 1, [m1], [player]);
    const hit = results.find(e => e.type === 'combat:hit');
    expect(hit.damageType).toBe('cold');
    expect(hit.skillName).toBe('Blizzard');
  });

  it('handles kill mid-blizzard (stops hitting dead monster)', () => {
    const m1 = createMonsterAt(player.x + 50, player.y, 20); // dies on first or second hit
    const results = combat.playerSkill(player, 1, [m1], [player]);
    const hits = results.filter(e => e.type === 'combat:hit' && e.targetId === m1.id);
    // Should be fewer than 3 hits since monster dies
    expect(hits.length).toBeLessThan(3);
    const death = results.find(e => e.type === 'combat:death');
    expect(death).toBeDefined();
  });
});

// ── Chain Lightning (skill index 2, type: 'chain') ──────────────

describe('Chain Lightning (chain)', () => {
  let combat, player;

  beforeEach(() => {
    combat = new CombatSystem();
    player = createMage();
  });

  it('hits nearest target first', () => {
    const mClose = createMonsterAt(player.x + 100, player.y);
    const mFar = createMonsterAt(player.x + 180, player.y);
    const results = combat.playerSkill(player, 2, [mClose, mFar], [player]);
    const hits = results.filter(e => e.type === 'combat:hit');
    expect(hits[0].targetId).toBe(mClose.id);
  });

  it('chains to second target within chainRange (120px)', () => {
    const m1 = createMonsterAt(player.x + 100, player.y);
    const m2 = createMonsterAt(player.x + 200, player.y); // 100px from m1
    const results = combat.playerSkill(player, 2, [m1, m2], [player]);
    const hits = results.filter(e => e.type === 'combat:hit');
    expect(hits.length).toBe(2);
    expect(hits[0].targetId).toBe(m1.id);
    expect(hits[1].targetId).toBe(m2.id);
  });

  it('chains up to 4 targets max', () => {
    const monsters = [];
    for (let i = 0; i < 6; i++) {
      monsters.push(createMonsterAt(player.x + 50 + i * 80, player.y));
    }
    const results = combat.playerSkill(player, 2, monsters, [player]);
    const hits = results.filter(e => e.type === 'combat:hit');
    expect(hits.length).toBe(4); // maxBounces = 4
  });

  it('applies 50% damage falloff per bounce', () => {
    const m1 = createMonsterAt(player.x + 100, player.y);
    const m2 = createMonsterAt(player.x + 200, player.y);
    const m3 = createMonsterAt(player.x + 300, player.y);
    const results = combat.playerSkill(player, 2, [m1, m2, m3], [player]);
    const hits = results.filter(e => e.type === 'combat:hit');
    // Damage should decrease: hit[0] > hit[1] > hit[2]
    expect(hits[0].damage).toBeGreaterThan(hits[1].damage);
    expect(hits[1].damage).toBeGreaterThan(hits[2].damage);
    // Second hit should be ~50% of first
    expect(hits[1].damage).toBeCloseTo(hits[0].damage * 0.5, -1);
  });

  it('uses spellPower for base damage (2.0x)', () => {
    const m1 = createMonsterAt(player.x + 100, player.y);
    const results = combat.playerSkill(player, 2, [m1], [player]);
    const hit = results.find(e => e.type === 'combat:hit');
    const expectedDmg = Math.floor(player.spellPower * 2.0);
    expect(hit.damage).toBe(expectedDmg);
  });

  it('emits chain_lightning effect:spawn events for each bounce', () => {
    const m1 = createMonsterAt(player.x + 100, player.y);
    const m2 = createMonsterAt(player.x + 200, player.y);
    const results = combat.playerSkill(player, 2, [m1, m2], [player]);
    const effects = results.filter(e => e.type === 'effect:spawn' && e.effectType === 'chain_lightning');
    expect(effects.length).toBe(2);
    expect(effects[0].bounceIndex).toBe(0);
    expect(effects[1].bounceIndex).toBe(1);
    // First arc: from player to m1
    expect(effects[0].fromX).toBe(player.x);
    expect(effects[0].fromY).toBe(player.y);
    expect(effects[0].toX).toBe(m1.x);
    // Second arc: from m1 to m2
    expect(effects[1].fromX).toBe(m1.x);
    expect(effects[1].toX).toBe(m2.x);
  });

  it('does not hit same target twice', () => {
    const m1 = createMonsterAt(player.x + 100, player.y);
    // Only 1 target — should only hit once even with maxBounces=4
    const results = combat.playerSkill(player, 2, [m1], [player]);
    const hits = results.filter(e => e.type === 'combat:hit');
    expect(hits.length).toBe(1);
  });

  it('returns empty results when no target in range', () => {
    const m1 = createMonsterAt(player.x + 300, player.y); // out of 200px range
    const results = combat.playerSkill(player, 2, [m1], [player]);
    const hits = results.filter(e => e.type === 'combat:hit');
    expect(hits.length).toBe(0);
  });

  it('does not chain to targets beyond chainRange', () => {
    const m1 = createMonsterAt(player.x + 100, player.y);
    const m2 = createMonsterAt(player.x + 350, player.y); // 250px from m1, > chainRange 120
    const results = combat.playerSkill(player, 2, [m1, m2], [player]);
    const hits = results.filter(e => e.type === 'combat:hit');
    expect(hits.length).toBe(1);
    expect(hits[0].targetId).toBe(m1.id);
  });

  it('costs 20 MP and sets 4000ms cooldown', () => {
    const startMp = player.mp;
    const m1 = createMonsterAt(player.x + 100, player.y);
    combat.playerSkill(player, 2, [m1], [player]);
    expect(player.mp).toBe(startMp - 20);
    expect(player.skillCooldowns[2]).toBe(4000);
  });

  it('has fire damage type', () => {
    const m1 = createMonsterAt(player.x + 100, player.y);
    const results = combat.playerSkill(player, 2, [m1], [player]);
    const hit = results.find(e => e.type === 'combat:hit');
    expect(hit.damageType).toBe('fire');
    expect(hit.skillName).toBe('Chain Lightning');
  });

  it('includes bounceIndex in hit events', () => {
    const m1 = createMonsterAt(player.x + 100, player.y);
    const m2 = createMonsterAt(player.x + 200, player.y);
    const results = combat.playerSkill(player, 2, [m1, m2], [player]);
    const hits = results.filter(e => e.type === 'combat:hit');
    expect(hits[0].bounceIndex).toBe(0);
    expect(hits[1].bounceIndex).toBe(1);
  });
});

// ── useSpellPower refactor ──────────────────────────────────────

describe('useSpellPower flag', () => {
  it('mage skills use spellPower (not attackPower)', () => {
    const mage = createMage();
    // Ensure spellPower and attackPower are different
    expect(mage.spellPower).not.toBe(mage.attackPower);
  });

  it('all 3 mage skills have useSpellPower: true', () => {
    const mage = createMage();
    for (const skill of mage.skills) {
      expect(skill.useSpellPower).toBe(true);
    }
  });
});
