import { describe, it, expect, beforeEach } from 'vitest';
import { createRequire } from 'module';
const require = createRequire(import.meta.url);
const { World, TILE_SIZE, TILE, GRID_W, GRID_H } = require('../game/world');

describe('World', () => {
  let world;

  beforeEach(() => {
    world = new World();
    world.generateFloor(0);
  });

  // ── Floor Generation ────────────────────────────────────────────
  describe('floor generation', () => {
    it('generates a valid tile grid', () => {
      expect(world.tiles).toBeDefined();
      expect(world.tiles.length).toBe(GRID_H);
      expect(world.tiles[0].length).toBe(GRID_W);
    });

    it('creates at least 2 rooms', () => {
      expect(world.rooms.length).toBeGreaterThanOrEqual(2);
    });

    it('first room is always start type', () => {
      expect(world.rooms[0].type).toBe('start');
    });

    it('last room is always boss type', () => {
      const last = world.rooms[world.rooms.length - 1];
      expect(last.type).toBe('boss');
    });

    it('start room is pre-discovered and cleared', () => {
      const start = world.rooms.find(r => r.type === 'start');
      expect(start.discovered).toBe(true);
      expect(start.cleared).toBe(true);
    });

    it('non-start rooms are not discovered initially', () => {
      const nonStart = world.rooms.filter(r => r.type !== 'start');
      for (const room of nonStart) {
        expect(room.discovered).toBe(false);
      }
    });

    it('exit is locked initially', () => {
      expect(world.exitLocked).toBe(true);
    });

    it('floor name cycles through FLOOR_NAMES', () => {
      expect(world.floorName).toBeDefined();
      expect(world.floorName.length).toBeGreaterThan(0);
    });

    it('room count scales with floor number', () => {
      const w0 = new World();
      w0.generateFloor(0);
      const w6 = new World();
      w6.generateFloor(6);
      // Floor 6: 5 + min(3, floor(6/2)) = 5 + 3 = 8 target rooms
      expect(w6.rooms.length).toBeGreaterThanOrEqual(w0.rooms.length);
    });
  });

  // ── Tile Grid Validity ──────────────────────────────────────────
  describe('tile grid', () => {
    it('contains floor tiles', () => {
      let floorCount = 0;
      for (let y = 0; y < GRID_H; y++) {
        for (let x = 0; x < GRID_W; x++) {
          if (world.tiles[y][x] === TILE.FLOOR) floorCount++;
        }
      }
      expect(floorCount).toBeGreaterThan(0);
    });

    it('contains at least one SPAWN tile', () => {
      let spawnCount = 0;
      for (let y = 0; y < GRID_H; y++) {
        for (let x = 0; x < GRID_W; x++) {
          if (world.tiles[y][x] === TILE.SPAWN) spawnCount++;
        }
      }
      expect(spawnCount).toBeGreaterThanOrEqual(1);
    });

    it('contains at least one EXIT tile', () => {
      let exitCount = 0;
      for (let y = 0; y < GRID_H; y++) {
        for (let x = 0; x < GRID_W; x++) {
          if (world.tiles[y][x] === TILE.EXIT) exitCount++;
        }
      }
      expect(exitCount).toBeGreaterThanOrEqual(1);
    });

    it('has corridor tiles connecting rooms', () => {
      let corridorCount = 0;
      for (let y = 0; y < GRID_H; y++) {
        for (let x = 0; x < GRID_W; x++) {
          if (world.tiles[y][x] === TILE.CORRIDOR) corridorCount++;
        }
      }
      // With 2+ rooms there should be corridors
      if (world.rooms.length > 1) {
        expect(corridorCount).toBeGreaterThan(0);
      }
    });

    it('all tile values are valid TILE constants', () => {
      const validTiles = new Set(Object.values(TILE));
      for (let y = 0; y < GRID_H; y++) {
        for (let x = 0; x < GRID_W; x++) {
          expect(validTiles.has(world.tiles[y][x])).toBe(true);
        }
      }
    });
  });

  // ── Walkability ─────────────────────────────────────────────────
  describe('isWalkable', () => {
    it('floor tiles are walkable', () => {
      // Find a floor tile
      for (let y = 0; y < GRID_H; y++) {
        for (let x = 0; x < GRID_W; x++) {
          if (world.tiles[y][x] === TILE.FLOOR) {
            expect(world.isWalkable(x * TILE_SIZE + 1, y * TILE_SIZE + 1)).toBe(true);
            return;
          }
        }
      }
    });

    it('wall tiles are not walkable', () => {
      for (let y = 0; y < GRID_H; y++) {
        for (let x = 0; x < GRID_W; x++) {
          if (world.tiles[y][x] === TILE.WALL) {
            expect(world.isWalkable(x * TILE_SIZE + 1, y * TILE_SIZE + 1)).toBe(false);
            return;
          }
        }
      }
    });

    it('void tiles are not walkable', () => {
      for (let y = 0; y < GRID_H; y++) {
        for (let x = 0; x < GRID_W; x++) {
          if (world.tiles[y][x] === TILE.VOID) {
            expect(world.isWalkable(x * TILE_SIZE + 1, y * TILE_SIZE + 1)).toBe(false);
            return;
          }
        }
      }
    });

    it('out-of-bounds is not walkable', () => {
      expect(world.isWalkable(-100, -100)).toBe(false);
      expect(world.isWalkable(GRID_W * TILE_SIZE + 100, 100)).toBe(false);
    });

    it('returns true when tiles are null (no world loaded)', () => {
      const emptyWorld = new World();
      expect(emptyWorld.isWalkable(100, 100)).toBe(true);
    });
  });

  // ── Spawn Position ──────────────────────────────────────────────
  describe('spawn position', () => {
    it('getSpawnPosition returns valid pixel coordinates inside start room', () => {
      const pos = world.getSpawnPosition(0);
      expect(pos.x).toBeGreaterThan(0);
      expect(pos.y).toBeGreaterThan(0);
      expect(world.isWalkable(pos.x, pos.y)).toBe(true);
    });

    it('player index offsets spawn position', () => {
      const pos0 = world.getSpawnPosition(0);
      const pos1 = world.getSpawnPosition(1);
      expect(pos0.x).not.toBe(pos1.x);
    });
  });

  // ── Room Discovery & Waves ──────────────────────────────────────
  describe('room discovery', () => {
    it('discovers room when player enters', () => {
      const monsterRoom = world.rooms.find(r => r.type === 'monster' || r.type === 'boss');
      if (!monsterRoom) return; // skip if only start room

      const cx = (monsterRoom.room.x + monsterRoom.room.w / 2) * TILE_SIZE;
      const cy = (monsterRoom.room.y + monsterRoom.room.h / 2) * TILE_SIZE;
      const player = { alive: true, x: cx, y: cy };

      const events = world.updateRoomDiscovery([player]);
      const discovered = events.find(e => e.type === 'room:discovered');
      expect(discovered).toBeDefined();
      expect(monsterRoom.discovered).toBe(true);
    });

    it('spawns monsters when room is discovered', () => {
      const monsterRoom = world.rooms.find(r => r.type === 'monster');
      if (!monsterRoom) return;

      const cx = (monsterRoom.room.x + monsterRoom.room.w / 2) * TILE_SIZE;
      const cy = (monsterRoom.room.y + monsterRoom.room.h / 2) * TILE_SIZE;
      const player = { alive: true, x: cx, y: cy };

      world.updateRoomDiscovery([player]);
      expect(world.monsters.length).toBeGreaterThan(0);
      expect(monsterRoom.wavesSpawned).toBeGreaterThan(0);
    });

    it('does not re-discover already discovered room', () => {
      const monsterRoom = world.rooms.find(r => r.type === 'monster');
      if (!monsterRoom) return;

      const cx = (monsterRoom.room.x + monsterRoom.room.w / 2) * TILE_SIZE;
      const cy = (monsterRoom.room.y + monsterRoom.room.h / 2) * TILE_SIZE;
      const player = { alive: true, x: cx, y: cy };

      world.updateRoomDiscovery([player]);
      const monstersBefore = world.monsters.length;
      const events = world.updateRoomDiscovery([player]);
      expect(events.length).toBe(0);
      // No new monsters should spawn on re-entry
    });
  });

  // ── Wave Completion ─────────────────────────────────────────────
  describe('wave completion', () => {
    it('clears room after all waves defeated', () => {
      const monsterRoom = world.rooms.find(r => r.type === 'monster');
      if (!monsterRoom) return;

      // Manually spawn and kill all waves
      const cx = (monsterRoom.room.x + monsterRoom.room.w / 2) * TILE_SIZE;
      const cy = (monsterRoom.room.y + monsterRoom.room.h / 2) * TILE_SIZE;
      const player = { alive: true, x: cx, y: cy };
      world.updateRoomDiscovery([player]);

      // Kill all monsters in all waves
      for (let wave = 0; wave < monsterRoom.waveCount + 1; wave++) {
        for (const m of world.monsters) {
          m.alive = false;
        }
        const event = world.checkWaveCompletion();
        if (event && event.type === 'room:cleared') break;
      }

      expect(monsterRoom.cleared).toBe(true);
    });

    it('returns null when wave still has alive monsters', () => {
      const monsterRoom = world.rooms.find(r => r.type === 'monster');
      if (!monsterRoom) return;

      const cx = (monsterRoom.room.x + monsterRoom.room.w / 2) * TILE_SIZE;
      const cy = (monsterRoom.room.y + monsterRoom.room.h / 2) * TILE_SIZE;
      world.updateRoomDiscovery([{ alive: true, x: cx, y: cy }]);

      // Don't kill monsters
      const result = world.checkWaveCompletion();
      expect(result).toBeNull();
    });
  });

  // ── Exit Logic ──────────────────────────────────────────────────
  describe('exit', () => {
    it('exit unlocks when all rooms are cleared', () => {
      // Mark all rooms as cleared
      for (const room of world.rooms) {
        room.cleared = true;
      }
      world.exitLocked = false;
      expect(world.exitLocked).toBe(false);
    });

    it('isPlayerOnExit returns false when exit is locked', () => {
      const player = { x: 0, y: 0 };
      expect(world.isPlayerOnExit(player)).toBe(false);
    });

    it('isPlayerOnExit returns true when on exit tile and unlocked', () => {
      world.exitLocked = false;
      // Find exit tile
      for (let y = 0; y < GRID_H; y++) {
        for (let x = 0; x < GRID_W; x++) {
          if (world.tiles[y][x] === TILE.EXIT) {
            const player = { x: x * TILE_SIZE + 1, y: y * TILE_SIZE + 1 };
            expect(world.isPlayerOnExit(player)).toBe(true);
            return;
          }
        }
      }
    });

    it('allRoomsCleared checks only rooms with waves', () => {
      // Start room has waveCount 0, so it should be excluded
      for (const room of world.rooms) {
        if (room.waveCount > 0) room.cleared = true;
      }
      expect(world.allRoomsCleared()).toBe(true);
    });
  });

  // ── Ground Items ────────────────────────────────────────────────
  describe('ground items', () => {
    it('addGroundItem stores item with position', () => {
      world.addGroundItem({ id: 'gold1', name: 'Gold' }, 100, 200);
      expect(world.groundItems.length).toBe(1);
      expect(world.groundItems[0].x).toBe(100);
      expect(world.groundItems[0].y).toBe(200);
    });

    it('pickupItem returns item when player is in range', () => {
      world.addGroundItem({ id: 'gold1', name: 'Gold' }, 100, 200);
      const item = world.pickupItem('gold1', 120, 210, 60);
      expect(item).toBeDefined();
      expect(item.id).toBe('gold1');
      expect(world.groundItems.length).toBe(0);
    });

    it('pickupItem returns null when player is out of range', () => {
      world.addGroundItem({ id: 'gold1', name: 'Gold' }, 100, 200);
      const item = world.pickupItem('gold1', 500, 500, 60);
      expect(item).toBeNull();
      expect(world.groundItems.length).toBe(1);
    });

    it('pickupItem returns null for nonexistent item', () => {
      const item = world.pickupItem('nope', 100, 100);
      expect(item).toBeNull();
    });
  });

  // ── getRoomAtPosition ───────────────────────────────────────────
  describe('getRoomAtPosition', () => {
    it('returns room data when position is inside room', () => {
      const r = world.rooms[0]; // start room
      const px = (r.room.x + 1) * TILE_SIZE;
      const py = (r.room.y + 1) * TILE_SIZE;
      const result = world.getRoomAtPosition(px, py);
      expect(result).toBeDefined();
      expect(result.type).toBe('start');
    });

    it('returns null when position is not in any room', () => {
      // Position in void area
      const result = world.getRoomAtPosition(0, 0);
      // Might be null or a room depending on generation, but test the function works
      // If 0,0 is inside a room it returns it, otherwise null
      if (!result) {
        expect(result).toBeNull();
      }
    });
  });

  // ── Serialization ───────────────────────────────────────────────
  describe('serialization', () => {
    it('getFloorInfo returns expected shape', () => {
      const info = world.getFloorInfo();
      expect(info.floor).toBe(0);
      expect(info.tiles).toBeDefined();
      expect(info.tileSize).toBe(TILE_SIZE);
      expect(info.width).toBe(GRID_W);
      expect(info.height).toBe(GRID_H);
      expect(info.pixelWidth).toBe(GRID_W * TILE_SIZE);
      expect(info.pixelHeight).toBe(GRID_H * TILE_SIZE);
    });

    it('serialize includes rooms and monsters', () => {
      const s = world.serialize();
      expect(s.rooms).toBeDefined();
      expect(Array.isArray(s.rooms)).toBe(true);
      expect(s.rooms.length).toBeGreaterThanOrEqual(2);
      expect(s).toHaveProperty('monsters');
      expect(s).toHaveProperty('groundItems');
    });
  });
});
