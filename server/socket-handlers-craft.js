/**
 * Crafting socket event handlers — extracted from socket-handlers.js
 */

const {
  getSalvageResult, generateMaterial, reforgeItem, getReforgeCost,
  upgradeItem, getUpgradeCost, getCraftingInfo, canAfford,
  removeMaterials, isSalvageable, countMaterials,
} = require('./game/crafting');

// ── Crafting: pending reforges ──
// socketId → { originalItem, reforgedItem, itemId }
const pendingReforges = new Map();

// ── Crafting: Info ──
exports.handleCraftInfo = (socket, data, { players, inventories }) => {
  const player = players.get(socket.id);
  if (!player || !player.alive || player.isDying) return;
  if (!data || typeof data.itemId !== 'string') return;
  const inv = inventories.get(player.id);
  if (!inv) return;
  const item = inv.getItem(data.itemId);
  if (!item) return;
  const info = getCraftingInfo(item);
  info.materials = countMaterials(inv);
  info.playerGold = player.gold;
  socket.emit('craft:info', info);
};

// ── Crafting: Salvage ──
exports.handleCraftSalvage = (socket, data, { players, inventories }) => {
  const player = players.get(socket.id);
  if (!player || !player.alive || player.isDying) return;
  if (!data || typeof data.itemId !== 'string') return;
  const inv = inventories.get(player.id);
  if (!inv) return;
  const item = inv.getItem(data.itemId);
  if (!item) return;
  if (!isSalvageable(item)) {
    socket.emit('notification', { text: 'Cannot salvage this item!', type: 'error' });
    return;
  }
  // Prevent salvaging equipped items
  for (const slot of Object.keys(player.equipment)) {
    if (player.equipment[slot] && player.equipment[slot].id === item.id) {
      socket.emit('notification', { text: 'Unequip item first!', type: 'error' });
      return;
    }
  }

  const result = getSalvageResult(item);
  if (!result) return;

  // Remove item from inventory
  inv.removeItem(data.itemId);

  // Add gold
  player.gold += result.gold;

  // Add materials to inventory
  const addedMaterials = [];
  for (const [matType, qty] of Object.entries(result.materials)) {
    // Try to stack with existing material stacks first
    const existing = inv.getAllItems().find(i => i.type === 'material' && i.subType === matType && i.quantity < i.maxStack);
    if (existing) {
      const canAdd = Math.min(qty, existing.maxStack - existing.quantity);
      existing.quantity += canAdd;
      const leftover = qty - canAdd;
      if (leftover > 0) {
        const mat = generateMaterial(matType, leftover);
        if (mat) inv.addItem(mat);
      }
    } else {
      const mat = generateMaterial(matType, qty);
      if (mat) inv.addItem(mat);
    }
    addedMaterials.push(`${qty} ${matType.replace(/_/g, ' ')}`);
  }

  socket.emit('notification', {
    text: `Salvaged ${item.name}: +${result.gold}g, ${addedMaterials.join(', ')}`,
    type: 'craft',
  });
  socket.emit('stats:update', player.serializeForPhone());
  socket.emit('inventory:update', inv.serialize());
};

// ── Crafting: Reforge (start) ──
exports.handleCraftReforge = (socket, data, { players, inventories }) => {
  const player = players.get(socket.id);
  if (!player || !player.alive || player.isDying) return;
  if (!data || typeof data.itemId !== 'string') return;
  const inv = inventories.get(player.id);
  if (!inv) return;
  const item = inv.getItem(data.itemId);
  if (!item) return;
  if (!isSalvageable(item) || !item.bonuses || Object.keys(item.bonuses).length === 0) {
    socket.emit('notification', { text: 'Cannot reforge this item!', type: 'error' });
    return;
  }

  const cost = getReforgeCost(item);
  if (!canAfford(player, inv, cost)) {
    socket.emit('notification', { text: 'Not enough materials or gold!', type: 'error' });
    return;
  }

  // Generate reforged version BEFORE deducting cost (avoid losing resources on failure)
  const reforged = reforgeItem(item);
  if (!reforged) {
    socket.emit('notification', { text: 'Reforge failed!', type: 'error' });
    return;
  }

  // Deduct cost
  player.gold -= cost.gold;
  removeMaterials(inv, cost);

  // Store pending — player must accept or reject
  pendingReforges.set(socket.id, {
    originalItem: item,
    reforgedItem: reforged,
    itemId: data.itemId,
  });

  socket.emit('craft:reforge_result', {
    original: { bonuses: item.bonuses },
    reforged: { bonuses: reforged.bonuses },
    itemId: data.itemId,
  });
  socket.emit('stats:update', player.serializeForPhone());
  socket.emit('inventory:update', inv.serialize());
};

// ── Crafting: Reforge Accept/Reject ──
exports.handleCraftReforgeAccept = (socket, data, { players, inventories }) => {
  const player = players.get(socket.id);
  if (!player) return;
  const inv = inventories.get(player.id);
  if (!inv) return;

  const pending = pendingReforges.get(socket.id);
  if (!pending) {
    socket.emit('notification', { text: 'No pending reforge!', type: 'error' });
    return;
  }
  pendingReforges.delete(socket.id);

  const accept = data && data.accept === true;

  if (accept) {
    // Replace item in inventory with reforged version
    const item = inv.getItem(pending.itemId);
    if (item) {
      // Copy reforged bonuses onto the existing item
      item.bonuses = pending.reforgedItem.bonuses;
      item.reforgeCount = (item.reforgeCount || 0) + 1;

      // If equipped, recalc
      for (const slot of Object.keys(player.equipment)) {
        if (player.equipment[slot] && player.equipment[slot].id === item.id) {
          player.recalcEquipBonuses();
          break;
        }
      }
    }
    socket.emit('notification', { text: 'Reforge accepted!', type: 'craft' });
  } else {
    socket.emit('notification', { text: 'Reforge rejected — kept original.', type: 'info' });
  }

  socket.emit('stats:update', player.serializeForPhone());
  socket.emit('inventory:update', inv.serialize());
};

// ── Crafting: Upgrade ──
exports.handleCraftUpgrade = (socket, data, { players, inventories }) => {
  const player = players.get(socket.id);
  if (!player || !player.alive || player.isDying) return;
  if (!data || typeof data.itemId !== 'string') return;
  const inv = inventories.get(player.id);
  if (!inv) return;
  const item = inv.getItem(data.itemId);
  if (!item) return;

  const cost = getUpgradeCost(item);
  if (!cost) {
    socket.emit('notification', { text: 'Item already at max upgrade!', type: 'error' });
    return;
  }
  if (!canAfford(player, inv, cost)) {
    socket.emit('notification', { text: 'Not enough materials or gold!', type: 'error' });
    return;
  }

  // Deduct cost
  player.gold -= cost.gold;
  removeMaterials(inv, cost);

  // Apply upgrade
  const upgraded = upgradeItem(item);
  if (!upgraded) {
    socket.emit('notification', { text: 'Upgrade failed!', type: 'error' });
    return;
  }

  // Copy upgraded properties onto item in-place (same uuid, same inventory slot)
  item.name = upgraded.name;
  item.upgradeLevel = upgraded.upgradeLevel;
  if (upgraded.damage !== undefined) item.damage = upgraded.damage;
  if (upgraded.armor !== undefined) item.armor = upgraded.armor;
  if (upgraded.bonuses) item.bonuses = upgraded.bonuses;

  // If equipped, recalc
  for (const slot of Object.keys(player.equipment)) {
    if (player.equipment[slot] && player.equipment[slot].id === item.id) {
      player.recalcEquipBonuses();
      break;
    }
  }

  socket.emit('notification', {
    text: `Upgraded ${item.name} to +${item.upgradeLevel}!`,
    type: 'craft',
  });
  socket.emit('stats:update', player.serializeForPhone());
  socket.emit('inventory:update', inv.serialize());
};

exports.pendingReforges = pendingReforges;
