const { v4: uuidv4 } = require('uuid');

// Rarity definitions
const RARITIES = {
  common:    { name: 'Common',    color: '#aaaaaa', weight: 60, bonusCount: [0, 1], multiplier: 1.0 },
  uncommon:  { name: 'Uncommon',  color: '#44cc44', weight: 25, bonusCount: [1, 2], multiplier: 1.2 },
  rare:      { name: 'Rare',      color: '#4488ff', weight: 10, bonusCount: [2, 3], multiplier: 1.5 },
  epic:      { name: 'Epic',      color: '#bb44ff', weight: 4,  bonusCount: [3, 4], multiplier: 1.8 },
  legendary: { name: 'Legendary', color: '#ff8800', weight: 1,  bonusCount: [4, 5], multiplier: 2.2 },
  set:       { name: 'Set',       color: '#00cc66', weight: 0,  bonusCount: [2, 3], multiplier: 1.9 },
};

// Weapon base definitions
const WEAPONS = {
  sword: {
    name: 'Sword', slot: 'weapon', type: 'weapon', subType: 'sword',
    baseDamage: [8, 14], attackSpeed: 800, gridW: 1, gridH: 2,
    description: 'Balanced one-handed sword',
  },
  axe: {
    name: 'Axe', slot: 'weapon', type: 'weapon', subType: 'axe',
    baseDamage: [15, 25], attackSpeed: 1400, gridW: 2, gridH: 2,
    description: 'Slow but devastating two-handed axe',
  },
  bow: {
    name: 'Bow', slot: 'weapon', type: 'weapon', subType: 'bow',
    baseDamage: [6, 12], attackSpeed: 1000, gridW: 1, gridH: 3,
    description: 'Ranged weapon for nimble fighters',
  },
  staff: {
    name: 'Staff', slot: 'weapon', type: 'weapon', subType: 'staff',
    baseDamage: [4, 8], attackSpeed: 1100, gridW: 1, gridH: 3,
    description: 'Boosts spell damage significantly',
  },
  dagger: {
    name: 'Dagger', slot: 'weapon', type: 'weapon', subType: 'dagger',
    baseDamage: [4, 8], attackSpeed: 500, gridW: 1, gridH: 1,
    description: 'Fast with high crit chance',
  },
};

// Armor base definitions
const ARMORS = {
  plate_helmet:  { name: 'Plate Helm',   slot: 'helmet', type: 'armor', subType: 'plate', baseArmor: [8, 14],  gridW: 2, gridH: 2 },
  plate_chest:   { name: 'Plate Armor',   slot: 'chest',  type: 'armor', subType: 'plate', baseArmor: [15, 25], gridW: 2, gridH: 3 },
  plate_gloves:  { name: 'Plate Gauntlets', slot: 'gloves', type: 'armor', subType: 'plate', baseArmor: [5, 9],  gridW: 2, gridH: 2 },
  plate_boots:   { name: 'Plate Boots',   slot: 'boots',  type: 'armor', subType: 'plate', baseArmor: [6, 10],  gridW: 2, gridH: 2 },
  leather_helmet: { name: 'Leather Hood',  slot: 'helmet', type: 'armor', subType: 'leather', baseArmor: [4, 8],  gridW: 2, gridH: 2 },
  leather_chest:  { name: 'Leather Vest',  slot: 'chest',  type: 'armor', subType: 'leather', baseArmor: [8, 14], gridW: 2, gridH: 3 },
  leather_gloves: { name: 'Leather Gloves', slot: 'gloves', type: 'armor', subType: 'leather', baseArmor: [3, 5], gridW: 2, gridH: 2 },
  leather_boots:  { name: 'Leather Boots', slot: 'boots',  type: 'armor', subType: 'leather', baseArmor: [3, 6], gridW: 2, gridH: 2 },
  cloth_helmet:  { name: 'Cloth Hood',    slot: 'helmet', type: 'armor', subType: 'cloth', baseArmor: [2, 4],   gridW: 2, gridH: 2 },
  cloth_chest:   { name: 'Cloth Robe',    slot: 'chest',  type: 'armor', subType: 'cloth', baseArmor: [4, 8],   gridW: 2, gridH: 3 },
  cloth_gloves:  { name: 'Cloth Wraps',   slot: 'gloves', type: 'armor', subType: 'cloth', baseArmor: [1, 3],   gridW: 2, gridH: 2 },
  cloth_boots:   { name: 'Cloth Shoes',   slot: 'boots',  type: 'armor', subType: 'cloth', baseArmor: [1, 3],   gridW: 2, gridH: 2 },
};

// Accessories
const ACCESSORIES = {
  ring:    { name: 'Ring',    slot: 'ring1', type: 'accessory', subType: 'ring',    gridW: 1, gridH: 1 },
  amulet:  { name: 'Amulet',  slot: 'amulet', type: 'accessory', subType: 'amulet', gridW: 1, gridH: 1 },
  shield:  { name: 'Shield',  slot: 'shield', type: 'armor', subType: 'shield', baseArmor: [10, 20], gridW: 2, gridH: 2 },
};

// Consumables
const CONSUMABLES = {
  health_potion: { name: 'Health Potion', type: 'consumable', subType: 'health_potion', gridW: 1, gridH: 1, stackable: true, maxStack: 20, color: '#ff4444' },
  mana_potion:   { name: 'Mana Potion',   type: 'consumable', subType: 'mana_potion',   gridW: 1, gridH: 1, stackable: true, maxStack: 20, color: '#4444ff' },
  gold:          { name: 'Gold',           type: 'currency',   subType: 'gold',          gridW: 1, gridH: 1, stackable: true, maxStack: 9999, color: '#ffcc00' },
};

// Possible bonus stats on equipment
const BONUS_POOL = [
  { stat: 'str', min: 1, max: 8, label: 'Strength' },
  { stat: 'dex', min: 1, max: 8, label: 'Dexterity' },
  { stat: 'int', min: 1, max: 8, label: 'Intelligence' },
  { stat: 'vit', min: 1, max: 8, label: 'Vitality' },
  { stat: 'armor', min: 2, max: 12, label: 'Armor' },
  { stat: 'damage', min: 1, max: 6, label: 'Damage' },
];

// Resistance bonuses — only roll on armor items (helmet, chest, gloves, boots)
const RESIST_BONUS_POOL = [
  { stat: 'fire_resist', min: 5, max: 20, label: 'Fire Resist' },
  { stat: 'cold_resist', min: 5, max: 20, label: 'Cold Resist' },
  { stat: 'poison_resist', min: 5, max: 20, label: 'Poison Resist' },
  { stat: 'all_resist', min: 3, max: 10, label: 'All Resist' },
];

// Name prefixes by rarity
const PREFIXES = {
  common:    ['Worn', 'Old', 'Simple', 'Plain'],
  uncommon:  ['Fine', 'Sturdy', 'Polished', 'Sharp'],
  rare:      ['Enchanted', 'Gleaming', 'Runed', 'Blessed'],
  epic:      ['Mythic', 'Arcane', 'Radiant', 'Infernal'],
  legendary: ['Godslayer', 'Ancient', 'Eternal', 'Void-Touched'],
};

// Name suffixes based on highest bonus stat
const SUFFIXES = {
  str: ['of the Bear', 'of Might', 'of the Titan', 'of Brawn'],
  dex: ['of the Fox', 'of Agility', 'of the Wind', 'of Swiftness'],
  int: ['of Wisdom', 'of the Sage', 'of Arcana', 'of the Mind'],
  vit: ['of Vitality', 'of the Oak', 'of Endurance', 'of Fortitude'],
  armor: ['of the Fortress', 'of Warding', 'of the Bulwark', 'of Iron'],
  damage: ['of Slaying', 'of Ruin', 'of Carnage', 'of the Destroyer'],
  fire_resist: ['of Flame Ward', 'of the Phoenix', 'of Fire Guard', 'of Embers'],
  cold_resist: ['of Frost Ward', 'of the Glacier', 'of Ice Guard', 'of Winter'],
  poison_resist: ['of Venom Ward', 'of the Antidote', 'of Poison Guard', 'of Purity'],
  all_resist: ['of Protection', 'of Warding', 'of the Sentinel', 'of Resilience'],
};

// Unique handcrafted names for legendary items
const LEGENDARY_NAMES = {
  weapon: {
    sword: ['Shadowfang', 'Dawnbreaker', 'Soul Reaver', 'Grimthorn', 'Moonblade'],
    axe: ['Skullcleaver', 'Worldsplitter', 'Ragecutter', 'Bonegrinder', 'Hellchopper'],
    bow: ['Whisperstring', 'Deathsong', 'Starfall', 'Voidshot', 'Ghostaim'],
    staff: ['Mindshatter', 'Thundercall', 'Frostweave', 'Dreamspire', 'Runekeeper'],
    dagger: ['Viperstrike', 'Nightwhisper', 'Bloodthorn', 'Silentshadow', 'Deathkiss'],
  },
  armor: {
    plate: ['Aegis of the Fallen', 'Ironheart Bulwark', 'Titan\'s Embrace', 'Doomplate', 'Dragonscale Mail'],
    leather: ['Shadowskin', 'Windrunner\'s Hide', 'Nightstalker Vest', 'Ghostweave', 'Serpent\'s Coil'],
    cloth: ['Archmage\'s Shroud', 'Voidweave Robe', 'Starlight Mantle', 'Dreamcloth', 'Whispersilk'],
    shield: ['Bulwark of Ages', 'Demonward', 'Sentinel\'s Wall', 'Stonebreaker', 'Aegis Eternal'],
  },
  accessory: {
    ring: ['Band of the Infinite', 'Serpent\'s Coil', 'Signet of Ruin', 'Ring of Echoes', 'Voidcircle'],
    amulet: ['Heart of the Mountain', 'Eye of the Abyss', 'Soulchain', 'Pendant of Ages', 'Starcore'],
  },
};

function randomInt(min, max) {
  return Math.floor(Math.random() * (max - min + 1)) + min;
}

function pickRarity(tierBoost = 0) {
  // Shift weights: reduce common, boost higher rarities based on tierBoost
  const adjustedWeights = {
    common:    Math.max(10, 60 - tierBoost * 8),
    uncommon:  25 + tierBoost * 2,
    rare:      10 + tierBoost * 3,
    epic:      4 + tierBoost * 2,
    legendary: 1 + tierBoost * 1,
  };

  const totalWeight = Object.values(adjustedWeights).reduce((sum, w) => sum + w, 0);
  let roll = Math.random() * totalWeight;

  for (const [key, weight] of Object.entries(adjustedWeights)) {
    roll -= weight;
    if (roll <= 0) return key;
  }
  return 'common';
}

function generateBonuses(rarity, extraPool = null) {
  const r = RARITIES[rarity];
  const count = randomInt(r.bonusCount[0], r.bonusCount[1]);
  const bonuses = {};
  const pool = extraPool ? [...BONUS_POOL, ...extraPool] : [...BONUS_POOL];

  for (let i = 0; i < count && pool.length > 0; i++) {
    const idx = randomInt(0, pool.length - 1);
    const bonus = pool.splice(idx, 1)[0];
    const value = Math.ceil(randomInt(bonus.min, bonus.max) * r.multiplier);
    bonuses[bonus.stat] = value;
  }

  return bonuses;
}

function getSuffix(bonuses) {
  if (!bonuses || Object.keys(bonuses).length === 0) return '';
  let maxStat = null, maxVal = 0;
  for (const [stat, val] of Object.entries(bonuses)) {
    if (val > maxVal) { maxStat = stat; maxVal = val; }
  }
  if (!maxStat || !SUFFIXES[maxStat]) return '';
  const pool = SUFFIXES[maxStat];
  return pool[Math.floor(Math.random() * pool.length)];
}

function getLegendaryName(category, subType) {
  const pool = LEGENDARY_NAMES[category] && LEGENDARY_NAMES[category][subType];
  if (!pool || pool.length === 0) return null;
  return pool[Math.floor(Math.random() * pool.length)];
}

function buildItemName(prefix, baseName, rarity, bonuses, category, subType) {
  if (rarity === 'legendary') {
    const uniqueName = getLegendaryName(category, subType);
    if (uniqueName) return uniqueName;
  }
  if (rarity === 'epic') {
    const suffix = getSuffix(bonuses);
    return suffix ? `${prefix} ${baseName} ${suffix}` : `${prefix} ${baseName}`;
  }
  if (rarity === 'rare' && Math.random() < 0.6) {
    const suffix = getSuffix(bonuses);
    return suffix ? `${prefix} ${baseName} ${suffix}` : `${prefix} ${baseName}`;
  }
  return `${prefix} ${baseName}`;
}

// Socket ranges: [min, max] by item category and rarity
const SOCKET_RANGES = {
  weapon: {
    common: [0, 0], uncommon: [0, 1], rare: [0, 1],
    epic: [0, 2], legendary: [1, 3], set: [0, 2],
  },
  armor: {
    common: [0, 0], uncommon: [0, 0], rare: [0, 1],
    epic: [0, 1], legendary: [0, 1], set: [0, 2],
  },
  accessory: {
    common: [0, 0], uncommon: [0, 0], rare: [0, 0],
    epic: [0, 0], legendary: [0, 0], set: [0, 0],
  },
};

function rollSockets(category, rarity) {
  const ranges = SOCKET_RANGES[category];
  if (!ranges || !ranges[rarity]) return [];
  const [min, max] = ranges[rarity];
  const count = randomInt(min, max);
  return new Array(count).fill(null);
}

function generateWeapon(tierBoost = 0) {
  const keys = Object.keys(WEAPONS);
  const base = WEAPONS[keys[randomInt(0, keys.length - 1)]];
  const rarity = pickRarity(tierBoost);
  const r = RARITIES[rarity];
  const prefix = PREFIXES[rarity][randomInt(0, PREFIXES[rarity].length - 1)];

  const damage = Math.ceil(randomInt(base.baseDamage[0], base.baseDamage[1]) * r.multiplier);
  const bonuses = generateBonuses(rarity);

  return {
    id: uuidv4(),
    name: buildItemName(prefix, base.name, rarity, bonuses, 'weapon', base.subType),
    type: base.type,
    subType: base.subType,
    slot: base.slot,
    rarity,
    rarityColor: r.color,
    damage,
    attackSpeed: base.attackSpeed,
    bonuses,
    sockets: rollSockets('weapon', rarity),
    gridW: base.gridW,
    gridH: base.gridH,
    description: base.description,
    stackable: false,
    quantity: 1,
  };
}

function generateArmor(tierBoost = 0) {
  const keys = Object.keys(ARMORS);
  const base = ARMORS[keys[randomInt(0, keys.length - 1)]];
  const rarity = pickRarity(tierBoost);
  const r = RARITIES[rarity];
  const prefix = PREFIXES[rarity][randomInt(0, PREFIXES[rarity].length - 1)];

  const armor = Math.ceil(randomInt(base.baseArmor[0], base.baseArmor[1]) * r.multiplier);
  // Armor items can roll resistance bonuses
  const bonuses = generateBonuses(rarity, RESIST_BONUS_POOL);

  return {
    id: uuidv4(),
    name: buildItemName(prefix, base.name, rarity, bonuses, 'armor', base.subType),
    type: base.type,
    subType: base.subType,
    slot: base.slot,
    rarity,
    rarityColor: r.color,
    armor,
    bonuses,
    sockets: rollSockets('armor', rarity),
    gridW: base.gridW,
    gridH: base.gridH,
    stackable: false,
    quantity: 1,
  };
}

function generateAccessory(tierBoost = 0) {
  const keys = Object.keys(ACCESSORIES);
  const base = ACCESSORIES[keys[randomInt(0, keys.length - 1)]];
  const rarity = pickRarity(tierBoost);
  const r = RARITIES[rarity];
  const prefix = PREFIXES[rarity][randomInt(0, PREFIXES[rarity].length - 1)];

  const bonuses = generateBonuses(rarity);
  const item = {
    id: uuidv4(),
    name: buildItemName(prefix, base.name, rarity, bonuses, 'accessory', base.subType),
    type: base.type,
    subType: base.subType,
    slot: base.slot,
    rarity,
    rarityColor: r.color,
    bonuses,
    sockets: rollSockets('accessory', rarity),
    gridW: base.gridW,
    gridH: base.gridH,
    stackable: false,
    quantity: 1,
  };

  if (base.baseArmor) {
    item.armor = Math.ceil(randomInt(base.baseArmor[0], base.baseArmor[1]) * r.multiplier);
  }

  return item;
}

function generateConsumable(subType, quantity = 1) {
  const base = CONSUMABLES[subType];
  if (!base) return null;

  return {
    id: uuidv4(),
    name: base.name,
    type: base.type,
    subType: base.subType,
    rarity: 'common',
    rarityColor: base.color || '#aaaaaa',
    gridW: base.gridW,
    gridH: base.gridH,
    stackable: base.stackable,
    maxStack: base.maxStack,
    quantity: Math.min(quantity, base.maxStack),
  };
}

function generateLoot(lootTier, monsterType, floor = 0, goldMult = 1.0) {
  const drops = [];

  // Gold always drops (scaled by floor + difficulty)
  const goldBase = Math.floor((3 + lootTier * 2 + floor * 2) * goldMult);
  const goldMax = Math.floor((8 + lootTier * 4 + floor * 4) * goldMult);
  drops.push(generateConsumable('gold', randomInt(goldBase, goldMax)));

  // Chance for potion
  if (Math.random() < 0.3) {
    const potionType = Math.random() < 0.6 ? 'health_potion' : 'mana_potion';
    drops.push(generateConsumable(potionType, randomInt(1, 2)));
  }

  // Equipment drops based on tier (rarity scaled with floor)
  const equipChance = 0.15 + lootTier * 0.1 + floor * 0.03;
  if (Math.random() < equipChance) {
    const tierBoost = lootTier + Math.floor(floor / 2);
    const roll = Math.random();
    if (roll < 0.4) {
      drops.push(generateWeapon(tierBoost));
    } else if (roll < 0.8) {
      drops.push(generateArmor(tierBoost));
    } else {
      drops.push(generateAccessory(tierBoost));
    }
  }

  // Boss guaranteed rare+ drop
  if (lootTier >= 4) {
    const tierBoost = lootTier + floor;
    let bossItem;
    const roll = Math.random();
    if (roll < 0.5) {
      bossItem = generateWeapon(tierBoost);
    } else if (roll < 0.85) {
      bossItem = generateArmor(tierBoost);
    } else {
      bossItem = generateAccessory(tierBoost);
    }
    // Force at least rare
    const rarityOrder = ['common', 'uncommon', 'rare', 'epic', 'legendary'];
    const idx = rarityOrder.indexOf(bossItem.rarity);
    if (idx < 2) {
      bossItem.rarity = 'rare';
      bossItem.rarityColor = RARITIES.rare.color;
      const prefix = PREFIXES.rare[randomInt(0, PREFIXES.rare.length - 1)];
      // Extract the base item name (last word(s) after the old prefix)
      const nameParts = bossItem.name.split(' ');
      const baseName = nameParts.length > 1 ? nameParts.slice(1).join(' ') : nameParts[0];
      const category = bossItem.type === 'weapon' ? 'weapon' : (bossItem.type === 'accessory' ? 'accessory' : 'armor');
      bossItem.name = buildItemName(prefix, baseName, 'rare', bossItem.bonuses, category, bossItem.subType);
    }
    drops.push(bossItem);
  }

  return drops;
}

module.exports = {
  RARITIES,
  WEAPONS,
  ARMORS,
  ACCESSORIES,
  CONSUMABLES,
  BONUS_POOL,
  RESIST_BONUS_POOL,
  PREFIXES,
  SUFFIXES,
  LEGENDARY_NAMES,
  SOCKET_RANGES,
  rollSockets,
  generateWeapon,
  generateArmor,
  generateAccessory,
  generateConsumable,
  generateLoot,
  pickRarity,
  getSuffix,
  getLegendaryName,
  buildItemName,
};
