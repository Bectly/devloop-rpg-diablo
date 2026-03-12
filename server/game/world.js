const { createMonster } = require('./monsters');
const { generateConsumable } = require('./items');
const { generateBSPDungeon, generateMonsterSpawns } = require('./dungeon');

// Simple room layout for the dungeon
// 0 = floor, 1 = wall, 2 = door
const ROOM_TEMPLATES = [
  {
    name: 'Entry Hall',
    width: 40,
    height: 22,
    // Simple rectangular room
    generate() {
      const tiles = [];
      for (let y = 0; y < this.height; y++) {
        tiles[y] = [];
        for (let x = 0; x < this.width; x++) {
          if (y === 0 || y === this.height - 1 || x === 0 || x === this.width - 1) {
            tiles[y][x] = 1; // wall
          } else {
            tiles[y][x] = 0; // floor
          }
        }
      }
      // Doors
      tiles[0][Math.floor(this.width / 2)] = 2;
      tiles[this.height - 1][Math.floor(this.width / 2)] = 2;
      return tiles;
    },
    monsterSpots: [
      { type: 'skeleton', x: 300, y: 200 },
      { type: 'skeleton', x: 900, y: 200 },
      { type: 'skeleton', x: 600, y: 400 },
    ],
  },
  {
    name: 'Crypt Chamber',
    width: 40,
    height: 22,
    generate() {
      const tiles = [];
      for (let y = 0; y < this.height; y++) {
        tiles[y] = [];
        for (let x = 0; x < this.width; x++) {
          if (y === 0 || y === this.height - 1 || x === 0 || x === this.width - 1) {
            tiles[y][x] = 1;
          } else if ((x === 10 || x === 30) && y > 5 && y < 17) {
            tiles[y][x] = 1; // pillars
          } else {
            tiles[y][x] = 0;
          }
        }
      }
      tiles[0][20] = 2;
      tiles[this.height - 1][20] = 2;
      return tiles;
    },
    monsterSpots: [
      { type: 'zombie', x: 400, y: 250 },
      { type: 'zombie', x: 700, y: 350 },
      { type: 'skeleton', x: 200, y: 400 },
      { type: 'skeleton', x: 1000, y: 200 },
    ],
  },
  {
    name: 'Demon Pit',
    width: 40,
    height: 22,
    generate() {
      const tiles = [];
      for (let y = 0; y < this.height; y++) {
        tiles[y] = [];
        for (let x = 0; x < this.width; x++) {
          if (y === 0 || y === this.height - 1 || x === 0 || x === this.width - 1) {
            tiles[y][x] = 1;
          } else {
            tiles[y][x] = 0;
          }
        }
      }
      // Central pit walls
      for (let y = 8; y <= 14; y++) {
        for (let x = 16; x <= 24; x++) {
          if (y === 8 || y === 14 || x === 16 || x === 24) {
            tiles[y][x] = 1;
          }
        }
      }
      tiles[8][20] = 2; // door into pit
      tiles[0][20] = 2;
      return tiles;
    },
    monsterSpots: [
      { type: 'demon', x: 500, y: 200 },
      { type: 'demon', x: 800, y: 400 },
      { type: 'skeleton', x: 200, y: 300 },
      { type: 'zombie', x: 1000, y: 350 },
    ],
  },
  {
    name: 'Boss Arena',
    width: 40,
    height: 22,
    generate() {
      const tiles = [];
      for (let y = 0; y < this.height; y++) {
        tiles[y] = [];
        for (let x = 0; x < this.width; x++) {
          if (y === 0 || y === this.height - 1 || x === 0 || x === this.width - 1) {
            tiles[y][x] = 1;
          } else {
            tiles[y][x] = 0;
          }
        }
      }
      tiles[this.height - 1][20] = 2;
      return tiles;
    },
    monsterSpots: [
      { type: 'boss_knight', x: 640, y: 250 },
      { type: 'skeleton', x: 300, y: 400 },
      { type: 'skeleton', x: 980, y: 400 },
    ],
  },
];

const TILE_SIZE = 32;

class World {
  constructor() {
    this.currentRoom = 0;
    this.rooms = ROOM_TEMPLATES;
    this.tiles = null;
    this.monsters = [];
    this.groundItems = []; // items on the ground { item, x, y, id }
    this.roomName = '';
    this.dungeonFloor = 0;         // which procedural floor we're on
    this.dungeonData = null;       // { tiles, rooms, width, height, startRoom, exitRoom }
    this.useProcedural = false;    // toggle: false = legacy templates, true = BSP
  }

  /**
   * Load a legacy fixed room template (used for Phase 1 testing).
   */
  loadRoom(index) {
    if (index < 0 || index >= this.rooms.length) index = 0;
    this.currentRoom = index;
    this.useProcedural = false;

    const template = this.rooms[index];
    this.tiles = template.generate.call(template);
    this.roomName = template.name;

    // Spawn monsters
    this.monsters = [];
    for (const spot of template.monsterSpots) {
      this.monsters.push(createMonster(spot.type, spot.x, spot.y));
    }

    // Clear ground items
    this.groundItems = [];

    return {
      name: this.roomName,
      tiles: this.tiles,
      tileSize: TILE_SIZE,
      width: template.width,
      height: template.height,
      pixelWidth: template.width * TILE_SIZE,
      pixelHeight: template.height * TILE_SIZE,
    };
  }

  /**
   * Generate and load a fresh BSP dungeon floor.
   * @param {number} floor  — floor number (affects difficulty + dungeon size)
   * @param {number} seed   — optional seed for reproducibility
   */
  loadDungeon(floor = 0, seed) {
    this.dungeonFloor = floor;
    this.useProcedural = true;

    // Dungeons grow slightly on deeper floors.
    const width  = Math.min(120, 80 + floor * 5);
    const height = Math.min(80,  50 + floor * 3);

    this.dungeonData = generateBSPDungeon({ width, height, seed });
    this.tiles = this.dungeonData.tiles;
    this.roomName = `Floor ${floor + 1}`;

    // Monster spawns scale with floor.
    const spawns = generateMonsterSpawns(
      this.dungeonData.rooms,
      TILE_SIZE,
      floor + 1,
    );

    this.monsters = [];
    for (const spot of spawns) {
      this.monsters.push(createMonster(spot.type, spot.x, spot.y));
    }

    this.groundItems = [];

    return {
      name: this.roomName,
      tiles: this.tiles,
      tileSize: TILE_SIZE,
      width:      this.dungeonData.width,
      height:     this.dungeonData.height,
      pixelWidth:  this.dungeonData.width  * TILE_SIZE,
      pixelHeight: this.dungeonData.height * TILE_SIZE,
      startRoom: this.dungeonData.startRoom,
      exitRoom:  this.dungeonData.exitRoom,
      roomCount: this.dungeonData.rooms.length,
    };
  }

  /**
   * Advance to next floor (procedural).
   */
  nextFloor() {
    return this.loadDungeon(this.dungeonFloor + 1);
  }

  addGroundItem(item, x, y) {
    this.groundItems.push({
      item,
      x,
      y,
      spawnTime: Date.now(),
    });
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
        return null; // too far
      }
    }
    return null; // not found
  }

  // Check if position is walkable
  isWalkable(x, y) {
    if (!this.tiles) return true;
    const col = Math.floor(x / TILE_SIZE);
    const row = Math.floor(y / TILE_SIZE);
    if (row < 0 || row >= this.tiles.length) return false;
    if (col < 0 || col >= this.tiles[0].length) return false;
    return this.tiles[row][col] !== 1;
  }

  // Check if all monsters are dead
  allMonstersDead() {
    return this.monsters.every(m => !m.alive);
  }

  // Get room info for advancing
  getNextRoom() {
    if (this.currentRoom + 1 < this.rooms.length) {
      return this.currentRoom + 1;
    }
    return 0; // loop back
  }

  serialize() {
    const base = {
      roomName: this.roomName,
      tiles: this.tiles,
      tileSize: TILE_SIZE,
      monsters: this.monsters.map(m => m.serialize()),
      groundItems: this.groundItems.map(gi => ({
        id: gi.item.id,
        name: gi.item.name,
        rarity: gi.item.rarity,
        rarityColor: gi.item.rarityColor,
        type: gi.item.type,
        x: Math.round(gi.x),
        y: Math.round(gi.y),
      })),
    };

    if (this.useProcedural) {
      base.procedural = true;
      base.dungeonFloor = this.dungeonFloor;
      base.roomCount = this.dungeonData ? this.dungeonData.rooms.length : 0;
      base.exitRoom  = this.dungeonData ? this.dungeonData.exitRoom  : null;
      base.startRoom = this.dungeonData ? this.dungeonData.startRoom : null;
      base.width  = this.dungeonData ? this.dungeonData.width  : 0;
      base.height = this.dungeonData ? this.dungeonData.height : 0;
    } else {
      base.currentRoom = this.currentRoom;
      base.totalRooms  = this.rooms.length;
    }

    return base;
  }
}

module.exports = { World, TILE_SIZE };
