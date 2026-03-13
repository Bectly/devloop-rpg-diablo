/**
 * World event socket handlers — extracted from socket-handlers.js
 * Handles: gambling, enchanting, gem socket/unsocket/combine.
 */

const { generateWeapon, generateArmor, generateAccessory, WEAPONS, ARMORS, ACCESSORIES, RARITIES, BONUS_POOL, RESIST_BONUS_POOL } = require('./game/items');

// ── Enchanting ──

exports.handleEnchantPreview = (socket, data, { players, inventories }) => {
  const player = players.get(socket.id);
  if (!player) return;

  if (!data || !data.itemId || !data.bonusKey) {
    socket.emit('notification', { text: 'Invalid enchant request', type: 'error' });
    return;
  }

  // Find item in equipment or inventory
  const inv = inventories.get(player.id);
  let item = null;
  let isEquipped = false;

  for (const slot of Object.keys(player.equipment)) {
    if (player.equipment[slot] && player.equipment[slot].id === data.itemId) {
      item = player.equipment[slot];
      isEquipped = true;
      break;
    }
  }
  if (!item && inv) {
    item = inv.getItem(data.itemId);
  }

  if (!item || !item.bonuses || item.bonuses[data.bonusKey] === undefined) {
    socket.emit('notification', { text: 'Item or stat not found', type: 'error' });
    return;
  }

  // Calculate cost: 100 × itemLevel × (1 + enchantCount × 0.5)
  const itemLevel = item.level || item.itemLevel || 1;
  const enchantCount = item.enchantCount || 0;
  const cost = Math.floor(100 * itemLevel * (1 + enchantCount * 0.5));

  // Get possible replacement stats from appropriate pool
  const isArmor = item.slot === 'helmet' || item.slot === 'chest' || item.slot === 'gloves' || item.slot === 'boots' || item.slot === 'shield';
  const pool = isArmor ? [...BONUS_POOL, ...RESIST_BONUS_POOL] : [...BONUS_POOL];

  socket.emit('enchant:preview', {
    itemId: item.id,
    bonusKey: data.bonusKey,
    currentValue: item.bonuses[data.bonusKey],
    cost,
    pool: pool.map(b => ({ stat: b.stat, label: b.label, min: b.min, max: b.max })),
  });
};

exports.handleEnchantExecute = (socket, data, { players, inventories }) => {
  const player = players.get(socket.id);
  if (!player) return;

  if (!data || !data.itemId || !data.bonusKey) {
    socket.emit('notification', { text: 'Invalid enchant request', type: 'error' });
    return;
  }

  // Find item
  const inv = inventories.get(player.id);
  let item = null;
  let isEquipped = false;

  for (const slot of Object.keys(player.equipment)) {
    if (player.equipment[slot] && player.equipment[slot].id === data.itemId) {
      item = player.equipment[slot];
      isEquipped = true;
      break;
    }
  }
  if (!item && inv) {
    item = inv.getItem(data.itemId);
  }

  if (!item || !item.bonuses || item.bonuses[data.bonusKey] === undefined) {
    socket.emit('notification', { text: 'Item or stat not found', type: 'error' });
    return;
  }

  // Calculate and check cost
  const itemLevel = item.level || item.itemLevel || 1;
  const enchantCount = item.enchantCount || 0;
  const cost = Math.floor(100 * itemLevel * (1 + enchantCount * 0.5));

  if (player.gold < cost) {
    socket.emit('notification', { text: `Need ${cost} gold to enchant`, type: 'error' });
    return;
  }

  // Get pool
  const isArmor = item.slot === 'helmet' || item.slot === 'chest' || item.slot === 'gloves' || item.slot === 'boots' || item.slot === 'shield';
  const pool = isArmor ? [...BONUS_POOL, ...RESIST_BONUS_POOL] : [...BONUS_POOL];

  // Find the bonus definition for this stat
  const bonusDef = pool.find(b => b.stat === data.bonusKey);
  if (!bonusDef) {
    socket.emit('notification', { text: 'Unknown stat type', type: 'error' });
    return;
  }

  const oldValue = item.bonuses[data.bonusKey];
  const rarity = RARITIES[item.rarity] || RARITIES.common;

  // Roll new value
  let newValue = Math.ceil((bonusDef.min + Math.random() * (bonusDef.max - bonusDef.min)) * rarity.multiplier);

  // Bad luck protection: if same stat rerolled 3+ times, guarantee different value
  if (!item._enchantHistory) item._enchantHistory = [];
  item._enchantHistory.push(data.bonusKey);
  // Keep only last 5
  if (item._enchantHistory.length > 5) item._enchantHistory.shift();

  const consecutiveSame = item._enchantHistory.filter(k => k === data.bonusKey).length;
  if (consecutiveSame >= 3 && newValue === oldValue) {
    // Force different: add 1 or subtract 1
    newValue = newValue + (Math.random() > 0.5 ? 1 : -1);
    if (newValue < 1) newValue = oldValue + 1;
  }

  // Apply
  player.gold -= cost;
  item.bonuses[data.bonusKey] = newValue;
  item.enchantCount = enchantCount + 1;
  item.enchanted = true;

  // Recalc if equipped
  if (isEquipped) {
    player.recalcEquipBonuses();
    player.recalcStats();
  }

  socket.emit('enchant:result', {
    itemId: item.id,
    bonusKey: data.bonusKey,
    oldValue,
    newValue,
    cost,
    enchantCount: item.enchantCount,
  });

  socket.emit('player:stats', player.serializeForPhone());
  if (inv) socket.emit('inventory:update', inv.serialize());
  socket.emit('notification', {
    text: `✧ ${data.bonusKey}: ${oldValue} → ${newValue} (−${cost}g)`,
    type: newValue > oldValue ? 'info' : 'warning',
  });
};

// ── Gambling (Kadala-style mystery items) ──
exports.handleGamble = (socket, data, { players, inventories, world, gameNs }) => {
  const player = players.get(socket.id);
  if (!player || !player.alive || player.isDying) return;

  // Validate slot
  const validSlots = ['weapon', 'helmet', 'chest', 'gloves', 'boots', 'ring', 'amulet', 'shield'];
  if (!data || !validSlots.includes(data.slot)) {
    socket.emit('notification', { text: 'Invalid gamble slot', type: 'error' });
    return;
  }

  // Must be near shop NPC
  const shopNpc = world.getShopNpc();
  if (!shopNpc) return;
  const dist = Math.hypot(player.x - shopNpc.x, player.y - shopNpc.y);
  if (dist > 120) {
    socket.emit('notification', { text: 'Too far from merchant!', type: 'error' });
    return;
  }

  // Cost: 50 × current floor (minimum floor 1)
  const floor = world.currentFloor || 1;
  const cost = 50 * Math.max(1, floor);

  if (player.gold < cost) {
    socket.emit('notification', { text: `Not enough gold! Need ${cost}g`, type: 'error' });
    return;
  }

  const inv = inventories.get(player.id);
  if (!inv) return;

  // Generate item for the requested slot
  let item = null;
  const slot = data.slot;

  if (slot === 'weapon') {
    // Generate weapons until we get one (all weapons have slot 'weapon', so any will do)
    item = generateWeapon(Math.floor(floor / 2));
  } else if (slot === 'ring') {
    item = generateAccessory(Math.floor(floor / 2));
    // Force ring slot — re-roll until ring, or just override
    const ringBase = ACCESSORIES.ring;
    item.slot = ringBase.slot; // 'ring1'
    item.subType = 'ring';
    item.type = 'accessory';
  } else if (slot === 'amulet') {
    item = generateAccessory(Math.floor(floor / 2));
    const amuletBase = ACCESSORIES.amulet;
    item.slot = amuletBase.slot; // 'amulet'
    item.subType = 'amulet';
    item.type = 'accessory';
  } else if (slot === 'shield') {
    item = generateAccessory(Math.floor(floor / 2));
    const shieldBase = ACCESSORIES.shield;
    item.slot = shieldBase.slot; // 'shield'
    item.subType = 'shield';
    item.type = 'armor';
    if (!item.armor) {
      const baseArmor = shieldBase.baseArmor;
      const mult = RARITIES[item.rarity] ? RARITIES[item.rarity].multiplier : 1.0;
      item.armor = Math.ceil((Math.floor(Math.random() * (baseArmor[1] - baseArmor[0] + 1)) + baseArmor[0]) * mult);
    }
    item.gridW = shieldBase.gridW;
    item.gridH = shieldBase.gridH;
  } else {
    // Armor slots: helmet, chest, gloves, boots — generate armor and filter by slot
    // Re-roll up to 20 times to get the right slot, then force it
    for (let i = 0; i < 20; i++) {
      item = generateArmor(Math.floor(floor / 2));
      if (item.slot === slot) break;
    }
    // If still wrong slot, force it by picking a matching base
    if (item.slot !== slot) {
      const matchingKeys = Object.keys(ARMORS).filter(k => ARMORS[k].slot === slot);
      if (matchingKeys.length > 0) {
        const baseKey = matchingKeys[Math.floor(Math.random() * matchingKeys.length)];
        const base = ARMORS[baseKey];
        item.slot = base.slot;
        item.subType = base.subType;
        item.gridW = base.gridW;
        item.gridH = base.gridH;
        const mult = RARITIES[item.rarity] ? RARITIES[item.rarity].multiplier : 1.0;
        item.armor = Math.ceil((Math.floor(Math.random() * (base.baseArmor[1] - base.baseArmor[0] + 1)) + base.baseArmor[0]) * mult);
      }
    }
  }

  if (!item) {
    socket.emit('notification', { text: 'Gamble failed — try again', type: 'error' });
    return;
  }

  // Check inventory space
  const result = inv.addItem(item);
  if (!result.success) {
    socket.emit('notification', { text: 'Inventory full!', type: 'error' });
    return;
  }

  // Deduct gold
  player.gold -= cost;

  // Emit results
  const rarityName = (item.rarity || 'common').toUpperCase();
  socket.emit('gamble:result', {
    item,
    cost,
    rarity: item.rarity,
    rarityColor: item.rarityColor,
  });
  socket.emit('inventory:update', inv.serialize());
  socket.emit('stats:update', player.serializeForPhone());
  socket.emit('notification', {
    text: `Gambled: ${item.name} [${rarityName}] for ${cost}g`,
    type: item.rarity || 'common',
  });

  // Re-send shop inventory if still relevant
  if (shopNpc) {
    socket.emit('shop:inventory', { items: shopNpc.inventory, playerGold: player.gold });
  }
};

// ── Gem Socket/Unsocket ──

exports.handleGemSocket = (socket, data, { players, inventories }) => {
  const player = players.get(socket.id);
  if (!player) return;
  const inv = inventories.get(player.id);
  if (!inv) return;

  // Validate input
  if (!data || typeof data.itemId !== 'string' || typeof data.gemId !== 'string') {
    socket.emit('notification', { text: 'Invalid socket request', type: 'error' });
    return;
  }

  // Find the target item (check equipped items first, then inventory)
  let item = null;
  let itemLocation = null; // 'equipped' or 'inventory'

  for (const [slot, equip] of Object.entries(player.equipment)) {
    if (equip && equip.id === data.itemId) {
      item = equip;
      itemLocation = 'equipped';
      break;
    }
  }
  if (!item) {
    item = inv.getItem(data.itemId);
    if (item) itemLocation = 'inventory';
  }

  if (!item) {
    socket.emit('notification', { text: 'Item not found', type: 'error' });
    return;
  }

  // Check item has empty sockets
  if (!item.sockets || !Array.isArray(item.sockets)) {
    socket.emit('notification', { text: 'Item has no sockets', type: 'error' });
    return;
  }
  const emptyIdx = item.sockets.findIndex(s => s === null);
  if (emptyIdx === -1) {
    socket.emit('notification', { text: 'No empty sockets', type: 'error' });
    return;
  }

  // Find gem in inventory
  const gem = inv.getItem(data.gemId);
  if (!gem || gem.type !== 'gem') {
    socket.emit('notification', { text: 'Gem not found in inventory', type: 'error' });
    return;
  }

  // Socket the gem: put gem data into socket slot, remove gem from inventory
  item.sockets[emptyIdx] = {
    id: gem.id,
    name: gem.name,
    gemType: gem.gemType,
    gemTier: gem.gemTier,
    bonuses: { ...gem.bonuses },
    color: gem.color,
  };
  inv.removeItem(gem.id);

  // Recalc player stats if item is equipped
  if (itemLocation === 'equipped') {
    player.recalcEquipBonuses();
  }

  socket.emit('inventory:update', inv.serialize());
  socket.emit('notification', { text: `Socketed ${gem.name} into ${item.name}`, type: 'info' });
};

exports.handleGemUnsocket = (socket, data, { players, inventories }) => {
  const player = players.get(socket.id);
  if (!player) return;
  const inv = inventories.get(player.id);
  if (!inv) return;

  // Validate input
  if (!data || typeof data.itemId !== 'string' || typeof data.socketIndex !== 'number') {
    socket.emit('notification', { text: 'Invalid unsocket request', type: 'error' });
    return;
  }

  // Find the target item (equipped or inventory)
  let item = null;
  let itemLocation = null;

  for (const [slot, equip] of Object.entries(player.equipment)) {
    if (equip && equip.id === data.itemId) {
      item = equip;
      itemLocation = 'equipped';
      break;
    }
  }
  if (!item) {
    item = inv.getItem(data.itemId);
    if (item) itemLocation = 'inventory';
  }

  if (!item) {
    socket.emit('notification', { text: 'Item not found', type: 'error' });
    return;
  }

  // Validate socket index
  if (!item.sockets || !Array.isArray(item.sockets) ||
      !Number.isInteger(data.socketIndex) || data.socketIndex < 0 || data.socketIndex >= item.sockets.length) {
    socket.emit('notification', { text: 'Invalid socket index', type: 'error' });
    return;
  }

  const socketedGem = item.sockets[data.socketIndex];
  if (!socketedGem) {
    socket.emit('notification', { text: 'Socket is empty', type: 'error' });
    return;
  }

  // Gold cost: 50 × item level (minimum 50)
  const itemLevel = item.level || item.itemLevel || 1;
  const cost = 50 * itemLevel;
  if (player.gold < cost) {
    socket.emit('notification', { text: `Need ${cost} gold to unsocket`, type: 'error' });
    return;
  }

  // Check inventory space for the returned gem
  if (!inv.findSpace(1, 1)) {
    socket.emit('notification', { text: 'Inventory full!', type: 'error' });
    return;
  }

  // Unsocket: deduct gold, create gem item, clear socket
  player.gold -= cost;

  const { generateGem } = require('./game/gems');
  const returnedGem = generateGem(socketedGem.gemType, socketedGem.gemTier);
  if (returnedGem) {
    inv.addItem(returnedGem);
  }

  item.sockets[data.socketIndex] = null;

  // Recalc if equipped
  if (itemLocation === 'equipped') {
    player.recalcEquipBonuses();
  }

  socket.emit('inventory:update', inv.serialize());
  socket.emit('player:stats', player.serializeForPhone());
  socket.emit('notification', { text: `Unsocketed ${socketedGem.name} (−${cost}g)`, type: 'info' });
};

// ── Gem Combine ──
exports.handleGemCombine = (socket, data, { players, inventories }) => {
  const player = players.get(socket.id);
  if (!player) return;
  const inv = inventories.get(player.id);
  if (!inv) return;

  // Validate: need array of exactly 3 gem IDs
  if (!data || !Array.isArray(data.gemIds) || data.gemIds.length !== 3) {
    socket.emit('notification', { text: 'Select 3 gems to combine', type: 'error' });
    return;
  }

  // Validate all IDs are strings and unique
  if (!data.gemIds.every(id => typeof id === 'string')) {
    socket.emit('notification', { text: 'Invalid gem IDs', type: 'error' });
    return;
  }
  if (new Set(data.gemIds).size !== 3) {
    socket.emit('notification', { text: 'Gem IDs must be unique', type: 'error' });
    return;
  }

  // Find all 3 gems in inventory
  const gems = data.gemIds.map(id => inv.getItem(id));
  if (gems.some(g => !g || g.type !== 'gem')) {
    socket.emit('notification', { text: 'Gems not found in inventory', type: 'error' });
    return;
  }

  // Use combineGems to validate and get result
  const { combineGems } = require('./game/gems');
  const result = combineGems(gems);
  if (!result) {
    socket.emit('notification', { text: 'Gems must be same type and tier (not max)', type: 'error' });
    return;
  }

  // Gold cost: tier 1→2 = 100g, tier 2→3 = 500g
  const cost = gems[0].gemTier === 1 ? 100 : 500;
  if (player.gold < cost) {
    socket.emit('notification', { text: `Need ${cost} gold to combine`, type: 'error' });
    return;
  }

  // Remove the 3 source gems first
  for (const gem of gems) {
    inv.removeItem(gem.id);
  }

  // Deduct gold
  player.gold -= cost;

  // Add the upgraded gem
  const addResult = inv.addItem(result);
  if (!addResult || !addResult.success) {
    // Shouldn't happen since we freed 3 slots, but handle it
    socket.emit('notification', { text: 'Inventory full!', type: 'error' });
    return;
  }

  socket.emit('inventory:update', inv.serialize());
  socket.emit('player:stats', player.serializeForPhone());
  socket.emit('notification', { text: `Combined into ${result.name}! (−${cost}g)`, type: 'info' });
};
