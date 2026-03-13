/**
 * Crafting system — salvage, reforge, and upgrade items.
 * Phase 10: Gold sink + item customization.
 */

const { v4: uuidv4 } = require('uuid');
const { RARITIES, BONUS_POOL, RESIST_BONUS_POOL, generateBonuses } = require('./items');

// ── Material Definitions ──

const MATERIALS = {
  arcane_dust: {
    name: 'Arcane Dust',
    type: 'material',
    subType: 'arcane_dust',
    gridW: 1,
    gridH: 1,
    stackable: true,
    maxStack: 99,
    color: '#9966ff',
    rarityColor: '#9966ff',
    rarity: 'common',
  },
  magic_essence: {
    name: 'Magic Essence',
    type: 'material',
    subType: 'magic_essence',
    gridW: 1,
    gridH: 1,
    stackable: true,
    maxStack: 99,
    color: '#44aaff',
    rarityColor: '#44aaff',
    rarity: 'uncommon',
  },
  rare_crystal: {
    name: 'Rare Crystal',
    type: 'material',
    subType: 'rare_crystal',
    gridW: 1,
    gridH: 1,
    stackable: true,
    maxStack: 99,
    color: '#ff44aa',
    rarityColor: '#ff44aa',
    rarity: 'rare',
  },
};

// ── Salvage Yields by Rarity ──

const SALVAGE_YIELDS = {
  common:    { arcane_dust: 1 },
  uncommon:  { arcane_dust: 2 },
  rare:      { arcane_dust: 3, magic_essence: 1 },
  epic:      { arcane_dust: 5, magic_essence: 2 },
  legendary: { arcane_dust: 8, magic_essence: 3, rare_crystal: 1 },
  set:       { arcane_dust: 3, magic_essence: 2, rare_crystal: 1 },
};

// ── Reforge Costs ──

const REFORGE_BASE_COST = { arcane_dust: 3, gold: 50 };
const REFORGE_PER_REROLL = { arcane_dust: 1, gold: 25 };

// ── Upgrade Costs ──

const UPGRADE_COSTS = {
  1: { magic_essence: 2, gold: 100 },
  2: { magic_essence: 4, rare_crystal: 1, gold: 250 },
  3: { magic_essence: 8, rare_crystal: 3, gold: 500 },
};

const MAX_UPGRADE_LEVEL = 3;
const UPGRADE_STAT_BONUS = 0.15; // 15% per level

// ── Helpers ──

function isSalvageable(item) {
  if (!item) return false;
  // Can't salvage consumables, currency, or materials
  if (item.type === 'consumable' || item.type === 'currency' || item.type === 'material') return false;
  return true;
}

/**
 * Generate a material item for inventory.
 */
function generateMaterial(subType, quantity = 1) {
  const base = MATERIALS[subType];
  if (!base) return null;
  return {
    id: uuidv4(),
    name: base.name,
    type: base.type,
    subType: base.subType,
    rarity: base.rarity,
    rarityColor: base.rarityColor,
    gridW: base.gridW,
    gridH: base.gridH,
    stackable: base.stackable,
    maxStack: base.maxStack,
    quantity: Math.min(quantity, base.maxStack),
  };
}

/**
 * Calculate what salvaging an item yields.
 * Returns { materials: { arcane_dust: N, ... }, gold: N }
 */
function getSalvageResult(item) {
  if (!isSalvageable(item)) return null;
  const rarity = item.rarity || 'common';
  const yields = SALVAGE_YIELDS[rarity] || SALVAGE_YIELDS.common;
  // Gold = rough sell value / 2 (based on item rarity)
  const rarityGold = { common: 5, uncommon: 12, rare: 25, epic: 50, legendary: 100, set: 40 };
  const gold = rarityGold[rarity] || 5;
  return { materials: { ...yields }, gold };
}

/**
 * Get the cost for reforging an item.
 * Cost escalates with each reroll on the same item.
 */
function getReforgeCost(item) {
  const reforgeCount = item.reforgeCount || 0;
  return {
    arcane_dust: REFORGE_BASE_COST.arcane_dust + reforgeCount * REFORGE_PER_REROLL.arcane_dust,
    gold: REFORGE_BASE_COST.gold + reforgeCount * REFORGE_PER_REROLL.gold,
  };
}

/**
 * Reforge an item — re-roll one random bonus.
 * Returns a cloned item with one bonus changed. Caller decides keep or discard.
 */
function reforgeItem(item) {
  if (!isSalvageable(item)) return null;
  if (!item.bonuses || Object.keys(item.bonuses).length === 0) return null;

  const reforged = JSON.parse(JSON.stringify(item));
  const bonusKeys = Object.keys(reforged.bonuses);

  // Pick a random bonus to re-roll
  const targetKey = bonusKeys[Math.floor(Math.random() * bonusKeys.length)];

  // Determine available pool (armor items can roll resistances)
  const isArmor = item.type === 'armor' && item.slot !== 'shield';
  const pool = isArmor ? [...BONUS_POOL, ...RESIST_BONUS_POOL] : [...BONUS_POOL];

  // Pick a new bonus — can be same stat (re-rolled value) or different stat
  const newBonus = pool[Math.floor(Math.random() * pool.length)];
  const rarity = item.rarity || 'common';
  const multiplier = (RARITIES[rarity] || RARITIES.common).multiplier;
  const newValue = Math.ceil(
    (Math.floor(Math.random() * (newBonus.max - newBonus.min + 1)) + newBonus.min) * multiplier
  );

  // Remove old bonus, add new one
  // Guard: if new stat already exists (and isn't the target), we'd lose a bonus.
  // In that case, just re-roll the value of the target key instead.
  delete reforged.bonuses[targetKey];
  if (newBonus.stat !== targetKey && reforged.bonuses[newBonus.stat] !== undefined) {
    // Collision — keep the target key with a new value instead
    reforged.bonuses[targetKey] = newValue;
  } else {
    reforged.bonuses[newBonus.stat] = newValue;
  }

  return reforged;
}

/**
 * Get the cost for upgrading to the next level.
 * Returns null if already at max.
 */
function getUpgradeCost(item) {
  const currentLevel = item.upgradeLevel || 0;
  const nextLevel = currentLevel + 1;
  if (nextLevel > MAX_UPGRADE_LEVEL) return null;
  return { ...UPGRADE_COSTS[nextLevel] };
}

/**
 * Upgrade an item +1. Increases primary stat by 15%.
 * Returns upgraded item (mutated clone) or null if at max.
 */
function upgradeItem(item) {
  const currentLevel = item.upgradeLevel || 0;
  if (currentLevel >= MAX_UPGRADE_LEVEL) return null;
  if (!isSalvageable(item)) return null;

  const upgraded = JSON.parse(JSON.stringify(item));
  upgraded.upgradeLevel = currentLevel + 1;

  // Determine primary stat to boost
  if (upgraded.type === 'weapon' && upgraded.damage) {
    // Weapons: boost damage
    upgraded.damage = Math.ceil(upgraded.damage * (1 + UPGRADE_STAT_BONUS));
  } else if (upgraded.armor) {
    // Armor: boost armor value
    upgraded.armor = Math.ceil(upgraded.armor * (1 + UPGRADE_STAT_BONUS));
  } else if (upgraded.bonuses && Object.keys(upgraded.bonuses).length > 0) {
    // Accessories: boost biggest bonus
    let maxKey = null, maxVal = 0;
    for (const [k, v] of Object.entries(upgraded.bonuses)) {
      if (v > maxVal) { maxKey = k; maxVal = v; }
    }
    if (maxKey) {
      upgraded.bonuses[maxKey] = Math.ceil(maxVal * (1 + UPGRADE_STAT_BONUS));
    }
  }

  // Update name: add +N prefix
  const baseName = upgraded.name.replace(/^\+\d+ /, ''); // strip existing +N
  upgraded.name = `+${upgraded.upgradeLevel} ${baseName}`;

  return upgraded;
}

/**
 * Get full crafting info for an item — what can be done and at what cost.
 */
function getCraftingInfo(item) {
  if (!isSalvageable(item)) {
    return { salvageable: false, reforgeable: false, upgradeable: false };
  }
  const info = {
    salvageable: true,
    salvageResult: getSalvageResult(item),
    reforgeable: item.bonuses && Object.keys(item.bonuses).length > 0,
    reforgeCost: getReforgeCost(item),
    upgradeable: (item.upgradeLevel || 0) < MAX_UPGRADE_LEVEL,
    upgradeCost: getUpgradeCost(item),
    upgradeLevel: item.upgradeLevel || 0,
    maxUpgradeLevel: MAX_UPGRADE_LEVEL,
  };
  return info;
}

/**
 * Count materials in an inventory.
 * Returns { arcane_dust: N, magic_essence: N, rare_crystal: N }
 */
function countMaterials(inventory) {
  const counts = { arcane_dust: 0, magic_essence: 0, rare_crystal: 0 };
  const items = inventory.getAllItems ? inventory.getAllItems() : [];
  for (const item of items) {
    if (item.type === 'material' && counts[item.subType] !== undefined) {
      counts[item.subType] += (item.quantity || 1);
    }
  }
  return counts;
}

/**
 * Remove materials from inventory. Returns true if successful.
 * cost = { arcane_dust: N, magic_essence: N, rare_crystal: N }
 */
function removeMaterials(inventory, cost) {
  const items = inventory.getAllItems ? inventory.getAllItems() : [];

  // First verify we have enough
  const available = countMaterials(inventory);
  for (const [mat, needed] of Object.entries(cost)) {
    if (mat === 'gold') continue; // gold is on player, not inventory
    if ((available[mat] || 0) < needed) return false;
  }

  // Remove materials (consume from stacks)
  for (const [mat, needed] of Object.entries(cost)) {
    if (mat === 'gold') continue;
    let remaining = needed;
    for (const item of items) {
      if (remaining <= 0) break;
      if (item.type === 'material' && item.subType === mat) {
        const take = Math.min(remaining, item.quantity || 1);
        item.quantity -= take;
        remaining -= take;
        if (item.quantity <= 0) {
          inventory.removeItem(item.id);
        }
      }
    }
  }

  return true;
}

/**
 * Check if player can afford a cost (gold + materials).
 */
function canAfford(player, inventory, cost) {
  if (!cost) return false;
  if (cost.gold && player.gold < cost.gold) return false;
  const mats = countMaterials(inventory);
  for (const [mat, needed] of Object.entries(cost)) {
    if (mat === 'gold') continue;
    if ((mats[mat] || 0) < needed) return false;
  }
  return true;
}

module.exports = {
  MATERIALS,
  SALVAGE_YIELDS,
  REFORGE_BASE_COST,
  REFORGE_PER_REROLL,
  UPGRADE_COSTS,
  MAX_UPGRADE_LEVEL,
  UPGRADE_STAT_BONUS,
  isSalvageable,
  generateMaterial,
  getSalvageResult,
  getReforgeCost,
  reforgeItem,
  getUpgradeCost,
  upgradeItem,
  getCraftingInfo,
  countMaterials,
  removeMaterials,
  canAfford,
};
