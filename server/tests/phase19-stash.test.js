import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { createRequire } from 'module';
const require = createRequire(import.meta.url);

const { GameDatabase } = require('../game/database');
const handlers = require('../socket-handlers');

// ── Helpers ────────────────────────────────────────────────────────────────

function makeItem(overrides = {}) {
  return {
    id: `item_${Math.random().toString(36).slice(2, 8)}`,
    name: 'Test Sword',
    type: 'weapon',
    subType: 'sword',
    slot: 'weapon',
    rarity: 'rare',
    damage: 20,
    bonuses: { str: 5 },
    gridW: 1, gridH: 2,
    stackable: false, quantity: 1,
    ...overrides,
  };
}

function makeSocket(id = 'socket_1') {
  const emitted = [];
  return {
    id,
    emit: (ev, data) => emitted.push({ ev, data }),
    _emitted: emitted,
    _find: (ev) => emitted.find(e => e.ev === ev),
  };
}

function makeMockInventory(items = [], hasSpace = true) {
  const _items = [...items];
  return {
    getAllItems: () => [..._items],
    removeItem: (id) => {
      const idx = _items.findIndex(i => i.id === id);
      if (idx >= 0) _items.splice(idx, 1);
    },
    addItem: (item) => { _items.push(item); return { success: true }; },
    findSpace: (_w, _h) => hasSpace ? { x: 0, y: 0 } : null,
    serialize: () => ({ items: _items }),
  };
}

// ══════════════════════════════════════════════════════════════════════════
// GameDatabase — Shared Stash
// ══════════════════════════════════════════════════════════════════════════

describe('GameDatabase — Shared Stash', () => {
  let db;

  beforeEach(() => { db = new GameDatabase(':memory:'); });
  afterEach(() => { db.close(); });

  // ── stashItem ────────────────────────────────────────────────────

  describe('stashItem', () => {
    it('returns a slot number (0-19)', () => {
      const slot = db.stashItem(makeItem());
      expect(typeof slot).toBe('number');
      expect(slot).toBeGreaterThanOrEqual(0);
      expect(slot).toBeLessThan(20);
    });

    it('fills the first available slot starting at 0', () => {
      const slot = db.stashItem(makeItem());
      expect(slot).toBe(0);
    });

    it('increments slots for successive items', () => {
      const s1 = db.stashItem(makeItem());
      const s2 = db.stashItem(makeItem());
      expect(s1).toBe(0);
      expect(s2).toBe(1);
    });

    it('returns null when stash is full (20 items)', () => {
      for (let i = 0; i < 20; i++) db.stashItem(makeItem({ id: `item_${i}` }));
      const overflow = db.stashItem(makeItem({ id: 'overflow' }));
      expect(overflow).toBeNull();
    });

    it('preserves all item fields through JSON round-trip', () => {
      const item = makeItem({ name: 'RoundTrip Axe', damage: 99, bonuses: { str: 7, dex: 3 } });
      db.stashItem(item);
      const stash = db.getStash();
      expect(stash[0].item.name).toBe('RoundTrip Axe');
      expect(stash[0].item.damage).toBe(99);
      expect(stash[0].item.bonuses).toEqual({ str: 7, dex: 3 });
    });
  });

  // ── stashItemAt ──────────────────────────────────────────────────

  describe('stashItemAt', () => {
    it('stores item at specified slot', () => {
      const item = makeItem({ name: 'Slot10 Item' });
      const result = db.stashItemAt(10, item);
      expect(result).toBe(true);
      const stash = db.getStash();
      expect(stash).toHaveLength(1);
      expect(stash[0].slot).toBe(10);
      expect(stash[0].item.name).toBe('Slot10 Item');
    });

    it('returns false for slot < 0', () => {
      expect(db.stashItemAt(-1, makeItem())).toBe(false);
    });

    it('returns false for slot >= 20', () => {
      expect(db.stashItemAt(20, makeItem())).toBe(false);
    });

    it('accepts slot 0 (boundary)', () => {
      expect(db.stashItemAt(0, makeItem())).toBe(true);
    });

    it('accepts slot 19 (boundary)', () => {
      expect(db.stashItemAt(19, makeItem())).toBe(true);
    });

    it('overwrites existing item in same slot', () => {
      db.stashItemAt(5, makeItem({ name: 'Old' }));
      db.stashItemAt(5, makeItem({ name: 'New' }));
      const stash = db.getStash();
      expect(stash).toHaveLength(1);
      expect(stash[0].item.name).toBe('New');
    });
  });

  // ── unstashItem ──────────────────────────────────────────────────

  describe('unstashItem', () => {
    it('returns the stored item', () => {
      const item = makeItem({ name: 'Recover Me', damage: 42 });
      db.stashItem(item);
      const recovered = db.unstashItem(0);
      expect(recovered).not.toBeNull();
      expect(recovered.name).toBe('Recover Me');
      expect(recovered.damage).toBe(42);
    });

    it('removes the item from stash after retrieval', () => {
      db.stashItem(makeItem());
      db.unstashItem(0);
      expect(db.getStash()).toHaveLength(0);
    });

    it('returns null for empty slot', () => {
      expect(db.unstashItem(0)).toBeNull();
    });

    it('returns null for slot that was already retrieved', () => {
      db.stashItem(makeItem());
      db.unstashItem(0);
      expect(db.unstashItem(0)).toBeNull();
    });

    it('only removes the specified slot, not others', () => {
      const a = makeItem({ id: 'a', name: 'Alpha' });
      const b = makeItem({ id: 'b', name: 'Beta' });
      db.stashItem(a); // slot 0
      db.stashItem(b); // slot 1
      db.unstashItem(0);
      const stash = db.getStash();
      expect(stash).toHaveLength(1);
      expect(stash[0].item.name).toBe('Beta');
    });
  });

  // ── getStash ─────────────────────────────────────────────────────

  describe('getStash', () => {
    it('returns empty array on fresh DB', () => {
      expect(db.getStash()).toEqual([]);
    });

    it('returns array of { slot, item } objects', () => {
      db.stashItem(makeItem({ name: 'Blade' }));
      const stash = db.getStash();
      expect(stash).toHaveLength(1);
      expect(stash[0]).toHaveProperty('slot');
      expect(stash[0]).toHaveProperty('item');
    });

    it('returns items ordered by slot ASC', () => {
      db.stashItemAt(5, makeItem({ name: 'Five' }));
      db.stashItemAt(2, makeItem({ name: 'Two' }));
      db.stashItemAt(9, makeItem({ name: 'Nine' }));
      const stash = db.getStash();
      expect(stash[0].slot).toBe(2);
      expect(stash[1].slot).toBe(5);
      expect(stash[2].slot).toBe(9);
    });

    it('does not mutate DB on read (re-reads give same result)', () => {
      db.stashItem(makeItem());
      const first = db.getStash();
      const second = db.getStash();
      expect(first).toHaveLength(1);
      expect(second).toHaveLength(1);
    });
  });

  // ── getStashCount ────────────────────────────────────────────────

  describe('getStashCount', () => {
    it('returns 0 on fresh DB', () => {
      expect(db.getStashCount()).toBe(0);
    });

    it('returns accurate count after storing items', () => {
      db.stashItem(makeItem());
      db.stashItem(makeItem());
      db.stashItem(makeItem());
      expect(db.getStashCount()).toBe(3);
    });

    it('decrements after retrieval', () => {
      db.stashItem(makeItem()); // slot 0
      db.stashItem(makeItem()); // slot 1
      db.unstashItem(0);
      expect(db.getStashCount()).toBe(1);
    });

    it('returns 20 when stash is full', () => {
      for (let i = 0; i < 20; i++) db.stashItem(makeItem({ id: `fill_${i}` }));
      expect(db.getStashCount()).toBe(20);
    });
  });
});

// ══════════════════════════════════════════════════════════════════════════
// Socket Handlers — Stash
// ══════════════════════════════════════════════════════════════════════════

describe('handleStashList', () => {
  let db;
  beforeEach(() => { db = new GameDatabase(':memory:'); });
  afterEach(() => { db.close(); });

  it('emits stash:update with empty items on fresh DB', () => {
    const socket = makeSocket('s1');
    const player = { id: 'p1', name: 'Hero' };
    const players = new Map([['s1', player]]);
    handlers.handleStashList(socket, null, { players, gameDb: db });
    const ev = socket._find('stash:update');
    expect(ev).toBeDefined();
    expect(ev.data.items).toEqual([]);
  });

  it('emits stash:update with stored items', () => {
    const item = makeItem({ name: 'Listed Item' });
    db.stashItem(item);
    const socket = makeSocket('s1');
    const player = { id: 'p1', name: 'Hero' };
    const players = new Map([['s1', player]]);
    handlers.handleStashList(socket, null, { players, gameDb: db });
    const ev = socket._find('stash:update');
    expect(ev.data.items).toHaveLength(1);
    expect(ev.data.items[0].item.name).toBe('Listed Item');
  });

  it('does nothing if player not in map', () => {
    const socket = makeSocket('s1');
    handlers.handleStashList(socket, null, { players: new Map(), gameDb: db });
    expect(socket._emitted).toHaveLength(0);
  });

  it('does nothing if gameDb is null', () => {
    const socket = makeSocket('s1');
    const players = new Map([['s1', { id: 'p1', name: 'Hero' }]]);
    handlers.handleStashList(socket, null, { players, gameDb: null });
    expect(socket._emitted).toHaveLength(0);
  });
});

describe('handleStashStore', () => {
  let db;
  beforeEach(() => { db = new GameDatabase(':memory:'); });
  afterEach(() => { db.close(); });

  function makeCtx(player, inv) {
    const players = new Map([['s1', player]]);
    const inventories = new Map([[player.id, inv]]);
    return { players, inventories, gameDb: db };
  }

  it('stores item by itemId, removes from inventory, emits updates', () => {
    const item = makeItem({ id: 'sword_1', name: 'Test Blade' });
    const inv = makeMockInventory([item]);
    const player = { id: 'p1', name: 'Hero' };
    const socket = makeSocket('s1');

    handlers.handleStashStore(socket, { itemId: 'sword_1' }, makeCtx(player, inv));

    // stash should have the item
    expect(db.getStashCount()).toBe(1);
    expect(db.getStash()[0].item.id).toBe('sword_1');

    // inventory:update and stash:update emitted
    expect(socket._find('inventory:update')).toBeDefined();
    expect(socket._find('stash:update')).toBeDefined();

    // notification emitted
    const notif = socket._find('notification');
    expect(notif).toBeDefined();
    expect(notif.data.type).toBe('info');
    expect(notif.data.text).toMatch(/stash/i);
  });

  it('stores item by inventoryIndex', () => {
    const item = makeItem({ id: 'ring_1' });
    const inv = makeMockInventory([item]);
    const player = { id: 'p1', name: 'Hero' };
    const socket = makeSocket('s1');

    handlers.handleStashStore(socket, { inventoryIndex: 0 }, makeCtx(player, inv));

    expect(db.getStashCount()).toBe(1);
    expect(socket._find('stash:update')).toBeDefined();
  });

  it('emits error notification if itemId not found', () => {
    const inv = makeMockInventory([]);
    const player = { id: 'p1', name: 'Hero' };
    const socket = makeSocket('s1');

    handlers.handleStashStore(socket, { itemId: 'ghost_id' }, makeCtx(player, inv));

    const notif = socket._find('notification');
    expect(notif).toBeDefined();
    expect(notif.data.type).toBe('error');
    expect(db.getStashCount()).toBe(0);
  });

  it('emits error notification if stash is full (20 items)', () => {
    for (let i = 0; i < 20; i++) db.stashItem(makeItem({ id: `fill_${i}` }));

    const item = makeItem({ id: 'extra' });
    const inv = makeMockInventory([item]);
    const player = { id: 'p1', name: 'Hero' };
    const socket = makeSocket('s1');

    handlers.handleStashStore(socket, { itemId: 'extra' }, makeCtx(player, inv));

    const notif = socket._find('notification');
    expect(notif.data.type).toBe('error');
    expect(notif.data.text).toMatch(/full/i);
    // item should still be in inventory (not removed)
    expect(inv.getAllItems()).toHaveLength(1);
  });

  it('does nothing if player not in map', () => {
    const socket = makeSocket('s1');
    const players = new Map();
    const inventories = new Map();
    handlers.handleStashStore(socket, { itemId: 'x' }, { players, inventories, gameDb: db });
    expect(socket._emitted).toHaveLength(0);
  });

  it('does nothing if gameDb is null', () => {
    const socket = makeSocket('s1');
    const player = { id: 'p1', name: 'Hero' };
    const players = new Map([['s1', player]]);
    const inv = makeMockInventory([makeItem()]);
    const inventories = new Map([['p1', inv]]);
    handlers.handleStashStore(socket, { itemId: 'x' }, { players, inventories, gameDb: null });
    expect(socket._emitted).toHaveLength(0);
  });
});

describe('handleStashRetrieve', () => {
  let db;
  beforeEach(() => { db = new GameDatabase(':memory:'); });
  afterEach(() => { db.close(); });

  function makeCtx(player, inv) {
    const players = new Map([['s1', player]]);
    const inventories = new Map([[player.id, inv]]);
    return { players, inventories, gameDb: db };
  }

  it('retrieves item from stash into inventory', () => {
    const item = makeItem({ id: 'axe_1', name: 'Stash Axe' });
    db.stashItem(item); // goes to slot 0
    const inv = makeMockInventory([], true);
    const player = { id: 'p1', name: 'Hero' };
    const socket = makeSocket('s1');

    handlers.handleStashRetrieve(socket, { slot: 0 }, makeCtx(player, inv));

    expect(db.getStashCount()).toBe(0);
    expect(inv.getAllItems()).toHaveLength(1);
    expect(inv.getAllItems()[0].name).toBe('Stash Axe');

    expect(socket._find('inventory:update')).toBeDefined();
    expect(socket._find('stash:update')).toBeDefined();
    const notif = socket._find('notification');
    expect(notif.data.type).toBe('info');
    expect(notif.data.text).toMatch(/retrieved/i);
  });

  it('emits error for slot < 0', () => {
    const inv = makeMockInventory([], true);
    const player = { id: 'p1', name: 'Hero' };
    const socket = makeSocket('s1');

    handlers.handleStashRetrieve(socket, { slot: -1 }, makeCtx(player, inv));

    const notif = socket._find('notification');
    expect(notif.data.type).toBe('error');
  });

  it('emits error for slot >= 20', () => {
    const inv = makeMockInventory([], true);
    const player = { id: 'p1', name: 'Hero' };
    const socket = makeSocket('s1');

    handlers.handleStashRetrieve(socket, { slot: 20 }, makeCtx(player, inv));

    expect(socket._find('notification').data.type).toBe('error');
  });

  it('emits error for empty slot', () => {
    const inv = makeMockInventory([], true);
    const player = { id: 'p1', name: 'Hero' };
    const socket = makeSocket('s1');

    handlers.handleStashRetrieve(socket, { slot: 5 }, makeCtx(player, inv)); // slot 5 empty

    const notif = socket._find('notification');
    expect(notif.data.type).toBe('error');
    expect(notif.data.text).toMatch(/empty/i);
  });

  it('emits error if inventory is full (findSpace returns null)', () => {
    const item = makeItem({ id: 'blocked' });
    db.stashItem(item);
    const inv = makeMockInventory([], false); // hasSpace = false
    const player = { id: 'p1', name: 'Hero' };
    const socket = makeSocket('s1');

    handlers.handleStashRetrieve(socket, { slot: 0 }, makeCtx(player, inv));

    const notif = socket._find('notification');
    expect(notif.data.type).toBe('error');
    expect(notif.data.text).toMatch(/full/i);
    // item stays in stash
    expect(db.getStashCount()).toBe(1);
  });

  it('does nothing if player not in map', () => {
    const socket = makeSocket('s1');
    handlers.handleStashRetrieve(socket, { slot: 0 }, {
      players: new Map(), inventories: new Map(), gameDb: db,
    });
    expect(socket._emitted).toHaveLength(0);
  });

  it('does nothing if gameDb is null', () => {
    const socket = makeSocket('s1');
    const player = { id: 'p1', name: 'Hero' };
    const players = new Map([['s1', player]]);
    const inv = makeMockInventory([]);
    const inventories = new Map([['p1', inv]]);
    handlers.handleStashRetrieve(socket, { slot: 0 }, { players, inventories, gameDb: null });
    expect(socket._emitted).toHaveLength(0);
  });
});
