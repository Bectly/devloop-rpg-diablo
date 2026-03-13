import { describe, it, expect, beforeEach } from 'vitest';
import { createRequire } from 'module';
const require = createRequire(import.meta.url);

const { CombatSystem } = require('../game/combat');
const { Player } = require('../game/player');
const { Monster, AI_STATES } = require('../game/monsters');

// ── Helpers ────────────────────────────────────────────────────────

function createWarrior() {
  const p = new Player('TestWarrior', 'warrior');
  p.recalcStats();
  p.mp = 200;
  p.hp = p.maxHp;
  p.dodgeChance = 0;
  p.critChance = 0; // deterministic damage
  return p;
}

function createMonsterAt(x, y, hp = 5000) {
  const m = new Monster('skeleton', x, y, 0);
  m.maxHp = hp;
  m.hp = hp;
  m.armor = 0; // no armor reduction for predictable damage
  return m;
}

// ── Whirlwind (skill index 0, type: 'spin') ──────────────────────

describe('Whirlwind (spin)', () => {
  let combat, player;

  beforeEach(() => {
    combat = new CombatSystem();
    player = createWarrior();
  });

  it('hits all monsters within radius (70px)', () => {
    const m1 = createMonsterAt(player.x + 30, player.y);
    const m2 = createMonsterAt(player.x, player.y + 50);
    const m3 = createMonsterAt(player.x - 60, player.y);

    const results = combat.playerSkill(player, 0, [m1, m2, m3], [player]);

    const hitTargets = new Set(
      results.filter(e => e.type === 'combat:hit').map(e => e.targetId)
    );
    expect(hitTargets.has(m1.id)).toBe(true);
    expect(hitTargets.has(m2.id)).toBe(true);
    expect(hitTargets.has(m3.id)).toBe(true);
  });

  it('deals 3 hits per monster (hits: 3)', () => {
    const m = createMonsterAt(player.x + 20, player.y);

    const results = combat.playerSkill(player, 0, [m], [player]);
    const hits = results.filter(e => e.type === 'combat:hit' && e.targetId === m.id);
    expect(hits).toHaveLength(3);
    // Verify hitIndex increments
    expect(hits[0].hitIndex).toBe(0);
    expect(hits[1].hitIndex).toBe(1);
    expect(hits[2].hitIndex).toBe(2);
  });

  it('does not hit monsters outside radius', () => {
    const near = createMonsterAt(player.x + 30, player.y);
    const far = createMonsterAt(player.x + 500, player.y);

    const results = combat.playerSkill(player, 0, [near, far], [player]);
    const hitTargets = results
      .filter(e => e.type === 'combat:hit')
      .map(e => e.targetId);
    expect(hitTargets).toContain(near.id);
    expect(hitTargets).not.toContain(far.id);
  });

  it('emits effect:spawn whirlwind event first', () => {
    const m = createMonsterAt(player.x + 20, player.y);

    const results = combat.playerSkill(player, 0, [m], [player]);
    expect(results[0].type).toBe('effect:spawn');
    expect(results[0].effectType).toBe('whirlwind');
    expect(results[0].playerId).toBe(player.id);
    expect(results[0].radius).toBe(70);
  });

  it('deducts correct MP (20) and sets cooldown (4000)', () => {
    const mpBefore = player.mp;
    combat.playerSkill(player, 0, [], [player]);
    expect(player.mp).toBe(mpBefore - 20);
    expect(player.skillCooldowns[0]).toBe(4000);
  });

  it('can kill a monster mid-spin (stops hitting dead monster)', () => {
    // Give monster low HP so it dies partway through the 3 hits
    const m = createMonsterAt(player.x + 20, player.y, 1);

    const results = combat.playerSkill(player, 0, [m], [player]);
    const hits = results.filter(e => e.type === 'combat:hit' && e.targetId === m.id);
    // Monster should die after first hit, so only 1 hit
    expect(hits.length).toBeLessThanOrEqual(2);
    expect(m.alive).toBe(false);
  });

  it('total damage approximately equals 3 * 0.6 * attackPower per monster', () => {
    const m = createMonsterAt(player.x + 20, player.y);

    const results = combat.playerSkill(player, 0, [m], [player]);
    const hits = results.filter(e => e.type === 'combat:hit' && e.targetId === m.id);
    const totalDamage = hits.reduce((sum, h) => sum + h.damage, 0);

    // Each hit: floor(attackPower * 0.6) then applyArmor (armor=0 so no reduction)
    // Warrior: str = 13, attackPower = 13 * 2 = 26, each hit = floor(26 * 0.6) = 15
    // total = 3 * 15 = 45 (but calcSkillDamage may apply minor adjustments)
    const expectedPerHit = Math.floor(player.attackPower * 0.6);
    const expectedTotal = expectedPerHit * 3;
    expect(totalDamage).toBe(expectedTotal);
  });
});

// ── Charging Strike (skill index 1, type: 'charge') ──────────────

describe('Charging Strike (charge)', () => {
  let combat, player;

  beforeEach(() => {
    combat = new CombatSystem();
    player = createWarrior();
    player.x = 400;
    player.y = 400;
  });

  it('dashes to nearest monster', () => {
    const m = createMonsterAt(500, 400);

    combat.playerSkill(player, 1, [m], [player]);
    // Player should have moved to monster's position
    expect(player.x).toBe(500);
    expect(player.y).toBe(400);
  });

  it('moves player position to target', () => {
    const m = createMonsterAt(550, 450);

    const startX = player.x;
    const startY = player.y;
    combat.playerSkill(player, 1, [m], [player]);

    expect(player.x).not.toBe(startX);
    expect(player.y).not.toBe(startY);
    expect(player.x).toBe(550);
    expect(player.y).toBe(450);
  });

  it('applies stun (2000ms) to primary target', () => {
    const m = createMonsterAt(500, 400);

    combat.playerSkill(player, 1, [m], [player]);
    expect(m.stunned).toBe(2000);
  });

  it('deals trail damage (0.5x) to monsters along path', () => {
    // executeCharge picks the NEAREST alive monster within range as target.
    // Trail hits only apply to monsters != target.
    // Target must be nearest to player. Trail monster must be further from player
    // but within trailRadius (40px) of a sample point on the path.
    //
    // Player at (400,400). Target at (420,400) — distance 20, nearest.
    // Trail at (410,435) — distance ~36 from player (further than target),
    // but only 35px from path midpoint (410,400), within trailRadius=40.
    const target = createMonsterAt(420, 400);
    const trail = createMonsterAt(410, 435);

    const trailHpBefore = trail.hp;
    combat.playerSkill(player, 1, [target, trail], [player]);

    expect(trail.hp).toBeLessThan(trailHpBefore);
    // Trail damage = floor(attackPower * 0.5)
    const expectedTrailDmg = Math.floor(player.attackPower * 0.5);
    expect(trailHpBefore - trail.hp).toBe(expectedTrailDmg);

    // Verify it's marked as trail hit in results
    const allEvents = combat.clearEvents();
    const trailHit = allEvents.find(e => e.type === 'combat:hit' && e.targetId === trail.id);
    expect(trailHit).toBeDefined();
    expect(trailHit.isTrail).toBe(true);
  });

  it('deals full damage (2.0x) to primary target', () => {
    const m = createMonsterAt(500, 400);

    const hpBefore = m.hp;
    combat.playerSkill(player, 1, [m], [player]);

    // Primary damage = floor(attackPower * 2.0) = floor(26 * 2.0) = 52
    const expectedDmg = Math.floor(player.attackPower * 2.0);
    expect(hpBefore - m.hp).toBe(expectedDmg);
  });

  it('emits charge_dash effect with from/to coordinates', () => {
    const m = createMonsterAt(500, 400);

    const startX = player.x;
    const startY = player.y;
    const results = combat.playerSkill(player, 1, [m], [player]);

    const dashEvent = results.find(e => e.type === 'effect:spawn' && e.effectType === 'charge_dash');
    expect(dashEvent).toBeDefined();
    expect(dashEvent.fromX).toBe(startX);
    expect(dashEvent.fromY).toBe(startY);
    expect(dashEvent.toX).toBe(500);
    expect(dashEvent.toY).toBe(400);
  });

  it('with no target dashes in facing direction', () => {
    player.facing = 'right';
    const startX = player.x;

    combat.playerSkill(player, 1, [], [player]);
    // range = 200, right direction
    // endX = 400 + 1 * 200 = 600, clamped to max 1904
    expect(player.x).toBe(startX + 200);
    expect(player.y).toBe(400);
  });

  it('trail does not hit the primary target twice', () => {
    const target = createMonsterAt(500, 400);

    const results = combat.playerSkill(player, 1, [target], [player]);
    const hitEvents = results.filter(e => e.type === 'combat:hit' && e.targetId === target.id);
    // Should only get 1 hit (the primary hit), not trail + primary
    expect(hitEvents).toHaveLength(1);
    expect(hitEvents[0].isTrail).toBeUndefined();
  });

  it('clamps to world bounds', () => {
    player.x = 1800;
    player.y = 1200;
    player.facing = 'right';

    combat.playerSkill(player, 1, [], [player]);
    // endX = 1800 + 200 = 2000, clamped to 1904
    // endY = 1200, stays (clamped to max 1264)
    expect(player.x).toBeLessThanOrEqual(1904);
    expect(player.y).toBeLessThanOrEqual(1264);
    expect(player.x).toBeGreaterThanOrEqual(16);
    expect(player.y).toBeGreaterThanOrEqual(16);
  });
});

// ── Battle Shout (skill index 2, type: 'buff_debuff') ────────────

describe('Battle Shout (buff_debuff)', () => {
  let combat, player;

  beforeEach(() => {
    combat = new CombatSystem();
    player = createWarrior();
    player.x = 400;
    player.y = 400;
  });

  it('buffs all party members (attack_up)', () => {
    const p2 = new Player('Ally', 'ranger');
    p2.recalcStats();

    combat.playerSkill(player, 2, [], [player, p2]);

    expect(player.buffs.some(b => b.effect === 'attack_up')).toBe(true);
    expect(p2.buffs.some(b => b.effect === 'attack_up')).toBe(true);
    // Verify duration
    const buff = player.buffs.find(b => b.effect === 'attack_up');
    expect(buff.duration).toBe(8000);
    expect(buff.remaining).toBe(8000);
  });

  it('fears monsters within radius (150px)', () => {
    const m1 = createMonsterAt(player.x + 100, player.y);
    const m2 = createMonsterAt(player.x, player.y + 120);

    combat.playerSkill(player, 2, [m1, m2], [player]);

    expect(m1.feared).toBe(1500);
    expect(m1.aiState).toBe(AI_STATES.FLEE);
    expect(m2.feared).toBe(1500);
    expect(m2.aiState).toBe(AI_STATES.FLEE);
  });

  it('does not fear monsters outside radius', () => {
    const nearM = createMonsterAt(player.x + 100, player.y);
    const farM = createMonsterAt(player.x + 500, player.y);

    combat.playerSkill(player, 2, [nearM, farM], [player]);

    expect(nearM.feared).toBe(1500);
    expect(farM.feared).toBe(0);
  });

  it('emits buff:apply for each player + debuff:apply for each feared monster', () => {
    const p2 = new Player('Ally', 'mage');
    p2.recalcStats();
    const m1 = createMonsterAt(player.x + 50, player.y);
    const m2 = createMonsterAt(player.x + 100, player.y);

    const results = combat.playerSkill(player, 2, [m1, m2], [player, p2]);

    const buffEvents = results.filter(e => e.type === 'buff:apply');
    const debuffEvents = results.filter(e => e.type === 'debuff:apply');

    expect(buffEvents).toHaveLength(2); // player + p2
    expect(buffEvents[0].effect).toBe('attack_up');
    expect(buffEvents[1].effect).toBe('attack_up');

    expect(debuffEvents).toHaveLength(2); // m1 + m2
    expect(debuffEvents[0].effect).toBe('fear');
    expect(debuffEvents[1].effect).toBe('fear');
    expect(debuffEvents[0].duration).toBe(1500);
  });

  it('emits battle_shout effect event', () => {
    const results = combat.playerSkill(player, 2, [], [player]);

    const effectEvent = results.find(
      e => e.type === 'effect:spawn' && e.effectType === 'battle_shout'
    );
    expect(effectEvent).toBeDefined();
    expect(effectEvent.playerId).toBe(player.id);
    expect(effectEvent.x).toBe(player.x);
    expect(effectEvent.y).toBe(player.y);
    expect(effectEvent.radius).toBe(150);
  });
});

// ── Fear mechanic (monsters.js) ──────────────────────────────────

describe('Fear mechanic', () => {
  it('applyFear sets feared timer', () => {
    const m = new Monster('skeleton', 100, 100, 0);
    m.applyFear(2000);
    expect(m.feared).toBe(2000);
  });

  it('applyFear forces FLEE state', () => {
    const m = new Monster('skeleton', 100, 100, 0);
    m.aiState = AI_STATES.ATTACK;
    m.applyFear(2000);
    expect(m.aiState).toBe(AI_STATES.FLEE);
  });

  it('applyFear does not override higher existing fear', () => {
    const m = new Monster('skeleton', 100, 100, 0);
    m.applyFear(3000);
    m.applyFear(1000);
    expect(m.feared).toBe(3000);
  });

  it('applyFear does not change DEAD state', () => {
    const m = new Monster('skeleton', 100, 100, 0);
    m.alive = false;
    m.aiState = AI_STATES.DEAD;
    m.applyFear(2000);
    expect(m.aiState).toBe(AI_STATES.DEAD);
  });

  it('fear timer decrements over time (monster.update with dt)', () => {
    const m = new Monster('skeleton', 100, 100, 0);
    m.maxHp = 5000;
    m.hp = 5000;
    m.applyFear(2000);

    // Need a player nearby so the update has someone to flee from
    const fakePlayer = { id: 'p1', alive: true, x: 100, y: 100 };
    m.update(500, [fakePlayer]);

    expect(m.feared).toBe(1500);
    expect(m.aiState).toBe(AI_STATES.FLEE);
  });

  it('feared monster stays in FLEE even if HP > 30%', () => {
    const m = new Monster('skeleton', 100, 100, 0);
    m.maxHp = 5000;
    m.hp = 5000; // 100% HP — well above the 30% flee threshold
    m.applyFear(2000);

    const fakePlayer = { id: 'p1', alive: true, x: 200, y: 200 };
    m.update(500, [fakePlayer]);

    expect(m.aiState).toBe(AI_STATES.FLEE);
    expect(m.feared).toBe(1500);
  });

  it('fear expires then monster returns to ALERT', () => {
    const m = new Monster('skeleton', 100, 100, 0);
    m.maxHp = 5000;
    m.hp = 5000;
    m.applyFear(1000);

    const fakePlayer = { id: 'p1', alive: true, x: 200, y: 200 };
    // Tick past fear duration
    m.update(1000, [fakePlayer]);

    expect(m.feared).toBe(0);
    expect(m.aiState).toBe(AI_STATES.ALERT);
  });

  it('feared field appears in serialize()', () => {
    const m = new Monster('skeleton', 100, 100, 0);
    m.applyFear(2500);

    const data = m.serialize();
    expect(data).toHaveProperty('feared');
    expect(data.feared).toBe(2500);
  });

  it('serialize() shows feared = 0 when not feared', () => {
    const m = new Monster('skeleton', 100, 100, 0);
    const data = m.serialize();
    expect(data.feared).toBe(0);
  });
});
