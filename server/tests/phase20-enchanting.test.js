import { describe, it, expect, beforeEach, vi } from 'vitest';
import { createRequire } from 'module';
const require = createRequire(import.meta.url);

const handlers = require('../socket-handlers');
const { Player } = require('../game/player');
const { BONUS_POOL, RESIST_BONUS_POOL } = require('../game/items');

// ── Helpers ──────────────────────────────────────────────────────────

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
    bonuses: { str: 5, dex: 3 },
    sockets: [],
    stackable: false,
    enchantCount: 0,
    ...overrides,
  };
}

function makeMockInventory(items = []) {
  const _items = [...items];
  return {
    getAllItems: () => [..._items],
    getItem: (id) => _items.find(i => i.id === id) || null,
    serialize: () => ({ items: [..._items] }),
  };
}

function makeCtx(player, inv) {
  const players = new Map([['s1', player]]);
  const inventories = new Map([[player.id, inv]]);
  return { players, inventories };
}

function makePlayer() {
  const p = new Player('Hero', 'warrior');
  p.id = 'p1';
  p.gold = 1000;
  return p;
}

// ══════════════════════════════════════════════════════════════════════
// handleEnchantPreview
// ══════════════════════════════════════════════════════════════════════

describe('handleEnchantPreview', () => {
  let player, socket;

  beforeEach(() => {
    player = makePlayer();
    socket = makeSocket('s1');
  });

  it('emits enchant:preview for inventory item', () => {
    const item = makeItem({ id: 'w1', level: 5, enchantCount: 0, bonuses: { str: 5 } });
    const inv = makeMockInventory([item]);
    handlers.handleEnchantPreview(socket, { itemId: 'w1', bonusKey: 'str' }, makeCtx(player, inv));

    const preview = socket._find('enchant:preview');
    expect(preview).toBeTruthy();
    expect(preview.data.itemId).toBe('w1');
    expect(preview.data.bonusKey).toBe('str');
    expect(preview.data.currentValue).toBe(5);
  });

  it('calculates cost correctly: 100 × level × (1 + enchantCount × 0.5)', () => {
    const item = makeItem({ id: 'w1', level: 4, enchantCount: 2, bonuses: { str: 5 } });
    const inv = makeMockInventory([item]);
    handlers.handleEnchantPreview(socket, { itemId: 'w1', bonusKey: 'str' }, makeCtx(player, inv));

    const preview = socket._find('enchant:preview');
    // 100 * 4 * (1 + 2 * 0.5) = 100 * 4 * 2 = 800
    expect(preview.data.cost).toBe(800);
  });

  it('first enchant cost: 100 × level', () => {
    const item = makeItem({ id: 'w1', level: 3, enchantCount: 0, bonuses: { str: 5 } });
    const inv = makeMockInventory([item]);
    handlers.handleEnchantPreview(socket, { itemId: 'w1', bonusKey: 'str' }, makeCtx(player, inv));

    const preview = socket._find('enchant:preview');
    expect(preview.data.cost).toBe(300); // 100 * 3 * 1
  });

  it('weapon pool contains only BONUS_POOL stats', () => {
    const item = makeItem({ id: 'w1', slot: 'weapon', bonuses: { str: 5 } });
    const inv = makeMockInventory([item]);
    handlers.handleEnchantPreview(socket, { itemId: 'w1', bonusKey: 'str' }, makeCtx(player, inv));

    const preview = socket._find('enchant:preview');
    const poolStats = preview.data.pool.map(p => p.stat);
    const bonusStats = BONUS_POOL.map(b => b.stat);
    const resistStats = RESIST_BONUS_POOL.map(b => b.stat);

    // All returned stats should be in BONUS_POOL
    for (const s of poolStats) expect(bonusStats).toContain(s);
    // No resist stats for weapons
    for (const s of poolStats) expect(resistStats).not.toContain(s);
  });

  it('armor pool includes BONUS_POOL + RESIST_BONUS_POOL', () => {
    const item = makeItem({ id: 'c1', slot: 'chest', bonuses: { armor: 10 } });
    const inv = makeMockInventory([item]);
    handlers.handleEnchantPreview(socket, { itemId: 'c1', bonusKey: 'armor' }, makeCtx(player, inv));

    const preview = socket._find('enchant:preview');
    const poolStats = preview.data.pool.map(p => p.stat);
    const resistStats = RESIST_BONUS_POOL.map(b => b.stat);

    // At least one resist stat must be present
    const hasResist = resistStats.some(s => poolStats.includes(s));
    expect(hasResist).toBe(true);
  });

  it('emits enchant:preview for equipped item', () => {
    const item = makeItem({ id: 'w1', bonuses: { str: 7 } });
    player.equipment.weapon = item;
    const inv = makeMockInventory([]);
    handlers.handleEnchantPreview(socket, { itemId: 'w1', bonusKey: 'str' }, makeCtx(player, inv));

    const preview = socket._find('enchant:preview');
    expect(preview).toBeTruthy();
    expect(preview.data.currentValue).toBe(7);
  });

  it('returns error notification for missing itemId', () => {
    const inv = makeMockInventory([]);
    handlers.handleEnchantPreview(socket, { bonusKey: 'str' }, makeCtx(player, inv));

    const notif = socket._find('notification');
    expect(notif).toBeTruthy();
    expect(notif.data.type).toBe('error');
    expect(socket._find('enchant:preview')).toBeUndefined();
  });

  it('returns error notification for missing bonusKey', () => {
    const inv = makeMockInventory([]);
    handlers.handleEnchantPreview(socket, { itemId: 'w1' }, makeCtx(player, inv));

    const notif = socket._find('notification');
    expect(notif.data.type).toBe('error');
  });

  it('returns error when item not found', () => {
    const inv = makeMockInventory([]);
    handlers.handleEnchantPreview(socket, { itemId: 'nope', bonusKey: 'str' }, makeCtx(player, inv));

    const notif = socket._find('notification');
    expect(notif.data.type).toBe('error');
  });

  it('returns error when bonusKey not on item', () => {
    const item = makeItem({ id: 'w1', bonuses: { str: 5 } });
    const inv = makeMockInventory([item]);
    handlers.handleEnchantPreview(socket, { itemId: 'w1', bonusKey: 'dex' }, makeCtx(player, inv));

    const notif = socket._find('notification');
    expect(notif.data.type).toBe('error');
  });

  it('handles null data gracefully', () => {
    const inv = makeMockInventory([]);
    handlers.handleEnchantPreview(socket, null, makeCtx(player, inv));
    expect(socket._find('notification').data.type).toBe('error');
  });
});

// ══════════════════════════════════════════════════════════════════════
// handleEnchantExecute
// ══════════════════════════════════════════════════════════════════════

describe('handleEnchantExecute', () => {
  let player, socket;

  beforeEach(() => {
    player = makePlayer();
    socket = makeSocket('s1');
  });

  it('deducts gold on success', () => {
    const item = makeItem({ id: 'w1', level: 2, enchantCount: 0, bonuses: { str: 5 } });
    const inv = makeMockInventory([item]);
    player.gold = 1000;
    handlers.handleEnchantExecute(socket, { itemId: 'w1', bonusKey: 'str' }, makeCtx(player, inv));

    const cost = 100 * 2 * 1; // 200
    expect(player.gold).toBe(1000 - cost);
  });

  it('increments enchantCount and sets enchanted flag', () => {
    const item = makeItem({ id: 'w1', level: 1, enchantCount: 1, bonuses: { str: 5 } });
    const inv = makeMockInventory([item]);
    handlers.handleEnchantExecute(socket, { itemId: 'w1', bonusKey: 'str' }, makeCtx(player, inv));

    expect(item.enchantCount).toBe(2);
    expect(item.enchanted).toBe(true);
  });

  it('emits enchant:result with old/new value and cost', () => {
    const item = makeItem({ id: 'w1', level: 1, enchantCount: 0, bonuses: { str: 5 } });
    const inv = makeMockInventory([item]);
    handlers.handleEnchantExecute(socket, { itemId: 'w1', bonusKey: 'str' }, makeCtx(player, inv));

    const result = socket._find('enchant:result');
    expect(result).toBeTruthy();
    expect(result.data.itemId).toBe('w1');
    expect(result.data.bonusKey).toBe('str');
    expect(result.data.oldValue).toBe(5);
    expect(result.data.cost).toBe(100); // 100 * 1 * 1
    expect(typeof result.data.newValue).toBe('number');
  });

  it('emits player:stats and inventory:update on success', () => {
    const item = makeItem({ id: 'w1', level: 1, bonuses: { str: 5 } });
    const inv = makeMockInventory([item]);
    handlers.handleEnchantExecute(socket, { itemId: 'w1', bonusKey: 'str' }, makeCtx(player, inv));

    expect(socket._find('player:stats')).toBeTruthy();
    expect(socket._find('inventory:update')).toBeTruthy();
  });

  it('emits success notification', () => {
    const item = makeItem({ id: 'w1', level: 1, bonuses: { str: 5 } });
    const inv = makeMockInventory([item]);
    handlers.handleEnchantExecute(socket, { itemId: 'w1', bonusKey: 'str' }, makeCtx(player, inv));

    const notif = socket._find('notification');
    expect(notif).toBeTruthy();
    expect(notif.data.text).toContain('str');
  });

  it('rejects when player has insufficient gold', () => {
    const item = makeItem({ id: 'w1', level: 10, enchantCount: 3, bonuses: { str: 5 } });
    const inv = makeMockInventory([item]);
    player.gold = 1; // cost = 100 * 10 * 2.5 = 2500
    handlers.handleEnchantExecute(socket, { itemId: 'w1', bonusKey: 'str' }, makeCtx(player, inv));

    expect(player.gold).toBe(1); // unchanged
    expect(item.enchantCount).toBe(3); // unchanged
    const notif = socket._find('notification');
    expect(notif.data.type).toBe('error');
    expect(socket._find('enchant:result')).toBeUndefined();
  });

  it('calls recalcEquipBonuses + recalcStats when item is equipped', () => {
    const item = makeItem({ id: 'w1', level: 1, bonuses: { str: 5 } });
    player.equipment.weapon = item;
    player.recalcEquipBonuses = vi.fn();
    player.recalcStats = vi.fn();
    const inv = makeMockInventory([]);
    handlers.handleEnchantExecute(socket, { itemId: 'w1', bonusKey: 'str' }, makeCtx(player, inv));

    expect(player.recalcEquipBonuses).toHaveBeenCalled();
    expect(player.recalcStats).toHaveBeenCalled();
  });

  it('does NOT recalc stats for inventory items', () => {
    const item = makeItem({ id: 'w1', level: 1, bonuses: { str: 5 } });
    const inv = makeMockInventory([item]);
    player.recalcEquipBonuses = vi.fn();
    player.recalcStats = vi.fn();
    handlers.handleEnchantExecute(socket, { itemId: 'w1', bonusKey: 'str' }, makeCtx(player, inv));

    expect(player.recalcEquipBonuses).not.toHaveBeenCalled();
    expect(player.recalcStats).not.toHaveBeenCalled();
  });

  it('bad luck protection: forces different value after 3 same-key rerolls', () => {
    const item = makeItem({ id: 'w1', level: 1, bonuses: { str: 5 } });
    // Seed history: 3 × 'str' already enchanted
    item._enchantHistory = ['str', 'str', 'str'];
    item.enchantCount = 3;
    const inv = makeMockInventory([item]);

    // Mock Math.random to return same value that would yield oldValue
    // oldValue is 5, rare multiplier 1.5, BONUS_POOL str: min=1,max=8
    // Math.ceil((1 + rand * 7) * 1.5) = 5 → need rand that gives ~2.33/7 = 0.333
    const origRandom = Math.random;
    Math.random = () => 0.28; // Math.ceil((1 + 0.28*7)*1.5) = Math.ceil(3.96*1.5) = Math.ceil(5.94) = 6
    // Actually with rand=0.28: (1 + 0.28*7)*1.5 = (1+1.96)*1.5 = 2.96*1.5 = 4.44 → ceil = 5
    // That equals oldValue=5, so bad luck kicks in

    handlers.handleEnchantExecute(socket, { itemId: 'w1', bonusKey: 'str' }, makeCtx(player, inv));
    Math.random = origRandom;

    const result = socket._find('enchant:result');
    expect(result).toBeTruthy();
    // With bad luck protection, newValue !== oldValue (5)
    expect(result.data.newValue).not.toBe(5);
  });

  it('new value is a positive integer', () => {
    const item = makeItem({ id: 'w1', level: 3, bonuses: { str: 5 } });
    const inv = makeMockInventory([item]);
    handlers.handleEnchantExecute(socket, { itemId: 'w1', bonusKey: 'str' }, makeCtx(player, inv));

    const result = socket._find('enchant:result');
    expect(result.data.newValue).toBeGreaterThan(0);
    expect(Number.isInteger(result.data.newValue)).toBe(true);
  });

  it('error when item not found', () => {
    const inv = makeMockInventory([]);
    handlers.handleEnchantExecute(socket, { itemId: 'ghost', bonusKey: 'str' }, makeCtx(player, inv));
    expect(socket._find('notification').data.type).toBe('error');
    expect(socket._find('enchant:result')).toBeUndefined();
  });

  it('error when bonusKey not on item', () => {
    const item = makeItem({ id: 'w1', bonuses: { str: 5 } });
    const inv = makeMockInventory([item]);
    handlers.handleEnchantExecute(socket, { itemId: 'w1', bonusKey: 'vit' }, makeCtx(player, inv));
    expect(socket._find('notification').data.type).toBe('error');
  });

  it('error when stat not in pool (unmappable)', () => {
    // 'custom_stat' won't exist in BONUS_POOL or RESIST_BONUS_POOL
    const item = makeItem({ id: 'w1', bonuses: { custom_stat: 99 } });
    const inv = makeMockInventory([item]);
    handlers.handleEnchantExecute(socket, { itemId: 'w1', bonusKey: 'custom_stat' }, makeCtx(player, inv));
    expect(socket._find('notification').data.type).toBe('error');
  });

  it('cost scales with enchantCount: 100×lvl×(1+count×0.5)', () => {
    // enchantCount=0: 100 * 1 * 1.0 = 100
    const item0 = makeItem({ id: 'a1', level: 1, enchantCount: 0, bonuses: { str: 5 } });
    const socket0 = makeSocket();
    const p0 = makePlayer();
    handlers.handleEnchantExecute(socket0, { itemId: 'a1', bonusKey: 'str' }, { players: new Map([['s1', p0]]), inventories: new Map([['p1', makeMockInventory([item0])]]) });
    expect(socket0._find('enchant:result').data.cost).toBe(100);

    // enchantCount=4: 100 * 1 * (1 + 4*0.5) = 300
    const item4 = makeItem({ id: 'b1', level: 1, enchantCount: 4, bonuses: { str: 5 } });
    const socket4 = makeSocket();
    const p4 = makePlayer();
    handlers.handleEnchantExecute(socket4, { itemId: 'b1', bonusKey: 'str' }, { players: new Map([['s1', p4]]), inventories: new Map([['p1', makeMockInventory([item4])]]) });
    expect(socket4._find('enchant:result').data.cost).toBe(300);
  });
});
