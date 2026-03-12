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

## Notes
- Server is authoritative: all game logic runs server-side
- Phones send inputs, receive feedback — never compute game state
- TV renders state snapshots — no game logic in client
