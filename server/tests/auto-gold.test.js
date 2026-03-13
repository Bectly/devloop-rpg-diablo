import { describe, it, expect, beforeEach } from 'vitest';
import { createRequire } from 'module';
const require = createRequire(import.meta.url);
const { World } = require('../game/world');

/**
 * Auto gold pickup tests (Cycle #219)
 *
 * Verifies the gold auto-collection logic from game-loop.js:
 * - Gold items (type='currency') within 40px are auto-collected every 5 ticks
 * - Non-gold items are ignored by gold pickup
 * - Gold amount is added to player.gold correctly
 * - Each player picks up independently
 */

const GOLD_AUTO_PICKUP_RADIUS = 40;

// ── Helper: simulate the gold auto-pickup logic from game-loop.js ──
function simulateGoldAutoPickup(world, players) {
  for (const player of players) {
    if (!player.alive) continue;

    const goldNearby = [];
    for (const gi of world.groundItems) {
      if (gi.item.type !== 'currency') continue;
      const dx = gi.x - player.x;
      const dy = gi.y - player.y;
      if (dx * dx + dy * dy <= GOLD_AUTO_PICKUP_RADIUS * GOLD_AUTO_PICKUP_RADIUS) {
        goldNearby.push(gi);
      }
    }

    for (const gi of goldNearby) {
      const picked = world.pickupItem(gi.item.id, player.x, player.y, GOLD_AUTO_PICKUP_RADIUS);
      if (!picked) continue;
      player.gold += picked.quantity;
    }
  }
}

// ── Helper: create a minimal player ──
function makePlayer(id, x, y) {
  return { id, x, y, gold: 0, alive: true };
}

// ── Helper: create a gold ground item ──
let _goldId = 0;
function makeGoldItem(x, y, quantity = 10) {
  return {
    item: { id: `gold_${++_goldId}`, type: 'currency', name: 'Gold', quantity },
    x,
    y,
    spawnTime: Date.now(),
  };
}

// ── Helper: create a non-gold ground item ──
function makeEquipItem(x, y) {
  return {
    item: { id: `item_${++_goldId}`, type: 'weapon', name: 'Rusty Sword', rarity: 'common' },
    x,
    y,
    spawnTime: Date.now(),
  };
}

describe('Auto gold pickup (Cycle #219)', () => {
  let world;

  beforeEach(() => {
    world = new World();
    world.generateFloor(0);
    _goldId = 0;
  });

  it('gold item within 40px of player gets auto-collected', () => {
    const player = makePlayer('p1', 100, 100);
    const goldItem = makeGoldItem(120, 100, 15); // 20px away
    world.groundItems.push(goldItem);

    simulateGoldAutoPickup(world, [player]);

    expect(player.gold).toBe(15);
    expect(world.groundItems).toHaveLength(0);
  });

  it('gold item beyond 40px stays on ground', () => {
    const player = makePlayer('p1', 100, 100);
    const goldItem = makeGoldItem(200, 100, 25); // 100px away
    world.groundItems.push(goldItem);

    simulateGoldAutoPickup(world, [player]);

    expect(player.gold).toBe(0);
    expect(world.groundItems).toHaveLength(1);
  });

  it('gold amount added to player correctly', () => {
    const player = makePlayer('p1', 100, 100);
    player.gold = 50; // start with some gold
    const g1 = makeGoldItem(110, 100, 20); // 10px away
    const g2 = makeGoldItem(105, 105, 30); // ~7px away
    world.groundItems.push(g1, g2);

    simulateGoldAutoPickup(world, [player]);

    expect(player.gold).toBe(100); // 50 + 20 + 30
    expect(world.groundItems).toHaveLength(0);
  });

  it('non-gold items are NOT auto-collected by gold pickup', () => {
    const player = makePlayer('p1', 100, 100);
    const weapon = makeEquipItem(105, 100); // 5px away — very close
    const goldItem = makeGoldItem(110, 100, 10); // 10px away
    world.groundItems.push(weapon, goldItem);

    simulateGoldAutoPickup(world, [player]);

    // Only gold should be picked up
    expect(player.gold).toBe(10);
    expect(world.groundItems).toHaveLength(1);
    expect(world.groundItems[0].item.type).toBe('weapon');
  });

  it('gold pickup works for multiple players independently', () => {
    const p1 = makePlayer('p1', 100, 100);
    const p2 = makePlayer('p2', 500, 500);

    // Gold near p1 only
    const g1 = makeGoldItem(110, 100, 20);
    // Gold near p2 only
    const g2 = makeGoldItem(510, 500, 35);
    // Gold near neither
    const g3 = makeGoldItem(300, 300, 99);
    world.groundItems.push(g1, g2, g3);

    simulateGoldAutoPickup(world, [p1, p2]);

    expect(p1.gold).toBe(20);
    expect(p2.gold).toBe(35);
    // Only the far-away gold remains
    expect(world.groundItems).toHaveLength(1);
    expect(world.groundItems[0].item.quantity).toBe(99);
  });

  it('gold at exactly 40px distance is collected (boundary)', () => {
    const player = makePlayer('p1', 100, 100);
    // Place gold exactly 40px away (horizontal)
    const goldItem = makeGoldItem(140, 100, 7);
    world.groundItems.push(goldItem);

    simulateGoldAutoPickup(world, [player]);

    expect(player.gold).toBe(7);
    expect(world.groundItems).toHaveLength(0);
  });

  it('gold at 40.1px distance is NOT collected (boundary)', () => {
    const player = makePlayer('p1', 0, 0);
    // 41px > 40px radius
    const goldItem = makeGoldItem(41, 0, 50);
    world.groundItems.push(goldItem);

    simulateGoldAutoPickup(world, [player]);

    expect(player.gold).toBe(0);
    expect(world.groundItems).toHaveLength(1);
  });

  it('dead player does not auto-collect gold', () => {
    const player = makePlayer('p1', 100, 100);
    player.alive = false;
    const goldItem = makeGoldItem(105, 100, 10);
    world.groundItems.push(goldItem);

    simulateGoldAutoPickup(world, [player]);

    expect(player.gold).toBe(0);
    expect(world.groundItems).toHaveLength(1);
  });
});
