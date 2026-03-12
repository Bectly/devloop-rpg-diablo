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

### Priority 1: SQLite character save/load
- `better-sqlite3` already in package.json but unused
- New file: `server/game/database.js`
- Schema: `characters` table (name, class, level, xp, stats JSON, equipment JSON, inventory JSON, gold, floor, kills)
- Auto-save on floor transition + every 60s
- Load on reconnect (match by player name)
- Migrate Player constructor to accept saved data

### Priority 2: Session reconnection
- On disconnect → keep player alive for 30s (grace period)
- On reconnect within grace → restore full state
- On reconnect after grace → load from SQLite
- Phone shows "Reconnecting..." overlay with countdown

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

## Architecture Notes (Updated Cycle #32)
**Current LOC:** ~11,500 source + 3,500 tests = 15,000 total (22 source files, 10 test suites, 365 tests)
**Split DONE:** game.js 1553 → 1057 LOC. New sprites.js at 549 LOC.
**Watch:** `controller.js` at ~900 (grew with victory screen), `socket-handlers.js` at 736 — both approaching threshold.
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
