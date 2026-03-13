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
// Track active set bonuses per player for set completion announcements
let _prevActiveSets = {}; // playerId → serialized active bonus keys

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

    // ── Trap textures ──
    // Spike trap — gray metallic grate with shine
    g.clear();
    g.fillStyle(0x555566, 0.6);
    g.fillCircle(16, 16, 10);
    g.lineStyle(2, 0x888899, 0.8);
    g.lineBetween(10, 12, 22, 12);
    g.lineBetween(10, 16, 22, 16);
    g.lineBetween(10, 20, 22, 20);
    g.lineBetween(12, 10, 12, 22);
    g.lineBetween(16, 10, 16, 22);
    g.lineBetween(20, 10, 20, 22);
    g.fillStyle(0xccccdd, 0.4);
    g.fillCircle(14, 14, 2);
    g.generateTexture('trap_spike', 32, 32);

    // Fire grate — glowing red/orange floor
    g.clear();
    g.fillStyle(0x661100, 0.6);
    g.fillCircle(16, 16, 10);
    g.fillStyle(0xff4400, 0.4);
    g.fillCircle(16, 16, 7);
    g.fillStyle(0xff8800, 0.3);
    g.fillCircle(16, 14, 4);
    g.generateTexture('trap_fire', 32, 32);

    // Poison pool — green bubbles
    g.clear();
    g.fillStyle(0x114411, 0.6);
    g.fillCircle(16, 16, 10);
    g.fillStyle(0x33aa33, 0.4);
    g.fillCircle(13, 15, 4);
    g.fillStyle(0x44cc44, 0.3);
    g.fillCircle(19, 17, 3);
    g.fillCircle(15, 19, 2);
    g.generateTexture('trap_poison', 32, 32);

    // Void rift — purple swirl
    g.clear();
    g.fillStyle(0x220044, 0.6);
    g.fillCircle(16, 16, 10);
    g.fillStyle(0x6622bb, 0.4);
    g.fillCircle(16, 16, 7);
    g.lineStyle(1.5, 0x8844dd, 0.5);
    g.strokeCircle(16, 16, 5);
    g.strokeCircle(16, 16, 8);
    g.fillStyle(0xaa66ff, 0.3);
    g.fillCircle(16, 16, 3);
    g.generateTexture('trap_void', 32, 32);

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

    // Trap sprites
    this.trapSprites = new Map();

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
          Sprites.destroyMonsterSprite(this, m.id, m);
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

    // ── Render Shop NPC (effects.js) ──
    Effects.updateShopNpc(this, state);

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

    // ── Render Healing Shrines + Environmental Traps (effects.js) ──
    Effects.updateShrines(this, state);
    Effects.updateTraps(this, state);

    // ── Combat events + skill effects (combat-fx.js) ──
    CombatFX.processCombatEvents(this, state);

    // ── Update damage texts (delegated to hud.js) ──
    HUD.updateDamageTexts();

    // ── Chat bubbles (hud.js) ──
    HUD.updateChatBubbles(this, state);

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
  // Detect new set bonuses for announcements
  if (data.players && window.gameInstance) {
    const scene = window.gameInstance.scene.getScene('Game');
    if (scene && scene.scene.isActive()) {
      for (const p of data.players) {
        if (!p.activeSets || p.activeSets.length === 0) {
          _prevActiveSets[p.id] = new Set();
          continue;
        }
        const prev = _prevActiveSets[p.id] || new Set();
        const curr = new Set();
        for (const as of p.activeSets) {
          if (!as.bonuses) continue;
          for (const b of as.bonuses) {
            if (b.active) {
              const key = `${as.setId}:${b.threshold}`;
              curr.add(key);
              if (!prev.has(key)) {
                // New set bonus activated!
                const isComplete = as.pieces >= as.totalPieces;
                const label = isComplete
                  ? `\uD83C\uDFDB ${as.name} Set Complete! (${as.pieces}/${as.totalPieces})`
                  : `\u2694 ${as.name} Set (${as.pieces}/${as.totalPieces}) \u2014 ${b.description}`;
                HUD.showSetAnnouncement(scene, label, isComplete);
              }
            }
          }
        }
        _prevActiveSets[p.id] = curr;
      }
    }
  }
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

      // Clean up environment sprites (shop NPC, shrines, traps)
      Effects.cleanupAll(scene);

      HUD._forceDestroyDialogue();
      HUD._destroyVictoryScreen();

      // Reset boss tracking for new floor
      scene.discoveredRooms.clear();
      HUD.hideBossBar();

      // Clear chat bubbles on floor change
      for (const b of HUD._chatBubbles) {
        if (b.text) b.text.destroy();
        if (b.bg) b.bg.destroy();
      }
      HUD._chatBubbles = [];

      // Room discovery flash
      HUD.showRoomDiscovery(scene);

      // Floor transition effect with zone color
      Sound.floorTransition();
      const floorIdx = data.floor || 0;
      const floorName = data.floorName || FLOOR_NAMES[floorIdx % FLOOR_NAMES.length] || `Floor ${floorIdx + 1}`;
      const zoneId = data.zoneId || 'catacombs';
      HUD.playFloorTransition(scene, floorIdx, floorName, zoneId);
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

socket.on('rift:complete', (data) => {
  console.log('[TV] Rift complete:', data);
  if (window.gameInstance) {
    const scene = window.gameInstance.scene.getScene('Game');
    if (scene && scene.scene.isActive()) {
      HUD.hideRiftTimer();
      HUD.showRiftComplete(scene, data);
      Sound.victory();
    }
  }
});

socket.on('rift:failed', (data) => {
  console.log('[TV] Rift failed:', data);
  if (window.gameInstance) {
    const scene = window.gameInstance.scene.getScene('Game');
    if (scene && scene.scene.isActive()) {
      HUD.hideRiftTimer();
      HUD.showRiftFailed(scene, data);
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

socket.on('chat:message', (data) => {
  if (window.gameInstance) {
    const scene = window.gameInstance.scene.getScene('Game');
    if (scene && scene.scene.isActive()) {
      HUD.showChatBubble(scene, data.playerId, data.name, data.text);
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
