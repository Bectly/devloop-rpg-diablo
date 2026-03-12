/**
 * Socket event handlers extracted from index.js
 * Each handler receives (socket, data, ctx) where ctx contains shared game state.
 */

const { Inventory } = require('./game/inventory');
const { generateConsumable, generateWeapon, generateArmor } = require('./game/items');
const { getSellPrice } = require('./game/shop');
const { TILE_SIZE } = require('./game/world');
const uuid = require('uuid');

// Two-player dialogue vote state: npcId → { votes: Map(socketId → choiceIdx), timeout: null }
const dialogueVotes = new Map();

// Grace period map for disconnected players: name → { player, inventory, socketId, timer }
const disconnectedPlayers = new Map();
const GRACE_PERIOD_MS = 30000; // 30 seconds

function _resolveDialogue(socket, data, { players, world, story, gameNs, io }) {
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
      gameNs.emit('dialogue:start', { npcId: nextDialogue.npcId, npcName: nextDialogue.npcName, text: nextDialogue.text });
    }
  } else {
    socket.emit('dialogue:end', { npcId: data.npcId });
    gameNs.emit('dialogue:end', { npcId: data.npcId });
  }
}

// ── Join Game ──
exports.handleJoin = (socket, data, { players, inventories, controllerSockets, world, gameNs, gameDb }) => {
  const name = (data.name || 'Hero').substring(0, 20);

  // ── Reconnect: check grace period map first ──
  if (disconnectedPlayers.has(name)) {
    const entry = disconnectedPlayers.get(name);
    clearTimeout(entry.timer);
    disconnectedPlayers.delete(name);

    const player = entry.player;
    const inv = entry.inventory;

    // Remove old socket.id entry from players Map
    players.delete(entry.socketId);

    // Re-map to new socket
    player.disconnected = false;
    player.inputDx = 0;
    player.inputDy = 0;
    players.set(socket.id, player);
    inventories.set(player.id, inv);
    controllerSockets.set(socket.id, player.id);

    console.log(`[Game] ${name} reconnected (grace period). Players: ${players.size}`);

    // Confirm to phone
    socket.emit('joined', {
      playerId: player.id,
      stats: player.serializeForPhone(),
      inventory: inv.serialize(),
      floor: world.currentFloor,
      floorName: world.floorName,
      quests: player.questManager.getActiveQuests(),
    });

    socket.emit('stats:update', player.serializeForPhone());
    socket.emit('inventory:update', inv.serialize());

    // Notify TV that this player is back (not a new join — reconnect)
    gameNs.emit('player:reconnected', {
      id: player.id,
      name: player.name,
      characterClass: player.characterClass,
    });

    socket.emit('notification', {
      text: `Welcome back, ${name}!`,
      type: 'quest',
    });
    return;
  }

  // Count only active (non-disconnected) players toward the 2-player cap
  const activePlayers = Array.from(players.values()).filter(p => !p.disconnected).length;
  if (activePlayers >= 2) {
    socket.emit('notification', { text: 'Game is full (max 2 players)', type: 'error' });
    return;
  }

  const { Player } = require('./game/player');
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

  // Check DB for saved character
  let restored = false;
  if (gameDb) {
    try {
      const saved = gameDb.loadCharacter(name);
      if (saved) {
        player.restoreFrom(saved);

        // Restore inventory items from saved data
        if (saved.inventory && Array.isArray(saved.inventory)) {
          for (const item of saved.inventory) {
            inv.addItem(item);
          }
        }

        restored = true;
        console.log(`[DB] Restored ${name} — level ${saved.level}, ${saved.gold}g, floor ${saved.floor}`);
      }
    } catch (err) {
      console.error(`[DB] Failed to load ${name}:`, err.message);
    }
  }

  // Give starting items only if new character
  if (!restored) {
    const startPotion = generateConsumable('health_potion', 3);
    if (startPotion) inv.addItem(startPotion);
  }

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

  socket.emit('notification', {
    text: restored ? `Welcome back, ${name}! Character loaded.` : `Welcome, ${name}!`,
    type: restored ? 'quest' : 'info',
  });
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

exports.handleDialogueChoose = (socket, data, { players, world, story, gameNs, io }) => {
  const player = players.get(socket.id);
  if (!player) return;

  const totalPlayers = players.size;
  const npcId = data.npcId;
  const ctx = { players, world, story, gameNs, io };

  // Single-player: resolve immediately
  if (totalPlayers === 1) {
    return _resolveDialogue(socket, data, ctx);
  }

  // Two-player: collect votes
  if (!dialogueVotes.has(npcId)) {
    dialogueVotes.set(npcId, { votes: new Map(), timeout: null, firstSocket: socket });
  }

  const voteState = dialogueVotes.get(npcId);
  voteState.votes.set(socket.id, data.choiceIndex);

  const votedNames = [...voteState.votes.keys()]
    .map(sid => players.get(sid)?.name)
    .filter(Boolean);
  const syncPayload = { votedPlayers: votedNames, totalPlayers, timeout: 10 };

  if (voteState.votes.size >= totalPlayers) {
    // All voted — majority wins, tie → first voter's choice
    clearTimeout(voteState.timeout);
    dialogueVotes.delete(npcId);
    const tally = new Map();
    for (const [, choice] of voteState.votes) tally.set(choice, (tally.get(choice) || 0) + 1);
    const winningChoice = [...tally.entries()].reduce((a, b) => b[1] > a[1] ? b : a)[0];
    const resolvedPayload = { ...syncPayload, resolved: true };
    for (const sid of players.keys()) {
      const s = io.sockets.sockets.get(sid);
      if (s) s.emit('dialogue:sync', resolvedPayload);
    }
    _resolveDialogue(voteState.firstSocket, { ...data, choiceIndex: winningChoice }, ctx);
  } else {
    // First vote — notify all phones and start timeout
    for (const sid of players.keys()) {
      const s = io.sockets.sockets.get(sid);
      if (s) s.emit('dialogue:sync', syncPayload);
    }

    voteState.timeout = setTimeout(() => {
      if (!dialogueVotes.has(npcId)) return;
      dialogueVotes.delete(npcId);
      // Timeout: first voter's choice wins
      const [, firstChoice] = [...voteState.votes.entries()][0];
      for (const sid of players.keys()) {
        const s = io.sockets.sockets.get(sid);
        if (s) s.emit('dialogue:sync', { ...syncPayload, resolved: true, timedOut: true });
      }
      _resolveDialogue(voteState.firstSocket, { ...data, choiceIndex: firstChoice }, ctx);
    }, 10000);
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

// ── Disconnect ──
exports.handleDisconnect = (socket, data, { players, inventories, controllerSockets, gameNs, gameDb, world }) => {
  const player = players.get(socket.id);
  if (player) {
    // Save character to DB immediately (include current floor)
    if (gameDb) {
      try {
        const inv = inventories.get(player.id);
        const currentFloor = world ? world.currentFloor : 0;
        gameDb.saveCharacter(player, inv, currentFloor);
        console.log(`[DB] Saved ${player.name} on disconnect (floor ${currentFloor})`);
      } catch (err) {
        console.error(`[DB] Failed to save ${player.name} on disconnect:`, err.message);
      }
    }

    // Mark as disconnected — player stays in game world during grace period
    player.disconnected = true;
    player.inputDx = 0;
    player.inputDy = 0;

    // Move to grace period map
    const inv = inventories.get(player.id);
    const timer = setTimeout(() => {
      // Grace period expired — actually remove the player
      disconnectedPlayers.delete(player.name);
      inventories.delete(player.id);
      players.delete(socket.id);
      controllerSockets.delete(socket.id);
      console.log(`[Game] ${player.name} grace period expired — removed`);
      gameNs.emit('player:left', { id: player.id, name: player.name });
    }, GRACE_PERIOD_MS);

    disconnectedPlayers.set(player.name, {
      player,
      inventory: inv,
      socketId: socket.id,
      timer,
    });

    // Remove from active socket maps but keep in players Map
    // so the game loop still processes this player (takes damage, stays visible)
    // We do NOT delete from players or inventories yet.
    controllerSockets.delete(socket.id);

    console.log(`[Game] ${player.name} disconnected — 30s grace period started`);
    // Do NOT emit player:left — player stays visible on TV as a ghost
  }
  console.log(`[Phone] Disconnected: ${socket.id}`);
};

// ── Exports for external access ──
exports.disconnectedPlayers = disconnectedPlayers;
