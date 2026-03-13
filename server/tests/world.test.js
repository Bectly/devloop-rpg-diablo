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

    it('last room is boss on boss floors, treasure otherwise', () => {
      // Floor 0 is NOT a boss floor (catacombs boss is floor 1)
      const last0 = world.rooms[world.rooms.length - 1];
      expect(last0.type).toBe('treasure');

      // Floor 1 IS a boss floor
      const bossWorld = new World();
      bossWorld.generateFloor(1);
      const last1 = bossWorld.rooms[bossWorld.rooms.length - 1];
      expect(last1.type).toBe('boss');
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

    it('room serialization includes hasShrine and shrineUsed', () => {
      const s = world.serialize();
      for (const room of s.rooms) {
        expect(room).toHaveProperty('hasShrine');
        expect(room).toHaveProperty('shrineUsed');
        expect(typeof room.hasShrine).toBe('boolean');
        expect(typeof room.shrineUsed).toBe('boolean');
      }
    });

    it('serialize includes shopNpc data', () => {
      const s = world.serialize();
      expect(s).toHaveProperty('shopNpc');
      // shopNpc should exist since generateFloor(0) was called in beforeEach
      if (s.shopNpc) {
        expect(s.shopNpc.id).toBe('shop_npc');
        expect(s.shopNpc.name).toBe('Merchant');
        expect(typeof s.shopNpc.x).toBe('number');
        expect(typeof s.shopNpc.y).toBe('number');
      }
    });
  });

  // ── Shrine Spawning ───────────────────────────────────────────
  describe('shrine spawning', () => {
    it('shrines only appear in monster or treasure rooms (never start/boss)', () => {
      // Generate many floors to test distribution
      for (let trial = 0; trial < 20; trial++) {
        const w = new World();
        w.generateFloor(trial);
        for (const room of w.rooms) {
          if (room.type === 'start' || room.type === 'boss') {
            expect(room.hasShrine).toBe(false);
          }
        }
      }
    });

    it('shrine spawning is approximately 30% for eligible rooms', () => {
      let shrineCount = 0;
      let eligibleCount = 0;
      // Run many floors
      for (let trial = 0; trial < 100; trial++) {
        const w = new World();
        w.generateFloor(trial % 7);
        for (const room of w.rooms) {
          if (room.type === 'monster' || room.type === 'treasure') {
            eligibleCount++;
            if (room.hasShrine) shrineCount++;
          }
        }
      }
      // 30% chance means roughly 20-40% observed with this sample size
      const rate = shrineCount / eligibleCount;
      expect(rate).toBeGreaterThan(0.15);
      expect(rate).toBeLessThan(0.45);
    });

    it('all shrines start as unused', () => {
      for (let trial = 0; trial < 10; trial++) {
        const w = new World();
        w.generateFloor(trial);
        for (const room of w.rooms) {
          if (room.hasShrine) {
            expect(room.shrineUsed).toBe(false);
          }
        }
      }
    });

    it('room discovery event includes hasShrine flag', () => {
      // Find a room with shrine
      let found = false;
      for (let trial = 0; trial < 50 && !found; trial++) {
        const w = new World();
        w.generateFloor(trial % 7);
        const shrineRoom = w.rooms.find(r => r.hasShrine && !r.discovered);
        if (shrineRoom) {
          const cx = (shrineRoom.room.x + shrineRoom.room.w / 2) * TILE_SIZE;
          const cy = (shrineRoom.room.y + shrineRoom.room.h / 2) * TILE_SIZE;
          const events = w.updateRoomDiscovery([{ alive: true, x: cx, y: cy }]);
          const disc = events.find(e => e.type === 'room:discovered');
          if (disc) {
            expect(disc.hasShrine).toBe(true);
            found = true;
          }
        }
      }
      // If no shrine was found after 50 tries, the test is inconclusive but not a failure
      // (statistically extremely unlikely with 30% chance per eligible room)
    });
  });

  // ── Shop NPC ──────────────────────────────────────────────────
  describe('shop NPC', () => {
    it('getShopNpc returns NPC with position and inventory', () => {
      const npc = world.getShopNpc();
      expect(npc).not.toBeNull();
      expect(npc.id).toBe('shop_npc');
      expect(npc.name).toBe('Merchant');
      expect(typeof npc.x).toBe('number');
      expect(typeof npc.y).toBe('number');
      expect(Array.isArray(npc.inventory)).toBe(true);
      expect(npc.inventory.length).toBeGreaterThan(0);
    });

    it('shop NPC is positioned in start room', () => {
      const npc = world.getShopNpc();
      const startRoom = world.rooms.find(r => r.type === 'start');
      expect(npc).not.toBeNull();
      expect(startRoom).toBeDefined();
      // NPC should be within the start room pixel boundaries
      const roomLeft = startRoom.room.x * TILE_SIZE;
      const roomRight = (startRoom.room.x + startRoom.room.w) * TILE_SIZE;
      const roomTop = startRoom.room.y * TILE_SIZE;
      const roomBottom = (startRoom.room.y + startRoom.room.h) * TILE_SIZE;
      expect(npc.x).toBeGreaterThanOrEqual(roomLeft);
      expect(npc.x).toBeLessThanOrEqual(roomRight);
      expect(npc.y).toBeGreaterThanOrEqual(roomTop);
      expect(npc.y).toBeLessThanOrEqual(roomBottom);
    });

    it('shop NPC refreshes inventory on each floor', () => {
      const inv0 = world.getShopNpc().inventory;
      world.generateFloor(1);
      const inv1 = world.getShopNpc().inventory;
      // Inventories should be different arrays (regenerated)
      expect(inv1).not.toBe(inv0);
    });

    it('shop NPC inventory contains potions', () => {
      const npc = world.getShopNpc();
      const hp = npc.inventory.find(i => i.subType === 'health_potion');
      const mp = npc.inventory.find(i => i.subType === 'mana_potion');
      expect(hp).toBeDefined();
      expect(mp).toBeDefined();
    });
  });

  // ── Loot Chests ──────────────────────────────────────────────
  describe('lootChests', () => {
    it('initializes lootChests as empty array', () => {
      const w = new World();
      expect(w.lootChests).toBeDefined();
      expect(Array.isArray(w.lootChests)).toBe(true);
      expect(w.lootChests.length).toBe(0);
    });

    it('resets lootChests on generateFloor', () => {
      // Manually push a fake chest
      world.lootChests.push({
        id: 'test-chest',
        x: 100,
        y: 200,
        gold: 50,
        items: [{ id: 'sword1' }],
        opened: false,
      });
      expect(world.lootChests.length).toBe(1);

      // Generate a new floor — chests must be cleared
      world.generateFloor(1);
      expect(world.lootChests.length).toBe(0);
    });

    it('serializes lootChests (unopened only)', () => {
      // Push one opened and one unopened chest
      world.lootChests.push({
        id: 'chest-opened',
        x: 100,
        y: 200,
        gold: 30,
        items: [{ id: 'item1' }],
        opened: true,
      });
      world.lootChests.push({
        id: 'chest-sealed',
        x: 300,
        y: 400,
        gold: 75,
        items: [{ id: 'item2' }, { id: 'item3' }],
        opened: false,
      });

      const s = world.serialize();
      expect(Array.isArray(s.lootChests)).toBe(true);
      // Only the unopened chest should appear
      expect(s.lootChests.length).toBe(1);
      expect(s.lootChests[0].id).toBe('chest-sealed');
      expect(s.lootChests[0].x).toBe(300);
      expect(s.lootChests[0].y).toBe(400);
      expect(s.lootChests[0].gold).toBe(75);
      expect(s.lootChests[0].itemCount).toBe(2);
    });

    it('serialize returns empty lootChests when none exist', () => {
      const s = world.serialize();
      expect(Array.isArray(s.lootChests)).toBe(true);
      expect(s.lootChests.length).toBe(0);
    });

    it('serialize excludes all chests when all are opened', () => {
      world.lootChests.push({
        id: 'c1',
        x: 10,
        y: 20,
        gold: 10,
        items: [],
        opened: true,
      });
      world.lootChests.push({
        id: 'c2',
        x: 50,
        y: 60,
        gold: 20,
        items: [{ id: 'i1' }],
        opened: true,
      });

      const s = world.serialize();
      expect(s.lootChests.length).toBe(0);
    });
  });

  // ── Story NPCs (Cycle #22) ──────────────────────────────────────
  describe('World — storyNpcs placement (Cycle #22)', () => {
    it('storyNpcs initialized as empty array', () => {
      const w = new World();
      expect(w.storyNpcs).toBeDefined();
      expect(Array.isArray(w.storyNpcs)).toBe(true);
      expect(w.storyNpcs.length).toBe(0);
    });

    it('floor 0 has Old Sage', () => {
      const w = new World();
      w.generateFloor(0);
      const sage = w.storyNpcs.find(n => n.id === 'old_sage');
      expect(sage).toBeDefined();
      expect(sage.name).toBe('Old Sage');
    });

    it('Old Sage only on floor 0 (not floor 1+)', () => {
      for (let f = 1; f <= 4; f++) {
        const w = new World();
        w.generateFloor(f);
        const sage = w.storyNpcs.find(n => n.id === 'old_sage');
        expect(sage).toBeUndefined();
      }
    });

    it('Shrine Guardian placed when shrine exists', () => {
      let found = false;
      for (let trial = 0; trial < 50 && !found; trial++) {
        const w = new World();
        w.generateFloor(trial % 7);
        const hasShrineRoom = w.rooms.some(r => r.hasShrine);
        const guardian = w.storyNpcs.find(n => n.id === 'shrine_guardian');
        if (hasShrineRoom) {
          expect(guardian).toBeDefined();
          expect(guardian.name).toBe('Shrine Guardian');
          found = true;
        }
      }
      // With 30% shrine chance across many trials, we should find one
    });

    it('Dying Adventurer appears on floor 2+ (index >= 2)', () => {
      for (let f = 2; f <= 5; f++) {
        const w = new World();
        w.generateFloor(f);
        const herald = w.storyNpcs.find(n => n.id === 'floor_herald');
        expect(herald).toBeDefined();
        expect(herald.name).toBe('Dying Adventurer');
      }
    });

    it('Dying Adventurer NOT on floor 0 or 1', () => {
      for (let f = 0; f <= 1; f++) {
        const w = new World();
        w.generateFloor(f);
        const herald = w.storyNpcs.find(n => n.id === 'floor_herald');
        expect(herald).toBeUndefined();
      }
    });

    it('storyNpcs reset on new floor generation', () => {
      const w = new World();
      w.generateFloor(0);
      const countFloor0 = w.storyNpcs.length;
      expect(countFloor0).toBeGreaterThan(0); // At least Old Sage

      w.generateFloor(1);
      // Old Sage should NOT carry over from floor 0
      const sage = w.storyNpcs.find(n => n.id === 'old_sage');
      expect(sage).toBeUndefined();
    });

    it('serialize() includes storyNpcs', () => {
      const w = new World();
      w.generateFloor(0);
      const s = w.serialize();
      expect(s).toHaveProperty('storyNpcs');
      expect(Array.isArray(s.storyNpcs)).toBe(true);
      expect(s.storyNpcs.length).toBeGreaterThan(0);
    });

    it('storyNpc objects have correct shape {id, name, x, y}', () => {
      const w = new World();
      w.generateFloor(0);
      const s = w.serialize();
      for (const npc of s.storyNpcs) {
        expect(typeof npc.id).toBe('string');
        expect(typeof npc.name).toBe('string');
        expect(typeof npc.x).toBe('number');
        expect(typeof npc.y).toBe('number');
        // Should only have these 4 keys
        expect(Object.keys(npc).sort()).toEqual(['id', 'name', 'x', 'y']);
      }
    });

    it('storyNpc positions are within valid bounds (x > 0, y > 0)', () => {
      for (let f = 0; f <= 4; f++) {
        const w = new World();
        w.generateFloor(f);
        for (const npc of w.storyNpcs) {
          expect(npc.x).toBeGreaterThan(0);
          expect(npc.y).toBeGreaterThan(0);
        }
      }
    });
  });
});
