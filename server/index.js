const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const path = require('path');

const { World, DIFFICULTY_SCALES } = require('./game/world');
const { CombatSystem } = require('./game/combat');
const { StoryManager } = require('./game/story');
const handlers = require('./socket-handlers');
const craftHandlers = require('./socket-handlers-craft');
const { GameDatabase } = require('./game/database');
const { ComboTracker } = require('./game/combos');
const { createGameLoop } = require('./game-loop');

const gameDb = new GameDatabase();

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
app.use('/shared', express.static(path.join(__dirname, '..', 'client', 'shared')));

// Redirect root to TV
app.get('/', (req, res) => {
  const ua = req.headers['user-agent'] || '';
  const isMobile = /mobile|android|iphone|ipad/i.test(ua);
  res.redirect(isMobile ? '/phone' : '/tv');
});

// API: Get server LAN address for QR code
app.get('/api/server-info', (req, res) => {
  const os = require('os');
  const nets = os.networkInterfaces();
  let lanIp = 'localhost';
  for (const name of Object.keys(nets)) {
    for (const net of nets[name]) {
      if (net.family === 'IPv4' && !net.internal) {
        lanIp = net.address;
        break;
      }
    }
    if (lanIp !== 'localhost') break;
  }
  res.json({ ip: lanIp, port: PORT, phoneUrl: `http://${lanIp}:${PORT}/phone` });
});

// ─── Game State ────────────────────────────────────────────────
const players = new Map();       // socketId → Player
const inventories = new Map();   // playerId → Inventory
const controllerSockets = new Map(); // socketId → playerId
const tvSockets = new Set();

let gameDifficulty = 'normal';

const world = new World();
world.cursedEvent = null;
const combat = new CombatSystem();
const comboTracker = new ComboTracker();
const story = new StoryManager();

// Generate first dungeon floor
world.generateFloor(0, gameDifficulty);
story.placeNpcs(world.storyNpcs || []);
console.log(`[World] Loaded floor: ${world.roomName}`);

// Track game start time for victory stats
let gameStartTime = Date.now();
let gameWon = false;

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

  const ctx = {
    players, inventories, controllerSockets, world, combat, story, gameNs, controllerNs, io, gameDb, DIFFICULTY_SCALES,
    get gameDifficulty() { return gameDifficulty; },
    set gameDifficulty(v) { gameDifficulty = v; },
  };

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
  socket.on('talent:allocate', (data) => handlers.handleTalentAllocate(socket, data, ctx));
  socket.on('talent:respec', () => handlers.handleTalentRespec(socket, null, ctx));
  socket.on('skill:level-up', (data) => handlers.handleSkillLevelUp(socket, data, ctx));
  socket.on('talent:tree', () => handlers.handleTalentTree(socket, null, ctx));
  socket.on('inventory:request', () => handlers.handleInventoryRequest(socket, null, ctx));
  socket.on('shop:open', () => handlers.handleShopOpen(socket, null, ctx));
  socket.on('shop:buy', (data) => handlers.handleShopBuy(socket, data, ctx));
  socket.on('shop:sell', (data) => handlers.handleShopSell(socket, data, ctx));
  socket.on('gamble', (data) => handlers.handleGamble(socket, data, ctx));
  socket.on('shrine:use', () => handlers.handleShrineUse(socket, null, ctx));
  socket.on('craft:info', (data) => craftHandlers.handleCraftInfo(socket, data, ctx));
  socket.on('craft:salvage', (data) => craftHandlers.handleCraftSalvage(socket, data, ctx));
  socket.on('craft:reforge', (data) => craftHandlers.handleCraftReforge(socket, data, ctx));
  socket.on('craft:reforge_accept', (data) => craftHandlers.handleCraftReforgeAccept(socket, data, ctx));
  socket.on('craft:upgrade', (data) => craftHandlers.handleCraftUpgrade(socket, data, ctx));
  socket.on('quest:claim', (data) => handlers.handleQuestClaim(socket, data, ctx));
  socket.on('chest:open', (data) => handlers.handleChestOpen(socket, data, ctx));
  socket.on('chat:send', (data) => handlers.handleChat(socket, data, ctx));
  socket.on('leaderboard:get', (data) => handlers.handleLeaderboardGet(socket, data, ctx));
  socket.on('leaderboard:personal', (data) => handlers.handleLeaderboardPersonal(socket, data, ctx));

  // ── Rift System ──
  socket.on('rift:open', (data) => handlers.handleRiftOpen(socket, data, ctx));
  socket.on('rift:enter', () => handlers.handleRiftEnter(socket, null, ctx));
  socket.on('rift:cancel', () => handlers.handleRiftCancel(socket, null, ctx));
  socket.on('rift:leaderboard', (data) => handlers.handleRiftLeaderboard(socket, data, ctx));

  // ── Stash System ──
  socket.on('stash:list', () => handlers.handleStashList(socket, null, ctx));
  socket.on('stash:store', (data) => handlers.handleStashStore(socket, data, ctx));
  socket.on('stash:retrieve', (data) => handlers.handleStashRetrieve(socket, data, ctx));

  // Gem socket/unsocket
  socket.on('gem:socket', (data) => handlers.handleGemSocket(socket, data, ctx));
  socket.on('gem:unsocket', (data) => handlers.handleGemUnsocket(socket, data, ctx));
  socket.on('gem:combine', (data) => handlers.handleGemCombine(socket, data, ctx));
  socket.on('loot:filter', (data) => handlers.handleLootFilter(socket, data, ctx));
  socket.on('enchant:preview', (data) => handlers.handleEnchantPreview(socket, data, ctx));
  socket.on('enchant:execute', (data) => handlers.handleEnchantExecute(socket, data, ctx));

  // ── New Game (restart after victory) ──
  socket.on('game:restart', (data) => {
    const requestedDiff = (data && data.difficulty) || 'normal';
    // Validate difficulty unlock
    const player = players.get(socket.id);
    if (player) {
      const unlocked = gameDb.getUnlockedDifficulties(player.name);
      if (!unlocked.includes(requestedDiff)) {
        socket.emit('notification', { text: `${requestedDiff} difficulty is locked! Beat ${requestedDiff === 'hell' ? 'Nightmare' : 'Normal'} first.`, type: 'error' });
        return;
      }
    }
    gameDifficulty = requestedDiff;
    console.log(`[Game] Restart requested — difficulty: ${gameDifficulty}`);
    gameWon = false;
    gameStartTime = Date.now();
    comboTracker.reset();
    world.generateFloor(0, gameDifficulty);
    world.cursedEvent = null;
    story.placeNpcs(world.storyNpcs || []);

    // Force-reconnect all disconnected players on restart (Bug #4):
    // Clear their grace timers, remove from disconnectedPlayers Map,
    // and reset their disconnected flag so they don't silently vanish
    // when a stale timer fires mid-game.
    const { disconnectedPlayers } = handlers;
    for (const [name, entry] of disconnectedPlayers) {
      clearTimeout(entry.timer);
      entry.player.disconnected = false;
    }
    disconnectedPlayers.clear();
    handlers.clearPendingRift();

    // Reposition all players, keep levels (NG+ lite)
    let idx = 0;
    for (const [sid, p] of players) {
      const spawn = world.getSpawnPosition(idx);
      p.x = spawn.x;
      p.y = spawn.y;
      p.setRespawnPoint(spawn.x, spawn.y);
      p.kills = 0;
      p.alive = true;
      p.isDying = false;
      p.deathTimer = 0;
      p.hp = p.maxHp;
      p.mp = p.maxMp;
      p.healReduction = 1.0;
      idx++;
    }

    gameNs.emit('dungeon:enter', {
      room: world.serialize(),
      story: story.serialize(),
      floor: world.currentFloor,
      floorName: world.floorName,
      zoneId: world.zone ? world.zone.id : 'catacombs',
      zoneName: world.zone ? world.zone.name : 'The Catacombs',
    });

    controllerNs.emit('floor:change', {
      floor: world.currentFloor,
      floorName: world.floorName,
      zoneId: world.zone ? world.zone.id : 'catacombs',
      zoneName: world.zone ? world.zone.name : 'The Catacombs',
      difficulty: gameDifficulty,
    });
    const diffLabel = gameDifficulty === 'normal' ? '' : ` [${gameDifficulty.toUpperCase()}]`;
    controllerNs.emit('notification', { text: `New Game${diffLabel}! Floor 1: ${world.floorName}`, type: 'quest' });

    // Generate fresh quests + update all phone stats
    for (const [sid, p] of players) {
      p.questManager.generateForFloor(0);
      const sock = controllerNs.sockets.get(sid);
      if (sock) {
        sock.emit('stats:update', p.serializeForPhone());
        sock.emit('quest:update', p.questManager.getActiveQuests());
        sock.emit('game:restarted', { difficulty: gameDifficulty });
      }
    }
  });

  socket.on('disconnect', () => handlers.handleDisconnect(socket, null, ctx));
});

// ─── Persistence helpers ────────────────────────────────────────
function saveAllPlayers(floor) {
  const currentFloor = floor !== undefined ? floor : world.currentFloor;
  for (const [sid, player] of players) {
    const inv = inventories.get(player.id);
    try {
      gameDb.saveCharacter(player, inv, currentFloor);
    } catch (err) {
      console.error(`[DB] Failed to save ${player.name}:`, err.message);
    }
  }
  if (players.size > 0) {
    console.log(`[DB] Saved ${players.size} player(s) (floor ${currentFloor})`);
  }
}

// ─── Game Loop (20 ticks/sec) ──────────────────────────────────
const gameLoop = createGameLoop({
  players, inventories, controllerSockets, world, combat, comboTracker, story,
  gameNs, controllerNs, gameDb, saveAllPlayers,
  get gameDifficulty() { return gameDifficulty; },
  set gameDifficulty(v) { gameDifficulty = v; },
  get gameWon() { return gameWon; },
  set gameWon(v) { gameWon = v; },
  get gameStartTime() { return gameStartTime; },
  set gameStartTime(v) { gameStartTime = v; },
});

gameLoop.start();

// ─── Graceful Shutdown ──────────────────────────────────────────
function gracefulShutdown(signal) {
  console.log(`\n[Server] ${signal} received — saving all players...`);
  gameLoop.stop();
  saveAllPlayers();

  // Also save disconnected players still in grace period
  const { disconnectedPlayers } = handlers;
  if (disconnectedPlayers && disconnectedPlayers.size > 0) {
    for (const [name, entry] of disconnectedPlayers) {
      clearTimeout(entry.timer);
      try {
        gameDb.saveCharacter(entry.player, entry.inventory, world.currentFloor);
        console.log(`[DB] Saved disconnected player ${name} on shutdown`);
      } catch (err) {
        console.error(`[DB] Failed to save disconnected ${name}:`, err.message);
      }
    }
    disconnectedPlayers.clear();
  }

  gameDb.close();
  console.log('[Server] Database closed. Goodbye.');
  process.exit(0);
}

process.on('SIGINT', () => gracefulShutdown('SIGINT'));
process.on('SIGTERM', () => gracefulShutdown('SIGTERM'));

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
