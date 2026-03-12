# DevLoop RPG — Diablo-style Browser Co-op

A 2-player cooperative action RPG played on a TV with phones as controllers. Built for local network play.

## How It Works

1. **TV** displays the game world (Phaser 3) — dungeons, monsters, loot, combat
2. **Phones** act as controllers — virtual joystick for movement, buttons for attacks/skills/inventory
3. **Server** runs the authoritative game state — combat resolution, monster AI, loot drops

## Quick Start

```bash
# Install dependencies
cd server
npm install

# Start the game server
npm start

# Or with auto-reload during development
npm run dev
```

Then open:
- **TV**: `http://<your-ip>:3000/tv` in the TV's browser
- **Phone 1**: `http://<your-ip>:3000/phone` on first phone
- **Phone 2**: `http://<your-ip>:3000/phone` on second phone

Find your local IP with: `hostname -I | awk '{print $1}'`

## Controls (Phone)

- **Left side**: Virtual joystick (move your character)
- **Attack** (red): Basic attack toward nearest enemy
- **Skill 1-3**: Class abilities (cooldown-based)
- **Potion** (green): Use health potion
- **Inventory** (brown): Open inventory grid

## Game Features

- 3 classes: Warrior, Ranger, Mage
- Real-time combat with skills and cooldowns
- Diablo-style grid inventory (10x6)
- 5 item rarities: Common → Legendary
- Monster AI with aggro, attack patterns, and leashing
- Procedural dungeon rooms
- NPC dialogue with story choices
- Co-op: both players share the dungeon

## Tech Stack

- Node.js + Express + Socket.io (server)
- Phaser 3 (TV rendering)
- nipplejs (phone joystick)
- better-sqlite3 (persistence)

## Development

See [SPEC.md](SPEC.md) for full technical specification.
See [TODO.md](TODO.md) for task breakdown.
See [DEVLOG.md](DEVLOG.md) for development log.
