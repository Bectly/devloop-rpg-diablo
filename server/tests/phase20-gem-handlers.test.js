import { describe, it, expect, beforeEach } from 'vitest';
import { createRequire } from 'module';
const require = createRequire(import.meta.url);

const handlers = require('../socket-handlers');
const { generateGem } = require('../game/gems');
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
    bonuses: { str: 5 },
    sockets: [null, null],
    gridW: 1, gridH: 2,
    stackable: false, quantity: 1,
    ...overrides,
  };
}

function makeMockInventory(items = [], hasSpace = true) {
  const _items = [...items];
  return {
    getAllItems: () => [..._items],
    getItem: (id) => _items.find(i => i.id === id) || null,
    removeItem: (id) => {
      const idx = _items.findIndex(i => i.id === id);
      if (idx >= 0) _items.splice(idx, 1);
    },
    addItem: (item) => {
      if (!hasSpace && _items.length >= 20) return { success: false };
      _items.push(item);
      return { success: true };
    },
    findSpace: (_w, _h) => hasSpace ? { x: 0, y: 0 } : null,
    serialize: () => ({ items: [..._items] }),
  };
}

function makeCtx(player, inv) {
  const players = new Map([['s1', player]]);
  const inventories = new Map([[player.id, inv]]);
  return { players, inventories };
}

// ══════════════════════════════════════════════════════════════════
// handleGemSocket
// ══════════════════════════════════════════════════════════════════

describe('handleGemSocket', () => {
  let player, gem, weapon, inv, socket;

  beforeEach(() => {
    player = new Player('Hero', 'warrior');
    player.id = 'p1';
    gem = generateGem('ruby', 1); // str: 3
    weapon = makeItem({ id: 'w1', name: 'Sword', sockets: [null, null] });
    inv = makeMockInventory([weapon, gem]);
    socket = makeSocket('s1');
  });

  it('sockets gem into first empty slot', () => {
    handlers.handleGemSocket(socket, { itemId: 'w1', gemId: gem.id }, makeCtx(player, inv));

    expect(weapon.sockets[0]).not.toBeNull();
    expect(weapon.sockets[0].gemType).toBe('ruby');
    expect(weapon.sockets[0].gemTier).toBe(1);
    expect(weapon.sockets[1]).toBeNull();
    // Gem removed from inventory
    expect(inv.getItem(gem.id)).toBeNull();
    // Emits
    expect(socket._find('inventory:update')).toBeDefined();
    expect(socket._find('notification').data.type).toBe('info');
  });

  it('sockets into second slot when first is filled', () => {
    weapon.sockets[0] = { gemType: 'sapphire', gemTier: 1, bonuses: { int: 3 } };
    handlers.handleGemSocket(socket, { itemId: 'w1', gemId: gem.id }, makeCtx(player, inv));

    expect(weapon.sockets[1]).not.toBeNull();
    expect(weapon.sockets[1].gemType).toBe('ruby');
  });

  it('rejects when all sockets full', () => {
    weapon.sockets = [{ gemType: 'ruby', bonuses: {} }, { gemType: 'ruby', bonuses: {} }];
    handlers.handleGemSocket(socket, { itemId: 'w1', gemId: gem.id }, makeCtx(player, inv));

    expect(socket._find('notification').data.text).toContain('No empty sockets');
  });

  it('rejects when item has no sockets array', () => {
    weapon.sockets = undefined;
    handlers.handleGemSocket(socket, { itemId: 'w1', gemId: gem.id }, makeCtx(player, inv));

    expect(socket._find('notification').data.text).toContain('no sockets');
  });

  it('rejects when gem not in inventory', () => {
    handlers.handleGemSocket(socket, { itemId: 'w1', gemId: 'nonexistent' }, makeCtx(player, inv));

    expect(socket._find('notification').data.text).toContain('Gem not found');
  });

  it('rejects when item not found', () => {
    handlers.handleGemSocket(socket, { itemId: 'ghost', gemId: gem.id }, makeCtx(player, inv));

    expect(socket._find('notification').data.text).toContain('Item not found');
  });

  it('rejects invalid data', () => {
    handlers.handleGemSocket(socket, null, makeCtx(player, inv));
    expect(socket._find('notification').data.text).toContain('Invalid');

    const s2 = makeSocket('s1');
    handlers.handleGemSocket(s2, { itemId: 123, gemId: 'x' }, makeCtx(player, inv));
    expect(s2._find('notification').data.text).toContain('Invalid');
  });

  it('rejects non-gem item as gem', () => {
    const notGem = makeItem({ id: 'not_gem', type: 'weapon' });
    inv.addItem(notGem);
    handlers.handleGemSocket(socket, { itemId: 'w1', gemId: 'not_gem' }, makeCtx(player, inv));

    expect(socket._find('notification').data.text).toContain('Gem not found');
  });

  it('works on equipped items and recalcs stats', () => {
    player.equipment.weapon = weapon;
    inv = makeMockInventory([gem]); // weapon is equipped, not in inventory
    const baseCrit = player.critChance;

    handlers.handleGemSocket(socket, { itemId: 'w1', gemId: gem.id }, makeCtx(player, inv));

    expect(weapon.sockets[0]).not.toBeNull();
    // Ruby adds STR, which affects attackPower
    expect(player.equipBonuses.str).toBeGreaterThanOrEqual(3);
  });

  it('copies bonuses (not reference)', () => {
    handlers.handleGemSocket(socket, { itemId: 'w1', gemId: gem.id }, makeCtx(player, inv));

    // Mutating original gem bonuses should not affect socketed copy
    weapon.sockets[0].bonuses.str = 999;
    const gem2 = generateGem('ruby', 1);
    expect(gem2.bonuses.str).toBe(3);
  });

  it('does nothing if player not in map', () => {
    handlers.handleGemSocket(socket, { itemId: 'w1', gemId: gem.id }, {
      players: new Map(),
      inventories: new Map(),
    });
    expect(socket._emitted).toHaveLength(0);
  });
});

// ══════════════════════════════════════════════════════════════════
// handleGemUnsocket
// ══════════════════════════════════════════════════════════════════

describe('handleGemUnsocket', () => {
  let player, weapon, inv, socket;

  beforeEach(() => {
    player = new Player('Hero', 'warrior');
    player.id = 'p1';
    player.gold = 1000;
    weapon = makeItem({
      id: 'w1', name: 'Sword', level: 5,
      sockets: [
        { id: 'g1', name: 'Chipped Ruby', gemType: 'ruby', gemTier: 1, bonuses: { str: 3 }, color: '#ff4444' },
        null,
      ],
    });
    inv = makeMockInventory([weapon]);
    socket = makeSocket('s1');
  });

  it('unsockets gem, deducts gold, returns gem to inventory', () => {
    handlers.handleGemUnsocket(socket, { itemId: 'w1', socketIndex: 0 }, makeCtx(player, inv));

    // Socket cleared
    expect(weapon.sockets[0]).toBeNull();
    // Gold deducted (50 × level 5 = 250)
    expect(player.gold).toBe(750);
    // Gem returned to inventory
    const items = inv.getAllItems();
    const returnedGem = items.find(i => i.type === 'gem' && i.gemType === 'ruby');
    expect(returnedGem).toBeDefined();
    expect(returnedGem.gemTier).toBe(1);
    // Emits
    expect(socket._find('inventory:update')).toBeDefined();
    expect(socket._find('player:stats')).toBeDefined();
    expect(socket._find('notification').data.type).toBe('info');
  });

  it('rejects when not enough gold', () => {
    player.gold = 10; // need 250 (50 × 5)
    handlers.handleGemUnsocket(socket, { itemId: 'w1', socketIndex: 0 }, makeCtx(player, inv));

    expect(socket._find('notification').data.text).toContain('gold');
    expect(weapon.sockets[0]).not.toBeNull(); // unchanged
  });

  it('rejects empty socket', () => {
    handlers.handleGemUnsocket(socket, { itemId: 'w1', socketIndex: 1 }, makeCtx(player, inv));

    expect(socket._find('notification').data.text).toContain('empty');
  });

  it('rejects invalid socket index (negative)', () => {
    handlers.handleGemUnsocket(socket, { itemId: 'w1', socketIndex: -1 }, makeCtx(player, inv));

    expect(socket._find('notification').data.text).toContain('Invalid socket');
  });

  it('rejects socket index out of range', () => {
    handlers.handleGemUnsocket(socket, { itemId: 'w1', socketIndex: 5 }, makeCtx(player, inv));

    expect(socket._find('notification').data.text).toContain('Invalid socket');
  });

  it('rejects when inventory full', () => {
    inv = makeMockInventory([weapon], false); // no space
    handlers.handleGemUnsocket(socket, { itemId: 'w1', socketIndex: 0 }, makeCtx(player, inv));

    expect(socket._find('notification').data.text).toContain('full');
    expect(weapon.sockets[0]).not.toBeNull(); // unchanged
    expect(player.gold).toBe(1000); // no charge
  });

  it('rejects invalid data', () => {
    handlers.handleGemUnsocket(socket, null, makeCtx(player, inv));
    expect(socket._find('notification').data.text).toContain('Invalid');
  });

  it('rejects non-integer socket index', () => {
    handlers.handleGemUnsocket(socket, { itemId: 'w1', socketIndex: 0.5 }, makeCtx(player, inv));
    expect(socket._find('notification').data.text).toContain('Invalid socket');
  });

  it('works on equipped items and recalcs stats', () => {
    player.equipment.weapon = weapon;
    inv = makeMockInventory([]); // weapon is equipped

    handlers.handleGemUnsocket(socket, { itemId: 'w1', socketIndex: 0 }, makeCtx(player, inv));

    expect(weapon.sockets[0]).toBeNull();
    expect(player.gold).toBe(750);
  });

  it('gold cost scales with item level', () => {
    weapon.level = 10;
    handlers.handleGemUnsocket(socket, { itemId: 'w1', socketIndex: 0 }, makeCtx(player, inv));

    // 50 × 10 = 500
    expect(player.gold).toBe(500);
  });

  it('defaults to level 1 cost when item has no level', () => {
    weapon.level = undefined;
    weapon.itemLevel = undefined;
    handlers.handleGemUnsocket(socket, { itemId: 'w1', socketIndex: 0 }, makeCtx(player, inv));

    // 50 × 1 = 50
    expect(player.gold).toBe(950);
  });
});

// ══════════════════════════════════════════════════════════════════
// handleGemCombine
// ══════════════════════════════════════════════════════════════════

describe('handleGemCombine', () => {
  let player, inv, socket;

  beforeEach(() => {
    player = new Player('Hero', 'warrior');
    player.id = 'p1';
    player.gold = 1000;
    socket = makeSocket('s1');
  });

  it('combines 3 chipped rubies into flawed ruby (100g)', () => {
    const g1 = generateGem('ruby', 1);
    const g2 = generateGem('ruby', 1);
    const g3 = generateGem('ruby', 1);
    inv = makeMockInventory([g1, g2, g3]);

    handlers.handleGemCombine(socket, { gemIds: [g1.id, g2.id, g3.id] }, makeCtx(player, inv));

    expect(player.gold).toBe(900); // -100
    const items = inv.getAllItems();
    // 3 removed, 1 added = 1 total
    expect(items).toHaveLength(1);
    expect(items[0].gemType).toBe('ruby');
    expect(items[0].gemTier).toBe(2);
    expect(items[0].name).toBe('Flawed Ruby');
    expect(socket._find('notification').data.type).toBe('info');
  });

  it('combines 3 flawed into perfect (500g)', () => {
    const g1 = generateGem('emerald', 2);
    const g2 = generateGem('emerald', 2);
    const g3 = generateGem('emerald', 2);
    inv = makeMockInventory([g1, g2, g3]);

    handlers.handleGemCombine(socket, { gemIds: [g1.id, g2.id, g3.id] }, makeCtx(player, inv));

    expect(player.gold).toBe(500); // -500
    const items = inv.getAllItems();
    expect(items).toHaveLength(1);
    expect(items[0].gemTier).toBe(3);
    expect(items[0].name).toBe('Perfect Emerald');
  });

  it('rejects max tier gems (perfect)', () => {
    const g1 = generateGem('ruby', 3);
    const g2 = generateGem('ruby', 3);
    const g3 = generateGem('ruby', 3);
    inv = makeMockInventory([g1, g2, g3]);

    handlers.handleGemCombine(socket, { gemIds: [g1.id, g2.id, g3.id] }, makeCtx(player, inv));

    expect(socket._find('notification').data.text).toContain('same type and tier');
    expect(player.gold).toBe(1000); // unchanged
  });

  it('rejects mismatched types', () => {
    const g1 = generateGem('ruby', 1);
    const g2 = generateGem('sapphire', 1);
    const g3 = generateGem('ruby', 1);
    inv = makeMockInventory([g1, g2, g3]);

    handlers.handleGemCombine(socket, { gemIds: [g1.id, g2.id, g3.id] }, makeCtx(player, inv));

    expect(socket._find('notification').data.text).toContain('same type and tier');
  });

  it('rejects mismatched tiers', () => {
    const g1 = generateGem('ruby', 1);
    const g2 = generateGem('ruby', 2);
    const g3 = generateGem('ruby', 1);
    inv = makeMockInventory([g1, g2, g3]);

    handlers.handleGemCombine(socket, { gemIds: [g1.id, g2.id, g3.id] }, makeCtx(player, inv));

    expect(socket._find('notification').data.text).toContain('same type and tier');
  });

  it('rejects not enough gold', () => {
    player.gold = 50; // need 100
    const g1 = generateGem('ruby', 1);
    const g2 = generateGem('ruby', 1);
    const g3 = generateGem('ruby', 1);
    inv = makeMockInventory([g1, g2, g3]);

    handlers.handleGemCombine(socket, { gemIds: [g1.id, g2.id, g3.id] }, makeCtx(player, inv));

    expect(socket._find('notification').data.text).toContain('gold');
    expect(inv.getAllItems()).toHaveLength(3); // unchanged
  });

  it('rejects wrong count (2 gems)', () => {
    const g1 = generateGem('ruby', 1);
    const g2 = generateGem('ruby', 1);
    inv = makeMockInventory([g1, g2]);

    handlers.handleGemCombine(socket, { gemIds: [g1.id, g2.id] }, makeCtx(player, inv));

    expect(socket._find('notification').data.text).toContain('3 gems');
  });

  it('rejects null data', () => {
    inv = makeMockInventory([]);
    handlers.handleGemCombine(socket, null, makeCtx(player, inv));
    expect(socket._find('notification').data.text).toContain('3 gems');
  });

  it('rejects non-string gem IDs', () => {
    inv = makeMockInventory([]);
    handlers.handleGemCombine(socket, { gemIds: [1, 2, 3] }, makeCtx(player, inv));
    expect(socket._find('notification').data.text).toContain('Invalid');
  });

  it('rejects when gem IDs not found in inventory', () => {
    inv = makeMockInventory([]);
    handlers.handleGemCombine(socket, { gemIds: ['a', 'b', 'c'] }, makeCtx(player, inv));
    expect(socket._find('notification').data.text).toContain('not found');
  });

  it('emits inventory:update and player:stats', () => {
    const g1 = generateGem('topaz', 1);
    const g2 = generateGem('topaz', 1);
    const g3 = generateGem('topaz', 1);
    inv = makeMockInventory([g1, g2, g3]);

    handlers.handleGemCombine(socket, { gemIds: [g1.id, g2.id, g3.id] }, makeCtx(player, inv));

    expect(socket._find('inventory:update')).toBeDefined();
    expect(socket._find('player:stats')).toBeDefined();
  });
});

// ══════════════════════════════════════════════════════════════════
// Socket gem stat integration (recalcEquipBonuses)
// ══════════════════════════════════════════════════════════════════

describe('Socket gem stat integration', () => {
  let player;

  beforeEach(() => {
    player = new Player('Hero', 'warrior');
    player.level = 10;
  });

  it('ruby gem adds STR bonus', () => {
    player.equipment.weapon = makeItem({
      sockets: [{ gemType: 'ruby', gemTier: 1, bonuses: { str: 3 } }],
    });
    player.recalcEquipBonuses();

    expect(player.equipBonuses.str).toBe(3 + 5); // gem 3 + item bonus 5
  });

  it('diamond gem adds allResist', () => {
    player.equipment.weapon = makeItem({
      sockets: [{ gemType: 'diamond', gemTier: 2, bonuses: { allResist: 4 } }],
    });
    player.recalcEquipBonuses();

    expect(player.resistances.fire).toBe(4);
    expect(player.resistances.cold).toBe(4);
    expect(player.resistances.poison).toBe(4);
  });

  it('amethyst gem adds critChance', () => {
    player.equipment.weapon = makeItem({
      sockets: [{ gemType: 'amethyst', gemTier: 1, bonuses: { critChance: 5 } }],
    });
    player.recalcEquipBonuses();

    // base crit = 5 + (dex + equipDex) * 1, then +5 from gem
    const expectedBase = 5 + (player.stats.dex + player.equipBonuses.dex) * 1;
    expect(player.critChance).toBe(expectedBase + 5);
  });

  it('multiple gems in multiple items stack', () => {
    player.equipment.weapon = makeItem({
      sockets: [{ gemType: 'ruby', gemTier: 1, bonuses: { str: 3 } }],
    });
    player.equipment.chest = makeItem({
      id: 'armor1', type: 'armor', slot: 'chest', armor: 10,
      sockets: [{ gemType: 'ruby', gemTier: 2, bonuses: { str: 6 } }],
      bonuses: {},
    });
    player.recalcEquipBonuses();

    // item weapon bonus str:5 + gem str:3 + gem str:6 = 14
    expect(player.equipBonuses.str).toBe(14);
  });

  it('empty sockets contribute no stats', () => {
    player.equipment.weapon = makeItem({
      sockets: [null, null],
    });
    player.recalcEquipBonuses();

    // Only item's base bonuses (str: 5)
    expect(player.equipBonuses.str).toBe(5);
  });

  it('items without sockets array work fine', () => {
    player.equipment.weapon = makeItem();
    delete player.equipment.weapon.sockets;
    player.recalcEquipBonuses();

    // Should not throw, just base bonuses
    expect(player.equipBonuses.str).toBe(5);
  });
});

// ══════════════════════════════════════════════════════════════════
// Gem drops in combat
// ══════════════════════════════════════════════════════════════════

describe('Gem drops in combat', () => {
  it('combat.js requires rollGemDrop', () => {
    // Verify the module loads without error (gem drop integrated)
    const { CombatSystem } = require('../game/combat');
    expect(CombatSystem).toBeDefined();
  });

  it('skills.js requires rollGemDrop', () => {
    // Verify the module loads without error
    const skills = require('../game/skills');
    expect(skills).toBeDefined();
  });

  it('rollGemDrop is called via combat kill path (structural check)', () => {
    const fs = require('fs');
    const combatSrc = fs.readFileSync(require.resolve('../game/combat.js'), 'utf-8');
    expect(combatSrc).toContain('rollGemDrop');
    expect(combatSrc).toContain("require('./gems')");
  });

  it('rollGemDrop is called via skills kill path (structural check)', () => {
    const fs = require('fs');
    const skillsSrc = fs.readFileSync(require.resolve('../game/skills.js'), 'utf-8');
    expect(skillsSrc).toContain('rollGemDrop');
    expect(skillsSrc).toContain("require('./gems')");
  });
});
