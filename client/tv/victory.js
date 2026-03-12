// ─── DevLoop RPG — TV Victory Screen ────────────────────────────
// Extracted from hud.js. Exposes window.Victory for victory overlay drawing.

window.Victory = {
  _victoryObjects: null,

  showVictoryScreen(scene, data) {
    const GAME_W = 1280;
    const GAME_H = 720;

    // Clean up any previous victory screen
    Victory._destroyVictoryScreen();

    const objs = [];

    // ── Floor-themed overlay tint ──
    // Throne of Ruin is floor index 6. Pull its color from FLOOR_THEMES if available,
    // otherwise fall back to a hardcoded dark red.
    const finalFloorIdx = 6;
    const floorTheme = FLOOR_THEMES[finalFloorIdx % FLOOR_THEMES.length];
    const overlayTint = floorTheme ? floorTheme.floor : 0x1a0808;
    // Blend the dark base (0x0a0805) with the floor tint at ~30% strength
    const blendChannel = (base, tint, t) => Math.min(255, Math.round(base * (1 - t) + tint * t));
    const baseR = 0x0a, baseG = 0x08, baseB = 0x05;
    const tintR = (overlayTint >> 16) & 0xff;
    const tintG = (overlayTint >> 8) & 0xff;
    const tintB = overlayTint & 0xff;
    const blendedOverlay = (blendChannel(baseR, tintR, 0.3) << 16)
      | (blendChannel(baseG, tintG, 0.3) << 8)
      | blendChannel(baseB, tintB, 0.3);

    // Dark overlay with floor-tinted color
    const overlay = scene.add.rectangle(GAME_W / 2, GAME_H / 2, GAME_W, GAME_H, blendedOverlay, 0.92)
      .setScrollFactor(0).setDepth(3000);
    objs.push(overlay);

    // ── Camera flash effect ──
    const flash = scene.add.rectangle(GAME_W / 2, GAME_H / 2, GAME_W, GAME_H, 0xffffff, 0.3)
      .setScrollFactor(0).setDepth(3010);
    objs.push(flash);
    scene.tweens.add({
      targets: flash, alpha: 0, duration: 500, ease: 'Sine.easeOut',
      onComplete: () => { flash.setVisible(false); },
    });

    // Decorative gold border lines
    const borderTop = scene.add.rectangle(GAME_W / 2, 30, GAME_W - 100, 2, 0xffd700, 0.6)
      .setScrollFactor(0).setDepth(3001);
    const borderBot = scene.add.rectangle(GAME_W / 2, GAME_H - 30, GAME_W - 100, 2, 0xffd700, 0.6)
      .setScrollFactor(0).setDepth(3001);
    objs.push(borderTop, borderBot);

    // ── "DUNGEON CONQUERED" title — letter-by-letter reveal with bounce ──
    const titleStr = 'DUNGEON CONQUERED';
    const titleLetters = [];
    const letterSpacing = 26; // px per character
    const titleStartX = GAME_W / 2 - ((titleStr.length - 1) * letterSpacing) / 2;
    for (let li = 0; li < titleStr.length; li++) {
      const letter = scene.add.text(titleStartX + li * letterSpacing, 140, titleStr[li], {
        fontSize: '48px', fontFamily: 'Courier New', color: '#ffd700', fontStyle: 'bold',
        stroke: '#aa8800', strokeThickness: 6,
      }).setOrigin(0.5).setScrollFactor(0).setDepth(3002).setAlpha(0).setScale(0);
      objs.push(letter);
      titleLetters.push(letter);

      // Each letter bounces in with a stagger
      scene.tweens.add({
        targets: letter,
        alpha: 1,
        scaleX: 1,
        scaleY: 1,
        duration: 400,
        delay: 300 + li * 40,
        ease: 'Back.easeOut',
      });
    }

    // Subtitle
    const subtitle = scene.add.text(GAME_W / 2, 190, 'The Throne of Ruin has fallen', {
      fontSize: '16px', fontFamily: 'Courier New', color: '#ccaa66',
      stroke: '#000000', strokeThickness: 2,
    }).setOrigin(0.5).setScrollFactor(0).setDepth(3002).setAlpha(0);
    objs.push(subtitle);

    // Time display
    const totalSecs = Math.floor((data.totalTime || 0) / 1000);
    const mins = Math.floor(totalSecs / 60);
    const secs = totalSecs % 60;
    const timeStr = `Time: ${mins}m ${secs.toString().padStart(2, '0')}s`;
    const timeText = scene.add.text(GAME_W / 2, 230, timeStr, {
      fontSize: '14px', fontFamily: 'Courier New', color: '#888888',
      stroke: '#000000', strokeThickness: 2,
    }).setOrigin(0.5).setScrollFactor(0).setDepth(3002).setAlpha(0);
    objs.push(timeText);

    // ── Determine MVP (most kills) ──
    const playerData = data.players || [];
    let mvpIdx = 0;
    let maxKills = -1;
    for (let i = 0; i < playerData.length; i++) {
      if ((playerData[i].kills || 0) > maxKills) {
        maxKills = playerData[i].kills || 0;
        mvpIdx = i;
      }
    }

    // ── Class accent colors ──
    const classAccentColors = {
      warrior: 0x4488ff,
      ranger: 0x44cc44,
      mage: 0xbb44ff,
    };

    // Player stat cards
    const cardWidth = 280;
    const cardHeight = 200;
    const totalWidth = playerData.length * cardWidth + (playerData.length - 1) * 40;
    const startX = (GAME_W - totalWidth) / 2 + cardWidth / 2;

    const classIcons = { warrior: '\u2694', ranger: '\uD83C\uDFF9', mage: '\uD83D\uDD2E' };

    for (let i = 0; i < playerData.length; i++) {
      const p = playerData[i];
      const cx = startX + i * (cardWidth + 40);
      const cy = 380;

      // Card background
      const card = scene.add.rectangle(cx, cy, cardWidth, cardHeight, 0x1a1a2e, 0.8)
        .setStrokeStyle(2, 0xffd700, 0.4).setScrollFactor(0).setDepth(3001).setAlpha(0);
      objs.push(card);

      // ── Class-colored accent bar (left edge) ──
      const accentColor = classAccentColors[p.characterClass] || 0x888888;
      const accentBar = scene.add.rectangle(
        cx - cardWidth / 2 + 2, cy, 4, cardHeight, accentColor, 0.9
      ).setScrollFactor(0).setDepth(3002).setAlpha(0);
      objs.push(accentBar);

      // ── MVP indicator ──
      if (i === mvpIdx && playerData.length > 1) {
        const mvpText = scene.add.text(cx, cy - 96, '\u2B50 MVP', {
          fontSize: '14px', fontFamily: 'Courier New', color: '#ffd700', fontStyle: 'bold',
          stroke: '#000000', strokeThickness: 3,
        }).setOrigin(0.5).setScrollFactor(0).setDepth(3003).setAlpha(0);
        objs.push(mvpText);

        // Gentle pulse on the MVP badge
        scene.tweens.add({
          targets: mvpText,
          scaleX: { from: 1, to: 1.1 },
          scaleY: { from: 1, to: 1.1 },
          duration: 800,
          delay: 2000,
          yoyo: true,
          repeat: -1,
          ease: 'Sine.easeInOut',
        });
      }

      // Class icon
      const icon = scene.add.text(cx, cy - 70, classIcons[p.characterClass] || '\u2694', {
        fontSize: '32px', fontFamily: 'Courier New',
      }).setOrigin(0.5).setScrollFactor(0).setDepth(3002).setAlpha(0);
      objs.push(icon);

      // Player name
      const nameText = scene.add.text(cx, cy - 35, p.name, {
        fontSize: '20px', fontFamily: 'Courier New', color: '#ffffff', fontStyle: 'bold',
        stroke: '#000000', strokeThickness: 3,
      }).setOrigin(0.5).setScrollFactor(0).setDepth(3002).setAlpha(0);
      objs.push(nameText);

      // Class label
      const classText = scene.add.text(cx, cy - 12, p.characterClass.toUpperCase(), {
        fontSize: '11px', fontFamily: 'Courier New', color: '#ffd700',
        stroke: '#000000', strokeThickness: 2,
      }).setOrigin(0.5).setScrollFactor(0).setDepth(3002).setAlpha(0);
      objs.push(classText);

      // Stats
      const statsLines = [
        `Level ${p.level}`,
        `${p.kills} kills`,
        `${p.gold}g earned`,
      ];
      for (let j = 0; j < statsLines.length; j++) {
        const statText = scene.add.text(cx, cy + 15 + j * 22, statsLines[j], {
          fontSize: '14px', fontFamily: 'Courier New', color: '#aaaaaa',
          stroke: '#000000', strokeThickness: 2,
        }).setOrigin(0.5).setScrollFactor(0).setDepth(3002).setAlpha(0);
        objs.push(statText);
      }
    }

    // "Waiting for NEW GAME..." text at bottom
    const waitText = scene.add.text(GAME_W / 2, GAME_H - 70, 'Awaiting new game from controllers...', {
      fontSize: '12px', fontFamily: 'Courier New', color: '#666666',
      stroke: '#000000', strokeThickness: 2,
    }).setOrigin(0.5).setScrollFactor(0).setDepth(3002).setAlpha(0);
    objs.push(waitText);

    // ── Animate everything in with staggered timing ──

    // Subtitle
    scene.tweens.add({
      targets: subtitle, alpha: 1, duration: 600, delay: 900,
    });

    // Time
    scene.tweens.add({
      targets: timeText, alpha: 1, duration: 400, delay: 1100,
    });

    // Player cards — stagger by 50ms each element
    const cardObjs = objs.filter(o => o !== overlay && o !== flash && o !== borderTop && o !== borderBot
      && !titleLetters.includes(o) && o !== subtitle && o !== timeText && o !== waitText);
    cardObjs.forEach((obj, i) => {
      scene.tweens.add({
        targets: obj, alpha: 1, duration: 400, delay: 1300 + i * 50,
      });
    });

    // Wait text
    scene.tweens.add({
      targets: waitText, alpha: 0.6, duration: 400, delay: 2500,
    });
    // Pulsing wait text
    scene.tweens.add({
      targets: waitText, alpha: { from: 0.4, to: 0.8 },
      duration: 1200, delay: 3000, yoyo: true, repeat: -1,
    });

    // ── Enhanced sparkle particles ──
    // Helper: draw a 4-point star polygon into a Graphics object
    const drawStar = (gfx, radius, color, alpha) => {
      gfx.fillStyle(color, alpha);
      gfx.beginPath();
      for (let s = 0; s < 4; s++) {
        const angle = (s / 4) * Math.PI * 2 - Math.PI / 2;
        const outerX = Math.cos(angle) * radius;
        const outerY = Math.sin(angle) * radius;
        const innerAngle = angle + Math.PI / 4;
        const innerX = Math.cos(innerAngle) * (radius * 0.35);
        const innerY = Math.sin(innerAngle) * (radius * 0.35);
        if (s === 0) gfx.moveTo(outerX, outerY);
        else gfx.lineTo(outerX, outerY);
        gfx.lineTo(innerX, innerY);
      }
      gfx.closePath();
      gfx.fillPath();
    };

    // Color palette for particles: gold, white, amber
    const sparkleColors = [0xffd700, 0xffffff, 0xffaa33, 0xffee88, 0xddbb44];

    for (let i = 0; i < 40; i++) {
      const px = Math.random() * GAME_W;
      const py = GAME_H + 20;
      const particle = scene.add.graphics().setScrollFactor(0).setDepth(3003);
      const size = 1.5 + Math.random() * 3;
      const color = sparkleColors[Math.floor(Math.random() * sparkleColors.length)];
      const isStar = Math.random() < 0.45; // ~45% are star-shaped

      if (isStar) {
        drawStar(particle, size + 1, color, 0.8);
      } else {
        particle.fillStyle(color, 0.7);
        particle.fillCircle(0, 0, size);
      }
      particle.setPosition(px, py);
      objs.push(particle);

      // Float upward with drift
      scene.tweens.add({
        targets: particle,
        y: -30,
        x: px + (Math.random() - 0.5) * 100,
        alpha: 0,
        duration: 4000 + Math.random() * 4000,
        delay: Math.random() * 3000,
        repeat: -1,
        onRepeat: () => {
          particle.setPosition(Math.random() * GAME_W, GAME_H + 20);
          particle.setAlpha(0.7);
        },
      });
    }

    // ── Large "sparkle" particles that blink (alpha oscillation) ──
    for (let i = 0; i < 8; i++) {
      const px = 100 + Math.random() * (GAME_W - 200);
      const py = GAME_H + 40;
      const sparkle = scene.add.graphics().setScrollFactor(0).setDepth(3004);
      const sparkleSize = 5 + Math.random() * 4;
      const sparkleColor = sparkleColors[Math.floor(Math.random() * sparkleColors.length)];
      drawStar(sparkle, sparkleSize, sparkleColor, 0.9);
      sparkle.setPosition(px, py);
      objs.push(sparkle);

      // Float upward
      scene.tweens.add({
        targets: sparkle,
        y: -50,
        x: px + (Math.random() - 0.5) * 150,
        duration: 6000 + Math.random() * 4000,
        delay: Math.random() * 2000,
        repeat: -1,
        onRepeat: () => {
          sparkle.setPosition(100 + Math.random() * (GAME_W - 200), GAME_H + 40);
        },
      });

      // Alpha blink oscillation
      scene.tweens.add({
        targets: sparkle,
        alpha: { from: 0.3, to: 1 },
        duration: 400 + Math.random() * 400,
        delay: Math.random() * 1000,
        yoyo: true,
        repeat: -1,
        ease: 'Sine.easeInOut',
      });
    }

    Victory._victoryObjects = objs;
  },

  _destroyVictoryScreen() {
    if (Victory._victoryObjects) {
      // Get scene ref from first live object to kill infinite tweens
      const scene = Victory._victoryObjects.find(o => o && o.scene)?.scene;
      Victory._victoryObjects.forEach(obj => {
        if (obj && scene) scene.tweens.killTweensOf(obj);
        if (obj && obj.destroy) obj.destroy();
      });
      Victory._victoryObjects = null;
    }
  },
};
