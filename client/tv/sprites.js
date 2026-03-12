// ─── DevLoop RPG — Sprite Creation / Update / Cleanup ──────────
// Extracted from game.js to keep it under the 1500 LOC threshold.
// Exposed as window.Sprites; every function receives the Phaser
// scene as the first parameter.  Sprite Maps (playerSprites, etc.)
// remain on the scene object — this module only provides helpers.

window.Sprites = {

  // ════════════════════════════════════════════════════════════════
  //  PLAYERS
  // ════════════════════════════════════════════════════════════════

  /** Create a fresh player sprite + nameText + hpBar and register it on the scene Map. */
  createPlayerSprite(scene, p) {
    const texKey = p.alive ? `player_${p.characterClass}` : 'player_dead';
    const sprite = scene.add.sprite(p.x, p.y, texKey).setDepth(10);
    sprite.nameText = scene.add.text(p.x, p.y - 28, p.name, {
      fontSize: '12px', fill: '#ffffff', fontFamily: 'Courier New',
      backgroundColor: '#00000088', padding: { x: 3, y: 1 },
    }).setOrigin(0.5).setDepth(11);
    sprite.hpBar = scene.add.graphics().setDepth(11);
    scene.playerSprites.set(p.id, sprite);
    return sprite;
  },

  /** Per-frame update: lerp position, swap texture, redraw HP/MP bars, death timer. */
  updatePlayerSprite(scene, sprite, p) {
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

    // HP / MP bars
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
  },

  /** Remove sprites for players no longer in the seen set, or destroy ALL (for dungeon:enter). */
  cleanupPlayerSprites(scene, seenPlayers) {
    if (!seenPlayers) {
      // Full cleanup (dungeon:enter path)
      for (const [id, sprite] of scene.playerSprites) {
        if (sprite.nameText) sprite.nameText.destroy();
        if (sprite.hpBar) sprite.hpBar.destroy();
        sprite.destroy();
      }
      scene.playerSprites.clear();
      return;
    }
    for (const [id, sprite] of scene.playerSprites) {
      if (!seenPlayers.has(id)) {
        sprite.nameText.destroy();
        sprite.hpBar.destroy();
        sprite.destroy();
        scene.playerSprites.delete(id);
      }
    }
  },

  // ════════════════════════════════════════════════════════════════
  //  MONSTERS
  // ════════════════════════════════════════════════════════════════

  /** Generate a per-monster texture and create its sprite + nameText + hpBar. */
  createMonsterSprite(scene, m) {
    const g = scene.make.graphics({ add: false });
    const s = m.size;
    const d = s * 2; // texture diameter

    if (m.isBoss) {
      // Boss: large angular body with crown/horns
      g.fillStyle(m.color, 1);
      g.fillTriangle(s, 2, d - 2, s, s, d - 2);
      g.fillTriangle(s, 2, 2, s, s, d - 2);
      g.fillStyle(m.color - 0x222222, 1);
      g.fillCircle(s, s, s * 0.5);
      g.fillStyle(0xffcc00, 1);
      g.fillTriangle(s - 6, 4, s - 4, 0, s - 2, 4);
      g.fillTriangle(s - 1, 3, s, 0, s + 1, 3);
      g.fillTriangle(s + 2, 4, s + 4, 0, s + 6, 4);
      g.fillStyle(0xff0000, 1);
      g.fillCircle(s - 4, s - 2, 2);
      g.fillCircle(s + 4, s - 2, 2);
      g.fillStyle(0xffcc00, 1);
      g.fillCircle(s - 4, s - 2, 1);
      g.fillCircle(s + 4, s - 2, 1);
    } else if (m.behavior === 'ranged_kite') {
      g.fillStyle(m.color, 1);
      g.fillTriangle(s, 2, d - 4, d - 2, 4, d - 2);
      g.fillStyle(m.color - 0x111111, 0.7);
      g.fillTriangle(s, 6, d - 8, d - 6, 8, d - 6);
      g.lineStyle(2, 0xffffcc, 0.9);
      g.lineBetween(s, 5, s, d - 5);
      g.lineBetween(s, 5, s - 3, 10);
      g.lineBetween(s, 5, s + 3, 10);
    } else if (m.behavior === 'melee_split') {
      g.fillStyle(m.color, 0.3);
      g.fillCircle(s, s, s);
      g.fillStyle(m.color, 0.7);
      g.fillCircle(s, s + 1, s - 2);
      g.fillStyle(0xffffff, 0.2);
      g.fillCircle(s - 3, s - 3, s * 0.35);
      g.fillStyle(m.color - 0x224422, 0.5);
      g.fillCircle(s + 2, s + 2, s * 0.3);
      g.fillStyle(0x000000, 0.7);
      g.fillCircle(s - 3, s - 1, 2);
      g.fillCircle(s + 3, s - 1, 2);
    } else {
      const mName = (m.name || '').toLowerCase();
      if (mName.includes('skeleton') || mName.includes('skel')) {
        g.fillStyle(0xbbbbbb, 1);
        g.fillRect(2, 2, d - 4, d - 4);
        g.fillStyle(0x222222, 1);
        g.fillTriangle(0, 0, 6, 0, 0, 6);
        g.fillTriangle(d, 0, d - 6, 0, d, 6);
        g.fillTriangle(0, d, 6, d, 0, d - 6);
        g.fillTriangle(d, d, d - 6, d, d, d - 6);
        g.fillStyle(0xdddddd, 1);
        g.fillCircle(s, s - 2, s * 0.45);
        g.fillStyle(0x111111, 1);
        g.fillCircle(s - 3, s - 3, 2);
        g.fillCircle(s + 3, s - 3, 2);
        g.lineStyle(1, 0x333333, 0.8);
        g.lineBetween(s - 4, s + 2, s + 4, s + 2);
      } else if (mName.includes('zombie')) {
        g.fillStyle(0x556633, 1);
        g.fillRect(3, 1, d - 6, d - 2);
        g.fillStyle(0x667744, 1);
        g.fillCircle(s, 6, s * 0.5);
        g.fillStyle(0x445522, 0.8);
        g.fillRect(4, d - 6, 4, 6);
        g.fillRect(d - 8, d - 6, 4, 6);
        g.fillStyle(0xaacc44, 0.8);
        g.fillCircle(s - 3, 5, 2);
        g.fillCircle(s + 3, 5, 2);
        g.lineStyle(1, 0x445522, 0.6);
        g.lineBetween(s - 2, 9, s + 2, 10);
      } else if (mName.includes('demon')) {
        g.fillStyle(m.color, 1);
        g.fillTriangle(s, 2, d - 2, d - 2, 2, d - 2);
        g.fillStyle(m.color + 0x220000, 1);
        g.fillTriangle(4, s, 0, 2, 8, s);
        g.fillTriangle(d - 8, s, d, 2, d - 4, s);
        g.fillTriangle(s - 3, 6, s, 0, s + 3, 6);
        g.fillStyle(0xffaa00, 1);
        g.fillCircle(s - 4, s - 2, 2);
        g.fillCircle(s + 4, s - 2, 2);
        g.fillStyle(0x220000, 0.4);
        g.fillCircle(s, s + 3, s * 0.3);
      } else {
        g.fillStyle(m.color, 1);
        g.fillRect(2, 2, d - 4, d - 4);
        g.fillStyle(m.color + 0x111111, 0.8);
        g.fillRect(4, 4, d - 8, d - 8);
        g.fillStyle(0xff0000, 0.8);
        g.fillCircle(s - 3, s - 2, 2);
        g.fillCircle(s + 3, s - 2, 2);
      }
    }
    g.generateTexture(`monster_${m.id}`, d, d);
    g.destroy();

    const sprite = scene.add.sprite(m.x, m.y, `monster_${m.id}`).setDepth(8);
    sprite.nameText = scene.add.text(m.x, m.y - m.size - 16, m.name, {
      fontSize: m.isBoss ? '14px' : '10px',
      fill: m.isBoss ? '#ff8800' : '#ff6666',
      fontFamily: 'Courier New',
      backgroundColor: '#00000066',
      padding: { x: 2, y: 1 },
    }).setOrigin(0.5).setDepth(9);
    sprite.hpBar = scene.add.graphics().setDepth(9);
    sprite.monsterSize = m.size;
    scene.monsterSprites.set(m.id, sprite);
    return sprite;
  },

  /** Per-frame update: lerp, status alpha, HP bar. */
  updateMonsterSprite(scene, sprite, m) {
    sprite.x += (m.x - sprite.x) * 0.3;
    sprite.y += (m.y - sprite.y) * 0.3;
    if (sprite.nameText) sprite.nameText.setPosition(sprite.x, sprite.y - sprite.monsterSize - 16);

    sprite.setAlpha(m.stunned ? 0.4 : m.slowed ? 0.7 : 1);

    // HP bar
    if (sprite.hpBar) {
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
  },

  /** Remove a single dead monster sprite and its texture. */
  destroyMonsterSprite(scene, id) {
    const sprite = scene.monsterSprites.get(id);
    if (!sprite) return;
    if (sprite.nameText) sprite.nameText.destroy();
    if (sprite.hpBar) sprite.hpBar.destroy();
    sprite.destroy();
    scene.monsterSprites.delete(id);
    const texKey = 'monster_' + id;
    if (scene.textures.exists(texKey)) scene.textures.remove(texKey);
  },

  /** Remove sprites for monsters no longer in the seen set, or destroy ALL (for dungeon:enter). */
  cleanupMonsterSprites(scene, seenMonsters) {
    if (!seenMonsters) {
      // Full cleanup (dungeon:enter path)
      for (const [id, sprite] of scene.monsterSprites) {
        if (sprite.nameText) sprite.nameText.destroy();
        if (sprite.hpBar) sprite.hpBar.destroy();
        sprite.destroy();
      }
      scene.monsterSprites.clear();
      return;
    }
    for (const [id, sprite] of scene.monsterSprites) {
      if (!seenMonsters.has(id)) {
        if (sprite.nameText) sprite.nameText.destroy();
        if (sprite.hpBar) sprite.hpBar.destroy();
        sprite.destroy();
        scene.monsterSprites.delete(id);
        const texKey = 'monster_' + id;
        if (scene.textures.exists(texKey)) scene.textures.remove(texKey);
      }
    }
  },

  // ════════════════════════════════════════════════════════════════
  //  GROUND ITEMS
  // ════════════════════════════════════════════════════════════════

  /** Create a ground-item sprite with rarity glow, name label, and optional legendary sparkles. */
  createItemSprite(scene, gi) {
    const sprite = scene.add.sprite(gi.x, gi.y, 'loot').setDepth(5).setScale(0.6);
    sprite._baseY = gi.y;
    sprite._isLegendary = (gi.rarity === 'legendary' || gi.rarity === 'Legendary'
      || (gi.rarityColor && gi.rarityColor.toLowerCase() === '#ff8800'));

    // Rarity-colored glow ring
    const glowColor = Sprites._parseColor(gi.rarityColor || '#aaaaaa');
    sprite.glow = scene.add.graphics().setDepth(4);
    sprite._glowColor = glowColor;
    sprite._glowX = gi.x;
    sprite._glowY = gi.y;

    sprite.nameText = scene.add.text(gi.x, gi.y - 18, gi.name, {
      fontSize: '9px',
      fill: gi.rarityColor || '#aaaaaa',
      fontFamily: 'Courier New',
      backgroundColor: '#00000088',
      padding: { x: 2, y: 1 },
    }).setOrigin(0.5).setDepth(6);
    scene.itemSprites.set(gi.id, sprite);

    // Legendary sparkle sprites
    if (sprite._isLegendary) {
      sprite._sparkles = [];
      for (let si = 0; si < 4; si++) {
        const sparkle = scene.add.graphics().setDepth(7);
        sparkle._angle = (Math.PI * 2 / 4) * si;
        sparkle._radius = 14;
        sprite._sparkles.push(sparkle);
      }
    }

    return sprite;
  },

  /** Per-frame update: bobbing, pulsing glow, legendary sparkle rotation. */
  updateItemSprite(scene, sprite, gi) {
    const now = Date.now();
    const idHash = typeof gi.id === 'number' ? gi.id : [...String(gi.id)].reduce((h, c) => (h * 31 + c.charCodeAt(0)) | 0, 0);
    const bobOffset = Math.sin((now + idHash * 1.7) / 400) * 2;
    sprite.y = sprite._baseY + bobOffset;
    if (sprite.nameText) sprite.nameText.setPosition(sprite.x, sprite.y - 18);

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
        sparkle.fillRect(sx - 1, sy - 3, 2, 6);
        sparkle.fillRect(sx - 3, sy - 1, 6, 2);
      }
    }
  },

  /** Remove sprites for items no longer in the seen set, or destroy ALL (for dungeon:enter). */
  cleanupItemSprites(scene, seenItems) {
    if (!seenItems) {
      // Full cleanup (dungeon:enter path)
      for (const [id, sprite] of scene.itemSprites) {
        if (sprite.nameText) sprite.nameText.destroy();
        if (sprite.glow) sprite.glow.destroy();
        if (sprite._sparkles) {
          for (const sp of sprite._sparkles) sp.destroy();
        }
        sprite.destroy();
      }
      scene.itemSprites.clear();
      return;
    }
    for (const [id, sprite] of scene.itemSprites) {
      if (!seenItems.has(id)) {
        if (sprite.nameText) sprite.nameText.destroy();
        if (sprite.glow) sprite.glow.destroy();
        if (sprite._sparkles) {
          for (const sp of sprite._sparkles) sp.destroy();
        }
        sprite.destroy();
        scene.itemSprites.delete(id);
      }
    }
  },

  // ════════════════════════════════════════════════════════════════
  //  STORY NPCs  (old_sage, shrine_guardian, dying_adventurer/herald)
  // ════════════════════════════════════════════════════════════════

  /** Build a composite story-NPC sprite (body/head/accent graphics, glow ring, "!" marker, label). */
  createStoryNpcSprite(scene, npc) {
    const key = `story_${npc.id}`;

    // NPC type config
    let color, labelColor, bobSpeed;
    if (npc.id === 'old_sage') {
      color = 0x8888ff; labelColor = '#aaaaff'; bobSpeed = 800;
    } else if (npc.id === 'shrine_guardian') {
      color = 0x44cc44; labelColor = '#66ee66'; bobSpeed = 600;
    } else {
      color = 0xaa6666; labelColor = '#cc8888'; bobSpeed = 1000;
    }

    // Glow ring
    const glow = scene.add.circle(npc.x, npc.y - 4, 22, color, 0.15);
    glow.setDepth(29);
    scene.tweens.add({
      targets: glow,
      alpha: { from: 0.08, to: 0.22 },
      scale: { from: 0.95, to: 1.1 },
      duration: 1500,
      yoyo: true,
      repeat: -1,
      ease: 'Sine.easeInOut',
    });

    // Build distinct body shapes
    const bodyGfx = scene.add.graphics().setDepth(30);
    const headGfx = scene.add.graphics().setDepth(30);
    const accentGfx = scene.add.graphics().setDepth(30);

    if (npc.id === 'old_sage') {
      bodyGfx.fillStyle(color, 0.9);
      bodyGfx.fillTriangle(-10, 10, 10, 10, 0, -6);
      bodyGfx.fillStyle(0x6666cc, 0.5);
      bodyGfx.fillTriangle(-7, 10, 7, 10, 0, -2);
      headGfx.fillStyle(0xddccaa, 0.9);
      headGfx.fillCircle(0, 0, 5);
      accentGfx.fillStyle(0x6655cc, 0.9);
      accentGfx.fillTriangle(-5, -12, 5, -12, 0, -20);
    } else if (npc.id === 'shrine_guardian') {
      bodyGfx.fillStyle(color, 0.9);
      bodyGfx.fillRect(-8, -6, 16, 16);
      bodyGfx.fillStyle(0x338833, 0.6);
      bodyGfx.fillRect(-6, -4, 12, 12);
      headGfx.fillStyle(0xddccaa, 0.9);
      headGfx.fillCircle(0, 0, 5);
      accentGfx.fillStyle(0x228822, 0.9);
      accentGfx.fillTriangle(-6, -12, 6, -12, 0, -19);
      accentGfx.fillStyle(color, 0.7);
      accentGfx.fillRect(-12, -6, 5, 6);
      accentGfx.fillRect(7, -6, 5, 6);
    } else {
      bodyGfx.fillStyle(color, 0.85);
      bodyGfx.fillCircle(0, 2, 7);
      bodyGfx.fillStyle(0x884444, 0.4);
      bodyGfx.fillCircle(2, 4, 4);
      headGfx.fillStyle(0xccbbaa, 0.8);
      headGfx.fillCircle(3, 0, 4);
      accentGfx.fillStyle(color, 0.6);
      accentGfx.fillRect(5, 2, 8, 2);
    }

    bodyGfx.setPosition(npc.x, npc.y);
    headGfx.setPosition(npc.x, npc.y - 14);
    accentGfx.setPosition(npc.x, npc.y - 14);

    // Interaction "!" marker
    const marker = scene.add.text(npc.x, npc.y - 36, '!', {
      fontSize: '12px',
      fontFamily: 'Courier New, monospace',
      fontStyle: 'bold',
      color: '#ffff44',
      stroke: '#000000',
      strokeThickness: 3,
    });
    marker.setOrigin(0.5);
    marker.setDepth(32);
    scene.tweens.add({
      targets: marker,
      alpha: { from: 0.4, to: 1.0 },
      y: npc.y - 39,
      duration: 900,
      yoyo: true,
      repeat: -1,
      ease: 'Sine.easeInOut',
    });

    // Name label
    const label = scene.add.text(npc.x, npc.y + 16, npc.name || npc.id, {
      fontSize: '10px',
      fontFamily: 'Courier New, monospace',
      color: labelColor,
      stroke: '#000000',
      strokeThickness: 3,
    });
    label.setOrigin(0.5);
    label.setDepth(31);

    const spriteData = {
      bodyGfx, headGfx, accentGfx, glow, marker, label,
      _bobSpeed: bobSpeed,
    };
    scene.storyNpcSprites[key] = spriteData;
    return spriteData;
  },

  /** Per-frame update: idle bob for all composite parts. */
  updateStoryNpcSprite(scene, spriteData, npc) {
    const bob = Math.sin(Date.now() / spriteData._bobSpeed + npc.x) * 2;
    spriteData.bodyGfx.setPosition(npc.x, npc.y + bob);
    spriteData.headGfx.setPosition(npc.x, npc.y - 14 + bob);
    spriteData.accentGfx.setPosition(npc.x, npc.y - 14 + bob);
    spriteData.glow.setPosition(npc.x, npc.y - 4 + bob);
    spriteData.label.setPosition(npc.x, npc.y + 16 + bob);
    // Marker bobs but tween handles its own alpha/y offset
    spriteData.marker.x = npc.x;
  },

  /** Destroy a single story-NPC composite sprite, killing its tweens. */
  _destroyStoryNpcSprite(scene, spriteData) {
    scene.tweens.killTweensOf(spriteData.glow);
    scene.tweens.killTweensOf(spriteData.marker);
    spriteData.bodyGfx.destroy();
    spriteData.headGfx.destroy();
    spriteData.accentGfx.destroy();
    spriteData.glow.destroy();
    spriteData.marker.destroy();
    spriteData.label.destroy();
  },

  /**
   * Remove story-NPC sprites no longer in the seen set, or destroy ALL.
   * @param {Set|null} seenStoryNpcs - keys like "story_old_sage". Pass null for full cleanup.
   */
  cleanupStoryNpcSprites(scene, seenStoryNpcs) {
    for (const key in scene.storyNpcSprites) {
      if (!seenStoryNpcs || !seenStoryNpcs.has(key)) {
        Sprites._destroyStoryNpcSprite(scene, scene.storyNpcSprites[key]);
        delete scene.storyNpcSprites[key];
      }
    }
  },

  // ════════════════════════════════════════════════════════════════
  //  LOOT CHESTS  (HUD-owned, thin cleanup wrapper)
  // ════════════════════════════════════════════════════════════════

  /** Destroy all boss-loot-chest sprites tracked by HUD._chests.  Called on dungeon:enter. */
  cleanupChestSprites() {
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

  // ════════════════════════════════════════════════════════════════
  //  UTILITY
  // ════════════════════════════════════════════════════════════════

  /** Parse a hex color string (e.g. '#ff8800') to a numeric value. */
  _parseColor(hex) {
    if (typeof hex === 'number') return hex;
    hex = hex.replace('#', '');
    return parseInt(hex, 16);
  },
};
