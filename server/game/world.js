const { v4: uuidv4 } = require('uuid');
const { createMonster } = require('./monsters');
const { generateConsumable } = require('./items');
const { generateShopInventory } = require('./shop');

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
  'Bone Gallery',
  'Burning Depths',
  'Shadow Halls',
  'Abyssal Core',
  'Throne of Ruin',
];

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
  const roomData = [];
  for (let i = 0; i < rooms.length; i++) {
    let type;
    if (i === 0) type = 'start';
    else if (i === rooms.length - 1) type = 'boss';
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

// ─── Monster wave generator ─────────────────────────────────────
function generateWaveMonsters(roomData, waveIndex, floor) {
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

  for (let i = 0; i < count; i++) {
    const type = roomData.type === 'boss' && waveIndex === 0 && i === 0
      ? 'boss_knight'
      : monsterPool[Math.floor(Math.random() * monsterPool.length)];

    const mx = (room.x + 1 + Math.random() * (room.w - 2)) * TILE_SIZE;
    const my = (room.y + 1 + Math.random() * (room.h - 2)) * TILE_SIZE;
    monsters.push(createMonster(type, mx, my, floor));
  }

  if (roomData.type === 'boss' && floor > 1) {
    const addCount = Math.min(3, floor - 1);
    for (let i = 0; i < addCount; i++) {
      const type = monsterPool[Math.floor(Math.random() * monsterPool.length)];
      const mx = (room.x + 1 + Math.random() * (room.w - 2)) * TILE_SIZE;
      const my = (room.y + 1 + Math.random() * (room.h - 2)) * TILE_SIZE;
      monsters.push(createMonster(type, mx, my, floor));
    }
  }

  return monsters;
}

function getMonsterPoolForFloor(floor) {
  if (floor <= 1) return ['skeleton', 'skeleton', 'slime'];
  if (floor <= 2) return ['skeleton', 'zombie', 'slime', 'archer'];
  if (floor <= 3) return ['zombie', 'demon', 'archer', 'slime'];
  if (floor <= 4) return ['demon', 'archer', 'zombie', 'skeleton'];
  return ['demon', 'demon', 'archer', 'zombie'];
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
  }

  generateFloor(floorNum) {
    this.currentFloor = floorNum;
    this.floorName = FLOOR_NAMES[floorNum % FLOOR_NAMES.length];
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

    console.log(`[World] Generated floor ${floorNum + 1}: ${this.floorName} with ${this.rooms.length} rooms`);
    return this.getFloorInfo();
  }

  getFloorInfo() {
    return {
      name: this.roomName,
      floor: this.currentFloor,
      floorName: this.floorName,
      tiles: this.tiles,
      tileSize: TILE_SIZE,
      width: GRID_W,
      height: GRID_H,
      pixelWidth: GRID_W * TILE_SIZE,
      pixelHeight: GRID_H * TILE_SIZE,
      roomCount: this.rooms.length,
      exitLocked: this.exitLocked,
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

    const waveMonsters = generateWaveMonsters(roomData, roomData.wavesSpawned - 1, this.currentFloor);
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

    const gold = generateConsumable('gold', 20 + this.currentFloor * 15 + Math.floor(Math.random() * 30));
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

  serialize() {
    return {
      roomName: this.roomName,
      floorName: this.floorName,
      currentFloor: this.currentFloor,
      exitLocked: this.exitLocked,
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
    };
  }
}

module.exports = { World, TILE_SIZE, TILE, GRID_W, GRID_H };
