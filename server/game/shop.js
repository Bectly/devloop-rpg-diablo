// Shop NPC system — spawns in start room, sells/buys items

const { generateWeapon, generateArmor, generateAccessory, RARITIES } = require('./items');

// Shop inventory refreshes per floor
function generateShopInventory(floor) {
  const items = [];
  // 3-5 weapons/armor/accessories, scaling with floor
  const count = 3 + Math.floor(Math.random() * 3);
  const tierBoost = Math.floor(floor / 2);

  for (let i = 0; i < count; i++) {
    const roll = Math.random();
    let item;
    if (roll < 0.3) {
      item = generateWeapon(tierBoost);
    } else if (roll < 0.8) {
      item = generateArmor(tierBoost);
    } else {
      item = generateAccessory(tierBoost);
    }
    item.shopPrice = calculatePrice(item);
    items.push(item);
  }

  // Always stock health and mana potions
  items.push({
    id: 'shop_hp_potion',
    name: 'Health Potion',
    type: 'consumable',
    subType: 'health_potion',
    rarity: 'common',
    rarityColor: '#ff4444',
    shopPrice: 25 + floor * 5,
    stackable: true,
    quantity: 1,
    gridW: 1,
    gridH: 1,
  });
  items.push({
    id: 'shop_mp_potion',
    name: 'Mana Potion',
    type: 'consumable',
    subType: 'mana_potion',
    rarity: 'common',
    rarityColor: '#4444ff',
    shopPrice: 20 + floor * 5,
    stackable: true,
    quantity: 1,
    gridW: 1,
    gridH: 1,
  });

  return items;
}

function calculatePrice(item) {
  const rarityMultipliers = { common: 1, uncommon: 2, rare: 5, epic: 15, legendary: 50 };
  const basePrice = item.type === 'weapon' ? 30 : item.type === 'armor' ? 25 : item.type === 'accessory' ? 20 : 10;
  const mult = rarityMultipliers[item.rarity] || 1;
  return Math.floor(basePrice * mult * (1 + (item.bonuses ? Object.keys(item.bonuses).length * 0.3 : 0)));
}

function getSellPrice(item) {
  // Sell at 40% of buy price
  const buy = item.shopPrice || calculatePrice(item);
  return Math.max(1, Math.floor(buy * 0.4));
}

module.exports = { generateShopInventory, calculatePrice, getSellPrice };
