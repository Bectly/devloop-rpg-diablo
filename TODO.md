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

### 5.2 Wire persistence into server [DONE — Bolt, Cycle #37 / Rune review Cycle #39]
**Files changed:** `server/index.js`, `server/socket-handlers.js`, `server/game/player.js`, `server/game/database.js`, `client/phone/controller.js`

- [x] **Step A:** DB init in index.js + gameDb in ctx
- [x] **Step B:** `Player.restoreFrom(savedData)` — restores level, xp, stats, equipment, gold, kills, potions, freeStatPoints; calls `recalcEquipBonuses()`
- [x] **Step C:** `handleJoin` DB lookup — restores or creates new character
- [x] **Step D:** Auto-save triggers — floor transition, 60s interval, disconnect, victory
- [x] **Step E:** Graceful shutdown — SIGINT/SIGTERM save + db.close()

**Bugs fixed in Rune review (Cycle #39):**
- `saveCharacter()` hardcoded `floor: 0` — added `floor` param (default 0)
- `saveAllPlayers()` bypassed public API via `gameDb._stmtSave` directly — now uses `gameDb.saveCharacter(player, inv, currentFloor)`
- `handleDisconnect` saved floor as 0 — now passes `world.currentFloor`
- `loadCharacter()` called `JSON.parse()` on stats/equipment/inventory with no try/catch — each field now wrapped in individual try/catch with safe fallback
- Reconnect flow (`controller.js`) re-read `name-input` DOM value instead of cached name — introduced `joinedName` variable set at join time, used on reconnect

### 5.3 Session reconnection [PRIORITY: BOLT NEXT]
**Files to change:** `server/socket-handlers.js`, `server/index.js`, `client/tv/game.js` (or `sprites.js`)

**Step A: Grace period in handleDisconnect**
Instead of immediately deleting player from `players` Map, move to a `disconnectedPlayers` Map:
```js
// In socket-handlers.js — new module-level Map
const disconnectedPlayers = new Map(); // name → { player, inventory, socketId, timer }

// In handleDisconnect:
// 1. Save to DB (already done)
// 2. Move player to disconnectedPlayers Map (key = player.name)
// 3. Set 30s timeout — when it fires, THEN delete from players + emit player:left
// 4. Do NOT emit player:left immediately — player stays visible on TV
// 5. Mark player as disconnected: player.disconnected = true
```

**Step B: Reconnect in handleJoin**
```js
// In handleJoin, BEFORE creating new Player:
// 1. Check disconnectedPlayers.has(data.name)
// 2. If found:
//    a. clearTimeout(entry.timer)
//    b. Move player back to players Map with NEW socket.id
//    c. Restore inventory reference
//    d. player.disconnected = false
//    e. Emit notification "Welcome back!"
//    f. Skip Player creation entirely
// 3. If not found: proceed with DB load or new player (existing flow)
```

**Step C: Game loop — skip disconnected players**
In `index.js` game loop, skip movement/input for players where `player.disconnected === true`.
They should still be visible (rendered on TV) but frozen in place. They should still take damage from monsters.

**Step D: TV ghost sprite**
In `client/tv/sprites.js` (or game.js), when rendering a player with `disconnected: true`:
- Set sprite alpha to 0.4
- Add a "..." or "DC" text above their head
- When they reconnect (disconnected=false), restore alpha to 1.0

**Step E: Export disconnectedPlayers from socket-handlers**
Add `disconnectedPlayers` to exports so index.js can access it for cleanup on server shutdown.

### Future (not this cycle)
- [ ] Multiple dungeon zones (different tilesets, monster pools)
- [ ] Damage types (fire/ice/physical/poison) + resistances
- [ ] Set bonuses (3-4 item sets with 2/3/5-piece bonuses)
- [ ] Unique legendary item effects (special procs)
- [ ] Monster affixes (Fast, Extra Strong, Fire Enchanted)
- [ ] Leaderboard / stats tracking
- [ ] Sprite assets via ComfyUI generation

---

## Architecture Notes (Updated Cycle #39)
**Current LOC:** ~13,642 source JS (22 source files). Largest: hud.js 1284, game.js 1073, controller.js 1002, socket-handlers.js 775.
**Split DONE:** game.js 1553 → 1057 LOC. New sprites.js at 548 LOC.
**Watch:** `controller.js` now at 1002 — over threshold (was ~900). `hud.js` at 1284 — candidate for next split.
**Persistence:** `database.js` (155 LOC) + wiring complete (Cycles #36-39). Public API (`saveCharacter(player, inv, floor)`) used consistently.

## Open Bugs
None. All bugs resolved through Cycle #39.

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
