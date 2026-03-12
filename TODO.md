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

---

## 🔥 BOLT CYCLE #32 PRIORITIES

### Priority 1: URGENT — Split game.js (1553 LOC, over 1500 threshold)

**1A. Extract `client/tv/sprites.js`** — all sprite creation/update/cleanup
Move these out of game.js into a `window.Sprites` global:
- `createPlayerSprite()`, `updatePlayerSprite()`, player sprite cleanup
- `createMonsterSprite()`, `updateMonsterSprite()`, monster sprite cleanup (including null guards)
- `createItemSprite()`, item sprite cleanup
- Story NPC sprite creation (triangular sage, armored guardian, hunched herald), glow rings, "!" markers
- NPC sprite cleanup (both in-update and dungeon:enter paths)
- All `killTweensOf()` calls for sprite sub-objects

Target: game.js drops to ~1000 LOC, sprites.js ~550 LOC.

Script load order in tv/index.html: `phaser → socket.io → sound.js → sprites.js → hud.js → game.js`

### Priority 2: Victory condition + endgame (CRITICAL gameplay gap)

The game has 7 named floors but NO end state. Players can generate floors infinitely.

**2A. Floor 7 boss = final boss** — `server/game/world.js`
- After floor 7 boss dies → emit `game:victory` event instead of spawning exit
- Victory data: `{ players: [{name, class, level, kills, gold}], floors: 7, time: elapsed }`

**2B. TV victory screen** — `client/tv/game.js` (or hud.js)
- On `game:victory`: fade to gold overlay, "DUNGEON CONQUERED" title with particle celebration
- Show player stats (class, level, kills, gold collected)
- "Play Again?" prompt

**2C. Phone victory screen** — `client/phone/controller.js`
- On `game:victory`: show victory panel with stats + "NEW GAME" button
- Haptic burst (200ms vibrate)

**2D. Server reset** — `server/index.js`
- On "new game" from both players → `world.generateFloor(0)`, reset player stats to level 1
- OR: keep levels, restart dungeon (NG+ lite)

### Priority 3: Procedural loot names (quick win, big flavor)

Current items are "Worn Sword", "Mythic Plate Helmet" — generic prefix + type.

**3A. Name generator** — `server/game/items.js`
Add procedural name parts:
```
Prefixes by rarity: Rusty, Sturdy, Gleaming, Infernal, Godforged
Suffixes: "of the Bear" (+STR), "of the Fox" (+DEX), "of Wisdom" (+INT), "of Vitality" (+VIT)
Legendary names: handcrafted pool of 15-20 unique names ("Shadowfang", "Dawnbreaker", etc.)
```
Result: "Gleaming Axe of the Bear" (rare, +STR) or "Shadowfang" (legendary).

---

## Phase 5: Persistence & Scale

### Priority 4: SQLite character save/load (Phase 5 foundation)
- `better-sqlite3` already in package.json but unused
- Schema: `characters` table (name, class, level, xp, stats, equipment JSON, inventory JSON, gold, floor)
- Auto-save on floor transition + every 60s
- Load on reconnect (match by player name)
- New file: `server/game/database.js`

### Priority 5: Session reconnection
- On disconnect → keep player alive for 30s (grace period)
- On reconnect within grace → restore full state
- On reconnect after grace → load from SQLite
- Phone shows "Reconnecting..." overlay

### Future (not this cycle)
- [ ] Multiple dungeon zones (different tilesets, monster pools)
- [ ] Damage types (fire/ice/physical/poison) + resistances
- [ ] Set bonuses (3-4 item sets with 2/3/5-piece bonuses)
- [ ] Unique legendary item effects (special procs)
- [ ] Monster affixes (Fast, Extra Strong, Fire Enchanted)
- [ ] Leaderboard / stats tracking
- [ ] Sprite assets via ComfyUI generation

---

## Architecture Notes (Updated Cycle #31)
**Current LOC:** ~10,650 source + 3,500 tests = 14,150 total (21 source files, 10 test suites, 365 tests)
**URGENT SPLIT:** `game.js` at 1553 lines — OVER 1500 threshold. Extract sprite logic into `sprites.js`.
**Watch:** `controller.js` at 873, `socket-handlers.js` at 736 — both under threshold but growing.
**No persistence yet.** `better-sqlite3` in package.json, not imported anywhere.

## Open Bugs
None. All bugs resolved through Cycle #30.

## Notes
- Server is authoritative: all game logic runs server-side
- Phones send inputs, receive feedback — never compute game state
- TV renders state snapshots — no game logic in client
- Sound module shared between TV + phone (client/shared/sound.js)
- 7 floors defined (Dusty Catacombs → Throne of Ruin), floor 7 = final
- Boss Knight has 3-phase AI (melee → charge → aoe_frenzy)
- 3 classes × 3 skills = 9 total skills with cooldowns
