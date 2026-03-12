const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const path = require('path');

const { Player, DEATH_GOLD_DROP_PERCENT } = require('./game/player');
const { World, TILE, TILE_SIZE } = require('./game/world');
const { CombatSystem } = require('./game/combat');
const { Inventory } = require('./game/inventory');
const { StoryManager } = require('./game/story');
const { generateConsumable, generateLoot, generateWeapon, generateArmor } = require('./game/items');
const { getSellPrice } = require('./game/shop');
const uuid = require('uuid');
const handlers = require('./socket-handlers');

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

  const ctx = { players, inventories, controllerSockets, world, combat, story, gameNs, io };

  socket.on('join', (data) => handlers.handleJoin(socket, data, ctx));
  socket.on('move', (data) => handlers.handleMove(socket, data, ctx));
  socket.on('move:stop', () => handlers.handleMoveStop(socket, null, ctx));
  socket.on('attack', () => handlers.handleAttack(socket, null, ctx));
  socket.on('skill', (data) => handlers.handleSkill(socket, data, ctx));
  socket.on('use:potion', (data) => handlers.handleUsePotion(socket, data, ctx));
  socket.on('loot:pickup', (data) => handlers.handleLootPickup(socket, data, ctx));
  socket.on('loot:pickup_nearest', () => handlers.handleLootPickupNearest(socket, null, ctx));
  socket.on('inventory:move', (data) => handlers.handleInventoryMove(socket, data, ctx));
  socket.on('inventory:equip', (data) => handlers.handleInventoryEquip(socket, data, ctx));
  socket.on('inventory:unequip', (data) => handlers.handleInventoryUnequip(socket, data, ctx));
  socket.on('inventory:drop', (data) => handlers.handleInventoryDrop(socket, data, ctx));
  socket.on('interact', () => handlers.handleInteract(socket, null, ctx));
  socket.on('dialogue:choose', (data) => handlers.handleDialogueChoose(socket, data, ctx));
  socket.on('levelup:stat', (data) => handlers.handleLevelupStat(socket, data, ctx));
  socket.on('inventory:request', () => handlers.handleInventoryRequest(socket, null, ctx));
  socket.on('shop:open', () => handlers.handleShopOpen(socket, null, ctx));
  socket.on('shop:buy', (data) => handlers.handleShopBuy(socket, data, ctx));
  socket.on('shop:sell', (data) => handlers.handleShopSell(socket, data, ctx));
  socket.on('shrine:use', () => handlers.handleShrineUse(socket, null, ctx));
  socket.on('quest:claim', (data) => handlers.handleQuestClaim(socket, data, ctx));
  socket.on('chest:open', (data) => handlers.handleChestOpen(socket, data, ctx));
  socket.on('disconnect', () => handlers.handleDisconnect(socket, null, ctx));
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

        // Boss loot chest
        if (deadMonster.isBoss || deadMonster.type === 'boss_knight') {
          const chest = {
            id: uuid.v4(),
            type: 'loot_chest',
            x: deadMonster.x,
            y: deadMonster.y,
            items: [],
            gold: 50 + world.currentFloor * 30 + Math.floor(Math.random() * 100),
            opened: false,
          };

          // Generate 3-5 items with higher rarity bias
          const itemCount = 3 + Math.floor(Math.random() * 3);
          for (let i = 0; i < itemCount; i++) {
            const item = Math.random() < 0.5
              ? generateWeapon(world.currentFloor + 2)
              : generateArmor(world.currentFloor + 2);
            chest.items.push(item);
          }

          // Store chest on world
          if (!world.lootChests) world.lootChests = [];
          world.lootChests.push(chest);

          // Emit to TV for rendering
          gameNs.emit('boss:chest', {
            x: chest.x,
            y: chest.y,
            id: chest.id,
            gold: chest.gold,
            itemCount: chest.items.length,
          });
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
