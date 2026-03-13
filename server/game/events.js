// ─── Cursed Events — random room challenges with bonus rewards ───────────────
const { v4: uuidv4 } = require('uuid');

const EVENT_TYPES = {
  cursed_chest: {
    name: 'Cursed Chest',
    duration: 600,    // 30s at 20 ticks/sec
    waves: 3,
    waveMonsters: [4, 6, 2], // wave 1: 4 normal, wave 2: 6 normal, wave 3: 2 elites
    rewardRarity: 'epic',
  },
  cursed_shrine: {
    name: 'Cursed Shrine',
    duration: 400,    // 20s at 20 ticks/sec
    waves: 1,
    waveMonsters: [3], // 3 elites with 2 affixes each
    rewardType: 'stat_buff', // +2 random stat for rest of floor
    buffAmount: 2,
  },
};

class CursedEvent {
  constructor(type, room) {
    const def = EVENT_TYPES[type];
    this.id = uuidv4();
    this.type = type;
    this.name = def.name;
    this.room = room;
    this.active = false;      // becomes true when player interacts
    this.timer = def.duration;
    this.totalDuration = def.duration;
    this.currentWave = 0;
    this.totalWaves = def.waves;
    this.waveMonsters = def.waveMonsters;
    this.monstersRemaining = 0;
    this.wavesSpawned = 0;
    this.completed = false;
    this.failed = false;
    this.rewardRarity = def.rewardRarity || null;
    this.rewardType = def.rewardType || 'item';
    this.buffAmount = def.buffAmount || 0;
    // Position (center of room)
    this.x = 0;
    this.y = 0;
  }

  start() {
    this.active = true;
    this.currentWave = 0;
    this.needsSpawn = true; // signal game loop to spawn first wave
  }

  tick() {
    if (!this.active || this.completed || this.failed) return;
    this.timer--;
    if (this.timer <= 0) {
      this.failed = true;
    }
  }

  waveCleared() {
    this.currentWave++;
    if (this.currentWave >= this.totalWaves) {
      this.completed = true;
    } else {
      this.needsSpawn = true; // signal game loop to spawn next wave
    }
  }

  getMonstersForWave() {
    if (this.currentWave >= this.totalWaves) return 0;
    return this.waveMonsters[this.currentWave];
  }

  isEliteWave() {
    // Cursed shrine: all waves are elite
    if (this.type === 'cursed_shrine') return true;
    // Cursed chest: last wave is elite
    return this.currentWave === this.totalWaves - 1;
  }

  serialize() {
    return {
      id: this.id,
      type: this.type,
      name: this.name,
      active: this.active,
      timer: this.timer,
      totalDuration: this.totalDuration,
      currentWave: this.currentWave,
      totalWaves: this.totalWaves,
      monstersRemaining: this.monstersRemaining,
      completed: this.completed,
      failed: this.failed,
      x: this.x,
      y: this.y,
    };
  }
}

// Roll whether a cursed event should spawn in a room
// 15% chance for non-boss, non-start rooms
function rollCursedEvent(room) {
  if (!room) return null;
  if (room.type === 'boss' || room.type === 'start') return null;
  if (Math.random() >= 0.15) return null;

  // 50/50 chest vs shrine
  const type = Math.random() < 0.5 ? 'cursed_chest' : 'cursed_shrine';
  return new CursedEvent(type, room);
}

module.exports = { CursedEvent, EVENT_TYPES, rollCursedEvent };
