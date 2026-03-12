# DevLoop RPG — Task Board

## Phase 1: Foundation ✅ COMPLETE
- [x] Project scaffold and spec — **Aria**
- [x] Server: Express + Socket.io + game loop — **Aria**
- [x] Server: Player class with stats, skills, leveling — **Aria**
- [x] Server: World state manager — **Aria**
- [x] Server: Combat system with damage formulas — **Aria**
- [x] Server: Monster definitions + AI state machine — **Aria**
- [x] Server: Item/loot system with rarities — **Aria**
- [x] Server: Grid inventory (10x6) — **Aria**
- [x] Client: TV Phaser 3 renderer — **Aria**
- [x] Client: Phone controller with joystick — **Aria**
- [x] Test: 237 unit tests (vitest) — **Trace (Cycle #4)**

## Phase 2: Gameplay Loop ✅ COMPLETE
- [x] Dungeon room generation (BSP algorithm) — **Bolt (Cycle #2)**
- [x] Tilemap rendering in Phaser (7 floor themes) — **Bolt (Cycle #2)**
- [x] Monster spawn waves per room (1-3 waves) — **Bolt (Cycle #2)**
- [x] Loot drop rendering (rarity glow rings) — **Bolt (Cycle #2)**
- [x] Item pickup flow (proximity check, gold+equip) — **Bolt (Cycle #2)**
- [x] Equipment stat application (recalcEquipBonuses) — **Aria (in player.js)**
- [x] XP/leveling with stat allocation on phone — **Aria + Bolt**
- [x] Health/mana potion usage — **Aria (in player.js + index.js)**
- [x] Death and respawn system (5s timer, penalties) — **Bolt (Cycle #2)**

## Phase 3: Content — 🔥 PRIORITY FOR BOLT (Cycle #7)

### Priority 1: Skills fully wired + visible on phone ✅
- [x] Skill cooldown display on phone (short names + MP cost + cooldown overlay) — **Bolt (Cycle #7)**
- [x] Skill effects visible on TV (AoE, projectiles, buffs, teleport) — **Bolt (Cycle #7)**
- [x] Skill tooltips on phone (500ms hold → description, MP, cooldown) — **Sage (Cycle #8)**

### Priority 2: NPC + Shop system ✅
- [x] Shop NPC spawns in start room — buys/sells items, scales with floor — **Bolt (Cycle #7)**
- [x] Shop UI on phone (buy/sell tabs, gold display, price estimation) — **Bolt (Cycle #7)**
- [x] NPC healing shrine in random rooms (30% chance, full HP/MP) — **Bolt (Cycle #7)**

### Priority 3: Boss content — partially done
- [x] Boss announcements on TV (name, "PREPARE FOR BATTLE", dark overlay) — **Sage (Cycle #8)**
- [x] Boss HP bar at bottom of TV (phase indicator, color transitions) — **Sage (Cycle #8)**
- [ ] Boss loot chest after kill (gold fountain + rare item) — **Bolt**

### 🔥 Priority 4: Quest system — BOLT CYCLE #12 FOCUS
Architecture: `server/game/quests.js` (NEW module)

**Bolt must implement:**
- [ ] `server/game/quests.js` — Quest engine with QuestManager class:
  - Quest types: `kill_count` (kill N monsters), `kill_type` (kill N of specific type), `reach_floor` (reach floor N), `clear_rooms` (clear N rooms), `collect_gold` (collect N gold)
  - Each quest: `{ id, type, title, description, target, progress, reward: { gold, item? }, completed, claimed }`
  - `QuestManager.check(event, data)` — called on kills, floor changes, room clears, gold pickups
  - `QuestManager.getActiveQuests()` — returns array for phone display
  - `QuestManager.claimReward(questId)` — grants reward, marks claimed
  - 3-5 quests active per floor, auto-generated on floor entry
- [ ] Wire quest events in `server/index.js`:
  - On monster kill → `questMgr.check('kill', { type, isBoss })`
  - On room clear → `questMgr.check('clear_room', {})`
  - On floor change → `questMgr.check('reach_floor', { floor })` + generate new quests
  - On gold pickup → `questMgr.check('collect_gold', { amount })`
  - Emit `quest:update` to phone when quest progress changes
  - Add `quest:claim` socket handler
- [ ] Phone: `quest:update` handler + quest log UI (collapsible list, progress bars)
- [ ] Quest rewards: gold + chance for rare item on claim

### Priority 5: Refactoring — BOLT should do BEFORE quest system
- [ ] Extract `server/socket-handlers.js` from `server/index.js` (864→~400+400)
  - Move all socket.on handlers into exported functions
  - index.js keeps server setup, game loop, state management
- [ ] Extract `client/tv/hud.js` from `client/tv/game.js` (1710→~1200+500)
  - Move HUD elements, boss bar, minimap, announcements, damage numbers into separate file
  - game.js keeps scene lifecycle, rendering, socket events

### Priority 6: Story/dialogue (after quests)
- [ ] Story NPCs with branching dialogue trees — **Bolt**
- [ ] Two-player decision sync (both must agree) — **Bolt**
- [ ] Dialogue choices affect NPC behavior — **Bolt**

## Phase 4: Polish — partially done
- [ ] Sprite assets via ComfyUI generation — **Art Agent**
- [ ] Sound effects and ambient audio — **Art Agent**
- [x] Particle effects (celebration, sparkles) — **Sage (Cycle #3)**
- [x] Minimap on TV — **Bolt (Cycle #2)**
- [x] Damage number popups (crit/dodge/heal) — **Sage (Cycle #3)**
- [x] Health bar rendering above entities — **Sage (Cycle #3)**
- [x] Smooth camera follow (lerp 0.08) — **Sage (Cycle #3)**
- [x] Phone haptic feedback on hits — **Bolt (Cycle #2)**
- [x] Floor transition effects — **Sage (Cycle #3)**
- [x] Loot bobbing + legendary sparkles — **Sage (Cycle #3)**

## Phase 5: Persistence & Scale
- [ ] SQLite character save/load — **Backend Agent**
- [ ] Multiple dungeon zones — **Backend Agent**
- [ ] Procedural loot name generation — **Backend Agent**
- [ ] Leaderboard / stats tracking — **Full Stack**
- [ ] Session reconnection handling — **Backend Agent**

## Architecture Notes (Aria, Cycle #6)
- `client/tv/game.js` at 1238 lines — approaching split threshold. If Bolt adds more, extract HUD/minimap into separate file.
- `server/index.js` at 716 lines — extract socket handlers into `server/socket-handlers.js` when it hits 800+.
- Consider adding `server/game/shop.js` for Phase 3 shop system.
- Consider adding `server/game/quests.js` for quest tracking.

## Bugs & Issues

### Critical — ALL FIXED by Rune (Cycle #5)
- [x] [BUG] `pickRarity()` tierBoost inverted — weight adjustment fix — **Rune**
- [x] [BUG] Ground item bobbing NaN — numeric hash of UUID — **Rune**
- [x] [BUG] `hideTooltip` not on `window` — added window.hideTooltip — **Rune**

### Major — ALL FIXED by Rune (Cycle #5)
- [x] [BUG] Monster texture memory leak — textures.remove on death — **Rune**
- [x] [BUG] No `safe-area-inset` padding — env() added — **Rune**
- [x] [BUG] `initButtons()` stacked listeners — buttonsInitialized guard — **Rune**
- [ ] [BUG] `stats.alive` field name unverified in updateHUD — `client/phone/controller.js:~227`

### Minor — Mostly fixed by Rune (Cycle #5)
- [x] [BUG] Tile texture overwrite — remove before regenerate — **Rune**
- [x] [BUG] click→touchstart conversion — all buttons fixed — **Rune**
- [x] [BUG] Wake lock moved to joined handler — **Rune**
- [x] [BUG] Notification toast stacking — vertical offset — **Rune**
- [ ] [BUG] Missing TV handlers: room:discovered, monster:split, player:respawn, dialogue:end
- [ ] [BUG] Dead variables: `initialized`, `currentFloor` in game.js
- [ ] [BUG] Player sprites not cleared on dungeon:enter (transient stale positions)

### Server bugs found by Rune (Cycle #5)
- [x] [BUG] Missing level-up events from skill kills (single/multi) — **Rune**
- [x] [BUG] Poison Arrow dot missing death check + wrong damage value — **Rune**
- [x] [BUG] Socket input validation: skill index, stat whitelist, itemId type, slot whitelist — **Rune**

### Bugs found by Trace (Cycle #9) — ALL FIXED by Rune (Cycle #10)
- [x] [BUG] Skill tooltip uses playerStats.characterClass now — **Rune**
- [x] [BUG] Sell price formula aligned (40% of shopPrice) — **Rune**
- [x] [BUG] Shrine burst now gets x/y coords from server — **Rune**
- [x] [BUG] Player facing setRotation removed (NaN fix) — **Rune**
- [x] [BUG] Stale test already resolved (correct expectation in place) — **Rune**

## Notes
- Server is authoritative: all game logic runs server-side
- Phones send inputs, receive feedback — never compute game state
- TV renders state snapshots — no game logic in client
