const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const path = require('path');

const { Player, DEATH_GOLD_DROP_PERCENT } = require('./game/player');
const { World, TILE, TILE_SIZE, GRID_W, GRID_H, FLOOR_NAMES, DIFFICULTY_SCALES } = require('./game/world');
const { CombatSystem } = require('./game/combat');
const { Inventory } = require('./game/inventory');
const { StoryManager } = require('./game/story');
const { generateConsumable, generateLoot, generateWeapon, generateArmor } = require('./game/items');
const { getSellPrice } = require('./game/shop');
const { createMonster, createSpiritWolf } = require('./game/monsters');
const { processAffixUpdates, AFFIX_DEFS } = require('./game/affixes');
const { getRiftRewards } = require('./game/rifts');
const { updateProjectiles, createProjectileAngled } = require('./game/projectiles');
const uuid = require('uuid');
const handlers = require('./socket-handlers');
const craftHandlers = require('./socket-handlers-craft');
const { GameDatabase } = require('./game/database');

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
const combat = new CombatSystem();
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
  socket.on('talent:tree', () => handlers.handleTalentTree(socket, null, ctx));
  socket.on('inventory:request', () => handlers.handleInventoryRequest(socket, null, ctx));
  socket.on('shop:open', () => handlers.handleShopOpen(socket, null, ctx));
  socket.on('shop:buy', (data) => handlers.handleShopBuy(socket, data, ctx));
  socket.on('shop:sell', (data) => handlers.handleShopSell(socket, data, ctx));
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
    world.generateFloor(0, gameDifficulty);
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
const TICK_RATE = 20;
const TICK_MS = 1000 / TICK_RATE;
let lastTick = Date.now();
let tickCount = 0;

function gameLoop() {
  const now = Date.now();
  const dt = now - lastTick;
  lastTick = now;

  const allPlayers = Array.from(players.values());

  // Sync party aura buffs (move speed from Beastmaster Pack Leader)
  const partyBuffs = combat.getPartyBuffs(allPlayers);
  for (const player of allPlayers) {
    player.auraMoveBuff = partyBuffs.move_speed || 0;
  }

  // Update players (handles death timers and respawns)
  for (const player of allPlayers) {
    // Disconnected players: freeze input so they don't move,
    // but still run update() for death timers / respawn logic.
    // They can still take damage from monsters (combat system uses allPlayers).
    let savedDx, savedDy;
    if (player.disconnected) {
      savedDx = player.inputDx;
      savedDy = player.inputDy;
      player.inputDx = 0;
      player.inputDy = 0;
    }

    const result = player.update(dt);

    // Decrement Last Stand timer (defensive proc — Phase 15.0)
    if (player.lastStandTimer > 0) player.lastStandTimer -= dt;

    // Owner death → despawn spirit wolf (Phase 15.4)
    if (player.isDying && player.summonedWolf) {
      for (const m of world.monsters) {
        if (m.id === player.summonedWolf) { m.alive = false; m.expireTimer = 0; break; }
      }
      player.summonedWolf = null;
    }

    if (player.disconnected) {
      player.inputDx = savedDx;
      player.inputDy = savedDy;
    }

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
  const worldBounds = { width: GRID_W * TILE_SIZE, height: GRID_H * TILE_SIZE };
  for (const monster of world.monsters) {
    if (!monster.alive) continue;

    // Friendly summon AI (spirit wolf — Phase 15.4)
    if (monster.friendly) {
      monster.expireTimer -= dt;
      if (monster.expireTimer <= 0) {
        monster.alive = false;
        // Clear owner reference using cached ownerId (O(1) lookup vs O(n))
        const wolfOwner = allPlayers.find(p => p.id === monster.ownerId);
        if (wolfOwner && wolfOwner.summonedWolf === monster.id) {
          wolfOwner.summonedWolf = null;
        }
        continue;
      }
      // Attack cooldown
      if (monster.attackCooldown > 0) monster.attackCooldown -= dt;
      // Find nearest hostile monster
      let nearestEnemy = null;
      let nearestDist = Infinity;
      for (const m of world.monsters) {
        if (m === monster || !m.alive || m.friendly) continue;
        const dx = m.x - monster.x;
        const dy = m.y - monster.y;
        const d = Math.sqrt(dx * dx + dy * dy);
        if (d < nearestDist) { nearestDist = d; nearestEnemy = m; }
      }
      if (nearestEnemy && nearestDist <= monster.attackRange) {
        if (monster.attackCooldown <= 0) {
          monster.attackCooldown = monster.attackSpeed;
          const dealt = nearestEnemy.takeDamage(monster.damage);
          combat.events.push({
            type: 'combat:hit', attackerId: monster.id, targetId: nearestEnemy.id,
            damage: dealt, attackType: 'wolf_bite',
          });
        }
      } else if (nearestEnemy) {
        const dx = nearestEnemy.x - monster.x;
        const dy = nearestEnemy.y - monster.y;
        const len = Math.sqrt(dx * dx + dy * dy);
        if (len > 0) {
          monster.x += (dx / len) * monster.speed * (dt / 1000);
          monster.y += (dy / len) * monster.speed * (dt / 1000);
        }
      }
      continue;
    }

    combat.processPoison(monster, dt);
    combat.processBleed(monster, dt);

    // Process affix updates (teleporter blink, shielding cycle)
    if (monster.affixes) {
      const affixEvents = processAffixUpdates(monster, worldBounds);
      for (const evt of affixEvents) {
        if (evt.type === 'teleport') {
          monster.x = evt.newX;
          monster.y = evt.newY;
        }
        // shield_on/shield_off handled internally by the affix
      }
    }

    const aiEvents = monster.update(dt, allPlayers);
    for (const event of aiEvents) {
      if (event.type === 'monster_attack') {
        combat.processMonsterAttack(event, allPlayers, monster);
      }
      // Boss summon — spawn minion monsters
      else if (event.type === 'boss_summon') {
        for (const pos of event.positions) {
          const minion = createMonster(event.summonType, pos.x, pos.y, world.currentFloor);
          minion.aiState = 'alert'; // immediately aggressive
          world.monsters.push(minion);
        }
        combat.events.push({ type: 'boss_summon', monsterId: event.monsterId, summonType: event.summonType, count: event.positions.length });
      }
      // Void pulse — AoE cold damage to all players in radius
      else if (event.type === 'void_pulse') {
        for (const player of allPlayers) {
          if (!player.alive || player.isDying) continue;
          const dx = player.x - event.x;
          const dy = player.y - event.y;
          const dist = Math.sqrt(dx * dx + dy * dy);
          if (dist <= event.radius) {
            const dmg = player.takeDamage(event.damage, 'cold');
            if (dmg === -1) continue; // dodged
            combat.events.push({
              type: 'combat:hit',
              targetId: player.id,
              damage: dmg,
              damageType: 'cold',
              attackType: 'void_pulse',
            });
            // takeDamage already calls die() internally when hp reaches 0
            if (!player.alive || player.isDying) {
              combat.events.push({
                type: 'combat:player_death',
                targetId: player.id,
                playerId: player.id,
                playerName: player.name,
                killedBy: 'void_pulse',
              });
            }
          }
        }
        // Forward to TV for visual effect
        combat.events.push({ type: 'void_pulse', x: event.x, y: event.y, radius: event.radius });
      }
      // Visual events — forward to combat events for TV broadcast
      else if (event.type === 'boss_phase' || event.type === 'teleport' || event.type === 'stealth_reveal' || event.type === 'boss_shadow_clones') {
        combat.events.push(event);
      }
    }
  }

  // Process player debuffs (fire DoT, cold slow from affixes)
  for (const player of allPlayers) {
    if (!player.alive || player.isDying) continue;
    const debuffDamage = player.processDebuffs();
    if (debuffDamage > 0) {
      player.hp -= debuffDamage;
      if (player.hp <= 0) {
        player.hp = 0;
        player.die();
        combat.events.push({
          type: 'combat:player_death',
          targetId: player.id,
          playerId: player.id,
          playerName: player.name,
          killedBy: 'affix_debuff',
        });
      }
    }
  }

  // ── Trap check ──
  for (const trap of world.traps) {
    for (const player of allPlayers) {
      if (!player.alive || player.isDying || player.disconnected) continue;
      if (trap.canTrigger(player)) {
        const result = trap.trigger(player);
        // Send trap trigger event for TV visual
        combat.events.push({
          type: 'trap:trigger',
          trapId: result.trapId,
          trapType: result.trapType,
          trapName: result.trapName,
          playerId: result.playerId,
          damage: result.damage,
          dodged: result.dodged,
          effect: result.effect,
          x: result.x,
          y: result.y,
        });
        // Notify phone
        for (const [sid, p] of players) {
          if (p.id === result.playerId) {
            const sock = controllerNs.sockets.get(sid);
            if (sock) {
              sock.emit('stats:update', p.serializeForPhone());
              if (!result.dodged) {
                sock.emit('notification', { text: `${result.trapName}! -${result.damage} HP`, type: 'error' });
              }
            }
          }
        }
        // Check for death from trap
        if (!player.alive || player.isDying) {
          combat.events.push({
            type: 'combat:player_death',
            targetId: player.id,
            playerId: player.id,
            playerName: player.name,
            killedBy: result.trapName,
          });
        }
      }
    }
  }

  // ── Rift timer + modifier ticks ──
  if (world.riftActive) {
    const timerOk = world.updateRiftTimer(dt);

    // Emit rift:timer every ~1 second
    if (tickCount % TICK_RATE === 0) {
      const remaining = world.getRiftTimeRemaining();
      const timerPayload = { remaining, timeLimit: world.riftTimeLimit };
      gameNs.emit('rift:timer', timerPayload);
      controllerNs.emit('rift:timer', timerPayload);
    }

    // Burning modifier: every 5s, all players take 5% maxHp fire damage
    if (world.riftConfig) {
      const hasBurning = world.riftConfig.modifiers.some(m => m.effect === 'env_fire');
      if (hasBurning && tickCount % (TICK_RATE * 5) === 0) {
        for (const player of allPlayers) {
          if (!player.alive || player.isDying) continue;
          const fireDmg = Math.max(1, Math.floor(player.maxHp * 0.05));
          player.hp -= fireDmg;
          combat.events.push({
            type: 'combat:hit', targetId: player.id, damage: fireDmg,
            damageType: 'fire', attackType: 'rift_burning',
          });
          if (player.hp <= 0) {
            player.hp = 0;
            player.die();
            combat.events.push({
              type: 'combat:player_death', targetId: player.id,
              playerId: player.id, playerName: player.name, killedBy: 'rift_burning',
            });
          }
        }
      }

      // Vampiric modifier: all monsters heal 10% of damage dealt this tick
      const hasVampiric = world.riftConfig.modifiers.some(m => m.effect === 'monster_leech');
      if (hasVampiric) {
        for (const evt of combat.events) {
          if (evt.type === 'combat:hit' && evt.attackerId && evt.damage > 0 && !evt.dodged) {
            const monster = world.monsters.find(m => m.id === evt.attackerId && m.alive);
            if (monster) {
              const heal = Math.floor(evt.damage * 0.10);
              monster.hp = Math.min(monster.maxHp, monster.hp + heal);
            }
          }
        }
      }
    }

    // Timer expired: rift failed
    if (!timerOk) {
      const riftTier = world.riftConfig ? world.riftConfig.tier : 0;
      world.endRift();

      // Reset heal reduction
      for (const p of allPlayers) p.healReduction = 1.0;

      gameNs.emit('rift:failed', { tier: riftTier, reason: 'timeout' });
      controllerNs.emit('rift:failed', { tier: riftTier, reason: 'timeout' });
      controllerNs.emit('notification', { text: 'Rift Failed! Time expired.', type: 'error' });

      // Return to normal floor
      world.generateFloor(0, gameDifficulty);
      story.placeNpcs(world.storyNpcs || []);
      let ridx = 0;
      for (const [sid, p] of players) {
        const spawn = world.getSpawnPosition(ridx);
        p.x = spawn.x; p.y = spawn.y;
        p.setRespawnPoint(spawn.x, spawn.y);
        if (!p.alive) { p.alive = true; p.isDying = false; p.deathTimer = 0; p.hp = Math.floor(p.maxHp * 0.5); p.mp = Math.floor(p.maxMp * 0.5); }
        ridx++;
      }
      gameNs.emit('dungeon:enter', {
        room: world.serialize(), story: story.serialize(),
        floor: world.currentFloor, floorName: world.floorName,
        zoneId: world.zone ? world.zone.id : 'catacombs',
        zoneName: world.zone ? world.zone.name : 'The Catacombs',
      });
      controllerNs.emit('floor:change', {
        floor: world.currentFloor, floorName: world.floorName,
        zoneId: world.zone ? world.zone.id : 'catacombs',
        zoneName: world.zone ? world.zone.name : 'The Catacombs',
        difficulty: gameDifficulty,
      });
      for (const [sid, p] of players) {
        const sock = controllerNs.sockets.get(sid);
        if (sock) sock.emit('stats:update', p.serializeForPhone());
      }
    }
  }

  // Process projectile:create events from skills (Phase 16.3)
  const projCreateEvents = combat.events.filter(e => e.type === 'projectile:create');
  if (projCreateEvents.length > 0) {
    if (!world.projectiles) world.projectiles = [];
    for (const ev of projCreateEvents) {
      const proj = createProjectileAngled(
        { id: ev.ownerId, x: ev.x, y: ev.y },
        ev.angle,
        {
          speed: ev.speed,
          damage: ev.damage,
          damageType: ev.damageType,
          piercing: ev.piercing || false,
          aoeRadius: ev.aoeRadius || 0,
          visual: ev.visual || 'arrow',
          skillName: ev.skillName || '',
          lifetime: ev.lifetime || 2000,
        },
      );
      world.projectiles.push(proj);
    }
    // Remove projectile:create events — they're internal, not for clients
    combat.events = combat.events.filter(e => e.type !== 'projectile:create');
  }

  // Update projectiles (Phase 16.1)
  if (world.projectiles && world.projectiles.length > 0) {
    const projEvents = updateProjectiles(world.projectiles, world.monsters, dt);
    combat.events.push(...projEvents);
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

        // ── Rift Guardian kill: complete the rift ──
        if (deadMonster.isRiftGuardian && world.riftActive && world.riftConfig) {
          const riftConfig = world.riftConfig;
          const remaining = world.getRiftTimeRemaining();
          const elapsed = riftConfig.timeLimit - remaining;
          const rewards = getRiftRewards(riftConfig.tier, remaining, riftConfig.timeLimit);

          // Distribute rewards to all players
          const playerNames = [];
          for (const [sid, p] of players) {
            playerNames.push(p.name);
            p.gold += Math.floor(rewards.gold / Math.max(1, players.size));
            if (rewards.keystones > 0) p.addKeystones(rewards.keystones);
            const xpResult = p.gainXp(rewards.xp);
            const sock = controllerNs.sockets.get(sid);
            if (sock) {
              sock.emit('stats:update', p.serializeForPhone());
              if (xpResult && xpResult.isParagon) {
                sock.emit('notification', { text: `Paragon Level ${xpResult.paragonLevel}!`, type: 'levelup' });
              } else if (xpResult) {
                sock.emit('notification', { text: `Level up! Now level ${xpResult.level}`, type: 'levelup' });
              }
            }
          }

          // Record in rift leaderboard
          gameDb.recordRiftClear(riftConfig.tier, playerNames, elapsed, riftConfig.modifiers, gameDifficulty);

          // Emit completion
          const completePayload = {
            tier: riftConfig.tier, timeElapsed: elapsed, timeRemaining: remaining,
            rewards, modifiers: riftConfig.modifiers,
          };
          gameNs.emit('rift:complete', completePayload);
          controllerNs.emit('rift:complete', completePayload);
          controllerNs.emit('notification', {
            text: `Rift Tier ${riftConfig.tier} cleared! +${rewards.gold}g, +${rewards.xp}xp${rewards.keystones > 0 ? `, +${rewards.keystones} keystone` : ''}`,
            type: 'quest',
          });

          // End rift, reset heal reduction
          world.endRift();
          for (const p of allPlayers) p.healReduction = 1.0;
          saveAllPlayers();

          // Return to normal floor after 2s delay (guard against race with new rift)
          setTimeout(() => {
            if (world.riftActive) return; // A new rift was opened during the delay
            world.generateFloor(0, gameDifficulty);
            story.placeNpcs(world.storyNpcs || []);
            let ridx = 0;
            for (const [sid, p] of players) {
              const spawn = world.getSpawnPosition(ridx);
              p.x = spawn.x; p.y = spawn.y;
              p.setRespawnPoint(spawn.x, spawn.y);
              if (!p.alive) { p.alive = true; p.isDying = false; p.deathTimer = 0; p.hp = p.maxHp; p.mp = p.maxMp; }
              ridx++;
            }
            gameNs.emit('dungeon:enter', {
              room: world.serialize(), story: story.serialize(),
              floor: world.currentFloor, floorName: world.floorName,
              zoneId: world.zone ? world.zone.id : 'catacombs',
              zoneName: world.zone ? world.zone.name : 'The Catacombs',
            });
            controllerNs.emit('floor:change', {
              floor: world.currentFloor, floorName: world.floorName,
              zoneId: world.zone ? world.zone.id : 'catacombs',
              zoneName: world.zone ? world.zone.name : 'The Catacombs',
              difficulty: gameDifficulty,
            });
            for (const [sid, p] of players) {
              const sock = controllerNs.sockets.get(sid);
              if (sock) sock.emit('stats:update', p.serializeForPhone());
            }
          }, 2000);
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

    // Summon shadow decoy (Phase 16.3)
    if (event.type === 'summon:shadow_decoy') {
      const decoy = createMonster('shadow_decoy', event.x, event.y, 0);
      decoy.friendly = true;
      decoy.hp = 1;
      decoy.maxHp = 1;
      decoy.name = 'Shadow Decoy';
      decoy.expireTimer = event.duration || 2000;
      world.monsters.push(decoy);
    }

    // Summon spirit wolf (Phase 15.4)
    if (event.type === 'summon:spirit_wolf') {
      const owner = allPlayers.find(p => p.id === event.playerId);
      if (owner && owner.alive && !owner.isDying && !owner.summonedWolf) {
        const wolf = createSpiritWolf(event.x, event.y, owner);
        world.monsters.push(wolf);
        owner.summonedWolf = wolf.id;
        // Notify owner's phone
        for (const [sid, pl] of players) {
          if (pl.id === owner.id) {
            const sock = controllerNs.sockets.get(sid);
            if (sock) sock.emit('combat:proc', { effect: 'summon_spirit_wolf', targetId: owner.id });
            break;
          }
        }
      }
    }

    // Forward defensive proc events to the target player's phone (Phase 15.0)
    if (event.type === 'combat:proc' && event.targetId) {
      for (const [sid, player] of players) {
        if (player.id === event.targetId) {
          const socket = controllerNs.sockets.get(sid);
          if (socket) socket.emit('combat:proc', event);
          break;
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
              const dmgData = { damage: event.damage };
              // Include elite monster info for phone encounter notifications
              const attacker = world.monsters.find(m => m.id === event.attackerId);
              if (attacker && attacker.isElite) {
                dmgData.isElite = true;
                dmgData.eliteRank = attacker.eliteRank;
                dmgData.monsterName = attacker.name;
                dmgData.affixes = (attacker.affixes || []).map(key => {
                  const def = AFFIX_DEFS[key];
                  return def ? def.name : key;
                });
              }
              socket.emit('damage:taken', dmgData);
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
            if (event.isParagon) {
              socket.emit('notification', { text: `Paragon Level ${event.paragonLevel}!`, type: 'levelup' });
            } else {
              socket.emit('notification', { text: `Level up! Now level ${event.level}`, type: 'levelup' });
            }
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

  // Check if player is on exit (floor progression) — disabled during rifts
  if (!world.exitLocked && !world._advancing && !gameWon && !world.riftActive) {
    for (const player of allPlayers) {
      if (!player.alive || player.isDying || player.disconnected) continue;
      if (world.isPlayerOnExit(player)) {
        world._advancing = true;
        console.log(`[World] ${player.name} reached the exit! Advancing to floor ${world.currentFloor + 2}...`);

        // ── VICTORY CHECK: set gameWon IMMEDIATELY to prevent race condition ──
        const isFinal = world.isFinalFloor();
        if (isFinal) {
          gameWon = true;
        }

        setTimeout(() => {
          // ── VICTORY: If on final floor, emit victory instead of advancing ──
          if (isFinal) {
            const elapsed = Date.now() - gameStartTime;
            const playerStats = Array.from(players.values()).map(p => ({
              name: p.name,
              characterClass: p.characterClass,
              level: p.level,
              kills: p.kills || 0,
              gold: p.gold,
            }));

            // Determine what the next unlock is
            const DIFF_ORDER = ['normal', 'nightmare', 'hell'];
            const currentIdx = DIFF_ORDER.indexOf(gameDifficulty);
            const unlockedNext = currentIdx < DIFF_ORDER.length - 1 ? DIFF_ORDER[currentIdx + 1] : null;

            const victoryData = {
              players: playerStats,
              totalTime: elapsed,
              finalFloor: FLOOR_NAMES.length,
              difficulty: gameDifficulty,
              unlockedNext,
            };

            console.log(`[World] VICTORY! Dungeon conquered in ${Math.floor(elapsed / 1000)}s`);

            // Save final stats before emitting victory
            saveAllPlayers();

            // Record leaderboard entry for each player
            for (const ps of playerStats) {
              gameDb.recordRun(ps.name, ps.characterClass, ps.level, FLOOR_NAMES.length, ps.kills, ps.gold, Math.floor(elapsed / 1000), 1, gameDifficulty);
            }

            gameNs.emit('game:victory', victoryData);
            controllerNs.emit('game:victory', victoryData);
            world._advancing = false;
            return;
          }

          const nextFloor = world.currentFloor + 1;
          world.generateFloor(nextFloor, gameDifficulty);
          story.placeNpcs(world.storyNpcs || []);

          // Save all players on floor transition
          saveAllPlayers(nextFloor);

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
          const floorDiffLabel = gameDifficulty === 'normal' ? '' : ` [${gameDifficulty.toUpperCase()}]`;
          controllerNs.emit('notification', { text: `Floor ${world.currentFloor + 1}${floorDiffLabel}: ${world.floorName}`, type: 'quest' });

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

  // ── Auto-save every 60 seconds ──
  tickCount++;
  if (tickCount % (TICK_RATE * 60) === 0) {
    saveAllPlayers();
    // Notify phones that progress was saved
    if (players.size > 0) {
      controllerNs.emit('notification', { text: '\uD83D\uDCBE Progress saved', type: 'save' });
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

// ─── Graceful Shutdown ──────────────────────────────────────────
function gracefulShutdown(signal) {
  console.log(`\n[Server] ${signal} received — saving all players...`);
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
