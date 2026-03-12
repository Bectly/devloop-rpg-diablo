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
- [ ] Dungeon room generation (BSP algorithm) — **Backend Agent**
- [ ] Tilemap rendering in Phaser — **Frontend Agent**
- [ ] Monster spawn waves per room — **Backend Agent**
- [ ] Loot drop rendering (sparkle effects) — **Frontend Agent**
- [ ] Item pickup flow (phone→server→TV) — **Full Stack**
- [ ] Equipment stat application — **Backend Agent**
- [ ] XP/leveling with stat allocation on phone — **Full Stack**
- [ ] Health/mana potion usage — **Backend Agent**
- [ ] Death and respawn system — **Backend Agent**

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
- [ ] Minimap on TV — **Frontend Agent**
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
(none yet)

## Notes
- Server is authoritative: all game logic runs server-side
- Phones send inputs, receive feedback — never compute game state
- TV renders state snapshots — no game logic in client
