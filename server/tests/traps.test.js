import { describe, it, expect, beforeEach, vi } from 'vitest';
import { createRequire } from 'module';
const require = createRequire(import.meta.url);
const { Trap, TRAP_DEFS, ZONE_TRAP_POOLS, generateTrapsForRoom } = require('../game/traps');
const { Player } = require('../game/player');

// ── Helpers ──

function makePlayer(overrides = {}) {
  const p = new Player('TestHero', 'warrior');
  p.hp = 200;
  p.maxHp = 200;
  p.x = 100;
  p.y = 100;
  Object.assign(p, overrides);
  return p;
}

function makeTrap(type = 'spike', x = 100, y = 100) {
  return new Trap(type, x, y);
}

// ── TRAP_DEFS ──

describe('TRAP_DEFS', () => {
  it('defines 4 trap types', () => {
    expect(Object.keys(TRAP_DEFS)).toHaveLength(4);
    expect(TRAP_DEFS).toHaveProperty('spike');
    expect(TRAP_DEFS).toHaveProperty('fire');
    expect(TRAP_DEFS).toHaveProperty('poison');
    expect(TRAP_DEFS).toHaveProperty('void');
  });

  it('each trap has required fields', () => {
    for (const [key, def] of Object.entries(TRAP_DEFS)) {
      expect(def.name).toBeTruthy();
      expect(typeof def.damage).toBe('number');
      expect(def.damage).toBeGreaterThan(0);
      expect(typeof def.damageType).toBe('string');
      expect(typeof def.effect).toBe('string');
      expect(typeof def.effectDuration).toBe('number');
      expect(def.effectDuration).toBeGreaterThan(0);
      expect(def.cooldown).toBe(5000);
      expect(def.radius).toBe(20);
    }
  });

  it('spike deals physical + stun', () => {
    expect(TRAP_DEFS.spike.damage).toBe(15);
    expect(TRAP_DEFS.spike.damageType).toBe('physical');
    expect(TRAP_DEFS.spike.effect).toBe('stun');
  });

  it('fire deals fire + burning', () => {
    expect(TRAP_DEFS.fire.damage).toBe(20);
    expect(TRAP_DEFS.fire.damageType).toBe('fire');
    expect(TRAP_DEFS.fire.effect).toBe('burning');
  });

  it('poison deals poison + poison DoT', () => {
    expect(TRAP_DEFS.poison.damage).toBe(10);
    expect(TRAP_DEFS.poison.damageType).toBe('poison');
    expect(TRAP_DEFS.poison.effect).toBe('poison');
  });

  it('void deals cold + slow', () => {
    expect(TRAP_DEFS.void.damage).toBe(25);
    expect(TRAP_DEFS.void.damageType).toBe('cold');
    expect(TRAP_DEFS.void.effect).toBe('slow');
  });
});

// ── ZONE_TRAP_POOLS ──

describe('ZONE_TRAP_POOLS', () => {
  it('defines pools for all 3 zones', () => {
    expect(ZONE_TRAP_POOLS).toHaveProperty('catacombs');
    expect(ZONE_TRAP_POOLS).toHaveProperty('inferno');
    expect(ZONE_TRAP_POOLS).toHaveProperty('abyss');
  });

  it('catacombs has spike and poison', () => {
    expect(ZONE_TRAP_POOLS.catacombs).toContain('spike');
    expect(ZONE_TRAP_POOLS.catacombs).toContain('poison');
    expect(ZONE_TRAP_POOLS.catacombs).not.toContain('fire');
    expect(ZONE_TRAP_POOLS.catacombs).not.toContain('void');
  });

  it('inferno has fire and spike', () => {
    expect(ZONE_TRAP_POOLS.inferno).toContain('fire');
    expect(ZONE_TRAP_POOLS.inferno).toContain('spike');
  });

  it('abyss has void and poison', () => {
    expect(ZONE_TRAP_POOLS.abyss).toContain('void');
    expect(ZONE_TRAP_POOLS.abyss).toContain('poison');
  });

  it('all pool entries reference valid TRAP_DEFS keys', () => {
    for (const pool of Object.values(ZONE_TRAP_POOLS)) {
      for (const type of pool) {
        expect(TRAP_DEFS).toHaveProperty(type);
      }
    }
  });
});

// ── Trap Constructor ──

describe('Trap constructor', () => {
  it('creates a trap with id, type, position', () => {
    const trap = makeTrap('fire', 200, 300);
    expect(trap.id).toBeTruthy();
    expect(typeof trap.id).toBe('string');
    expect(trap.type).toBe('fire');
    expect(trap.x).toBe(200);
    expect(trap.y).toBe(300);
    expect(trap.def).toBe(TRAP_DEFS.fire);
  });

  it('has empty triggered Map', () => {
    const trap = makeTrap();
    expect(trap.triggered).toBeInstanceOf(Map);
    expect(trap.triggered.size).toBe(0);
  });

  it('each instance gets unique id', () => {
    const a = makeTrap('spike', 0, 0);
    const b = makeTrap('spike', 0, 0);
    expect(a.id).not.toBe(b.id);
  });
});

// ── canTrigger ──

describe('Trap.canTrigger', () => {
  it('returns true when player is within radius', () => {
    const trap = makeTrap('spike', 100, 100);
    const player = makePlayer({ x: 110, y: 100 }); // 10px away, radius=20
    expect(trap.canTrigger(player)).toBe(true);
  });

  it('returns false when player is outside radius', () => {
    const trap = makeTrap('spike', 100, 100);
    const player = makePlayer({ x: 200, y: 200 }); // far away
    expect(trap.canTrigger(player)).toBe(false);
  });

  it('returns false when player is exactly at radius edge + epsilon', () => {
    const trap = makeTrap('spike', 100, 100);
    // 21px away (just outside radius=20)
    const player = makePlayer({ x: 121, y: 100 });
    expect(trap.canTrigger(player)).toBe(false);
  });

  it('returns true when player is exactly on trap position', () => {
    const trap = makeTrap('spike', 100, 100);
    const player = makePlayer({ x: 100, y: 100 });
    expect(trap.canTrigger(player)).toBe(true);
  });

  it('respects cooldown after trigger', () => {
    const trap = makeTrap('spike', 100, 100);
    const player = makePlayer({ x: 100, y: 100 });

    // First trigger
    trap.trigger(player);

    // Should be on cooldown now
    expect(trap.canTrigger(player)).toBe(false);
  });

  it('allows trigger after cooldown expires', () => {
    const trap = makeTrap('spike', 100, 100);
    const player = makePlayer({ x: 100, y: 100 });

    // Manually set triggered time to past
    trap.triggered.set(player.id, Date.now() - 6000); // 6s ago, cooldown is 5s

    expect(trap.canTrigger(player)).toBe(true);
  });

  it('tracks cooldowns per-player independently', () => {
    const trap = makeTrap('spike', 100, 100);
    const p1 = makePlayer({ x: 100, y: 100 });
    const p2 = new Player('Player2', 'mage');
    p2.x = 100;
    p2.y = 100;

    trap.trigger(p1);

    // p1 on cooldown, p2 should still be triggerable
    expect(trap.canTrigger(p1)).toBe(false);
    expect(trap.canTrigger(p2)).toBe(true);
  });
});

// ── trigger ──

describe('Trap.trigger', () => {
  it('deals damage to player', () => {
    const trap = makeTrap('spike', 100, 100);
    const player = makePlayer({ x: 100, y: 100, hp: 200, maxHp: 200 });
    const hpBefore = player.hp;

    const result = trap.trigger(player);

    expect(player.hp).toBeLessThan(hpBefore);
    expect(result.damage).toBeGreaterThan(0);
  });

  it('returns correct result structure', () => {
    const trap = makeTrap('fire', 150, 250);
    const player = makePlayer({ x: 150, y: 250 });

    const result = trap.trigger(player);

    expect(result.trapId).toBe(trap.id);
    expect(result.trapType).toBe('fire');
    expect(result.trapName).toBe('Fire Grate');
    expect(result.playerId).toBe(player.id);
    expect(result.playerName).toBe('TestHero');
    expect(typeof result.damage).toBe('number');
    expect(typeof result.dodged).toBe('boolean');
    expect(result.effect).toBe('burning');
    expect(result.effectDuration).toBe(3000);
    expect(result.x).toBe(150);
    expect(result.y).toBe(250);
  });

  it('applies debuff to living player', () => {
    const trap = makeTrap('void', 100, 100);
    const player = makePlayer({ x: 100, y: 100 });

    // Player should have debuffs array/mechanism
    trap.trigger(player);

    // Check that debuffs were applied (player.debuffs should have entries)
    expect(player.debuffs.length).toBeGreaterThan(0);
  });

  it('records trigger timestamp for cooldown', () => {
    const trap = makeTrap('spike', 100, 100);
    const player = makePlayer({ x: 100, y: 100 });

    expect(trap.triggered.has(player.id)).toBe(false);
    trap.trigger(player);
    expect(trap.triggered.has(player.id)).toBe(true);
    expect(typeof trap.triggered.get(player.id)).toBe('number');
  });

  it('spike applies stun (slow with speedMult 0)', () => {
    const trap = makeTrap('spike', 100, 100);
    const player = makePlayer({ x: 100, y: 100 });

    trap.trigger(player);

    const slowDebuff = player.debuffs.find(d => d.source === 'trap_stun');
    expect(slowDebuff).toBeTruthy();
    expect(slowDebuff.effect).toBe('slow');
    expect(slowDebuff.speedMult).toBe(0);
  });

  it('fire applies burning (fire_dot)', () => {
    const trap = makeTrap('fire', 100, 100);
    const player = makePlayer({ x: 100, y: 100 });

    trap.trigger(player);

    const burnDebuff = player.debuffs.find(d => d.source === 'trap_burning');
    expect(burnDebuff).toBeTruthy();
    expect(burnDebuff.effect).toBe('fire_dot');
    expect(burnDebuff.damage).toBe(3);
  });

  it('poison applies poison DoT (fire_dot with 2 dmg)', () => {
    const trap = makeTrap('poison', 100, 100);
    const player = makePlayer({ x: 100, y: 100 });

    trap.trigger(player);

    const poisonDebuff = player.debuffs.find(d => d.source === 'trap_poison');
    expect(poisonDebuff).toBeTruthy();
    expect(poisonDebuff.effect).toBe('fire_dot');
    expect(poisonDebuff.damage).toBe(2);
  });

  it('void applies slow (speedMult 0.5)', () => {
    const trap = makeTrap('void', 100, 100);
    const player = makePlayer({ x: 100, y: 100 });

    trap.trigger(player);

    const slowDebuff = player.debuffs.find(d => d.source === 'trap_slow');
    expect(slowDebuff).toBeTruthy();
    expect(slowDebuff.effect).toBe('slow');
    expect(slowDebuff.speedMult).toBe(0.5);
  });

  it('does not apply debuff to dead player', () => {
    const trap = makeTrap('spike', 100, 100);
    const player = makePlayer({ x: 100, y: 100, hp: 1 });
    // takeDamage may kill the player (hp→0 → die())
    // spike does 15 physical damage, player has 1 hp → should die
    const debuffsBefore = player.debuffs.length;

    trap.trigger(player);

    // Player should be dead or dying, debuff should NOT be applied
    // (the code checks player.alive before applying debuff)
    if (!player.alive) {
      // If dead, no new debuffs should be added after death
      // (debuffs were only applied if player.alive was true after damage)
      expect(player.debuffs.length).toBe(debuffsBefore);
    }
  });
});

// ── serialize ──

describe('Trap.serialize', () => {
  it('returns correct format', () => {
    const trap = makeTrap('poison', 123.7, 456.2);
    const s = trap.serialize();

    expect(s.id).toBe(trap.id);
    expect(s.type).toBe('poison');
    expect(s.name).toBe('Poison Pool');
    expect(s.x).toBe(124); // Math.round
    expect(s.y).toBe(456); // Math.round
    expect(s.radius).toBe(20);
  });

  it('does not expose triggered map or def internals', () => {
    const trap = makeTrap('spike', 100, 100);
    const s = trap.serialize();

    expect(s).not.toHaveProperty('triggered');
    expect(s).not.toHaveProperty('def');
    expect(s).not.toHaveProperty('damage');
    expect(s).not.toHaveProperty('cooldown');
  });
});

// ── generateTrapsForRoom ──

describe('generateTrapsForRoom', () => {
  const room = { x: 5, y: 5, w: 10, h: 8 };
  const tileSize = 32;

  it('generates 2-4 traps', () => {
    // Run multiple times to cover randomness
    for (let i = 0; i < 20; i++) {
      const traps = generateTrapsForRoom(room, 'catacombs', tileSize);
      expect(traps.length).toBeGreaterThanOrEqual(2);
      expect(traps.length).toBeLessThanOrEqual(4);
    }
  });

  it('returns Trap instances', () => {
    const traps = generateTrapsForRoom(room, 'catacombs', tileSize);
    for (const trap of traps) {
      expect(trap).toBeInstanceOf(Trap);
      expect(trap.id).toBeTruthy();
      expect(trap.def).toBeTruthy();
    }
  });

  it('uses zone-specific trap types', () => {
    // Catacombs should only have spike and poison
    for (let i = 0; i < 30; i++) {
      const traps = generateTrapsForRoom(room, 'catacombs', tileSize);
      for (const trap of traps) {
        expect(['spike', 'poison']).toContain(trap.type);
      }
    }
  });

  it('inferno uses fire and spike', () => {
    for (let i = 0; i < 30; i++) {
      const traps = generateTrapsForRoom(room, 'inferno', tileSize);
      for (const trap of traps) {
        expect(['fire', 'spike']).toContain(trap.type);
      }
    }
  });

  it('abyss uses void and poison', () => {
    for (let i = 0; i < 30; i++) {
      const traps = generateTrapsForRoom(room, 'abyss', tileSize);
      for (const trap of traps) {
        expect(['void', 'poison']).toContain(trap.type);
      }
    }
  });

  it('traps are placed within room boundaries', () => {
    for (let i = 0; i < 20; i++) {
      const traps = generateTrapsForRoom(room, 'inferno', tileSize);
      for (const trap of traps) {
        // Interior: (room.x + 1) * tileSize to (room.x + room.w - 1) * tileSize
        expect(trap.x).toBeGreaterThanOrEqual((room.x + 1) * tileSize);
        expect(trap.x).toBeLessThanOrEqual((room.x + room.w - 1) * tileSize);
        expect(trap.y).toBeGreaterThanOrEqual((room.y + 1) * tileSize);
        expect(trap.y).toBeLessThanOrEqual((room.y + room.h - 1) * tileSize);
      }
    }
  });

  it('falls back to spike+poison for unknown zone', () => {
    const traps = generateTrapsForRoom(room, 'unknown_zone', tileSize);
    for (const trap of traps) {
      expect(['spike', 'poison']).toContain(trap.type);
    }
  });

  it('each trap gets unique id', () => {
    const traps = generateTrapsForRoom(room, 'catacombs', tileSize);
    const ids = traps.map(t => t.id);
    expect(new Set(ids).size).toBe(ids.length);
  });
});

// ── World integration ──

describe('World trap integration', () => {
  const { World } = require('../game/world');

  it('world.traps is initialized as empty array', () => {
    const world = new World();
    expect(world.traps).toEqual([]);
  });

  it('generateFloor populates traps', () => {
    const world = new World();
    world.generateFloor(0);
    expect(world.traps.length).toBeGreaterThan(0);
  });

  it('no traps in start or boss rooms', () => {
    const world = new World();
    world.generateFloor(1); // floor 2 has a boss room

    const startRoom = world.rooms.find(r => r.type === 'start');
    const bossRoom = world.rooms.find(r => r.type === 'boss');

    if (startRoom) {
      const startTraps = world.getTrapsInRoom(startRoom);
      expect(startTraps.length).toBe(0);
    }
    if (bossRoom) {
      const bossTraps = world.getTrapsInRoom(bossRoom);
      expect(bossTraps.length).toBe(0);
    }
  });

  it('monster/treasure rooms have traps', () => {
    const world = new World();
    world.generateFloor(0);

    const monsterRoom = world.rooms.find(r => r.type === 'monster');
    if (monsterRoom) {
      const traps = world.getTrapsInRoom(monsterRoom);
      expect(traps.length).toBeGreaterThan(0);
    }
  });

  it('traps are serialized in world.serialize()', () => {
    const world = new World();
    world.generateFloor(0);

    const serialized = world.serialize();
    expect(serialized).toHaveProperty('traps');
    expect(Array.isArray(serialized.traps)).toBe(true);
    expect(serialized.traps.length).toBeGreaterThan(0);

    // Check serialized format
    const t = serialized.traps[0];
    expect(t).toHaveProperty('id');
    expect(t).toHaveProperty('type');
    expect(t).toHaveProperty('name');
    expect(t).toHaveProperty('x');
    expect(t).toHaveProperty('y');
    expect(t).toHaveProperty('radius');
  });

  it('traps reset on new floor generation', () => {
    const world = new World();
    world.generateFloor(0);
    const floor0TrapIds = world.traps.map(t => t.id);

    world.generateFloor(1);
    const floor1TrapIds = world.traps.map(t => t.id);

    // No overlap in IDs
    const overlap = floor0TrapIds.filter(id => floor1TrapIds.includes(id));
    expect(overlap.length).toBe(0);
  });

  it('getTrapsInRoom returns empty for null room', () => {
    const world = new World();
    world.generateFloor(0);
    expect(world.getTrapsInRoom(null)).toEqual([]);
  });
});

// ── Player.applyDebuff ──

describe('Player.applyDebuff', () => {
  it('adds stun debuff', () => {
    const p = makePlayer();
    p.applyDebuff('stun', 500);
    const d = p.debuffs.find(d => d.source === 'trap_stun');
    expect(d).toBeTruthy();
    expect(d.effect).toBe('slow');
    expect(d.speedMult).toBe(0);
    expect(d.ticksRemaining).toBeGreaterThan(0);
  });

  it('adds burning debuff', () => {
    const p = makePlayer();
    p.applyDebuff('burning', 3000);
    const d = p.debuffs.find(d => d.source === 'trap_burning');
    expect(d).toBeTruthy();
    expect(d.effect).toBe('fire_dot');
    expect(d.damage).toBe(3);
  });

  it('adds poison debuff', () => {
    const p = makePlayer();
    p.applyDebuff('poison', 5000);
    const d = p.debuffs.find(d => d.source === 'trap_poison');
    expect(d).toBeTruthy();
    expect(d.effect).toBe('fire_dot');
    expect(d.damage).toBe(2);
  });

  it('adds slow debuff', () => {
    const p = makePlayer();
    p.applyDebuff('slow', 3000);
    const d = p.debuffs.find(d => d.source === 'trap_slow');
    expect(d).toBeTruthy();
    expect(d.effect).toBe('slow');
    expect(d.speedMult).toBe(0.5);
  });

  it('calculates ticks from duration correctly', () => {
    const p = makePlayer();
    p.applyDebuff('stun', 1000); // 1000ms / 500ms tick = 2 ticks
    const d = p.debuffs.find(d => d.source === 'trap_stun');
    expect(d.ticksRemaining).toBe(2);
  });

  it('minimum 1 tick for very short durations', () => {
    const p = makePlayer();
    p.applyDebuff('stun', 100); // 100ms / 500ms = 0.2, ceil = 1
    const d = p.debuffs.find(d => d.source === 'trap_stun');
    expect(d.ticksRemaining).toBeGreaterThanOrEqual(1);
  });
});

// ── Integration: full trap→player flow ──

describe('Integration: trap triggers on player', () => {
  it('spike trap full flow: damage + stun + cooldown', () => {
    const trap = makeTrap('spike', 100, 100);
    const player = makePlayer({ x: 105, y: 100, hp: 200 });

    // Can trigger
    expect(trap.canTrigger(player)).toBe(true);

    // Trigger
    const result = trap.trigger(player);
    expect(result.damage).toBeGreaterThan(0);
    expect(result.trapType).toBe('spike');
    expect(player.hp).toBeLessThan(200);

    // Debuff applied
    expect(player.debuffs.some(d => d.source === 'trap_stun')).toBe(true);

    // On cooldown
    expect(trap.canTrigger(player)).toBe(false);
  });

  it('multiple traps can trigger on same player', () => {
    const trap1 = makeTrap('spike', 100, 100);
    const trap2 = makeTrap('fire', 100, 100);
    const player = makePlayer({ x: 100, y: 100, hp: 200 });

    trap1.trigger(player);
    const hpAfterFirst = player.hp;
    trap2.trigger(player);

    expect(player.hp).toBeLessThan(hpAfterFirst);
    expect(player.debuffs.length).toBeGreaterThanOrEqual(2);
  });

  it('trap can kill a player', () => {
    const trap = makeTrap('void', 100, 100); // 25 cold damage
    const player = makePlayer({ x: 100, y: 100, hp: 1, maxHp: 200 });

    trap.trigger(player);

    // Player should be dead or dying
    expect(player.hp).toBeLessThanOrEqual(0);
  });
});
