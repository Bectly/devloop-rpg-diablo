// ─── DevLoop RPG — TV Client (Phaser 3) ─────────────────────────

const GAME_W = 1280;
const GAME_H = 720;
// TILE_SIZE and FLOOR_THEMES are defined in hud.js (loaded first)

// Tile type constants (match server TILE enum)
const TILE = { VOID: -1, FLOOR: 0, WALL: 1, DOOR: 2, CORRIDOR: 3, SPAWN: 4, EXIT: 5, CHEST: 6 };

// Floor theme names for transition display
const FLOOR_NAMES = [
  'Dusty Catacombs',
  'Sunken Crypts',
  'Bone Gallery',
  'Burning Depths',
  'Shadow Halls',
  'Abyssal Core',
  'Throne of Ruin',
];

// ─── Socket Connection ──────────────────────────────────────────
const socket = io('/game', {
  transports: ['websocket', 'polling'],
});

// ─── QR Code on Waiting Screen ──────────────────────────────────
(async function initQR() {
  try {
    const res = await fetch('/api/server-info');
    const info = await res.json();
    const phoneUrl = info.phoneUrl;
    document.getElementById('server-ip').textContent = info.ip;
    if (window.QRCode) {
      QRCode.toCanvas(document.getElementById('qr-p1'), phoneUrl, 140);
      QRCode.toCanvas(document.getElementById('qr-p2'), phoneUrl, 140);
    }
  } catch (e) {
    console.warn('[QR] Could not generate QR codes:', e.message);
  }
})();

// ─── Game State ─────────────────────────────────────────────────
let gameState = {
  players: [],
  world: { monsters: [], groundItems: [], tiles: null, roomName: '', rooms: [] },
  events: [],
};

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

    // ── Player: Warrior — blue shield with metallic highlight ──
    g.clear();
    // Body circle
    g.fillStyle(0x3366cc, 1);
    g.fillCircle(16, 16, 13);
    // Shield shape (kite shield)
    g.fillStyle(0x4488ff, 1);
    g.fillTriangle(10, 8, 22, 8, 16, 26);
    // Metallic highlight stripe
    g.fillStyle(0x88bbff, 0.7);
    g.fillTriangle(14, 10, 18, 10, 16, 22);
    // Shield border accent
    g.lineStyle(1, 0x2255aa, 0.9);
    g.strokeTriangle(10, 8, 22, 8, 16, 26);
    // Shield boss (center dot)
    g.fillStyle(0xccddff, 1);
    g.fillCircle(16, 14, 2);
    // Directional indicator (facing line)
    g.lineStyle(2, 0xffffff, 0.8);
    g.lineBetween(16, 2, 16, 6);
    g.generateTexture('player_warrior', 32, 32);

    // ── Player: Ranger — green figure with arrow symbol ──
    g.clear();
    // Body circle
    g.fillStyle(0x2a7a2a, 1);
    g.fillCircle(16, 16, 13);
    // Cloak shape
    g.fillStyle(0x44cc44, 1);
    g.fillTriangle(8, 22, 24, 22, 16, 6);
    // Hood accent
    g.fillStyle(0x338833, 1);
    g.fillTriangle(12, 10, 20, 10, 16, 6);
    // Arrow symbol (pointing up)
    g.lineStyle(2, 0xccffcc, 0.9);
    g.lineBetween(16, 8, 16, 24);
    // Arrowhead
    g.lineBetween(16, 8, 12, 14);
    g.lineBetween(16, 8, 20, 14);
    // Fletching
    g.lineBetween(16, 24, 13, 22);
    g.lineBetween(16, 24, 19, 22);
    // Directional indicator
    g.lineStyle(2, 0xffffff, 0.8);
    g.lineBetween(16, 2, 16, 6);
    g.generateTexture('player_ranger', 32, 32);

    // ── Player: Mage — purple figure with star/magic symbol ──
    g.clear();
    // Body circle
    g.fillStyle(0x6622aa, 1);
    g.fillCircle(16, 16, 13);
    // Robe shape
    g.fillStyle(0xbb44ff, 1);
    g.fillTriangle(7, 24, 25, 24, 16, 6);
    // Inner robe highlight
    g.fillStyle(0x9933dd, 0.8);
    g.fillTriangle(11, 22, 21, 22, 16, 10);
    // Star symbol (5-point, hand-drawn with lines)
    g.lineStyle(2, 0xffcc88, 0.9);
    // Star points
    g.lineBetween(16, 9, 14, 17);
    g.lineBetween(14, 17, 21, 12);
    g.lineBetween(21, 12, 11, 12);
    g.lineBetween(11, 12, 18, 17);
    g.lineBetween(18, 17, 16, 9);
    // Magic glow dot at center
    g.fillStyle(0xffeedd, 1);
    g.fillCircle(16, 13, 2);
    // Directional indicator
    g.lineStyle(2, 0xffffff, 0.8);
    g.lineBetween(16, 2, 16, 6);
    g.generateTexture('player_mage', 32, 32);

    // Dead player
    g.clear();
    g.fillStyle(0x666666, 1);
    g.fillCircle(16, 16, 14);
    g.lineStyle(2, 0xff0000);
    g.strokeCircle(16, 16, 14);
    // X eyes
    g.lineStyle(2, 0xff0000, 0.8);
    g.lineBetween(10, 11, 14, 15);
    g.lineBetween(14, 11, 10, 15);
    g.lineBetween(18, 11, 22, 15);
    g.lineBetween(22, 11, 18, 15);
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

    // Shop NPC — golden/brown figure with coin symbol
    g.clear();
    // Body circle (brown)
    g.fillStyle(0x8b6914, 1);
    g.fillCircle(16, 16, 14);
    // Robe (golden)
    g.fillStyle(0xccaa33, 1);
    g.fillTriangle(6, 26, 26, 26, 16, 6);
    // Inner robe highlight
    g.fillStyle(0xddbf44, 0.8);
    g.fillTriangle(10, 24, 22, 24, 16, 10);
    // Coin symbol (circle with line)
    g.fillStyle(0xffcc00, 1);
    g.fillCircle(16, 15, 5);
    g.fillStyle(0x8b6914, 1);
    g.fillCircle(16, 15, 3);
    g.fillStyle(0xffcc00, 1);
    g.fillRect(15, 12, 2, 6);
    // Eyes
    g.fillStyle(0xffffff, 0.9);
    g.fillCircle(12, 10, 2);
    g.fillCircle(20, 10, 2);
    g.fillStyle(0x000000, 1);
    g.fillCircle(12, 10, 1);
    g.fillCircle(20, 10, 1);
    g.generateTexture('shop_npc', 32, 32);

    // Healing shrine
    g.clear();
    g.fillStyle(0x44ffaa, 0.6);
    g.fillCircle(16, 16, 14);
    g.fillStyle(0xffffff, 0.8);
    // Cross symbol
    g.fillRect(13, 6, 6, 20);
    g.fillRect(6, 13, 20, 6);
    g.fillStyle(0x44ffaa, 1);
    g.fillRect(14, 7, 4, 18);
    g.fillRect(7, 14, 18, 4);
    g.generateTexture('shrine', 32, 32);

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
    this.tileSprites = [];
    this.tilesDirty = true;
    this.lastTileFloor = -1;

    // Shop NPC sprite
    this.shopNpcSprite = null;
    this.shopNpcLabel = null;

    // Shrine sprites
    this.shrineSprites = new Map();

    // Story NPC sprites
    this.storyNpcSprites = {};

    this.discoveredRooms = new Set();

    // Smooth camera tracking position
    this.camTargetX = GAME_W / 2;
    this.camTargetY = GAME_H / 2;

    // Initialize HUD layer (hud.js)
    HUD.init(this);

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

    // ── HUD (delegated to hud.js) ──
    HUD.updateHUD(this, state);

    // ── Render players (sprites.js) ──
    const seenPlayers = new Set();
    for (const p of state.players) {
      seenPlayers.add(p.id);
      let sprite = this.playerSprites.get(p.id);
      if (!sprite) sprite = Sprites.createPlayerSprite(this, p);
      Sprites.updatePlayerSprite(this, sprite, p);
    }
    Sprites.cleanupPlayerSprites(this, seenPlayers);

    // ── Render monsters (sprites.js) ──
    const seenMonsters = new Set();
    if (state.world.monsters) {
      for (const m of state.world.monsters) {
        if (!m.alive) {
          Sprites.destroyMonsterSprite(this, m.id);
          continue;
        }
        seenMonsters.add(m.id);
        let sprite = this.monsterSprites.get(m.id);
        if (!sprite) sprite = Sprites.createMonsterSprite(this, m);
        Sprites.updateMonsterSprite(this, sprite, m);
      }
    }
    Sprites.cleanupMonsterSprites(this, seenMonsters);

    // ── Boss HP Bar (delegated to hud.js) ──
    HUD.updateBossBar(this, state);

    // ── Render ground items (sprites.js) ──
    const seenItems = new Set();
    if (state.world.groundItems) {
      for (const gi of state.world.groundItems) {
        seenItems.add(gi.id);
        let sprite = this.itemSprites.get(gi.id);
        if (!sprite) sprite = Sprites.createItemSprite(this, gi);
        Sprites.updateItemSprite(this, sprite, gi);
      }
    }
    Sprites.cleanupItemSprites(this, seenItems);

    // ── Render Shop NPC ──
    if (state.world.shopNpc) {
      const npc = state.world.shopNpc;
      if (!this.shopNpcSprite) {
        this.shopNpcSprite = this.add.sprite(npc.x, npc.y, 'shop_npc').setDepth(9).setScale(1.2);
        this.shopNpcLabel = this.add.text(npc.x, npc.y - 26, 'SHOP', {
          fontSize: '11px',
          fill: '#ffcc00',
          fontFamily: 'Courier New',
          fontStyle: 'bold',
          backgroundColor: '#00000088',
          padding: { x: 4, y: 2 },
        }).setOrigin(0.5).setDepth(10);
      }
      this.shopNpcSprite.setPosition(npc.x, npc.y);
      this.shopNpcLabel.setPosition(npc.x, npc.y - 26);
      // Gentle idle bob
      const bobShop = Math.sin(Date.now() / 600) * 1.5;
      this.shopNpcSprite.y += bobShop;
      this.shopNpcLabel.y += bobShop;
    } else {
      if (this.shopNpcSprite) {
        this.shopNpcSprite.destroy();
        this.shopNpcSprite = null;
      }
      if (this.shopNpcLabel) {
        this.shopNpcLabel.destroy();
        this.shopNpcLabel = null;
      }
    }

    // ── Render Story NPCs (sprites.js) ──
    if (state.world.storyNpcs) {
      const seenStoryNpcs = new Set();
      for (const npc of state.world.storyNpcs) {
        const key = `story_${npc.id}`;
        seenStoryNpcs.add(key);
        if (!this.storyNpcSprites[key]) {
          Sprites.createStoryNpcSprite(this, npc);
        }
        Sprites.updateStoryNpcSprite(this, this.storyNpcSprites[key], npc);
      }
      Sprites.cleanupStoryNpcSprites(this, seenStoryNpcs);
    } else {
      Sprites.cleanupStoryNpcSprites(this, null);
    }

    // ── Room Discovery Detection ──
    if (state.world.rooms) {
      for (const room of state.world.rooms) {
        if (room.discovered && !this.discoveredRooms.has(room.id)) {
          this.discoveredRooms.add(room.id);
          HUD.showRoomDiscovery(this);
        }
      }
    }

    // ── Render Healing Shrines (improved visuals) ──
    if (state.world.rooms) {
      const seenShrines = new Set();
      for (const room of state.world.rooms) {
        if (!room.hasShrine || !room.discovered) continue;
        seenShrines.add(room.id);
        let shrine = this.shrineSprites.get(room.id);
        if (!shrine) {
          // Place shrine at center of room
          const sx = (room.x + room.w / 2) * TILE_SIZE;
          const sy = (room.y + room.h / 2) * TILE_SIZE - 16;
          shrine = this.add.sprite(sx, sy, 'shrine').setDepth(5).setScale(0.9);
          shrine._baseY = sy;
          shrine._baseX = sx;
          shrine.label = this.add.text(sx, sy - 22, 'SHRINE', {
            fontSize: '9px',
            fill: room.shrineUsed ? '#444444' : '#44ffaa',
            fontFamily: 'Courier New',
            fontStyle: 'bold',
            backgroundColor: '#00000066',
            padding: { x: 3, y: 1 },
          }).setOrigin(0.5).setDepth(6);

          // Orbiting particle dots (4 dots) for active shrines
          shrine._orbitDots = [];
          for (let di = 0; di < 4; di++) {
            const dot = this.add.graphics().setDepth(6);
            dot._angle = (Math.PI * 2 / 4) * di;
            shrine._orbitDots.push(dot);
          }

          // Cracked lines overlay for used shrines
          shrine._crackGfx = this.add.graphics().setDepth(6);

          this.shrineSprites.set(room.id, shrine);
        }
        // Update shrine appearance
        if (room.shrineUsed) {
          shrine.setAlpha(0.25);
          shrine.setTint(0x555555);
          shrine.label.setColor('#444444');
          shrine.label.setText('DEPLETED');

          // Hide orbit dots
          for (const dot of shrine._orbitDots) {
            dot.clear();
          }

          // Draw cracked appearance (dark lines over sprite)
          shrine._crackGfx.clear();
          shrine._crackGfx.lineStyle(1, 0x222222, 0.7);
          const cx = shrine._baseX;
          const cy = shrine._baseY;
          shrine._crackGfx.lineBetween(cx - 6, cy - 8, cx + 2, cy);
          shrine._crackGfx.lineBetween(cx + 2, cy, cx - 3, cy + 7);
          shrine._crackGfx.lineBetween(cx + 4, cy - 5, cx + 7, cy + 3);
          shrine._crackGfx.lineBetween(cx - 4, cy + 2, cx + 1, cy + 9);
        } else {
          // Pulsing glow for active shrine
          shrine.clearTint();
          const pulse = 0.7 + Math.sin(Date.now() / 500) * 0.3;
          shrine.setAlpha(pulse);
          shrine.y = shrine._baseY + Math.sin(Date.now() / 800) * 2;
          shrine.label.y = shrine.y - 22;
          shrine._crackGfx.clear();

          // Animate orbiting particle dots
          const time = Date.now() / 1200;
          for (const dot of shrine._orbitDots) {
            dot.clear();
            const a = dot._angle + time;
            const dx = shrine._baseX + Math.cos(a) * 18;
            const dy = shrine.y + Math.sin(a) * 18;
            const dotAlpha = 0.5 + Math.sin(time * 2 + dot._angle) * 0.4;
            dot.fillStyle(0x44ffaa, dotAlpha);
            dot.fillCircle(dx, dy, 2);
          }
        }
      }
      // Clean up old shrines
      for (const [id, shrine] of this.shrineSprites) {
        if (!seenShrines.has(id)) {
          shrine.label.destroy();
          if (shrine._orbitDots) {
            for (const dot of shrine._orbitDots) dot.destroy();
          }
          if (shrine._crackGfx) shrine._crackGfx.destroy();
          shrine.destroy();
          this.shrineSprites.delete(id);
        }
      }
    }

    // ── Combat events (damage numbers + skill effects) ──
    if (state.events) {
      for (const ev of state.events) {
        if (ev.type === 'combat:hit' && ev.damage > 0) {
          const target = state.world.monsters?.find(m => m.id === ev.targetId)
            || state.players?.find(p => p.id === ev.targetId);
          if (target) {
            HUD.spawnDamageText(this, target.x || 0, (target.y || 0) - 30, ev.damage, ev.isCrit, ev.dodged);
            // Camera shake on crit
            if (ev.isCrit) {
              this.cameras.main.shake(200, 0.003);
            }
          }

          // Skill visual effects
          if (ev.skillName) {
            const attacker = state.players?.find(p => p.id === ev.attackerId);
            switch (ev.skillName) {
              case 'Cleave': {
                const ax = attacker ? attacker.x : (target ? target.x : 0);
                const ay = attacker ? attacker.y : (target ? target.y : 0);
                this.spawnAoeEffect(ax, ay, 60, 0xff8833, 500);
                break;
              }
              case 'Fireball': {
                const tx = target ? target.x : 0;
                const ty = target ? target.y : 0;
                this.spawnAoeEffect(tx, ty, 50, 0xff3311, 600);
                break;
              }
              case 'Frost Nova': {
                const ax = attacker ? attacker.x : (target ? target.x : 0);
                const ay = attacker ? attacker.y : (target ? target.y : 0);
                this.spawnAoeEffect(ax, ay, 80, 0x44ddff, 700);
                break;
              }
              case 'Multi-Shot': {
                if (attacker && target) {
                  this.spawnProjectile(attacker.x, attacker.y, target.x, target.y, 0x44cc44);
                }
                break;
              }
              case 'Poison Arrow': {
                if (attacker && target) {
                  this.spawnProjectile(attacker.x, attacker.y, target.x, target.y, 0x88cc22);
                  // Poison cloud at impact
                  this.spawnAoeEffect(target.x, target.y, 20, 0x66aa11, 800);
                }
                break;
              }
              case 'Shield Bash': {
                if (target) {
                  this.spawnAoeEffect(target.x, target.y, 24, 0xffcc44, 300);
                }
                break;
              }
            }
          }
        }
        if (ev.type === 'combat:hit' && ev.dodged) {
          const target = state.players?.find(p => p.id === ev.targetId);
          if (target) {
            HUD.spawnDamageText(this, target.x, target.y - 30, 'DODGE', false, true);
          }
        }
        if (ev.type === 'combat:heal') {
          const target = state.players?.find(p => p.id === ev.targetId || p.id === ev.playerId);
          if (target) {
            HUD.spawnHealNumber(this, target.x, target.y - 30, ev.amount || ev.heal || ev.damage);
          }
        }
        if (ev.type === 'player:levelup') {
          const p = state.players?.find(p => p.id === ev.playerId);
          if (p) {
            HUD.spawnDamageText(this, p.x, p.y - 50, `LEVEL ${ev.level}!`, false, false, '#ffcc00');
          }
        }
        if (ev.type === 'buff:apply') {
          const p = state.players?.find(p => p.id === ev.playerId);
          if (p) {
            HUD.spawnDamageText(this, p.x, p.y - 40, ev.skillName, false, false, '#44ccff');
            // Buff visual effect
            if (ev.skillName === 'War Cry') {
              this.spawnBuffEffect(p.x, p.y, 0xffcc00);
            } else if (ev.skillName === 'Evasion') {
              this.spawnBuffEffect(p.x, p.y, 0x44cc44);
            }
          }
        }
        if (ev.type === 'effect:spawn' && ev.effectType === 'teleport') {
          const p = state.players?.find(p => p.id === ev.playerId);
          // We have the destination (ev.x, ev.y). Use prior position from sprite if available.
          const sprite = p ? this.playerSprites.get(p.id) : null;
          const fromX = sprite ? sprite.x : ev.x;
          const fromY = sprite ? sprite.y : ev.y;
          this.spawnTeleportEffect(fromX, fromY, ev.x, ev.y);
        }
      }
    }

    // ── Update damage texts (delegated to hud.js) ──
    HUD.updateDamageTexts();

    // ── Camera follow with lerp ──
    if (state.players.length > 0) {
      let cx = 0, cy = 0;
      for (const p of state.players) { cx += p.x; cy += p.y; }
      cx /= state.players.length;
      cy /= state.players.length;

      const worldW = (state.world.gridW || 60) * TILE_SIZE;
      const worldH = (state.world.gridH || 40) * TILE_SIZE;
      const targetX = Math.max(GAME_W / 2, Math.min(cx, worldW - GAME_W / 2));
      const targetY = Math.max(GAME_H / 2, Math.min(cy, worldH - GAME_H / 2));

      // Smooth lerp camera (0.08 factor)
      this.camTargetX += (targetX - this.camTargetX) * 0.08;
      this.camTargetY += (targetY - this.camTargetY) * 0.08;
      this.cameras.main.centerOn(this.camTargetX, this.camTargetY);
    }

    // ── Minimap (delegated to hud.js) ──
    HUD.renderMinimap(state);
  }

  // ── Skill Visual Effects ──────────────────────────────────────

  spawnAoeEffect(x, y, radius, color, duration) {
    const circle = this.add.circle(x, y, radius, color, 0.3);
    circle.setDepth(7);
    this.tweens.add({
      targets: circle,
      alpha: 0,
      scale: 1.2,
      duration: duration || 500,
      onComplete: () => circle.destroy(),
    });
  }

  spawnProjectile(fromX, fromY, toX, toY, color) {
    const proj = this.add.circle(fromX, fromY, 4, color, 1);
    proj.setDepth(9);
    this.tweens.add({
      targets: proj,
      x: toX,
      y: toY,
      duration: 200,
      onComplete: () => proj.destroy(),
    });
  }

  spawnBuffEffect(x, y, color) {
    for (let i = 0; i < 8; i++) {
      const angle = (i / 8) * Math.PI * 2;
      const px = x + Math.cos(angle) * 20;
      const py = y + Math.sin(angle) * 20;
      const particle = this.add.circle(px, py, 3, color, 0.8);
      particle.setDepth(9);
      this.tweens.add({
        targets: particle,
        y: py - 30,
        alpha: 0,
        duration: 800,
        delay: i * 50,
        onComplete: () => particle.destroy(),
      });
    }
  }

  spawnTeleportEffect(fromX, fromY, toX, toY) {
    // Vanish effect at origin
    const vanish = this.add.circle(fromX, fromY, 16, 0xbb44ff, 0.6);
    vanish.setDepth(9);
    this.tweens.add({
      targets: vanish,
      scale: 0,
      alpha: 0,
      duration: 300,
      onComplete: () => vanish.destroy(),
    });
    // Appear effect at destination
    const appear = this.add.circle(toX, toY, 0, 0xbb44ff, 0.6);
    appear.setDepth(9);
    this.tweens.add({
      targets: appear,
      scale: 1,
      alpha: 0,
      duration: 300,
      delay: 150,
      onComplete: () => appear.destroy(),
    });
  }

  renderTiles(tiles, floor) {
    // Clear existing
    for (const s of this.tileSprites) s.destroy();
    this.tileSprites = [];
    if (!tiles) return;

    const theme = FLOOR_THEMES[floor % FLOOR_THEMES.length];

    // Generate tile textures for this floor theme
    // Remove existing tile textures first to avoid overwrite warnings
    const tileTexKeys = ['t_floor', 't_wall', 't_door', 't_corridor', 't_spawn', 't_exit_open', 't_exit_locked', 't_chest'];
    for (const key of tileTexKeys) {
      if (this.textures.exists(key)) this.textures.remove(key);
    }

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

  parseColor(hex) {
    if (typeof hex === 'number') return hex;
    hex = hex.replace('#', '');
    return parseInt(hex, 16);
  }

  shutdown() {
    HUD.shutdown();
  }
}

// ─── Socket Events ──────────────────────────────────────────────
socket.on('connect', () => {
  console.log('[TV] Connected to server');
});

socket.on('init', (data) => {
  console.log('[TV] Init received', data);
});

socket.on('state', (data) => {
  gameState = data;
});

socket.on('dungeon:enter', (data) => {
  console.log('[TV] Entering floor:', data.floorName || data.room.roomName);
  if (window.gameInstance) {
    const scene = window.gameInstance.scene.getScene('Game');
    if (scene) {
      scene.tileSprites.forEach(s => s.destroy());
      scene.tileSprites = [];
      scene.tilesDirty = true;

      // Clear all sprite types for fresh floor (sprites.js)
      Sprites.cleanupPlayerSprites(scene);
      Sprites.cleanupMonsterSprites(scene);
      Sprites.cleanupItemSprites(scene);
      Sprites.cleanupStoryNpcSprites(scene, null);
      Sprites.cleanupChestSprites();

      // Clean up shop NPC sprite
      if (scene.shopNpcSprite) {
        scene.shopNpcSprite.destroy();
        scene.shopNpcSprite = null;
      }
      if (scene.shopNpcLabel) {
        scene.shopNpcLabel.destroy();
        scene.shopNpcLabel = null;
      }

      // Clean up shrine sprites (including orbit dots and crack graphics)
      for (const [id, shrine] of scene.shrineSprites) {
        if (shrine.label) shrine.label.destroy();
        if (shrine._orbitDots) {
          for (const dot of shrine._orbitDots) dot.destroy();
        }
        if (shrine._crackGfx) shrine._crackGfx.destroy();
        shrine.destroy();
      }
      scene.shrineSprites.clear();

      HUD._forceDestroyDialogue();
      HUD._destroyVictoryScreen();

      // Reset boss tracking for new floor
      scene.discoveredRooms.clear();
      HUD.hideBossBar();

      // Room discovery flash
      HUD.showRoomDiscovery(scene);

      // Floor transition effect
      Sound.floorTransition();
      const floorIdx = data.floor || 0;
      const floorName = data.floorName || FLOOR_NAMES[floorIdx % FLOOR_NAMES.length] || `Floor ${floorIdx + 1}`;
      HUD.playFloorTransition(scene, floorIdx, floorName);
    }
  }
});

socket.on('wave:start', (data) => {
  if (window.gameInstance) {
    const scene = window.gameInstance.scene.getScene('Game');
    if (scene) {
      HUD.showWaveAnnouncement(scene, `WAVE ${data.wave}/${data.totalWaves}`, '#ff4444');
      // Trigger boss announcement if this is a boss room wave
      if (data.roomType === 'boss' && data.bossName) {
        HUD.showBossAnnouncement(scene, data.bossName);
        Sound.bossSpawn();
      }
    }
  }
});

socket.on('room:cleared', (data) => {
  if (window.gameInstance) {
    const scene = window.gameInstance.scene.getScene('Game');
    if (scene) {
      HUD.showWaveAnnouncement(scene, `${data.roomName} CLEARED!`, '#44ff44');
      HUD.spawnCelebrationParticles(scene);
      // Reset wave text color after announcement fades
      scene.time.delayedCall(2600, () => {
        HUD.setWaveTextColor('#ff4444');
      });
    }
  }
});

socket.on('exit:unlocked', () => {
  if (window.gameInstance) {
    const scene = window.gameInstance.scene.getScene('Game');
    if (scene) {
      HUD.showWaveAnnouncement(scene, 'EXIT UNLOCKED!', '#ffcc00');
      scene.tilesDirty = true; // Re-render exit tile color
      scene.time.delayedCall(3100, () => {
        HUD.setWaveTextColor('#ff4444');
      });
    }
  }
});

socket.on('shrine:used', (data) => {
  if (window.gameInstance) {
    const scene = window.gameInstance.scene.getScene('Game');
    if (scene) {
      Sound.shrineUse();
      HUD.showWaveAnnouncement(scene, 'SHRINE ACTIVATED!', '#44ffaa');
      scene.time.delayedCall(2600, () => {
        HUD.setWaveTextColor('#ff4444');
      });
      // Burst effect at shrine location
      if (data && data.x !== undefined && data.y !== undefined) {
        HUD.showShrineUsedBurst(scene, data.x, data.y);
      } else if (data && data.roomId) {
        // Find shrine by room ID and burst at its position
        const shrine = scene.shrineSprites.get(data.roomId);
        if (shrine) {
          HUD.showShrineUsedBurst(scene, shrine._baseX, shrine._baseY);
        }
      }
    }
  }
});

socket.on('quest:complete', (data) => {
  if (window.gameInstance) {
    const scene = window.gameInstance.scene.getScene('Game');
    if (scene && scene.scene.isActive()) {
      HUD.showQuestComplete(scene, data.title);
      Sound.questComplete();
    }
  }
});

socket.on('player:joined', (data) => {
  console.log(`[TV] Player joined: ${data.name} (${data.characterClass})`);
  Sound.unlock();
  Sound.levelUp();
});

socket.on('player:left', (data) => {
  console.log(`[TV] Player left: ${data.name}`);
});

socket.on('dialogue:start', (data) => {
  console.log(`[TV] Dialogue with ${data.npcName}: ${data.text}`);
  if (window.gameInstance) {
    const scene = window.gameInstance.scene.getScene('Game');
    if (scene && scene.scene.isActive()) {
      HUD.showDialogue(scene, data.npcName, data.text);
    }
  }
});

socket.on('dialogue:end', (data) => {
  if (window.gameInstance) {
    const scene = window.gameInstance.scene.getScene('Game');
    if (scene && scene.scene.isActive()) {
      HUD.hideDialogue(scene);
    }
  }
});

socket.on('boss:chest', (data) => {
  if (window.gameInstance) {
    const scene = window.gameInstance.scene.getScene('Game');
    if (scene && scene.scene.isActive()) {
      HUD.showBossChest(scene, data.x, data.y, data.id);
      Sound.loot();
    }
  }
});

socket.on('chest:opened', (data) => {
  if (window.gameInstance) {
    const scene = window.gameInstance.scene.getScene('Game');
    if (scene && scene.scene.isActive()) {
      HUD.showChestOpened(scene, data.id, data.x, data.y, data.gold);
    }
  }
});

socket.on('game:victory', (data) => {
  console.log('[TV] VICTORY!', data);
  if (window.gameInstance) {
    const scene = window.gameInstance.scene.getScene('Game');
    if (scene && scene.scene.isActive()) {
      // Play victory sound
      Sound.victory();
      setTimeout(() => Sound.levelUp(), 500);

      // Show victory screen via HUD
      HUD.showVictoryScreen(scene, data);
    }
  }
});

socket.on('room:discovered', (data) => {
  console.log(`[TV] Room discovered: ${data.roomName} (${data.roomType})`);
  if (window.gameInstance) {
    const scene = window.gameInstance.scene.getScene('Game');
    if (scene && scene.scene.isActive()) {
      HUD.showRoomDiscovery(scene);
    }
  }
});

socket.on('monster:split', (data) => {
  console.log(`[TV] Monster split: ${data.parentId} → ${data.childIds?.length || '?'} children`);
});

socket.on('player:respawn', (data) => {
  console.log(`[TV] Player respawned: ${data.playerId || data.name || 'unknown'}`);
  if (window.gameInstance) {
    const scene = window.gameInstance.scene.getScene('Game');
    if (scene && scene.scene.isActive()) {
      // Brief white flash for respawn
      const flash = scene.add.rectangle(GAME_W / 2, GAME_H / 2, GAME_W, GAME_H, 0xffffff, 0.3).setDepth(999);
      scene.tweens.add({
        targets: flash,
        alpha: 0,
        duration: 400,
        onComplete: () => flash.destroy(),
      });
    }
  }
});

socket.on('disconnect', () => {
  console.log('[TV] Disconnected from server');
});

// ─── Unlock audio on first TV interaction (click or keypress) ───
document.addEventListener('click', () => Sound.unlock(), { once: true });

// ─── Keyboard Shortcuts for TV ──────────────────────────────────
document.addEventListener('keydown', (e) => {
  Sound.unlock();
  if (e.key === 'm' || e.key === 'M') {
    const isOn = Sound.toggle();
    console.log(`[TV] Sound ${isOn ? 'ON' : 'OFF'}`);
  }
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
