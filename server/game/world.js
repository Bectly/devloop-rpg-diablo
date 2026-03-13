const { v4: uuidv4 } = require('uuid');
const { createMonster } = require('./monsters');
const { generateConsumable } = require('./items');
const { generateShopInventory } = require('./shop');
const { rollAffixes, applyAffixes } = require('./affixes');
const { generateTrapsForRoom } = require('./traps');
// Note: rifts.js is required lazily in generateRiftFloor/spawnRiftGuardian to avoid
// the circular dependency (rifts.js already requires world.js for ZONE_DEFS).

const TILE_SIZE = 32;
const GRID_W = 60;
const GRID_H = 40;

// Tile types
const TILE = {
  VOID: -1,
  FLOOR: 0,
  WALL: 1,
  DOOR: 2,
  CORRIDOR: 3,
  SPAWN: 4,
  EXIT: 5,
  CHEST: 6,
};

// Room type definitions
const ROOM_TYPES = {
  start:    { name: 'Entrance',        monsterWaves: 0, hasChest: false },
  monster:  { name: 'Chamber',         monsterWaves: 2, hasChest: false },
  treasure: { name: 'Treasure Room',   monsterWaves: 1, hasChest: true  },
  boss:     { name: 'Boss Arena',      monsterWaves: 1, hasChest: true  },
};

// Names for floors
const FLOOR_NAMES = [
  'Dusty Catacombs',
  'Sunken Crypts',
  'Burning Depths',
  'Infernal Halls',
  'Shadow Abyss',
  'Abyssal Core',
  'Throne of Ruin',
];

// ── Zone Definitions ─────────────────────────────────────────────
const ZONE_DEFS = {
  catacombs: {
    id: 'catacombs',
    name: 'The Catacombs',
    floors: [0, 1],
    tileColor: 0x8a7a6a,
    wallColor: 0x5a4a3a,
    monsterPool: ['skeleton', 'skeleton', 'slime', 'archer'],
    boss: 'boss_knight',
    bossFloor: 1,
  },
  inferno: {
    id: 'inferno',
    name: 'The Inferno',
    floors: [2, 3],
    tileColor: 0x6a2a1a,
    wallColor: 0x4a1a0a,
    monsterPool: ['demon', 'fire_imp', 'hell_hound', 'archer'],
    boss: 'boss_infernal',
    bossFloor: 3,
  },
  abyss: {
    id: 'abyss',
    name: 'The Abyss',
    floors: [4, 5, 6],
    tileColor: 0x2a1a3a,
    wallColor: 0x1a0a2a,
    monsterPool: ['shadow_stalker', 'demon', 'wraith', 'zombie'],
    boss: 'boss_void',
    bossFloor: 6,
  },
};

// ── Difficulty Scaling ─────────────────────────────────────────
const DIFFICULTY_SCALES = {
  normal:    { label: 'Normal',    hpMult: 1.0, dmgMult: 1.0, eliteBonus: 0,    xpMult: 1.0, goldMult: 1.0 },
  nightmare: { label: 'Nightmare', hpMult: 1.5, dmgMult: 1.3, eliteBonus: 0.10, xpMult: 1.5, goldMult: 1.3 },
  hell:      { label: 'Hell',      hpMult: 2.5, dmgMult: 1.8, eliteBonus: 0.20, xpMult: 2.0, goldMult: 1.6 },
};

function getZoneForFloor(floor) {
  for (const zone of Object.values(ZONE_DEFS)) {
    if (zone.floors.includes(floor)) return zone;
  }
  return ZONE_DEFS.abyss; // fallback for any floor beyond 6
}

// ─── BSP Node ────────────────────────────────────────────────────
class BSPNode {
  constructor(x, y, w, h) {
    this.x = x;
    this.y = y;
    this.w = w;
    this.h = h;
    this.left = null;
    this.right = null;
    this.room = null;
  }

  split(minSize) {
    if (this.left || this.right) return false;
    if (this.w < minSize * 2 + 4 && this.h < minSize * 2 + 4) return false;

    let horizontal;
    if (this.w > this.h * 1.25) horizontal = false;
    else if (this.h > this.w * 1.25) horizontal = true;
    else horizontal = Math.random() > 0.5;

    const max = (horizontal ? this.h : this.w) - minSize - 2;
    if (max < minSize) return false;

    const split = Math.floor(Math.random() * (max - minSize + 1)) + minSize;

    if (horizontal) {
      this.left  = new BSPNode(this.x, this.y, this.w, split);
      this.right = new BSPNode(this.x, this.y + split, this.w, this.h - split);
    } else {
      this.left  = new BSPNode(this.x, this.y, split, this.h);
      this.right = new BSPNode(this.x + split, this.y, this.w - split, this.h);
    }
    return true;
  }

  getLeaves() {
    if (!this.left && !this.right) return [this];
    const leaves = [];
    if (this.left)  leaves.push(...this.left.getLeaves());
    if (this.right) leaves.push(...this.right.getLeaves());
    return leaves;
  }

  createRoom(minRoomSize) {
    if (this.left || this.right) {
      if (this.left)  this.left.createRoom(minRoomSize);
      if (this.right) this.right.createRoom(minRoomSize);
      return;
    }

    const roomW = Math.floor(Math.random() * (this.w - minRoomSize - 2)) + minRoomSize;
    const roomH = Math.floor(Math.random() * (this.h - minRoomSize - 2)) + minRoomSize;
    const roomX = this.x + Math.floor(Math.random() * (this.w - roomW - 1)) + 1;
    const roomY = this.y + Math.floor(Math.random() * (this.h - roomH - 1)) + 1;

    this.room = { x: roomX, y: roomY, w: roomW, h: roomH };
  }

  getRoom() {
    if (this.room) return this.room;
    if (this.left) {
      const lr = this.left.getRoom();
      if (lr) return lr;
    }
    if (this.right) {
      const rr = this.right.getRoom();
      if (rr) return rr;
    }
    return null;
  }
}

// ─── BSP Dungeon Generator ──────────────────────────────────────
function generateBSPDungeon(floor, roomCount) {
  const tiles = [];
  for (let y = 0; y < GRID_H; y++) {
    tiles[y] = new Array(GRID_W).fill(TILE.VOID);
  }

  const targetRooms = roomCount || (5 + Math.floor(Math.random() * 4));
  const minRoomSize = 5;

  // Build BSP tree
  const root = new BSPNode(0, 0, GRID_W, GRID_H);
  const splitQueue = [root];
  let iterations = 0;
  while (splitQueue.length > 0 && iterations < 50) {
    const node = splitQueue.shift();
    if (node.split(minRoomSize + 2)) {
      splitQueue.push(node.left);
      splitQueue.push(node.right);
    }
    iterations++;
  }

  // Create rooms in leaves
  root.createRoom(minRoomSize);
  const leaves = root.getLeaves();

  const rooms = [];
  for (const leaf of leaves) {
    if (leaf.room) rooms.push(leaf.room);
  }

  // Limit to target count
  while (rooms.length > targetRooms) {
    rooms.splice(Math.floor(Math.random() * rooms.length), 1);
  }

  if (rooms.length < 2) {
    rooms.length = 0;
    rooms.push({ x: 2, y: 2, w: 12, h: 8 });
    rooms.push({ x: GRID_W - 16, y: GRID_H - 12, w: 12, h: 8 });
  }

  // Carve rooms into tile grid
  for (const room of rooms) {
    for (let y = room.y; y < room.y + room.h && y < GRID_H; y++) {
      for (let x = room.x; x < room.x + room.w && x < GRID_W; x++) {
        tiles[y][x] = TILE.FLOOR;
      }
    }
    for (let y = room.y - 1; y <= room.y + room.h && y < GRID_H; y++) {
      for (let x = room.x - 1; x <= room.x + room.w && x < GRID_W; x++) {
        if (y < 0 || x < 0) continue;
        if (tiles[y][x] === TILE.VOID) {
          tiles[y][x] = TILE.WALL;
        }
      }
    }
  }

  // Connect rooms with corridors
  for (let i = 0; i < rooms.length - 1; i++) {
    const a = rooms[i];
    const b = rooms[i + 1];
    carveCorridor(tiles,
      Math.floor(a.x + a.w / 2), Math.floor(a.y + a.h / 2),
      Math.floor(b.x + b.w / 2), Math.floor(b.y + b.h / 2));
  }

  // Extra loop connection
  if (rooms.length > 3) {
    const mid = Math.floor(rooms.length / 2);
    carveCorridor(tiles,
      Math.floor(rooms[0].x + rooms[0].w / 2), Math.floor(rooms[0].y + rooms[0].h / 2),
      Math.floor(rooms[mid].x + rooms[mid].w / 2), Math.floor(rooms[mid].y + rooms[mid].h / 2));
  }

  // Assign room types
  const roomData = assignRoomTypes(rooms, floor);

  // Place spawn
  const startRoom = roomData.find(r => r.type === 'start');
  if (startRoom) {
    const cx = Math.floor(startRoom.room.x + startRoom.room.w / 2);
    const cy = Math.floor(startRoom.room.y + startRoom.room.h / 2);
    tiles[cy][cx] = TILE.SPAWN;
  }

  // Place exit door
  const bossRoom = roomData.find(r => r.type === 'boss') || roomData[roomData.length - 1];
  if (bossRoom) {
    const ex = Math.floor(bossRoom.room.x + bossRoom.room.w / 2);
    const ey = bossRoom.room.y + bossRoom.room.h - 1;
    if (ey >= 0 && ey < GRID_H && ex >= 0 && ex < GRID_W) {
      tiles[ey][ex] = TILE.EXIT;
    }
  }

  // Place chests
  for (const rd of roomData) {
    if (rd.hasChest) {
      const cx = Math.floor(rd.room.x + rd.room.w / 2) + (Math.random() > 0.5 ? 1 : -1);
      const cy = Math.floor(rd.room.y + rd.room.h / 2);
      if (cy >= 0 && cy < GRID_H && cx >= 0 && cx < GRID_W && tiles[cy][cx] === TILE.FLOOR) {
        tiles[cy][cx] = TILE.CHEST;
      }
    }
  }

  placeDoors(tiles);
  return { tiles, rooms: roomData, startRoom, bossRoom };
}

function carveCorridor(tiles, x1, y1, x2, y2) {
  let cx = x1;
  let cy = y1;

  while (cx !== x2) {
    if (cx >= 0 && cx < GRID_W && cy >= 0 && cy < GRID_H) {
      if (tiles[cy][cx] === TILE.VOID || tiles[cy][cx] === TILE.WALL) {
        tiles[cy][cx] = TILE.CORRIDOR;
      }
      if (cy - 1 >= 0 && tiles[cy - 1][cx] === TILE.VOID) tiles[cy - 1][cx] = TILE.WALL;
      if (cy + 1 < GRID_H && tiles[cy + 1][cx] === TILE.VOID) tiles[cy + 1][cx] = TILE.WALL;
    }
    cx += cx < x2 ? 1 : -1;
  }

  while (cy !== y2) {
    if (cx >= 0 && cx < GRID_W && cy >= 0 && cy < GRID_H) {
      if (tiles[cy][cx] === TILE.VOID || tiles[cy][cx] === TILE.WALL) {
        tiles[cy][cx] = TILE.CORRIDOR;
      }
      if (cx - 1 >= 0 && tiles[cy][cx - 1] === TILE.VOID) tiles[cy][cx - 1] = TILE.WALL;
      if (cx + 1 < GRID_W && tiles[cy][cx + 1] === TILE.VOID) tiles[cy][cx + 1] = TILE.WALL;
    }
    cy += cy < y2 ? 1 : -1;
  }
}

function placeDoors(tiles) {
  for (let y = 1; y < GRID_H - 1; y++) {
    for (let x = 1; x < GRID_W - 1; x++) {
      if (tiles[y][x] !== TILE.CORRIDOR) continue;

      let touchesFloor = false;
      let touchesCorridor = false;
      for (const [dx, dy] of [[0,-1],[0,1],[-1,0],[1,0]]) {
        const ny = y + dy;
        const nx = x + dx;
        if (ny >= 0 && ny < GRID_H && nx >= 0 && nx < GRID_W) {
          if (tiles[ny][nx] === TILE.FLOOR) touchesFloor = true;
          if (tiles[ny][nx] === TILE.CORRIDOR) touchesCorridor = true;
        }
      }

      if (touchesFloor && touchesCorridor) {
        const hasHorizWalls = (
          y - 1 >= 0 && y + 1 < GRID_H &&
          tiles[y - 1][x] === TILE.WALL && tiles[y + 1][x] === TILE.WALL
        );
        const hasVertWalls = (
          x - 1 >= 0 && x + 1 < GRID_W &&
          tiles[y][x - 1] === TILE.WALL && tiles[y][x + 1] === TILE.WALL
        );
        if (hasHorizWalls || hasVertWalls) {
          tiles[y][x] = TILE.DOOR;
        }
      }
    }
  }
}

function assignRoomTypes(rooms, floor) {
  const zone = getZoneForFloor(floor);
  const isBossFloor = floor === zone.bossFloor;

  const roomData = [];
  for (let i = 0; i < rooms.length; i++) {
    let type;
    if (i === 0) type = 'start';
    else if (i === rooms.length - 1 && isBossFloor) type = 'boss';
    else if (i === rooms.length - 1) type = 'treasure'; // non-boss floors end with treasure
    else if (Math.random() < 0.3) type = 'treasure';
    else type = 'monster';

    const def = ROOM_TYPES[type];
    // Healing shrines: 30% chance in non-boss, non-start rooms
    const hasShrine = (type === 'monster' || type === 'treasure') && Math.random() < 0.3;

    roomData.push({
      id: uuidv4(),
      index: i,
      room: rooms[i],
      type,
      name: def.name,
      hasChest: def.hasChest,
      hasShrine,
      shrineUsed: false,
      waveCount: def.monsterWaves,
      wavesSpawned: 0,
      wavesCleared: 0,
      monstersAlive: 0,
      discovered: i === 0,
      cleared: type === 'start',
    });
  }
  return roomData;
}

// ─── Monster helpers ────────────────────────────────────────────
function _spawnScaledMonster(type, mx, my, floor, scale) {
  const monster = createMonster(type, mx, my, floor);
  monster.hp = Math.floor(monster.hp * scale.hpMult);
  monster.maxHp = Math.floor(monster.maxHp * scale.hpMult);
  monster.damage = Math.floor(monster.damage * scale.dmgMult);
  monster.xpReward = Math.floor(monster.xpReward * scale.xpMult);
  monster.goldMult = scale.goldMult;
  const affixResult = rollAffixes(floor, type, scale.eliteBonus);
  if (affixResult) applyAffixes(monster, affixResult);
  return monster;
}

// ─── Monster wave generator ─────────────────────────────────────
function generateWaveMonsters(roomData, waveIndex, floor, difficulty = 'normal') {
  const monsters = [];
  const room = roomData.room;
  const countScale = 1 + Math.floor(floor / 2) * 0.5;

  let baseCount;
  if (roomData.type === 'boss') {
    baseCount = waveIndex === 0 ? 1 : 0;
  } else if (roomData.type === 'treasure') {
    baseCount = 2;
  } else {
    baseCount = 2 + waveIndex;
  }

  const count = Math.min(6, Math.ceil(baseCount * countScale));
  const monsterPool = getMonsterPoolForFloor(floor);
  const scale = DIFFICULTY_SCALES[difficulty] || DIFFICULTY_SCALES.normal;

  const zone = getZoneForFloor(floor);

  for (let i = 0; i < count; i++) {
    const type = roomData.type === 'boss' && waveIndex === 0 && i === 0
      ? zone.boss
      : monsterPool[Math.floor(Math.random() * monsterPool.length)];

    const mx = (room.x + 1 + Math.random() * (room.w - 2)) * TILE_SIZE;
    const my = (room.y + 1 + Math.random() * (room.h - 2)) * TILE_SIZE;
    const monster = _spawnScaledMonster(type, mx, my, floor, scale);
    monsters.push(monster);
  }

  if (roomData.type === 'boss' && floor > 1) {
    const addCount = Math.min(3, floor - 1);
    for (let i = 0; i < addCount; i++) {
      const type = monsterPool[Math.floor(Math.random() * monsterPool.length)];
      const mx = (room.x + 1 + Math.random() * (room.w - 2)) * TILE_SIZE;
      const my = (room.y + 1 + Math.random() * (room.h - 2)) * TILE_SIZE;
      const monster = _spawnScaledMonster(type, mx, my, floor, scale);
      monsters.push(monster);
    }
  }

  return monsters;
}

function getMonsterPoolForFloor(floor) {
  const zone = getZoneForFloor(floor);
  return zone.monsterPool;
}

// ─── World Class ────────────────────────────────────────────────
class World {
  constructor() {
    this.currentFloor = 0;
    this.tiles = null;
    this.rooms = [];
    this.monsters = [];
    this.groundItems = [];
    this.roomName = '';
    this.floorName = '';
    this.exitLocked = true;
    this._advancing = false;

    this.activeRoom = null;
    this.waveTimer = 0;
    this.waveActive = false;
    this.currentWave = 0;

    // Loot chests (boss drops)
    this.lootChests = [];

    // Shop NPC
    this.shopNpc = null;

    // Story NPCs placed in rooms
    this.storyNpcs = [];

    // Environmental traps
    this.traps = [];

    // Zone
    this.zone = null;

    // Difficulty
    this.difficulty = 'normal';

    // Rift state
    this.riftActive = false;
    this.riftConfig = null;
    this.riftTimer = 0;
    this.riftTimeLimit = 0;
    this.riftStartTime = 0;
  }

  generateFloor(floorNum, difficulty) {
    if (difficulty) this.difficulty = difficulty;
    this.currentFloor = floorNum;
    this.floorName = FLOOR_NAMES[floorNum % FLOOR_NAMES.length];
    this.zone = getZoneForFloor(floorNum);
    const roomCount = 5 + Math.min(3, Math.floor(floorNum / 2));
    const result = generateBSPDungeon(floorNum, roomCount);

    this.tiles = result.tiles;
    this.rooms = result.rooms;
    this.monsters = [];
    this.groundItems = [];
    this.lootChests = [];
    this.exitLocked = true;
    this.waveActive = false;
    this.currentWave = 0;
    this.activeRoom = null;
    this._advancing = false;

    this.roomName = `${this.floorName} - Floor ${floorNum + 1}`;

    // Spawn shop NPC in start room
    this.spawnShopNpc(floorNum);

    // Place story NPCs in dungeon rooms
    this.placeStoryNpcs(floorNum);

    // Generate environmental traps in monster/treasure rooms (not start/boss)
    this.traps = [];
    for (const rd of this.rooms) {
      if (rd.type === 'start' || rd.type === 'boss') continue;
      const roomTraps = generateTrapsForRoom(rd.room, this.zone.id, TILE_SIZE);
      this.traps.push(...roomTraps);
    }

    console.log(`[World] Generated floor ${floorNum + 1}: ${this.floorName} with ${this.rooms.length} rooms`);
    return this.getFloorInfo();
  }

  generateRiftFloor(riftConfig) {
    this.riftActive = true;
    this.riftConfig = riftConfig;
    this.riftTimeLimit = riftConfig.timeLimit;
    this.riftTimer = riftConfig.timeLimit;
    this.riftStartTime = Date.now();

    // Resolve full zone data from ZONE_DEFS so the tile/monster pool is available
    this.zone = ZONE_DEFS[riftConfig.zone.id] || ZONE_DEFS.catacombs;

    this.currentFloor = riftConfig.tier + 10; // synthetic high floor for loot/difficulty scaling
    this.floorName = `Rift Tier ${riftConfig.tier}`;
    this.roomName = `${this.zone.name} Rift — Tier ${riftConfig.tier}`;

    // More rooms than a normal floor — scales with tier
    const roomCount = 6 + riftConfig.tier;
    const result = generateBSPDungeon(this.currentFloor, roomCount);

    this.tiles = result.tiles;
    this.rooms = result.rooms;

    // Rifts always end with a boss room for the guardian — force the last room
    if (this.rooms.length > 0) {
      const lastRoom = this.rooms[this.rooms.length - 1];
      if (lastRoom.type !== 'boss') {
        lastRoom.type = 'boss';
        lastRoom.name = ROOM_TYPES.boss.name;
        lastRoom.hasChest = ROOM_TYPES.boss.hasChest;
        lastRoom.waveCount = ROOM_TYPES.boss.monsterWaves;
      }
    }
    this.monsters = [];
    this.groundItems = [];
    this.lootChests = [];
    this.exitLocked = true;
    this.waveActive = false;
    this.currentWave = 0;
    this.activeRoom = null;
    this._advancing = false;

    // No shop NPC or story NPCs in rifts
    this.shopNpc = null;
    this.storyNpcs = [];

    // Generate environmental traps in monster/treasure rooms (not start/boss)
    this.traps = [];
    for (const rd of this.rooms) {
      if (rd.type === 'start' || rd.type === 'boss') continue;
      const roomTraps = generateTrapsForRoom(rd.room, this.zone.id, TILE_SIZE);
      this.traps.push(...roomTraps);
    }

    console.log(`[World] Generated Rift Tier ${riftConfig.tier}: ${this.zone.name} with ${this.rooms.length} rooms`);
    return this.getFloorInfo();
  }

  applyRiftModifiers(monsters) {
    if (!this.riftActive || !this.riftConfig) return;

    const modifiers = this.riftConfig.modifiers || [];
    for (const mod of modifiers) {
      for (const m of monsters) {
        switch (mod.effect) {
          case 'monster_damage':
            m.damage = Math.floor(m.damage * mod.value);
            break;
          case 'monster_hp':
            m.maxHp = Math.floor(m.maxHp * mod.value);
            m.hp = m.maxHp;
            break;
          case 'monster_speed':
            m.speed = Math.floor((m.speed || 60) * mod.value);
            break;
          case 'monster_dr':
            m.armor = (m.armor || 0) + Math.floor(m.maxHp * mod.value);
            break;
          // 'env_fire', 'heal_reduce', 'monster_leech', 'elite_shield', 'spawn_mult',
          // 'extra_affix' — handled at game loop level, not here
        }
      }
    }

    // Apply tier multipliers on top of modifier scaling
    const hpMult = this.riftConfig.monsterHpMult || 1;
    const dmgMult = this.riftConfig.monsterDmgMult || 1;
    for (const m of monsters) {
      m.maxHp = Math.floor(m.maxHp * hpMult);
      m.hp = m.maxHp;
      m.damage = Math.floor(m.damage * dmgMult);
    }
  }

  updateRiftTimer(dt) {
    if (!this.riftActive) return true; // not in a rift — report "still ok"
    this.riftTimer -= dt / 1000; // dt is ms, timer is seconds
    return this.riftTimer > 0; // false = time's up
  }

  endRift() {
    if (!this.riftActive) return; // Guard against double-end
    this.riftActive = false;
    this.riftConfig = null;
    this.riftTimer = 0;
    this.riftTimeLimit = 0;
    this.riftStartTime = 0;
    // Caller must trigger generateFloor() to return to normal dungeon
  }

  getRiftTimeRemaining() {
    return Math.max(0, this.riftTimer);
  }

  getRiftElapsed() {
    return this.riftTimeLimit - this.getRiftTimeRemaining();
  }

  spawnRiftGuardian() {
    if (!this.riftConfig) return null;
    const bossRoom = this.rooms.find(r => r.type === 'boss');
    if (!bossRoom) return null;

    // Lazy require to avoid circular dependency (rifts.js requires world.js for ZONE_DEFS)
    const { createRiftGuardian } = require('./rifts');
    const { Monster } = require('./monsters');
    const guardian = createRiftGuardian(this.riftConfig.tier, this.riftConfig.zone);

    // Position in center of boss room (same formula as generateWaveMonsters)
    const r = bossRoom.room;
    const gx = (r.x + 1 + Math.floor((r.w - 2) / 2)) * TILE_SIZE + TILE_SIZE / 2;
    const gy = (r.y + 1 + Math.floor((r.h - 2) / 2)) * TILE_SIZE + TILE_SIZE / 2;

    guardian.x = gx;
    guardian.y = gy;
    guardian.spawnX = gx;
    guardian.spawnY = gy;

    // Add missing fields needed by Monster.prototype methods
    guardian.physicalResist = 0;
    guardian.goldMult = 1.5 + this.riftConfig.tier * 0.3;
    guardian.wanderTimer = 0;
    guardian.wanderDx = 0;
    guardian.wanderDy = 0;
    guardian.targetId = null;
    guardian.stealthed = false;
    guardian.charging = false;

    // Borrow Monster.prototype methods so the game loop can call them
    guardian.update = Monster.prototype.update;
    guardian.takeDamage = Monster.prototype.takeDamage;
    guardian.distanceTo = Monster.prototype.distanceTo;
    guardian.findClosestPlayer = Monster.prototype.findClosestPlayer;
    guardian.moveToward = Monster.prototype.moveToward;
    guardian.moveAwayFrom = Monster.prototype.moveAwayFrom;
    guardian.applyStun = Monster.prototype.applyStun;
    guardian.applySlow = Monster.prototype.applySlow;
    guardian.getSplitMonsters = function () { return []; };
    guardian.serialize = Monster.prototype.serialize;

    this.monsters.push(guardian);
    return guardian;
  }

  getFloorInfo() {
    return {
      name: this.roomName,
      floor: this.currentFloor,
      floorName: this.floorName,
      zoneId: this.zone ? this.zone.id : 'catacombs',
      zoneName: this.zone ? this.zone.name : 'The Catacombs',
      tileColor: this.zone ? this.zone.tileColor : 0x8a7a6a,
      wallColor: this.zone ? this.zone.wallColor : 0x5a4a3a,
      tiles: this.tiles,
      tileSize: TILE_SIZE,
      width: GRID_W,
      height: GRID_H,
      pixelWidth: GRID_W * TILE_SIZE,
      pixelHeight: GRID_H * TILE_SIZE,
      roomCount: this.rooms.length,
      exitLocked: this.exitLocked,
      difficulty: this.difficulty,
      riftActive: this.riftActive,
      riftTier: this.riftConfig ? this.riftConfig.tier : 0,
      riftModifiers: this.riftConfig ? this.riftConfig.modifiers : [],
      riftTimeLimit: this.riftTimeLimit,
    };
  }

  getSpawnPosition(playerIndex) {
    const startRoom = this.rooms.find(r => r.type === 'start');
    if (!startRoom) return { x: 200, y: 200 };
    // Use center of room interior (offset +1 from edges to avoid walls)
    const cx = (startRoom.room.x + 1 + Math.floor((startRoom.room.w - 2) / 2)) * TILE_SIZE + TILE_SIZE / 2;
    const cy = (startRoom.room.y + 1 + Math.floor((startRoom.room.h - 2) / 2)) * TILE_SIZE + TILE_SIZE / 2;
    return { x: cx + (playerIndex === 0 ? -20 : 20), y: cy };
  }

  getRoomAtPosition(x, y) {
    const gridX = Math.floor(x / TILE_SIZE);
    const gridY = Math.floor(y / TILE_SIZE);
    for (const rd of this.rooms) {
      const r = rd.room;
      if (gridX >= r.x && gridX < r.x + r.w && gridY >= r.y && gridY < r.y + r.h) {
        return rd;
      }
    }
    return null;
  }

  updateRoomDiscovery(players) {
    const events = [];
    for (const player of players) {
      if (!player.alive) continue;
      const room = this.getRoomAtPosition(player.x, player.y);
      if (!room) continue;

      if (!room.discovered) {
        room.discovered = true;
        events.push({ type: 'room:discovered', roomId: room.id, roomName: room.name, roomType: room.type, hasShrine: room.hasShrine });

        if (room.waveCount > 0 && room.wavesSpawned === 0) {
          this.spawnWave(room);
          events.push({ type: 'wave:start', roomId: room.id, wave: 1, totalWaves: room.waveCount });
        }
      }
    }
    return events;
  }

  spawnWave(roomData) {
    if (roomData.wavesSpawned >= roomData.waveCount) return;
    roomData.wavesSpawned++;

    const waveMonsters = generateWaveMonsters(roomData, roomData.wavesSpawned - 1, this.currentFloor, this.difficulty);
    if (this.riftActive) {
      this.applyRiftModifiers(waveMonsters);
    }
    for (const m of waveMonsters) this.monsters.push(m);
    roomData.monstersAlive += waveMonsters.length;

    this.activeRoom = roomData;
    this.waveActive = true;
    this.currentWave = roomData.wavesSpawned;

    console.log(`[World] Wave ${roomData.wavesSpawned}/${roomData.waveCount} in ${roomData.name}: ${waveMonsters.length} monsters`);
  }

  checkWaveCompletion() {
    if (!this.activeRoom || !this.waveActive) return null;

    const roomAlive = this.monsters.filter(m => m.alive && this.isMonsterInRoom(m, this.activeRoom)).length;
    if (roomAlive > 0) return null;

    this.activeRoom.wavesCleared++;

    if (this.activeRoom.wavesSpawned < this.activeRoom.waveCount) {
      this.spawnWave(this.activeRoom);
      return {
        type: 'wave:start',
        roomId: this.activeRoom.id,
        wave: this.activeRoom.wavesSpawned,
        totalWaves: this.activeRoom.waveCount,
      };
    }

    this.activeRoom.cleared = true;
    this.waveActive = false;
    const event = {
      type: 'room:cleared',
      roomId: this.activeRoom.id,
      roomName: this.activeRoom.name,
      roomType: this.activeRoom.type,
    };

    if (this.activeRoom.hasChest) {
      this.spawnChestLoot(this.activeRoom);
    }

    const allCleared = this.rooms.every(r => r.cleared || r.waveCount === 0);
    if (allCleared) {
      this.exitLocked = false;
      event.exitUnlocked = true;
    }

    this.activeRoom = null;
    return event;
  }

  isMonsterInRoom(monster, roomData) {
    const r = roomData.room;
    const mx = monster.spawnX / TILE_SIZE;
    const my = monster.spawnY / TILE_SIZE;
    return mx >= r.x - 1 && mx <= r.x + r.w + 1 && my >= r.y - 1 && my <= r.y + r.h + 1;
  }

  spawnChestLoot(roomData) {
    const r = roomData.room;
    const cx = (r.x + r.w / 2) * TILE_SIZE;
    const cy = (r.y + r.h / 2) * TILE_SIZE;

    const gMult = (DIFFICULTY_SCALES[this.difficulty] || DIFFICULTY_SCALES.normal).goldMult;
    const gold = generateConsumable('gold', Math.floor((20 + this.currentFloor * 15 + Math.floor(Math.random() * 30)) * gMult));
    if (gold) this.addGroundItem(gold, cx - 10, cy);

    const potion = generateConsumable('health_potion', 1 + Math.floor(Math.random() * 2));
    if (potion) this.addGroundItem(potion, cx + 10, cy);
  }

  isPlayerOnExit(player) {
    if (this.exitLocked) return false;
    const gx = Math.floor(player.x / TILE_SIZE);
    const gy = Math.floor(player.y / TILE_SIZE);
    if (gy >= 0 && gy < GRID_H && gx >= 0 && gx < GRID_W) {
      return this.tiles[gy][gx] === TILE.EXIT;
    }
    return false;
  }

  allRoomsCleared() {
    return this.rooms.filter(r => r.waveCount > 0).every(r => r.cleared);
  }

  allMonstersDead() {
    return this.monsters.every(m => !m.alive);
  }

  isFinalFloor() {
    return this.currentFloor >= FLOOR_NAMES.length - 1; // 0-indexed: 6 = floor 7 ("Throne of Ruin")
  }

  addGroundItem(item, x, y) {
    this.groundItems.push({ item, x, y, spawnTime: Date.now() });
  }

  pickupItem(itemId, playerX, playerY, pickupRange = 60) {
    for (let i = 0; i < this.groundItems.length; i++) {
      const gi = this.groundItems[i];
      if (gi.item.id === itemId) {
        const dx = gi.x - playerX;
        const dy = gi.y - playerY;
        const dist = Math.sqrt(dx * dx + dy * dy);
        if (dist <= pickupRange) {
          this.groundItems.splice(i, 1);
          return gi.item;
        }
        return null;
      }
    }
    return null;
  }

  spawnShopNpc(floor) {
    const startRoom = this.rooms.find(r => r.type === 'start');
    if (!startRoom) {
      this.shopNpc = null;
      return;
    }
    const r = startRoom.room;
    // Place shop NPC offset from center of start room so it doesn't overlap spawn
    const cx = (r.x + 1 + Math.floor((r.w - 2) / 2)) * TILE_SIZE + TILE_SIZE / 2;
    const cy = (r.y + 1 + Math.floor((r.h - 2) / 2)) * TILE_SIZE + TILE_SIZE / 2;
    this.shopNpc = {
      id: 'shop_npc',
      name: 'Merchant',
      x: cx + 50,
      y: cy - 30,
      inventory: generateShopInventory(floor),
    };
  }

  placeStoryNpcs(floor) {
    this.storyNpcs = [];

    // Old Sage in start room on floor 1
    if (floor === 0) {
      const startRoom = this.rooms.find(r => r.type === 'start');
      if (startRoom) {
        const r = startRoom.room;
        const cx = (r.x + 1 + Math.floor((r.w - 2) / 2)) * TILE_SIZE + TILE_SIZE / 2;
        const cy = (r.y + 1 + Math.floor((r.h - 2) / 2)) * TILE_SIZE + TILE_SIZE / 2;
        this.storyNpcs.push({
          id: 'old_sage',
          name: 'Old Sage',
          x: cx - 50,
          y: cy - 20,
        });
      }
    }

    // Shrine Guardian near first room with a shrine
    const shrineRoom = this.rooms.find(r => r.hasShrine);
    if (shrineRoom) {
      const r = shrineRoom.room;
      const sx = (r.x + r.w / 2) * TILE_SIZE + 30;
      const sy = (r.y + r.h / 2) * TILE_SIZE;
      this.storyNpcs.push({
        id: 'shrine_guardian',
        name: 'Shrine Guardian',
        x: sx,
        y: sy,
      });
    }

    // Floor Herald on floor 3+ (floorNum is 0-indexed, so >= 2)
    if (floor >= 2) {
      const candidateRooms = this.rooms.filter(r => r.type !== 'start' && r.type !== 'boss');
      if (candidateRooms.length > 0) {
        const room = candidateRooms[Math.floor(Math.random() * candidateRooms.length)];
        const r = room.room;
        const hx = (r.x + r.w / 2) * TILE_SIZE;
        const hy = (r.y + r.h / 2) * TILE_SIZE + 15;
        this.storyNpcs.push({
          id: 'floor_herald',
          name: 'Dying Adventurer',
          x: hx,
          y: hy,
        });
      }
    }
  }

  getShopNpc() {
    return this.shopNpc;
  }

  isWalkable(x, y) {
    if (!this.tiles) return true;
    const col = Math.floor(x / TILE_SIZE);
    const row = Math.floor(y / TILE_SIZE);
    if (row < 0 || row >= GRID_H) return false;
    if (col < 0 || col >= GRID_W) return false;
    const tile = this.tiles[row][col];
    return tile !== TILE.VOID && tile !== TILE.WALL;
  }

  getTrapsInRoom(roomData) {
    if (!roomData) return [];
    const r = roomData.room;
    return this.traps.filter(trap => {
      const tx = trap.x / TILE_SIZE;
      const ty = trap.y / TILE_SIZE;
      return tx >= r.x && tx < r.x + r.w && ty >= r.y && ty < r.y + r.h;
    });
  }

  serialize() {
    return {
      roomName: this.roomName,
      floorName: this.floorName,
      currentFloor: this.currentFloor,
      zoneId: this.zone ? this.zone.id : 'catacombs',
      zoneName: this.zone ? this.zone.name : 'The Catacombs',
      tileColor: this.zone ? this.zone.tileColor : 0x8a7a6a,
      wallColor: this.zone ? this.zone.wallColor : 0x5a4a3a,
      exitLocked: this.exitLocked,
      difficulty: this.difficulty,
      tiles: this.tiles,
      tileSize: TILE_SIZE,
      gridW: GRID_W,
      gridH: GRID_H,
      rooms: this.rooms.map(rd => ({
        id: rd.id,
        type: rd.type,
        name: rd.name,
        x: rd.room.x,
        y: rd.room.y,
        w: rd.room.w,
        h: rd.room.h,
        discovered: rd.discovered,
        cleared: rd.cleared,
        waveCount: rd.waveCount,
        wavesSpawned: rd.wavesSpawned,
        hasShrine: rd.hasShrine,
        shrineUsed: rd.shrineUsed,
      })),
      monsters: this.monsters.filter(m => m.alive).map(m => m.serialize()),
      groundItems: this.groundItems.map(gi => ({
        id: gi.item.id,
        name: gi.item.name,
        rarity: gi.item.rarity,
        rarityColor: gi.item.rarityColor,
        type: gi.item.type,
        x: Math.round(gi.x),
        y: Math.round(gi.y),
      })),
      lootChests: (this.lootChests || []).filter(c => !c.opened).map(c => ({
        id: c.id,
        x: Math.round(c.x),
        y: Math.round(c.y),
        gold: c.gold,
        itemCount: c.items.length,
      })),
      shopNpc: this.shopNpc ? {
        id: this.shopNpc.id,
        name: this.shopNpc.name,
        x: Math.round(this.shopNpc.x),
        y: Math.round(this.shopNpc.y),
      } : null,
      storyNpcs: (this.storyNpcs || []).map(npc => ({
        id: npc.id,
        name: npc.name,
        x: Math.round(npc.x),
        y: Math.round(npc.y),
      })),
      traps: (this.traps || []).map(t => t.serialize()),
    };
  }
}

module.exports = { World, TILE_SIZE, TILE, GRID_W, GRID_H, FLOOR_NAMES, ZONE_DEFS, DIFFICULTY_SCALES, getZoneForFloor };
