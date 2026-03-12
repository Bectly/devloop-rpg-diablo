const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const path = require('path');

const { Player } = require('./game/player');
const { World } = require('./game/world');
const { CombatSystem } = require('./game/combat');
const { Inventory } = require('./game/inventory');
const { StoryManager } = require('./game/story');
const { generateConsumable } = require('./game/items');

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

// Load first room
const roomInfo = world.loadRoom(0);
console.log(`[World] Loaded room: ${roomInfo.name}`);

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

    // Spawn position based on player count
    if (players.size === 0) {
      player.x = 400;
      player.y = 500;
    } else {
      player.x = 880;
      player.y = 500;
    }

    // Create inventory
    const inv = new Inventory();

    // Give starting items
    const startSword = generateConsumable('health_potion', 3);
    if (startSword) inv.addItem(startSword);

    players.set(socket.id, player);
    inventories.set(player.id, inv);
    controllerSockets.set(socket.id, player.id);

    console.log(`[Game] ${name} (${characterClass}) joined. Players: ${players.size}`);

    // Confirm to phone
    socket.emit('joined', {
      playerId: player.id,
      stats: player.serializeForPhone(),
      inventory: inv.serialize(),
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
    if (!player || !player.alive) return;

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
    if (!player || !player.alive) return;
    combat.playerAttack(player, world.monsters);
  });

  // ── Skills ──
  socket.on('skill', (data) => {
    const player = players.get(socket.id);
    if (!player || !player.alive) return;
    const allPlayers = Array.from(players.values());
    combat.playerSkill(player, data.skillIndex, world.monsters, allPlayers);
  });

  // ── Potions ──
  socket.on('use:potion', (data) => {
    const player = players.get(socket.id);
    if (!player || !player.alive) return;

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
    if (!player || !player.alive) return;

    const item = world.pickupItem(data.itemId, player.x, player.y);
    if (!item) {
      socket.emit('notification', { text: 'Too far or item gone', type: 'warning' });
      return;
    }

    // Gold goes directly
    if (item.type === 'currency') {
      player.gold += item.quantity;
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
      // Put it back
      world.addGroundItem(item, player.x, player.y);
      socket.emit('notification', { text: 'Inventory full!', type: 'error' });
    }
  });

  // ── Inventory Management ──
  socket.on('inventory:move', (data) => {
    const player = players.get(socket.id);
    if (!player) return;
    const inv = inventories.get(player.id);
    if (!inv) return;

    const result = inv.moveItem(data.itemId, data.toCol, data.toRow);
    socket.emit('inventory:update', inv.serialize());
  });

  socket.on('inventory:equip', (data) => {
    const player = players.get(socket.id);
    if (!player) return;
    const inv = inventories.get(player.id);
    if (!inv) return;

    const item = inv.getItem(data.itemId);
    if (!item || !item.slot) return;

    // Determine the actual slot
    let slot = item.slot;
    if (item.subType === 'ring') {
      slot = player.equipment.ring1 ? 'ring2' : 'ring1';
    }

    // Unequip current item in that slot
    const current = player.equipment[slot];
    if (current) {
      const result = inv.addItem(current);
      if (!result.success) {
        socket.emit('notification', { text: 'No room to swap', type: 'error' });
        return;
      }
    }

    // Remove from inventory and equip
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

  // ── Interact (NPC) ──
  socket.on('interact', () => {
    const player = players.get(socket.id);
    if (!player || !player.alive) return;

    // Find nearest NPC
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

  // ── Pickup nearest ──
  socket.on('loot:pickup_nearest', () => {
    const player = players.get(socket.id);
    if (!player || !player.alive) return;

    // Find nearest ground item
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
      // Trigger pickup via the same handler
      socket.emit('loot:auto_pickup', { itemId: nearest.item.id });
    }
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

  // Update players
  for (const player of allPlayers) {
    player.update(dt);
  }

  // Update monsters (AI + combat)
  for (const monster of world.monsters) {
    if (!monster.alive) continue;

    // Poison ticks
    combat.processPoison(monster, dt);

    // Monster AI returns attack events
    const aiEvents = monster.update(dt, allPlayers);
    for (const event of aiEvents) {
      if (event.type === 'monster_attack') {
        combat.processMonsterAttack(event, allPlayers);
      }
    }
  }

  // Collect combat events
  const combatEvents = combat.clearEvents();

  // Process quest-relevant events
  for (const event of combatEvents) {
    if (event.type === 'combat:death' && !event.playerId) {
      // Monster died — find type
      const deadMonster = world.monsters.find(m => m.id === event.entityId);
      if (deadMonster) {
        const questResults = story.updateQuest('kill', deadMonster.type);
        for (const qr of questResults) {
          if (qr.complete) {
            controllerNs.emit('notification', { text: `Quest complete: ${qr.questId}`, type: 'quest' });
            // Award quest XP to all players
            for (const p of allPlayers) {
              const lr = p.gainXp(qr.rewards.xp);
              p.gold += qr.rewards.gold || 0;
            }
          }
        }
      }

      // Add loot to ground
      if (event.loot) {
        for (const lootItem of event.loot) {
          world.addGroundItem(lootItem, lootItem.worldX, lootItem.worldY);
        }
      }
    }

    // Send combat events to phones for feedback
    if (event.type === 'combat:hit' || event.type === 'combat:player_death') {
      // Find the target player's socket and notify
      for (const [sid, player] of players) {
        if (player.id === event.targetId) {
          const socket = controllerNs.sockets.get(sid);
          if (socket) {
            socket.emit('stats:update', player.serializeForPhone());
            if (event.type === 'combat:player_death') {
              socket.emit('notification', { text: 'You died!', type: 'error' });
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

  // Check room clear — advance to next room
  if (world.allMonstersDead() && allPlayers.length > 0) {
    // Brief delay before advancing (handled by checking if already loading)
    if (!world._advancing) {
      world._advancing = true;
      setTimeout(() => {
        const nextIdx = world.getNextRoom();
        const nextRoom = world.loadRoom(nextIdx);
        console.log(`[World] Advancing to room: ${nextRoom.name}`);

        // Reset player positions
        let i = 0;
        for (const player of allPlayers) {
          player.x = 400 + i * 480;
          player.y = 500;
          if (!player.alive) {
            player.alive = true;
            player.hp = Math.floor(player.maxHp * 0.5);
            player.mp = Math.floor(player.maxMp * 0.5);
          }
          i++;
        }

        gameNs.emit('dungeon:enter', {
          room: world.serialize(),
          story: story.serialize(),
        });
        world._advancing = false;
      }, 3000);
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
  console.log('╔══════════════════════════════════════════╗');
  console.log('║      DevLoop RPG — Server Running        ║');
  console.log('╠══════════════════════════════════════════╣');
  console.log(`║  TV:    http://localhost:${PORT}/tv          ║`);
  console.log(`║  Phone: http://localhost:${PORT}/phone       ║`);
  console.log('╚══════════════════════════════════════════╝');
  console.log('');
});
