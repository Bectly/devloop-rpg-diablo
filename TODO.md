# DevLoop RPG — Task Board

## Phase 1: Foundation ✅ COMPLETE
## Phase 2: Gameplay Loop ✅ COMPLETE
## Phase 3: Content ✅ COMPLETE

### Completed ✅
- Skills fully wired + visible (phone cooldowns, TV effects, tooltips)
- NPC + Shop system (shop NPC, buy/sell UI, healing shrines)
- Boss announcements + HP bar on TV
- Quest system (QuestManager, 7 types, phone UI, rewards, TV announcements)
- Refactoring: 3 file splits (index→socket-handlers, game→hud, controller→screens)
- Boss loot chest (server spawn, TV visuals, phone LOOT interaction)
- Dialogue system wired end-to-end (phone + TV, typewriter effect, NPC type colors)
- Story NPCs (Old Sage, Shrine Guardian, Dying Adventurer) with distinct sprites + "!" markers
- 5/5 Trace bugs fixed (dialogue cleanup, tween orphans, typing class)

---

## 🔥 BOLT CYCLE #27 PRIORITIES

### Priority 1: Sound effects system (Web Audio API)
Sound is the single biggest missing game feel element. No external files needed — generate tones procedurally.

**1A. Sound engine module** — `client/shared/sound.js`
Create a shared sound module (loaded by both TV and phone):
```javascript
window.Sound = {
  ctx: null,          // AudioContext (lazy-init on first interaction)
  masterVol: 0.3,     // Master volume

  init() { this.ctx = new (window.AudioContext || window.webkitAudioContext)(); },

  // Procedural sound generators (no audio files needed):
  hit(intensity)     // Short noise burst + pitch drop. intensity 0-1 controls volume.
  critHit()          // Like hit() but higher pitch + ring
  playerHurt()       // Low thud
  monsterDie()       // Descending tone
  loot()             // Ascending chime (3 quick notes)
  gold()             // Single coin clink
  levelUp()          // Major chord arpeggio (C-E-G-C ascending)
  questComplete()    // Fanfare (2-note, like quest-complete jingle)
  bossSpawn()        // Deep rumble + crescendo
  shrineUse()        // Ethereal pad (filtered noise + sine)
  uiClick()          // Tiny click for phone button presses
  dialogueOpen()     // Soft whoosh
  floorTransition()  // Low sweep + reverb
};
```
Each function = oscillator + gain + short envelope. Use `OscillatorNode`, `GainNode`, `BiquadFilterNode`. No samples, no fetch, no external dependencies.

**1B. Wire sounds to TV events** — `client/tv/game.js`
In GameScene.update() and socket handlers, trigger sounds:
- `monster killed` → `Sound.monsterDie()`
- `boss:chest` → `Sound.loot()`
- `wave:start` with boss → `Sound.bossSpawn()`
- `shrine:used` → `Sound.shrineUse()`
- `dungeon:enter` → `Sound.floorTransition()`
- `quest:complete` → `Sound.questComplete()`
- `player:joined` → `Sound.levelUp()` (reuse as join fanfare)

**1C. Wire sounds to phone events** — `client/phone/controller.js`
- Action button touchstart → `Sound.uiClick()`
- `damage:taken` → `Sound.playerHurt()`
- `notification` with type 'quest' → `Sound.questComplete()`
- `notification` with type 'levelup' → `Sound.levelUp()`
- `dialogue:prompt` → `Sound.dialogueOpen()`
- Shop buy/sell → `Sound.gold()`
- Loot pickup → `Sound.loot()`

**1D. Ambient background** — Optional low-priority sub-task
Looping filtered noise as dungeon ambience. Very soft. Can be skipped if time-constrained.

### ~~Priority 2: Two-player dialogue sync~~ ✅ DONE (Cycle #34)
CSS already exists (`.dialogue-sync`, `.dialogue-sync-dot.voted`). Server logic needed:

**2A. Server: Vote collection in `socket-handlers.js`**
Modify `handleDialogueChoose`:
```javascript
// Instead of immediately processing choice:
// 1. Store vote: dialogueVotes[npcId] = { votes: {playerId: choiceIndex}, timeout: null }
// 2. If both players voted (or 1 player game) → resolve immediately
// 3. If only 1 voted → start 10s timeout, emit 'dialogue:sync' to both phones
// 4. On timeout or both voted → majority wins (tie = first voter wins)
// 5. Execute the winning choice's actions
```

**2B. Phone: Sync UI in `controller.js`**
- Listen for `dialogue:sync` event: `{ votedPlayers: ['name1'], totalPlayers: 2, timeout: 10 }`
- Show `.dialogue-sync` div with player dots and countdown
- Update when second player votes or timeout resolves

### Priority 3: Fix 4 minor bugs (quick wins)
- `stats.alive` → verify field name in updateHUD, fix if needed
- Add missing TV handlers: `room:discovered`, `monster:split`, `player:respawn`
- Remove dead variables `initialized`, `currentFloor` from game.js
- Clear player sprites on `dungeon:enter`

---

## Phase 4: Polish — mostly done
- [x] Sound effects system (13 procedural Web Audio sounds, TV + phone wired)
- [ ] Sprite assets via ComfyUI generation
- [x] Particle effects, minimap, damage numbers, health bars, camera, haptics, floor transitions, loot sparkles

## Phase 5: Persistence & Scale
- [ ] SQLite character save/load
- [ ] Multiple dungeon zones
- [ ] Procedural loot name generation
- [ ] Leaderboard / stats tracking
- [ ] Session reconnection handling

## Architecture Notes (Updated Cycle #26)
**Current LOC:** ~10,650 source + 3,500 tests = 14,150 total (21 source files, 10 test suites, 365 tests)
**Watch:** `game.js` at 1499 lines — approaching split threshold (~1500). If Bolt adds TV sound wiring, may need to extract sound event handlers into a separate `sound-events.js`.
**No urgent splits needed.** style.css at 1425 is large but CSS doesn't need splitting.

## Open Bugs
- [x] ~~[BUG] stats.alive — verified correct~~ Cycle #27
- [x] ~~[BUG] Missing TV handlers~~ FIXED Cycle #27
- [x] ~~[BUG] Dead variables initialized/currentFloor~~ FIXED Cycle #27
- [x] ~~[BUG] Player sprites not cleared on dungeon:enter~~ FIXED Cycle #27
- [x] ~~[BUG/MEDIUM] Monster sprite cleanup in dungeon:enter lacks null guards on nameText/hpBar~~ FIXED Cycle #30
- [x] ~~[BUG/MEDIUM] Item sprite cleanup in dungeon:enter lacks null guard on nameText~~ FIXED Cycle #30

## Notes
- Server is authoritative: all game logic runs server-side
- Phones send inputs, receive feedback — never compute game state
- TV renders state snapshots — no game logic in client
- Sound module shared between TV + phone (client/shared/sound.js)
