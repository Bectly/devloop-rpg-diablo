# DevLoop RPG — Task Board

## Phase 1: Foundation ✅ COMPLETE
## Phase 2: Gameplay Loop ✅ COMPLETE
## Phase 3: Content ✅ COMPLETE
## Phase 4: Polish ✅ COMPLETE (sound, particles, minimap, damage numbers, health bars, camera, haptics, floor transitions, loot sparkles, dialogue sync)

### Completed ✅
- Skills fully wired + visible (phone cooldowns, TV effects, tooltips)
- NPC + Shop system (shop NPC, buy/sell UI, healing shrines)
- Boss announcements + HP bar on TV
- Quest system (QuestManager, 7 types, phone UI, rewards, TV announcements)
- Refactoring: 3 file splits (index→socket-handlers, game→hud, controller→screens)
- Boss loot chest (server spawn, TV visuals, phone LOOT interaction)
- Dialogue system wired end-to-end (phone + TV, typewriter effect, NPC type colors)
- Story NPCs (Old Sage, Shrine Guardian, Dying Adventurer) with distinct sprites + "!" markers
- Sound effects system (13 procedural Web Audio sounds, TV + phone wired)
- Two-player dialogue sync (vote collection, timeout, majority wins)
- All bugs fixed through Cycle #30 (sprite null guards, sound bufSize, TV audio unlock)
- game.js split → sprites.js (1553 → 1057 LOC) — Cycle #32
- Victory condition + endgame screens (server + TV + phone) — Cycle #32
- Procedural loot names (suffixes, legendary unique names) — Cycle #32

---

## 🔥 NEXT PRIORITIES (Phase 5: Persistence & Scale)

### 5.1 SQLite database layer [DONE — Aria, Cycle #36]
- [x] `server/game/database.js` — `GameDatabase` class
- [x] Schema: `characters` table (name PK, class, level, xp, stats JSON, equipment JSON, inventory JSON, gold, floor, kills, potions, free_stat_points)
- [x] `saveCharacter(player, inventory)` — INSERT OR REPLACE
- [x] `loadCharacter(name)` — returns parsed object or null
- [x] WAL mode, prepared statements, auto-create data dir

### 5.2 Wire persistence into server [DONE — Bolt, Cycle #37]
**Files to change:** `server/index.js`, `server/socket-handlers.js`, `server/game/player.js`

**Step A: Init DB in index.js**
```js
const { GameDatabase } = require('./game/database');
const gameDb = new GameDatabase();
// Pass gameDb in ctx: { players, inventories, ..., gameDb }
```

**Step B: Player.restoreFrom(savedData)**
Add static method or extend constructor in `player.js`:
- Accept saved data object from `db.loadCharacter()`
- Restore: level, xp, stats, equipment, gold, kills, potions, freeStatPoints
- Call `recalcEquipBonuses()` after restoring equipment
- Keep new UUID (don't restore old ID)

**Step C: handleJoin — check DB first**
In `socket-handlers.js` `handleJoin()`:
- Before creating new Player, try `gameDb.loadCharacter(data.name)`
- If found → create Player, call `player.restoreFrom(saved)`, restore inventory items
- If not found → new player as before
- Emit `notification` "Character loaded!" or "New character created!"

**Step D: Auto-save triggers**
1. Floor transition (index.js ~line 469): after `world.generateFloor(nextFloor)`, save all players
2. 60-second interval in game loop: `if (tickCount % (TICK_RATE * 60) === 0) saveAllPlayers()`
3. Disconnect handler: save before removing player
4. Victory: save final stats before emitting victory

**Step E: Graceful shutdown**
```js
process.on('SIGINT', () => { saveAllPlayers(); gameDb.close(); process.exit(0); });
```

### 5.3 Session reconnection [PRIORITY: AFTER 5.2]
- On disconnect → keep player in `disconnectedPlayers` Map for 30s (grace period)
- On reconnect with same name within grace → restore full in-memory state
- On reconnect after grace → load from SQLite (via 5.2 Step C)
- Phone: "Reconnecting..." overlay with countdown timer
- TV: ghost sprite (50% opacity) for disconnected players during grace

### Future (not this cycle)
- [ ] Multiple dungeon zones (different tilesets, monster pools)
- [ ] Damage types (fire/ice/physical/poison) + resistances
- [ ] Set bonuses (3-4 item sets with 2/3/5-piece bonuses)
- [ ] Unique legendary item effects (special procs)
- [ ] Monster affixes (Fast, Extra Strong, Fire Enchanted)
- [ ] Leaderboard / stats tracking
- [ ] Sprite assets via ComfyUI generation

---

## Architecture Notes (Updated Cycle #32)
**Current LOC:** ~11,600 source + 3,800 tests = 15,400 total (22 source files, 12 test suites, 393 tests)
**Split DONE:** game.js 1553 → 1057 LOC. New sprites.js at 549 LOC.
**Watch:** `controller.js` at ~900 (grew with victory screen), `socket-handlers.js` at 736 — both approaching threshold.
**Persistence:** `database.js` created (Cycle #36). Wiring into server is next (5.2).

## Open Bugs
None. All bugs resolved through Cycle #35.

### Fixed (Cycle #35)
- [x] ~~[BUG/HIGH] sprites.js:88-89 — Missing null guards on partial player cleanup~~ FIXED
- [x] ~~[BUG/HIGH] hud.js — _destroyVictoryScreen() infinite tween leak~~ FIXED (killTweensOf)
- [x] ~~[BUG/HIGH] server/index.js — Victory race condition~~ FIXED (synchronous gameWon flag)
- [x] ~~[BUG/MEDIUM] sprites.js — Monster type string matching~~ FIXED (uses m.type field now)
- [x] ~~[BUG/MEDIUM] controller.js — Victory/dialogue overlay~~ FIXED (dismisses dialogue first)

## Notes
- Server is authoritative: all game logic runs server-side
- Phones send inputs, receive feedback — never compute game state
- TV renders state snapshots — no game logic in client
- Sound module shared between TV + phone (client/shared/sound.js)
- 7 floors defined (Dusty Catacombs → Throne of Ruin), floor 7 = final
- Boss Knight has 3-phase AI (melee → charge → aoe_frenzy)
- 3 classes × 3 skills = 9 total skills with cooldowns
