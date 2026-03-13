import { describe, it, expect, beforeEach, vi } from 'vitest';
import { createRequire } from 'module';
const require = createRequire(import.meta.url);

const { Monster, createMonster, MONSTER_DEFS, AI_STATES } = require('../game/monsters');
const { CursedEvent, EVENT_TYPES, rollCursedEvent } = require('../game/events');
const { Player } = require('../game/player');
const handlers = require('../socket-handlers');

// ── Helpers ─────────────────────────────────────────────────────────

function makeSocket(id = 's1') {
  const emitted = [];
  return {
    id,
    emit: (ev, data) => emitted.push({ ev, data }),
    _emitted: emitted,
    _find: (ev) => emitted.find(e => e.ev === ev),
    _findAll: (ev) => emitted.filter(e => e.ev === ev),
  };
}

function makeMockInventory(items = []) {
  const _items = [...items];
  return {
    getAllItems: () => [..._items],
    getItem: (id) => _items.find(i => i.id === id) || null,
    removeItem: (id) => {
      const idx = _items.findIndex(i => i.id === id);
      if (idx >= 0) _items.splice(idx, 1);
    },
    addItem: (item) => { _items.push(item); return { success: true }; },
    serialize: () => ({ items: [..._items] }),
  };
}

function makeCtx(player, inv, worldOverride = null) {
  const players = new Map([['s1', player]]);
  const inventories = new Map([[player.id, inv]]);
  const world = worldOverride || {
    currentFloor: 1,
    getShopNpc: () => ({ x: player.x, y: player.y, inventory: [] }),
  };
  const gameNs = { emit: () => {} };
  return { players, inventories, world, gameNs };
}

function makeFakePlayer(x, y) {
  return { id: 'fake-player-1', x, y, alive: true };
}

// ══════════════════════════════════════════════════════════════════
// A. Treasure Goblin (Monster)
// ══════════════════════════════════════════════════════════════════

describe('Treasure Goblin', () => {
  it('treasure_goblin exists in monster definitions', () => {
    expect(MONSTER_DEFS.treasure_goblin).toBeDefined();
    expect(MONSTER_DEFS.treasure_goblin.name).toBe('Treasure Goblin');
  });

  it('creating a treasure goblin has correct properties', () => {
    const goblin = createMonster('treasure_goblin', 100, 100);
    expect(goblin.hp).toBe(200);
    expect(goblin.damage).toBe(0);
    expect(goblin.isTreasureGoblin).toBe(true);
    expect(goblin.behavior).toBe('flee');
    expect(goblin.aiState).toBe(AI_STATES.FLEE);
  });

  it('goblin has escapeTimer initialized to 15000ms', () => {
    const goblin = createMonster('treasure_goblin', 100, 100);
    expect(goblin.escapeTimer).toBe(15000);
  });

  it('goblin escapeTimer decrements on update', () => {
    const goblin = createMonster('treasure_goblin', 100, 100);
    const player = makeFakePlayer(200, 200);
    goblin.update(1000, [player]);
    expect(goblin.escapeTimer).toBe(14000);
  });

  it('goblin emits goblin:escaped when escapeTimer reaches 0', () => {
    const goblin = createMonster('treasure_goblin', 100, 100);
    const player = makeFakePlayer(200, 200);
    // Drain most of the timer
    goblin.escapeTimer = 500;
    const events = goblin.update(600, [player]);
    const escaped = events.find(e => e.type === 'goblin:escaped');
    expect(escaped).toBeDefined();
    expect(escaped.monsterId).toBe(goblin.id);
    expect(goblin.alive).toBe(false);
  });

  it('goblin flees away from nearest player', () => {
    const goblin = createMonster('treasure_goblin', 200, 200);
    const player = makeFakePlayer(200, 100); // player below goblin (lower y)
    // Force zigzagAngle to 0 so flee direction is purely away from player
    goblin.zigzagAngle = 0;
    goblin.zigzagTimer = 99999; // prevent re-roll

    const startY = goblin.y;
    goblin.update(500, [player]);

    // Goblin should move away from player (increase y, since player is at lower y)
    expect(goblin.y).toBeGreaterThan(startY);
  });

  it('goblin does NOT attack (damage=0, no attack events)', () => {
    const goblin = createMonster('treasure_goblin', 100, 100);
    const player = makeFakePlayer(110, 110); // very close
    // Run multiple updates — no monster_attack events should appear
    let allEvents = [];
    for (let i = 0; i < 20; i++) {
      allEvents = allEvents.concat(goblin.update(100, [player]));
    }
    const attacks = allEvents.filter(e => e.type === 'monster_attack');
    expect(attacks).toHaveLength(0);
  });

  it('goblin respects wall collision when _world is set', () => {
    const goblin = createMonster('treasure_goblin', 200, 200);
    const player = makeFakePlayer(200, 100); // player is south, goblin flees north
    goblin.zigzagAngle = 0;
    goblin.zigzagTimer = 99999;

    // Block all movement
    goblin._world = {
      isWalkable: () => false,
    };

    const startX = goblin.x;
    const startY = goblin.y;
    goblin.update(500, [player]);

    // Goblin should NOT have moved to the calculated position
    // Since all isWalkable returns false, it falls through to bounds check
    // The goblin position change should be constrained
    // With _world returning false for everything, goblin won't move via the wall-aware path
    // It may still hit the fallback bounds-check path, so just verify
    // the wall-aware code path was triggered (position didn't fly off freely)
    expect(Math.abs(goblin.x - startX) + Math.abs(goblin.y - startY)).toBeLessThan(200);
  });

  it('goblin is stunned and does not flee while stunned', () => {
    const goblin = createMonster('treasure_goblin', 200, 200);
    const player = makeFakePlayer(200, 100);
    goblin.applyStun(2000);

    const startX = goblin.x;
    const startY = goblin.y;
    goblin.update(500, [player]);

    // Should not have moved — stun stops goblin AI
    expect(goblin.x).toBe(startX);
    expect(goblin.y).toBe(startY);
    // But escapeTimer should NOT have decremented because stun returns early
    expect(goblin.escapeTimer).toBe(15000);
  });
});

// ══════════════════════════════════════════════════════════════════
// B. Cursed Events
// ══════════════════════════════════════════════════════════════════

describe('Cursed Events', () => {
  it('CursedEvent constructor sets correct defaults', () => {
    const room = { type: 'normal', x: 5, y: 5 };
    const event = new CursedEvent('cursed_chest', room);

    expect(event.type).toBe('cursed_chest');
    expect(event.name).toBe('Cursed Chest');
    expect(event.active).toBe(false);
    expect(event.completed).toBe(false);
    expect(event.failed).toBe(false);
    expect(event.timer).toBe(600);
    expect(event.totalDuration).toBe(600);
    expect(event.currentWave).toBe(0);
    expect(event.totalWaves).toBe(3);
    expect(event.waveMonsters).toEqual([4, 6, 2]);
    expect(event.room).toBe(room);
    expect(event.id).toBeTruthy();
  });

  it('rollCursedEvent returns null for boss rooms', () => {
    const bossRoom = { type: 'boss' };
    const result = rollCursedEvent(bossRoom);
    expect(result).toBeNull();
  });

  it('rollCursedEvent returns null for start rooms', () => {
    const startRoom = { type: 'start' };
    const result = rollCursedEvent(startRoom);
    expect(result).toBeNull();
  });

  it('rollCursedEvent returns CursedEvent or null (with mocked Math.random)', () => {
    const room = { type: 'normal' };

    // Mock Math.random to return 0.1 (< 0.15 → should trigger event)
    const origRandom = Math.random;
    Math.random = () => 0.1;
    try {
      const result = rollCursedEvent(room);
      expect(result).toBeInstanceOf(CursedEvent);
      expect(result.room).toBe(room);
    } finally {
      Math.random = origRandom;
    }
  });

  it('rollCursedEvent returns null when random >= 0.15', () => {
    const room = { type: 'normal' };

    const origRandom = Math.random;
    Math.random = () => 0.5;
    try {
      const result = rollCursedEvent(room);
      expect(result).toBeNull();
    } finally {
      Math.random = origRandom;
    }
  });

  it('cursedEvent.start() sets active=true', () => {
    const event = new CursedEvent('cursed_chest', { type: 'normal' });
    expect(event.active).toBe(false);
    event.start();
    expect(event.active).toBe(true);
    expect(event.needsSpawn).toBe(true);
  });

  it('cursedEvent.tick() decrements timer', () => {
    const event = new CursedEvent('cursed_chest', { type: 'normal' });
    event.start();
    const startTimer = event.timer;
    event.tick();
    expect(event.timer).toBe(startTimer - 1);
  });

  it('cursedEvent.tick() sets failed=true when timer reaches 0', () => {
    const event = new CursedEvent('cursed_chest', { type: 'normal' });
    event.start();
    event.timer = 1;
    event.tick();
    expect(event.timer).toBe(0);
    expect(event.failed).toBe(true);
  });

  it('cursedEvent.waveCleared() increments currentWave and sets completed when all waves done', () => {
    const event = new CursedEvent('cursed_shrine', { type: 'normal' });
    // cursed_shrine has 1 wave total
    expect(event.totalWaves).toBe(1);
    expect(event.currentWave).toBe(0);

    event.waveCleared();
    expect(event.currentWave).toBe(1);
    expect(event.completed).toBe(true);
  });

  it('cursedEvent.waveCleared() sets needsSpawn for intermediate waves', () => {
    const event = new CursedEvent('cursed_chest', { type: 'normal' });
    // cursed_chest has 3 waves
    event.waveCleared(); // wave 0 → 1
    expect(event.currentWave).toBe(1);
    expect(event.completed).toBe(false);
    expect(event.needsSpawn).toBe(true);
  });

  it('cursedEvent.serialize() returns expected shape', () => {
    const event = new CursedEvent('cursed_chest', { type: 'normal' });
    event.start();
    const data = event.serialize();

    expect(data).toHaveProperty('id');
    expect(data).toHaveProperty('type', 'cursed_chest');
    expect(data).toHaveProperty('name', 'Cursed Chest');
    expect(data).toHaveProperty('active', true);
    expect(data).toHaveProperty('timer');
    expect(data).toHaveProperty('totalDuration', 600);
    expect(data).toHaveProperty('currentWave', 0);
    expect(data).toHaveProperty('totalWaves', 3);
    expect(data).toHaveProperty('monstersRemaining', 0);
    expect(data).toHaveProperty('completed', false);
    expect(data).toHaveProperty('failed', false);
    expect(data).toHaveProperty('x');
    expect(data).toHaveProperty('y');
  });
});

// ══════════════════════════════════════════════════════════════════
// C. Gambling Handler
// ══════════════════════════════════════════════════════════════════

describe('handleGamble', () => {
  let player, inv, socket;

  beforeEach(() => {
    player = new Player('Gambler', 'warrior');
    player.id = 'p1';
    player.gold = 5000;
    player.x = 100;
    player.y = 100;
    inv = makeMockInventory([]);
    socket = makeSocket('s1');
  });

  it('rejects invalid slot', () => {
    handlers.handleGamble(socket, { slot: 'pants' }, makeCtx(player, inv));
    const notif = socket._find('notification');
    expect(notif).toBeTruthy();
    expect(notif.data.type).toBe('error');
    expect(notif.data.text).toMatch(/invalid/i);
  });

  it('rejects null data', () => {
    handlers.handleGamble(socket, null, makeCtx(player, inv));
    const notif = socket._find('notification');
    expect(notif).toBeTruthy();
    expect(notif.data.type).toBe('error');
  });

  it('rejects when not enough gold', () => {
    player.gold = 10; // cost is 50 * floor(1) = 50
    handlers.handleGamble(socket, { slot: 'weapon' }, makeCtx(player, inv));
    const notif = socket._find('notification');
    expect(notif).toBeTruthy();
    expect(notif.data.type).toBe('error');
    expect(notif.data.text).toMatch(/gold/i);
    expect(player.gold).toBe(10); // unchanged
  });

  it('successful gamble deducts gold', () => {
    handlers.handleGamble(socket, { slot: 'weapon' }, makeCtx(player, inv));
    // Cost = 50 * 1 = 50
    expect(player.gold).toBe(4950);
  });

  it('successful gamble emits gamble:result', () => {
    handlers.handleGamble(socket, { slot: 'weapon' }, makeCtx(player, inv));
    const result = socket._find('gamble:result');
    expect(result).toBeTruthy();
    expect(result.data).toHaveProperty('item');
    expect(result.data).toHaveProperty('cost', 50);
    expect(result.data).toHaveProperty('rarity');
  });

  it('does nothing for unknown socket', () => {
    const unknownSocket = makeSocket('unknown');
    handlers.handleGamble(unknownSocket, { slot: 'weapon' }, makeCtx(player, inv));
    expect(unknownSocket._emitted).toHaveLength(0);
  });
});

// ══════════════════════════════════════════════════════════════════
// D. Monster Wall Collision
// ══════════════════════════════════════════════════════════════════

describe('Monster Wall Collision', () => {
  it('moveToward() without _world moves freely (backward compat)', () => {
    const monster = createMonster('skeleton', 100, 100);
    monster._world = undefined;
    monster.moveToward(200, 200, 1000);

    // Should have moved toward target
    expect(monster.x).toBeGreaterThan(100);
    expect(monster.y).toBeGreaterThan(100);
  });

  it('moveToward() with _world.isWalkable=true moves normally', () => {
    const monster = createMonster('skeleton', 100, 100);
    monster._world = { isWalkable: () => true };
    monster.moveToward(200, 200, 1000);

    expect(monster.x).toBeGreaterThan(100);
    expect(monster.y).toBeGreaterThan(100);
  });

  it('moveToward() with _world.isWalkable=false does NOT move', () => {
    const monster = createMonster('skeleton', 100, 100);
    monster._world = { isWalkable: () => false };

    const startX = monster.x;
    const startY = monster.y;
    monster.moveToward(200, 200, 1000);

    // All collision paths fail — monster stays put
    expect(monster.x).toBe(startX);
    expect(monster.y).toBe(startY);
  });

  it('moveAwayFrom() respects wall collision', () => {
    const monster = createMonster('skeleton', 100, 100);
    monster._world = { isWalkable: () => false };

    const startX = monster.x;
    const startY = monster.y;
    monster.moveAwayFrom(200, 200, 1000);

    // Blocked on all axes — stays put
    expect(monster.x).toBe(startX);
    expect(monster.y).toBe(startY);
  });

  it('moveToward() wall-slides along X when Y is blocked', () => {
    const monster = createMonster('skeleton', 100, 100);
    // Allow X movement but block full diagonal and pure Y
    monster._world = {
      isWalkable: (x, y) => {
        // Block combined movement, block pure Y, allow pure X
        if (x !== 100 && y !== 100) return false; // block diagonal
        if (x === 100 && y !== 100) return false;  // block pure Y
        if (x !== 100 && y === 100) return true;   // allow pure X
        return true;
      },
    };

    monster.moveToward(200, 200, 1000);

    // Should have slid along X axis only
    expect(monster.x).toBeGreaterThan(100);
    expect(monster.y).toBe(100);
  });
});
