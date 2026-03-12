// ─── DevLoop RPG — TV Client (Phaser 3) ─────────────────────────

const GAME_W = 1280;
const GAME_H = 720;
const TILE_SIZE = 32;

// Tile type constants (match server TILE enum)
const TILE = { VOID: -1, FLOOR: 0, WALL: 1, DOOR: 2, CORRIDOR: 3, SPAWN: 4, EXIT: 5, CHEST: 6 };

// Floor theme colors
const FLOOR_THEMES = [
  { floor: 0x2a2a3a, wall: 0x444466, wallLight: 0x555577, corridor: 0x222233 },   // Dusty Catacombs
  { floor: 0x1a2a2a, wall: 0x335555, wallLight: 0x446666, corridor: 0x152525 },   // Sunken Crypts
  { floor: 0x2a2a2a, wall: 0x554433, wallLight: 0x665544, corridor: 0x222222 },   // Bone Gallery
  { floor: 0x3a2020, wall: 0x664422, wallLight: 0x885533, corridor: 0x2a1515 },   // Burning Depths
  { floor: 0x1a1a2e, wall: 0x333355, wallLight: 0x444466, corridor: 0x111128 },   // Shadow Halls
  { floor: 0x150a20, wall: 0x442255, wallLight: 0x553366, corridor: 0x100818 },   // Abyssal Core
  { floor: 0x2a1a1a, wall: 0x553333, wallLight: 0x664444, corridor: 0x201010 },   // Throne of Ruin
];

// ─── Socket Connection ──────────────────────────────────────────
const socket = io('/game', {
  transports: ['websocket', 'polling'],
});

// ─── Game State ─────────────────────────────────────────────────
let gameState = {
  players: [],
  world: { monsters: [], groundItems: [], tiles: null, roomName: '', rooms: [] },
  events: [],
};
let initialized = false;
let currentFloor = 0;

// ─── Phaser Scenes ──────────────────────────────────────────────

class BootScene extends Phaser.Scene {
  constructor() {
    super('Boot');
  }

  preload() {
    this.createTextures();
  }

  createTextures() {
    const g = this.make.graphics({ add: false });

    // Player textures
    const playerColors = { warrior: 0x4488ff, ranger: 0x44cc44, mage: 0xbb44ff };
    for (const [cls, color] of Object.entries(playerColors)) {
      g.clear();
      g.fillStyle(color, 1);
      g.fillCircle(16, 16, 14);
      g.fillStyle(0xffffff, 0.8);
      g.fillCircle(12, 12, 3);
      g.fillCircle(20, 12, 3);
      g.generateTexture(`player_${cls}`, 32, 32);
    }

    // Dead player
    g.clear();
    g.fillStyle(0x666666, 1);
    g.fillCircle(16, 16, 14);
    g.lineStyle(2, 0xff0000);
    g.strokeCircle(16, 16, 14);
    g.generateTexture('player_dead', 32, 32);

    // Dying player (skull)
    g.clear();
    g.fillStyle(0x333333, 0.8);
    g.fillCircle(16, 16, 14);
    g.fillStyle(0xff0000, 0.6);
    g.fillCircle(11, 13, 3);
    g.fillCircle(21, 13, 3);
    g.generateTexture('player_dying', 32, 32);

    // Loot sparkle
    g.clear();
    g.fillStyle(0xffcc00, 1);
    g.fillRect(6, 6, 20, 20);
    g.fillStyle(0xffffff, 0.5);
    g.fillRect(10, 10, 12, 12);
    g.generateTexture('loot', 32, 32);

    // NPC marker
    g.clear();
    g.fillStyle(0x00ccff, 1);
    g.fillCircle(16, 16, 14);
    g.fillStyle(0xffffff, 1);
    g.fillRect(14, 8, 4, 10);
    g.fillRect(14, 21, 4, 4);
    g.generateTexture('npc', 32, 32);

    g.destroy();
  }

  create() {
    this.scene.start('Game');
  }
}

class GameScene extends Phaser.Scene {
  constructor() {
    super('Game');
  }

  create() {
    // Layers
    this.tileGroup = this.add.group();
    this.monsterSprites = new Map();
    this.playerSprites = new Map();
    this.itemSprites = new Map();
    this.npcSprites = new Map();
    this.damageTexts = [];
    this.tileSprites = [];
    this.tilesDirty = true;
    this.lastTileFloor = -1;

    // HUD (fixed to camera)
    this.roomText = this.add.text(10, 10, '', {
      fontSize: '18px', fill: '#ffffff', fontFamily: 'Courier New',
      backgroundColor: '#00000088', padding: { x: 8, y: 4 },
    }).setScrollFactor(0).setDepth(1000);

    this.floorText = this.add.text(10, 38, '', {
      fontSize: '14px', fill: '#ffcc44', fontFamily: 'Courier New',
      backgroundColor: '#00000088', padding: { x: 6, y: 2 },
    }).setScrollFactor(0).setDepth(1000);

    this.waveText = this.add.text(GAME_W / 2, 50, '', {
      fontSize: '22px', fill: '#ff4444', fontFamily: 'Courier New',
      backgroundColor: '#00000088', padding: { x: 10, y: 4 },
    }).setOrigin(0.5).setScrollFactor(0).setDepth(1001);
    this.waveTextTimer = 0;

    // Minimap container (top-right corner)
    this.minimapGfx = this.add.graphics().setScrollFactor(0).setDepth(1002);
    this.minimapBg = this.add.graphics().setScrollFactor(0).setDepth(1001);

    // Camera
    this.cameras.main.setBackgroundColor('#111122');

    // Show IP
    const ipEl = document.getElementById('server-ip');
    if (ipEl) ipEl.textContent = window.location.hostname;
  }

  update() {
    const state = gameState;
    if (!state) return;

    // Hide waiting screen
    const waitingEl = document.getElementById('waiting');
    if (state.players.length > 0 && waitingEl) {
      waitingEl.classList.add('hidden');
    }
    if (waitingEl && !waitingEl.classList.contains('hidden')) {
      const pcEl = document.getElementById('player-count');
      if (pcEl) pcEl.textContent = state.players.length;
    }

    // ── Render tiles (only when they change) ──
    const worldFloor = state.world.currentFloor || 0;
    if (state.world.tiles && (this.tilesDirty || this.lastTileFloor !== worldFloor)) {
      this.renderTiles(state.world.tiles, worldFloor);
      this.tilesDirty = false;
      this.lastTileFloor = worldFloor;
    }

    // ── HUD ──
    const exitStatus = state.world.exitLocked ? ' [EXIT LOCKED]' : ' [EXIT OPEN]';
    this.roomText.setText(`${state.world.roomName || 'Unknown'}${exitStatus}`);
    this.floorText.setText(`Floor ${(state.world.currentFloor || 0) + 1} | Rooms: ${(state.world.rooms || []).length}`);

    // Wave text fade
    if (this.waveTextTimer > 0) {
      this.waveTextTimer -= 16;
      this.waveText.setAlpha(Math.min(1, this.waveTextTimer / 500));
      if (this.waveTextTimer <= 0) this.waveText.setText('');
    }

    // ── Render players ──
    const seenPlayers = new Set();
    for (const p of state.players) {
      seenPlayers.add(p.id);
      let sprite = this.playerSprites.get(p.id);

      if (!sprite) {
        const texKey = p.alive ? `player_${p.characterClass}` : 'player_dead';
        sprite = this.add.sprite(p.x, p.y, texKey).setDepth(10);
        sprite.nameText = this.add.text(p.x, p.y - 28, p.name, {
          fontSize: '12px', fill: '#ffffff', fontFamily: 'Courier New',
          backgroundColor: '#00000088', padding: { x: 3, y: 1 },
        }).setOrigin(0.5).setDepth(11);
        sprite.hpBar = this.add.graphics().setDepth(11);
        this.playerSprites.set(p.id, sprite);
      }

      // Smooth lerp
      sprite.x += (p.x - sprite.x) * 0.3;
      sprite.y += (p.y - sprite.y) * 0.3;
      sprite.nameText.setPosition(sprite.x, sprite.y - 28);

      // Texture swap
      if (p.isDying) {
        sprite.setTexture('player_dying');
        sprite.setAlpha(0.5 + Math.sin(Date.now() / 200) * 0.3);
      } else if (p.alive) {
        sprite.setTexture(`player_${p.characterClass}`);
        sprite.setAlpha(1);
      } else {
        sprite.setTexture('player_dead');
        sprite.setAlpha(0.5);
      }

      // HP/MP bars
      sprite.hpBar.clear();
      const barW = 32;
      const barH = 4;
      const barX = sprite.x - barW / 2;
      const barY = sprite.y - 20;
      sprite.hpBar.fillStyle(0x333333, 0.8);
      sprite.hpBar.fillRect(barX, barY, barW, barH);
      const hpRatio = p.hp / p.maxHp;
      const hpColor = hpRatio > 0.5 ? 0x44cc44 : hpRatio > 0.25 ? 0xcccc44 : 0xcc4444;
      sprite.hpBar.fillStyle(hpColor, 1);
      sprite.hpBar.fillRect(barX, barY, barW * hpRatio, barH);

      const mpY = barY + 5;
      sprite.hpBar.fillStyle(0x333333, 0.8);
      sprite.hpBar.fillRect(barX, mpY, barW, 3);
      const mpRatio = p.mp / p.maxMp;
      sprite.hpBar.fillStyle(0x4466ff, 1);
      sprite.hpBar.fillRect(barX, mpY, barW * mpRatio, 3);

      // Death timer display
      if (p.isDying && p.deathTimer > 0) {
        const secs = (p.deathTimer / 1000).toFixed(1);
        sprite.nameText.setText(`${p.name} [${secs}s]`);
      } else {
        sprite.nameText.setText(p.name);
      }
    }

    // Remove disconnected
    for (const [id, sprite] of this.playerSprites) {
      if (!seenPlayers.has(id)) {
        sprite.nameText.destroy();
        sprite.hpBar.destroy();
        sprite.destroy();
        this.playerSprites.delete(id);
      }
    }

    // ── Render monsters ──
    const seenMonsters = new Set();
    if (state.world.monsters) {
      for (const m of state.world.monsters) {
        if (!m.alive) {
          const existing = this.monsterSprites.get(m.id);
          if (existing) {
            existing.nameText.destroy();
            existing.hpBar.destroy();
            existing.destroy();
            this.monsterSprites.delete(m.id);
          }
          continue;
        }

        seenMonsters.add(m.id);
        let sprite = this.monsterSprites.get(m.id);

        if (!sprite) {
          const g = this.make.graphics({ add: false });
          g.fillStyle(m.color, 1);
          const s = m.size;

          if (m.isBoss) {
            g.fillTriangle(s, 0, s * 2, s, s, s * 2);
            g.fillTriangle(s, 0, 0, s, s, s * 2);
          } else if (m.behavior === 'ranged_kite') {
            // Archer: triangle shape
            g.fillTriangle(s, 0, s * 2, s * 2, 0, s * 2);
          } else if (m.behavior === 'melee_split') {
            // Slime: circle
            g.fillCircle(s, s, s);
          } else {
            g.fillRect(0, 0, s * 2, s * 2);
          }
          g.generateTexture(`monster_${m.id}`, s * 2, s * 2);
          g.destroy();

          sprite = this.add.sprite(m.x, m.y, `monster_${m.id}`).setDepth(8);
          sprite.nameText = this.add.text(m.x, m.y - m.size - 16, m.name, {
            fontSize: m.isBoss ? '14px' : '10px',
            fill: m.isBoss ? '#ff8800' : '#ff6666',
            fontFamily: 'Courier New',
            backgroundColor: '#00000066',
            padding: { x: 2, y: 1 },
          }).setOrigin(0.5).setDepth(9);
          sprite.hpBar = this.add.graphics().setDepth(9);
          sprite.monsterSize = m.size;
          this.monsterSprites.set(m.id, sprite);
        }

        sprite.x += (m.x - sprite.x) * 0.3;
        sprite.y += (m.y - sprite.y) * 0.3;
        sprite.nameText.setPosition(sprite.x, sprite.y - sprite.monsterSize - 16);

        sprite.setAlpha(m.stunned ? 0.4 : m.slowed ? 0.7 : 1);

        // HP bar
        sprite.hpBar.clear();
        const mBarW = m.isBoss ? 60 : 30;
        const mBarH = m.isBoss ? 5 : 3;
        const mBarX = sprite.x - mBarW / 2;
        const mBarY = sprite.y - sprite.monsterSize - 8;
        sprite.hpBar.fillStyle(0x333333, 0.8);
        sprite.hpBar.fillRect(mBarX, mBarY, mBarW, mBarH);
        const mHpRatio = m.hp / m.maxHp;
        sprite.hpBar.fillStyle(0xcc2222, 1);
        sprite.hpBar.fillRect(mBarX, mBarY, mBarW * mHpRatio, mBarH);
      }
    }

    for (const [id, sprite] of this.monsterSprites) {
      if (!seenMonsters.has(id)) {
        sprite.nameText.destroy();
        sprite.hpBar.destroy();
        sprite.destroy();
        this.monsterSprites.delete(id);
      }
    }

    // ── Render ground items with rarity glow ──
    const seenItems = new Set();
    if (state.world.groundItems) {
      for (const gi of state.world.groundItems) {
        seenItems.add(gi.id);
        let sprite = this.itemSprites.get(gi.id);

        if (!sprite) {
          sprite = this.add.sprite(gi.x, gi.y, 'loot').setDepth(5).setScale(0.6);

          // Rarity-colored glow ring
          const glowColor = this.parseColor(gi.rarityColor || '#aaaaaa');
          sprite.glow = this.add.graphics().setDepth(4);
          sprite.glow.fillStyle(glowColor, 0.25);
          sprite.glow.fillCircle(gi.x, gi.y, 18);
          sprite.glow.lineStyle(1, glowColor, 0.6);
          sprite.glow.strokeCircle(gi.x, gi.y, 18);

          sprite.nameText = this.add.text(gi.x, gi.y - 18, gi.name, {
            fontSize: '9px',
            fill: gi.rarityColor || '#aaaaaa',
            fontFamily: 'Courier New',
            backgroundColor: '#00000088',
            padding: { x: 2, y: 1 },
          }).setOrigin(0.5).setDepth(6);
          this.itemSprites.set(gi.id, sprite);

          // Pulse tween
          this.tweens.add({
            targets: sprite,
            scaleX: 0.7,
            scaleY: 0.7,
            duration: 500,
            yoyo: true,
            repeat: -1,
          });
        }
      }
    }

    for (const [id, sprite] of this.itemSprites) {
      if (!seenItems.has(id)) {
        sprite.nameText.destroy();
        if (sprite.glow) sprite.glow.destroy();
        sprite.destroy();
        this.itemSprites.delete(id);
      }
    }

    // ── Combat events (damage numbers) ──
    if (state.events) {
      for (const ev of state.events) {
        if (ev.type === 'combat:hit' && ev.damage > 0) {
          const target = state.world.monsters?.find(m => m.id === ev.targetId)
            || state.players?.find(p => p.id === ev.targetId);
          if (target) {
            this.spawnDamageText(target.x || 0, (target.y || 0) - 30, ev.damage, ev.isCrit, ev.dodged);
          }
        }
        if (ev.type === 'combat:hit' && ev.dodged) {
          const target = state.players?.find(p => p.id === ev.targetId);
          if (target) {
            this.spawnDamageText(target.x, target.y - 30, 'DODGE', false, true);
          }
        }
        if (ev.type === 'player:levelup') {
          const p = state.players?.find(p => p.id === ev.playerId);
          if (p) {
            this.spawnDamageText(p.x, p.y - 50, `LEVEL ${ev.level}!`, false, false, '#ffcc00');
          }
        }
        if (ev.type === 'buff:apply') {
          const p = state.players?.find(p => p.id === ev.playerId);
          if (p) {
            this.spawnDamageText(p.x, p.y - 40, ev.skillName, false, false, '#44ccff');
          }
        }
      }
    }

    // ── Update damage texts ──
    for (let i = this.damageTexts.length - 1; i >= 0; i--) {
      const dt = this.damageTexts[i];
      dt.life -= 16;
      dt.text.y -= 0.8;
      dt.text.setAlpha(dt.life / dt.maxLife);
      if (dt.life <= 0) {
        dt.text.destroy();
        this.damageTexts.splice(i, 1);
      }
    }

    // ── Camera follow ──
    if (state.players.length > 0) {
      let cx = 0, cy = 0;
      for (const p of state.players) { cx += p.x; cy += p.y; }
      cx /= state.players.length;
      cy /= state.players.length;

      const worldW = (state.world.gridW || 60) * TILE_SIZE;
      const worldH = (state.world.gridH || 40) * TILE_SIZE;
      this.cameras.main.centerOn(
        Math.max(GAME_W / 2, Math.min(cx, worldW - GAME_W / 2)),
        Math.max(GAME_H / 2, Math.min(cy, worldH - GAME_H / 2))
      );
    }

    // ── Minimap ──
    this.renderMinimap(state);
  }

  renderTiles(tiles, floor) {
    // Clear existing
    for (const s of this.tileSprites) s.destroy();
    this.tileSprites = [];
    if (!tiles) return;

    const theme = FLOOR_THEMES[floor % FLOOR_THEMES.length];

    // Generate tile textures for this floor theme
    const g = this.make.graphics({ add: false });

    // Floor
    g.clear();
    g.fillStyle(theme.floor, 1);
    g.fillRect(0, 0, 32, 32);
    g.lineStyle(1, theme.floor - 0x111111, 0.3);
    g.strokeRect(0, 0, 32, 32);
    g.generateTexture('t_floor', 32, 32);

    // Wall
    g.clear();
    g.fillStyle(theme.wall, 1);
    g.fillRect(0, 0, 32, 32);
    g.fillStyle(theme.wallLight, 1);
    g.fillRect(2, 2, 28, 28);
    g.lineStyle(1, theme.wall - 0x111111, 0.8);
    g.strokeRect(0, 0, 32, 32);
    g.generateTexture('t_wall', 32, 32);

    // Door (locked = red, unlocked = green)
    g.clear();
    g.fillStyle(0x886633, 1);
    g.fillRect(0, 0, 32, 32);
    g.fillStyle(0xaa8844, 1);
    g.fillRect(4, 4, 24, 24);
    g.generateTexture('t_door', 32, 32);

    // Corridor
    g.clear();
    g.fillStyle(theme.corridor, 1);
    g.fillRect(0, 0, 32, 32);
    g.lineStyle(1, theme.corridor - 0x080808, 0.2);
    g.strokeRect(0, 0, 32, 32);
    g.generateTexture('t_corridor', 32, 32);

    // Spawn
    g.clear();
    g.fillStyle(theme.floor, 1);
    g.fillRect(0, 0, 32, 32);
    g.fillStyle(0x44cc44, 0.3);
    g.fillCircle(16, 16, 10);
    g.generateTexture('t_spawn', 32, 32);

    // Exit (locked = red tint, unlocked = green)
    g.clear();
    g.fillStyle(0x444444, 1);
    g.fillRect(0, 0, 32, 32);
    g.fillStyle(0x888888, 1);
    g.fillRect(4, 4, 24, 24);
    g.fillStyle(0xffcc00, 0.6);
    g.fillRect(10, 10, 12, 12);
    g.generateTexture('t_exit_open', 32, 32);

    g.clear();
    g.fillStyle(0x442222, 1);
    g.fillRect(0, 0, 32, 32);
    g.fillStyle(0x663333, 1);
    g.fillRect(4, 4, 24, 24);
    g.fillStyle(0xcc2222, 0.4);
    g.fillRect(10, 10, 12, 12);
    g.generateTexture('t_exit_locked', 32, 32);

    // Chest
    g.clear();
    g.fillStyle(theme.floor, 1);
    g.fillRect(0, 0, 32, 32);
    g.fillStyle(0xccaa33, 1);
    g.fillRect(6, 10, 20, 14);
    g.fillStyle(0xffcc00, 1);
    g.fillRect(14, 14, 4, 4);
    g.generateTexture('t_chest', 32, 32);

    g.destroy();

    const exitLocked = gameState?.world?.exitLocked !== false;

    for (let r = 0; r < tiles.length; r++) {
      for (let c = 0; c < tiles[r].length; c++) {
        const val = tiles[r][c];
        let texKey;
        switch (val) {
          case TILE.VOID:     continue; // don't render void
          case TILE.FLOOR:    texKey = 't_floor'; break;
          case TILE.WALL:     texKey = 't_wall'; break;
          case TILE.DOOR:     texKey = 't_door'; break;
          case TILE.CORRIDOR: texKey = 't_corridor'; break;
          case TILE.SPAWN:    texKey = 't_spawn'; break;
          case TILE.EXIT:     texKey = exitLocked ? 't_exit_locked' : 't_exit_open'; break;
          case TILE.CHEST:    texKey = 't_chest'; break;
          default:            texKey = 't_floor'; break;
        }

        const s = this.add.sprite(c * TILE_SIZE + TILE_SIZE / 2, r * TILE_SIZE + TILE_SIZE / 2, texKey).setDepth(0);
        this.tileSprites.push(s);
      }
    }
  }

  renderMinimap(state) {
    const mmG = this.minimapGfx;
    const mmBg = this.minimapBg;
    mmG.clear();
    mmBg.clear();

    if (!state.world.tiles || !state.world.rooms) return;

    const mmX = GAME_W - 170;
    const mmY = 10;
    const mmW = 160;
    const mmH = 110;
    const scale = Math.min(mmW / (state.world.gridW || 60), mmH / (state.world.gridH || 40));

    // Background
    mmBg.fillStyle(0x000000, 0.6);
    mmBg.fillRect(mmX - 2, mmY - 2, mmW + 4, mmH + 4);
    mmBg.lineStyle(1, 0x444444, 0.8);
    mmBg.strokeRect(mmX - 2, mmY - 2, mmW + 4, mmH + 4);

    // Draw rooms
    for (const room of state.world.rooms) {
      if (!room.discovered) continue;

      let color;
      if (room.cleared) color = 0x226622;
      else if (room.type === 'boss') color = 0x662222;
      else if (room.type === 'treasure') color = 0x665522;
      else color = 0x333366;

      mmG.fillStyle(color, 0.8);
      mmG.fillRect(
        mmX + room.x * scale,
        mmY + room.y * scale,
        room.w * scale,
        room.h * scale
      );

      // Room border
      mmG.lineStyle(1, 0x666666, 0.5);
      mmG.strokeRect(
        mmX + room.x * scale,
        mmY + room.y * scale,
        room.w * scale,
        room.h * scale
      );
    }

    // Draw players
    for (const p of state.players) {
      mmG.fillStyle(p.alive ? 0x44ff44 : 0xff4444, 1);
      mmG.fillCircle(
        mmX + (p.x / TILE_SIZE) * scale,
        mmY + (p.y / TILE_SIZE) * scale,
        2
      );
    }

    // Draw monsters (red dots)
    if (state.world.monsters) {
      for (const m of state.world.monsters) {
        if (!m.alive) continue;
        mmG.fillStyle(m.isBoss ? 0xff8800 : 0xff2222, 0.8);
        mmG.fillCircle(
          mmX + (m.x / TILE_SIZE) * scale,
          mmY + (m.y / TILE_SIZE) * scale,
          m.isBoss ? 2 : 1
        );
      }
    }
  }

  parseColor(hex) {
    if (typeof hex === 'number') return hex;
    hex = hex.replace('#', '');
    return parseInt(hex, 16);
  }

  spawnDamageText(x, y, text, isCrit, isDodge, color) {
    const offset = (Math.random() - 0.5) * 30;
    const col = color || (isDodge ? '#44ccff' : isCrit ? '#ffcc00' : '#ff4444');
    const size = isCrit ? '18px' : isDodge ? '14px' : '14px';

    const t = this.add.text(x + offset, y, String(text), {
      fontSize: size,
      fill: col,
      fontFamily: 'Courier New',
      fontStyle: isCrit ? 'bold' : 'normal',
      stroke: '#000000',
      strokeThickness: 2,
    }).setOrigin(0.5).setDepth(100);

    this.damageTexts.push({ text: t, life: 800, maxLife: 800 });
  }
}

// ─── Socket Events ──────────────────────────────────────────────
socket.on('connect', () => {
  console.log('[TV] Connected to server');
});

socket.on('init', (data) => {
  console.log('[TV] Init received', data);
  initialized = true;
  currentFloor = data.floor || 0;
});

socket.on('state', (data) => {
  gameState = data;
});

socket.on('dungeon:enter', (data) => {
  console.log('[TV] Entering floor:', data.floorName || data.room.roomName);
  currentFloor = data.floor || 0;
  if (window.gameInstance) {
    const scene = window.gameInstance.scene.getScene('Game');
    if (scene) {
      scene.tileSprites.forEach(s => s.destroy());
      scene.tileSprites = [];
      scene.tilesDirty = true;
      for (const [id, sprite] of scene.monsterSprites) {
        sprite.nameText.destroy();
        sprite.hpBar.destroy();
        sprite.destroy();
      }
      scene.monsterSprites.clear();
      for (const [id, sprite] of scene.itemSprites) {
        sprite.nameText.destroy();
        if (sprite.glow) sprite.glow.destroy();
        sprite.destroy();
      }
      scene.itemSprites.clear();
    }
  }
});

socket.on('wave:start', (data) => {
  if (window.gameInstance) {
    const scene = window.gameInstance.scene.getScene('Game');
    if (scene) {
      scene.waveText.setText(`WAVE ${data.wave}/${data.totalWaves}`);
      scene.waveTextTimer = 2000;
    }
  }
});

socket.on('room:cleared', (data) => {
  if (window.gameInstance) {
    const scene = window.gameInstance.scene.getScene('Game');
    if (scene) {
      scene.waveText.setText(`${data.roomName} CLEARED!`);
      scene.waveText.setFill('#44ff44');
      scene.waveTextTimer = 2000;
      setTimeout(() => { scene.waveText.setFill('#ff4444'); }, 2100);
    }
  }
});

socket.on('exit:unlocked', () => {
  if (window.gameInstance) {
    const scene = window.gameInstance.scene.getScene('Game');
    if (scene) {
      scene.waveText.setText('EXIT UNLOCKED!');
      scene.waveText.setFill('#ffcc00');
      scene.waveTextTimer = 3000;
      scene.tilesDirty = true; // Re-render exit tile color
      setTimeout(() => { scene.waveText.setFill('#ff4444'); }, 3100);
    }
  }
});

socket.on('player:joined', (data) => {
  console.log(`[TV] Player joined: ${data.name} (${data.characterClass})`);
});

socket.on('player:left', (data) => {
  console.log(`[TV] Player left: ${data.name}`);
});

socket.on('dialogue:start', (data) => {
  console.log(`[TV] Dialogue with ${data.npcName}: ${data.text}`);
});

socket.on('disconnect', () => {
  console.log('[TV] Disconnected from server');
});

// ─── Phaser Config & Start ──────────────────────────────────────
const config = {
  type: Phaser.AUTO,
  width: GAME_W,
  height: GAME_H,
  parent: 'game-container',
  backgroundColor: '#111122',
  scene: [BootScene, GameScene],
  scale: {
    mode: Phaser.Scale.FIT,
    autoCenter: Phaser.Scale.CENTER_BOTH,
  },
  render: {
    pixelArt: true,
    antialias: false,
  },
};

window.gameInstance = new Phaser.Game(config);
