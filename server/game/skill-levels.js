// ─── Skill Level Scaling ────────────────────────────────────────────
// Skills level 1-5. Cost: 1 talent point per level (base level 1 is free).
// Scaling: +15% damage, -10% cooldown, -5% MP cost per level above 1.

const MAX_SKILL_LEVEL = 5;

// Per-level multipliers (index = level - 1)
const DAMAGE_MULT =   [1.0, 1.15, 1.30, 1.45, 1.60];
const COOLDOWN_MULT = [1.0, 0.90, 0.80, 0.70, 0.60];
const MP_COST_MULT =  [1.0, 0.95, 0.90, 0.85, 0.80];

/**
 * Level 5 unique bonuses per skill name.
 * These modify skill properties or add new behavior flags.
 */
const LEVEL_5_BONUSES = {
  'Whirlwind':        { extraHits: 2 },           // 3→5 hits
  'Charging Strike':  { stunOnImpact: 1000 },      // 1s stun on all trail targets
  'Battle Shout':     { partyCrit: 5 },            // +5% crit to party
  'Arrow Volley':     { extraProjectiles: 2 },     // 5→7 arrows
  'Sniper Shot':      { guaranteedCrit: true },     // always crit
  'Shadow Step':      { extraDecoys: 1 },           // 2 decoys instead of 1
  'Meteor Strike':    { burningGround: true, burnDamage: 0.5, burnDuration: 3000 }, // DOT
  'Blizzard':         { freezeInsteadOfSlow: true, freezeDuration: 2000 },          // freeze
  'Chain Lightning':  { extraBounces: 2 },          // 4→6 max bounces
};

/**
 * Get damage multiplier for a skill level.
 */
function getDamageMult(level) {
  return DAMAGE_MULT[Math.min(level, MAX_SKILL_LEVEL) - 1] || 1.0;
}

/**
 * Get effective MP cost for a skill at given level.
 */
function getEffectiveMpCost(baseCost, level) {
  const mult = MP_COST_MULT[Math.min(level, MAX_SKILL_LEVEL) - 1] || 1.0;
  return Math.max(1, Math.floor(baseCost * mult));
}

/**
 * Get effective cooldown for a skill at given level.
 */
function getEffectiveCooldown(baseCooldown, level) {
  const mult = COOLDOWN_MULT[Math.min(level, MAX_SKILL_LEVEL) - 1] || 1.0;
  return Math.floor(baseCooldown * mult);
}

/**
 * Get Level 5 bonus for a skill (or null if level < 5 or no bonus defined).
 */
function getLevel5Bonus(skillName, level) {
  if (level >= 5 && LEVEL_5_BONUSES[skillName]) {
    return LEVEL_5_BONUSES[skillName];
  }
  return null;
}

/**
 * Count total skill points spent (each level above 1 costs 1 point).
 */
function getSkillPointsSpent(skillLevels) {
  if (!skillLevels) return 0;
  let total = 0;
  for (let i = 0; i < skillLevels.length; i++) {
    total += (skillLevels[i] || 1) - 1;
  }
  return total;
}

/**
 * Check if a player can level up a skill.
 * @param {number} skillIndex - 0, 1, or 2
 * @param {number[]} skillLevels - current levels [1-5, 1-5, 1-5]
 * @param {number} availablePoints - unspent talent+skill points
 * @returns {{ ok: boolean, reason?: string }}
 */
function canLevelUpSkill(skillIndex, skillLevels, availablePoints) {
  if (skillIndex < 0 || skillIndex > 2) {
    return { ok: false, reason: 'Invalid skill index' };
  }
  const current = (skillLevels && skillLevels[skillIndex]) || 1;
  if (current >= MAX_SKILL_LEVEL) {
    return { ok: false, reason: 'Skill already at max level' };
  }
  if (availablePoints <= 0) {
    return { ok: false, reason: 'No available points' };
  }
  return { ok: true };
}

module.exports = {
  MAX_SKILL_LEVEL,
  LEVEL_5_BONUSES,
  getDamageMult,
  getEffectiveMpCost,
  getEffectiveCooldown,
  getLevel5Bonus,
  getSkillPointsSpent,
  canLevelUpSkill,
};
