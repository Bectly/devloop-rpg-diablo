import { describe, it, expect, beforeEach } from 'vitest';
import { createRequire } from 'module';
const require = createRequire(import.meta.url);

const { CombatSystem } = require('../game/combat');
const { Player } = require('../game/player');
const { Monster, AI_STATES } = require('../game/monsters');

// ── Helpers ────────────────────────────────────────────────────────

function createRanger() {
  const p = new Player('TestRanger', 'ranger');
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

// ── Arrow Volley (skill index 0, type: 'volley') ──────────────────

describe('Arrow Volley (volley)', () => {
  let combat, player;

  beforeEach(() => {
    combat = new CombatSystem();
    player = createRanger();
  });

  it('emits 5 projectile:create events', () => {
    const m1 = createMonsterAt(player.x + 100, player.y);
    const results = combat.playerSkill(player, 0, [m1], [player]);
    const projEvents = results.filter(e => e.type === 'projectile:create');
    expect(projEvents.length).toBe(5);
  });

  it('all projectiles have correct ownerId and damage type', () => {
    const m1 = createMonsterAt(player.x + 100, player.y);
    const results = combat.playerSkill(player, 0, [m1], [player]);
    const projEvents = results.filter(e => e.type === 'projectile:create');
    for (const p of projEvents) {
      expect(p.ownerId).toBe(player.id);
      expect(p.damageType).toBe('physical');
      expect(p.piercing).toBe(true);
      expect(p.visual).toBe('arrow');
      expect(p.skillName).toBe('Arrow Volley');
    }
  });

  it('projectile damage is 0.6x attackPower', () => {
    const m1 = createMonsterAt(player.x + 100, player.y);
    const results = combat.playerSkill(player, 0, [m1], [player]);
    const projEvents = results.filter(e => e.type === 'projectile:create');
    const expectedDmg = Math.floor(player.attackPower * 0.6);
    for (const p of projEvents) {
      expect(p.damage).toBe(expectedDmg);
    }
  });

  it('projectiles spread in a cone (30° spread)', () => {
    const m1 = createMonsterAt(player.x + 200, player.y);
    const results = combat.playerSkill(player, 0, [m1], [player]);
    const projEvents = results.filter(e => e.type === 'projectile:create');
    const angles = projEvents.map(p => p.angle);
    // All 5 angles should be different
    const uniqueAngles = new Set(angles.map(a => a.toFixed(4)));
    expect(uniqueAngles.size).toBe(5);
    // Spread should be ~30° (0.524 rad)
    const spread = Math.max(...angles) - Math.min(...angles);
    expect(spread).toBeCloseTo((30 * Math.PI) / 180, 2);
  });

  it('emits effect:spawn arrow_volley event', () => {
    const m1 = createMonsterAt(player.x + 100, player.y);
    const results = combat.playerSkill(player, 0, [m1], [player]);
    const effect = results.find(e => e.type === 'effect:spawn' && e.effectType === 'arrow_volley');
    expect(effect).toBeDefined();
    expect(effect.playerId).toBe(player.id);
    expect(effect.count).toBe(5);
  });

  it('costs 18 MP and sets cooldown', () => {
    const startMp = player.mp;
    const m1 = createMonsterAt(player.x + 100, player.y);
    combat.playerSkill(player, 0, [m1], [player]);
    expect(player.mp).toBe(startMp - 18);
    expect(player.skillCooldowns[0]).toBe(3500);
  });

  it('fires in facing direction when no target in range', () => {
    player.facing = 'right';
    // Monster at 500px — out of 300px range
    const m1 = createMonsterAt(player.x + 500, player.y);
    const results = combat.playerSkill(player, 0, [m1], [player]);
    const projEvents = results.filter(e => e.type === 'projectile:create');
    expect(projEvents.length).toBe(5);
    // Center angle should be ~0 (right)
    const centerAngle = projEvents[2].angle;
    expect(centerAngle).toBeCloseTo(0, 1);
  });

  it('aims at nearest monster within range', () => {
    // Monster above player
    const m1 = createMonsterAt(player.x, player.y - 100);
    player.facing = 'right'; // facing right but should aim up at monster
    const results = combat.playerSkill(player, 0, [m1], [player]);
    const projEvents = results.filter(e => e.type === 'projectile:create');
    // Center angle should be ~-PI/2 (up)
    const centerAngle = projEvents[2].angle;
    expect(centerAngle).toBeCloseTo(-Math.PI / 2, 1);
  });
});

// ── Sniper Shot (skill index 1, type: 'sniper') ──────────────────

describe('Sniper Shot (sniper)', () => {
  let combat, player;

  beforeEach(() => {
    combat = new CombatSystem();
    player = createRanger();
  });

  it('emits 1 projectile:create event', () => {
    const m1 = createMonsterAt(player.x + 200, player.y);
    const results = combat.playerSkill(player, 1, [m1], [player]);
    const projEvents = results.filter(e => e.type === 'projectile:create');
    expect(projEvents.length).toBe(1);
  });

  it('projectile is piercing with sniper visual', () => {
    const m1 = createMonsterAt(player.x + 200, player.y);
    const results = combat.playerSkill(player, 1, [m1], [player]);
    const proj = results.find(e => e.type === 'projectile:create');
    expect(proj.piercing).toBe(true);
    expect(proj.visual).toBe('sniper');
    expect(proj.skillName).toBe('Sniper Shot');
  });

  it('projectile damage is 3.0x attackPower', () => {
    const m1 = createMonsterAt(player.x + 200, player.y);
    const results = combat.playerSkill(player, 1, [m1], [player]);
    const proj = results.find(e => e.type === 'projectile:create');
    const expectedDmg = Math.floor(player.attackPower * 3.0);
    expect(proj.damage).toBe(expectedDmg);
  });

  it('projectile speed is 200 (slow)', () => {
    const m1 = createMonsterAt(player.x + 200, player.y);
    const results = combat.playerSkill(player, 1, [m1], [player]);
    const proj = results.find(e => e.type === 'projectile:create');
    expect(proj.speed).toBe(200);
  });

  it('projectile has extended lifetime (3000ms)', () => {
    const m1 = createMonsterAt(player.x + 200, player.y);
    const results = combat.playerSkill(player, 1, [m1], [player]);
    const proj = results.find(e => e.type === 'projectile:create');
    expect(proj.lifetime).toBe(3000);
  });

  it('emits effect:spawn sniper_shot event', () => {
    const m1 = createMonsterAt(player.x + 200, player.y);
    const results = combat.playerSkill(player, 1, [m1], [player]);
    const effect = results.find(e => e.type === 'effect:spawn' && e.effectType === 'sniper_shot');
    expect(effect).toBeDefined();
    expect(effect.playerId).toBe(player.id);
  });

  it('costs 25 MP and sets 8000ms cooldown', () => {
    const startMp = player.mp;
    const m1 = createMonsterAt(player.x + 200, player.y);
    combat.playerSkill(player, 1, [m1], [player]);
    expect(player.mp).toBe(startMp - 25);
    expect(player.skillCooldowns[1]).toBe(8000);
  });

  it('aims at nearest monster within 400px range', () => {
    const mClose = createMonsterAt(player.x + 150, player.y);
    const mFar = createMonsterAt(player.x + 350, player.y);
    const results = combat.playerSkill(player, 1, [mClose, mFar], [player]);
    const proj = results.find(e => e.type === 'projectile:create');
    // Should aim at closer monster
    const expectedAngle = Math.atan2(mClose.y - player.y, mClose.x - player.x);
    expect(proj.angle).toBeCloseTo(expectedAngle, 4);
  });

  it('fires in facing direction when no target in range', () => {
    player.facing = 'left';
    const m1 = createMonsterAt(player.x + 500, player.y); // out of 400px range
    const results = combat.playerSkill(player, 1, [m1], [player]);
    const proj = results.find(e => e.type === 'projectile:create');
    expect(proj.angle).toBeCloseTo(Math.PI, 1); // left = PI
  });
});

// ── Shadow Step (skill index 2, type: 'shadow_step') ─────────────

describe('Shadow Step (shadow_step)', () => {
  let combat, player;

  beforeEach(() => {
    combat = new CombatSystem();
    player = createRanger();
    player.x = 400;
    player.y = 400;
  });

  it('teleports player 100px in facing direction', () => {
    player.facing = 'right';
    const startX = player.x;
    combat.playerSkill(player, 2, [], [player]);
    expect(player.x).toBe(startX + 100);
    expect(player.y).toBe(400);
  });

  it('teleports up when facing up', () => {
    player.facing = 'up';
    const startY = player.y;
    combat.playerSkill(player, 2, [], [player]);
    expect(player.y).toBe(startY - 100);
    expect(player.x).toBe(400);
  });

  it('applies dodge_up buff', () => {
    combat.playerSkill(player, 2, [], [player]);
    const dodgeBuff = player.buffs.find(b => b.effect === 'dodge_up');
    expect(dodgeBuff).toBeDefined();
    expect(dodgeBuff.duration).toBe(1000);
    expect(dodgeBuff.remaining).toBe(1000);
  });

  it('emits buff:apply event', () => {
    const results = combat.playerSkill(player, 2, [], [player]);
    const buff = results.find(e => e.type === 'buff:apply');
    expect(buff).toBeDefined();
    expect(buff.effect).toBe('dodge_up');
    expect(buff.duration).toBe(1000);
    expect(buff.skillName).toBe('Shadow Step');
  });

  it('emits summon:shadow_decoy event at original position', () => {
    const startX = player.x;
    const startY = player.y;
    player.facing = 'right';
    const results = combat.playerSkill(player, 2, [], [player]);
    const decoy = results.find(e => e.type === 'summon:shadow_decoy');
    expect(decoy).toBeDefined();
    expect(decoy.x).toBe(startX);
    expect(decoy.y).toBe(startY);
    expect(decoy.duration).toBe(2000);
  });

  it('emits effect:spawn shadow_step event with from/to positions', () => {
    const startX = player.x;
    const startY = player.y;
    player.facing = 'down';
    const results = combat.playerSkill(player, 2, [], [player]);
    const effect = results.find(e => e.type === 'effect:spawn' && e.effectType === 'shadow_step');
    expect(effect).toBeDefined();
    expect(effect.fromX).toBe(startX);
    expect(effect.fromY).toBe(startY);
    expect(effect.toX).toBe(startX);
    expect(effect.toY).toBe(startY + 100);
  });

  it('clamps to world bounds', () => {
    player.x = 1900;
    player.facing = 'right';
    combat.playerSkill(player, 2, [], [player]);
    expect(player.x).toBe(1904); // clamped to max
  });

  it('clamps to world bounds (left edge)', () => {
    player.x = 20;
    player.facing = 'left';
    combat.playerSkill(player, 2, [], [player]);
    expect(player.x).toBe(16); // clamped to min
  });

  it('costs 20 MP and sets 7000ms cooldown', () => {
    const startMp = player.mp;
    combat.playerSkill(player, 2, [], [player]);
    expect(player.mp).toBe(startMp - 20);
    expect(player.skillCooldowns[2]).toBe(7000);
  });

  it('does not damage any monsters', () => {
    const m1 = createMonsterAt(player.x + 50, player.y);
    const startHp = m1.hp;
    combat.playerSkill(player, 2, [m1], [player]);
    expect(m1.hp).toBe(startHp);
  });
});
