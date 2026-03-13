/**
 * Gem system — socketing, combining, and stat bonuses.
 * 6 gem types × 3 tiers, combinable 3→1 upgrade.
 */

const { v4: uuidv4 } = require('uuid');

// ── Constants ──

const GEM_TYPES = ['ruby', 'sapphire', 'emerald', 'topaz', 'diamond', 'amethyst'];

const GEM_TIERS = [
  { tier: 1, name: 'Chipped' },
  { tier: 2, name: 'Flawed' },
  { tier: 3, name: 'Perfect' },
];

const GEM_COLORS = {
  ruby:     '#ff4444',
  sapphire: '#4488ff',
  emerald:  '#44ff44',
  topaz:    '#ffdd44',
  diamond:  '#ffffff',
  amethyst: '#cc44ff',
};

const TIER_RARITY = {
  1: 'uncommon',
  2: 'rare',
  3: 'epic',
};

// ── Gem Data (type → tier → definition) ──

const GEM_DATA = {
  ruby: {
    1: { bonuses: { str: 3 },              name: 'Chipped Ruby',     color: GEM_COLORS.ruby },
    2: { bonuses: { str: 6 },              name: 'Flawed Ruby',      color: GEM_COLORS.ruby },
    3: { bonuses: { str: 10 },             name: 'Perfect Ruby',     color: GEM_COLORS.ruby },
  },
  sapphire: {
    1: { bonuses: { int: 3 },              name: 'Chipped Sapphire', color: GEM_COLORS.sapphire },
    2: { bonuses: { int: 6 },              name: 'Flawed Sapphire',  color: GEM_COLORS.sapphire },
    3: { bonuses: { int: 10 },             name: 'Perfect Sapphire', color: GEM_COLORS.sapphire },
  },
  emerald: {
    1: { bonuses: { dex: 3 },              name: 'Chipped Emerald',  color: GEM_COLORS.emerald },
    2: { bonuses: { dex: 6 },              name: 'Flawed Emerald',   color: GEM_COLORS.emerald },
    3: { bonuses: { dex: 10 },             name: 'Perfect Emerald',  color: GEM_COLORS.emerald },
  },
  topaz: {
    1: { bonuses: { vit: 3 },              name: 'Chipped Topaz',    color: GEM_COLORS.topaz },
    2: { bonuses: { vit: 6 },              name: 'Flawed Topaz',     color: GEM_COLORS.topaz },
    3: { bonuses: { vit: 10 },             name: 'Perfect Topaz',    color: GEM_COLORS.topaz },
  },
  diamond: {
    1: { bonuses: { allResist: 2 },        name: 'Chipped Diamond',  color: GEM_COLORS.diamond },
    2: { bonuses: { allResist: 4 },        name: 'Flawed Diamond',   color: GEM_COLORS.diamond },
    3: { bonuses: { allResist: 7 },        name: 'Perfect Diamond',  color: GEM_COLORS.diamond },
  },
  amethyst: {
    1: { bonuses: { critChance: 5 },       name: 'Chipped Amethyst', color: GEM_COLORS.amethyst },
    2: { bonuses: { critChance: 8 },       name: 'Flawed Amethyst',  color: GEM_COLORS.amethyst },
    3: { bonuses: { critChance: 12 },      name: 'Perfect Amethyst', color: GEM_COLORS.amethyst },
  },
};

// ── Functions ──

/**
 * Create a gem item object.
 */
function generateGem(type, tier) {
  const data = GEM_DATA[type]?.[tier];
  if (!data) return null;

  return {
    id: uuidv4(),
    name: data.name,
    type: 'gem',
    gemType: type,
    gemTier: tier,
    bonuses: { ...data.bonuses },
    stackable: true,
    quantity: 1,
    color: data.color,
    rarity: TIER_RARITY[tier] || 'uncommon',
  };
}

/**
 * 5% chance to drop a random gem. Tier scales with floor.
 * Floor 1-9 → chipped, 10-19 → flawed, 20+ → perfect.
 */
function rollGemDrop(floorNumber) {
  if (Math.random() > 0.05) return null;

  let tier;
  if (floorNumber >= 20)     tier = 3;
  else if (floorNumber >= 10) tier = 2;
  else                         tier = 1;

  const type = GEM_TYPES[Math.floor(Math.random() * GEM_TYPES.length)];
  return generateGem(type, tier);
}

/**
 * Combine 3 identical gems (same type + tier) into the next tier.
 * Returns the upgraded gem or null if invalid.
 */
function combineGems(gems) {
  if (!Array.isArray(gems) || gems.length !== 3) return null;

  const { gemType, gemTier } = gems[0];
  if (!gemType || !gemTier) return null;

  // All three must match type and tier
  const allMatch = gems.every(g => g.gemType === gemType && g.gemTier === gemTier);
  if (!allMatch) return null;

  // Can't upgrade beyond perfect
  const nextTier = gemTier + 1;
  if (nextTier > 3) return null;

  return generateGem(gemType, nextTier);
}

/**
 * Aggregate bonuses from an array of socketed gems.
 * Returns a flat object like { str: 10, critChance: 5, allResist: 4 }.
 */
function getSocketBonuses(gems) {
  const totals = {};

  for (const gem of gems) {
    if (!gem?.bonuses) continue;
    for (const [stat, value] of Object.entries(gem.bonuses)) {
      totals[stat] = (totals[stat] || 0) + value;
    }
  }

  return totals;
}

// ── Exports ──

module.exports = {
  GEM_TYPES,
  GEM_TIERS,
  GEM_DATA,
  GEM_COLORS,
  TIER_RARITY,
  generateGem,
  rollGemDrop,
  combineGems,
  getSocketBonuses,
};
