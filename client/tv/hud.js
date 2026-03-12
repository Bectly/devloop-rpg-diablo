// ─── DevLoop RPG — TV Client HUD Layer ──────────────────────────
// Loaded before game.js. Exposes window.HUD for all overlay/UI drawing.

window.HUD = {
  // ── Internal state ──
  damageTexts: [],
  celebrationParticles: [],
  questAnnouncementQueue: [],
  questAnnouncementActive: false,
  _activeBannerObjs: [],
  bossBar: null,
  lastBossId: null,

  // Refs set by init()
  hudPanel: null,
  roomText: null,
  floorText: null,
  waveText: null,
  waveTextTimer: 0,
  transitionOverlay: null,
  transitionText: null,
  minimapGfx: null,
  minimapBg: null,

  // ── Called once from GameScene.create() ──
  init(scene) {
    const GAME_W = 1280;
    const GAME_H = 720;

    // Room name panel
    this.hudPanel = scene.add.graphics().setScrollFactor(0).setDepth(999);

    this.roomText = scene.add.text(20, 14, '', {
      fontSize: '18px', fill: '#ffffff', fontFamily: 'Courier New',
    }).setScrollFactor(0).setDepth(1000);

    this.floorText = scene.add.text(20, 40, '', {
      fontSize: '14px', fill: '#ffcc44', fontFamily: 'Courier New',
    }).setScrollFactor(0).setDepth(1000);

    this.waveText = scene.add.text(GAME_W / 2, 60, '', {
      fontSize: '24px', fill: '#ff4444', fontFamily: 'Courier New',
      fontStyle: 'bold',
      stroke: '#000000',
      strokeThickness: 4,
    }).setOrigin(0.5).setScrollFactor(0).setDepth(1001).setAlpha(0);
    this.waveTextTimer = 0;

    // Celebration particles container
    this.celebrationParticles = [];

    // Floor transition overlay
    this.transitionOverlay = scene.add.graphics().setScrollFactor(0).setDepth(2000);
    this.transitionOverlay.setAlpha(0);
    this.transitionText = scene.add.text(GAME_W / 2, GAME_H / 2, '', {
      fontSize: '36px', fill: '#ffffff', fontFamily: 'Courier New',
      fontStyle: 'bold',
      stroke: '#000000',
      strokeThickness: 4,
    }).setOrigin(0.5).setScrollFactor(0).setDepth(2001).setAlpha(0);

    // Minimap container (top-right corner)
    this.minimapGfx = scene.add.graphics().setScrollFactor(0).setDepth(1002);
    this.minimapBg = scene.add.graphics().setScrollFactor(0).setDepth(1001);

    // Reset per-scene state
    this.damageTexts = [];
    this.questAnnouncementQueue = [];
    this.questAnnouncementActive = false;
    this._activeBannerObjs = [];
    this.bossBar = null;
    this.lastBossId = null;
  },

  // ── Called every frame from GameScene.update() ──
  updateHUD(scene, state) {
    const GAME_W = 1280;
    const GAME_H = 720;

    // Room / floor labels
    const exitStatus = state.world.exitLocked ? ' [EXIT LOCKED]' : ' [EXIT OPEN]';
    const roomLabel = `${state.world.roomName || 'Unknown'}${exitStatus}`;
    const floorLabel = `Floor ${(state.world.currentFloor || 0) + 1} | Rooms: ${(state.world.rooms || []).length}`;
    this.roomText.setText(roomLabel);
    this.floorText.setText(floorLabel);

    // HUD panel background
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

    // Update celebration particles
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
  },

  // ── Boss HP Bar (bottom of screen, fixed to camera) ──
  updateBossBar(scene, state) {
    const GAME_W = 1280;
    const GAME_H = 720;

    if (!this.bossBar) {
      this.bossBar = {
        bg: scene.add.rectangle(GAME_W / 2, GAME_H - 30, GAME_W - 100, 24, 0x111122, 0.85).setScrollFactor(0).setDepth(1000),
        fill: scene.add.rectangle(50, GAME_H - 30, 0, 20, 0xcc2222, 1).setScrollFactor(0).setDepth(1001).setOrigin(0, 0.5),
        border: scene.add.rectangle(GAME_W / 2, GAME_H - 30, GAME_W - 100, 24).setScrollFactor(0).setDepth(1002).setStrokeStyle(2, 0x666666).setFillStyle(0, 0),
        nameText: scene.add.text(GAME_W / 2, GAME_H - 52, '', { fontSize: '16px', fontFamily: 'Courier New', color: '#ff4444', fontStyle: 'bold' }).setScrollFactor(0).setDepth(1002).setOrigin(0.5),
        hpText: scene.add.text(GAME_W / 2, GAME_H - 30, '', { fontSize: '11px', fontFamily: 'Courier New', color: '#ffffff', fontStyle: 'bold' }).setScrollFactor(0).setDepth(1003).setOrigin(0.5),
      };
      Object.values(this.bossBar).forEach(v => v.setVisible(false));
    }

    const boss = state.world.monsters ? state.world.monsters.find(m => m.isBoss && m.alive) : null;
    if (boss) {
      const pct = boss.hp / boss.maxHp;
      const barWidth = (GAME_W - 100 - 4) * pct;

      Object.values(this.bossBar).forEach(v => v.setVisible(true));
      this.bossBar.fill.setSize(barWidth, 20);
      this.bossBar.fill.setPosition(50 + 2, GAME_H - 30);

      const barColor = pct > 0.5 ? 0xcc2222 : pct > 0.25 ? 0xcc8822 : 0xff4444;
      this.bossBar.fill.setFillStyle(barColor);

      this.bossBar.nameText.setText(boss.phase ? `${boss.name || 'BOSS'} — Phase ${boss.phase}` : (boss.name || 'BOSS'));
      this.bossBar.hpText.setText(`${boss.hp} / ${boss.maxHp}`);

      // Boss entrance announcement (first time seeing this boss)
      if (this.lastBossId !== boss.id) {
        this.lastBossId = boss.id;
        this.showBossAnnouncement(scene, boss.name);
      }
    } else {
      Object.values(this.bossBar).forEach(v => v.setVisible(false));
      this.lastBossId = null;
    }
  },

  // ── Update floating damage / heal texts ──
  updateDamageTexts() {
    for (let i = this.damageTexts.length - 1; i >= 0; i--) {
      const dt = this.damageTexts[i];
      dt.life -= 16;
      if (dt.isHeal) {
        dt.text.y -= 1.0;
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
  },

  // ── Minimap ──
  renderMinimap(state) {
    const GAME_W = 1280;
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
  },

  // ── Floating damage text ──
  spawnDamageText(scene, x, y, text, isCrit, isDodge, color) {
    const offset = (Math.random() - 0.5) * 30;

    if (isDodge) {
      const t = scene.add.text(x + offset, y, 'DODGE', {
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
      const t = scene.add.text(x + offset, y, String(text), {
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

    const t = scene.add.text(x + offset, y, String(text), {
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
      scene.tweens.add({
        targets: t,
        scaleX: 1,
        scaleY: 1,
        duration: 150,
        ease: 'Back.easeOut',
      });
    }

    this.damageTexts.push({ text: t, life: 800, maxLife: 800, isCrit: false, isHeal: false });
  },

  // ── Floating heal number ──
  spawnHealNumber(scene, x, y, amount) {
    if (!amount || amount <= 0) return;
    const offset = (Math.random() - 0.5) * 20;
    const t = scene.add.text(x + offset, y, `+${amount}`, {
      fontSize: '16px',
      fill: '#44ff44',
      fontFamily: 'Courier New',
      fontStyle: 'bold',
      stroke: '#003300',
      strokeThickness: 3,
    }).setOrigin(0.5).setDepth(100);

    this.damageTexts.push({ text: t, life: 900, maxLife: 900, isCrit: false, isHeal: true });
  },

  // ── Floor Transition Effect ──
  playFloorTransition(scene, floorIndex, floorName) {
    const GAME_W = 1280;
    const GAME_H = 720;

    this.transitionOverlay.clear();
    this.transitionOverlay.fillStyle(0x000000, 1);
    this.transitionOverlay.fillRect(0, 0, GAME_W, GAME_H);
    this.transitionOverlay.setAlpha(0);

    this.transitionText.setText(floorName || `Floor ${floorIndex + 1}`);
    this.transitionText.setAlpha(0);

    // Fade in black
    scene.tweens.add({
      targets: this.transitionOverlay,
      alpha: 0.85,
      duration: 300,
      ease: 'Sine.easeIn',
      onComplete: () => {
        // Show floor name
        this.transitionText.setAlpha(1).setScale(0.5);
        scene.tweens.add({
          targets: this.transitionText,
          scaleX: 1,
          scaleY: 1,
          duration: 400,
          ease: 'Back.easeOut',
        });

        // Hold for 1.5s then fade everything out
        scene.time.delayedCall(1500, () => {
          scene.tweens.add({
            targets: [this.transitionOverlay, this.transitionText],
            alpha: 0,
            duration: 500,
            ease: 'Sine.easeOut',
          });
        });
      },
    });
  },

  // ── Wave Announcement with dramatic entrance ──
  showWaveAnnouncement(scene, text, fillColor) {
    this.waveText.setText(text);
    if (fillColor) this.waveText.setColor(fillColor);
    this.waveText.setScale(0);
    this.waveText.setAlpha(1);
    this.waveTextTimer = 2500;

    scene.tweens.add({
      targets: this.waveText,
      scaleX: 1,
      scaleY: 1,
      duration: 400,
      ease: 'Back.easeOut',
    });
  },

  // ── Boss Entrance Announcement ──
  showBossAnnouncement(scene, name) {
    const GAME_W = 1280;
    const GAME_H = 720;

    const overlay = scene.add.rectangle(GAME_W / 2, GAME_H / 2, GAME_W, GAME_H, 0x000000, 0.7)
      .setScrollFactor(0).setDepth(2000);

    const nameText = scene.add.text(GAME_W / 2, GAME_H / 2 - 20, name || 'BOSS', {
      fontSize: '32px', fontFamily: 'Courier New', color: '#ff4444', fontStyle: 'bold',
      stroke: '#000000', strokeThickness: 4,
    }).setScrollFactor(0).setDepth(2001).setOrigin(0.5).setAlpha(0).setScale(0.5);

    const subText = scene.add.text(GAME_W / 2, GAME_H / 2 + 20, '\u2014 PREPARE FOR BATTLE \u2014', {
      fontSize: '14px', fontFamily: 'Courier New', color: '#cc8844',
      stroke: '#000000', strokeThickness: 2,
    }).setScrollFactor(0).setDepth(2001).setOrigin(0.5).setAlpha(0);

    scene.tweens.add({
      targets: nameText, alpha: 1, scale: 1,
      duration: 500, ease: 'Back.easeOut',
    });
    scene.tweens.add({
      targets: subText, alpha: 1,
      duration: 400, delay: 300,
    });

    scene.time.delayedCall(2000, () => {
      scene.tweens.add({
        targets: [overlay, nameText, subText],
        alpha: 0, duration: 500,
        onComplete: () => { overlay.destroy(); nameText.destroy(); subText.destroy(); },
      });
    });
  },

  // ── Room Discovery Flash ──
  showRoomDiscovery(scene) {
    const GAME_W = 1280;
    const GAME_H = 720;

    const flash = scene.add.rectangle(GAME_W / 2, GAME_H / 2, GAME_W, GAME_H, 0xffffff, 0.15)
      .setScrollFactor(0).setDepth(1999);
    scene.tweens.add({
      targets: flash, alpha: 0, duration: 300,
      onComplete: () => flash.destroy(),
    });
  },

  // ── Shrine Used Burst Effect ──
  showShrineUsedBurst(scene, x, y) {
    // Expanding green circle burst
    const burst = scene.add.circle(x, y, 10, 0x44ffaa, 0.6).setDepth(7);
    scene.tweens.add({
      targets: burst,
      scale: 3,
      alpha: 0,
      duration: 600,
      ease: 'Sine.easeOut',
      onComplete: () => burst.destroy(),
    });
    // Secondary ring
    const ring = scene.add.circle(x, y, 8, 0x44ffaa, 0).setDepth(7);
    ring.setStrokeStyle(2, 0x88ffcc);
    scene.tweens.add({
      targets: ring,
      scale: 4,
      alpha: 0,
      duration: 800,
      delay: 100,
      ease: 'Sine.easeOut',
      onComplete: () => ring.destroy(),
    });
  },

  // ── Room Cleared Celebration Effect ──
  spawnCelebrationParticles(scene) {
    const GAME_W = 1280;
    const cx = GAME_W / 2;
    const cy = 90;
    for (let i = 0; i < 20; i++) {
      const angle = (Math.PI * 2 / 20) * i + (Math.random() - 0.5) * 0.3;
      const speed = 1.5 + Math.random() * 2;
      const gfx = scene.add.graphics().setScrollFactor(0).setDepth(1003);
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
  },

  // ── Quest Complete Announcement (queued) ──
  showQuestComplete(scene, title) {
    this.questAnnouncementQueue.push(title);
    if (!this.questAnnouncementActive) {
      this._processQuestQueue(scene);
    }
  },

  _processQuestQueue(scene) {
    if (this.questAnnouncementQueue.length === 0) {
      this.questAnnouncementActive = false;
      return;
    }
    this.questAnnouncementActive = true;
    const title = this.questAnnouncementQueue.shift();
    this._showQuestBanner(scene, title);
    // Process next after 3s (2.5s display + 0.5s gap)
    scene.time.delayedCall(3000, () => this._processQuestQueue(scene));
  },

  _showQuestBanner(scene, title) {
    const cam = scene.cameras.main;
    const cx = cam.scrollX + cam.width / 2;
    const cy = cam.scrollY + cam.height * 0.25;

    // Gold banner background
    const banner = scene.add.rectangle(cx, cy, 350, 40, 0x000000, 0.6);
    this._activeBannerObjs.push(banner);
    banner.setStrokeStyle(1, 0xffaa33, 0.8);
    banner.setDepth(1000);
    banner.setAlpha(0);

    // "QUEST COMPLETE" text
    const label = scene.add.text(cx, cy - 2, '\u2b50 QUEST COMPLETE', {
      fontSize: '13px',
      fontFamily: 'Courier New, monospace',
      color: '#ffcc00',
      fontStyle: 'bold',
      stroke: '#000000',
      strokeThickness: 3,
      align: 'center',
    });
    label.setOrigin(0.5);
    label.setDepth(1001);
    label.setAlpha(0);
    this._activeBannerObjs.push(label);

    // Quest title below
    const titleText = scene.add.text(cx, cy + 14, title, {
      fontSize: '10px',
      fontFamily: 'Courier New, monospace',
      color: '#ffffff',
      stroke: '#000000',
      strokeThickness: 2,
      align: 'center',
    });
    titleText.setOrigin(0.5);
    titleText.setDepth(1001);
    titleText.setAlpha(0);
    this._activeBannerObjs.push(titleText);

    // Animate in
    scene.tweens.add({
      targets: [banner, label, titleText],
      alpha: 1,
      duration: 300,
      ease: 'Back.easeOut',
    });

    // Scale pop on label
    label.setScale(0.5);
    scene.tweens.add({
      targets: label,
      scaleX: 1,
      scaleY: 1,
      duration: 400,
      ease: 'Back.easeOut',
    });

    // Gold sparkle particles around banner
    for (let i = 0; i < 8; i++) {
      const angle = (i / 8) * Math.PI * 2;
      const px = cx + Math.cos(angle) * 180;
      const py = cy + Math.sin(angle) * 30;
      const spark = scene.add.circle(cx, cy, 2, 0xffcc00, 0.8);
      spark.setDepth(1002);
      scene.tweens.add({
        targets: spark,
        x: px,
        y: py,
        alpha: 0,
        duration: 600,
        delay: 200 + i * 50,
        ease: 'Cubic.easeOut',
        onComplete: () => spark.destroy(),
      });
    }

    const self = this;
    // Fade out after 2.5s
    scene.time.delayedCall(2500, () => {
      scene.tweens.add({
        targets: [banner, label, titleText],
        alpha: 0,
        y: '-=15',
        duration: 400,
        ease: 'Cubic.easeIn',
        onComplete: () => {
          banner.destroy();
          label.destroy();
          titleText.destroy();
          self._activeBannerObjs = self._activeBannerObjs.filter(o => o !== banner && o !== label && o !== titleText);
        },
      });
    });
  },

  // ── Dialogue overlay (TV side) ──
  _dialogueObjects: null,

  showDialogue(scene, npcName, text) {
    // Clean up previous dialogue
    HUD.hideDialogue(scene);

    const cam = scene.cameras.main;
    const w = cam.width;
    const h = cam.height;
    const y = cam.scrollY + h - 80;
    const x = cam.scrollX + w / 2;

    // Dark backdrop at bottom
    const bg = scene.add.rectangle(x, y + 10, w - 40, 60, 0x000000, 0.75);
    bg.setStrokeStyle(1, 0xffaa33, 0.4);
    bg.setDepth(900);
    bg.setScrollFactor(0);

    // NPC name
    const nameText = scene.add.text(x - (w / 2) + 40, y - 12, npcName, {
      fontSize: '11px',
      fontFamily: 'Courier New, monospace',
      color: '#ffaa33',
      fontStyle: 'bold',
      stroke: '#000',
      strokeThickness: 2,
    });
    nameText.setDepth(901);
    nameText.setScrollFactor(0);

    // Dialogue text
    const dialogueText = scene.add.text(x - (w / 2) + 40, y + 4, text, {
      fontSize: '10px',
      fontFamily: 'Courier New, monospace',
      color: '#ffffff',
      stroke: '#000',
      strokeThickness: 1,
      wordWrap: { width: w - 100 },
    });
    dialogueText.setDepth(901);
    dialogueText.setScrollFactor(0);

    // Slide up animation
    [bg, nameText, dialogueText].forEach(obj => {
      obj.setAlpha(0);
      scene.tweens.add({
        targets: obj,
        alpha: 1,
        y: obj.y - 10,
        duration: 250,
        ease: 'Cubic.easeOut',
      });
    });

    HUD._dialogueObjects = [bg, nameText, dialogueText];
  },

  hideDialogue(scene) {
    if (HUD._dialogueObjects) {
      HUD._dialogueObjects.forEach(obj => {
        if (obj && obj.destroy) obj.destroy();
      });
      HUD._dialogueObjects = null;
    }
  },

  // ── Boss Loot Chest (spawned at boss death position) ──
  showBossChest(scene, x, y, id) {
    // Gold chest sprite — rectangle with gold fill
    const chest = scene.add.rectangle(x, y, 24, 18, 0xdaa520, 1);
    chest.setStrokeStyle(2, 0xffd700, 1);
    chest.setDepth(50);

    // Lid
    const lid = scene.add.rectangle(x, y - 11, 26, 6, 0xb8860b, 1);
    lid.setStrokeStyle(1, 0xffd700, 1);
    lid.setDepth(51);

    // Lock/gem in center
    const gem = scene.add.circle(x, y - 2, 3, 0xff0000, 1);
    gem.setDepth(52);

    // Glow pulse
    const glow = scene.add.circle(x, y, 30, 0xffd700, 0.15);
    glow.setDepth(49);
    scene.tweens.add({
      targets: glow,
      alpha: { from: 0.1, to: 0.3 },
      scaleX: { from: 1, to: 1.3 },
      scaleY: { from: 1, to: 1.3 },
      duration: 1000,
      yoyo: true,
      repeat: -1,
      ease: 'Sine.easeInOut',
    });

    // "LOOT" label
    const label = scene.add.text(x, y - 24, 'LOOT', {
      fontSize: '8px',
      fontFamily: 'Courier New, monospace',
      color: '#ffd700',
      fontStyle: 'bold',
      stroke: '#000',
      strokeThickness: 2,
    });
    label.setOrigin(0.5);
    label.setDepth(52);

    // Store reference for cleanup
    if (!HUD._chests) HUD._chests = {};
    HUD._chests[id] = { chest, lid, gem, glow, label };
  },

  // ── Chest Opened Effect (gold fountain particles) ──
  showChestOpened(scene, id, x, y, gold) {
    // Remove chest sprite
    if (HUD._chests && HUD._chests[id]) {
      const c = HUD._chests[id];
      [c.chest, c.lid, c.gem, c.glow, c.label].forEach(obj => obj.destroy());
      delete HUD._chests[id];
    }

    // Gold fountain — 15-20 circles spraying upward
    const count = 15 + Math.floor(Math.random() * 6);
    for (let i = 0; i < count; i++) {
      const coin = scene.add.circle(x, y, 3, 0xffd700, 0.9);
      coin.setDepth(200);

      const angle = -Math.PI / 2 + (Math.random() - 0.5) * 1.2; // mostly upward
      const speed = 80 + Math.random() * 120;
      const targetX = x + Math.cos(angle) * speed;
      const targetY = y + Math.sin(angle) * speed;

      scene.tweens.add({
        targets: coin,
        x: targetX,
        y: targetY - 20, // arc up
        duration: 400 + Math.random() * 300,
        delay: i * 30,
        ease: 'Cubic.easeOut',
        onComplete: () => {
          // Fall down
          scene.tweens.add({
            targets: coin,
            y: targetY + 40,
            alpha: 0,
            duration: 500,
            ease: 'Bounce.easeOut',
            onComplete: () => coin.destroy(),
          });
        },
      });
    }

    // Gold amount text
    const goldText = scene.add.text(x, y - 40, `+${gold}g`, {
      fontSize: '16px',
      fontFamily: 'Courier New, monospace',
      color: '#ffd700',
      fontStyle: 'bold',
      stroke: '#000',
      strokeThickness: 3,
    });
    goldText.setOrigin(0.5);
    goldText.setDepth(201);

    scene.tweens.add({
      targets: goldText,
      y: y - 80,
      alpha: 0,
      duration: 2000,
      ease: 'Cubic.easeOut',
      onComplete: () => goldText.destroy(),
    });
  },

  // ── Cleanup on scene shutdown ──
  shutdown() {
    for (const obj of this._activeBannerObjs) {
      if (obj && obj.active) obj.destroy();
    }
    this._activeBannerObjs = [];
    this.questAnnouncementQueue = [];
    this.questAnnouncementActive = false;
    // Clean up any active dialogue overlay
    if (this._dialogueObjects) {
      this._dialogueObjects.forEach(obj => {
        if (obj && obj.destroy) obj.destroy();
      });
      this._dialogueObjects = null;
    }
    // Clean up any active loot chests
    if (HUD._chests) {
      for (const id in HUD._chests) {
        const c = HUD._chests[id];
        [c.chest, c.lid, c.gem, c.glow, c.label].forEach(obj => {
          if (obj && obj.destroy) obj.destroy();
        });
      }
      HUD._chests = {};
    }
  },

  // ── Hide boss bar (used on floor transitions) ──
  hideBossBar() {
    if (this.bossBar) {
      Object.values(this.bossBar).forEach(v => v.setVisible(false));
    }
    this.lastBossId = null;
  },

  // ── Direct access to waveText for color resets ──
  setWaveTextColor(color) {
    if (this.waveText) this.waveText.setColor(color);
  },
};
