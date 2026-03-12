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
- Dialogue system wired end-to-end (phone handler, TV HUD, dialogueKey fix, dialogue:end to both)
- Story NPCs spawning in dungeon (Old Sage floor 1, Shrine Guardian near shrines, Dying Adventurer floor 3+)
- Story NPC TV rendering (colored circles with name labels, bob animation)
- Expanded dialogue content (shrine_guardian + floor_herald NPCs with dialogue trees)

### Remaining — Phase 3 Priority 3: Story/Dialogue

---

## 🔥 SAGE CYCLE #23 PRIORITIES

### Priority 1: Story NPC visual polish
- Story NPC sprites are placeholder circles — improve with better shapes/colors
- Add interaction indicator (glow, pulse, "!" marker) when player is in range
- Dialogue screen slide-up animation polish on phone
- NPC name label styling on TV (shadow, better font size)

### Priority 2: Two-player dialogue sync
- When player 1 makes a dialogue choice, don't execute immediately
- Wait for player 2 to also choose (or 10s timeout → majority wins)
- Show sync UI on phone: "Waiting for other player... (7s)" with player vote dots
- CSS for sync UI already exists (Sage Cycle #18): `.dialogue-sync`, `.dialogue-sync-dot.voted`

### Priority 3: Floor transition polish
- Floor transition screen between levels (brief overlay with floor name + theme)
- Camera shake on boss death

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

## Architecture Notes (Updated Cycle #22)
**Current LOC:** ~9500 total (18+ source files), 322 tests across 8 suites
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
