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

### Priority 1: REFACTORING — CRITICAL, DO FIRST
Files are dangerously large. Split before adding more features.

**1A. Split `server/index.js` (1000 lines → ~500 + ~500)**
- Create `server/socket-handlers.js`
- Move ALL `socket.on(...)` handler bodies into exported functions
- Each handler function takes `(socket, io, gameNs, players, world, ...)` as params
- `index.js` keeps: server setup, Express routes, game loop, state management, namespace setup
- `index.js` calls: `handlers.onJoin(socket, ...)`, `handlers.onMove(socket, ...)`, etc.
- Pattern:
  ```javascript
  // socket-handlers.js
  exports.onQuestClaim = (socket, player, players, world, gameNs) => {
    // ... handler body moved here ...
  };

  // index.js
  const handlers = require('./socket-handlers');
  socket.on('quest:claim', (data) => handlers.onQuestClaim(socket, player, players, world, gameNs));
  ```

**1B. Split `client/tv/game.js` (1835 lines → ~1200 + ~600)**
- Create `client/tv/hud.js` — loaded via `<script src="hud.js">` before game.js
- Move to hud.js: drawMinimap, drawHUD, showWaveText, showAnnouncement, showQuestComplete, _showQuestBanner, _processQuestQueue, spawnDamageNumber, spawnCelebrationParticles, boss HP bar logic, room discovery flash
- hud.js exports functions that GameScene calls: `HUD.drawMinimap(scene, ...)`, `HUD.showAnnouncement(scene, ...)`, etc.
- game.js keeps: BootScene, GameScene lifecycle (create/update/destroy), rendering, socket events, camera, input

**1C. Split `client/phone/controller.js` (1090 lines → ~700 + ~400)**
- Create `client/phone/screens.js` — loaded before controller.js
- Move to screens.js: createQuestScreen, toggleQuestLog, renderQuests, updateQuestBadge, QUEST_ICONS, createShopScreen, toggleShop, renderShopItems, estimateSellPrice, SKILL_DESCRIPTIONS, showSkillTooltip, hideSkillTooltip
- controller.js keeps: socket connection, join flow, joystick, action buttons, updateHUD, notifications, core event handlers

### Priority 2: Boss loot chest
After refactoring, implement:
- Server: on boss kill, spawn a `loot_chest` ground item at boss position
- Server: chest contains 3-5 items (higher rarity bias) + gold fountain (50-200g)
- TV: chest sprite (gold rectangle with sparkle), open animation on interaction
- Phone: chest notification, auto-pickup gold, items go to inventory
- TV: gold fountain particle effect (15-20 gold circles spraying upward)

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

## Architecture Notes (Aria, Cycle #16)
**Current LOC:** 8508 total, 317 tests across 8 suites
| File | Lines | Status |
|------|-------|--------|
| `server/index.js` | 1000 | ⚠️ SPLIT NOW |
| `client/tv/game.js` | 1835 | ⚠️ SPLIT NOW |
| `client/phone/controller.js` | 1090 | ⚠️ SPLIT NOW |
| `client/phone/style.css` | 1324 | OK (CSS scales differently) |
| `server/game/world.js` | 665 | OK |
| `server/game/monsters.js` | 523 | OK |
| `server/game/player.js` | 457 | OK |
| `server/game/combat.js` | 436 | OK |
| `server/game/items.js` | 303 | OK |
| `server/game/quests.js` | 209 | OK |

## Open Bugs
- [x] [BUG][MAJOR] Desktop action buttons missing click handlers — **Rune** — `controller.js`
- [ ] [BUG] `stats.alive` field name unverified in updateHUD — `controller.js`
- [ ] [BUG] Missing TV handlers: room:discovered, monster:split, player:respawn, dialogue:end
- [ ] [BUG] Dead variables: `initialized`, `currentFloor` in game.js
- [ ] [BUG] Player sprites not cleared on dungeon:enter
- [x] [BUG][LOW] showQuestComplete sparks/banner not destroyed on scene shutdown — **Rune** — `shutdown()` method added

## Notes
- Server is authoritative: all game logic runs server-side
- Phones send inputs, receive feedback — never compute game state
- TV renders state snapshots — no game logic in client
