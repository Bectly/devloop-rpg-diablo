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

function makeCtx(player) {
  const players = new Map([['s1', player]]);
  return { players };
}

// ══════════════════════════════════════════════════════════════════
// handleLootFilter
// ══════════════════════════════════════════════════════════════════

describe('handleLootFilter', () => {
  let player, socket;

  beforeEach(() => {
    player = new Player('Hero', 'warrior');
    player.id = 'p1';
    socket = makeSocket('s1');
  });

  it('sets filter to basic', () => {
    handlers.handleLootFilter(socket, { mode: 'basic' }, makeCtx(player));

    expect(player.lootFilter).toBe('basic');
    const stats = socket._find('player:stats');
    expect(stats).toBeTruthy();
    expect(stats.data.lootFilter).toBe('basic');
  });

  it('sets filter to smart', () => {
    handlers.handleLootFilter(socket, { mode: 'smart' }, makeCtx(player));

    expect(player.lootFilter).toBe('smart');
  });

  it('sets filter to off', () => {
    player.lootFilter = 'smart';
    handlers.handleLootFilter(socket, { mode: 'off' }, makeCtx(player));

    expect(player.lootFilter).toBe('off');
  });

  it('cycles through all modes', () => {
    const modes = ['basic', 'smart', 'off'];
    for (const mode of modes) {
      handlers.handleLootFilter(socket, { mode }, makeCtx(player));
      expect(player.lootFilter).toBe(mode);
    }
  });

  it('rejects invalid mode', () => {
    handlers.handleLootFilter(socket, { mode: 'ultra' }, makeCtx(player));

    expect(player.lootFilter).toBe('off'); // unchanged
    const notif = socket._find('notification');
    expect(notif).toBeTruthy();
    expect(notif.data.type).toBe('error');
    expect(notif.data.text).toMatch(/invalid/i);
  });

  it('rejects null data', () => {
    handlers.handleLootFilter(socket, null, makeCtx(player));

    expect(player.lootFilter).toBe('off');
    const notif = socket._find('notification');
    expect(notif).toBeTruthy();
    expect(notif.data.type).toBe('error');
  });

  it('rejects undefined mode', () => {
    handlers.handleLootFilter(socket, {}, makeCtx(player));

    expect(player.lootFilter).toBe('off');
    const notif = socket._find('notification');
    expect(notif).toBeTruthy();
  });

  it('rejects empty string mode', () => {
    handlers.handleLootFilter(socket, { mode: '' }, makeCtx(player));

    expect(player.lootFilter).toBe('off');
  });

  it('emits notification with mode name', () => {
    handlers.handleLootFilter(socket, { mode: 'smart' }, makeCtx(player));

    const notif = socket._find('notification');
    expect(notif).toBeTruthy();
    expect(notif.data.text).toMatch(/SMART/);
    expect(notif.data.type).toBe('info');
  });

  it('does nothing for unknown socket', () => {
    const unknownSocket = makeSocket('unknown');
    handlers.handleLootFilter(unknownSocket, { mode: 'smart' }, makeCtx(player));

    expect(unknownSocket._emitted).toHaveLength(0);
  });
});

// ══════════════════════════════════════════════════════════════════
// Player lootFilter persistence
// ══════════════════════════════════════════════════════════════════

describe('Player lootFilter persistence', () => {
  it('defaults to off', () => {
    const player = new Player('Hero', 'warrior');
    expect(player.lootFilter).toBe('off');
  });

  it('serialize includes lootFilter', () => {
    const player = new Player('Hero', 'warrior');
    player.lootFilter = 'smart';
    const data = player.serialize();
    expect(data.lootFilter).toBe('smart');
  });

  it('serializeForPhone includes lootFilter', () => {
    const player = new Player('Hero', 'warrior');
    player.lootFilter = 'basic';
    const data = player.serializeForPhone();
    expect(data.lootFilter).toBe('basic');
  });

  it('restoreFrom restores lootFilter', () => {
    const player = new Player('Hero', 'warrior');
    player.restoreFrom({
      level: 5,
      lootFilter: 'smart',
      stats: {}, equipment: {}, gold: 100,
    });
    expect(player.lootFilter).toBe('smart');
  });

  it('restoreFrom defaults to off when missing', () => {
    const player = new Player('Hero', 'warrior');
    player.lootFilter = 'smart'; // pre-set
    player.restoreFrom({
      level: 5,
      stats: {}, equipment: {}, gold: 100,
    });
    expect(player.lootFilter).toBe('off');
  });

  it('full round-trip: set → serialize → restoreFrom', () => {
    const p1 = new Player('Hero', 'warrior');
    p1.lootFilter = 'basic';
    const saved = p1.serialize();

    const p2 = new Player('Hero', 'warrior');
    p2.restoreFrom(saved);
    expect(p2.lootFilter).toBe('basic');
  });
});
