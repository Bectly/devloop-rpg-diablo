const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const path = require('path');

const { Player, DEATH_GOLD_DROP_PERCENT } = require('./game/player');
const { World, TILE, TILE_SIZE } = require('./game/world');
const { CombatSystem } = require('./game/combat');
const { Inventory } = require('./game/inventory');
const { StoryManager } = require('./game/story');
const { generateConsumable, generateLoot } = require('./game/items');
const { getSellPrice } = require('./game/shop');
const uuid = require('uuid');

// ─── Server Setup ──────────────────────────────────────────────
const app = express();
const server = http.createServer(app);
const io = new Server(server, {
  cors: { origin: '*' },
  pingInterval: 5000,
  pingTimeout: 10000,
});

const PORT = process.env.PORT || 3000;

// Serve static client files
app.use('/tv', express.static(path.join(__dirname, '..', 'client', 'tv')));
app.use('/phone', express.static(path.join(__dirname, '..', 'client', 'phone')));

// Redirect root to TV
app.get('/', (req, res) => {
  const ua = req.headers['user-agent'] || '';
  const isMobile = /mobile|android|iphone|ipad/i.test(ua);
  res.redirect(isMobile ? '/phone' : '/tv');
});

// ─── Game State ────────────────────────────────────────────────
const players = new Map();       // socketId → Player
const inventories = new Map();   // playerId → Inventory
const controllerSockets = new Map(); // socketId → playerId
const tvSockets = new Set();

const world = new World();
const combat = new CombatSystem();
const story = new StoryManager();

// Generate first dungeon floor
world.generateFloor(0);
console.log(`[World] Loaded floor: ${world.roomName}`);

// ─── Socket.io: TV Namespace ───────────────────────────────────
const gameNs = io.of('/game');

gameNs.on('connection', (socket) => {
  console.log(`[TV] Connected: ${socket.id}`);
  tvSockets.add(socket.id);

  // Send initial state
  socket.emit('init', {
    room: world.serialize(),
    story: story.serialize(),
    players: Array.from(players.values()).map(p => p.serialize()),
    floor: world.currentFloor,
  });

  socket.on('disconnect', () => {
    console.log(`[TV] Disconnected: ${socket.id}`);
    tvSockets.delete(socket.id);
  });
});

// ─── Socket.io: Controller Namespace ───────────────────────────
const controllerNs = io.of('/controller');

controllerNs.on('connection', (socket) => {
  console.log(`[Phone] Connected: ${socket.id}`);

  // ── Join Game ──
  socket.on('join', (data) => {
    if (players.size >= 2) {
      socket.emit('notification', { text: 'Game is full (max 2 players)', type: 'error' });
      return;
    }

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
  });

  // ── Movement ──
  socket.on('move', (data) => {
    const player = players.get(socket.id);
    if (!player || !player.alive || player.isDying) return;

    player.inputDx = Math.max(-1, Math.min(1, data.dx || 0));
    player.inputDy = Math.max(-1, Math.min(1, data.dy || 0));
  });

  socket.on('move:stop', () => {
    const player = players.get(socket.id);
    if (!player) return;
    player.inputDx = 0;
    player.inputDy = 0;
  });

  // ── Attack ──
  socket.on('attack', () => {
    const player = players.get(socket.id);
    if (!player || !player.alive || player.isDying) return;
    combat.playerAttack(player, world.monsters);
  });

  // ── Skills ──
  socket.on('skill', (data) => {
    const player = players.get(socket.id);
    if (!player || !player.alive || player.isDying) return;
    const idx = parseInt(data.skillIndex, 10);
    if (isNaN(idx) || idx < 0 || idx >= player.skills.length) return;
    const allPlayers = Array.from(players.values());
    combat.playerSkill(player, idx, world.monsters, allPlayers);
  });

  // ── Potions ──
  socket.on('use:potion', (data) => {
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
  });

  // ── Loot Pickup ──
  socket.on('loot:pickup', (data) => {
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
  });

  // ── Pickup nearest ──
  socket.on('loot:pickup_nearest', () => {
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
  });

  // ── Inventory Management ──
  socket.on('inventory:move', (data) => {
    const player = players.get(socket.id);
    if (!player) return;
    const inv = inventories.get(player.id);
    if (!inv) return;
    inv.moveItem(data.itemId, data.toCol, data.toRow);
    socket.emit('inventory:update', inv.serialize());
  });

  socket.on('inventory:equip', (data) => {
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
  });

  socket.on('inventory:unequip', (data) => {
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
  });

  socket.on('inventory:drop', (data) => {
    const player = players.get(socket.id);
    if (!player) return;
    const inv = inventories.get(player.id);
    if (!inv) return;

    const item = inv.removeItem(data.itemId);
    if (item) {
      world.addGroundItem(item, player.x, player.y);
      socket.emit('inventory:update', inv.serialize());
    }
  });

  // ── Interact (NPC / Shop / Shrine) ──
  socket.on('interact', () => {
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
  });

  socket.on('dialogue:choose', (data) => {
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
  });

  // ── Level Up Stat Allocation ──
  socket.on('levelup:stat', (data) => {
    const player = players.get(socket.id);
    if (!player) return;

    const validStats = ['str', 'dex', 'int', 'vit'];
    if (!validStats.includes(data.stat)) return;

    if (player.allocateStat(data.stat)) {
      socket.emit('stats:update', player.serializeForPhone());
      socket.emit('notification', { text: `+1 ${data.stat.toUpperCase()}`, type: 'info' });
    }
  });

  // ── Request Inventory ──
  socket.on('inventory:request', () => {
    const player = players.get(socket.id);
    if (!player) return;
    const inv = inventories.get(player.id);
    if (!inv) return;
    socket.emit('inventory:update', inv.serialize());
    socket.emit('stats:update', player.serializeForPhone());
  });

  // ── Shop: Open ──
  socket.on('shop:open', () => {
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
  });

  // ── Shop: Buy ──
  socket.on('shop:buy', (data) => {
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
  });

  // ── Shop: Sell ──
  socket.on('shop:sell', (data) => {
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
  });

  // ── Healing Shrine ──
  socket.on('shrine:use', () => {
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
  });

  // ── Quest Claim ──
  socket.on('quest:claim', (data) => {
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
        }
      }
    }

    socket.emit('stats:update', player.serializeForPhone());
    socket.emit('quest:update', player.questManager.getActiveQuests());
  });

  // ── Disconnect ──
  socket.on('disconnect', () => {
    const player = players.get(socket.id);
    if (player) {
      console.log(`[Game] ${player.name} left`);
      inventories.delete(player.id);
      players.delete(socket.id);
      controllerSockets.delete(socket.id);
      gameNs.emit('player:left', { id: player.id, name: player.name });
    }
    console.log(`[Phone] Disconnected: ${socket.id}`);
  });
});

// ─── Game Loop (20 ticks/sec) ──────────────────────────────────
const TICK_RATE = 20;
const TICK_MS = 1000 / TICK_RATE;
let lastTick = Date.now();

function gameLoop() {
  const now = Date.now();
  const dt = now - lastTick;
  lastTick = now;

  const allPlayers = Array.from(players.values());

  // Update players (handles death timers and respawns)
  for (const player of allPlayers) {
    const result = player.update(dt);
    if (result && result.type === 'player:respawn') {
      // Player respawned, notify
      for (const [sid, p] of players) {
        if (p.id === result.playerId) {
          const socket = controllerNs.sockets.get(sid);
          if (socket) {
            socket.emit('stats:update', p.serializeForPhone());
            socket.emit('notification', { text: 'You have been revived!', type: 'info' });
            socket.emit('player:respawn', { x: result.x, y: result.y });
          }
        }
      }
      gameNs.emit('player:respawn', result);
    }
  }

  // Collision: prevent players from walking through walls
  for (const player of allPlayers) {
    if (!player.alive || player.isDying) continue;
    if (!world.isWalkable(player.x, player.y)) {
      // Push back to previous walkable position
      const tryX = world.isWalkable(player.x - player.inputDx * player.moveSpeed * (dt / 1000), player.y);
      const tryY = world.isWalkable(player.x, player.y - player.inputDy * player.moveSpeed * (dt / 1000));
      if (!tryX) player.x -= player.inputDx * player.moveSpeed * (dt / 1000);
      if (!tryY) player.y -= player.inputDy * player.moveSpeed * (dt / 1000);
      if (!world.isWalkable(player.x, player.y)) {
        // Still in wall, hard reset
        const spawn = world.getSpawnPosition(0);
        player.x = spawn.x;
        player.y = spawn.y;
      }
    }
  }

  // Room discovery and wave spawning
  const roomEvents = world.updateRoomDiscovery(allPlayers);
  for (const ev of roomEvents) {
    if (ev.type === 'room:discovered') {
      gameNs.emit('room:discovered', ev);
      controllerNs.emit('notification', { text: `Discovered: ${ev.roomName}`, type: 'info' });
      if (ev.hasShrine) {
        controllerNs.emit('notification', { text: 'A Healing Shrine glows in this room!', type: 'quest' });
      }
    }
    if (ev.type === 'wave:start') {
      gameNs.emit('wave:start', ev);
      controllerNs.emit('notification', { text: `Wave ${ev.wave}/${ev.totalWaves}!`, type: 'warning' });
    }
  }

  // Check wave completion
  const waveResult = world.checkWaveCompletion();
  if (waveResult) {
    if (waveResult.type === 'wave:start') {
      gameNs.emit('wave:start', waveResult);
      controllerNs.emit('notification', { text: `Wave ${waveResult.wave}/${waveResult.totalWaves}!`, type: 'warning' });
    }
    if (waveResult.type === 'room:cleared') {
      gameNs.emit('room:cleared', waveResult);
      controllerNs.emit('notification', { text: `${waveResult.roomName} cleared!`, type: 'quest' });
      // Quest progress — room cleared
      for (const [pid, p] of players) {
        const changed = p.questManager.check('clear_room', {});
        if (changed.length > 0) {
          const sock = controllerNs.sockets.get(pid);
          if (sock) sock.emit('quest:update', p.questManager.getActiveQuests());
          for (const cq of changed) {
            if (cq.completed) gameNs.emit('quest:complete', { playerId: p.id, playerName: p.name, title: cq.title });
          }
        }
      }
      if (waveResult.exitUnlocked) {
        gameNs.emit('exit:unlocked', {});
        controllerNs.emit('notification', { text: 'Exit unlocked! Find the stairs!', type: 'quest' });
      }
    }
  }

  // Update monsters (AI + combat)
  for (const monster of world.monsters) {
    if (!monster.alive) continue;

    combat.processPoison(monster, dt);

    const aiEvents = monster.update(dt, allPlayers);
    for (const event of aiEvents) {
      if (event.type === 'monster_attack') {
        combat.processMonsterAttack(event, allPlayers);
      }
    }
  }

  // Collect combat events
  const combatEvents = combat.clearEvents();

  // Process combat events
  for (const event of combatEvents) {
    if (event.type === 'combat:death' && !event.playerId) {
      const deadMonster = world.monsters.find(m => m.id === event.entityId);
      if (deadMonster) {
        // Quest tracking
        const questResults = story.updateQuest('kill', deadMonster.type);
        for (const qr of questResults) {
          if (qr.complete) {
            controllerNs.emit('notification', { text: `Quest complete: ${qr.questId}`, type: 'quest' });
            for (const p of allPlayers) {
              p.gainXp(qr.rewards.xp);
              p.gold += qr.rewards.gold || 0;
            }
          }
        }

        // Quest progress — notify all players who participated
        for (const [pid, p] of players) {
          if (!p.alive) continue;
          const changed = p.questManager.check('kill', { type: deadMonster.type, isBoss: deadMonster.isBoss });
          if (changed.length > 0) {
            const sock = controllerNs.sockets.get(pid);
            if (sock) {
              sock.emit('quest:update', p.questManager.getActiveQuests());
              for (const q of changed) {
                if (q.completed) {
                  sock.emit('notification', { text: `Quest complete: ${q.title}!`, type: 'quest' });
                  gameNs.emit('quest:complete', { playerId: p.id, playerName: p.name, title: q.title });
                }
              }
            }
          }
        }

        // Loot drops at death position
        if (event.loot) {
          for (const lootItem of event.loot) {
            world.addGroundItem(lootItem, lootItem.worldX, lootItem.worldY);
          }
        }

        // Slime split mechanic
        const splits = deadMonster.getSplitMonsters();
        if (splits.length > 0) {
          for (const splitMonster of splits) {
            world.monsters.push(splitMonster);
          }
          gameNs.emit('monster:split', {
            parentId: deadMonster.id,
            children: splits.map(s => s.serialize()),
          });
        }
      }
    }

    // Send combat events to phones for feedback
    if (event.type === 'combat:hit' || event.type === 'combat:player_death') {
      for (const [sid, player] of players) {
        if (player.id === event.targetId) {
          const socket = controllerNs.sockets.get(sid);
          if (socket) {
            socket.emit('stats:update', player.serializeForPhone());
            if (event.type === 'combat:hit' && !event.dodged && event.damage > 0) {
              socket.emit('damage:taken', { damage: event.damage });
            }
            if (event.type === 'combat:player_death') {
              // Drop gold on death
              if (player.deathGoldDrop > 0) {
                const goldDrop = generateConsumable('gold', player.deathGoldDrop);
                if (goldDrop) {
                  world.addGroundItem(goldDrop, player.x, player.y);
                }
              }
              socket.emit('notification', { text: 'You died!', type: 'error' });
              socket.emit('player:death', {
                deathTimer: player.deathTimer,
                goldDropped: player.deathGoldDrop,
              });
            }
          }
        }
      }
    }

    if (event.type === 'player:levelup') {
      for (const [sid, player] of players) {
        if (player.id === event.playerId) {
          const socket = controllerNs.sockets.get(sid);
          if (socket) {
            socket.emit('stats:update', player.serializeForPhone());
            socket.emit('notification', { text: `Level up! Now level ${event.level}`, type: 'levelup' });
          }
        }
      }
    }
  }

  // Check if both players are dead simultaneously → restart floor
  const alivePlayers = allPlayers.filter(p => p.alive && !p.isDying);
  const dyingPlayers = allPlayers.filter(p => p.isDying);
  if (allPlayers.length > 0 && alivePlayers.length === 0 && dyingPlayers.length === allPlayers.length) {
    // All players dying at same time — will restart floor on respawn
    // (Already handled by individual respawn timers)
  }

  // Check if player is on exit (floor progression)
  if (!world.exitLocked && !world._advancing) {
    for (const player of allPlayers) {
      if (!player.alive || player.isDying) continue;
      if (world.isPlayerOnExit(player)) {
        world._advancing = true;
        console.log(`[World] ${player.name} reached the exit! Advancing to floor ${world.currentFloor + 2}...`);

        setTimeout(() => {
          const nextFloor = world.currentFloor + 1;
          world.generateFloor(nextFloor);

          // Reposition all players at new spawn
          let i = 0;
          for (const p of allPlayers) {
            const spawn = world.getSpawnPosition(i);
            p.x = spawn.x;
            p.y = spawn.y;
            p.setRespawnPoint(spawn.x, spawn.y);
            if (!p.alive) {
              p.alive = true;
              p.isDying = false;
              p.deathTimer = 0;
              p.hp = Math.floor(p.maxHp * 0.5);
              p.mp = Math.floor(p.maxMp * 0.5);
            }
            i++;
          }

          gameNs.emit('dungeon:enter', {
            room: world.serialize(),
            story: story.serialize(),
            floor: world.currentFloor,
            floorName: world.floorName,
          });

          controllerNs.emit('floor:change', {
            floor: world.currentFloor,
            floorName: world.floorName,
          });
          controllerNs.emit('notification', { text: `Floor ${world.currentFloor + 1}: ${world.floorName}`, type: 'quest' });

          // Quest progress — floor change + generate new quests
          for (const [pid, p] of players) {
            let changed = p.questManager.check('reach_floor', { floor: world.currentFloor });
            const newQuests = p.questManager.generateForFloor(world.currentFloor);
            if (newQuests.length > 0 || changed.length > 0) {
              const sock = controllerNs.sockets.get(pid);
              if (sock) {
                sock.emit('quest:update', p.questManager.getActiveQuests());
                if (newQuests.length > 0) {
                  sock.emit('notification', { text: `${newQuests.length} new quests!`, type: 'quest' });
                }
              }
              for (const cq of changed) {
                if (cq.completed) gameNs.emit('quest:complete', { playerId: p.id, playerName: p.name, title: cq.title });
              }
            }
          }

          // Update phone stats
          for (const [sid, p] of players) {
            const socket = controllerNs.sockets.get(sid);
            if (socket) {
              socket.emit('stats:update', p.serializeForPhone());
            }
          }
        }, 2000);
        break;
      }
    }
  }

  // ── Broadcast state to TV ──
  const state = {
    players: allPlayers.map(p => p.serialize()),
    world: world.serialize(),
    events: combatEvents,
    time: now,
  };

  gameNs.emit('state', state);
}

setInterval(gameLoop, TICK_MS);

// ─── Start ─────────────────────────────────────────────────────
server.listen(PORT, '0.0.0.0', () => {
  console.log('');
  console.log('==================================================');
  console.log('      DevLoop RPG -- Server Running        ');
  console.log('==================================================');
  console.log(`  TV:    http://localhost:${PORT}/tv`);
  console.log(`  Phone: http://localhost:${PORT}/phone`);
  console.log('==================================================');
  console.log('');
});
