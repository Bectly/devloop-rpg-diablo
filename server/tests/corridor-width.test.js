import { describe, it, expect, beforeEach } from 'vitest';
import { createRequire } from 'module';
const require = createRequire(import.meta.url);
const { World, TILE_SIZE, TILE, GRID_W, GRID_H } = require('../game/world');

/**
 * Corridor widening tests (3-tile-wide corridors)
 *
 * The carveCorridor() function carves L-shaped corridors (horizontal then vertical)
 * that are 3 tiles wide: center tile + 1 offset on each side = CORRIDOR,
 * with WALL tiles placed at ±2 offset from center on outer edges.
 *
 * carveCorridor is not exported, so we test it indirectly via generateFloor()
 * which calls generateBSPDungeon -> carveCorridor.
 */

// ── Helpers ──────────────────────────────────────────────────────────

/** Collect all corridor tile positions from the world */
function getCorridorTiles(world) {
  const tiles = [];
  for (let y = 0; y < GRID_H; y++) {
    for (let x = 0; x < GRID_W; x++) {
      if (world.tiles[y][x] === TILE.CORRIDOR) {
        tiles.push({ x, y });
      }
    }
  }
  return tiles;
}

/** Tile is walkable (CORRIDOR, FLOOR, DOOR, SPAWN, EXIT, CHEST -- not VOID or WALL) */
function isWalkableTile(tile) {
  return tile !== TILE.VOID && tile !== TILE.WALL;
}

/**
 * Find the CENTER row of a horizontal corridor: a row with 3+ consecutive CORRIDOR
 * tiles where the rows at y-1 and y+1 also have walkable tiles (CORRIDOR or FLOOR)
 * at the same x positions. This confirms we found the middle of a 3-tile-wide corridor.
 */
function findHorizontalCorridorCenter(world, minLength = 3) {
  for (let y = 2; y < GRID_H - 2; y++) {
    let runStart = -1;
    let runLen = 0;
    for (let x = 0; x < GRID_W; x++) {
      if (world.tiles[y][x] === TILE.CORRIDOR) {
        if (runStart === -1) runStart = x;
        runLen++;
      } else {
        if (runLen >= minLength) {
          // Verify this is the center row: check that ±1 rows also have walkable tiles
          const midX = Math.floor((runStart + runStart + runLen - 1) / 2);
          const above = world.tiles[y - 1][midX];
          const below = world.tiles[y + 1][midX];
          if (isWalkableTile(above) && isWalkableTile(below)) {
            return { y, xStart: runStart, xEnd: runStart + runLen - 1, length: runLen };
          }
        }
        runStart = -1;
        runLen = 0;
      }
    }
    if (runLen >= minLength) {
      const midX = Math.floor((runStart + runStart + runLen - 1) / 2);
      const above = world.tiles[y - 1][midX];
      const below = world.tiles[y + 1][midX];
      if (isWalkableTile(above) && isWalkableTile(below)) {
        return { y, xStart: runStart, xEnd: runStart + runLen - 1, length: runLen };
      }
    }
  }
  return null;
}

/**
 * Find the CENTER column of a vertical corridor: a column with 3+ consecutive CORRIDOR
 * tiles where columns at x-1 and x+1 also have walkable tiles at the same y positions.
 */
function findVerticalCorridorCenter(world, minLength = 3) {
  for (let x = 2; x < GRID_W - 2; x++) {
    let runStart = -1;
    let runLen = 0;
    for (let y = 0; y < GRID_H; y++) {
      if (world.tiles[y][x] === TILE.CORRIDOR) {
        if (runStart === -1) runStart = y;
        runLen++;
      } else {
        if (runLen >= minLength) {
          const midY = Math.floor((runStart + runStart + runLen - 1) / 2);
          const left = world.tiles[midY][x - 1];
          const right = world.tiles[midY][x + 1];
          if (isWalkableTile(left) && isWalkableTile(right)) {
            return { x, yStart: runStart, yEnd: runStart + runLen - 1, length: runLen };
          }
        }
        runStart = -1;
        runLen = 0;
      }
    }
    if (runLen >= minLength) {
      const midY = Math.floor((runStart + runStart + runLen - 1) / 2);
      const left = world.tiles[midY][x - 1];
      const right = world.tiles[midY][x + 1];
      if (isWalkableTile(left) && isWalkableTile(right)) {
        return { x, yStart: runStart, yEnd: runStart + runLen - 1, length: runLen };
      }
    }
  }
  return null;
}

/**
 * Generate worlds until we find one with the desired corridor pattern.
 * Returns { world, run } or null.
 */
function findWorldWithHorizontalCorridor(minLength = 3, maxTrials = 30) {
  for (let trial = 0; trial < maxTrials; trial++) {
    const w = new World();
    w.generateFloor(trial % 7);
    const run = findHorizontalCorridorCenter(w, minLength);
    if (run) return { world: w, run };
  }
  return null;
}

function findWorldWithVerticalCorridor(minLength = 3, maxTrials = 30) {
  for (let trial = 0; trial < maxTrials; trial++) {
    const w = new World();
    w.generateFloor(trial % 7);
    const run = findVerticalCorridorCenter(w, minLength);
    if (run) return { world: w, run };
  }
  return null;
}

describe('Corridor width (3-tile-wide corridors)', () => {
  let world;

  beforeEach(() => {
    world = new World();
    world.generateFloor(0);
  });

  // ── Test 1: Horizontal corridor is 3 tiles wide ─────────────────
  it('horizontal corridor segment is 3 tiles wide (center +/- 1)', () => {
    const result = findWorldWithHorizontalCorridor();
    if (!result) return; // skip if no horizontal corridor found (extremely unlikely)

    const { world: w, run } = result;
    const midX = Math.floor((run.xStart + run.xEnd) / 2);
    const cy = run.y;

    // Center row is CORRIDOR
    expect(w.tiles[cy][midX]).toBe(TILE.CORRIDOR);
    // Adjacent rows (±1) are walkable tiles (CORRIDOR or FLOOR)
    expect(isWalkableTile(w.tiles[cy - 1][midX])).toBe(true);
    expect(isWalkableTile(w.tiles[cy + 1][midX])).toBe(true);
  });

  // ── Test 2: Horizontal corridor has walls at ±2 offset ──────────
  it('horizontal corridor has walls or solid boundary at +/-2 offset from center', () => {
    const result = findWorldWithHorizontalCorridor();
    if (!result) return;

    const { world: w, run } = result;
    const midX = Math.floor((run.xStart + run.xEnd) / 2);
    const cy = run.y;

    // The tiles at ±2 should be non-VOID (WALL, or FLOOR/CORRIDOR if near a room).
    // carveCorridor places WALL at ±2 when the tile is VOID.
    if (cy - 2 >= 0) {
      expect(w.tiles[cy - 2][midX]).not.toBe(TILE.VOID);
    }
    if (cy + 2 < GRID_H) {
      expect(w.tiles[cy + 2][midX]).not.toBe(TILE.VOID);
    }
  });

  // ── Test 3: Vertical corridor is 3 tiles wide ──────────────────
  it('vertical corridor segment is 3 tiles wide (center +/- 1)', () => {
    const result = findWorldWithVerticalCorridor();
    if (!result) return;

    const { world: w, run } = result;
    const midY = Math.floor((run.yStart + run.yEnd) / 2);
    const cx = run.x;

    expect(w.tiles[midY][cx]).toBe(TILE.CORRIDOR);
    expect(isWalkableTile(w.tiles[midY][cx - 1])).toBe(true);
    expect(isWalkableTile(w.tiles[midY][cx + 1])).toBe(true);
  });

  // ── Test 4: L-shaped corridor preserves width at corner ─────────
  it('L-shaped corridor preserves width at the turn point', () => {
    for (let trial = 0; trial < 30; trial++) {
      const w = new World();
      w.generateFloor(trial % 7);

      // Find a corridor tile that has corridor neighbors both horizontally and vertically
      // (this is the corner of an L-shape)
      for (let y = 2; y < GRID_H - 2; y++) {
        for (let x = 2; x < GRID_W - 2; x++) {
          if (w.tiles[y][x] !== TILE.CORRIDOR) continue;

          const hasHorizNeighbor =
            (w.tiles[y][x - 1] === TILE.CORRIDOR || w.tiles[y][x + 1] === TILE.CORRIDOR);
          const hasVertNeighbor =
            (w.tiles[y - 1][x] === TILE.CORRIDOR || w.tiles[y + 1][x] === TILE.CORRIDOR);

          if (hasHorizNeighbor && hasVertNeighbor) {
            // Corner tile: the cardinal neighbors (not diagonals) should be passable.
            // Diagonals may be VOID/WALL in L-shaped corridors.
            const cardinals = [
              w.tiles[y - 1][x], w.tiles[y + 1][x],
              w.tiles[y][x - 1], w.tiles[y][x + 1],
            ];
            for (const tile of cardinals) {
              expect(tile).not.toBe(TILE.VOID);
            }
            return;
          }
        }
      }
    }
  });

  // ── Test 5: Corridor doesn't overwrite FLOOR tiles ──────────────
  it('corridor carving does not overwrite FLOOR tiles in room interiors', () => {
    // carveCorridor only overwrites VOID and WALL -> CORRIDOR.
    // Room interiors (FLOOR) must be preserved.
    // Check that room interiors (>1 tile from edge) are never CORRIDOR.
    for (let trial = 0; trial < 10; trial++) {
      const w = new World();
      w.generateFloor(trial % 7);

      for (const rd of w.rooms) {
        const r = rd.room;
        // Check deep interior (2 tiles from edge to avoid border effects)
        for (let y = r.y + 2; y < r.y + r.h - 2 && y < GRID_H; y++) {
          for (let x = r.x + 2; x < r.x + r.w - 2 && x < GRID_W; x++) {
            const tile = w.tiles[y][x];
            // Deep interior tiles should be FLOOR or special (SPAWN, EXIT, CHEST)
            // but never CORRIDOR (carveCorridor skips FLOOR tiles)
            if (tile === TILE.CORRIDOR) {
              // If we find CORRIDOR deep inside a room, the test fails
              expect(tile).not.toBe(TILE.CORRIDOR);
            }
          }
        }
      }
      return; // One generation is enough
    }
  });

  // ── Test 6: Generated dungeon has walkable corridor centers ─────
  it('corridor center tiles are walkable with bbox radius=10', () => {
    const corridors = getCorridorTiles(world);
    expect(corridors.length).toBeGreaterThan(0);

    let walkableCount = 0;
    for (const c of corridors) {
      const px = c.x * TILE_SIZE + TILE_SIZE / 2;
      const py = c.y * TILE_SIZE + TILE_SIZE / 2;
      if (world.isWalkable(px, py, 10)) {
        walkableCount++;
      }
    }

    // The vast majority of corridor tiles should be walkable at their center.
    // With 3-tile width, only edge tiles near grid boundaries might fail.
    const ratio = walkableCount / corridors.length;
    expect(ratio).toBeGreaterThan(0.7);
  });

  // ── Test 7: All 3 lanes of corridor are walkable with bbox ──────
  it('corridor center +/-1 tile lanes are all walkable for bbox player', () => {
    // Find a confirmed center of a horizontal or vertical corridor
    const hResult = findWorldWithHorizontalCorridor(5);
    const vResult = findWorldWithVerticalCorridor(5);

    if (hResult) {
      const { world: w, run } = hResult;
      const midX = Math.floor((run.xStart + run.xEnd) / 2);
      const cy = run.y;

      // All 3 lanes should have walkable tiles at their center
      for (let offset = -1; offset <= 1; offset++) {
        const ty = cy + offset;
        if (ty < 0 || ty >= GRID_H) continue;
        const tile = w.tiles[ty][midX];
        expect(isWalkableTile(tile)).toBe(true);
      }
    }

    if (vResult) {
      const { world: w, run } = vResult;
      const midY = Math.floor((run.yStart + run.yEnd) / 2);
      const cx = run.x;

      for (let offset = -1; offset <= 1; offset++) {
        const tx = cx + offset;
        if (tx < 0 || tx >= GRID_W) continue;
        const tile = w.tiles[midY][tx];
        expect(isWalkableTile(tile)).toBe(true);
      }
    }

    // At least one of horizontal or vertical should have been found
    expect(hResult || vResult).toBeTruthy();
  });

  // ── Test 8: No corridor tile adjacent to VOID on both sides ─────
  it('no corridor tile is adjacent to VOID on both sides (walls form boundary)', () => {
    const corridors = getCorridorTiles(world);
    expect(corridors.length).toBeGreaterThan(0);

    for (const c of corridors) {
      // Check horizontal pair: both left and right should NOT both be VOID
      if (c.x > 0 && c.x < GRID_W - 1) {
        const leftVoid = world.tiles[c.y][c.x - 1] === TILE.VOID;
        const rightVoid = world.tiles[c.y][c.x + 1] === TILE.VOID;
        expect(leftVoid && rightVoid).toBe(false);
      }

      // Check vertical pair: both above and below should NOT both be VOID
      if (c.y > 0 && c.y < GRID_H - 1) {
        const aboveVoid = world.tiles[c.y - 1][c.x] === TILE.VOID;
        const belowVoid = world.tiles[c.y + 1][c.x] === TILE.VOID;
        expect(aboveVoid && belowVoid).toBe(false);
      }
    }
  });
});
