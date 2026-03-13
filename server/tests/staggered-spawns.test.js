import { describe, it, expect, beforeEach } from 'vitest';
import { createRequire } from 'module';
const require = createRequire(import.meta.url);
const { createMonster, Monster } = require('../game/monsters');
const { World } = require('../game/world');

function makeFakePlayer(x, y) {
  return { id: 'p1', x, y, alive: true };
}

describe('Staggered Monster Spawns', () => {
  // ── Constructor defaults ───────────────────────────────────────
  describe('constructor defaults', () => {
    it('new monster has spawning === false and spawnDelay === 0', () => {
      const m = createMonster('skeleton', 100, 100);
      expect(m.spawning).toBe(false);
      expect(m.spawnDelay).toBe(0);
    });
  });

  // ── Update while spawning ──────────────────────────────────────
  describe('update during spawn delay', () => {
    let monster;
    let player;

    beforeEach(() => {
      monster = createMonster('skeleton', 100, 100);
      monster.spawning = true;
      monster.spawnDelay = 1000;
      player = makeFakePlayer(120, 120);
    });

    it('returns empty events array while spawn delay is active', () => {
      const events = monster.update(500, [player]);
      expect(events).toEqual([]);
    });

    it('does not move the monster toward a nearby player', () => {
      const startX = monster.x;
      const startY = monster.y;
      monster.update(500, [player]);
      expect(monster.x).toBe(startX);
      expect(monster.y).toBe(startY);
    });

    it('counts down spawnDelay by dt', () => {
      monster.update(500, [player]);
      expect(monster.spawnDelay).toBe(500);
    });

    it('counts down across multiple updates', () => {
      monster.update(300, [player]);
      expect(monster.spawnDelay).toBe(700);
      monster.update(200, [player]);
      expect(monster.spawnDelay).toBe(500);
    });
  });

  // ── Spawn completion ───────────────────────────────────────────
  describe('spawn completion event', () => {
    let monster;

    beforeEach(() => {
      monster = createMonster('skeleton', 200, 300);
      monster.spawning = true;
      monster.spawnDelay = 400;
    });

    it('emits monster:spawned when spawnDelay reaches 0', () => {
      const events = monster.update(400, []);
      expect(events).toHaveLength(1);
      expect(events[0].type).toBe('monster:spawned');
      expect(events[0].monsterId).toBe(monster.id);
      expect(events[0].x).toBe(monster.x);
      expect(events[0].y).toBe(monster.y);
      expect(events[0].monsterType).toBe('skeleton');
    });

    it('sets spawning to false after delay expires', () => {
      monster.update(400, []);
      expect(monster.spawning).toBe(false);
    });

    it('emits monster:spawned when dt overshoots remaining delay', () => {
      const events = monster.update(999, []);
      expect(events).toHaveLength(1);
      expect(events[0].type).toBe('monster:spawned');
      expect(monster.spawning).toBe(false);
    });

    it('behaves normally on the next update after spawning completes', () => {
      monster.update(400, []);
      // Monster is now active (spawning === false), should return normal AI events
      const player = makeFakePlayer(210, 310);
      const events = monster.update(100, [player]);
      // Should not return a second spawn event
      const spawnEvents = events.filter(e => e.type === 'monster:spawned');
      expect(spawnEvents).toHaveLength(0);
    });
  });

  // ── Invulnerability while spawning ─────────────────────────────
  describe('invulnerability while spawning', () => {
    it('takeDamage returns 0 and HP is unchanged when spawning', () => {
      const monster = createMonster('skeleton', 100, 100);
      const originalHp = monster.hp;
      monster.spawning = true;

      const dealt = monster.takeDamage(50);
      expect(dealt).toBe(0);
      expect(monster.hp).toBe(originalHp);
    });

    it('takeDamage works normally after spawning completes', () => {
      const monster = createMonster('skeleton', 100, 100);
      monster.spawning = true;
      monster.spawnDelay = 100;

      // Finish spawning
      monster.update(100, []);
      expect(monster.spawning).toBe(false);

      // Now damage should apply
      const dealt = monster.takeDamage(50);
      expect(dealt).toBeGreaterThan(0);
      expect(monster.hp).toBeLessThan(monster.maxHp);
    });
  });

  // ── Goblin escape timer spawn guard (24.7A) ────────────────────
  describe('treasure goblin escape timer during spawn', () => {
    it('escape timer does not decrement while goblin is spawning', () => {
      const goblin = createMonster('treasure_goblin', 100, 100);
      goblin.spawning = true;
      goblin.spawnDelay = 1000;
      const initialTimer = goblin.escapeTimer;

      goblin.update(500, []);
      expect(goblin.escapeTimer).toBe(initialTimer);
    });

    it('goblin does not escape while spawning even if timer would expire', () => {
      const goblin = createMonster('treasure_goblin', 100, 100);
      goblin.spawning = true;
      goblin.spawnDelay = 200;
      goblin.escapeTimer = 100; // very short timer

      const events = goblin.update(500, []);
      expect(goblin.alive).toBe(true);
      expect(events.some(e => e.type === 'goblin:escaped')).toBe(false);
    });

    it('escape timer decrements normally after spawning completes', () => {
      const goblin = createMonster('treasure_goblin', 100, 100);
      goblin.spawning = true;
      goblin.spawnDelay = 200;

      goblin.update(200, []); // finish spawning
      expect(goblin.spawning).toBe(false);

      const timerBefore = goblin.escapeTimer;
      goblin.update(100, []);
      expect(goblin.escapeTimer).toBe(timerBefore - 100);
    });

    it('goblin escapes when timer reaches 0 after spawning', () => {
      const goblin = createMonster('treasure_goblin', 100, 100);
      goblin.spawning = true;
      goblin.spawnDelay = 100;
      goblin.escapeTimer = 50;

      goblin.update(100, []); // finish spawning
      const events = goblin.update(50, []); // expire escape timer
      expect(events.some(e => e.type === 'goblin:escaped')).toBe(true);
      expect(goblin.alive).toBe(false);
    });
  });

  // ── Serialization ──────────────────────────────────────────────
  describe('serialization', () => {
    it('includes spawning: true when monster is spawning', () => {
      const monster = createMonster('skeleton', 100, 100);
      monster.spawning = true;
      monster.spawnDelay = 600;

      const data = monster.serialize();
      expect(data.spawning).toBe(true);
    });

    it('includes spawning: false when monster is active', () => {
      const monster = createMonster('skeleton', 100, 100);
      const data = monster.serialize();
      expect(data.spawning).toBe(false);
    });
  });

  // ── World spawn stagger ────────────────────────────────────────
  describe('world spawn stagger', () => {
    it('staggers monster spawn delays in room waves', () => {
      const world = new World();
      world.generateFloor(0);

      // Find a room that has monster waves (not start room)
      const monsterRoom = world.rooms.find(
        r => r.type !== 'start' && r.waveCount > 0 && r.wavesSpawned === 0
      );
      if (!monsterRoom) return; // edge case: no suitable room generated

      // Trigger wave spawn
      world.spawnWave(monsterRoom);

      // Collect monsters that belong to this room
      const roomMonsters = world.monsters.filter(m =>
        world.isMonsterInRoom(m, monsterRoom)
      );

      expect(roomMonsters.length).toBeGreaterThanOrEqual(1);

      // First monster should be instantly active
      expect(roomMonsters[0].spawning).toBe(false);
      expect(roomMonsters[0].spawnDelay).toBe(0);

      // Subsequent monsters should have increasing stagger delays
      for (let i = 1; i < roomMonsters.length; i++) {
        expect(roomMonsters[i].spawning).toBe(true);
        expect(roomMonsters[i].spawnDelay).toBe(i * 200);
      }

      // Verify delays are strictly increasing
      for (let i = 2; i < roomMonsters.length; i++) {
        expect(roomMonsters[i].spawnDelay).toBeGreaterThan(
          roomMonsters[i - 1].spawnDelay
        );
      }
    });
  });
});
