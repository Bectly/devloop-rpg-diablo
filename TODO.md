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
(none yet)

## Notes
- Server is authoritative: all game logic runs server-side
- Phones send inputs, receive feedback — never compute game state
- TV renders state snapshots — no game logic in client
