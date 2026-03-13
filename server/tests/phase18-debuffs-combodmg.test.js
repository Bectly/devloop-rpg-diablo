import { describe, it, expect, beforeEach } from 'vitest';
import { createRequire } from 'module';
const require = createRequire(import.meta.url);

const { Player } = require('../game/player');

// ── Helpers ────────────────────────────────────────────────────────

function createPlayer(name = 'TestPlayer', cls = 'warrior') {
  const p = new Player(name, cls);
  p.level = 10;
  p.recalcStats();
  p.hp = p.maxHp;
  p.mp = p.maxMp;
  return p;
}

// ── addDebuff ──────────────────────────────────────────────────────

describe('Player.addDebuff', () => {
  let player;

  beforeEach(() => {
    player = createPlayer();
  });

  it('adds a debuff to the debuffs array', () => {
    player.addDebuff({ effect: 'fire_dot', damage: 5, ticksRemaining: 10, source: 'monster1' });
    expect(player.debuffs).toHaveLength(1);
    expect(player.debuffs[0].effect).toBe('fire_dot');
  });

  it('replaces existing debuff from same source + effect', () => {
    player.addDebuff({ effect: 'fire_dot', damage: 5, ticksRemaining: 10, source: 'monster1' });
    player.addDebuff({ effect: 'fire_dot', damage: 8, ticksRemaining: 20, source: 'monster1' });
    expect(player.debuffs).toHaveLength(1);
    expect(player.debuffs[0].damage).toBe(8);
    expect(player.debuffs[0].ticksRemaining).toBe(20);
  });

  it('allows same effect from different sources', () => {
    player.addDebuff({ effect: 'fire_dot', damage: 5, ticksRemaining: 10, source: 'monster1' });
    player.addDebuff({ effect: 'fire_dot', damage: 3, ticksRemaining: 10, source: 'monster2' });
    expect(player.debuffs).toHaveLength(2);
  });

  it('allows different effects from same source', () => {
    player.addDebuff({ effect: 'fire_dot', damage: 5, ticksRemaining: 10, source: 'monster1' });
    player.addDebuff({ effect: 'slow', speedMult: 0.7, ticksRemaining: 10, source: 'monster1' });
    expect(player.debuffs).toHaveLength(2);
  });
});

// ── processDebuffs ─────────────────────────────────────────────────

describe('Player.processDebuffs', () => {
  let player;

  beforeEach(() => {
    player = createPlayer();
  });

  it('returns 0 when no debuffs', () => {
    expect(player.processDebuffs()).toBe(0);
  });

  it('returns fire_dot damage and decrements ticks', () => {
    player.addDebuff({ effect: 'fire_dot', damage: 5, ticksRemaining: 3, source: 'test' });
    const dmg = player.processDebuffs();
    expect(dmg).toBe(5);
    expect(player.debuffs[0].ticksRemaining).toBe(2);
  });

  it('accumulates damage from multiple fire_dots', () => {
    player.addDebuff({ effect: 'fire_dot', damage: 5, ticksRemaining: 3, source: 'a' });
    player.addDebuff({ effect: 'fire_dot', damage: 3, ticksRemaining: 3, source: 'b' });
    const dmg = player.processDebuffs();
    expect(dmg).toBe(8);
  });

  it('removes debuffs when ticks reach 0', () => {
    player.addDebuff({ effect: 'fire_dot', damage: 5, ticksRemaining: 1, source: 'test' });
    player.processDebuffs(); // ticks: 1 → 0
    expect(player.debuffs).toHaveLength(0);
  });

  it('slow debuff decrements but deals no damage', () => {
    player.addDebuff({ effect: 'slow', speedMult: 0.5, ticksRemaining: 3, source: 'test' });
    const dmg = player.processDebuffs();
    expect(dmg).toBe(0);
    expect(player.debuffs[0].ticksRemaining).toBe(2);
  });

  it('slow + fire_dot together: only fire_dot deals damage', () => {
    player.addDebuff({ effect: 'fire_dot', damage: 5, ticksRemaining: 3, source: 'a' });
    player.addDebuff({ effect: 'slow', speedMult: 0.5, ticksRemaining: 3, source: 'b' });
    const dmg = player.processDebuffs();
    expect(dmg).toBe(5);
    expect(player.debuffs).toHaveLength(2);
  });
});

// ── speedMultiplier ────────────────────────────────────────────────

describe('Player.speedMultiplier', () => {
  let player;

  beforeEach(() => {
    player = createPlayer();
  });

  it('returns 1.0 with no debuffs', () => {
    expect(player.speedMultiplier).toBe(1.0);
  });

  it('returns slow speedMult when slowed', () => {
    player.addDebuff({ effect: 'slow', speedMult: 0.5, ticksRemaining: 10, source: 'test' });
    expect(player.speedMultiplier).toBe(0.5);
  });

  it('returns 0 when stunned via slow', () => {
    player.addDebuff({ effect: 'slow', speedMult: 0, ticksRemaining: 10, source: 'stun' });
    expect(player.speedMultiplier).toBe(0);
  });

  it('fire_dot does not affect speed', () => {
    player.addDebuff({ effect: 'fire_dot', damage: 5, ticksRemaining: 10, source: 'test' });
    expect(player.speedMultiplier).toBe(1.0);
  });
});

// ── applyDebuff ────────────────────────────────────────────────────

describe('Player.applyDebuff', () => {
  let player;

  beforeEach(() => {
    player = createPlayer();
  });

  it('stun applies slow with speedMult 0', () => {
    player.applyDebuff('stun', 2000);
    expect(player.debuffs).toHaveLength(1);
    expect(player.debuffs[0].effect).toBe('slow');
    expect(player.debuffs[0].speedMult).toBe(0);
    expect(player.debuffs[0].source).toBe('trap_stun');
  });

  it('burning applies fire_dot', () => {
    player.applyDebuff('burning', 3000);
    expect(player.debuffs).toHaveLength(1);
    expect(player.debuffs[0].effect).toBe('fire_dot');
    expect(player.debuffs[0].damage).toBe(3);
  });

  it('poison applies fire_dot with lower damage', () => {
    player.applyDebuff('poison', 3000);
    expect(player.debuffs).toHaveLength(1);
    expect(player.debuffs[0].effect).toBe('fire_dot');
    expect(player.debuffs[0].damage).toBe(2);
  });

  it('slow applies slow with 50% speed', () => {
    player.applyDebuff('slow', 2000);
    expect(player.debuffs).toHaveLength(1);
    expect(player.debuffs[0].effect).toBe('slow');
    expect(player.debuffs[0].speedMult).toBe(0.5);
  });

  it('unknown effect is silently ignored', () => {
    player.applyDebuff('unknown', 1000);
    expect(player.debuffs).toHaveLength(0);
  });

  it('ticks scale with duration', () => {
    player.applyDebuff('burning', 5000); // 5s / 500ms = 10 ticks
    expect(player.debuffs[0].ticksRemaining).toBe(10);
  });
});

// ── Debuff serialization ───────────────────────────────────────────

describe('Debuff serialization', () => {
  it('serialize() includes debuffs', () => {
    const player = createPlayer();
    player.addDebuff({ effect: 'fire_dot', damage: 5, ticksRemaining: 10, source: 'test' });
    const data = player.serialize();
    expect(data.debuffs).toHaveLength(1);
    expect(data.debuffs[0].effect).toBe('fire_dot');
    expect(data.debuffs[0].ticksRemaining).toBe(10);
  });

  it('serializeForPhone() includes debuffs', () => {
    const player = createPlayer();
    player.addDebuff({ effect: 'slow', speedMult: 0.5, ticksRemaining: 5, source: 'test' });
    const data = player.serializeForPhone();
    expect(data.debuffs).toHaveLength(1);
    expect(data.debuffs[0].effect).toBe('slow');
  });

  it('debuffs do not include source in serialized output', () => {
    const player = createPlayer();
    player.addDebuff({ effect: 'fire_dot', damage: 5, ticksRemaining: 3, source: 'secret' });
    const data = player.serialize();
    expect(data.debuffs[0].source).toBeUndefined();
  });
});

// ── Combo damage patterns (unit-testable logic) ────────────────────

describe('Combo damage logic patterns', () => {
  // Test the radius check pattern used in combo damage application
  function monstersInRadius(monsters, cx, cy, radius) {
    const r2 = radius * radius;
    return monsters.filter(m => {
      if (!m.alive) return false;
      const dx = m.x - cx, dy = m.y - cy;
      return dx * dx + dy * dy <= r2;
    });
  }

  it('radius check finds monsters within range', () => {
    const monsters = [
      { id: 'a', x: 110, y: 100, alive: true },  // 10px away
      { id: 'b', x: 300, y: 300, alive: true },  // far away
      { id: 'c', x: 100, y: 100, alive: false },  // dead
    ];
    const result = monstersInRadius(monsters, 100, 100, 50);
    expect(result).toHaveLength(1);
    expect(result[0].id).toBe('a');
  });

  it('shatter_blast damage formula', () => {
    const eventDamage = 80;
    const monsterArmor = 10;
    const dealt = Math.max(1, eventDamage - monsterArmor * 0.4);
    expect(dealt).toBe(76);
  });

  it('chain_reaction base damage', () => {
    const monsterArmor = 20;
    const dealt = Math.max(1, 30 - monsterArmor * 0.4);
    expect(dealt).toBe(22);
  });

  it('chain_reaction minimum damage is 1', () => {
    const monsterArmor = 100;
    const dealt = Math.max(1, 30 - monsterArmor * 0.4);
    expect(dealt).toBe(1);
  });

  it('battle_fury pull moves monster toward center', () => {
    const monster = { x: 140, y: 100 }; // 40px to the right
    const cx = 100, cy = 100;
    const dx = monster.x - cx, dy = monster.y - cy;
    const dist = Math.sqrt(dx * dx + dy * dy) || 1;
    const pull = Math.min(40, dist);
    monster.x -= (dx / dist) * pull;
    monster.y -= (dy / dist) * pull;
    expect(monster.x).toBe(100); // pulled to center
    expect(monster.y).toBe(100);
  });

  it('firestorm stun uses Math.max to not reduce existing stun', () => {
    const existing = 5000;
    const comboStun = 3000;
    const result = Math.max(existing, comboStun);
    expect(result).toBe(5000); // keeps longer stun
  });

  it('firestorm stun applies when no existing stun', () => {
    const existing = 0;
    const comboStun = 3000;
    const result = Math.max(existing, comboStun);
    expect(result).toBe(3000);
  });
});
