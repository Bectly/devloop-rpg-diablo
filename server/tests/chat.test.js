import { describe, it, expect, beforeEach, vi } from 'vitest';
import { createRequire } from 'module';
const require = createRequire(import.meta.url);
const handlers = require('../socket-handlers');

// ── Helpers ──

function makePlayer(name = 'TestHero') {
  return {
    id: `player_${name}`,
    name,
    _lastChatTime: 0,
  };
}

function makeSocket(id = 'socket_1') {
  return { id };
}

function makeCtx(players = new Map()) {
  const emitted = { game: [], controller: [] };
  return {
    players,
    gameNs: { emit: (ev, data) => emitted.game.push({ ev, data }) },
    controllerNs: { emit: (ev, data) => emitted.controller.push({ ev, data }) },
    _emitted: emitted,
  };
}

// ── handleChat ──

describe('handleChat', () => {
  let socket, player, ctx;

  beforeEach(() => {
    socket = makeSocket('sock_1');
    player = makePlayer('Hero');
    const players = new Map();
    players.set('sock_1', player);
    ctx = makeCtx(players);
  });

  // ── Validation ──

  describe('validation', () => {
    it('rejects if player not found', () => {
      const emptyCtx = makeCtx(new Map());
      handlers.handleChat(socket, { text: 'hello' }, emptyCtx);
      expect(emptyCtx._emitted.game).toHaveLength(0);
      expect(emptyCtx._emitted.controller).toHaveLength(0);
    });

    it('rejects if text is not a string', () => {
      handlers.handleChat(socket, { text: 123 }, ctx);
      expect(ctx._emitted.game).toHaveLength(0);
    });

    it('rejects if text is undefined', () => {
      handlers.handleChat(socket, {}, ctx);
      expect(ctx._emitted.game).toHaveLength(0);
    });

    it('rejects if text is null', () => {
      handlers.handleChat(socket, { text: null }, ctx);
      expect(ctx._emitted.game).toHaveLength(0);
    });

    it('rejects empty text after trim', () => {
      handlers.handleChat(socket, { text: '   ' }, ctx);
      expect(ctx._emitted.game).toHaveLength(0);
    });

    it('rejects text longer than 100 chars', () => {
      handlers.handleChat(socket, { text: 'a'.repeat(101) }, ctx);
      expect(ctx._emitted.game).toHaveLength(0);
    });

    it('accepts text exactly 100 chars', () => {
      handlers.handleChat(socket, { text: 'b'.repeat(100) }, ctx);
      expect(ctx._emitted.game).toHaveLength(1);
    });

    it('trims whitespace from text', () => {
      handlers.handleChat(socket, { text: '  hello world  ' }, ctx);
      expect(ctx._emitted.game).toHaveLength(1);
      expect(ctx._emitted.game[0].data.text).toBe('hello world');
    });
  });

  // ── Rate limiting ──

  describe('rate limiting', () => {
    it('allows first message', () => {
      handlers.handleChat(socket, { text: 'first' }, ctx);
      expect(ctx._emitted.game).toHaveLength(1);
    });

    it('blocks second message within 1 second', () => {
      handlers.handleChat(socket, { text: 'first' }, ctx);
      handlers.handleChat(socket, { text: 'second' }, ctx);
      expect(ctx._emitted.game).toHaveLength(1);
      expect(ctx._emitted.game[0].data.text).toBe('first');
    });

    it('allows message after 1 second cooldown', () => {
      handlers.handleChat(socket, { text: 'first' }, ctx);
      // Simulate 1.1 second passing
      player._lastChatTime = Date.now() - 1100;
      handlers.handleChat(socket, { text: 'second' }, ctx);
      expect(ctx._emitted.game).toHaveLength(2);
    });

    it('rate limit is per-player (different players can chat simultaneously)', () => {
      const socket2 = makeSocket('sock_2');
      const player2 = makePlayer('Villain');
      ctx.players.set('sock_2', player2);

      handlers.handleChat(socket, { text: 'hello' }, ctx);
      handlers.handleChat(socket2, { text: 'hi back' }, ctx);
      expect(ctx._emitted.game).toHaveLength(2);
    });
  });

  // ── Broadcast ──

  describe('broadcast', () => {
    it('emits to both game and controller namespaces', () => {
      handlers.handleChat(socket, { text: 'gg' }, ctx);
      expect(ctx._emitted.game).toHaveLength(1);
      expect(ctx._emitted.controller).toHaveLength(1);
    });

    it('game event has correct structure', () => {
      handlers.handleChat(socket, { text: 'test msg' }, ctx);
      const ev = ctx._emitted.game[0];
      expect(ev.ev).toBe('chat:message');
      expect(ev.data).toHaveProperty('name', 'Hero');
      expect(ev.data).toHaveProperty('text', 'test msg');
      expect(ev.data).toHaveProperty('timestamp');
      expect(ev.data).toHaveProperty('playerId', player.id);
      expect(typeof ev.data.timestamp).toBe('number');
    });

    it('controller event has correct structure', () => {
      handlers.handleChat(socket, { text: 'test msg' }, ctx);
      const ev = ctx._emitted.controller[0];
      expect(ev.ev).toBe('chat:message');
      expect(ev.data).toHaveProperty('name', 'Hero');
      expect(ev.data).toHaveProperty('text', 'test msg');
      expect(ev.data).toHaveProperty('timestamp');
    });

    it('uses player name from player object, not from data', () => {
      handlers.handleChat(socket, { text: 'hi', name: 'Hacker' }, ctx);
      expect(ctx._emitted.game[0].data.name).toBe('Hero');
    });
  });

  // ── Edge cases ──

  describe('edge cases', () => {
    it('handles special characters in text', () => {
      handlers.handleChat(socket, { text: '<script>alert("xss")</script>' }, ctx);
      expect(ctx._emitted.game).toHaveLength(1);
      // Text is passed through as-is (HTML escaping happens on client)
      expect(ctx._emitted.game[0].data.text).toBe('<script>alert("xss")</script>');
    });

    it('handles emoji in text', () => {
      handlers.handleChat(socket, { text: 'GG! 🎉🔥' }, ctx);
      expect(ctx._emitted.game).toHaveLength(1);
      expect(ctx._emitted.game[0].data.text).toBe('GG! 🎉🔥');
    });

    it('handles newlines in text (trims to single line via trim)', () => {
      handlers.handleChat(socket, { text: 'line1\nline2' }, ctx);
      expect(ctx._emitted.game).toHaveLength(1);
      // trim() doesn't remove inner newlines — that's fine, client handles display
      expect(ctx._emitted.game[0].data.text).toBe('line1\nline2');
    });

    it('single character message is accepted', () => {
      handlers.handleChat(socket, { text: 'k' }, ctx);
      expect(ctx._emitted.game).toHaveLength(1);
    });
  });
});
