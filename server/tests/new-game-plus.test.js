import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { createRequire } from 'module';
const require = createRequire(import.meta.url);
const { GameDatabase } = require('../game/database');

// ── recordRun with difficulty ────────────────────────────────────

describe('recordRun — difficulty parameter', () => {
  let db;

  beforeEach(() => { db = new GameDatabase(':memory:'); });
  afterEach(() => { db.close(); });

  it('stores difficulty with a run', () => {
    db.recordRun('Hero', 'warrior', 10, 7, 45, 1200, 360, 1, 'nightmare');
    const runs = db.getTopRuns();
    expect(runs[0].difficulty).toBe('nightmare');
  });

  it('defaults difficulty to normal when omitted', () => {
    db.recordRun('Hero', 'warrior', 10, 7, 45, 1200, 360, 1);
    const runs = db.getTopRuns();
    expect(runs[0].difficulty).toBe('normal');
  });

  it('stores hell difficulty', () => {
    db.recordRun('Hero', 'warrior', 20, 7, 100, 5000, 200, 1, 'hell');
    const runs = db.getTopRuns();
    expect(runs[0].difficulty).toBe('hell');
  });

  it('multiple runs with different difficulties', () => {
    db.recordRun('Hero', 'warrior', 10, 7, 45, 1200, 360, 1, 'normal');
    db.recordRun('Hero', 'warrior', 15, 7, 80, 2500, 300, 1, 'nightmare');
    db.recordRun('Hero', 'warrior', 20, 7, 100, 5000, 200, 1, 'hell');
    const runs = db.getTopRuns();
    expect(runs).toHaveLength(3);
    // Each should have its difficulty
    const diffs = runs.map(r => r.difficulty);
    expect(diffs).toContain('normal');
    expect(diffs).toContain('nightmare');
    expect(diffs).toContain('hell');
  });
});

// ── Leaderboard sort order (CASE-based) ──────────────────────────

describe('Leaderboard — difficulty sort order', () => {
  let db;

  beforeEach(() => { db = new GameDatabase(':memory:'); });
  afterEach(() => { db.close(); });

  it('hell runs sort before nightmare before normal', () => {
    db.recordRun('A', 'warrior', 10, 7, 45, 1200, 360, 1, 'normal');
    db.recordRun('B', 'mage', 10, 7, 45, 1200, 360, 1, 'nightmare');
    db.recordRun('C', 'ranger', 10, 7, 45, 1200, 360, 1, 'hell');
    const runs = db.getTopRuns();
    expect(runs[0].player_name).toBe('C'); // hell first
    expect(runs[1].player_name).toBe('B'); // nightmare second
    expect(runs[2].player_name).toBe('A'); // normal third
  });

  it('within same difficulty, victory sorts first', () => {
    db.recordRun('Winner', 'warrior', 10, 7, 45, 1200, 360, 1, 'nightmare');
    db.recordRun('Loser', 'warrior', 10, 3, 20, 600, 400, 0, 'nightmare');
    const runs = db.getTopRuns();
    expect(runs[0].player_name).toBe('Winner');
    expect(runs[1].player_name).toBe('Loser');
  });

  it('within same difficulty and victory, higher floor sorts first', () => {
    db.recordRun('Deep', 'warrior', 10, 7, 45, 1200, 360, 1, 'normal');
    db.recordRun('Shallow', 'warrior', 10, 4, 20, 600, 200, 1, 'normal');
    const runs = db.getTopRuns();
    expect(runs[0].player_name).toBe('Deep');
    expect(runs[1].player_name).toBe('Shallow');
  });

  it('within same difficulty, victory, and floor, faster time sorts first', () => {
    db.recordRun('Fast', 'warrior', 10, 7, 45, 1200, 200, 1, 'normal');
    db.recordRun('Slow', 'warrior', 10, 7, 45, 1200, 500, 1, 'normal');
    const runs = db.getTopRuns();
    expect(runs[0].player_name).toBe('Fast');
    expect(runs[1].player_name).toBe('Slow');
  });

  it('personal runs also sort by difficulty', () => {
    db.recordRun('Hero', 'warrior', 10, 7, 45, 1200, 360, 1, 'normal');
    db.recordRun('Hero', 'warrior', 15, 7, 80, 2500, 300, 1, 'hell');
    db.recordRun('Hero', 'warrior', 12, 7, 60, 1800, 330, 1, 'nightmare');
    const runs = db.getPersonalRuns('Hero');
    expect(runs[0].difficulty).toBe('hell');
    expect(runs[1].difficulty).toBe('nightmare');
    expect(runs[2].difficulty).toBe('normal');
  });
});

// ── getUnlockedDifficulties ──────────────────────────────────────

describe('getUnlockedDifficulties', () => {
  let db;

  beforeEach(() => { db = new GameDatabase(':memory:'); });
  afterEach(() => { db.close(); });

  it('returns only normal for unknown player', () => {
    expect(db.getUnlockedDifficulties('Nobody')).toEqual(['normal']);
  });

  it('returns only normal for player who never won', () => {
    db.recordRun('Noob', 'mage', 5, 3, 10, 200, 600, 0, 'normal');
    expect(db.getUnlockedDifficulties('Noob')).toEqual(['normal']);
  });

  it('unlocks nightmare after normal victory', () => {
    db.recordRun('Hero', 'warrior', 10, 7, 45, 1200, 360, 1, 'normal');
    expect(db.getUnlockedDifficulties('Hero')).toEqual(['normal', 'nightmare']);
  });

  it('unlocks hell after nightmare victory', () => {
    db.recordRun('Hero', 'warrior', 10, 7, 45, 1200, 360, 1, 'normal');
    db.recordRun('Hero', 'warrior', 15, 7, 80, 2500, 300, 1, 'nightmare');
    expect(db.getUnlockedDifficulties('Hero')).toEqual(['normal', 'nightmare', 'hell']);
  });

  it('does NOT unlock hell from only normal victory', () => {
    db.recordRun('Hero', 'warrior', 10, 7, 45, 1200, 360, 1, 'normal');
    const unlocked = db.getUnlockedDifficulties('Hero');
    expect(unlocked).not.toContain('hell');
  });

  it('nightmare victory without normal victory still unlocks hell', () => {
    // Edge case: hypothetically if someone got a nightmare victory directly
    db.recordRun('Glitch', 'warrior', 15, 7, 80, 2500, 300, 1, 'nightmare');
    const unlocked = db.getUnlockedDifficulties('Glitch');
    expect(unlocked).toContain('hell');
    // But doesn't unlock nightmare from normal (no normal victory)
    // Actually nightmare is always unlocked if they played nightmare...
    // Wait, getUnlockedDifficulties only checks victory records.
    // With only nightmare victory: won = ['nightmare'] → doesn't include 'normal'
    // So unlocked = ['normal'] + hell (won includes nightmare)
    // nightmare NOT added because won doesn't include 'normal'
    expect(unlocked).toEqual(['normal', 'hell']);
  });

  it('per-player isolation', () => {
    db.recordRun('Hero', 'warrior', 10, 7, 45, 1200, 360, 1, 'normal');
    db.recordRun('Noob', 'mage', 5, 3, 10, 200, 600, 0, 'normal');
    expect(db.getUnlockedDifficulties('Hero')).toEqual(['normal', 'nightmare']);
    expect(db.getUnlockedDifficulties('Noob')).toEqual(['normal']);
  });

  it('non-victory nightmare run does not unlock hell', () => {
    db.recordRun('Hero', 'warrior', 10, 7, 45, 1200, 360, 1, 'normal');
    db.recordRun('Hero', 'warrior', 8, 4, 30, 800, 400, 0, 'nightmare'); // died
    const unlocked = db.getUnlockedDifficulties('Hero');
    expect(unlocked).toEqual(['normal', 'nightmare']);
    expect(unlocked).not.toContain('hell');
  });
});

// ── Existing leaderboard tests regression ────────────────────────

describe('Leaderboard — backward compatibility', () => {
  let db;

  beforeEach(() => { db = new GameDatabase(':memory:'); });
  afterEach(() => { db.close(); });

  it('getTopRuns returns empty array for fresh DB', () => {
    expect(db.getTopRuns()).toEqual([]);
  });

  it('getPersonalRuns returns empty for unknown player', () => {
    expect(db.getPersonalRuns('Ghost')).toEqual([]);
  });

  it('max 10 entries in top runs', () => {
    for (let i = 0; i < 15; i++) {
      db.recordRun(`P${i}`, 'warrior', 10, 7, i, 100, 300, 1, 'normal');
    }
    expect(db.getTopRuns()).toHaveLength(10);
  });

  it('max 5 entries in personal runs', () => {
    for (let i = 0; i < 8; i++) {
      db.recordRun('Hero', 'warrior', 10, 7, i, 100, 300 + i, 1, 'normal');
    }
    expect(db.getPersonalRuns('Hero')).toHaveLength(5);
  });

  it('all expected fields present in result', () => {
    db.recordRun('Hero', 'warrior', 10, 7, 45, 1200, 360, 1, 'nightmare');
    const run = db.getTopRuns()[0];
    expect(run.player_name).toBe('Hero');
    expect(run.character_class).toBe('warrior');
    expect(run.level).toBe(10);
    expect(run.floor_reached).toBe(7);
    expect(run.kills).toBe(45);
    expect(run.gold_earned).toBe(1200);
    expect(run.time_seconds).toBe(360);
    expect(run.victory).toBe(1);
    expect(run.difficulty).toBe('nightmare');
    expect(run.created_at).toBeTruthy();
    expect(run.id).toBeTruthy();
  });
});
