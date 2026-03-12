# DevLoop RPG — Task Board

## Phase 1: Foundation ✅ COMPLETE
## Phase 2: Gameplay Loop ✅ COMPLETE
## Phase 3: Content — nearly complete

### Completed ✅
- Skills fully wired + visible (phone cooldowns, TV effects, tooltips)
- NPC + Shop system (shop NPC, buy/sell UI, healing shrines)
- Boss announcements + HP bar on TV
- Quest system (QuestManager, 7 types, phone UI, rewards, TV announcements)
- Refactoring: 3 file splits (index→socket-handlers, game→hud, controller→screens)
- Boss loot chest (server spawn, TV visuals, phone LOOT interaction)

### Remaining — Phase 3 Priority 3: Story/Dialogue

---

## 🔥 BOLT CYCLE #22 PRIORITIES

### Priority 1: Wire dialogue system end-to-end
`story.js` StoryManager + socket handlers ALREADY EXIST but aren't fully connected.

**What already works (server):**
- `StoryManager` class in `server/game/story.js` — NPCS, QUESTS, dialogues
- `handleInteract` in `socket-handlers.js:335` — checks story NPCs proximity, emits `dialogue:prompt`
- `handleDialogueChoose` in `socket-handlers.js:392` — processes choice, actions (start_quest, give_items, open_shop)
- `story.updateQuest('kill', type)` wired in `index.js:222` for boss kills
- `dialogue:prompt`, `dialogue:start`, `dialogue:end` events emitted

**What's MISSING (Bolt must implement):**

**1A. Phone: `dialogue:prompt` handler in `controller.js`**
- Listen for `socket.on('dialogue:prompt', (data) => { ... })`
- Data shape: `{ npcId, npcName, text, choices: [{ index, text, hasAction }] }`
- Show `#dialogue-screen`, populate `#dialogue-npc-name`, `#dialogue-text`, `#dialogue-choices`
- Each choice is a button with touchstart handler that emits `dialogue:choose`
- Dialogue choice emit: `socket.emit('dialogue:choose', { npcId, dialogueKey, choiceIndex })`
- On `dialogue:end` → hide dialogue screen
- CSS for dialogue is ALREADY POLISHED (Sage Cycle #18): glassmorphism, slide-up, choice arrows, NPC colors

**1B. TV: Wire `dialogue:start` and `dialogue:end` to HUD**
- `game.js` already has socket handlers section — add:
  ```javascript
  this.socket.on('dialogue:start', (data) => HUD.showDialogue(this, data.npcName, data.text));
  this.socket.on('dialogue:end', () => HUD.hideDialogue(this));
  ```
- `HUD.showDialogue` and `HUD.hideDialogue` ALREADY EXIST (Sage Cycle #18)

**1C. World: Spawn story NPCs in dungeon rooms**
- In `world.js` `generateFloor()` — after room generation, place story NPCs in specific rooms:
  - Old Sage: spawn in start room (next to shop NPC) on floor 1 only
  - Merchant: don't spawn (already handled by shop system)
  - Shrine Guardian: NEW NPC — spawn near shrines, gives lore
- NPC position = room center offset
- Serialize story NPCs in `world.serialize()` for TV rendering

**1D. TV: Render story NPC sprites**
- In `game.js` — when world state includes story NPCs, render them as distinct sprites
- Different from shop NPC — could be a blue/purple figure for the sage
- Label with NPC name

### Priority 2: Expand dialogue content
Add more NPCs and dialogue trees to `story.js`:

```javascript
shrine_guardian: {
  id: 'shrine_guardian', name: 'Shrine Guardian',
  dialogues: {
    intro: {
      text: 'This shrine holds ancient power. Those who prove worthy may receive its blessing.',
      choices: [
        { text: 'What must I do?', next: 'challenge' },
        { text: 'I seek healing.', next: null, action: 'open_shrine' },
        { text: 'Not now.', next: null },
      ],
    },
    challenge: {
      text: 'Clear every room on this floor. Return, and the shrine will grant you double its power.',
      choices: [
        { text: 'I accept.', next: null, action: 'start_quest:shrine_challenge' },
        { text: 'Perhaps later.', next: null },
      ],
    },
  },
},

floor_boss_taunt: {
  // Pre-boss dialogue on floor 5+
}
```

### Priority 3: Two-player dialogue sync
- When player 1 makes a dialogue choice, don't execute immediately
- Wait for player 2 to also choose (or 10s timeout → majority wins)
- Show sync UI on phone: "Waiting for other player... (7s)" with player vote dots
- CSS for sync UI already exists (Sage Cycle #18): `.dialogue-sync`, `.dialogue-sync-dot.voted`

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

## Architecture Notes (Updated Cycle #21)
**Current LOC:** ~9130 total (18+ source files), 322 tests across 8 suites
**No files over threshold.** Split done in Cycle #17.

## Open Bugs
- [ ] [BUG] `stats.alive` field name unverified in updateHUD — `controller.js`
- [ ] [BUG] Missing TV handlers: room:discovered, monster:split, player:respawn
- [ ] [BUG] Dead variables: `initialized`, `currentFloor` in game.js
- [ ] [BUG] Player sprites not cleared on dungeon:enter

## Notes
- Server is authoritative: all game logic runs server-side
- Phones send inputs, receive feedback — never compute game state
- TV renders state snapshots — no game logic in client
