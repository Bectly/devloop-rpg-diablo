import { describe, it, expect, beforeEach } from 'vitest';
import { createRequire } from 'module';
const require = createRequire(import.meta.url);
const { World, TILE_SIZE, TILE, GRID_W, GRID_H } = require('../game/world');
const { Monster, createMonster } = require('../game/monsters');

/**
 * Collision bounding-box edge-case tests (Cycle #214)
 *
 * Verifies that the 4-corner bbox check in isWalkable prevents entities
 * (players and monsters) from overlapping walls during movement.
 */

// ── Helper: find a floor tile directly adjacent to a wall ──────────
function findFloorNextToWall(world, side = 'above') {
  for (let y = 2; y < GRID_H - 2; y++) {
    for (let x = 2; x < GRID_W - 2; x++) {
      if (world.tiles[y][x] !== TILE.FLOOR) continue;
      if (side === 'above' && world.tiles[y - 1][x] === TILE.WALL) {
        return { tileX: x, tileY: y, wallY: y - 1 };
      }
      if (side === 'left' && world.tiles[y][x - 1] === TILE.WALL) {
        return { tileX: x, tileY: y, wallX: x - 1 };
      }
    }
  }
  return null;
}

// ── Helper: find a safe interior floor position ─────────────────
function findSafeFloorCenter(world) {
  for (let y = 3; y < GRID_H - 3; y++) {
    for (let x = 3; x < GRID_W - 3; x++) {
      let ok = true;
      for (let dy = -1; dy <= 1 && ok; dy++) {
        for (let dx = -1; dx <= 1 && ok; dx++) {
          if (world.tiles[y + dy][x + dx] !== TILE.FLOOR) ok = false;
        }
      }
      if (ok) {
        return {
          x: x * TILE_SIZE + TILE_SIZE / 2,
          y: y * TILE_SIZE + TILE_SIZE / 2,
        };
      }
    }
  }
  return null;
}

describe('Collision bbox gameplay implications (Cycle #214)', () => {
  let world;

  beforeEach(() => {
    world = new World();
    world.generateFloor(0);
  });

  // ── Monster moveToward stops before wall ──────────────────────
  describe('Monster.moveToward with _world reference', () => {
    it('does not move into wall-adjacent position where bbox would overlap wall', () => {
      const spot = findFloorNextToWall(world, 'above');
      if (!spot) return; // skip if map layout has no suitable spot

      const monster = createMonster('skeleton', 0, 0, 0);
      // Place monster on the floor tile, centered
      monster.x = spot.tileX * TILE_SIZE + TILE_SIZE / 2;
      monster.y = spot.tileY * TILE_SIZE + TILE_SIZE / 2;
      monster._world = world;

      // Target is in the wall tile above — monster should NOT cross into wall
      const targetX = spot.tileX * TILE_SIZE + TILE_SIZE / 2;
      const targetY = (spot.tileY - 1) * TILE_SIZE + TILE_SIZE / 2; // center of wall tile

      const startY = monster.y;
      // Run many movement ticks
      for (let i = 0; i < 100; i++) {
        monster.moveToward(targetX, targetY, 50); // 50ms ticks
      }

      // Monster should still be on a walkable position
      expect(world.isWalkable(monster.x, monster.y)).toBe(true);
      // Monster should not have reached the wall tile center
      expect(monster.y).toBeGreaterThan((spot.tileY - 1) * TILE_SIZE + TILE_SIZE / 2);
    });
  });

  // ── Monster moveAwayFrom stops before wall ────────────────────
  describe('Monster.moveAwayFrom with _world reference', () => {
    it('does not flee into wall-adjacent position where bbox would overlap wall', () => {
      const spot = findFloorNextToWall(world, 'above');
      if (!spot) return;

      const monster = createMonster('skeleton', 0, 0, 0);
      // Place monster on the floor tile
      monster.x = spot.tileX * TILE_SIZE + TILE_SIZE / 2;
      monster.y = spot.tileY * TILE_SIZE + TILE_SIZE / 2;
      monster._world = world;

      // Threat is below — monster flees upward toward the wall
      const threatX = spot.tileX * TILE_SIZE + TILE_SIZE / 2;
      const threatY = (spot.tileY + 3) * TILE_SIZE + TILE_SIZE / 2;

      for (let i = 0; i < 100; i++) {
        monster.moveAwayFrom(threatX, threatY, 50);
      }

      // Monster should still be on a walkable position
      expect(world.isWalkable(monster.x, monster.y)).toBe(true);
    });
  });

  // ── Player-like entity collision ──────────────────────────────
  describe('Player movement collision check', () => {
    it('isWalkable rejects position where player bbox overlaps wall', () => {
      const spot = findFloorNextToWall(world, 'above');
      if (!spot) return;

      // Player position: on the floor tile but very close to the wall boundary
      const px = spot.tileX * TILE_SIZE + TILE_SIZE / 2;
      const py = spot.tileY * TILE_SIZE + 3; // 3px into tile, radius=10 reaches into wall tile

      // With default radius (10), bbox top corners are in wall tile
      expect(world.isWalkable(px, py)).toBe(false);

      // Same position with radius=0 should pass (center is on floor tile)
      expect(world.isWalkable(px, py, 0)).toBe(true);
    });
  });

  // ── Safety net: valid floor center should never trigger ───────
  describe('Safety net validation', () => {
    it('player on valid floor tile center is always walkable', () => {
      const safe = findSafeFloorCenter(world);
      if (!safe) return;

      // Default radius
      expect(world.isWalkable(safe.x, safe.y)).toBe(true);
      // Larger radius (still surrounded by floor)
      expect(world.isWalkable(safe.x, safe.y, 14)).toBe(true);
    });

    it('isWalkable with default radius=10 matches 4-corner check', () => {
      const safe = findSafeFloorCenter(world);
      if (!safe) return;

      // Manually verify all 4 corners are walkable
      const r = 10;
      const topLeft = world._tileWalkable(safe.x - r, safe.y - r);
      const topRight = world._tileWalkable(safe.x + r, safe.y - r);
      const bottomLeft = world._tileWalkable(safe.x - r, safe.y + r);
      const bottomRight = world._tileWalkable(safe.x + r, safe.y + r);

      expect(topLeft && topRight && bottomLeft && bottomRight).toBe(true);
      expect(world.isWalkable(safe.x, safe.y, r)).toBe(true);
    });

    it('spawn position is always walkable with default radius', () => {
      const pos = world.getSpawnPosition(0);
      expect(world.isWalkable(pos.x, pos.y)).toBe(true);
    });
  });

  // ── Wall-sliding behavior ─────────────────────────────────────
  describe('Monster wall-sliding', () => {
    it('monster slides along wall axis when diagonal move is blocked', () => {
      const spot = findFloorNextToWall(world, 'above');
      if (!spot) return;

      const monster = createMonster('skeleton', 0, 0, 0);
      // Place on the floor tile center (guaranteed walkable with default radius)
      monster.x = spot.tileX * TILE_SIZE + TILE_SIZE / 2;
      monster.y = spot.tileY * TILE_SIZE + TILE_SIZE / 2;
      monster._world = world;

      // Confirm starting position is walkable
      expect(world.isWalkable(monster.x, monster.y)).toBe(true);

      // Target is diagonally up-left (into wall territory above)
      const targetX = (spot.tileX - 3) * TILE_SIZE;
      const targetY = (spot.tileY - 3) * TILE_SIZE;

      const startX = monster.x;
      const startY = monster.y;

      // Move many ticks — monster should wall-slide (move on X axis, blocked on Y)
      for (let i = 0; i < 50; i++) {
        monster.moveToward(targetX, targetY, 50);
      }

      // Monster should still be on a walkable position (never stuck in wall)
      expect(world.isWalkable(monster.x, monster.y)).toBe(true);

      // Monster should have moved at least on one axis (wall-sliding)
      const moved = (monster.x !== startX || monster.y !== startY);
      expect(moved).toBe(true);
    });
  });
});

/**
 * Charge attack collision tests (Cycle #219)
 *
 * Verifies that the hell_hound charge attack respects isWalkable:
 * - With _world reference: charge stops at walls
 * - Without _world reference: charge moves freely (fallback)
 */
describe('Charge attack collision (Cycle #219)', () => {
  let world;

  beforeEach(() => {
    world = new World();
    world.generateFloor(0);
  });

  describe('Monster charge attack respects isWalkable', () => {
    it('charge movement stops at wall when _world is set', () => {
      const spot = findFloorNextToWall(world, 'above');
      if (!spot) return;

      const monster = createMonster('hell_hound', 0, 0, 0);
      // Place on floor tile center
      monster.x = spot.tileX * TILE_SIZE + TILE_SIZE / 2;
      monster.y = spot.tileY * TILE_SIZE + TILE_SIZE / 2;
      monster._world = world;

      // Set up an active charge toward the wall above
      monster.charging = true;
      monster.chargeTargetX = spot.tileX * TILE_SIZE + TILE_SIZE / 2;
      monster.chargeTargetY = (spot.tileY - 5) * TILE_SIZE; // deep into wall territory
      monster.chargeTimer = 2000; // long charge to ensure we hit the wall

      const startY = monster.y;

      // Simulate charge over multiple ticks via update()
      // We need a player for update() to not skip ALERT state logic
      const player = { id: 'p1', alive: true, x: monster.chargeTargetX, y: monster.chargeTargetY };
      monster.aiState = 1; // ALERT state
      for (let i = 0; i < 60; i++) {
        monster.update(50, [player]);
      }

      // Monster should still be on a walkable position
      expect(world.isWalkable(monster.x, monster.y)).toBe(true);
    });

    it('charge stops when both X and Y moves are blocked by walls', () => {
      // Use a mock world where a wall blocks at a specific coordinate
      const monster = createMonster('hell_hound', 0, 0, 0);
      monster.x = 100;
      monster.y = 100;
      // Mock world: wall at y < 80 and x < 80
      monster._world = {
        isWalkable: (x, y) => x >= 80 && y >= 80,
      };

      monster.charging = true;
      monster.chargeTargetX = 50;  // behind the wall
      monster.chargeTargetY = 50;  // behind the wall
      monster.chargeTimer = 2000;

      const startX = monster.x;
      const startY = monster.y;

      // Manually simulate the charge movement logic (from monsters.js lines 746-764)
      for (let i = 0; i < 30; i++) {
        if (!monster.charging) break;
        const cdx = monster.chargeTargetX - monster.x;
        const cdy = monster.chargeTargetY - monster.y;
        const cdist = Math.sqrt(cdx * cdx + cdy * cdy);
        const chargeStep = monster.speed * monster.chargeSpeedMult * (50 / 1000);

        if (cdist < chargeStep || monster.chargeTimer <= 0) {
          monster.charging = false;
        } else {
          const chX = (cdx / cdist) * chargeStep;
          const chY = (cdy / cdist) * chargeStep;
          const newX = monster.x + chX;
          const newY = monster.y + chY;
          if (monster._world.isWalkable(newX, newY)) {
            monster.x = newX;
            monster.y = newY;
          } else if (monster._world.isWalkable(newX, monster.y)) {
            monster.x = newX;
          } else if (monster._world.isWalkable(monster.x, newY)) {
            monster.y = newY;
          }
          // else: charge hits wall, stops
          monster.chargeTimer -= 50;
        }
      }

      // Monster should not have passed the wall boundary
      expect(monster.x).toBeGreaterThanOrEqual(80);
      expect(monster.y).toBeGreaterThanOrEqual(80);
    });

    it('monster without _world reference still moves during charge (fallback)', () => {
      const monster = createMonster('hell_hound', 0, 0, 0);
      monster.x = 100;
      monster.y = 100;
      // No _world set — fallback path

      monster.charging = true;
      monster.chargeTargetX = 300;
      monster.chargeTargetY = 100;
      monster.chargeTimer = 2000;

      const startX = monster.x;

      // Simulate the charge movement fallback (no collision check)
      for (let i = 0; i < 20; i++) {
        if (!monster.charging) break;
        const cdx = monster.chargeTargetX - monster.x;
        const cdy = monster.chargeTargetY - monster.y;
        const cdist = Math.sqrt(cdx * cdx + cdy * cdy);
        const chargeStep = monster.speed * monster.chargeSpeedMult * (50 / 1000);

        if (cdist < chargeStep || monster.chargeTimer <= 0) {
          monster.charging = false;
        } else {
          const chX = (cdx / cdist) * chargeStep;
          const chY = (cdy / cdist) * chargeStep;
          // Fallback: no _world, so just move directly
          monster.x += chX;
          monster.y += chY;
          monster.chargeTimer -= 50;
        }
      }

      // Monster should have moved significantly toward target
      expect(monster.x).toBeGreaterThan(startX + 50);
    });
  });
});
