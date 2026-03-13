import { describe, it, expect, beforeEach } from 'vitest';
import { createRequire } from 'module';
const require = createRequire(import.meta.url);

const { Projectile, createProjectile, createProjectileAngled, updateProjectiles } = require('../game/projectiles');
const { Monster } = require('../game/monsters');

// ── Projectile Class ──────────────────────────────────────────────

describe('Projectile class', () => {
  it('constructs with correct defaults', () => {
    const p = new Projectile({
      ownerId: 'player-1',
      x: 100, y: 200,
      vx: 300, vy: 0,
      damage: 50,
    });
    expect(p.ownerId).toBe('player-1');
    expect(p.x).toBe(100);
    expect(p.y).toBe(200);
    expect(p.damage).toBe(50);
    expect(p.damageType).toBe('physical');
    expect(p.piercing).toBe(false);
    expect(p.aoeRadius).toBe(0);
    expect(p.lifetime).toBe(2000);
    expect(p.alive).toBe(true);
    expect(p.hitIds).toBeInstanceOf(Set);
    expect(p.id).toBeTruthy();
  });

  it('serialize returns minimal data for TV', () => {
    const p = new Projectile({
      ownerId: 'p1', x: 50, y: 60, vx: 100, vy: -50,
      visual: 'fireball', aoeRadius: 80,
    });
    const s = p.serialize();
    expect(s.id).toBe(p.id);
    expect(s.x).toBe(50);
    expect(s.y).toBe(60);
    expect(s.vx).toBe(100);
    expect(s.vy).toBe(-50);
    expect(s.visual).toBe('fireball');
    expect(s.aoeRadius).toBe(80);
    // Should NOT include ownerId, damage, hitIds etc.
    expect(s.ownerId).toBeUndefined();
    expect(s.damage).toBeUndefined();
  });
});

// ── createProjectile ──────────────────────────────────────────────

describe('createProjectile()', () => {
  it('creates a projectile aimed at a target', () => {
    const owner = { id: 'p1', x: 0, y: 0 };
    const proj = createProjectile(owner, 100, 0, { damage: 30, speed: 200 });
    expect(proj.ownerId).toBe('p1');
    expect(proj.vx).toBeCloseTo(200, 0);
    expect(proj.vy).toBeCloseTo(0, 0);
    expect(proj.damage).toBe(30);
  });

  it('normalizes direction to speed magnitude', () => {
    const owner = { id: 'p1', x: 0, y: 0 };
    const proj = createProjectile(owner, 100, 100, { speed: 400 });
    const magnitude = Math.sqrt(proj.vx ** 2 + proj.vy ** 2);
    expect(magnitude).toBeCloseTo(400, 0);
  });

  it('handles zero-distance gracefully', () => {
    const owner = { id: 'p1', x: 50, y: 50 };
    const proj = createProjectile(owner, 50, 50, { speed: 400 });
    // Should not produce NaN
    expect(Number.isNaN(proj.vx)).toBe(false);
    expect(Number.isNaN(proj.vy)).toBe(false);
  });
});

// ── createProjectileAngled ────────────────────────────────────────

describe('createProjectileAngled()', () => {
  it('creates a projectile at a given angle', () => {
    const owner = { id: 'p1', x: 100, y: 100 };
    const proj = createProjectileAngled(owner, 0, { speed: 300, damage: 20 });
    expect(proj.vx).toBeCloseTo(300, 0);
    expect(proj.vy).toBeCloseTo(0, 0);
    expect(proj.x).toBe(100);
    expect(proj.y).toBe(100);
  });

  it('angle PI/2 fires downward', () => {
    const owner = { id: 'p1', x: 0, y: 0 };
    const proj = createProjectileAngled(owner, Math.PI / 2, { speed: 100 });
    expect(proj.vx).toBeCloseTo(0, 0);
    expect(proj.vy).toBeCloseTo(100, 0);
  });
});

// ── updateProjectiles ─────────────────────────────────────────────

describe('updateProjectiles()', () => {
  let projectiles;
  let monsters;

  beforeEach(() => {
    projectiles = [];
    monsters = [];
  });

  it('moves projectile based on velocity and dt', () => {
    const p = new Projectile({
      ownerId: 'p1', x: 100, y: 100, vx: 200, vy: 0, lifetime: 5000,
    });
    projectiles.push(p);
    updateProjectiles(projectiles, monsters, 500); // 0.5s
    expect(p.x).toBeCloseTo(200, 0); // 100 + 200*0.5
    expect(p.y).toBeCloseTo(100, 0);
  });

  it('removes expired projectiles', () => {
    const p = new Projectile({
      ownerId: 'p1', x: 100, y: 100, vx: 10, vy: 0, lifetime: 100,
    });
    projectiles.push(p);
    updateProjectiles(projectiles, monsters, 200); // exceeds lifetime
    expect(projectiles).toHaveLength(0);
  });

  it('removes out-of-bounds projectiles', () => {
    const p = new Projectile({
      ownerId: 'p1', x: 1960, y: 100, vx: 500, vy: 0, lifetime: 5000,
    });
    projectiles.push(p);
    updateProjectiles(projectiles, monsters, 100); // x goes to 2010 > 1970
    expect(projectiles).toHaveLength(0);
  });

  it('hits a monster and generates combat event', () => {
    const p = new Projectile({
      ownerId: 'p1', x: 95, y: 100, vx: 100, vy: 0,
      damage: 25, damageType: 'fire', skillName: 'Fireball', lifetime: 5000,
    });
    projectiles.push(p);
    const m = new Monster('skeleton', 100, 100, 0);
    m.maxHp = 200;
    m.hp = 200;
    monsters.push(m);

    const events = updateProjectiles(projectiles, monsters, 50);

    expect(events.length).toBeGreaterThan(0);
    const hit = events.find(e => e.type === 'combat:hit');
    expect(hit).toBeDefined();
    expect(hit.attackerId).toBe('p1');
    expect(hit.targetId).toBe(m.id);
    expect(hit.damageType).toBe('fire');
    expect(hit.skillName).toBe('Fireball');
    expect(hit.isProjectile).toBe(true);
    // Non-piercing: projectile removed
    expect(projectiles).toHaveLength(0);
  });

  it('piercing projectile continues through target', () => {
    const p = new Projectile({
      ownerId: 'p1', x: 80, y: 100, vx: 200, vy: 0,
      damage: 20, piercing: true, lifetime: 5000,
    });
    projectiles.push(p);
    const m = new Monster('skeleton', 100, 100, 0);
    m.maxHp = 500;
    m.hp = 500;
    monsters.push(m);

    const events = updateProjectiles(projectiles, monsters, 200);

    expect(events.length).toBeGreaterThan(0);
    // Projectile survives (piercing)
    expect(projectiles).toHaveLength(1);
    expect(p.hitIds.has(m.id)).toBe(true);
  });

  it('piercing projectile does not hit same target twice', () => {
    const p = new Projectile({
      ownerId: 'p1', x: 90, y: 100, vx: 10, vy: 0,
      damage: 20, piercing: true, lifetime: 5000,
    });
    projectiles.push(p);
    const m = new Monster('skeleton', 100, 100, 0);
    m.maxHp = 500;
    m.hp = 500;
    monsters.push(m);

    updateProjectiles(projectiles, monsters, 100);
    const hpAfterFirst = m.hp;
    updateProjectiles(projectiles, monsters, 100);
    // HP shouldn't change — already in hitIds
    expect(m.hp).toBe(hpAfterFirst);
  });

  it('skips friendly monsters', () => {
    const p = new Projectile({
      ownerId: 'p1', x: 95, y: 100, vx: 100, vy: 0,
      damage: 50, lifetime: 5000,
    });
    projectiles.push(p);
    const m = new Monster('spirit_wolf', 100, 100, 0);
    m.friendly = true;
    monsters.push(m);

    const events = updateProjectiles(projectiles, monsters, 50);

    expect(events).toHaveLength(0);
    // Projectile should still be alive (no collision)
    expect(projectiles).toHaveLength(1);
  });

  it('AOE projectile damages all monsters in radius', () => {
    const p = new Projectile({
      ownerId: 'p1', x: 95, y: 100, vx: 100, vy: 0,
      damage: 30, aoeRadius: 100, lifetime: 5000,
    });
    projectiles.push(p);
    const m1 = new Monster('skeleton', 100, 100, 0);
    m1.maxHp = 200; m1.hp = 200;
    const m2 = new Monster('zombie', 140, 100, 0);
    m2.maxHp = 300; m2.hp = 300;
    const m3 = new Monster('demon', 500, 500, 0); // out of AOE range
    m3.maxHp = 200; m3.hp = 200;
    monsters.push(m1, m2, m3);

    const events = updateProjectiles(projectiles, monsters, 50);

    const hits = events.filter(e => e.type === 'combat:hit');
    expect(hits.length).toBe(2); // m1 and m2 hit, m3 too far
    expect(m3.hp).toBe(200); // untouched

    const explosion = events.find(e => e.type === 'effect:spawn' && e.effectType === 'explosion');
    expect(explosion).toBeDefined();
    expect(explosion.radius).toBe(100);

    // AOE projectile dies on impact
    expect(projectiles).toHaveLength(0);
  });

  it('multiple projectiles updated independently', () => {
    const p1 = new Projectile({
      ownerId: 'p1', x: 100, y: 100, vx: 100, vy: 0, lifetime: 5000,
    });
    const p2 = new Projectile({
      ownerId: 'p1', x: 200, y: 200, vx: 0, vy: -100, lifetime: 5000,
    });
    projectiles.push(p1, p2);
    updateProjectiles(projectiles, monsters, 1000);

    expect(p1.x).toBeCloseTo(200, 0);
    expect(p2.y).toBeCloseTo(100, 0);
    expect(projectiles).toHaveLength(2);
  });

  it('dead monster is not hit', () => {
    const p = new Projectile({
      ownerId: 'p1', x: 95, y: 100, vx: 100, vy: 0,
      damage: 50, lifetime: 5000,
    });
    projectiles.push(p);
    const m = new Monster('skeleton', 100, 100, 0);
    m.alive = false;
    monsters.push(m);

    const events = updateProjectiles(projectiles, monsters, 50);
    expect(events).toHaveLength(0);
    expect(projectiles).toHaveLength(1);
  });
});

// ── Skills extraction behavioral parity ───────────────────────────

describe('skills.js extraction — behavioral parity', () => {
  const { CombatSystem } = require('../game/combat');
  const { Player } = require('../game/player');

  it('playerSkill still works via executeSkill wrapper', () => {
    const combat = new CombatSystem();
    const player = new Player('SkillTest', 'warrior');
    player.recalcStats();
    player.mp = 100;
    const monster = new Monster('skeleton', player.x + 30, player.y, 0);
    monster.maxHp = 5000;
    monster.hp = 5000;

    const results = combat.playerSkill(player, 0, [monster], [player]);
    // Whirlwind is AOE — should produce hit events
    expect(results).not.toBeNull();
    expect(results.length).toBeGreaterThan(0);
    expect(results[0].type).toBe('combat:hit');
  });

  it('buff skill applies to all players for War Cry', () => {
    const combat = new CombatSystem();
    const p1 = new Player('Warrior', 'warrior');
    p1.recalcStats();
    p1.mp = 100;
    const p2 = new Player('Ally', 'ranger');
    p2.recalcStats();

    // War Cry is skill index 2 for warrior (0=Cleave, 1=Shield Bash, 2=War Cry)
    const results = combat.playerSkill(p1, 2, [], [p1, p2]);
    expect(results).not.toBeNull();
    const buffEvents = results.filter(e => e.type === 'buff:apply');
    expect(buffEvents).toHaveLength(2);
    expect(p1.buffs.some(b => b.effect === 'attack_up')).toBe(true);
    expect(p2.buffs.some(b => b.effect === 'attack_up')).toBe(true);
  });

  it('returns null when skill cannot be used (no MP)', () => {
    const combat = new CombatSystem();
    const player = new Player('NoMp', 'mage');
    player.recalcStats();
    player.mp = 0;

    const results = combat.playerSkill(player, 0, [], [player]);
    expect(results).toBeNull();
  });

  it('movement skill teleports player', () => {
    const combat = new CombatSystem();
    const player = new Player('Blinker', 'mage');
    player.recalcStats();
    player.mp = 100;
    player.facing = 'right';
    const startX = player.x;

    // Blink is skill index 2 for mage (movement type)
    const results = combat.playerSkill(player, 2, [], [player]);
    expect(results).not.toBeNull();
    expect(player.x).toBeGreaterThan(startX);
  });
});
