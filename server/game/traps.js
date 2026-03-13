/**
 * Environmental Traps — floor hazards that damage/debuff players on contact.
 * Placed during dungeon generation, zone-specific.
 */
const { v4: uuidv4 } = require('uuid');

const TRAP_DEFS = {
  spike: {
    name: 'Spike Trap',
    damage: 15,
    damageType: 'physical',
    effect: 'stun',
    effectDuration: 500,   // 0.5s stun
    cooldown: 5000,        // 5s before can re-trigger per player
    radius: 20,
  },
  fire: {
    name: 'Fire Grate',
    damage: 20,
    damageType: 'fire',
    effect: 'burning',
    effectDuration: 3000,  // 3s burning DoT
    cooldown: 5000,
    radius: 20,
  },
  poison: {
    name: 'Poison Pool',
    damage: 10,
    damageType: 'poison',
    effect: 'poison',
    effectDuration: 5000,  // 5s poison DoT
    cooldown: 5000,
    radius: 20,
  },
  void: {
    name: 'Void Rift',
    damage: 25,
    damageType: 'cold',
    effect: 'slow',
    effectDuration: 3000,  // 3s 50% slow
    cooldown: 5000,
    radius: 20,
  },
};

// Which trap types can appear in each zone
const ZONE_TRAP_POOLS = {
  catacombs: ['spike', 'poison'],
  inferno: ['fire', 'spike'],
  abyss: ['void', 'poison'],
};

class Trap {
  constructor(type, x, y) {
    this.id = uuidv4();
    this.type = type;
    this.def = TRAP_DEFS[type];
    this.x = x;
    this.y = y;
    // Per-player cooldown tracking: playerId -> lastTriggerTime
    this.triggered = new Map();
  }

  canTrigger(player) {
    const dx = player.x - this.x;
    const dy = player.y - this.y;
    const dist = Math.sqrt(dx * dx + dy * dy);
    if (dist > this.def.radius) return false;

    const lastTrigger = this.triggered.get(player.id);
    if (lastTrigger && (Date.now() - lastTrigger) < this.def.cooldown) return false;

    return true;
  }

  trigger(player) {
    this.triggered.set(player.id, Date.now());

    // Apply damage using player.takeDamage which handles resistances
    const dmg = player.takeDamage(this.def.damage, this.def.damageType, this.def.name || 'Trap');

    // Apply effect/debuff
    if (this.def.effect && player.alive) {
      player.applyDebuff(this.def.effect, this.def.effectDuration);
    }

    return {
      trapId: this.id,
      trapType: this.type,
      trapName: this.def.name,
      playerId: player.id,
      playerName: player.name,
      damage: dmg === -1 ? 0 : dmg,  // -1 means dodged
      dodged: dmg === -1,
      effect: this.def.effect,
      effectDuration: this.def.effectDuration,
      x: this.x,
      y: this.y,
    };
  }

  serialize() {
    return {
      id: this.id,
      type: this.type,
      name: this.def.name,
      x: Math.round(this.x),
      y: Math.round(this.y),
      radius: this.def.radius,
    };
  }
}

/**
 * Generate traps for a room during dungeon generation.
 * @param {object} room - Room rect {x, y, w, h}
 * @param {string} zoneId - Zone identifier ('catacombs', 'inferno', 'abyss')
 * @param {number} tileSize - Tile size in pixels (32)
 * @returns {Trap[]}
 */
function generateTrapsForRoom(room, zoneId, tileSize) {
  const pool = ZONE_TRAP_POOLS[zoneId] || ['spike', 'poison'];
  // 2-4 traps per room
  const count = 2 + Math.floor(Math.random() * 3);
  const traps = [];

  for (let i = 0; i < count; i++) {
    const type = pool[Math.floor(Math.random() * pool.length)];
    // Place within the room interior (avoiding edges)
    const tx = (room.x + 1 + Math.random() * (room.w - 2)) * tileSize;
    const ty = (room.y + 1 + Math.random() * (room.h - 2)) * tileSize;
    traps.push(new Trap(type, tx, ty));
  }

  return traps;
}

module.exports = { Trap, TRAP_DEFS, ZONE_TRAP_POOLS, generateTrapsForRoom };
