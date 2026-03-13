// ─── Damage Type Definitions ────────────────────────────────────
// Pure utility module: damage type constants and resistance math.
// No game state — just definitions and pure functions.

const DAMAGE_TYPES = {
  physical: { name: 'Physical', color: '#ffffff', resistKey: null },      // reduced by armor
  fire:     { name: 'Fire',     color: '#ff8800', resistKey: 'fire' },
  cold:     { name: 'Cold',     color: '#4488ff', resistKey: 'cold' },
  poison:   { name: 'Poison',   color: '#44cc44', resistKey: 'poison' },
};

const MAX_RESISTANCE = 75; // hard cap at 75%

// ─── Skill → Damage Type Mapping ────────────────────────────────

const SKILL_DAMAGE_TYPES = {
  // Warrior
  'Whirlwind':       'physical',
  'Charging Strike':  'physical',
  'Battle Shout':     'physical',
  // Mage
  'Fireball':     'fire',
  'Frost Nova':   'cold',
  'Teleport':     'physical',
  // Ranger
  'Multi-Shot':   'physical',
  'Poison Arrow': 'poison',
  'Evasion':      'physical',
};

// ─── Pure Functions ─────────────────────────────────────────────

/**
 * Calculate effective resistance from base + bonus, capped at MAX_RESISTANCE.
 * @param {number} baseResist - Innate resistance value
 * @param {number} bonusResist - Resistance from gear/buffs
 * @returns {number} Effective resistance (0 to MAX_RESISTANCE)
 */
function calcResistance(baseResist, bonusResist) {
  return Math.min(MAX_RESISTANCE, baseResist + bonusResist);
}

/**
 * Apply resistance to elemental damage.
 * Resistance is 0-75, reduces damage by that percentage.
 * Minimum 1 damage always gets through.
 * @param {number} damage - Raw elemental damage
 * @param {number} resistance - Effective resistance (0-75)
 * @returns {number} Damage after resistance reduction
 */
function applyResistance(damage, resistance) {
  const effectiveResist = Math.min(MAX_RESISTANCE, Math.max(0, resistance));
  return Math.max(1, Math.floor(damage * (1 - effectiveResist / 100)));
}

/**
 * Apply armor to physical damage (existing formula).
 * @param {number} damage - Raw physical damage
 * @param {number} armor - Target's armor value
 * @returns {number} Damage after armor reduction
 */
function applyArmor(damage, armor) {
  return Math.max(1, Math.floor(damage - armor * 0.4));
}

/**
 * Get the damage type for a skill by name.
 * Falls back to 'physical' for unknown skills.
 * @param {string} skillName - Skill name (e.g. 'Fireball')
 * @returns {string} Damage type key
 */
function getSkillDamageType(skillName) {
  return SKILL_DAMAGE_TYPES[skillName] || 'physical';
}

/**
 * Get the damage type definition object.
 * @param {string} typeKey - Damage type key (e.g. 'fire')
 * @returns {object} Damage type definition
 */
function getDamageTypeDef(typeKey) {
  return DAMAGE_TYPES[typeKey] || DAMAGE_TYPES.physical;
}

module.exports = {
  DAMAGE_TYPES,
  MAX_RESISTANCE,
  SKILL_DAMAGE_TYPES,
  calcResistance,
  applyResistance,
  applyArmor,
  getSkillDamageType,
  getDamageTypeDef,
};
