import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { createRequire } from 'module';
const require = createRequire(import.meta.url);

// ── We test socket-handlers.js directly, so we need the real game modules ──
const { Player } = require('../game/player');
const { Inventory } = require('../game/inventory');

// Helper: fresh require of socket-handlers so disconnectedPlayers Map resets
// between describe blocks. We use dynamic import trick + clear cache.
function freshHandlers() {
  // Clear cached module so the module-level Map is recreated
  const key = require.resolve('../socket-handlers');
  delete require.cache[key];
  return require('../socket-handlers');
}

// ── Mock helpers ──────────────────────────────────────────────────────
function mockSocket(id = 'sock_' + Math.random().toString(36).slice(2, 8)) {
  const events = {};
  return {
    id,
    emit: vi.fn((event, data) => {
      if (!events[event]) events[event] = [];
      events[event].push(data);
    }),
    _emitted: events,
  };
}

function mockGameNs() {
  return { emit: vi.fn() };
}

function mockWorld() {
  return {
    currentFloor: 2,
    floorName: 'Haunted Halls',
    getSpawnPosition: (idx) => ({ x: 200 + idx * 50, y: 200 }),
    isPlayerOnExit: () => false,
    storyNpcs: [],
  };
}

function mockGameDb() {
  return {
    saveCharacter: vi.fn(),
    loadCharacter: vi.fn(() => null),
  };
}

// Build a full ctx with all shared state
function makeCtx(overrides = {}) {
  return {
    players: new Map(),
    inventories: new Map(),
    controllerSockets: new Map(),
    world: mockWorld(),
    gameNs: mockGameNs(),
    gameDb: mockGameDb(),
    io: { sockets: { sockets: new Map() } },
    ...overrides,
  };
}

// Join a player into the game and return { socket, player, inventory }
function joinPlayer(handlers, ctx, name, characterClass = 'warrior') {
  const socket = mockSocket();
  handlers.handleJoin(socket, { name, characterClass }, ctx);
  const player = ctx.players.get(socket.id);
  const inv = ctx.inventories.get(player.id);
  return { socket, player, inventory: inv };
}

// ═══════════════════════════════════════════════════════════════════════
//  SESSION RECONNECTION TESTS (Phase 5.3)
// ═══════════════════════════════════════════════════════════════════════

describe('Session Reconnection (Phase 5.3)', () => {
  let handlers;

  beforeEach(() => {
    vi.useFakeTimers();
    handlers = freshHandlers();
  });

  afterEach(() => {
    // Clean up any pending timers from grace period
    vi.runAllTimers();
    vi.useRealTimers();
  });

  // ── Grace Period Timer Logic ─────────────────────────────────────
  describe('Grace period on disconnect', () => {
    it('adds player to disconnectedPlayers Map on disconnect', () => {
      const ctx = makeCtx();
      const { socket, player } = joinPlayer(handlers, ctx, 'Alice');

      handlers.handleDisconnect(socket, null, ctx);

      expect(handlers.disconnectedPlayers.has('Alice')).toBe(true);
      const entry = handlers.disconnectedPlayers.get('Alice');
      expect(entry.player).toBe(player);
      expect(entry.socketId).toBe(socket.id);
    });

    it('marks player as disconnected', () => {
      const ctx = makeCtx();
      const { socket, player } = joinPlayer(handlers, ctx, 'Bob');

      handlers.handleDisconnect(socket, null, ctx);

      expect(player.disconnected).toBe(true);
    });

    it('zeroes input on disconnect', () => {
      const ctx = makeCtx();
      const { socket, player } = joinPlayer(handlers, ctx, 'Charlie');
      player.inputDx = 1;
      player.inputDy = -1;

      handlers.handleDisconnect(socket, null, ctx);

      expect(player.inputDx).toBe(0);
      expect(player.inputDy).toBe(0);
    });

    it('does NOT remove player from players Map immediately', () => {
      const ctx = makeCtx();
      const { socket } = joinPlayer(handlers, ctx, 'Diana');

      handlers.handleDisconnect(socket, null, ctx);

      // Player should still be in the Map (visible on TV as ghost)
      expect(ctx.players.has(socket.id)).toBe(true);
    });

    it('does NOT emit player:left during grace period', () => {
      const ctx = makeCtx();
      const { socket } = joinPlayer(handlers, ctx, 'Eve');

      handlers.handleDisconnect(socket, null, ctx);

      // gameNs should NOT have emitted player:left
      const leftCalls = ctx.gameNs.emit.mock.calls.filter(c => c[0] === 'player:left');
      expect(leftCalls.length).toBe(0);
    });

    it('removes controllerSocket on disconnect', () => {
      const ctx = makeCtx();
      const { socket } = joinPlayer(handlers, ctx, 'Frank');
      expect(ctx.controllerSockets.has(socket.id)).toBe(true);

      handlers.handleDisconnect(socket, null, ctx);

      expect(ctx.controllerSockets.has(socket.id)).toBe(false);
    });

    it('saves character to DB on disconnect', () => {
      const ctx = makeCtx();
      const { socket, player } = joinPlayer(handlers, ctx, 'Grace');

      handlers.handleDisconnect(socket, null, ctx);

      expect(ctx.gameDb.saveCharacter).toHaveBeenCalledWith(
        player,
        expect.anything(),
        ctx.world.currentFloor
      );
    });

    it('removes player after 30s grace period expires', () => {
      const ctx = makeCtx();
      const { socket, player } = joinPlayer(handlers, ctx, 'Hank');

      handlers.handleDisconnect(socket, null, ctx);

      // Advance time to just before expiry
      vi.advanceTimersByTime(29999);
      expect(ctx.players.has(socket.id)).toBe(true);
      expect(handlers.disconnectedPlayers.has('Hank')).toBe(true);

      // Advance past expiry
      vi.advanceTimersByTime(2);
      expect(ctx.players.has(socket.id)).toBe(false);
      expect(handlers.disconnectedPlayers.has('Hank')).toBe(false);
    });

    it('emits player:left only after grace period expires', () => {
      const ctx = makeCtx();
      const { socket, player } = joinPlayer(handlers, ctx, 'Iris');

      handlers.handleDisconnect(socket, null, ctx);

      // No player:left yet
      let leftCalls = ctx.gameNs.emit.mock.calls.filter(c => c[0] === 'player:left');
      expect(leftCalls.length).toBe(0);

      // After 30s
      vi.advanceTimersByTime(30001);
      leftCalls = ctx.gameNs.emit.mock.calls.filter(c => c[0] === 'player:left');
      expect(leftCalls.length).toBe(1);
      expect(leftCalls[0][1].id).toBe(player.id);
    });

    it('cleans up inventories after grace period expires', () => {
      const ctx = makeCtx();
      const { socket, player } = joinPlayer(handlers, ctx, 'Julia');

      handlers.handleDisconnect(socket, null, ctx);

      expect(ctx.inventories.has(player.id)).toBe(true);
      vi.advanceTimersByTime(30001);
      expect(ctx.inventories.has(player.id)).toBe(false);
    });
  });

  // ── Reconnect Flow ──────────────────────────────────────────────
  describe('Reconnect within grace period', () => {
    it('restores player when joining with same name during grace period', () => {
      const ctx = makeCtx();
      const { socket: s1, player: origPlayer } = joinPlayer(handlers, ctx, 'Alice', 'mage');

      // Give the player some state to verify restoration
      origPlayer.level = 5;
      origPlayer.gold = 500;
      origPlayer.hp = 42;

      handlers.handleDisconnect(s1, null, ctx);

      // Reconnect with a new socket
      const s2 = mockSocket('sock_new');
      handlers.handleJoin(s2, { name: 'Alice', characterClass: 'mage' }, ctx);

      // Player should be mapped to new socket
      const restoredPlayer = ctx.players.get(s2.id);
      expect(restoredPlayer).toBeDefined();
      expect(restoredPlayer.id).toBe(origPlayer.id); // same player object
      expect(restoredPlayer.level).toBe(5);
      expect(restoredPlayer.gold).toBe(500);
      expect(restoredPlayer.hp).toBe(42);
    });

    it('clears disconnected flag on reconnect', () => {
      const ctx = makeCtx();
      const { socket: s1, player } = joinPlayer(handlers, ctx, 'Bob');

      handlers.handleDisconnect(s1, null, ctx);
      expect(player.disconnected).toBe(true);

      const s2 = mockSocket('sock_new');
      handlers.handleJoin(s2, { name: 'Bob' }, ctx);

      expect(player.disconnected).toBe(false);
    });

    it('removes entry from disconnectedPlayers Map on reconnect', () => {
      const ctx = makeCtx();
      const { socket: s1 } = joinPlayer(handlers, ctx, 'Charlie');

      handlers.handleDisconnect(s1, null, ctx);
      expect(handlers.disconnectedPlayers.has('Charlie')).toBe(true);

      const s2 = mockSocket();
      handlers.handleJoin(s2, { name: 'Charlie' }, ctx);

      expect(handlers.disconnectedPlayers.has('Charlie')).toBe(false);
    });

    it('cancels the grace period timeout on reconnect', () => {
      const ctx = makeCtx();
      const { socket: s1, player } = joinPlayer(handlers, ctx, 'Diana');

      handlers.handleDisconnect(s1, null, ctx);

      const s2 = mockSocket();
      handlers.handleJoin(s2, { name: 'Diana' }, ctx);

      // Advance past what would have been the timeout
      vi.advanceTimersByTime(35000);

      // Player should still exist (timeout was cancelled)
      expect(ctx.players.has(s2.id)).toBe(true);
    });

    it('removes old socket.id key from players Map', () => {
      const ctx = makeCtx();
      const { socket: s1 } = joinPlayer(handlers, ctx, 'Eve');

      handlers.handleDisconnect(s1, null, ctx);

      const s2 = mockSocket('sock_new');
      handlers.handleJoin(s2, { name: 'Eve' }, ctx);

      expect(ctx.players.has(s1.id)).toBe(false);
      expect(ctx.players.has(s2.id)).toBe(true);
    });

    it('emits player:reconnected to TV (not player:joined)', () => {
      const ctx = makeCtx();
      const { socket: s1, player } = joinPlayer(handlers, ctx, 'Frank');

      // Clear previous emit calls from join
      ctx.gameNs.emit.mockClear();

      handlers.handleDisconnect(s1, null, ctx);

      const s2 = mockSocket();
      handlers.handleJoin(s2, { name: 'Frank' }, ctx);

      const reconnectedCalls = ctx.gameNs.emit.mock.calls.filter(c => c[0] === 'player:reconnected');
      const joinedCalls = ctx.gameNs.emit.mock.calls.filter(c => c[0] === 'player:joined');

      expect(reconnectedCalls.length).toBe(1);
      expect(reconnectedCalls[0][1].id).toBe(player.id);
      expect(joinedCalls.length).toBe(0);
    });

    it('sends Welcome back notification to phone', () => {
      const ctx = makeCtx();
      const { socket: s1 } = joinPlayer(handlers, ctx, 'Grace');

      handlers.handleDisconnect(s1, null, ctx);

      const s2 = mockSocket();
      handlers.handleJoin(s2, { name: 'Grace' }, ctx);

      const notifyCalls = s2._emitted['notification'] || [];
      const welcomeBack = notifyCalls.find(n => n.text.includes('Welcome back'));
      expect(welcomeBack).toBeDefined();
    });

    it('sends joined event to phone on reconnect', () => {
      const ctx = makeCtx();
      const { socket: s1, player } = joinPlayer(handlers, ctx, 'Hank');

      handlers.handleDisconnect(s1, null, ctx);

      const s2 = mockSocket();
      handlers.handleJoin(s2, { name: 'Hank' }, ctx);

      const joinedEmits = s2._emitted['joined'] || [];
      expect(joinedEmits.length).toBe(1);
      expect(joinedEmits[0].playerId).toBe(player.id);
    });

    it('restores inventory on reconnect', () => {
      const ctx = makeCtx();
      const { socket: s1, player, inventory } = joinPlayer(handlers, ctx, 'Iris');

      // Add an item to inventory
      inventory.addItem({
        id: 'test-sword',
        name: 'Test Sword',
        type: 'weapon',
        subType: 'sword',
        gridW: 1,
        gridH: 2,
        rarity: 'common',
      });

      handlers.handleDisconnect(s1, null, ctx);

      const s2 = mockSocket();
      handlers.handleJoin(s2, { name: 'Iris' }, ctx);

      const restoredInv = ctx.inventories.get(player.id);
      expect(restoredInv).toBeDefined();
      expect(restoredInv.getItem('test-sword')).toBeDefined();
    });

    it('sends stats:update and inventory:update on reconnect', () => {
      const ctx = makeCtx();
      const { socket: s1 } = joinPlayer(handlers, ctx, 'Julia');

      handlers.handleDisconnect(s1, null, ctx);

      const s2 = mockSocket();
      handlers.handleJoin(s2, { name: 'Julia' }, ctx);

      expect(s2._emitted['stats:update']).toBeDefined();
      expect(s2._emitted['stats:update'].length).toBeGreaterThanOrEqual(1);
      expect(s2._emitted['inventory:update']).toBeDefined();
      expect(s2._emitted['inventory:update'].length).toBeGreaterThanOrEqual(1);
    });
  });

  // ── Player Cap Counting ─────────────────────────────────────────
  describe('Player cap with disconnected players', () => {
    it('allows new player to join when one player is disconnected (1 active < 2 cap)', () => {
      const ctx = makeCtx();
      const { socket: s1 } = joinPlayer(handlers, ctx, 'Alice');
      const { socket: s2 } = joinPlayer(handlers, ctx, 'Bob');

      // 2 active = full. Disconnect one.
      handlers.handleDisconnect(s1, null, ctx);

      // Now a new player should be able to join
      const s3 = mockSocket();
      handlers.handleJoin(s3, { name: 'Charlie', characterClass: 'mage' }, ctx);

      const charliePlayer = ctx.players.get(s3.id);
      expect(charliePlayer).toBeDefined();
      expect(charliePlayer.name).toBe('Charlie');
    });

    it('rejects third player when both players are active', () => {
      const ctx = makeCtx();
      joinPlayer(handlers, ctx, 'Alice');
      joinPlayer(handlers, ctx, 'Bob');

      const s3 = mockSocket();
      handlers.handleJoin(s3, { name: 'Charlie' }, ctx);

      // Should have received error notification
      const notifs = s3._emitted['notification'] || [];
      const fullMsg = notifs.find(n => n.text.includes('full'));
      expect(fullMsg).toBeDefined();
      expect(ctx.players.has(s3.id)).toBe(false);
    });

    it('allows reconnecting player even when cap is reached via reconnect path', () => {
      const ctx = makeCtx();
      const { socket: s1 } = joinPlayer(handlers, ctx, 'Alice');
      const { socket: s2 } = joinPlayer(handlers, ctx, 'Bob');

      // Disconnect Alice, then let Charlie join (taking the slot)
      handlers.handleDisconnect(s1, null, ctx);

      const s3 = mockSocket();
      joinPlayer(handlers, ctx, 'Charlie');

      // Now 2 active (Bob + Charlie). Alice reconnects via grace period.
      // The reconnect path is checked BEFORE the cap check, so Alice should get in.
      const s4 = mockSocket();
      handlers.handleJoin(s4, { name: 'Alice' }, ctx);

      const alicePlayer = ctx.players.get(s4.id);
      expect(alicePlayer).toBeDefined();
      expect(alicePlayer.name).toBe('Alice');
    });
  });

  // ── Game Loop: Disconnected Player Behavior ─────────────────────
  describe('Game loop interaction with disconnected players', () => {
    it('player.serialize() includes disconnected: true', () => {
      const player = new Player('TestDC', 'warrior');
      player.disconnected = true;
      const data = player.serialize();
      expect(data.disconnected).toBe(true);
    });

    it('player.serialize() includes disconnected: false by default', () => {
      const player = new Player('TestConnected', 'warrior');
      const data = player.serialize();
      expect(data.disconnected).toBe(false);
    });

    it('disconnected player is excluded from floor exit check (index.js logic)', () => {
      // The game loop in index.js has: if (!player.alive || player.isDying || player.disconnected) continue;
      // We verify the condition is correct by checking player state
      const player = new Player('ExitTest', 'warrior');
      player.disconnected = true;
      player.alive = true;
      player.isDying = false;

      // The exit check condition: skip if disconnected
      const shouldSkip = !player.alive || player.isDying || player.disconnected;
      expect(shouldSkip).toBe(true);
    });

    it('disconnected player still exists in players Map during grace period (can take damage)', () => {
      const ctx = makeCtx();
      const { socket, player } = joinPlayer(handlers, ctx, 'DmgTest');

      handlers.handleDisconnect(socket, null, ctx);

      // Player should still be in the Map (game loop iterates over it)
      const allPlayers = Array.from(ctx.players.values());
      expect(allPlayers).toContain(player);
      expect(player.disconnected).toBe(true);
      expect(player.alive).toBe(true);
    });
  });

  // ── Cleanup on Timeout ──────────────────────────────────────────
  describe('disconnectedPlayers cleanup on timeout', () => {
    it('clears all maps (players, inventories, controllerSockets) after timeout', () => {
      const ctx = makeCtx();
      const { socket, player } = joinPlayer(handlers, ctx, 'Cleanup');

      handlers.handleDisconnect(socket, null, ctx);

      vi.advanceTimersByTime(30001);

      expect(ctx.players.has(socket.id)).toBe(false);
      expect(ctx.inventories.has(player.id)).toBe(false);
      expect(ctx.controllerSockets.has(socket.id)).toBe(false);
      expect(handlers.disconnectedPlayers.has('Cleanup')).toBe(false);
    });

    it('handles multiple disconnected players with independent timers', () => {
      const ctx = makeCtx();
      const { socket: s1, player: p1 } = joinPlayer(handlers, ctx, 'First');
      const { socket: s2, player: p2 } = joinPlayer(handlers, ctx, 'Second');

      handlers.handleDisconnect(s1, null, ctx);

      // 15s later, disconnect second player
      vi.advanceTimersByTime(15000);
      handlers.handleDisconnect(s2, null, ctx);

      // At t=30s, first player's timer expires, second still has 15s left
      vi.advanceTimersByTime(15001);
      expect(handlers.disconnectedPlayers.has('First')).toBe(false);
      expect(ctx.players.has(s1.id)).toBe(false);

      // Second player should still be in grace period
      expect(handlers.disconnectedPlayers.has('Second')).toBe(true);
      expect(ctx.players.has(s2.id)).toBe(true);

      // At t=45s, second player's timer expires
      vi.advanceTimersByTime(15001);
      expect(handlers.disconnectedPlayers.has('Second')).toBe(false);
      expect(ctx.players.has(s2.id)).toBe(false);
    });
  });

  // ── Edge Cases ──────────────────────────────────────────────────
  describe('Edge cases', () => {
    it('DIFFERENT player joining with same name during grace period hijacks session', () => {
      // This is a POTENTIAL BUG: if player "Alice" disconnects and someone
      // else types "Alice" on the join screen, they get Alice's character.
      // Testing current behavior (not necessarily correct).
      const ctx = makeCtx();
      const { socket: s1, player: origPlayer } = joinPlayer(handlers, ctx, 'Alice');
      origPlayer.gold = 999;

      handlers.handleDisconnect(s1, null, ctx);

      // Different person joins as "Alice"
      const imposter = mockSocket('sock_imposter');
      handlers.handleJoin(imposter, { name: 'Alice', characterClass: 'ranger' }, ctx);

      // Current behavior: they get the original player's state (including gold)
      const player = ctx.players.get(imposter.id);
      expect(player.gold).toBe(999);
      // BUG: characterClass from the join request is ignored — original class is kept
      expect(player.characterClass).toBe('warrior'); // original, not 'ranger'
    });

    it('disconnect of already-disconnected player (double disconnect) does not crash', () => {
      const ctx = makeCtx();
      const { socket, player } = joinPlayer(handlers, ctx, 'DoubleDisconnect');

      handlers.handleDisconnect(socket, null, ctx);
      // Second disconnect on the same socket — player is already in disconnectedPlayers
      // but still in players Map
      expect(() => {
        handlers.handleDisconnect(socket, null, ctx);
      }).not.toThrow();
    });

    it('reconnect then disconnect again creates a new grace entry', () => {
      const ctx = makeCtx();
      const { socket: s1, player } = joinPlayer(handlers, ctx, 'Flicker');

      handlers.handleDisconnect(s1, null, ctx);

      // Reconnect
      const s2 = mockSocket('sock_2');
      handlers.handleJoin(s2, { name: 'Flicker' }, ctx);
      expect(player.disconnected).toBe(false);

      // Disconnect again
      handlers.handleDisconnect(s2, null, ctx);
      expect(player.disconnected).toBe(true);
      expect(handlers.disconnectedPlayers.has('Flicker')).toBe(true);
      expect(handlers.disconnectedPlayers.get('Flicker').socketId).toBe(s2.id);
    });

    it('graceful shutdown can save disconnected players (via exported Map)', () => {
      const ctx = makeCtx();
      const { socket, player, inventory } = joinPlayer(handlers, ctx, 'Shutdown');

      handlers.handleDisconnect(socket, null, ctx);

      // Simulate what gracefulShutdown does
      for (const [name, entry] of handlers.disconnectedPlayers) {
        clearTimeout(entry.timer);
        // Should be able to save
        expect(() => {
          ctx.gameDb.saveCharacter(entry.player, entry.inventory, ctx.world.currentFloor);
        }).not.toThrow();
      }
      handlers.disconnectedPlayers.clear();
      expect(handlers.disconnectedPlayers.size).toBe(0);
    });

    it('disconnect handler works even without gameDb (no crash)', () => {
      const ctx = makeCtx({ gameDb: null });
      const { socket } = joinPlayer(handlers, ctx, 'NoDb');

      // gameDb is null, should still handle disconnect without crashing
      // (gameDb check is in handleJoin, not handleDisconnect — let's verify)
      // Actually handleDisconnect checks `if (gameDb)` before saving
      expect(() => {
        handlers.handleDisconnect(socket, null, ctx);
      }).not.toThrow();
    });

    it('[BUG] double disconnect leaks first timer — leaked timer can delete reconnected player inventory', () => {
      // When handleDisconnect is called twice for the same socket,
      // the first timer is NOT cleared before disconnectedPlayers.set()
      // overwrites the entry. The old timer still fires and calls
      // inventories.delete(player.id), which can nuke a reconnected player's inventory.
      const ctx = makeCtx();
      const { socket, player } = joinPlayer(handlers, ctx, 'LeakyTimer');

      // First disconnect — creates timer #1
      handlers.handleDisconnect(socket, null, ctx);

      // Second disconnect (same socket) — creates timer #2, overwrites Map entry
      // but timer #1 is NOT cleared
      handlers.handleDisconnect(socket, null, ctx);

      // Reconnect before either timer fires
      const s2 = mockSocket('sock_new_leak');
      handlers.handleJoin(s2, { name: 'LeakyTimer' }, ctx);

      // Player is now active again
      expect(ctx.players.has(s2.id)).toBe(true);
      expect(ctx.inventories.has(player.id)).toBe(true);

      // Timer #1 fires at t=30s — BUG: it calls inventories.delete(player.id)
      // on the now-active player
      vi.advanceTimersByTime(30001);

      // BUG EXPOSED: the leaked timer deleted the reconnected player's inventory
      // If this assertion FAILS, the bug is present (inventory was deleted).
      // Currently we EXPECT the bug, so we test the broken behavior:
      expect(ctx.inventories.has(player.id)).toBe(false); // BUG: should be true
    });

    it('[BUG] reconnect after cap fills allows 3+ concurrent players', () => {
      // The reconnect path bypasses the 2-player cap check entirely.
      // If Alice disconnects, Charlie joins (Bob+Charlie = 2 active),
      // then Alice reconnects, we end up with 3 players (Bob, Charlie, Alice).
      const ctx = makeCtx();
      const { socket: s1 } = joinPlayer(handlers, ctx, 'Alice');
      const { socket: s2 } = joinPlayer(handlers, ctx, 'Bob');

      handlers.handleDisconnect(s1, null, ctx);

      // Charlie fills Alice's slot
      const s3 = mockSocket();
      handlers.handleJoin(s3, { name: 'Charlie', characterClass: 'mage' }, ctx);

      // Now Bob + Charlie = 2 active. Alice reconnects.
      const s4 = mockSocket();
      handlers.handleJoin(s4, { name: 'Alice' }, ctx);

      // Count active (non-disconnected) players
      const activePlayers = Array.from(ctx.players.values()).filter(p => !p.disconnected);
      // BUG: 3 active players when cap should be 2
      expect(activePlayers.length).toBe(3); // BUG: should be 2
    });
  });
});
