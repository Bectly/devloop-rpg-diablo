/**
 * BSP Dungeon Generator
 * Splits a grid recursively via Binary Space Partitioning.
 * Each leaf node gets a room. Sibling rooms are connected via L-shaped corridors.
 *
 * Tile values: 0=floor, 1=wall, 2=door
 */

const MIN_LEAF_SIZE = 10;
const MIN_ROOM_SIZE = 5;
const MAX_ROOM_PADDING = 3;

class BSPNode {
  constructor(x, y, w, h) {
    this.x = x;
    this.y = y;
    this.w = w;
    this.h = h;
    this.left = null;
    this.right = null;
    this.room = null; // { x, y, w, h } — inner room rect within this node
  }

  split(rng) {
    if (this.left || this.right) return false; // already split

    // Decide split direction: prefer splitting along the longer axis.
    // Add some randomness so dungeons don't all look the same.
    let horizontal;
    if (this.w > this.h && this.w / this.h >= 1.25) {
      horizontal = false;
    } else if (this.h > this.w && this.h / this.w >= 1.25) {
      horizontal = true;
    } else {
      horizontal = rng() > 0.5;
    }

    const max = (horizontal ? this.h : this.w) - MIN_LEAF_SIZE;
    if (max <= MIN_LEAF_SIZE) return false; // too small to split

    const splitAt = Math.floor(rng() * (max - MIN_LEAF_SIZE) + MIN_LEAF_SIZE);

    if (horizontal) {
      this.left  = new BSPNode(this.x, this.y,          this.w, splitAt);
      this.right = new BSPNode(this.x, this.y + splitAt, this.w, this.h - splitAt);
    } else {
      this.left  = new BSPNode(this.x,          this.y, splitAt,          this.h);
      this.right = new BSPNode(this.x + splitAt, this.y, this.w - splitAt, this.h);
    }
    return true;
  }

  // Recursively split until leaves are small enough.
  splitRecursively(rng, depth = 0) {
    if (depth > 6) return;
    if (this.split(rng)) {
      this.left.splitRecursively(rng, depth + 1);
      this.right.splitRecursively(rng, depth + 1);
    }
  }

  isLeaf() {
    return !this.left && !this.right;
  }

  // Place a room inside this leaf node.
  createRoom(rng) {
    if (!this.isLeaf()) return;
    const padding = 1 + Math.floor(rng() * MAX_ROOM_PADDING);
    const rw = Math.max(MIN_ROOM_SIZE, this.w - padding * 2 - Math.floor(rng() * 3));
    const rh = Math.max(MIN_ROOM_SIZE, this.h - padding * 2 - Math.floor(rng() * 3));
    const rx = this.x + padding + Math.floor(rng() * Math.max(1, this.w - rw - padding * 2));
    const ry = this.y + padding + Math.floor(rng() * Math.max(1, this.h - rh - padding * 2));
    this.room = { x: rx, y: ry, w: rw, h: rh };
  }

  // Return the room in this node (or the best child room if branching).
  getRoom() {
    if (this.isLeaf()) return this.room;
    const lr = this.left  ? this.left.getRoom()  : null;
    const rr = this.right ? this.right.getRoom() : null;
    if (!lr) return rr;
    if (!rr) return lr;
    // Randomly return one so corridors vary.
    return Math.random() > 0.5 ? lr : rr;
  }

  // Walk all leaf rooms.
  getRooms(out = []) {
    if (this.isLeaf()) {
      if (this.room) out.push(this.room);
    } else {
      if (this.left)  this.left.getRooms(out);
      if (this.right) this.right.getRooms(out);
    }
    return out;
  }
}

// Carve tiles for a rectangle — all floor.
function carveRoom(tiles, room) {
  for (let y = room.y; y < room.y + room.h; y++) {
    for (let x = room.x; x < room.w + room.x; x++) {
      tiles[y][x] = 0;
    }
  }
}

// Connect two rooms with an L-shaped corridor.
function carveCorridor(tiles, a, b) {
  const ax = Math.floor(a.x + a.w / 2);
  const ay = Math.floor(a.y + a.h / 2);
  const bx = Math.floor(b.x + b.w / 2);
  const by = Math.floor(b.y + b.h / 2);

  // Horizontal leg first, then vertical.
  const x1 = Math.min(ax, bx);
  const x2 = Math.max(ax, bx);
  for (let x = x1; x <= x2; x++) {
    if (tiles[ay] && tiles[ay][x] === 1) tiles[ay][x] = 0;
  }
  const y1 = Math.min(ay, by);
  const y2 = Math.max(ay, by);
  for (let y = y1; y <= y2; y++) {
    if (tiles[y] && tiles[y][bx] === 1) tiles[y][bx] = 0;
  }
}

// Recursively carve rooms and corridors from a node.
function carveNode(tiles, node) {
  if (node.isLeaf()) {
    if (node.room) carveRoom(tiles, node.room);
    return;
  }
  if (node.left)  carveNode(tiles, node.left);
  if (node.right) carveNode(tiles, node.right);

  // Connect sibling rooms.
  const la = node.left  ? node.left.getRoom()  : null;
  const ra = node.right ? node.right.getRoom() : null;
  if (la && ra) carveCorridor(tiles, la, ra);
}

/**
 * Generate a BSP dungeon.
 * Returns { tiles, rooms, width, height, startRoom, exitRoom }
 *
 * @param {object} opts
 * @param {number} opts.width  — tile columns (default 80)
 * @param {number} opts.height — tile rows   (default 50)
 * @param {number} opts.seed   — optional seed for deterministic generation
 */
function generateBSPDungeon({ width = 80, height = 50, seed } = {}) {
  // Simple seeded LCG RNG so dungeon can be reproduced.
  let s = seed !== undefined ? seed : Math.floor(Math.random() * 1e9);
  const rng = () => {
    s = (s * 1664525 + 1013904223) & 0xffffffff;
    return (s >>> 0) / 0xffffffff;
  };

  // Fill everything with walls.
  const tiles = [];
  for (let y = 0; y < height; y++) {
    tiles[y] = new Array(width).fill(1);
  }

  // BSP split.
  const root = new BSPNode(0, 0, width, height);
  root.splitRecursively(rng);

  // Create a room in each leaf.
  (function createRooms(node) {
    if (node.isLeaf()) { node.createRoom(rng); return; }
    if (node.left)  createRooms(node.left);
    if (node.right) createRooms(node.right);
  }(root));

  // Carve rooms + corridors into tiles.
  carveNode(tiles, root);

  const rooms = root.getRooms();

  // First room = player spawn, last room = exit.
  const startRoom = rooms[0];
  const exitRoom  = rooms[rooms.length - 1];

  // Place entrance and exit markers as door tiles.
  if (startRoom) {
    const ex = Math.floor(startRoom.x + startRoom.w / 2);
    const ey = Math.floor(startRoom.y + startRoom.h / 2);
    tiles[ey][ex] = 2; // door = entrance marker
  }
  if (exitRoom) {
    const ex = Math.floor(exitRoom.x + exitRoom.w / 2);
    const ey = Math.floor(exitRoom.y + exitRoom.h / 2);
    tiles[ey][ex] = 2; // door = exit marker
  }

  return { tiles, rooms, width, height, startRoom, exitRoom, seed: s };
}

/**
 * Pick monster spawn positions from the middle rooms (skip start + exit).
 * Returns array of { type, x, y } in pixel coords.
 */
function generateMonsterSpawns(rooms, tileSize, difficultyLevel = 1) {
  const MONSTER_TYPES = ['skeleton', 'zombie', 'demon'];
  const spawns = [];

  // Skip first and last room (spawn/exit).
  for (let i = 1; i < rooms.length - 1; i++) {
    const room = rooms[i];
    const area = room.w * room.h;
    const count = Math.max(1, Math.min(4, Math.floor(area / 40) + difficultyLevel - 1));

    for (let n = 0; n < count; n++) {
      // Spread monsters across the room.
      const col = room.x + 1 + Math.floor(Math.random() * (room.w - 2));
      const row = room.y + 1 + Math.floor(Math.random() * (room.h - 2));
      const type = MONSTER_TYPES[Math.floor(Math.random() * MONSTER_TYPES.length)];
      spawns.push({
        type,
        x: col * tileSize + tileSize / 2,
        y: row * tileSize + tileSize / 2,
      });
    }
  }

  return spawns;
}

module.exports = { generateBSPDungeon, generateMonsterSpawns };
