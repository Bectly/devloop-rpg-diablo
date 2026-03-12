/**
 * Socket event handlers extracted from index.js
 * Each handler receives (socket, data, ctx) where ctx contains shared game state.
 */

const { Inventory } = require('./game/inventory');
const { generateConsumable } = require('./game/items');
const { getSellPrice } = require('./game/shop');
const { TILE_SIZE } = require('./game/world');
const uuid = require('uuid');

// ── Join Game ──
exports.handleJoin = (socket, data, { players, inventories, controllerSockets, world, gameNs }) => {
  if (players.size >= 2) {
    socket.emit('notification', { text: 'Game is full (max 2 players)', type: 'error' });
    return;
  }

  const { Player } = require('./game/player');
  const name = (data.name || 'Hero').substring(0, 20);
  const characterClass = ['warrior', 'ranger', 'mage'].includes(data.characterClass)
    ? data.characterClass
    : 'warrior';

  const player = new Player(name, characterClass);

  // Spawn at dungeon start room
  const spawnPos = world.getSpawnPosition(players.size);
  player.x = spawnPos.x;
  player.y = spawnPos.y;
  player.setRespawnPoint(spawnPos.x, spawnPos.y);

  // Create inventory
  const inv = new Inventory();

  // Give starting items
  const startPotion = generateConsumable('health_potion', 3);
  if (startPotion) inv.addItem(startPotion);

  players.set(socket.id, player);
  inventories.set(player.id, inv);
  controllerSockets.set(socket.id, player.id);

  // Generate initial quests for this floor
  player.questManager.generateForFloor(world.currentFloor);

  console.log(`[Game] ${name} (${characterClass}) joined. Players: ${players.size}`);

  // Confirm to phone
  socket.emit('joined', {
    playerId: player.id,
    stats: player.serializeForPhone(),
    inventory: inv.serialize(),
    floor: world.currentFloor,
    floorName: world.floorName,
    quests: player.questManager.getActiveQuests(),
  });

  // Notify TV
  gameNs.emit('player:joined', {
    id: player.id,
    name: player.name,
    characterClass: player.characterClass,
  });

  socket.emit('notification', { text: `Welcome, ${name}!`, type: 'info' });
};

// ── Movement ──
exports.handleMove = (socket, data, { players }) => {
  const player = players.get(socket.id);
  if (!player || !player.alive || player.isDying) return;

  player.inputDx = Math.max(-1, Math.min(1, data.dx || 0));
  player.inputDy = Math.max(-1, Math.min(1, data.dy || 0));
};

exports.handleMoveStop = (socket, data, { players }) => {
  const player = players.get(socket.id);
  if (!player) return;
  player.inputDx = 0;
  player.inputDy = 0;
};

// ── Attack ──
exports.handleAttack = (socket, data, { players, world, combat }) => {
  const player = players.get(socket.id);
  if (!player || !player.alive || player.isDying) return;
  combat.playerAttack(player, world.monsters);
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
exports.handleLootPickupNearest = (socket, data, { players, inventories, world, gameNs }) => {
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
};

// ── Inventory Management ──
exports.handleInventoryMove = (socket, data, { players, inventories }) => {
  const player = players.get(socket.id);
  if (!player) return;
  const inv = inventories.get(player.id);
  if (!inv) return;
  inv.moveItem(data.itemId, data.toCol, data.toRow);
  socket.emit('inventory:update', inv.serialize());
};

exports.handleInventoryEquip = (socket, data, { players, inventories }) => {
  const player = players.get(socket.id);
  if (!player) return;
  const inv = inventories.get(player.id);
  if (!inv) return;
  if (!data.itemId || typeof data.itemId !== 'string') return;

  const item = inv.getItem(data.itemId);
  if (!item || !item.slot) return;

  let slot = item.slot;
  if (item.subType === 'ring') {
    slot = player.equipment.ring1 ? 'ring2' : 'ring1';
  }

  const current = player.equipment[slot];
  if (current) {
    const result = inv.addItem(current);
    if (!result.success) {
      socket.emit('notification', { text: 'No room to swap', type: 'error' });
      return;
    }
  }

  inv.removeItem(item.id);
  player.equipment[slot] = item;
  player.recalcEquipBonuses();

  socket.emit('inventory:update', inv.serialize());
  socket.emit('stats:update', player.serializeForPhone());
  socket.emit('notification', { text: `Equipped ${item.name}`, type: 'info' });
};

exports.handleInventoryUnequip = (socket, data, { players, inventories }) => {
  const player = players.get(socket.id);
  if (!player) return;
  const inv = inventories.get(player.id);
  if (!inv) return;

  const validSlots = ['helmet', 'chest', 'gloves', 'boots', 'weapon', 'shield', 'ring1', 'ring2', 'amulet'];
  if (!validSlots.includes(data.slot)) return;

  const item = player.equipment[data.slot];
  if (!item) return;

  const result = inv.addItem(item);
  if (!result.success) {
    socket.emit('notification', { text: 'Inventory full', type: 'error' });
    return;
  }

  player.equipment[data.slot] = null;
  player.recalcEquipBonuses();

  socket.emit('inventory:update', inv.serialize());
  socket.emit('stats:update', player.serializeForPhone());
};

exports.handleInventoryDrop = (socket, data, { players, inventories, world }) => {
  const player = players.get(socket.id);
  if (!player) return;
  const inv = inventories.get(player.id);
  if (!inv) return;

  const item = inv.removeItem(data.itemId);
  if (item) {
    world.addGroundItem(item, player.x, player.y);
    socket.emit('inventory:update', inv.serialize());
  }
};

// ── Interact (NPC / Shop / Shrine) ──
exports.handleInteract = (socket, data, { players, world, story, gameNs }) => {
  const player = players.get(socket.id);
  if (!player || !player.alive || player.isDying) return;

  // Check shop NPC first
  const shopNpc = world.getShopNpc();
  if (shopNpc) {
    const shopDist = Math.hypot(player.x - shopNpc.x, player.y - shopNpc.y);
    if (shopDist < 80) {
      socket.emit('shop:inventory', {
        items: shopNpc.inventory,
        playerGold: player.gold,
      });
      return;
    }
  }

  // Check healing shrine
  const room = world.getRoomAtPosition(player.x, player.y);
  if (room && room.hasShrine && !room.shrineUsed) {
    room.shrineUsed = true;
    player.hp = player.maxHp;
    player.mp = player.maxMp;
    const shrineChanged = player.questManager.check('use_shrine', {});
    if (shrineChanged.length > 0) {
      socket.emit('quest:update', player.questManager.getActiveQuests());
      for (const cq of shrineChanged) {
        if (cq.completed) gameNs.emit('quest:complete', { playerId: player.id, playerName: player.name, title: cq.title });
      }
    }
    socket.emit('notification', { text: 'Healing Shrine! Full HP & MP restored!', type: 'quest' });
    socket.emit('stats:update', player.serializeForPhone());
    gameNs.emit('shrine:used', {
      roomId: room.id,
      x: (room.x + room.w / 2) * TILE_SIZE,
      y: (room.y + room.h / 2) * TILE_SIZE,
    });
    return;
  }

  // Check story NPCs
  const storyData = story.serialize();
  for (const npc of storyData.npcs) {
    const dx = npc.x - player.x;
    const dy = npc.y - player.y;
    const dist = Math.sqrt(dx * dx + dy * dy);
    if (dist < 80) {
      const dialogue = story.getNpcDialogue(npc.id, 'intro');
      if (dialogue) {
        socket.emit('dialogue:prompt', dialogue);
        gameNs.emit('dialogue:start', { npcId: npc.id, npcName: npc.name, text: dialogue.text });
      }
      return;
    }
  }
};

exports.handleDialogueChoose = (socket, data, { players, world, story, gameNs }) => {
  const player = players.get(socket.id);
  if (!player) return;

  const result = story.processDialogueChoice(data.npcId, data.dialogueKey || 'intro', data.choiceIndex);

  for (const action of result.actions) {
    if (action.type === 'start_quest') {
      const quest = story.startQuest(action.questId);
      if (quest) {
        socket.emit('notification', { text: `Quest started: ${quest.name}`, type: 'quest' });
      }
    } else if (action.type === 'give_items') {
      if (action.itemType === 'health_potion') {
        player.healthPotions += action.count;
        socket.emit('notification', { text: `Received ${action.count} Health Potions`, type: 'info' });
      }
    } else if (action.type === 'open_shop') {
      // Trigger shop open via the shop NPC
      const shopNpc = world.getShopNpc();
      if (shopNpc) {
        socket.emit('shop:inventory', {
          items: shopNpc.inventory,
          playerGold: player.gold,
        });
      }
    }
  }

  if (result.next) {
    const nextDialogue = story.getNpcDialogue(data.npcId, result.next);
    if (nextDialogue) {
      socket.emit('dialogue:prompt', nextDialogue);
    }
  } else {
    gameNs.emit('dialogue:end', { npcId: data.npcId });
  }
};

// ── Level Up Stat Allocation ──
exports.handleLevelupStat = (socket, data, { players }) => {
  const player = players.get(socket.id);
  if (!player) return;

  const validStats = ['str', 'dex', 'int', 'vit'];
  if (!validStats.includes(data.stat)) return;

  if (player.allocateStat(data.stat)) {
    socket.emit('stats:update', player.serializeForPhone());
    socket.emit('notification', { text: `+1 ${data.stat.toUpperCase()}`, type: 'info' });
  }
};

// ── Request Inventory ──
exports.handleInventoryRequest = (socket, data, { players, inventories }) => {
  const player = players.get(socket.id);
  if (!player) return;
  const inv = inventories.get(player.id);
  if (!inv) return;
  socket.emit('inventory:update', inv.serialize());
  socket.emit('stats:update', player.serializeForPhone());
};

// ── Shop: Open ──
exports.handleShopOpen = (socket, data, { players, world }) => {
  const player = players.get(socket.id);
  if (!player || !player.alive || player.isDying) return;
  const shopNpc = world.getShopNpc();
  if (!shopNpc) return;
  const dist = Math.hypot(player.x - shopNpc.x, player.y - shopNpc.y);
  if (dist > 80) return;
  socket.emit('shop:inventory', {
    items: shopNpc.inventory,
    playerGold: player.gold,
  });
};

// ── Shop: Buy ──
exports.handleShopBuy = (socket, data, { players, inventories, world, gameNs }) => {
  const player = players.get(socket.id);
  if (!player || !player.alive || player.isDying) return;
  const shopNpc = world.getShopNpc();
  if (!shopNpc) return;
  if (!data || typeof data.itemId !== 'string') return;
  const item = shopNpc.inventory.find(i => i.id === data.itemId);
  if (!item) return;
  if (player.gold < item.shopPrice) {
    socket.emit('notification', { text: 'Not enough gold!', type: 'error' });
    return;
  }
  const inv = inventories.get(player.id);
  if (!inv) return;

  // For consumables (potions), add to player potion count directly
  if (item.subType === 'health_potion') {
    player.gold -= item.shopPrice;
    player.healthPotions += item.quantity;
    const buyChanged = player.questManager.check('buy_item', {});
    if (buyChanged.length > 0) {
      socket.emit('quest:update', player.questManager.getActiveQuests());
      for (const cq of buyChanged) {
        if (cq.completed) gameNs.emit('quest:complete', { playerId: player.id, playerName: player.name, title: cq.title });
      }
    }
    socket.emit('notification', { text: `Bought ${item.name} for ${item.shopPrice}g`, type: 'info' });
    socket.emit('stats:update', player.serializeForPhone());
    // Re-send shop inventory with updated gold
    socket.emit('shop:inventory', { items: shopNpc.inventory, playerGold: player.gold });
    return;
  }
  if (item.subType === 'mana_potion') {
    player.gold -= item.shopPrice;
    player.manaPotions += item.quantity;
    const buyChanged = player.questManager.check('buy_item', {});
    if (buyChanged.length > 0) {
      socket.emit('quest:update', player.questManager.getActiveQuests());
      for (const cq of buyChanged) {
        if (cq.completed) gameNs.emit('quest:complete', { playerId: player.id, playerName: player.name, title: cq.title });
      }
    }
    socket.emit('notification', { text: `Bought ${item.name} for ${item.shopPrice}g`, type: 'info' });
    socket.emit('stats:update', player.serializeForPhone());
    socket.emit('shop:inventory', { items: shopNpc.inventory, playerGold: player.gold });
    return;
  }

  // Equipment: try to add to inventory with a new unique ID
  const boughtItem = { ...item, id: uuid.v4() };
  delete boughtItem.shopPrice;
  const result = inv.addItem(boughtItem);
  if (!result.success) {
    socket.emit('notification', { text: 'Inventory full!', type: 'error' });
    return;
  }
  player.gold -= item.shopPrice;
  const buyChanged = player.questManager.check('buy_item', {});
  if (buyChanged.length > 0) {
    socket.emit('quest:update', player.questManager.getActiveQuests());
    for (const cq of buyChanged) {
      if (cq.completed) gameNs.emit('quest:complete', { playerId: player.id, playerName: player.name, title: cq.title });
    }
  }
  socket.emit('notification', { text: `Bought ${item.name} for ${item.shopPrice}g`, type: item.rarity || 'common' });
  socket.emit('stats:update', player.serializeForPhone());
  socket.emit('inventory:update', inv.serialize());
  socket.emit('shop:inventory', { items: shopNpc.inventory, playerGold: player.gold });
};

// ── Shop: Sell ──
exports.handleShopSell = (socket, data, { players, inventories, world }) => {
  const player = players.get(socket.id);
  if (!player || !player.alive || player.isDying) return;
  if (!data || typeof data.itemId !== 'string') return;
  const inv = inventories.get(player.id);
  if (!inv) return;
  const item = inv.getItem(data.itemId);
  if (!item) return;
  const sellPrice = getSellPrice(item);
  inv.removeItem(data.itemId);
  player.gold += sellPrice;
  socket.emit('notification', { text: `Sold ${item.name} for ${sellPrice}g`, type: 'gold' });
  socket.emit('stats:update', player.serializeForPhone());
  socket.emit('inventory:update', inv.serialize());
  // Re-send shop if still open
  const shopNpc = world.getShopNpc();
  if (shopNpc) {
    socket.emit('shop:inventory', { items: shopNpc.inventory, playerGold: player.gold });
  }
};

// ── Healing Shrine ──
exports.handleShrineUse = (socket, data, { players, world, gameNs }) => {
  const player = players.get(socket.id);
  if (!player || !player.alive || player.isDying) return;
  const room = world.getRoomAtPosition(player.x, player.y);
  if (!room || !room.hasShrine || room.shrineUsed) return;
  room.shrineUsed = true;
  player.hp = player.maxHp;
  player.mp = player.maxMp;
  const shrineChanged = player.questManager.check('use_shrine', {});
  if (shrineChanged.length > 0) {
    socket.emit('quest:update', player.questManager.getActiveQuests());
    for (const cq of shrineChanged) {
      if (cq.completed) gameNs.emit('quest:complete', { playerId: player.id, playerName: player.name, title: cq.title });
    }
  }
  socket.emit('notification', { text: 'Healing Shrine! Full HP & MP restored!', type: 'quest' });
  socket.emit('stats:update', player.serializeForPhone());
  gameNs.emit('shrine:used', {
    roomId: room.id,
    x: (room.x + room.w / 2) * TILE_SIZE,
    y: (room.y + room.h / 2) * TILE_SIZE,
  });
};

// ── Quest Claim ──
exports.handleQuestClaim = (socket, data, { players, inventories, world, gameNs }) => {
  const player = players.get(socket.id);
  if (!player || !player.alive) return;
  if (!data || typeof data.questId !== 'string') return;

  const reward = player.questManager.claimReward(data.questId);
  if (!reward) return;

  // Grant gold
  player.gold += reward.gold;
  socket.emit('notification', { text: `+${reward.gold} gold!`, type: 'gold' });

  // Grant item if present
  if (reward.item) {
    const inv = inventories.get(player.id);
    if (inv) {
      const added = inv.addItem(reward.item);
      if (added.success) {
        socket.emit('notification', { text: `Received ${reward.item.name}!`, type: reward.item.rarity || 'common' });
        socket.emit('inventory:update', inv.serialize());
      } else {
        // Inventory full — drop item on ground at player position
        world.addGroundItem(reward.item, player.x, player.y);
        socket.emit('notification', { text: `Inventory full! ${reward.item.name} dropped on ground.`, type: 'warning' });
      }
    }
  }

  // Notify client the reward was claimed (client listens for quest:claimed)
  socket.emit('quest:claimed', { gold: reward.gold, item: reward.item || null });

  socket.emit('stats:update', player.serializeForPhone());
  socket.emit('quest:update', player.questManager.getActiveQuests());
};

// ── Disconnect ──
exports.handleDisconnect = (socket, data, { players, inventories, controllerSockets, gameNs }) => {
  const player = players.get(socket.id);
  if (player) {
    console.log(`[Game] ${player.name} left`);
    inventories.delete(player.id);
    players.delete(socket.id);
    controllerSockets.delete(socket.id);
    gameNs.emit('player:left', { id: player.id, name: player.name });
  }
  console.log(`[Phone] Disconnected: ${socket.id}`);
};
