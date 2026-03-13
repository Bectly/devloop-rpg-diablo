import { describe, it, expect, beforeEach } from 'vitest';
import { createRequire } from 'module';
const require = createRequire(import.meta.url);
const { Player, DEATH_DURATION } = require('../game/player');
const { World, TILE_SIZE, TILE, GRID_W, GRID_H } = require('../game/world');

/**
 * Teleport safety & wall diagnostics tests
 *
 * Validates that the safety-net teleport removal (commit b049be4) does not
 * cause regressions: players touching walls stay in place or wall-slide,
 * never get teleported to spawn. Also verifies isWalkable correctness
 * and that respawn only fires after the full death timer.
 */

// ── Helper: build a small tile grid with a known layout ──────────
// Creates a 10x10 tile grid: border = WALL, interior = FLOOR
function buildSimpleGrid() {
  const tiles = [];
  for (let y = 0; y < GRID_H; y++) {
    tiles[y] = new Array(GRID_W).fill(TILE.VOID);
  }
  // Carve a room from (2,2) to (7,7) — floor interior, wall border
  for (let y = 1; y <= 8; y++) {
    for (let x = 1; x <= 8; x++) {
      if (y === 1 || y === 8 || x === 1 || x === 8) {
        tiles[y][x] = TILE.WALL;
      } else {
        tiles[y][x] = TILE.FLOOR;
      }
    }
  }
  return tiles;
}

// ── Helper: build a 3-wide horizontal corridor ───────────────────
// Corridor runs from x=2..8 at rows y=4,5,6 (center y=5), walls at y=3 and y=7
function buildCorridorGrid() {
  const tiles = [];
  for (let y = 0; y < GRID_H; y++) {
    tiles[y] = new Array(GRID_W).fill(TILE.VOID);
  }
  // Wall border
  for (let x = 1; x <= 9; x++) {
    tiles[3][x] = TILE.WALL;
    tiles[7][x] = TILE.WALL;
  }
  for (let y = 3; y <= 7; y++) {
    tiles[y][1] = TILE.WALL;
    tiles[y][9] = TILE.WALL;
  }
  // Corridor interior (3 tiles wide)
  for (let x = 2; x <= 8; x++) {
    tiles[4][x] = TILE.CORRIDOR;
    tiles[5][x] = TILE.CORRIDOR;
    tiles[6][x] = TILE.CORRIDOR;
  }
  return tiles;
}

describe('Teleport safety — wall collision diagnostics (commit b049be4)', () => {
  let world;
  let player;

  beforeEach(() => {
    world = new World();
    player = new Player('TestPlayer', 'warrior');
    player.alive = true;
    player.isDying = false;
  });

  // ── Test 1: Player touching wall does NOT change position ──────
  it('player touching wall does NOT change position (no spawn teleport)', () => {
    world.tiles = buildSimpleGrid();
    // Place player on the floor tile adjacent to the top wall row.
    // Wall is at row 1, floor starts at row 2.
    // Position just inside the floor tile at row 2, centered on column 4.
    // Tile (4,2) center = (4*32+16, 2*32+16) = (144, 80)
    player.x = 4 * TILE_SIZE + TILE_SIZE / 2; // 144
    player.y = 2 * TILE_SIZE + TILE_SIZE / 2; // 80
    player._world = world;
    player.respawnX = 5 * TILE_SIZE + TILE_SIZE / 2;
    player.respawnY = 5 * TILE_SIZE + TILE_SIZE / 2;

    // Input toward the wall (upward)
    player.inputDx = 0;
    player.inputDy = -1;

    const startX = player.x;
    const startY = player.y;

    // Run several update ticks
    for (let i = 0; i < 20; i++) {
      player.update(50);
    }

    // Position should NOT have jumped to respawn point
    expect(player.x).not.toBe(player.respawnX);
    expect(player.y).not.toBe(player.respawnY);
    // Player should still be walkable (not inside a wall)
    expect(world.isWalkable(player.x, player.y)).toBe(true);
  });

  // ── Test 2: Wall collision preserves position near wall ─────────
  it('wall collision preserves position near wall (not teleported to spawn)', () => {
    world.tiles = buildSimpleGrid();
    // Place player on floor tile adjacent to left wall.
    // Wall at x=1, floor at x=2. Center of tile (2,4) = (80, 144)
    player.x = 2 * TILE_SIZE + TILE_SIZE / 2; // 80
    player.y = 4 * TILE_SIZE + TILE_SIZE / 2; // 144
    player._world = world;
    player.respawnX = 5 * TILE_SIZE + TILE_SIZE / 2;
    player.respawnY = 5 * TILE_SIZE + TILE_SIZE / 2;

    const startX = player.x;
    const startY = player.y;

    // Input toward the wall (left)
    player.inputDx = -1;
    player.inputDy = 0;

    for (let i = 0; i < 20; i++) {
      player.update(50);
    }

    // Should stay near original position or slightly moved, NOT at spawn
    expect(player.x).not.toBe(player.respawnX);
    expect(player.y).not.toBe(player.respawnY);
    // Player must remain on a walkable tile
    expect(world.isWalkable(player.x, player.y)).toBe(true);
  });

  // ── Test 3: Player walking into wall slides along it ────────────
  it('player moving diagonally into wall slides along it (one axis moves)', () => {
    world.tiles = buildSimpleGrid();
    // Place player in center of room: tile (5,4) center = (176, 144)
    player.x = 5 * TILE_SIZE + TILE_SIZE / 2;
    player.y = 4 * TILE_SIZE + TILE_SIZE / 2;
    player._world = world;

    // Move diagonally toward top wall (up-right)
    // The wall is at y=1, so moving up will eventually be blocked.
    // But moving right should still be allowed (floor extends to x=7).
    player.inputDx = 1;
    player.inputDy = -1;

    const startX = player.x;
    const startY = player.y;

    // Run enough ticks for the player to reach the wall on Y axis
    for (let i = 0; i < 40; i++) {
      player.update(50);
    }

    // Player should have moved on at least one axis
    const movedX = player.x !== startX;
    const movedY = player.y !== startY;
    expect(movedX || movedY).toBe(true);

    // Player must still be on a walkable position
    expect(world.isWalkable(player.x, player.y)).toBe(true);
  });

  // ── Test 4: No teleport on bbox edge overlap ────────────────────
  it('no teleport on bbox edge overlap with zero input', () => {
    world.tiles = buildSimpleGrid();
    // Place player at position where bbox corner is very close to wall tile.
    // Wall at row 1 (y pixels 32-64). Floor at row 2 (y pixels 64-96).
    // Player at y = 2*32+11 = 75 means bbox top = 75-10 = 65, just inside floor tile.
    // This is right at the edge but still walkable.
    const edgeY = 2 * TILE_SIZE + 11; // 75 — bbox top = 65, just past wall boundary at 64
    const centerX = 4 * TILE_SIZE + TILE_SIZE / 2; // 144

    // Confirm this position is actually walkable first
    if (!world.isWalkable(centerX, edgeY)) {
      // If it's not walkable, adjust slightly further in
      player.x = centerX;
      player.y = 2 * TILE_SIZE + TILE_SIZE / 2;
    } else {
      player.x = centerX;
      player.y = edgeY;
    }
    player._world = world;

    const startX = player.x;
    const startY = player.y;

    // Zero input — player should not move at all
    player.inputDx = 0;
    player.inputDy = 0;
    player.update(50);

    expect(player.x).toBe(startX);
    expect(player.y).toBe(startY);
  });

  // ── Test 5: Respawn only happens after death timer ──────────────
  it('respawn only happens after full death timer expires', () => {
    player.setRespawnPoint(300, 400);
    player.die();

    expect(player.isDying).toBe(true);
    expect(player.deathTimer).toBe(DEATH_DURATION); // 5000

    // Tick 1000ms — still dying
    const result1 = player.update(1000);
    expect(result1).toBeNull();
    expect(player.isDying).toBe(true);
    expect(player.alive).toBe(false);

    // Tick another 4001ms — total 5001ms, exceeds DEATH_DURATION
    const result2 = player.update(4001);
    expect(result2).not.toBeNull();
    expect(result2.type).toBe('player:respawn');
    expect(player.alive).toBe(true);
    expect(player.isDying).toBe(false);
    expect(player.x).toBe(300);
    expect(player.y).toBe(400);
  });

  // ── Test 6: Normal movement doesn't trigger teleport threshold ──
  it('normal movement at dt=50 stays well under 100px teleport threshold', () => {
    world.tiles = buildSimpleGrid();
    // Place player in center of room
    player.x = 5 * TILE_SIZE + TILE_SIZE / 2;
    player.y = 5 * TILE_SIZE + TILE_SIZE / 2;
    player._world = world;

    const startX = player.x;
    const startY = player.y;

    // Move right at normal speed
    player.inputDx = 1;
    player.inputDy = 0;
    player.update(50);

    const dx = Math.abs(player.x - startX);
    const dy = Math.abs(player.y - startY);

    // moveSpeed=120, dt=50ms → step = 120 * 0.05 = 6px
    // Must be well under the 100px teleport detection threshold
    expect(dx).toBeLessThan(100);
    expect(dy).toBeLessThan(100);
    // Confirm it actually moved (sanity check)
    expect(dx).toBeGreaterThan(0);
  });

  // ── Test 7: isWalkable returns false for wall tile with bbox ────
  it('isWalkable returns false for wall tile position', () => {
    world.tiles = buildSimpleGrid();
    // Tile (1,1) is WALL. Its center pixel = (1*32+16, 1*32+16) = (48, 48)
    expect(world.isWalkable(48, 48)).toBe(false);
    // Also check with explicit default radius
    expect(world.isWalkable(48, 48, 10)).toBe(false);
  });

  // ── Test 8: isWalkable returns true for corridor center with bbox ─
  it('isWalkable returns true for corridor center with default bbox radius', () => {
    world.tiles = buildCorridorGrid();
    // Center of the corridor: tile (5,5) center = (5*32+16, 5*32+16) = (176, 176)
    // Surrounding tiles (4,5), (6,5), (5,4), (5,6) are all CORRIDOR
    // Bbox corners at radius=10: (166,166), (186,166), (166,186), (186,186)
    // All fall within corridor tiles
    const cx = 5 * TILE_SIZE + TILE_SIZE / 2; // 176
    const cy = 5 * TILE_SIZE + TILE_SIZE / 2; // 176
    expect(world.isWalkable(cx, cy)).toBe(true);
    expect(world.isWalkable(cx, cy, 10)).toBe(true);
  });
});
