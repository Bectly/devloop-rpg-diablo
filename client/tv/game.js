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

    // Smooth camera tracking position
    this.camTargetX = GAME_W / 2;
    this.camTargetY = GAME_H / 2;

    // HUD (fixed to camera)
    // ── Room name panel ──
    this.hudPanel = this.add.graphics().setScrollFactor(0).setDepth(999);

    this.roomText = this.add.text(20, 14, '', {
      fontSize: '18px', fill: '#ffffff', fontFamily: 'Courier New',
    }).setScrollFactor(0).setDepth(1000);

    this.floorText = this.add.text(20, 40, '', {
      fontSize: '14px', fill: '#ffcc44', fontFamily: 'Courier New',
    }).setScrollFactor(0).setDepth(1000);

    this.waveText = this.add.text(GAME_W / 2, 60, '', {
      fontSize: '24px', fill: '#ff4444', fontFamily: 'Courier New',
      fontStyle: 'bold',
      stroke: '#000000',
      strokeThickness: 4,
    }).setOrigin(0.5).setScrollFactor(0).setDepth(1001).setAlpha(0);
    this.waveTextTimer = 0;

    // Celebration particles container (for room cleared effect)
    this.celebrationParticles = [];

    // Floor transition overlay
    this.transitionOverlay = this.add.graphics().setScrollFactor(0).setDepth(2000);
    this.transitionOverlay.setAlpha(0);
    this.transitionText = this.add.text(GAME_W / 2, GAME_H / 2, '', {
      fontSize: '36px', fill: '#ffffff', fontFamily: 'Courier New',
      fontStyle: 'bold',
      stroke: '#000000',
      strokeThickness: 4,
    }).setOrigin(0.5).setScrollFactor(0).setDepth(2001).setAlpha(0);

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
    const roomLabel = `${state.world.roomName || 'Unknown'}${exitStatus}`;
    const floorLabel = `Floor ${(state.world.currentFloor || 0) + 1} | Rooms: ${(state.world.rooms || []).length}`;
    this.roomText.setText(roomLabel);
    this.floorText.setText(floorLabel);

    // Draw HUD panel background (semi-transparent rounded rect)
    this.hudPanel.clear();
    const panelW = Math.max(this.roomText.width, this.floorText.width) + 32;
    const panelH = 52;
    this.hudPanel.fillStyle(0x000000, 0.65);
    this.hudPanel.fillRoundedRect(6, 6, panelW, panelH, 8);
    this.hudPanel.lineStyle(1, 0x444466, 0.5);
    this.hudPanel.strokeRoundedRect(6, 6, panelW, panelH, 8);

    // Floor indicator color based on floor theme
    const floorTheme = FLOOR_THEMES[(state.world.currentFloor || 0) % FLOOR_THEMES.length];
    const floorTint = floorTheme.wallLight;
    const floorR = ((floorTint >> 16) & 0xff);
    const floorG = ((floorTint >> 8) & 0xff);
    const floorB = (floorTint & 0xff);
    // Brighten the wall-light color for text readability
    const brightR = Math.min(255, floorR + 100);
    const brightG = Math.min(255, floorG + 100);
    const brightB = Math.min(255, floorB + 100);
    const floorHex = `#${brightR.toString(16).padStart(2, '0')}${brightG.toString(16).padStart(2, '0')}${brightB.toString(16).padStart(2, '0')}`;
    this.floorText.setColor(floorHex);

    // Wave text fade
    if (this.waveTextTimer > 0) {
      this.waveTextTimer -= 16;
      this.waveText.setAlpha(Math.min(1, this.waveTextTimer / 500));
      if (this.waveTextTimer <= 0) {
        this.waveText.setText('');
        this.waveText.setAlpha(0);
      }
    }

    // ── Update celebration particles ──
    for (let i = this.celebrationParticles.length - 1; i >= 0; i--) {
      const cp = this.celebrationParticles[i];
      cp.life -= 16;
      cp.gfx.x += cp.vx;
      cp.gfx.y += cp.vy;
      cp.vy += 0.05; // gravity
      cp.gfx.setAlpha(Math.max(0, cp.life / cp.maxLife));
      if (cp.life <= 0) {
        cp.gfx.destroy();
        this.celebrationParticles.splice(i, 1);
      }
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

      // Rotation for directional indicator (facing direction)
      if (p.facing !== undefined) {
        sprite.setRotation(p.facing);
      } else if (p.dx !== undefined && p.dy !== undefined && (p.dx !== 0 || p.dy !== 0)) {
        sprite.setRotation(Math.atan2(p.dy, p.dx) - Math.PI / 2);
      }

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
            // Remove the generated texture to prevent memory leak
            const texKey = 'monster_' + m.id;
            if (this.textures.exists(texKey)) this.textures.remove(texKey);
          }
          continue;
        }

        seenMonsters.add(m.id);
        let sprite = this.monsterSprites.get(m.id);

        if (!sprite) {
          const g = this.make.graphics({ add: false });
          const s = m.size;
          const d = s * 2; // texture diameter

          if (m.isBoss) {
            // Boss: large angular body with crown/horns
            g.fillStyle(m.color, 1);
            // Main body (hexagonal-ish)
            g.fillTriangle(s, 2, d - 2, s, s, d - 2);
            g.fillTriangle(s, 2, 2, s, s, d - 2);
            // Darker center for depth
            g.fillStyle(m.color - 0x222222, 1);
            g.fillCircle(s, s, s * 0.5);
            // Crown/horns on top
            g.fillStyle(0xffcc00, 1);
            g.fillTriangle(s - 6, 4, s - 4, 0, s - 2, 4);
            g.fillTriangle(s - 1, 3, s, 0, s + 1, 3);
            g.fillTriangle(s + 2, 4, s + 4, 0, s + 6, 4);
            // Menacing eyes
            g.fillStyle(0xff0000, 1);
            g.fillCircle(s - 4, s - 2, 2);
            g.fillCircle(s + 4, s - 2, 2);
            g.fillStyle(0xffcc00, 1);
            g.fillCircle(s - 4, s - 2, 1);
            g.fillCircle(s + 4, s - 2, 1);
          } else if (m.behavior === 'ranged_kite') {
            // Archer: light brown angular with arrow symbol
            g.fillStyle(m.color, 1);
            g.fillTriangle(s, 2, d - 4, d - 2, 4, d - 2);
            // Darker inner
            g.fillStyle(m.color - 0x111111, 0.7);
            g.fillTriangle(s, 6, d - 8, d - 6, 8, d - 6);
            // Arrow symbol
            g.lineStyle(2, 0xffffcc, 0.9);
            g.lineBetween(s, 5, s, d - 5);
            g.lineBetween(s, 5, s - 3, 10);
            g.lineBetween(s, 5, s + 3, 10);
          } else if (m.behavior === 'melee_split') {
            // Slime: translucent blob with internal shading
            // Outer glow
            g.fillStyle(m.color, 0.3);
            g.fillCircle(s, s, s);
            // Main body
            g.fillStyle(m.color, 0.7);
            g.fillCircle(s, s + 1, s - 2);
            // Highlight (top-left)
            g.fillStyle(0xffffff, 0.2);
            g.fillCircle(s - 3, s - 3, s * 0.35);
            // Internal darker spot
            g.fillStyle(m.color - 0x224422, 0.5);
            g.fillCircle(s + 2, s + 2, s * 0.3);
            // Glossy eye dots
            g.fillStyle(0x000000, 0.7);
            g.fillCircle(s - 3, s - 1, 2);
            g.fillCircle(s + 3, s - 1, 2);
          } else {
            // Default melee (skeleton/zombie/demon)
            const mName = (m.name || '').toLowerCase();
            if (mName.includes('skeleton') || mName.includes('skel')) {
              // Skeleton: white/gray angular with skull
              g.fillStyle(0xbbbbbb, 1);
              g.fillRect(2, 2, d - 4, d - 4);
              // Angular cuts
              g.fillStyle(0x222222, 1);
              g.fillTriangle(0, 0, 6, 0, 0, 6);
              g.fillTriangle(d, 0, d - 6, 0, d, 6);
              g.fillTriangle(0, d, 6, d, 0, d - 6);
              g.fillTriangle(d, d, d - 6, d, d, d - 6);
              // Skull face
              g.fillStyle(0xdddddd, 1);
              g.fillCircle(s, s - 2, s * 0.45);
              // Eye sockets
              g.fillStyle(0x111111, 1);
              g.fillCircle(s - 3, s - 3, 2);
              g.fillCircle(s + 3, s - 3, 2);
              // Jaw line
              g.lineStyle(1, 0x333333, 0.8);
              g.lineBetween(s - 4, s + 2, s + 4, s + 2);
            } else if (mName.includes('zombie')) {
              // Zombie: green-brown lumbering
              g.fillStyle(0x556633, 1);
              g.fillRect(3, 1, d - 6, d - 2);
              // Hunched top
              g.fillStyle(0x667744, 1);
              g.fillCircle(s, 6, s * 0.5);
              // Tattered detail
              g.fillStyle(0x445522, 0.8);
              g.fillRect(4, d - 6, 4, 6);
              g.fillRect(d - 8, d - 6, 4, 6);
              // Eyes
              g.fillStyle(0xaacc44, 0.8);
              g.fillCircle(s - 3, 5, 2);
              g.fillCircle(s + 3, 5, 2);
              // Drool/detail line
              g.lineStyle(1, 0x445522, 0.6);
              g.lineBetween(s - 2, 9, s + 2, 10);
            } else if (mName.includes('demon')) {
              // Demon: red angular spiky
              g.fillStyle(m.color, 1);
              // Core body
              g.fillTriangle(s, 2, d - 2, d - 2, 2, d - 2);
              // Spikes on top
              g.fillStyle(m.color + 0x220000, 1);
              g.fillTriangle(4, s, 0, 2, 8, s);
              g.fillTriangle(d - 8, s, d, 2, d - 4, s);
              // Center spike
              g.fillTriangle(s - 3, 6, s, 0, s + 3, 6);
              // Glowing eyes
              g.fillStyle(0xffaa00, 1);
              g.fillCircle(s - 4, s - 2, 2);
              g.fillCircle(s + 4, s - 2, 2);
              // Dark accents
              g.fillStyle(0x220000, 0.4);
              g.fillCircle(s, s + 3, s * 0.3);
            } else {
              // Generic melee square with face
              g.fillStyle(m.color, 1);
              g.fillRect(2, 2, d - 4, d - 4);
              g.fillStyle(m.color + 0x111111, 0.8);
              g.fillRect(4, 4, d - 8, d - 8);
              // Simple eyes
              g.fillStyle(0xff0000, 0.8);
              g.fillCircle(s - 3, s - 2, 2);
              g.fillCircle(s + 3, s - 2, 2);
            }
          }
          g.generateTexture(`monster_${m.id}`, d, d);
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
        // Remove the generated texture to prevent memory leak
        const texKey = 'monster_' + id;
        if (this.textures.exists(texKey)) this.textures.remove(texKey);
      }
    }

    // ── Render ground items with rarity glow + bobbing + legendary sparkle ──
    const seenItems = new Set();
    if (state.world.groundItems) {
      for (const gi of state.world.groundItems) {
        seenItems.add(gi.id);
        let sprite = this.itemSprites.get(gi.id);

        if (!sprite) {
          sprite = this.add.sprite(gi.x, gi.y, 'loot').setDepth(5).setScale(0.6);
          sprite._baseY = gi.y;
          sprite._isLegendary = (gi.rarity === 'legendary' || gi.rarity === 'Legendary'
            || (gi.rarityColor && gi.rarityColor.toLowerCase() === '#ff8800'));

          // Rarity-colored glow ring
          const glowColor = this.parseColor(gi.rarityColor || '#aaaaaa');
          sprite.glow = this.add.graphics().setDepth(4);
          sprite._glowColor = glowColor;
          sprite._glowX = gi.x;
          sprite._glowY = gi.y;

          sprite.nameText = this.add.text(gi.x, gi.y - 18, gi.name, {
            fontSize: '9px',
            fill: gi.rarityColor || '#aaaaaa',
            fontFamily: 'Courier New',
            backgroundColor: '#00000088',
            padding: { x: 2, y: 1 },
          }).setOrigin(0.5).setDepth(6);
          this.itemSprites.set(gi.id, sprite);

          // Legendary sparkle sprites
          if (sprite._isLegendary) {
            sprite._sparkles = [];
            for (let si = 0; si < 4; si++) {
              const sparkle = this.add.graphics().setDepth(7);
              sparkle._angle = (Math.PI * 2 / 4) * si;
              sparkle._radius = 14;
              sprite._sparkles.push(sparkle);
            }
          }
        }

        // Gentle bobbing (2px up/down) — hash ID to number to avoid NaN with UUID strings
        const now = Date.now();
        const idHash = typeof gi.id === 'number' ? gi.id : [...String(gi.id)].reduce((h, c) => (h * 31 + c.charCodeAt(0)) | 0, 0);
        const bobOffset = Math.sin((now + idHash * 1.7) / 400) * 2;
        sprite.y = sprite._baseY + bobOffset;
        sprite.nameText.setPosition(sprite.x, sprite.y - 18);

        // Pulsing glow (0.5 to 0.9 alpha)
        const glowAlpha = 0.5 + Math.sin(now / 300 + idHash * 2.3) * 0.2;
        sprite.glow.clear();
        sprite.glow.fillStyle(sprite._glowColor, glowAlpha * 0.4);
        sprite.glow.fillCircle(sprite._glowX, sprite._baseY + bobOffset, 18);
        sprite.glow.lineStyle(1, sprite._glowColor, glowAlpha);
        sprite.glow.strokeCircle(sprite._glowX, sprite._baseY + bobOffset, 18);

        // Legendary rotating sparkles
        if (sprite._isLegendary && sprite._sparkles) {
          const time = Date.now() / 800;
          for (const sparkle of sprite._sparkles) {
            sparkle.clear();
            const a = sparkle._angle + time;
            const sx = sprite._glowX + Math.cos(a) * sparkle._radius;
            const sy = sprite._baseY + bobOffset + Math.sin(a) * sparkle._radius;
            const sparkAlpha = 0.5 + Math.sin(time * 3 + sparkle._angle) * 0.5;
            sparkle.fillStyle(0xffcc00, sparkAlpha);
            // Draw a small 4-point star
            sparkle.fillRect(sx - 1, sy - 3, 2, 6);
            sparkle.fillRect(sx - 3, sy - 1, 6, 2);
          }
        }
      }
    }

    for (const [id, sprite] of this.itemSprites) {
      if (!seenItems.has(id)) {
        sprite.nameText.destroy();
        if (sprite.glow) sprite.glow.destroy();
        if (sprite._sparkles) {
          for (const sp of sprite._sparkles) sp.destroy();
        }
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
            // Camera shake on crit
            if (ev.isCrit) {
              this.cameras.main.shake(200, 0.003);
            }
          }
        }
        if (ev.type === 'combat:hit' && ev.dodged) {
          const target = state.players?.find(p => p.id === ev.targetId);
          if (target) {
            this.spawnDamageText(target.x, target.y - 30, 'DODGE', false, true);
          }
        }
        if (ev.type === 'combat:heal') {
          const target = state.players?.find(p => p.id === ev.targetId || p.id === ev.playerId);
          if (target) {
            this.spawnHealNumber(target.x, target.y - 30, ev.amount || ev.heal || ev.damage);
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
      if (dt.isHeal) {
        dt.text.y -= 1.0; // healing goes up faster
      } else {
        dt.text.y -= 0.8;
      }
      dt.text.setAlpha(dt.life / dt.maxLife);
      // Scale-pop for crits: shrink from 1.5 to 1.0 over first 200ms
      if (dt.isCrit && dt.maxLife - dt.life < 200) {
        const popProgress = (dt.maxLife - dt.life) / 200;
        const popScale = 1.5 - popProgress * 0.5;
        dt.text.setScale(popScale);
      }
      if (dt.life <= 0) {
        dt.text.destroy();
        this.damageTexts.splice(i, 1);
      }
    }

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

    if (isDodge) {
      // Dodge: italic, cyan, "DODGE" text
      const t = this.add.text(x + offset, y, 'DODGE', {
        fontSize: '14px',
        fill: '#44ccff',
        fontFamily: 'Courier New',
        fontStyle: 'italic',
        stroke: '#001122',
        strokeThickness: 3,
      }).setOrigin(0.5).setDepth(100);
      this.damageTexts.push({ text: t, life: 800, maxLife: 800, isCrit: false, isHeal: false });
      return;
    }

    if (isCrit) {
      // Crit: large (22px), yellow with orange stroke, scale-pop
      const t = this.add.text(x + offset, y, String(text), {
        fontSize: '22px',
        fill: '#ffdd00',
        fontFamily: 'Courier New',
        fontStyle: 'bold',
        stroke: '#cc6600',
        strokeThickness: 3,
      }).setOrigin(0.5).setDepth(100).setScale(1.5);
      this.damageTexts.push({ text: t, life: 1000, maxLife: 1000, isCrit: true, isHeal: false });
      return;
    }

    // Normal damage or special text
    const col = color || '#ff6655';
    const size = color ? '16px' : '14px';
    const style = color ? 'bold' : 'normal';

    const t = this.add.text(x + offset, y, String(text), {
      fontSize: size,
      fill: col,
      fontFamily: 'Courier New',
      fontStyle: style,
      stroke: '#000000',
      strokeThickness: 3,
    }).setOrigin(0.5).setDepth(100);

    // Subtle pop for normal damage
    if (!color) {
      t.setScale(1.15);
      this.tweens.add({
        targets: t,
        scaleX: 1,
        scaleY: 1,
        duration: 150,
        ease: 'Back.easeOut',
      });
    }

    this.damageTexts.push({ text: t, life: 800, maxLife: 800, isCrit: false, isHeal: false });
  }

  spawnHealNumber(x, y, amount) {
    if (!amount || amount <= 0) return;
    const offset = (Math.random() - 0.5) * 20;
    const t = this.add.text(x + offset, y, `+${amount}`, {
      fontSize: '16px',
      fill: '#44ff44',
      fontFamily: 'Courier New',
      fontStyle: 'bold',
      stroke: '#003300',
      strokeThickness: 3,
    }).setOrigin(0.5).setDepth(100);

    this.damageTexts.push({ text: t, life: 900, maxLife: 900, isCrit: false, isHeal: true });
  }

  // ── Floor Transition Effect ──
  playFloorTransition(floorIndex, floorName) {
    // Black overlay fade in
    this.transitionOverlay.clear();
    this.transitionOverlay.fillStyle(0x000000, 1);
    this.transitionOverlay.fillRect(0, 0, GAME_W, GAME_H);
    this.transitionOverlay.setAlpha(0);

    this.transitionText.setText(floorName || `Floor ${floorIndex + 1}`);
    this.transitionText.setAlpha(0);

    // Fade in black
    this.tweens.add({
      targets: this.transitionOverlay,
      alpha: 0.85,
      duration: 300,
      ease: 'Sine.easeIn',
      onComplete: () => {
        // Show floor name
        this.transitionText.setAlpha(1).setScale(0.5);
        this.tweens.add({
          targets: this.transitionText,
          scaleX: 1,
          scaleY: 1,
          duration: 400,
          ease: 'Back.easeOut',
        });

        // Hold for 1.5s then fade everything out
        this.time.delayedCall(1500, () => {
          this.tweens.add({
            targets: [this.transitionOverlay, this.transitionText],
            alpha: 0,
            duration: 500,
            ease: 'Sine.easeOut',
          });
        });
      },
    });
  }

  // ── Wave Announcement with dramatic entrance ──
  showWaveAnnouncement(text, fillColor) {
    this.waveText.setText(text);
    if (fillColor) this.waveText.setColor(fillColor);
    this.waveText.setScale(0);
    this.waveText.setAlpha(1);
    this.waveTextTimer = 2500;

    // Scale from 0 to 1 with bounce
    this.tweens.add({
      targets: this.waveText,
      scaleX: 1,
      scaleY: 1,
      duration: 400,
      ease: 'Back.easeOut',
    });
  }

  // ── Room Cleared Celebration Effect ──
  spawnCelebrationParticles() {
    const cx = GAME_W / 2;
    const cy = 90;
    for (let i = 0; i < 20; i++) {
      const angle = (Math.PI * 2 / 20) * i + (Math.random() - 0.5) * 0.3;
      const speed = 1.5 + Math.random() * 2;
      const gfx = this.add.graphics().setScrollFactor(0).setDepth(1003);
      const dotSize = 2 + Math.random() * 3;
      const green = 0x44ff44 + Math.floor(Math.random() * 0x004400);
      gfx.fillStyle(green, 1);
      gfx.fillCircle(0, 0, dotSize);
      gfx.setPosition(cx, cy);
      this.celebrationParticles.push({
        gfx,
        vx: Math.cos(angle) * speed,
        vy: Math.sin(angle) * speed - 1.5,
        life: 800 + Math.random() * 400,
        maxLife: 1200,
      });
    }
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
        if (sprite._sparkles) {
          for (const sp of sprite._sparkles) sp.destroy();
        }
        sprite.destroy();
      }
      scene.itemSprites.clear();

      // Floor transition effect
      const floorIdx = data.floor || 0;
      const floorName = data.floorName || FLOOR_NAMES[floorIdx % FLOOR_NAMES.length] || `Floor ${floorIdx + 1}`;
      scene.playFloorTransition(floorIdx, floorName);
    }
  }
});

socket.on('wave:start', (data) => {
  if (window.gameInstance) {
    const scene = window.gameInstance.scene.getScene('Game');
    if (scene) {
      scene.showWaveAnnouncement(`WAVE ${data.wave}/${data.totalWaves}`, '#ff4444');
    }
  }
});

socket.on('room:cleared', (data) => {
  if (window.gameInstance) {
    const scene = window.gameInstance.scene.getScene('Game');
    if (scene) {
      scene.showWaveAnnouncement(`${data.roomName} CLEARED!`, '#44ff44');
      scene.spawnCelebrationParticles();
      // Reset wave text color after announcement fades
      scene.time.delayedCall(2600, () => {
        scene.waveText.setColor('#ff4444');
      });
    }
  }
});

socket.on('exit:unlocked', () => {
  if (window.gameInstance) {
    const scene = window.gameInstance.scene.getScene('Game');
    if (scene) {
      scene.showWaveAnnouncement('EXIT UNLOCKED!', '#ffcc00');
      scene.tilesDirty = true; // Re-render exit tile color
      scene.time.delayedCall(3100, () => {
        scene.waveText.setColor('#ff4444');
      });
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
