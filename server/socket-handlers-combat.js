/**
 * Combat socket event handlers — extracted from socket-handlers.js
 * Handles: attack, skills, potions, loot pickup, loot filter, chest open.
 */

// ── Attack ──
exports.handleAttack = (socket, data, { players, world, combat }) => {
  const player = players.get(socket.id);
  if (!player || !player.alive || player.isDying) return;
  const allPlayers = Array.from(players.values());
  combat.playerAttack(player, world.monsters, allPlayers);
};

// ── Skills ──
exports.handleSkill = (socket, data, { players, world, combat }) => {
  const player = players.get(socket.id);
  if (!player || !player.alive || player.isDying) return;
  const idx = parseInt(data.skillIndex, 10);
  if (isNaN(idx) || idx < 0 || idx >= player.skills.length) return;
  const allPlayers = Array.from(players.values());
  combat.playerSkill(player, idx, world.monsters, allPlayers);
};

// ── Potions ──
exports.handleUsePotion = (socket, data, { players }) => {
  const player = players.get(socket.id);
  if (!player || !player.alive || player.isDying) return;

  let used = false;
  if (data.type === 'health') {
    used = player.useHealthPotion();
  } else if (data.type === 'mana') {
    used = player.useManaPotion();
  }

  if (used) {
    socket.emit('notification', { text: `Used ${data.type} potion`, type: 'info' });
    socket.emit('stats:update', player.serializeForPhone());
  } else {
    socket.emit('notification', { text: `No ${data.type} potions or already full`, type: 'warning' });
  }
};

// ── Loot Pickup ──
exports.handleLootPickup = (socket, data, { players, inventories, world, gameNs }) => {
  const player = players.get(socket.id);
  if (!player || !player.alive || player.isDying) return;

  const item = world.pickupItem(data.itemId, player.x, player.y);
  if (!item) {
    socket.emit('notification', { text: 'Too far or item gone', type: 'warning' });
    return;
  }

  // Gold goes directly
  if (item.type === 'currency') {
    player.gold += item.quantity;
    const goldChanged = player.questManager.check('collect_gold', { amount: item.quantity });
    if (goldChanged.length > 0) {
      socket.emit('quest:update', player.questManager.getActiveQuests());
      for (const cq of goldChanged) {
        if (cq.completed) gameNs.emit('quest:complete', { playerId: player.id, playerName: player.name, title: cq.title });
      }
    }
    socket.emit('notification', { text: `+${item.quantity} gold`, type: 'gold' });
    socket.emit('stats:update', player.serializeForPhone());
    return;
  }

  // Potions add to player count
  if (item.subType === 'health_potion') {
    player.healthPotions += item.quantity;
    socket.emit('notification', { text: `+${item.quantity} Health Potion`, type: 'info' });
    socket.emit('stats:update', player.serializeForPhone());
    return;
  }
  if (item.subType === 'mana_potion') {
    player.manaPotions += item.quantity;
    socket.emit('notification', { text: `+${item.quantity} Mana Potion`, type: 'info' });
    socket.emit('stats:update', player.serializeForPhone());
    return;
  }

  // Equipment goes to inventory
  const inv = inventories.get(player.id);
  if (!inv) return;

  const result = inv.addItem(item);
  if (result.success) {
    socket.emit('notification', { text: `Picked up ${item.name}`, type: item.rarity });
    socket.emit('inventory:update', inv.serialize());
  } else {
    world.addGroundItem(item, player.x, player.y);
    socket.emit('notification', { text: 'Inventory full!', type: 'error' });
  }
};

// ── Pickup nearest ──
exports.handleLootPickupNearest = (socket, data, { players, inventories, world, gameNs, io }) => {
  const player = players.get(socket.id);
  if (!player || !player.alive || player.isDying) return;

  let nearest = null;
  let nearestDist = Infinity;
  for (const gi of world.groundItems) {
    const dx = gi.x - player.x;
    const dy = gi.y - player.y;
    const dist = Math.sqrt(dx * dx + dy * dy);
    if (dist < nearestDist && dist <= 80) {
      nearest = gi;
      nearestDist = dist;
    }
  }

  if (nearest) {
    // Manually trigger pickup logic inline
    const item = world.pickupItem(nearest.item.id, player.x, player.y, 80);
    if (!item) return;

    if (item.type === 'currency') {
      player.gold += item.quantity;
      const goldChanged = player.questManager.check('collect_gold', { amount: item.quantity });
      if (goldChanged.length > 0) {
        socket.emit('quest:update', player.questManager.getActiveQuests());
        for (const cq of goldChanged) {
          if (cq.completed) gameNs.emit('quest:complete', { playerId: player.id, playerName: player.name, title: cq.title });
        }
      }
      socket.emit('notification', { text: `+${item.quantity} gold`, type: 'gold' });
      socket.emit('stats:update', player.serializeForPhone());
      return;
    }

    if (item.subType === 'health_potion') {
      player.healthPotions += item.quantity;
      socket.emit('notification', { text: `+${item.quantity} Health Potion`, type: 'info' });
      socket.emit('stats:update', player.serializeForPhone());
      return;
    }
    if (item.subType === 'mana_potion') {
      player.manaPotions += item.quantity;
      socket.emit('notification', { text: `+${item.quantity} Mana Potion`, type: 'info' });
      socket.emit('stats:update', player.serializeForPhone());
      return;
    }

    const inv = inventories.get(player.id);
    if (!inv) return;

    const result = inv.addItem(item);
    if (result.success) {
      socket.emit('notification', { text: `Picked up ${item.name}`, type: item.rarity });
      socket.emit('inventory:update', inv.serialize());
    } else {
      world.addGroundItem(item, player.x, player.y);
      socket.emit('notification', { text: 'Inventory full!', type: 'error' });
    }
  }

  // Also check for loot chests
  if (!nearest && world.lootChests) {
    for (const chest of world.lootChests) {
      if (chest.opened) continue;
      const dx = player.x - chest.x;
      const dy = player.y - chest.y;
      if (Math.sqrt(dx * dx + dy * dy) <= 80) {
        // Open the chest using the existing handler
        exports.handleChestOpen(socket, { chestId: chest.id }, { players, inventories, world, gameNs, io });
        break;
      }
    }
  }
};

// ── Chest Open ──
exports.handleChestOpen = (socket, data, { players, world, gameNs, io }) => {
  if (!data || typeof data.chestId !== 'string') return;
  const player = players.get(socket.id);
  if (!player || !player.alive) return;

  if (!world.lootChests) return;
  const chest = world.lootChests.find(c => c.id === data.chestId && !c.opened);
  if (!chest) return;

  // Proximity check
  const dx = player.x - chest.x;
  const dy = player.y - chest.y;
  if (Math.sqrt(dx * dx + dy * dy) > 80) return;

  chest.opened = true;

  // Grant gold to all players
  const controllerNs = io.of('/controller');
  const goldShare = Math.floor(chest.gold / players.size);
  for (const [sid, p] of players) {
    p.gold += goldShare;
    const sock = controllerNs.sockets.get(sid);
    if (sock) {
      sock.emit('notification', { text: `+${goldShare}g from chest!`, type: 'gold' });
      sock.emit('stats:update', p.serializeForPhone());
    }
  }

  // Drop items on ground
  for (const item of chest.items) {
    world.addGroundItem(item, chest.x + (Math.random() - 0.5) * 40, chest.y + (Math.random() - 0.5) * 40);
  }

  // Emit chest open to TV
  gameNs.emit('chest:opened', { id: chest.id, x: chest.x, y: chest.y, gold: chest.gold });
};

// ── Loot Filter ──
const VALID_LOOT_FILTERS = ['off', 'basic', 'smart'];

exports.handleLootFilter = (socket, data, { players }) => {
  const player = players.get(socket.id);
  if (!player) return;

  if (!data || !VALID_LOOT_FILTERS.includes(data.mode)) {
    socket.emit('notification', { text: 'Invalid filter mode', type: 'error' });
    return;
  }

  player.lootFilter = data.mode;
  socket.emit('player:stats', player.serializeForPhone());
  socket.emit('notification', { text: `Loot filter: ${data.mode.toUpperCase()}`, type: 'info' });
};
