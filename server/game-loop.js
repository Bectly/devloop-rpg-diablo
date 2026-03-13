/**
 * Game loop extracted from index.js
 * Runs at 20 ticks/sec — handles player updates, monster AI, combat processing,
 * projectile updates, floor transitions, auto-loot, auto-save, and state broadcast.
 *
 * Usage: createGameLoop(ctx) returns { start(), stop() }
 */

const { TILE_SIZE, GRID_W, GRID_H, FLOOR_NAMES, DIFFICULTY_SCALES } = require('./game/world');
const { createMonster, createSpiritWolf } = require('./game/monsters');
const { generateConsumable, generateWeapon, generateArmor, generateAccessory, RARITIES, PREFIXES, buildItemName } = require('./game/items');
const { processAffixUpdates, AFFIX_DEFS } = require('./game/affixes');
const { getRiftRewards } = require('./game/rifts');
const { updateProjectiles, createProjectileAngled } = require('./game/projectiles');
const { rollGemDrop, generateGem, GEM_TYPES } = require('./game/gems');
const { applyArmor } = require('./game/damage-types');
const uuid = require('uuid');
const { spawnCursedEventWave, trySpawnGoblin, trySpawnCursedEvent } = require('./spawning');

const TICK_RATE = 20;
const TICK_MS = 1000 / TICK_RATE;
const AUTO_PICKUP_RADIUS = 72; // 1.5 tiles
const RARE_PLUS_RARITIES = new Set(['rare', 'epic', 'legendary', 'set']);

/**
 * Create and return a game loop bound to the given context.
 * @param {Object} ctx - Shared game state references:
 *   { players, inventories, world, combat, comboTracker, story,
 *     gameNs, controllerNs, gameDb, saveAllPlayers,
 *     get gameDifficulty, set gameDifficulty,
 *     get gameWon, set gameWon,
 *     get gameStartTime, set gameStartTime }
 * @returns {{ start: Function, stop: Function }}
 */
function createGameLoop(ctx) {
  const {
    players, inventories, world, combat, comboTracker, story,
    gameNs, controllerNs, gameDb, saveAllPlayers,
  } = ctx;

  let lastTick = Date.now();
  let tickCount = 0;
  let intervalId = null;

  function gameTick() {
    const now = Date.now();
    const dt = now - lastTick;
    lastTick = now;

    const gameDifficulty = ctx.gameDifficulty;
    const gameWon = ctx.gameWon;
    const gameStartTime = ctx.gameStartTime;

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
        // ── Hardcore permadeath: delete character instead of respawning ──
        if (player.hardcore) {
          for (const [sid, p] of players) {
            if (p.id === player.id) {
              const socket = controllerNs.sockets.get(sid);
              if (socket) {
                socket.emit('hardcore:death', {
                  name: player.name,
                  level: player.level,
                  kills: player.kills,
                  gold: player.gold,
                });
                socket.emit('notification', { text: 'HARDCORE DEATH — Your hero has fallen forever.', type: 'error' });
              }
              // Record the run before deletion
              if (gameDb) {
                try {
                  gameDb.recordRun(player.name, player.characterClass, player.level, world.currentFloor, player.kills, player.gold, Math.floor((Date.now() - gameStartTime) / 1000), 0, gameDifficulty);
                  gameDb.deleteCharacter(player.name);
                } catch (err) { console.error('[HC] Delete failed:', err.message); }
              }
              inventories.delete(p.id);
              ctx.controllerSockets.delete(sid);
              players.delete(sid);
              console.log(`[HC] ${player.name} PERMADEATH — character deleted. Level ${player.level}, ${player.kills} kills.`);
              break;
            }
          }
          gameNs.emit('hardcore:death', { id: player.id, name: player.name, level: player.level, characterClass: player.characterClass });
          continue;
        }

        // Normal respawn, notify
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

    // Collision safety net: if player somehow ended up in a wall, nudge out
    for (const player of allPlayers) {
      if (!player.alive || player.isDying) continue;
      if (!world.isWalkable(player.x, player.y)) {
        // Try small offsets to find nearest walkable tile
        const nudge = 32;
        const offsets = [[0,-nudge],[0,nudge],[-nudge,0],[nudge,0],[-nudge,-nudge],[nudge,-nudge],[-nudge,nudge],[nudge,nudge]];
        let found = false;
        for (const [ox, oy] of offsets) {
          if (world.isWalkable(player.x + ox, player.y + oy)) {
            player.x += ox;
            player.y += oy;
            found = true;
            break;
          }
        }
        if (!found) {
          const spawn = world.getSpawnPosition(0);
          player.x = spawn.x;
          player.y = spawn.y;
        }
      }
    }

    // Room discovery and wave spawning
    const roomEvents = world.updateRoomDiscovery(allPlayers);
    const spawnCtx = { world, gameDifficulty, gameNs, controllerNs };
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

      // ── Treasure Goblin spawn chance (Phase 21.1) ─────────────────
      if (ev.type === 'room:discovered') {
        trySpawnGoblin(ev, spawnCtx);
      }

      // ── Cursed Event spawn chance (Phase 21.2) ───────────────────
      if (ev.type === 'room:discovered') {
        trySpawnCursedEvent(ev, spawnCtx);
      }
    }

    // ── Cursed Event tick + wave management (Phase 21.2) ──
    if (world.cursedEvent && world.cursedEvent.active && !world.cursedEvent.completed && !world.cursedEvent.failed) {
      const ce = world.cursedEvent;
      ce.tick();

      // Spawn wave if needed (first wave after interact, or subsequent waves after clearing)
      if (ce.needsSpawn) {
        ce.needsSpawn = false;
        spawnCursedEventWave(ce, spawnCtx);
      }

      // Track remaining event monsters
      const eventMonstersAlive = world.monsters.filter(m => m.alive && m.eventMonster).length;
      ce.monstersRemaining = eventMonstersAlive;

      // Wave cleared: all event monsters dead AND at least one wave was spawned
      if (eventMonstersAlive === 0 && ce.wavesSpawned > 0) {
        ce.waveCleared();

        if (ce.completed) {
          // ── Event completed: generate reward ──
          if (ce.rewardType === 'item') {
            // Cursed chest: drop high-tier items (large tierBoost for epic+ bias)
            const rewardCount = 2 + Math.floor(Math.random() * 2); // 2-3 items
            for (let i = 0; i < rewardCount; i++) {
              const item = Math.random() < 0.5
                ? generateWeapon(world.currentFloor + 3)
                : generateArmor(world.currentFloor + 3);
              world.addGroundItem(item, ce.x + (Math.random() - 0.5) * 40, ce.y + (Math.random() - 0.5) * 40);
            }
            // Bonus gold
            const gMult = (DIFFICULTY_SCALES[gameDifficulty] || DIFFICULTY_SCALES.normal).goldMult;
            const gold = generateConsumable('gold', Math.floor((50 + world.currentFloor * 25) * gMult));
            if (gold) world.addGroundItem(gold, ce.x, ce.y + 20);
          } else if (ce.rewardType === 'stat_buff') {
            // Cursed shrine: +2 random stat to all players for rest of floor
            const statKeys = ['str', 'dex', 'int', 'vit'];
            const buffStat = statKeys[Math.floor(Math.random() * statKeys.length)];
            for (const p of allPlayers) {
              if (!p.stats) continue;
              p.stats[buffStat] = (p.stats[buffStat] || 0) + ce.buffAmount;
              if (p.recalcStats) p.recalcStats();
            }
            const buffPayload = { stat: buffStat, amount: ce.buffAmount };
            gameNs.emit('event:buff', buffPayload);
            controllerNs.emit('event:buff', buffPayload);
            controllerNs.emit('notification', { text: `Cursed Shrine conquered! +${ce.buffAmount} ${buffStat.toUpperCase()} for all!`, type: 'quest' });
            // Update phone stats for all players
            for (const [sid, p] of players) {
              const sock = controllerNs.sockets.get(sid);
              if (sock) sock.emit('stats:update', p.serializeForPhone());
            }
          }

          const completePayload = { type: ce.type, reward: ce.rewardType };
          gameNs.emit('event:complete', completePayload);
          controllerNs.emit('event:complete', completePayload);
          controllerNs.emit('notification', { text: `${ce.name} conquered!`, type: 'quest' });
          console.log(`[Event] ${ce.name} completed!`);
          world.cursedEvent = null;
        }
        // needsSpawn is set by waveCleared() if more waves remain
      }

      // Check for failure (timer expired)
      if (ce && ce.failed) {
        gameNs.emit('event:failed', { type: ce.type });
        controllerNs.emit('event:failed', { type: ce.type });
        controllerNs.emit('notification', { text: `${ce.name} failed! Time expired.`, type: 'error' });
        console.log(`[Event] ${ce.name} failed — timer expired.`);
        // Kill remaining event monsters
        for (const m of world.monsters) {
          if (m.eventMonster && m.alive) {
            m.alive = false;
          }
        }
        world.cursedEvent = null;
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
      if (!monster._world) monster._world = world;  // wall collision reference
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
              const dmg = player.takeDamage(event.damage, 'cold', event.attackerName || 'Cold Enchanted');
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
        // Treasure Goblin escaped (Phase 21.1)
        else if (event.type === 'goblin:escaped') {
          console.log(`[Goblin] Treasure Goblin escaped!`);
          gameNs.emit('goblin:escaped', { monsterId: event.monsterId });
          controllerNs.emit('goblin:escaped', { monsterId: event.monsterId });
          controllerNs.emit('notification', { text: 'The Treasure Goblin escaped!', type: 'warning' });
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
        world.cursedEvent = null;
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

    // Check for cross-class combos BEFORE projectile:create removal
    // (Shadow Barrage needs projectile:create events to detect Sniper Shot)
    const activePlayers = Array.from(players.values());
    if (activePlayers.length >= 2 && combat.events.length > 0) {
      const comboResults = comboTracker.checkCombos(combat.events, activePlayers, world.monsters, world);
      if (comboResults.length > 0) {
        combat.events.push(...comboResults);
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

          // ── Treasure Goblin kill — massive loot explosion (Phase 21.1) ──
          if (deadMonster.isTreasureGoblin) {
            console.log(`[Goblin] Treasure Goblin killed by ${event.killedByName}!`);
            const goblinLoot = [];

            // 3-5 items with boosted rarity (minimum rare, high tierBoost)
            const goblinItemCount = 3 + Math.floor(Math.random() * 3);
            const goblinTierBoost = world.currentFloor + 5; // heavy rarity boost
            const rarityOrder = ['common', 'uncommon', 'rare', 'epic', 'legendary'];

            for (let i = 0; i < goblinItemCount; i++) {
              const roll = Math.random();
              let item;
              if (roll < 0.4) {
                item = generateWeapon(goblinTierBoost);
              } else if (roll < 0.8) {
                item = generateArmor(goblinTierBoost);
              } else {
                item = generateAccessory(goblinTierBoost);
              }
              // Force minimum rare rarity
              const rarityIdx = rarityOrder.indexOf(item.rarity);
              if (rarityIdx < 2) {
                item.rarity = 'rare';
                item.rarityColor = RARITIES.rare.color;
                const prefix = PREFIXES.rare[Math.floor(Math.random() * PREFIXES.rare.length)];
                const nameParts = item.name.split(' ');
                const baseName = nameParts.length > 1 ? nameParts.slice(1).join(' ') : nameParts[0];
                const category = item.type === 'weapon' ? 'weapon' : (item.type === 'accessory' ? 'accessory' : 'armor');
                item.name = buildItemName(prefix, baseName, 'rare', item.bonuses, category, item.subType);
              }
              goblinLoot.push(item);
            }

            // 200-500 gold
            const goblinGold = 200 + Math.floor(Math.random() * 301);
            goblinLoot.push(generateConsumable('gold', goblinGold));

            // 50% chance for a gem
            if (Math.random() < 0.5) {
              const tier = world.currentFloor >= 20 ? 3 : world.currentFloor >= 10 ? 2 : 1;
              const gemType = GEM_TYPES[Math.floor(Math.random() * GEM_TYPES.length)];
              const gem = generateGem(gemType, tier);
              if (gem) goblinLoot.push(gem);
            }

            // Drop all goblin loot as ground items
            for (const loot of goblinLoot) {
              const lx = deadMonster.x + (Math.random() - 0.5) * 60;
              const ly = deadMonster.y + (Math.random() - 0.5) * 60;
              world.addGroundItem(loot, lx, ly);
            }

            // Emit goblin:killed to all sockets
            gameNs.emit('goblin:killed', {
              monsterId: deadMonster.id,
              killedBy: event.killedByName,
              x: Math.round(deadMonster.x),
              y: Math.round(deadMonster.y),
              lootCount: goblinLoot.length,
            });
            controllerNs.emit('goblin:killed', {
              monsterId: deadMonster.id,
              killedBy: event.killedByName,
            });
            controllerNs.emit('notification', { text: 'Treasure Goblin slain! Loot everywhere!', type: 'quest' });
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

            // Spawn Enchant NPC in boss room
            const bossRoom = world.rooms.find(rm => rm.type === 'boss');
            if (bossRoom) {
              world.spawnEnchantNpc(bossRoom);
            }
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
              world.cursedEvent = null;
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

      // Forward combo:trigger events to ALL players' phones
      if (event.type === 'combo:trigger') {
        for (const [sid, player] of players) {
          controllerNs.to(sid).emit('notification', {
            text: `COMBO: ${event.comboName}!`,
            type: 'combo',
          });
        }

        // Apply combo damage/effects to monsters
        const r2 = (event.radius || 100) * (event.radius || 100);

        if (event.comboId === 'shatter_blast' && event.damage) {
          for (const m of world.monsters) {
            if (!m.alive) continue;
            const dx = m.x - event.x, dy = m.y - event.y;
            if (dx * dx + dy * dy <= r2) {
              const dealt = applyArmor(event.damage, m.armor || 0);
              m.hp -= dealt;
              combat.events.push({ type: 'combat:hit', targetId: m.id, damage: dealt, damageType: 'cold', skillName: 'Shatter Blast' });
              if (m.hp <= 0) {
                m.hp = 0; m.alive = false;
                combat.events.push({ type: 'combat:death', entityId: m.id, killedBy: event.triggerId });
              }
            }
          }
        }

        if (event.comboId === 'battle_fury') {
          for (const m of world.monsters) {
            if (!m.alive) continue;
            const dx = m.x - event.x, dy = m.y - event.y;
            if (dx * dx + dy * dy <= r2) {
              const dist = Math.sqrt(dx * dx + dy * dy) || 1;
              const pull = Math.min(40, dist);
              m.x -= (dx / dist) * pull;
              m.y -= (dy / dist) * pull;
            }
          }
        }

        if (event.comboId === 'firestorm') {
          for (const m of world.monsters) {
            if (!m.alive) continue;
            const dx = m.x - event.x, dy = m.y - event.y;
            if (dx * dx + dy * dy <= r2) {
              m.stunned = Math.max(m.stunned || 0, event.duration || 3000);
            }
          }
        }

        if (event.comboId === 'chain_reaction') {
          for (const m of world.monsters) {
            if (!m.alive) continue;
            const dx = m.x - event.x, dy = m.y - event.y;
            if (dx * dx + dy * dy <= r2) {
              const dealt = applyArmor(30, m.armor || 0);
              m.hp -= dealt;
              combat.events.push({ type: 'combat:hit', targetId: m.id, damage: dealt, damageType: 'lightning', skillName: 'Chain Reaction' });
              if (m.hp <= 0) {
                m.hp = 0; m.alive = false;
                combat.events.push({ type: 'combat:death', entityId: m.id, killedBy: event.triggerId });
              }
            }
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
                  damageLog: player.damageLog || [],
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
            ctx.gameWon = true;
          }

          setTimeout(() => {
            // ── VICTORY: If on final floor, emit victory instead of advancing ──
            if (isFinal) {
              const elapsed = Date.now() - ctx.gameStartTime;
              const playerStats = Array.from(players.values()).map(p => ({
                name: p.name,
                characterClass: p.characterClass,
                level: p.level,
                kills: p.kills || 0,
                gold: p.gold,
              }));

              // Determine what the next unlock is
              const DIFF_ORDER = ['normal', 'nightmare', 'hell'];
              const currentIdx = DIFF_ORDER.indexOf(ctx.gameDifficulty);
              const unlockedNext = currentIdx < DIFF_ORDER.length - 1 ? DIFF_ORDER[currentIdx + 1] : null;

              const victoryData = {
                players: playerStats,
                totalTime: elapsed,
                finalFloor: FLOOR_NAMES.length,
                difficulty: ctx.gameDifficulty,
                unlockedNext,
              };

              console.log(`[World] VICTORY! Dungeon conquered in ${Math.floor(elapsed / 1000)}s`);

              // Save final stats before emitting victory
              saveAllPlayers();

              // Record leaderboard entry for each player
              for (const ps of playerStats) {
                gameDb.recordRun(ps.name, ps.characterClass, ps.level, FLOOR_NAMES.length, ps.kills, ps.gold, Math.floor(elapsed / 1000), 1, ctx.gameDifficulty);
              }

              gameNs.emit('game:victory', victoryData);
              controllerNs.emit('game:victory', victoryData);
              world._advancing = false;
              return;
            }

            const nextFloor = world.currentFloor + 1;
            world.generateFloor(nextFloor, ctx.gameDifficulty);
            world.cursedEvent = null;
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
              difficulty: ctx.gameDifficulty,
            });
            const floorDiffLabel = ctx.gameDifficulty === 'normal' ? '' : ` [${ctx.gameDifficulty.toUpperCase()}]`;
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

    // ── Loot filter: auto-pickup ──
    if (tickCount % 10 === 0) {
      for (const [pid, player] of players) {
        if (!player.alive || player.lootFilter === 'off') continue;

        const inv = inventories.get(player.id);
        const sock = controllerNs.sockets.get(pid);
        if (!sock) continue;

        // Scan ground items within radius
        const nearby = [];
        for (const gi of world.groundItems) {
          const dx = gi.x - player.x;
          const dy = gi.y - player.y;
          if (dx * dx + dy * dy <= AUTO_PICKUP_RADIUS * AUTO_PICKUP_RADIUS) {
            nearby.push(gi);
          }
        }

        for (const gi of nearby) {
          const item = gi.item;
          let shouldPickup = false;

          if (player.lootFilter === 'basic') {
            // Basic: gold + potions only
            shouldPickup = item.type === 'currency' ||
              item.subType === 'health_potion' ||
              item.subType === 'mana_potion';
          } else if (player.lootFilter === 'smart') {
            // Smart: gold + potions + rare+ items + gems
            shouldPickup = item.type === 'currency' ||
              item.subType === 'health_potion' ||
              item.subType === 'mana_potion' ||
              item.type === 'gem' ||
              RARE_PLUS_RARITIES.has(item.rarity);
          }

          if (!shouldPickup) continue;

          // Pickup the item
          const picked = world.pickupItem(item.id, player.x, player.y, AUTO_PICKUP_RADIUS);
          if (!picked) continue;

          if (picked.type === 'currency') {
            player.gold += picked.quantity;
            if (player.questManager) player.questManager.check('collect_gold', { amount: picked.quantity });
            sock.emit('notification', { text: `+${picked.quantity} gold`, type: 'gold' });
            sock.emit('stats:update', player.serializeForPhone());
          } else if (picked.subType === 'health_potion') {
            player.healthPotions += picked.quantity;
            sock.emit('notification', { text: `+${picked.quantity} Health Potion`, type: 'info' });
            sock.emit('stats:update', player.serializeForPhone());
          } else if (picked.subType === 'mana_potion') {
            player.manaPotions += picked.quantity;
            sock.emit('notification', { text: `+${picked.quantity} Mana Potion`, type: 'info' });
            sock.emit('stats:update', player.serializeForPhone());
          } else {
            // Equipment/gem → inventory
            if (!inv) continue;
            const result = inv.addItem(picked);
            if (result.success) {
              sock.emit('notification', { text: `Auto: ${picked.name}`, type: picked.rarity || 'info' });
              sock.emit('inventory:update', inv.serialize());
            } else {
              // Put back if inventory full
              world.addGroundItem(picked, player.x, player.y);
              sock.emit('notification', { text: 'Inventory full!', type: 'error' });
            }
          }
        }
      }
    }

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

  return {
    start() {
      lastTick = Date.now();
      tickCount = 0;
      intervalId = setInterval(gameTick, TICK_MS);
      console.log(`[GameLoop] Started (${TICK_RATE} ticks/sec)`);
    },
    stop() {
      if (intervalId) {
        clearInterval(intervalId);
        intervalId = null;
        console.log('[GameLoop] Stopped');
      }
    },
  };
}

module.exports = { createGameLoop };
