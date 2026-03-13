const { v4: uuidv4 } = require('uuid');
const { ZONE_DEFS } = require('./world');
const { rollAffixes, applyAffixes } = require('./affixes');

// ─── Rift Modifiers ───────────────────────────────────────────────
const RIFT_MODIFIERS = {
  deadly:    { name: 'Deadly',    desc: 'Monsters deal +50% damage',           effect: 'monster_damage', value: 1.5  },
  fortified: { name: 'Fortified', desc: 'Monsters have +40% health',           effect: 'monster_hp',     value: 1.4  },
  hasty:     { name: 'Hasty',     desc: 'Monsters move +30% faster',           effect: 'monster_speed',  value: 1.3  },
  shielded:  { name: 'Shielded',  desc: 'All elites gain Shielding',           effect: 'elite_shield',   value: true },
  burning:   { name: 'Burning',   desc: 'Periodic fire damage (5% HP/5s)',     effect: 'env_fire',       value: 0.05 },
  vampiric:  { name: 'Vampiric',  desc: 'Monsters heal 10% on hit',            effect: 'monster_leech',  value: 0.10 },
  cursed:    { name: 'Cursed',    desc: 'Player healing reduced 50%',          effect: 'heal_reduce',    value: 0.5  },
  chaotic:   { name: 'Chaotic',   desc: 'Double monster spawn count',          effect: 'spawn_mult',     value: 2    },
  armored:   { name: 'Armored',   desc: 'Monsters +30% damage reduction',     effect: 'monster_dr',     value: 0.3  },
  empowered: { name: 'Empowered', desc: 'Monsters have +1 extra affix',        effect: 'extra_affix',    value: 1    },
};

// ─── Rift Tier Definitions ────────────────────────────────────────
const RIFT_TIERS = {};
for (let t = 1; t <= 10; t++) {
  RIFT_TIERS[t] = {
    tier: t,
    modifierCount:  1 + Math.floor(t / 3),      // 1,1,2,2,2,3,3,3,4,4
    timeLimit:      180 - (t - 1) * 5,           // 180s down to 135s
    monsterHpMult:  1.0 + (t - 1) * 0.3,         // 1.0x to 3.7x
    monsterDmgMult: 1.0 + (t - 1) * 0.2,         // 1.0x to 2.8x
    xpReward:       t * 500,
    goldReward:     t * 200,
    keystoneReward: t >= 5 ? 1 : 0,              // self-sustaining at tier 5+
  };
}

// ─── Internal helpers ─────────────────────────────────────────────

/**
 * Pick N unique keys from an array, no duplicates.
 */
function _pickRandom(arr, count) {
  const pool = [...arr];
  const result = [];
  for (let i = 0; i < Math.min(count, pool.length); i++) {
    const idx = Math.floor(Math.random() * pool.length);
    result.push(pool[idx]);
    pool.splice(idx, 1);
  }
  return result;
}

// ─── getRiftModifiers ─────────────────────────────────────────────
/**
 * Pick N random modifiers for the given tier (no duplicates).
 * @param {number} tier  1-10
 * @returns {object[]}   Array of modifier objects from RIFT_MODIFIERS
 */
function getRiftModifiers(tier) {
  const tierDef = RIFT_TIERS[tier] || RIFT_TIERS[1];
  const keys = _pickRandom(Object.keys(RIFT_MODIFIERS), tierDef.modifierCount);
  return keys.map(k => ({ key: k, ...RIFT_MODIFIERS[k] }));
}

// ─── createRift ───────────────────────────────────────────────────
/**
 * Build a complete rift config object.
 * @param {number} tier         1-10
 * @param {number} playerLevel  Player's current level (for scaling context)
 * @returns {object}            Rift config
 */
function createRift(tier, playerLevel) {
  // Validate tier
  tier = Math.max(1, Math.min(10, Math.floor(tier) || 1));

  const tierDef = RIFT_TIERS[tier];

  // Pick random zone from ZONE_DEFS
  const zoneKeys = Object.keys(ZONE_DEFS);
  const zoneKey = zoneKeys[Math.floor(Math.random() * zoneKeys.length)];
  const zone = ZONE_DEFS[zoneKey];

  // Pick modifiers
  const modifiers = getRiftModifiers(tier);

  return {
    id:             uuidv4(),
    tier,
    zone:           { id: zone.id, name: zone.name, tileColor: zone.tileColor, wallColor: zone.wallColor },
    modifiers,
    timeLimit:      tierDef.timeLimit,
    monsterHpMult:  tierDef.monsterHpMult,
    monsterDmgMult: tierDef.monsterDmgMult,
    xpReward:       tierDef.xpReward,
    goldReward:     tierDef.goldReward,
    keystoneReward: tierDef.keystoneReward,
    playerLevel:    playerLevel || 1,
    startedAt:      null,  // set when rift begins
    state:          'ready', // 'ready' | 'active' | 'complete' | 'failed'
  };
}

// ─── createRiftGuardian ───────────────────────────────────────────

// Themed guardian names by zone
const GUARDIAN_NAMES = {
  catacombs: 'Bone Colossus',
  inferno:   'Infernal Warden',
  abyss:     'Void Harbinger',
};

/**
 * Create a boss-level Rift Guardian monster object.
 * Compatible with the Monster serialise format used by world/combat.
 * @param {number} tier  1-10
 * @param {object} zone  Zone object (from ZONE_DEFS or rift.zone)
 * @returns {object}     Monster-compatible plain object
 */
function createRiftGuardian(tier, zone) {
  const zoneId = (zone && zone.id) ? zone.id : 'catacombs';
  const name = GUARDIAN_NAMES[zoneId] || 'Rift Guardian';

  // Base stats — scale with tier
  const baseBossHp  = 1000;
  const baseBossDmg = 40;
  const hp          = Math.floor(baseBossHp  * tier * 2);
  const damage      = Math.floor(baseBossDmg * tier * 1.5);
  const armor       = 10 + tier * 2;
  const affixCount  = 2 + Math.floor(tier / 3);

  // Use a synthetic floor value so rollAffixes gives appropriate affixes.
  // floor 6 = max tier for affix rolls (3 affixes, rare rank)
  const syntheticFloor = Math.min(6, 2 + Math.floor(tier / 2));

  // Build the guardian as a plain object (not a Monster class instance)
  // to avoid circular dependency on monsters.js constructor path.
  const guardian = {
    id:           uuidv4(),
    type:         'rift_guardian',
    name,
    x:            0,
    y:            0,
    spawnX:       0,
    spawnY:       0,
    facing:       'down',
    maxHp:        hp,
    hp,
    damage,
    armor,
    speed:        80,
    attackRange:  55,
    attackSpeed:  1600,
    aggroRadius:  300,
    leashDistance: 800,
    xpReward:     tier * 300,
    lootTier:     Math.min(6, 3 + Math.floor(tier / 3)),
    behavior:     'boss',
    damageType:   'physical',
    color:        0x8800cc,
    size:         24 + tier,
    isBoss:       true,
    isRiftGuardian: true,
    riftTier:     tier,
    alive:        true,
    aiState:      'idle',
    attackCooldown: 0,
    stunned:      0,
    slowed:       0,
    poisonTick:   0,
    poisonDamage: 0,
    phases: [
      { hpPercent: 100, mode: 'melee',     damageType: 'physical' },
      { hpPercent: 60,  mode: 'charge',    damageType: 'physical' },
      { hpPercent: 30,  mode: 'aoe_frenzy',damageType: 'physical' },
    ],
    currentPhase: 0,
    affixes:      null,
    isElite:      false,
    eliteRank:    null,
    shieldActive: false,
    fireEnchanted: false,
    coldEnchanted: false,
    floor:        syntheticFloor,
  };

  // Force-roll affixes: always give affixCount affixes at 'rare' rank
  const affixKeys = Object.keys(require('./affixes').AFFIX_DEFS);
  const picked = _pickRandom(affixKeys, affixCount);
  applyAffixes(guardian, { affixes: picked, rank: 'rare' });

  return guardian;
}

// ─── getRiftRewards ───────────────────────────────────────────────
/**
 * Calculate rift completion rewards, with time-bonus.
 * @param {number} tier
 * @param {number} timeRemaining  Seconds remaining when rift was cleared
 * @param {number} timeLimit      Total time limit for this rift
 * @returns {{ xp: number, gold: number, keystones: number, bonusItems: number, timeBonus: boolean }}
 */
function getRiftRewards(tier, timeRemaining, timeLimit) {
  const tierDef = RIFT_TIERS[tier] || RIFT_TIERS[1];
  const timeRatio = timeLimit > 0 ? timeRemaining / timeLimit : 0;

  const timeBonus = timeRatio > 0.5; // cleared in <50% of the time limit
  const bonusMult = timeBonus ? 1.5 : 1.0;

  return {
    xp:         Math.floor(tierDef.xpReward  * bonusMult),
    gold:       Math.floor(tierDef.goldReward * bonusMult),
    keystones:  tierDef.keystoneReward,
    bonusItems: timeBonus ? Math.ceil(tier / 3) : 0, // 1 bonus item per 3 tiers on speed clear
    timeBonus,
  };
}

// ─── Exports ─────────────────────────────────────────────────────
module.exports = {
  RIFT_MODIFIERS,
  RIFT_TIERS,
  createRift,
  getRiftModifiers,
  createRiftGuardian,
  getRiftRewards,
};
