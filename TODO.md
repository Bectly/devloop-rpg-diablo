# DevLoop RPG — Task Board

## Phase 1: Foundation (Current)
- [x] Project scaffold and spec — **Aria (Architect)**
- [x] Server: Express + Socket.io + game loop — **Aria**
- [x] Server: Player class with stats — **Aria**
- [x] Server: World state manager — **Aria**
- [x] Server: Combat system — **Aria**
- [x] Server: Monster definitions + AI — **Aria**
- [x] Server: Item/loot system — **Aria**
- [x] Server: Grid inventory — **Aria**
- [x] Client: TV Phaser 3 renderer — **Aria**
- [x] Client: Phone controller with joystick — **Aria**
- [ ] Test: 2-phone simultaneous connection — **QA**
- [ ] Test: Combat loop with real inputs — **QA**

## Phase 2: Gameplay Loop
- [x] Dungeon room generation (BSP algorithm) — **Bolt (Cycle #2)**
- [x] Tilemap rendering in Phaser (7 floor themes) — **Bolt (Cycle #2)**
- [x] Monster spawn waves per room (1-3 waves) — **Bolt (Cycle #2)**
- [x] Loot drop rendering (rarity glow rings) — **Bolt (Cycle #2)**
- [x] Item pickup flow (proximity check, gold+equip) — **Bolt (Cycle #2)**
- [ ] Equipment stat application — **Backend Agent**
- [ ] XP/leveling with stat allocation on phone — **Full Stack**
- [ ] Health/mana potion usage — **Backend Agent**
- [x] Death and respawn system (5s timer, penalties) — **Bolt (Cycle #2)**

## Phase 3: Content
- [ ] Story/dialogue system with NPC interactions — **Backend Agent**
- [ ] Quest tracking (kill quests, fetch quests) — **Full Stack**
- [ ] 3+ dungeon floor layouts — **Backend Agent**
- [ ] Boss fight mechanics (phases, special attacks) — **Backend Agent**
- [ ] Shop NPC (buy/sell items) — **Full Stack**
- [ ] Class skill implementations (9 skills total) — **Backend Agent**
- [ ] Skill cooldown display on phone — **Frontend Agent**

## Phase 4: Polish
- [ ] Sprite assets via ComfyUI generation — **Art Agent**
- [ ] Sound effects and ambient audio — **Art Agent**
- [ ] Particle effects (combat, loot, level up) — **Frontend Agent**
- [x] Minimap on TV (discovered rooms, player/monster dots) — **Bolt (Cycle #2)**
- [ ] Damage number popups — **Frontend Agent**
- [ ] Health bar rendering above entities — **Frontend Agent**
- [ ] Smooth camera follow — **Frontend Agent**
- [ ] Phone haptic feedback on hits — **Frontend Agent**

## Phase 5: Persistence & Scale
- [ ] SQLite character save/load — **Backend Agent**
- [ ] Multiple dungeon zones — **Backend Agent**
- [ ] Procedural loot name generation — **Backend Agent**
- [ ] Leaderboard / stats tracking — **Full Stack**
- [ ] Session reconnection handling — **Backend Agent**

## Bugs & Issues

### Critical
- [ ] [BUG] `pickRarity()` tierBoost inverted — tierBoost >= 5 makes ALL drops common instead of rarer — `server/game/items.js:94-107`
- [ ] [BUG] Ground item bobbing uses `gi.id * 1.7` but IDs may be UUID strings → NaN positions — `client/tv/game.js:~635`
- [ ] [BUG] `hideTooltip` not on `window` — tooltip close button crashes — `client/phone/controller.js:~473`

### Major
- [ ] [BUG] Monster textures never removed from TextureManager → memory leak — `client/tv/game.js:~548`
- [ ] [BUG] No `safe-area-inset` padding → notch/Dynamic Island overlap — `client/phone/style.css`
- [ ] [BUG] `initButtons()` stacks duplicate event listeners on reconnect — `client/phone/controller.js:~262`
- [ ] [BUG] `stats.alive` field name unverified in updateHUD respawn check — `client/phone/controller.js:~227`

### Minor
- [ ] [BUG] Tile textures regenerated without cleanup (console warnings) — `client/tv/game.js:~762`
- [ ] [BUG] Class card/join/inventory/dialogue buttons use `click` not `touchstart` — `client/phone/controller.js`
- [ ] [BUG] Wake lock request before user gesture (silently fails) — `client/phone/controller.js:~562`
- [ ] [BUG] Overlapping notification toasts at same position — `client/phone/controller.js:~317`
- [ ] [BUG] Missing TV handlers: room:discovered, monster:split, player:respawn, dialogue:end
- [ ] [BUG] Dead variables: `initialized`, `currentFloor` in game.js
- [ ] [BUG] Player sprites not cleared on dungeon:enter (transient stale positions)

## Notes
- Server is authoritative: all game logic runs server-side
- Phones send inputs, receive feedback — never compute game state
- TV renders state snapshots — no game logic in client
