import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { createRequire } from 'module';
const require = createRequire(import.meta.url);
const { GameDatabase } = require('../game/database');
const handlers = require('../socket-handlers');

// ── Database Leaderboard Tests ──────────────────────────────────

describe('GameDatabase — Leaderboard', () => {
  let db;

  beforeEach(() => {
    db = new GameDatabase(':memory:');
  });

  afterEach(() => {
    db.close();
  });

  // ── recordRun ───────────────────────────────────────────────

  describe('recordRun', () => {
    it('inserts a run entry', () => {
      db.recordRun('Hero', 'warrior', 10, 7, 45, 1200, 360, 1);
      const runs = db.getTopRuns();
      expect(runs).toHaveLength(1);
      expect(runs[0].player_name).toBe('Hero');
      expect(runs[0].character_class).toBe('warrior');
      expect(runs[0].level).toBe(10);
      expect(runs[0].floor_reached).toBe(7);
      expect(runs[0].kills).toBe(45);
      expect(runs[0].gold_earned).toBe(1200);
      expect(runs[0].time_seconds).toBe(360);
      expect(runs[0].victory).toBe(1);
    });

    it('allows multiple runs for the same player', () => {
      db.recordRun('Hero', 'warrior', 5, 3, 10, 200, 120, 0);
      db.recordRun('Hero', 'warrior', 10, 7, 45, 1200, 360, 1);
      const runs = db.getTopRuns();
      expect(runs).toHaveLength(2);
    });

    it('stores created_at timestamp automatically', () => {
      db.recordRun('Hero', 'warrior', 1, 1, 0, 0, 60, 0);
      const runs = db.getTopRuns();
      expect(runs[0]).toHaveProperty('created_at');
      expect(runs[0].created_at).toBeTruthy();
    });

    it('assigns auto-increment id', () => {
      db.recordRun('A', 'warrior', 1, 1, 0, 0, 60, 0);
      db.recordRun('B', 'mage', 2, 2, 5, 100, 120, 0);
      const runs = db.getTopRuns();
      const ids = runs.map(r => r.id);
      expect(ids[0]).not.toBe(ids[1]);
    });
  });

  // ── getTopRuns ──────────────────────────────────────────────

  describe('getTopRuns', () => {
    it('returns empty array when no runs exist', () => {
      expect(db.getTopRuns()).toEqual([]);
    });

    it('returns max 10 entries', () => {
      for (let i = 0; i < 15; i++) {
        db.recordRun(`Player${i}`, 'warrior', i + 1, i + 1, i * 5, i * 100, 300 + i * 10, i >= 10 ? 1 : 0);
      }
      const runs = db.getTopRuns();
      expect(runs).toHaveLength(10);
    });

    it('sorts victories first', () => {
      db.recordRun('Loser', 'warrior', 10, 7, 100, 5000, 200, 0);
      db.recordRun('Winner', 'mage', 5, 7, 30, 500, 600, 1);
      const runs = db.getTopRuns();
      expect(runs[0].player_name).toBe('Winner');
      expect(runs[0].victory).toBe(1);
      expect(runs[1].player_name).toBe('Loser');
    });

    it('sorts by floor_reached DESC for same victory status', () => {
      db.recordRun('Floor3', 'warrior', 3, 3, 10, 100, 200, 0);
      db.recordRun('Floor5', 'mage', 5, 5, 20, 200, 200, 0);
      db.recordRun('Floor7', 'ranger', 7, 7, 30, 300, 200, 0);
      const runs = db.getTopRuns();
      expect(runs[0].player_name).toBe('Floor7');
      expect(runs[1].player_name).toBe('Floor5');
      expect(runs[2].player_name).toBe('Floor3');
    });

    it('sorts by time_seconds ASC for same victory + floor', () => {
      db.recordRun('Slow', 'warrior', 10, 7, 30, 500, 600, 1);
      db.recordRun('Fast', 'warrior', 10, 7, 30, 500, 300, 1);
      db.recordRun('Medium', 'warrior', 10, 7, 30, 500, 450, 1);
      const runs = db.getTopRuns();
      expect(runs[0].player_name).toBe('Fast');
      expect(runs[1].player_name).toBe('Medium');
      expect(runs[2].player_name).toBe('Slow');
    });

    it('has all expected fields in returned entries', () => {
      db.recordRun('Hero', 'warrior', 10, 7, 45, 1200, 360, 1);
      const run = db.getTopRuns()[0];
      expect(run).toHaveProperty('id');
      expect(run).toHaveProperty('player_name');
      expect(run).toHaveProperty('character_class');
      expect(run).toHaveProperty('level');
      expect(run).toHaveProperty('floor_reached');
      expect(run).toHaveProperty('kills');
      expect(run).toHaveProperty('gold_earned');
      expect(run).toHaveProperty('time_seconds');
      expect(run).toHaveProperty('victory');
      expect(run).toHaveProperty('created_at');
    });
  });

  // ── getPersonalRuns ─────────────────────────────────────────

  describe('getPersonalRuns', () => {
    it('returns empty array for unknown player', () => {
      expect(db.getPersonalRuns('Ghost')).toEqual([]);
    });

    it('returns only runs for the specified player', () => {
      db.recordRun('Hero', 'warrior', 10, 7, 45, 1200, 360, 1);
      db.recordRun('Villain', 'mage', 8, 6, 30, 800, 400, 0);
      db.recordRun('Hero', 'warrior', 5, 3, 10, 200, 120, 0);

      const heroRuns = db.getPersonalRuns('Hero');
      expect(heroRuns).toHaveLength(2);
      expect(heroRuns.every(r => r.player_name === 'Hero')).toBe(true);

      const villainRuns = db.getPersonalRuns('Villain');
      expect(villainRuns).toHaveLength(1);
      expect(villainRuns[0].player_name).toBe('Villain');
    });

    it('returns max 5 entries', () => {
      for (let i = 0; i < 8; i++) {
        db.recordRun('Grinder', 'warrior', i + 1, i + 1, i * 5, i * 100, 300 + i, 0);
      }
      expect(db.getPersonalRuns('Grinder')).toHaveLength(5);
    });

    it('sorts by victory DESC, floor DESC, time ASC', () => {
      db.recordRun('Hero', 'warrior', 5, 3, 10, 200, 200, 0);
      db.recordRun('Hero', 'warrior', 10, 7, 45, 1200, 500, 1);
      db.recordRun('Hero', 'warrior', 10, 7, 45, 1200, 300, 1);

      const runs = db.getPersonalRuns('Hero');
      expect(runs[0].victory).toBe(1);
      expect(runs[0].time_seconds).toBe(300); // fastest victory first
      expect(runs[1].victory).toBe(1);
      expect(runs[1].time_seconds).toBe(500);
      expect(runs[2].victory).toBe(0);
    });
  });
});

// ── Socket Handler Leaderboard Tests ────────────────────────────

describe('handleLeaderboardGet', () => {
  let db;

  beforeEach(() => {
    db = new GameDatabase(':memory:');
  });

  afterEach(() => {
    db.close();
  });

  function makeSocket(id = 'socket_1') {
    const emitted = [];
    return {
      id,
      emit: (ev, data) => emitted.push({ ev, data }),
      _emitted: emitted,
    };
  }

  function makeCtx(players = new Map()) {
    return { players, gameDb: db };
  }

  it('emits leaderboard:data with type "top"', () => {
    const socket = makeSocket();
    const ctx = makeCtx();
    db.recordRun('Hero', 'warrior', 10, 7, 45, 1200, 360, 1);

    handlers.handleLeaderboardGet(socket, {}, ctx);

    expect(socket._emitted).toHaveLength(1);
    expect(socket._emitted[0].ev).toBe('leaderboard:data');
    expect(socket._emitted[0].data.type).toBe('top');
    expect(socket._emitted[0].data.entries).toHaveLength(1);
    expect(socket._emitted[0].data.entries[0].player_name).toBe('Hero');
  });

  it('returns empty array when no runs exist', () => {
    const socket = makeSocket();
    handlers.handleLeaderboardGet(socket, {}, makeCtx());
    expect(socket._emitted[0].data.entries).toEqual([]);
  });
});

describe('handleLeaderboardPersonal', () => {
  let db;

  beforeEach(() => {
    db = new GameDatabase(':memory:');
  });

  afterEach(() => {
    db.close();
  });

  function makeSocket(id = 'socket_1') {
    const emitted = [];
    return {
      id,
      emit: (ev, data) => emitted.push({ ev, data }),
      _emitted: emitted,
    };
  }

  it('emits personal runs for the requesting player', () => {
    const socket = makeSocket('sock_1');
    const player = { id: 'p1', name: 'Hero' };
    const players = new Map();
    players.set('sock_1', player);
    const ctx = { players, gameDb: db };

    db.recordRun('Hero', 'warrior', 10, 7, 45, 1200, 360, 1);
    db.recordRun('Other', 'mage', 5, 3, 10, 200, 120, 0);

    handlers.handleLeaderboardPersonal(socket, {}, ctx);

    expect(socket._emitted).toHaveLength(1);
    expect(socket._emitted[0].ev).toBe('leaderboard:data');
    expect(socket._emitted[0].data.type).toBe('personal');
    expect(socket._emitted[0].data.entries).toHaveLength(1);
    expect(socket._emitted[0].data.entries[0].player_name).toBe('Hero');
  });

  it('does nothing if player not found', () => {
    const socket = makeSocket('sock_unknown');
    const ctx = { players: new Map(), gameDb: db };

    handlers.handleLeaderboardPersonal(socket, {}, ctx);

    expect(socket._emitted).toHaveLength(0);
  });

  it('returns empty array for player with no runs', () => {
    const socket = makeSocket('sock_1');
    const player = { id: 'p1', name: 'NewPlayer' };
    const players = new Map();
    players.set('sock_1', player);
    const ctx = { players, gameDb: db };

    handlers.handleLeaderboardPersonal(socket, {}, ctx);

    expect(socket._emitted[0].data.entries).toEqual([]);
  });
});
