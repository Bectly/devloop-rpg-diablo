// ─── DevLoop RPG — TV Client (Phaser 3) ─────────────────────────

const GAME_W = 1280;
const GAME_H = 720;
const TILE_SIZE = 32;

// ─── Socket Connection ──────────────────────────────────────────
const socket = io('/game', {
  transports: ['websocket', 'polling'],
});

// ─── Game State ─────────────────────────────────────────────────
let gameState = {
  players: [],
  world: { monsters: [], groundItems: [], tiles: null, roomName: '' },
  events: [],
};
let initialized = false;

// ─── Phaser Scenes ──────────────────────────────────────────────

class BootScene extends Phaser.Scene {
  constructor() {
    super('Boot');
  }

  preload() {
    // Create colored textures programmatically (no external assets needed)
    this.createTextures();
  }

  createTextures() {
    const g = this.make.graphics({ add: false });

    // Player textures
    const playerColors = {
      warrior: 0x4488ff,
      ranger: 0x44cc44,
      mage: 0xbb44ff,
    };
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

    // Floor tile
    g.clear();
    g.fillStyle(0x2a2a3a, 1);
    g.fillRect(0, 0, 32, 32);
    g.lineStyle(1, 0x1a1a2a, 0.5);
    g.strokeRect(0, 0, 32, 32);
    g.generateTexture('tile_floor', 32, 32);

    // Wall tile
    g.clear();
    g.fillStyle(0x444466, 1);
    g.fillRect(0, 0, 32, 32);
    g.fillStyle(0x555577, 1);
    g.fillRect(2, 2, 28, 28);
    g.lineStyle(1, 0x333355, 0.8);
    g.strokeRect(0, 0, 32, 32);
    g.generateTexture('tile_wall', 32, 32);

    // Door tile
    g.clear();
    g.fillStyle(0x886633, 1);
    g.fillRect(0, 0, 32, 32);
    g.fillStyle(0xaa8844, 1);
    g.fillRect(4, 4, 24, 24);
    g.generateTexture('tile_door', 32, 32);

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
    // Layer groups
    this.tileGroup = this.add.group();
    this.monsterSprites = new Map();
    this.playerSprites = new Map();
    this.itemSprites = new Map();
    this.npcSprites = new Map();
    this.damageTexts = [];
    this.tileSprites = [];

    // HUD
    this.roomText = this.add.text(10, 10, '', {
      fontSize: '18px', fill: '#ffffff', fontFamily: 'Courier New',
      backgroundColor: '#00000088', padding: { x: 8, y: 4 },
    }).setScrollFactor(0).setDepth(1000);

    this.playerHudTexts = [];

    this.eventQueue = [];

    // Camera
    this.cameras.main.setBackgroundColor('#111122');

    // Show IP
    document.getElementById('server-ip').textContent = window.location.hostname;
  }

  update() {
    const state = gameState;
    if (!state) return;

    // Hide waiting screen when players join
    const waitingEl = document.getElementById('waiting');
    if (state.players.length > 0 && waitingEl) {
      waitingEl.classList.add('hidden');
    }
    if (waitingEl && !waitingEl.classList.contains('hidden')) {
      document.getElementById('player-count').textContent = state.players.length;
    }

    // ── Render tiles ──
    if (state.world.tiles && this.tileSprites.length === 0) {
      this.renderTiles(state.world.tiles);
    }

    // ── Render room name ──
    this.roomText.setText(`${state.world.roomName || 'Unknown'} [Room ${(state.world.currentRoom || 0) + 1}/${state.world.totalRooms || 1}]`);

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

      // Update position (smooth lerp)
      sprite.x += (p.x - sprite.x) * 0.3;
      sprite.y += (p.y - sprite.y) * 0.3;
      sprite.nameText.setPosition(sprite.x, sprite.y - 28);

      // Texture swap on death
      if (p.alive) {
        sprite.setTexture(`player_${p.characterClass}`);
        sprite.setAlpha(1);
      } else {
        sprite.setTexture('player_dead');
        sprite.setAlpha(0.5);
      }

      // HP bar
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

      // MP bar
      const mpY = barY + 5;
      sprite.hpBar.fillStyle(0x333333, 0.8);
      sprite.hpBar.fillRect(barX, mpY, barW, 3);
      const mpRatio = p.mp / p.maxMp;
      sprite.hpBar.fillStyle(0x4466ff, 1);
      sprite.hpBar.fillRect(barX, mpY, barW * mpRatio, 3);
    }

    // Remove disconnected players
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
          // Create monster graphic
          const g = this.make.graphics({ add: false });
          g.fillStyle(m.color, 1);
          const s = m.size;
          if (m.isBoss) {
            // Boss: diamond shape
            g.fillTriangle(s, 0, s * 2, s, s, s * 2);
            g.fillTriangle(s, 0, 0, s, s, s * 2);
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

        // Smooth position
        sprite.x += (m.x - sprite.x) * 0.3;
        sprite.y += (m.y - sprite.y) * 0.3;
        sprite.nameText.setPosition(sprite.x, sprite.y - sprite.monsterSize - 16);

        // Stun/slow visual
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

    // Clean up dead monsters
    for (const [id, sprite] of this.monsterSprites) {
      if (!seenMonsters.has(id)) {
        sprite.nameText.destroy();
        sprite.hpBar.destroy();
        sprite.destroy();
        this.monsterSprites.delete(id);
      }
    }

    // ── Render ground items ──
    const seenItems = new Set();
    if (state.world.groundItems) {
      for (const gi of state.world.groundItems) {
        seenItems.add(gi.id);
        let sprite = this.itemSprites.get(gi.id);

        if (!sprite) {
          sprite = this.add.sprite(gi.x, gi.y, 'loot').setDepth(5).setScale(0.6);
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
        sprite.destroy();
        this.itemSprites.delete(id);
      }
    }

    // ── Process combat events (damage numbers) ──
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

    // ── Camera follow (center between players) ──
    if (state.players.length > 0) {
      let cx = 0, cy = 0;
      for (const p of state.players) {
        cx += p.x;
        cy += p.y;
      }
      cx /= state.players.length;
      cy /= state.players.length;
      // Keep camera within world bounds
      this.cameras.main.centerOn(
        Math.max(GAME_W / 2, Math.min(cx, (state.world.tiles?.[0]?.length || 40) * TILE_SIZE - GAME_W / 2)),
        Math.max(GAME_H / 2, Math.min(cy, (state.world.tiles?.length || 22) * TILE_SIZE - GAME_H / 2))
      );
    }
  }

  renderTiles(tiles) {
    // Clear existing
    for (const s of this.tileSprites) s.destroy();
    this.tileSprites = [];

    if (!tiles) return;

    for (let r = 0; r < tiles.length; r++) {
      for (let c = 0; c < tiles[r].length; c++) {
        const val = tiles[r][c];
        let texKey = 'tile_floor';
        if (val === 1) texKey = 'tile_wall';
        else if (val === 2) texKey = 'tile_door';

        const s = this.add.sprite(c * TILE_SIZE + TILE_SIZE / 2, r * TILE_SIZE + TILE_SIZE / 2, texKey).setDepth(0);
        this.tileSprites.push(s);
      }
    }
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
});

socket.on('state', (data) => {
  gameState = data;
});

socket.on('dungeon:enter', (data) => {
  console.log('[TV] Entering room:', data.room.roomName);
  // Clear tile cache to re-render
  if (window.gameInstance) {
    const scene = window.gameInstance.scene.getScene('Game');
    if (scene) {
      scene.tileSprites.forEach(s => s.destroy());
      scene.tileSprites = [];
      // Clear monster sprites
      for (const [id, sprite] of scene.monsterSprites) {
        sprite.nameText.destroy();
        sprite.hpBar.destroy();
        sprite.destroy();
      }
      scene.monsterSprites.clear();
      // Clear item sprites
      for (const [id, sprite] of scene.itemSprites) {
        sprite.nameText.destroy();
        sprite.destroy();
      }
      scene.itemSprites.clear();
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
