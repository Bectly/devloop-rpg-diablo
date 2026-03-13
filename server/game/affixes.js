const { MONSTER_DEFS } = require('./monsters');

// ─── Affix Definitions ──────────────────────────────────────────
const AFFIX_DEFS = {
  fast: {
    name: 'Fast',
    description: 'Moves 50% faster',
    color: 0xffff00, // yellow
    apply: (monster) => {
      monster.speed *= 1.5;
    },
  },

  extra_strong: {
    name: 'Extra Strong',
    description: 'Deals 60% more damage',
    color: 0xff4444, // red
    apply: (monster) => {
      monster.damage = Math.floor(monster.damage * 1.6);
    },
  },

  fire_enchanted: {
    name: 'Fire Enchanted',
    description: 'Burns on hit, explodes on death',
    color: 0xff8800, // orange
    apply: (monster) => {
      monster.fireEnchanted = true;
    },
    onHitPlayer: (monster, player) => {
      // Apply fire DoT: 5 damage per tick for 3 seconds (at 20 ticks/s = 60 ticks)
      if (typeof player.addDebuff === 'function') {
        player.addDebuff({ effect: 'fire_dot', damage: 5, ticksRemaining: 60, source: monster.id });
      }
    },
    onDeath: (monster) => {
      // Return explosion data: { x, y, radius, damage }
      return {
        type: 'fire_explosion',
        x: monster.x,
        y: monster.y,
        radius: 80,
        damage: Math.floor(monster.damage * 0.5),
      };
    },
  },

  cold_enchanted: {
    name: 'Cold Enchanted',
    description: 'Slows player 30% for 3s on hit',
    color: 0x4488ff, // blue
    apply: (monster) => {
      monster.coldEnchanted = true;
    },
    onHitPlayer: (monster, player) => {
      if (typeof player.addDebuff === 'function') {
        player.addDebuff({ effect: 'slow', speedMult: 0.7, ticksRemaining: 60, source: monster.id });
      }
    },
  },

  teleporter: {
    name: 'Teleporter',
    description: 'Blinks to random position every 5s',
    color: 0xaa44ff, // purple
    apply: (monster) => {
      monster.teleporter = true;
      monster.teleportCooldown = 0;
      monster.teleportInterval = 100; // 5s at 20 ticks/s
    },
    onUpdate: (monster, worldBounds) => {
      monster.teleportCooldown = (monster.teleportCooldown || 0) + 1;
      if (monster.teleportCooldown >= (monster.teleportInterval || 100)) {
        monster.teleportCooldown = 0;
        // Teleport within 120px of current position
        const angle = Math.random() * Math.PI * 2;
        const dist = 60 + Math.random() * 60;
        return {
          type: 'teleport',
          newX: monster.x + Math.cos(angle) * dist,
          newY: monster.y + Math.sin(angle) * dist,
        };
      }
      return null;
    },
  },

  vampiric: {
    name: 'Vampiric',
    description: 'Heals 15% of damage dealt',
    color: 0x44cc44, // green
    apply: (monster) => {
      monster.vampiric = true;
    },
    onDealDamage: (monster, damage) => {
      const heal = Math.floor(damage * 0.15);
      monster.hp = Math.min(monster.maxHp, monster.hp + heal);
      return heal;
    },
  },

  shielding: {
    name: 'Shielding',
    description: 'Immune for 3s every 10s',
    color: 0xffffff, // white
    apply: (monster) => {
      monster.shielding = true;
      monster.shieldTimer = 0;
      monster.shieldActive = false;
      monster.shieldCycleTicks = 200; // 10s
      monster.shieldDurationTicks = 60; // 3s
    },
    onUpdate: (monster) => {
      monster.shieldTimer = (monster.shieldTimer || 0) + 1;
      if (!monster.shieldActive && monster.shieldTimer >= (monster.shieldCycleTicks || 200)) {
        monster.shieldActive = true;
        monster.shieldTimer = 0;
        return { type: 'shield_on' };
      }
      if (monster.shieldActive && monster.shieldTimer >= (monster.shieldDurationTicks || 60)) {
        monster.shieldActive = false;
        monster.shieldTimer = 0;
        return { type: 'shield_off' };
      }
      return null;
    },
    modifyIncomingDamage: (monster, damage) => {
      if (monster.shieldActive) return 0;
      return damage;
    },
  },

  extra_health: {
    name: 'Extra Health',
    description: 'Double HP, larger size',
    color: 0xdddddd, // light gray
    apply: (monster) => {
      monster.hp *= 2;
      monster.maxHp *= 2;
      monster.size = Math.floor(monster.size * 1.3);
    },
  },
};

// ─── Elite Spawn Rules ───────────────────────────────────────────

/**
 * Roll whether a monster becomes elite and which affixes it gets.
 * @param {number} floor - Current dungeon floor (0-indexed)
 * @param {string} monsterType - Key from MONSTER_DEFS
 * @returns {null|{affixes: string[], rank: string}} null if not elite, or affix result
 */
function rollAffixes(floor, monsterType, eliteBonus = 0) {
  // Boss never gets affixes
  if (MONSTER_DEFS[monsterType]?.isBoss) return null;
  // Small slimes (split products) don't get affixes
  if (monsterType === 'slime_small') return null;

  let eliteChance = 0;
  let maxAffixes = 0;
  let rank = null;

  if (floor <= 2) {
    if (eliteBonus <= 0) return null; // no elites on early floors in Normal
    eliteChance = eliteBonus; // only the difficulty bonus on early floors
    maxAffixes = 1;
    rank = 'champion';
  } else if (floor <= 4) {
    eliteChance = 0.15 + eliteBonus;
    maxAffixes = 1;
    rank = 'champion';
  } else if (floor <= 6) {
    eliteChance = 0.25 + eliteBonus;
    maxAffixes = 2;
    rank = 'champion';
  } else {
    eliteChance = 0.30 + eliteBonus;
    maxAffixes = 3;
    rank = 'rare';
  }

  // Cap elite chance at 60%
  eliteChance = Math.min(0.60, eliteChance);

  if (Math.random() >= eliteChance) return null;

  // Pick random non-duplicate affixes
  const affixKeys = Object.keys(AFFIX_DEFS);
  const count = 1 + Math.floor(Math.random() * maxAffixes);
  const picked = [];
  const available = [...affixKeys];

  for (let i = 0; i < Math.min(count, available.length); i++) {
    const idx = Math.floor(Math.random() * available.length);
    picked.push(available[idx]);
    available.splice(idx, 1);
  }

  return { affixes: picked, rank };
}

// ─── Apply Affixes ───────────────────────────────────────────────

/**
 * Apply rolled affixes to a monster, upgrading it to elite status.
 * @param {object} monster - Monster instance
 * @param {object|null} affixResult - Result from rollAffixes()
 */
function applyAffixes(monster, affixResult) {
  if (!affixResult) return;

  monster.affixes = affixResult.affixes;
  monster.isElite = true;
  monster.eliteRank = affixResult.rank; // 'champion' or 'rare'

  // XP/loot bonus
  if (affixResult.rank === 'champion') {
    monster.xpReward = Math.floor(monster.xpReward * 1.5);
    monster.lootTier = Math.min(monster.lootTier + 1, 4);
    monster.goldBonus = 1;
  } else if (affixResult.rank === 'rare') {
    monster.xpReward = Math.floor(monster.xpReward * 2.5);
    monster.lootTier = Math.min(monster.lootTier + 2, 4);
    monster.goldBonus = 2;
  }

  // Apply each affix
  for (const key of affixResult.affixes) {
    const def = AFFIX_DEFS[key];
    if (def && def.apply) def.apply(monster);
  }
}

// ─── Affix Hook Processors ──────────────────────────────────────

/**
 * Called each game tick for each alive elite monster.
 * Returns an array of events (teleport, shield_on/off, etc.).
 */
function processAffixUpdates(monster, worldBounds) {
  if (!monster.affixes) return [];
  const events = [];
  for (const key of monster.affixes) {
    const def = AFFIX_DEFS[key];
    if (def && def.onUpdate) {
      const evt = def.onUpdate(monster, worldBounds);
      if (evt) events.push(evt);
    }
  }
  return events;
}

/**
 * Called when an elite monster hits a player.
 * Applies debuffs (fire DoT, cold slow, etc.).
 */
function processAffixOnHitPlayer(monster, player) {
  if (!monster.affixes) return;
  for (const key of monster.affixes) {
    const def = AFFIX_DEFS[key];
    if (def && def.onHitPlayer) def.onHitPlayer(monster, player);
  }
}

/**
 * Called when an elite monster deals damage (for vampiric healing).
 * Returns total HP healed.
 */
function processAffixOnDealDamage(monster, damage) {
  if (!monster.affixes) return 0;
  let totalHeal = 0;
  for (const key of monster.affixes) {
    const def = AFFIX_DEFS[key];
    if (def && def.onDealDamage) totalHeal += def.onDealDamage(monster, damage);
  }
  return totalHeal;
}

/**
 * Called when an elite monster dies.
 * Returns an array of death events (fire_explosion, etc.).
 */
function processAffixOnDeath(monster) {
  if (!monster.affixes) return [];
  const events = [];
  for (const key of monster.affixes) {
    const def = AFFIX_DEFS[key];
    if (def && def.onDeath) {
      const evt = def.onDeath(monster);
      if (evt) events.push(evt);
    }
  }
  return events;
}

/**
 * Modify incoming damage through affix effects (shielding).
 * Returns the modified damage value.
 */
function modifyDamageByAffixes(monster, damage) {
  if (!monster.affixes) return damage;
  let modified = damage;
  for (const key of monster.affixes) {
    const def = AFFIX_DEFS[key];
    if (def && def.modifyIncomingDamage) modified = def.modifyIncomingDamage(monster, modified);
  }
  return modified;
}

module.exports = {
  AFFIX_DEFS,
  rollAffixes,
  applyAffixes,
  processAffixUpdates,
  processAffixOnHitPlayer,
  processAffixOnDealDamage,
  processAffixOnDeath,
  modifyDamageByAffixes,
};
