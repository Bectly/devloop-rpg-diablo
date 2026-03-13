const { v4: uuidv4 } = require('uuid');
const { RARITIES, WEAPONS, ARMORS, ACCESSORIES, BONUS_POOL, RESIST_BONUS_POOL } = require('./items');

// ── Set definitions ──────────────────────────────────────────────

const ITEM_SETS = {
  ironwall: {
    name: 'Ironwall',
    class: 'warrior',
    color: '#00cc66',
    pieces: {
      weapon: { name: 'Ironwall Greatsword', base: 'sword', baseDamage: [16, 24] },
      chest:  { name: 'Ironwall Plate', base: 'plate_chest', baseArmor: [22, 30] },
      boots:  { name: 'Ironwall Treads', base: 'plate_boots', baseArmor: [9, 13] },
    },
    bonuses: {
      2: { armor: 30, maxHpPercent: 15, description: '+30 Armor, +15% Max HP' },
      3: { damagePercent: 25, description: '+25% Damage, Charging Strike stuns 2s' },
    },
  },
  shadowweave: {
    name: 'Shadowweave',
    class: 'rogue',
    color: '#00cc66',
    pieces: {
      weapon: { name: 'Shadowweave Stiletto', base: 'dagger', baseDamage: [7, 12] },
      gloves: { name: 'Shadowweave Grips', base: 'leather_gloves', baseArmor: [4, 7] },
      boots:  { name: 'Shadowweave Steps', base: 'leather_boots', baseArmor: [5, 8] },
    },
    bonuses: {
      2: { critChance: 20, speedPercent: 15, description: '+20% Crit Chance, +15% Speed' },
      3: { critDamagePercent: 30, description: 'Poison Blade DoT x2, +30% Crit Damage' },
    },
  },
  arcane_codex: {
    name: 'Arcane Codex',
    class: 'mage',
    color: '#00cc66',
    pieces: {
      weapon: { name: 'Arcane Codex Staff', base: 'staff', baseDamage: [7, 12] },
      helmet: { name: 'Arcane Codex Crown', base: 'cloth_helmet', baseArmor: [3, 6] },
      chest:  { name: 'Arcane Codex Robe', base: 'cloth_chest', baseArmor: [6, 12] },
    },
    bonuses: {
      2: { spellDamagePercent: 25, maxMana: 20, description: '+25% Spell Damage, +20 Max Mana' },
      3: { cooldownReduction: 20, description: 'Meteor Strike chains +1 target, -20% Cooldowns' },
    },
  },
  bones_of_fallen: {
    name: 'Bones of the Fallen',
    class: null,
    color: '#00cc66',
    pieces: {
      helmet: { name: 'Skull of the Fallen', base: 'plate_helmet', baseArmor: [10, 16] },
      gloves: { name: 'Hands of the Fallen', base: 'leather_gloves', baseArmor: [4, 7] },
      amulet: { name: 'Talisman of the Fallen', base: 'amulet' },
    },
    bonuses: {
      2: { all_resist: 10, maxHp: 100, description: '+10 All Resist, +100 HP' },
      3: { lifestealPercent: 5, xpPercent: 50, description: '5% Lifesteal, +50% XP' },
    },
  },
};

// ── Helpers ──────────────────────────────────────────────────────

function randomInt(min, max) {
  return Math.floor(Math.random() * (max - min + 1)) + min;
}

/**
 * Look up the base definition for a set piece.
 * Returns the entry from WEAPONS, ARMORS, or ACCESSORIES.
 */
function resolveBase(baseKey) {
  return WEAPONS[baseKey] || ARMORS[baseKey] || ACCESSORIES[baseKey] || null;
}

// ── Set item generation ─────────────────────────────────────────

/**
 * Generate a set item for a specific set and slot.
 * Stats sit between epic and legendary (multiplier 1.9).
 * @param {string} setId   — key in ITEM_SETS
 * @param {string} slot    — equipment slot (weapon, chest, boots, etc.)
 * @returns {object} item
 */
function generateSetItem(setId, slot) {
  const setDef = ITEM_SETS[setId];
  if (!setDef) return null;
  const pieceDef = setDef.pieces[slot];
  if (!pieceDef) return null;

  const baseDef = resolveBase(pieceDef.base);
  if (!baseDef) return null;

  const setRarity = RARITIES.set; // weight 0, multiplier 1.9

  // Roll 2-3 random bonuses (same range as epic)
  const bonusCount = randomInt(setRarity.bonusCount[0], setRarity.bonusCount[1]);
  const bonuses = {};
  const isArmor = baseDef.type === 'armor';
  const pool = isArmor
    ? [...BONUS_POOL, ...RESIST_BONUS_POOL]
    : [...BONUS_POOL];

  for (let i = 0; i < bonusCount && pool.length > 0; i++) {
    const idx = randomInt(0, pool.length - 1);
    const bonus = pool.splice(idx, 1)[0];
    const value = Math.ceil(randomInt(bonus.min, bonus.max) * setRarity.multiplier);
    bonuses[bonus.stat] = value;
  }

  // Build the item
  const item = {
    id: uuidv4(),
    name: pieceDef.name,
    type: baseDef.type,
    subType: baseDef.subType,
    slot: baseDef.slot,
    rarity: 'set',
    rarityColor: setRarity.color,
    bonuses,
    gridW: baseDef.gridW,
    gridH: baseDef.gridH,
    stackable: false,
    quantity: 1,
    // Set-specific fields
    setId,
    isSetItem: true,
  };

  // Weapon damage
  if (pieceDef.baseDamage) {
    item.damage = Math.ceil(
      randomInt(pieceDef.baseDamage[0], pieceDef.baseDamage[1]) * setRarity.multiplier,
    );
    item.attackSpeed = baseDef.attackSpeed || 800;
    item.description = baseDef.description || '';
  }

  // Armor value
  if (pieceDef.baseArmor) {
    item.armor = Math.ceil(
      randomInt(pieceDef.baseArmor[0], pieceDef.baseArmor[1]) * setRarity.multiplier,
    );
  }

  return item;
}

// ── Drop logic ──────────────────────────────────────────────────

/**
 * Decide whether a monster kill should drop a set item.
 * @param {number}  floor      — current dungeon floor
 * @param {boolean} isElite    — is the monster an elite?
 * @param {string}  eliteRank  — 'rare' | 'champion' | null
 * @returns {{ setId: string, slot: string } | null}
 */
function rollSetDrop(floor, isElite, eliteRank) {
  let chance = 0;

  if (isElite && eliteRank === 'rare') {
    chance = 1.0;                          // Rare elite: guaranteed
  } else if (isElite && eliteRank === 'champion') {
    chance = 0.25;                         // Champion elite: 25 %
  } else if (floor >= 5) {
    // Floor 5+ bosses (lootTier >= 4 handled externally)
    chance = 1.0;
  } else {
    return null;                           // Normal monsters: never
  }

  if (Math.random() > chance) return null;

  // Pick a random set
  const setIds = Object.keys(ITEM_SETS);
  const setId = setIds[randomInt(0, setIds.length - 1)];

  // Pick a random slot from that set
  const slots = Object.keys(ITEM_SETS[setId].pieces);
  const slot = slots[randomInt(0, slots.length - 1)];

  return { setId, slot };
}

// ── Query helpers ───────────────────────────────────────────────

/**
 * Return the full definition of a set.
 * @param {string} setId
 * @returns {object|null}
 */
function getSetInfo(setId) {
  return ITEM_SETS[setId] || null;
}

/**
 * Count how many pieces of each set the player currently has equipped.
 * @param {object} equipment — player.equipment map (slot → item|null)
 * @returns {Map<string, number>}  setId → count
 */
function countSetPieces(equipment) {
  const counts = new Map();
  for (const slot of Object.keys(equipment)) {
    const item = equipment[slot];
    if (item && item.isSetItem && item.setId) {
      counts.set(item.setId, (counts.get(item.setId) || 0) + 1);
    }
  }
  return counts;
}

// ── Exports ─────────────────────────────────────────────────────

module.exports = {
  ITEM_SETS,
  generateSetItem,
  rollSetDrop,
  getSetInfo,
  countSetPieces,
};
