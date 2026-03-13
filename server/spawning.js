/**
 * Spawning logic extracted from index.js
 * Handles monster spawning for cursed events, treasure goblins, and room discovery.
 * Each function receives a context object (ctx) with shared game state references.
 */

const { createMonster } = require('./game/monsters');
const { TILE_SIZE, DIFFICULTY_SCALES, getZoneForFloor, SPAWN_STAGGER_MS } = require('./game/world');
const { AFFIX_DEFS, rollAffixes, applyAffixes } = require('./game/affixes');
const { rollCursedEvent } = require('./game/events');

/**
 * Spawn a wave of monsters for an active cursed event.
 * @param {Object} cursedEvent - The active cursed event object
 * @param {Object} ctx - Context: { world, gameDifficulty, gameNs, controllerNs }
 */
function spawnCursedEventWave(cursedEvent, ctx) {
  const { world, gameDifficulty, gameNs, controllerNs } = ctx;

  const count = cursedEvent.getMonstersForWave();
  if (count <= 0) return;

  const isElite = cursedEvent.isEliteWave();
  const room = cursedEvent.room.room; // roomData.room = {x,y,w,h}
  const zone = getZoneForFloor(world.currentFloor);
  const monsterPool = zone.monsterPool;
  const scale = DIFFICULTY_SCALES[gameDifficulty] || DIFFICULTY_SCALES.normal;

  const spawned = [];
  for (let i = 0; i < count; i++) {
    const type = monsterPool[Math.floor(Math.random() * monsterPool.length)];
    const mx = (room.x + 1 + Math.random() * (room.w - 2)) * TILE_SIZE;
    const my = (room.y + 1 + Math.random() * (room.h - 2)) * TILE_SIZE;
    const monster = createMonster(type, mx, my, world.currentFloor);

    // Apply difficulty scaling
    monster.hp = Math.floor(monster.hp * scale.hpMult);
    monster.maxHp = Math.floor(monster.maxHp * scale.hpMult);
    monster.damage = Math.floor(monster.damage * scale.dmgMult);
    monster.xpReward = Math.floor(monster.xpReward * scale.xpMult);
    monster.goldMult = scale.goldMult;

    // Force elite for elite waves (cursed shrine all waves, cursed chest last wave)
    if (isElite) {
      const affixCount = cursedEvent.type === 'cursed_shrine' ? 2 : 1;
      const affixKeys = Object.keys(AFFIX_DEFS);
      const picked = [];
      const available = [...affixKeys];
      for (let a = 0; a < Math.min(affixCount, available.length); a++) {
        const idx = Math.floor(Math.random() * available.length);
        picked.push(available[idx]);
        available.splice(idx, 1);
      }
      applyAffixes(monster, { affixes: picked, rank: 'champion' });
    } else {
      // Normal waves: still roll for affixes normally
      const affixResult = rollAffixes(world.currentFloor, type, scale.eliteBonus);
      if (affixResult) applyAffixes(monster, affixResult);
    }

    // Mark as event monster for tracking
    monster.eventMonster = true;
    monster.aiState = 'alert'; // immediately aggressive

    // Staggered spawn: each monster pops in 200ms apart (24.2C)
    monster.spawning = true;
    monster.spawnDelay = i * SPAWN_STAGGER_MS;

    world.monsters.push(monster);
    spawned.push(monster);
  }

  cursedEvent.monstersRemaining = count;
  cursedEvent.wavesSpawned++;

  const waveNum = cursedEvent.currentWave + 1;
  const wavePayload = { wave: waveNum, totalWaves: cursedEvent.totalWaves, monstersCount: count };
  gameNs.emit('event:wave', wavePayload);
  controllerNs.emit('event:wave', wavePayload);
  controllerNs.emit('notification', { text: `${cursedEvent.name} — Wave ${waveNum}/${cursedEvent.totalWaves}! (${count} enemies)`, type: 'warning' });
  console.log(`[Event] ${cursedEvent.name} wave ${waveNum}/${cursedEvent.totalWaves}: ${count} monsters (elite: ${isElite})`);
}

/**
 * Try to spawn a Treasure Goblin in a newly discovered room.
 * @param {Object} ev - Room discovery event { roomId, roomName, roomType }
 * @param {Object} ctx - Context: { world, gameNs, controllerNs }
 * @returns {boolean} Whether a goblin was spawned
 */
function trySpawnGoblin(ev, ctx) {
  const { world, gameNs, controllerNs } = ctx;

  if (ev.roomType === 'boss' || ev.roomType === 'start') return false;
  if (Math.random() >= 0.08) return false;

  // Find the room data to get center position
  const goblinRoom = world.rooms.find(r => r.id === ev.roomId);
  if (!goblinRoom) return false;

  const r = goblinRoom.room;
  const cx = (r.x + r.w / 2) * TILE_SIZE;
  const cy = (r.y + r.h / 2) * TILE_SIZE;
  const goblin = createMonster('treasure_goblin', cx, cy, world.currentFloor);
  world.monsters.push(goblin);
  console.log(`[Goblin] Treasure Goblin spawned in ${ev.roomName}!`);
  gameNs.emit('goblin:spawn', { id: goblin.id, x: Math.round(cx), y: Math.round(cy), roomName: ev.roomName });
  controllerNs.emit('notification', { text: 'A Treasure Goblin appears!', type: 'warning' });
  return true;
}

/**
 * Try to spawn a Cursed Event in a newly discovered room.
 * @param {Object} ev - Room discovery event { roomId, roomName }
 * @param {Object} ctx - Context: { world, gameNs, controllerNs }
 * @returns {boolean} Whether a cursed event was spawned
 */
function trySpawnCursedEvent(ev, ctx) {
  const { world, gameNs, controllerNs } = ctx;

  if (world.cursedEvent) return false;

  const discoveredRoom = world.rooms.find(r => r.id === ev.roomId);
  if (!discoveredRoom) return false;

  const cursed = rollCursedEvent(discoveredRoom);
  if (!cursed) return false;

  const r = discoveredRoom.room;
  cursed.x = (r.x + r.w / 2) * TILE_SIZE;
  cursed.y = (r.y + r.h / 2) * TILE_SIZE;
  world.cursedEvent = cursed;
  console.log(`[Event] ${cursed.name} spawned in ${ev.roomName}!`);
  gameNs.emit('event:spawn', cursed.serialize());
  controllerNs.emit('event:spawn', cursed.serialize());
  controllerNs.emit('notification', { text: `A ${cursed.name} appears! Interact to activate.`, type: 'warning' });
  return true;
}

module.exports = {
  spawnCursedEventWave,
  trySpawnGoblin,
  trySpawnCursedEvent,
};
