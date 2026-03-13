import { describe, it, expect, beforeEach } from 'vitest';
import { createRequire } from 'module';
const require = createRequire(import.meta.url);

const handlers = require('../socket-handlers');
const { Player } = require('../game/player');

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

function makeItem(overrides = {}) {
  return {
    id: `item_${Math.random().toString(36).slice(2, 8)}`,
    name: 'Test Sword',
    type: 'weapon',
    subType: 'sword',
    slot: 'weapon',
    rarity: 'rare',
    level: 5,
    damage: 20,
    bonuses: { str: 8, dex: 4 },
    sockets: [],
    gridW: 1, gridH: 2,
    stackable: false, quantity: 1,
    ...overrides,
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

function makeCtx(player, inv) {
  const players = new Map([['s1', player]]);
  const inventories = new Map([[player.id, inv]]);
  return { players, inventories };
}

// ══════════════════════════════════════════════════════════════════
// handleEnchantPreview
// ══════════════════════════════════════════════════════════════════

describe('handleEnchantPreview', () => {
  let player, weapon, inv, socket;

  beforeEach(() => {
    player = new Player('Hero', 'warrior');
    player.id = 'p1';
    player.gold = 5000;
    weapon = makeItem({ id: 'w1', name: 'Sword', level: 5, rarity: 'rare', bonuses: { str: 8, dex: 4 } });
    player.equipment.weapon = weapon;
    inv = makeMockInventory([]);
    socket = makeSocket('s1');
  });

  it('previews enchant on equipped item', () => {
    handlers.handleEnchantPreview(socket, { itemId: 'w1', bonusKey: 'str' }, makeCtx(player, inv));

    const preview = socket._find('enchant:preview');
    expect(preview).toBeTruthy();
    expect(preview.data.itemId).toBe('w1');
    expect(preview.data.bonusKey).toBe('str');
    expect(preview.data.currentValue).toBe(8);
    expect(preview.data.cost).toBe(500); // 100 * 5 * 1.0
    expect(preview.data.pool).toBeInstanceOf(Array);
    expect(preview.data.pool.length).toBeGreaterThan(0);
  });

  it('previews enchant on inventory item', () => {
    player.equipment.weapon = null;
    inv = makeMockInventory([weapon]);
    handlers.handleEnchantPreview(socket, { itemId: 'w1', bonusKey: 'dex' }, makeCtx(player, inv));

    const preview = socket._find('enchant:preview');
    expect(preview).toBeTruthy();
    expect(preview.data.currentValue).toBe(4);
  });

  it('cost escalates with enchantCount', () => {
    weapon.enchantCount = 2;
    handlers.handleEnchantPreview(socket, { itemId: 'w1', bonusKey: 'str' }, makeCtx(player, inv));

    const preview = socket._find('enchant:preview');
    // 100 * 5 * (1 + 2 * 0.5) = 100 * 5 * 2 = 1000
    expect(preview.data.cost).toBe(1000);
  });

  it('armor items get resist bonus pool', () => {
    const chest = makeItem({ id: 'c1', slot: 'chest', rarity: 'rare', level: 3, bonuses: { vit: 5 } });
    player.equipment.chest = chest;
    handlers.handleEnchantPreview(socket, { itemId: 'c1', bonusKey: 'vit' }, makeCtx(player, inv));

    const preview = socket._find('enchant:preview');
    const statNames = preview.data.pool.map(p => p.stat);
    expect(statNames).toContain('fire_resist');
    expect(statNames).toContain('all_resist');
  });

  it('weapon items do NOT get resist pool', () => {
    handlers.handleEnchantPreview(socket, { itemId: 'w1', bonusKey: 'str' }, makeCtx(player, inv));

    const preview = socket._find('enchant:preview');
    const statNames = preview.data.pool.map(p => p.stat);
    expect(statNames).not.toContain('fire_resist');
  });

  it('rejects missing data', () => {
    handlers.handleEnchantPreview(socket, null, makeCtx(player, inv));
    const notif = socket._find('notification');
    expect(notif).toBeTruthy();
    expect(notif.data.type).toBe('error');
  });

  it('rejects missing bonusKey', () => {
    handlers.handleEnchantPreview(socket, { itemId: 'w1' }, makeCtx(player, inv));
    const notif = socket._find('notification');
    expect(notif.data.type).toBe('error');
  });

  it('rejects nonexistent item', () => {
    handlers.handleEnchantPreview(socket, { itemId: 'nope', bonusKey: 'str' }, makeCtx(player, inv));
    const notif = socket._find('notification');
    expect(notif.data.type).toBe('error');
  });

  it('rejects nonexistent bonus key', () => {
    handlers.handleEnchantPreview(socket, { itemId: 'w1', bonusKey: 'magic' }, makeCtx(player, inv));
    const notif = socket._find('notification');
    expect(notif.data.type).toBe('error');
  });

  it('does nothing for unknown socket', () => {
    const unknownSocket = makeSocket('unknown');
    handlers.handleEnchantPreview(unknownSocket, { itemId: 'w1', bonusKey: 'str' }, makeCtx(player, inv));
    expect(unknownSocket._emitted).toHaveLength(0);
  });
});

// ══════════════════════════════════════════════════════════════════
// handleEnchantExecute
// ══════════════════════════════════════════════════════════════════

describe('handleEnchantExecute', () => {
  let player, weapon, inv, socket;

  beforeEach(() => {
    player = new Player('Hero', 'warrior');
    player.id = 'p1';
    player.gold = 5000;
    weapon = makeItem({ id: 'w1', name: 'Sword', level: 5, rarity: 'rare', bonuses: { str: 8, dex: 4 } });
    player.equipment.weapon = weapon;
    inv = makeMockInventory([]);
    socket = makeSocket('s1');
  });

  it('enchants equipped item and deducts gold', () => {
    handlers.handleEnchantExecute(socket, { itemId: 'w1', bonusKey: 'str' }, makeCtx(player, inv));

    const result = socket._find('enchant:result');
    expect(result).toBeTruthy();
    expect(result.data.itemId).toBe('w1');
    expect(result.data.bonusKey).toBe('str');
    expect(result.data.oldValue).toBe(8);
    expect(typeof result.data.newValue).toBe('number');
    expect(result.data.cost).toBe(500);
    expect(player.gold).toBe(4500);
  });

  it('sets enchanted flag and increments enchantCount', () => {
    handlers.handleEnchantExecute(socket, { itemId: 'w1', bonusKey: 'str' }, makeCtx(player, inv));

    expect(weapon.enchanted).toBe(true);
    expect(weapon.enchantCount).toBe(1);
  });

  it('enchantCount increments on subsequent enchants', () => {
    weapon.enchantCount = 3;
    handlers.handleEnchantExecute(socket, { itemId: 'w1', bonusKey: 'str' }, makeCtx(player, inv));

    expect(weapon.enchantCount).toBe(4);
  });

  it('recalcs stats when item is equipped', () => {
    player.equipment.weapon = weapon;
    handlers.handleEnchantExecute(socket, { itemId: 'w1', bonusKey: 'str' }, makeCtx(player, inv));

    const stats = socket._find('player:stats');
    expect(stats).toBeTruthy();
  });

  it('works on inventory items without recalc', () => {
    player.equipment.weapon = null;
    inv = makeMockInventory([weapon]);
    handlers.handleEnchantExecute(socket, { itemId: 'w1', bonusKey: 'dex' }, makeCtx(player, inv));

    const result = socket._find('enchant:result');
    expect(result).toBeTruthy();
    expect(result.data.oldValue).toBe(4);
    expect(player.gold).toBe(4500);
  });

  it('rejects when not enough gold', () => {
    player.gold = 100;
    handlers.handleEnchantExecute(socket, { itemId: 'w1', bonusKey: 'str' }, makeCtx(player, inv));

    const notif = socket._find('notification');
    expect(notif.data.type).toBe('error');
    expect(notif.data.text).toMatch(/gold/i);
    expect(player.gold).toBe(100);
    expect(weapon.bonuses.str).toBe(8);
  });

  it('rejects nonexistent item', () => {
    handlers.handleEnchantExecute(socket, { itemId: 'nope', bonusKey: 'str' }, makeCtx(player, inv));
    expect(socket._find('notification').data.type).toBe('error');
    expect(player.gold).toBe(5000);
  });

  it('rejects null data', () => {
    handlers.handleEnchantExecute(socket, null, makeCtx(player, inv));
    expect(socket._find('notification').data.type).toBe('error');
  });

  it('emits inventory:update', () => {
    handlers.handleEnchantExecute(socket, { itemId: 'w1', bonusKey: 'str' }, makeCtx(player, inv));
    expect(socket._find('inventory:update')).toBeTruthy();
  });

  it('emits notification with stat change', () => {
    handlers.handleEnchantExecute(socket, { itemId: 'w1', bonusKey: 'str' }, makeCtx(player, inv));
    const notifs = socket._findAll('notification');
    const enchantNotif = notifs.find(n => n.data.text.includes('✧'));
    expect(enchantNotif).toBeTruthy();
  });

  it('escalating cost: second enchant costs more', () => {
    handlers.handleEnchantExecute(socket, { itemId: 'w1', bonusKey: 'str' }, makeCtx(player, inv));
    expect(player.gold).toBe(4500);

    socket._emitted.length = 0;

    handlers.handleEnchantExecute(socket, { itemId: 'w1', bonusKey: 'str' }, makeCtx(player, inv));
    const result = socket._find('enchant:result');
    expect(result.data.cost).toBe(750); // 100 * 5 * 1.5
    expect(player.gold).toBe(3750);
  });

  it('new value is always a positive integer', () => {
    for (let i = 0; i < 50; i++) {
      const p = new Player('Hero', 'warrior');
      p.id = 'p1';
      p.gold = 99999;
      const w = makeItem({ id: 'w1', level: 1, rarity: 'common', bonuses: { str: 5 } });
      p.equipment.weapon = w;
      const s = makeSocket('s1');
      handlers.handleEnchantExecute(s, { itemId: 'w1', bonusKey: 'str' }, makeCtx(p, makeMockInventory([])));
      const r = s._find('enchant:result');
      expect(r.data.newValue).toBeGreaterThan(0);
    }
  });

  it('does nothing for unknown socket', () => {
    const unknownSocket = makeSocket('unknown');
    handlers.handleEnchantExecute(unknownSocket, { itemId: 'w1', bonusKey: 'str' }, makeCtx(player, inv));
    expect(unknownSocket._emitted).toHaveLength(0);
  });
});

// ══════════════════════════════════════════════════════════════════
// World — spawnEnchantNpc
// ══════════════════════════════════════════════════════════════════

describe('World.spawnEnchantNpc', () => {
  const { World } = require('../game/world');

  it('spawns enchant NPC in boss room', () => {
    const world = new World();
    world.generateFloor(1);
    const bossRoom = world.rooms.find(r => r.type === 'boss');
    if (!bossRoom) return;

    world.spawnEnchantNpc(bossRoom);
    expect(world.enchantNpc).not.toBeNull();
    expect(world.enchantNpc.id).toBe('enchant_npc');
    expect(world.enchantNpc.name).toBe('Mystic');
    expect(world.enchantNpc.type).toBe('enchanter');
    expect(typeof world.enchantNpc.x).toBe('number');
    expect(typeof world.enchantNpc.y).toBe('number');
  });

  it('serializes enchantNpc', () => {
    const world = new World();
    world.generateFloor(1);
    const bossRoom = world.rooms.find(r => r.type === 'boss');
    if (!bossRoom) return;

    world.spawnEnchantNpc(bossRoom);
    const data = world.serialize();
    expect(data.enchantNpc).not.toBeNull();
    expect(data.enchantNpc.name).toBe('Mystic');
  });

  it('resets enchantNpc on new floor', () => {
    const world = new World();
    world.generateFloor(1);
    const bossRoom = world.rooms.find(r => r.type === 'boss');
    if (bossRoom) world.spawnEnchantNpc(bossRoom);

    world.generateFloor(2);
    expect(world.enchantNpc).toBeNull();
  });

  it('handles null bossRoom gracefully', () => {
    const world = new World();
    world.generateFloor(1);
    world.spawnEnchantNpc(null);
    expect(world.enchantNpc).toBeNull();
  });
});
