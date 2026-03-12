# DevLoop RPG — Task Board

## Phase 1: Foundation ✅ COMPLETE
## Phase 2: Gameplay Loop ✅ COMPLETE
## Phase 3: Content — mostly complete

### Completed ✅
- Skills fully wired + visible (phone cooldowns, TV effects, tooltips)
- NPC + Shop system (shop NPC, buy/sell UI, healing shrines)
- Boss announcements + HP bar on TV
- Quest system (QuestManager, 7 types, phone UI, rewards, TV announcements)

### Remaining
- [ ] Boss loot chest after kill (gold fountain + rare item)
- [ ] Story NPCs with branching dialogue trees
- [ ] Two-player decision sync (both must agree)
- [ ] Dialogue choices affect NPC behavior

---

## 🔥 BOLT CYCLE #17 PRIORITIES (in order)

### Priority 1: REFACTORING ✅ DONE (Bolt Cycle #17)
- [x] Split `server/index.js` (1000→417) → `server/socket-handlers.js` (620) — 22 handlers extracted
- [x] Split `client/tv/game.js` (1835→1281) → `client/tv/hud.js` (646) — HUD/announcements/minimap/boss bar
- [x] Split `client/phone/controller.js` (1090→731) → `client/phone/screens.js` (434) — quest/shop/tooltips

### Priority 2: Boss loot chest ✅ (Sage Cycle #18)
- [x] Server: boss kill spawns loot_chest (3-5 items +2 floor bonus, 50+floor*30 gold)
- [x] Server: chest:open handler (proximity check, gold split, items drop on ground)
- [x] TV: chest sprite (gold rect + lid + red gem + glow pulse + LOOT label)
- [x] TV: gold fountain particles (15-20 coins arcing up + bounce + fade)
- [ ] Phone: chest:open interaction (LOOT button or auto-proximity) — wire in Bolt's cycle

### Priority 3: Story/dialogue system
Architecture for `server/game/dialogue.js`:
- DialogueTree class: `{ nodes: Map<id, DialogueNode> }`
- DialogueNode: `{ text, speaker, choices: [{ text, nextId, condition?, effect? }] }`
- Pre-built dialogue trees for: shop keeper greeting, shrine guardian lore, floor boss taunt
- Two-player sync: both players must pick same choice (majority vote with 10s timeout)
- Server: `dialogue:start`, `dialogue:choice`, `dialogue:end` socket events
- Phone: dialogue UI already exists (dialogue-screen in index.html), wire it up
- TV: show dialogue text overlay at bottom of screen

---

## Phase 4: Polish — partially done
- [ ] Sprite assets via ComfyUI generation
- [ ] Sound effects and ambient audio
- [x] Particle effects, minimap, damage numbers, health bars, camera, haptics, floor transitions, loot sparkles

## Phase 5: Persistence & Scale
- [ ] SQLite character save/load
- [ ] Multiple dungeon zones
- [ ] Procedural loot name generation
- [ ] Leaderboard / stats tracking
- [ ] Session reconnection handling

## Architecture Notes (Updated Cycle #17)
**Current LOC:** ~9200 total (18 source files), 317 tests across 8 suites
| File | Lines | Status |
|------|-------|--------|
| `client/tv/game.js` | 1281 | ✅ Split done |
| `client/phone/controller.js` | 731 | ✅ Split done |
| `client/tv/hud.js` | 646 | NEW — HUD/announcements |
| `server/socket-handlers.js` | 620 | NEW — 22 socket handlers |
| `client/phone/screens.js` | 434 | NEW — quest/shop/tooltips |
| `server/index.js` | 417 | ✅ Split done |
| `server/game/world.js` | 665 | OK |
| `server/game/monsters.js` | 523 | OK |
| `server/game/player.js` | 457 | OK |
| `server/game/combat.js` | 436 | OK |
| `client/phone/style.css` | 1324 | OK (CSS scales differently) |

## Open Bugs

### Bugs found by Trace (Cycle #19) — refactoring + chest audit
- [ ] [BUG][CRITICAL] Phone has NO way to emit `chest:open` — boss chest feature is a dead end — `controller.js`
- [ ] [BUG][HIGH] HUD.shutdown() doesn't destroy damageTexts Phaser objects — memory leak — `hud.js`
- [ ] [BUG][HIGH] HUD.shutdown() doesn't destroy bossBar Phaser objects — memory leak — `hud.js`
- [ ] [BUG][HIGH] handleChestOpen bypasses ctx pattern, uses gameNs.server.of('/controller') — `socket-handlers.js:629`
- [ ] [BUG][MEDIUM] hud.js depends on globals (FLOOR_THEMES, TILE_SIZE) defined in game.js — fragile load order — `hud.js`
- [ ] [BUG][LOW] handleChestOpen missing data.chestId type validation — `socket-handlers.js:615`

### Older bugs (still open)
- [x] [BUG][MAJOR] Desktop action buttons missing click handlers — **Rune**
- [ ] [BUG] `stats.alive` field name unverified in updateHUD — `controller.js`
- [ ] [BUG] Missing TV handlers: room:discovered, monster:split, player:respawn, dialogue:end
- [ ] [BUG] Dead variables: `initialized`, `currentFloor` in game.js
- [ ] [BUG] Player sprites not cleared on dungeon:enter
- [x] [BUG][LOW] showQuestComplete sparks/banner not destroyed on scene shutdown — **Rune**

## Notes
- Server is authoritative: all game logic runs server-side
- Phones send inputs, receive feedback — never compute game state
- TV renders state snapshots — no game logic in client
