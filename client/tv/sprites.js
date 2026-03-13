// ─── DevLoop RPG — Sprite Creation / Update / Cleanup ──────────
// Extracted from game.js to keep it under the 1500 LOC threshold.
// Exposed as window.Sprites; every function receives the Phaser
// scene as the first parameter.  Sprite Maps (playerSprites, etc.)
// remain on the scene object — this module only provides helpers.

// ─── Elite Affix Display Names ──────────────────────────────────
const AFFIX_DISPLAY = {
  fast: 'Fast',
  extra_strong: 'Strong',
  fire_enchanted: 'Fire',
  cold_enchanted: 'Cold',
  teleporter: 'Teleport',
  vampiric: 'Vampiric',
  shielding: 'Shield',
  extra_health: 'Tough',
};

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

  /** Per-frame update: lerp position, swap texture, redraw HP/MP bars, death timer, DC ghost. */
  updatePlayerSprite(scene, sprite, p) {
    // Smooth lerp
    sprite.x += (p.x - sprite.x) * 0.3;
    sprite.y += (p.y - sprite.y) * 0.3;
    sprite.nameText.setPosition(sprite.x, sprite.y - 28);

    // Texture swap + disconnected ghost effect
    if (p.disconnected) {
      // Ghost sprite: semi-transparent with pulsing effect
      sprite.setTexture(`player_${p.characterClass}`);
      sprite.setAlpha(0.3 + Math.sin(Date.now() / 600) * 0.1);
    } else if (p.isDying) {
      sprite.setTexture('player_dying');
      sprite.setAlpha(0.5 + Math.sin(Date.now() / 200) * 0.3);
    } else if (p.alive) {
      sprite.setTexture(`player_${p.characterClass}`);
      sprite.setAlpha(1);
    } else {
      sprite.setTexture('player_dead');
      sprite.setAlpha(0.5);
    }

    // DC label above name
    if (p.disconnected) {
      // Create DC label if it doesn't exist
      if (!sprite.dcLabel) {
        sprite.dcLabel = scene.add.text(sprite.x, sprite.y - 40, 'DC', {
          fontSize: '10px', fill: '#ff6666', fontFamily: 'Courier New',
          fontStyle: 'bold',
          backgroundColor: '#00000099', padding: { x: 3, y: 1 },
        }).setOrigin(0.5).setDepth(12);
      }
      sprite.dcLabel.setPosition(sprite.x, sprite.y - 40);
      sprite.dcLabel.setVisible(true);
    } else if (sprite.dcLabel) {
      // Player reconnected — remove DC label
      sprite.dcLabel.setVisible(false);
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

    // Party aura glow ring (visible when player has active aura talents)
    if (p.talentBonuses && p.talentBonuses.auras && p.talentBonuses.auras.length > 0) {
      if (!sprite.auraGlow) {
        sprite.auraGlow = scene.add.circle(sprite.x, sprite.y + 4, 18, 0x66ffaa, 0.15).setDepth(9);
      }
      sprite.auraGlow.setPosition(sprite.x, sprite.y + 4);
      // Subtle pulse via alpha oscillation
      const pulse = 0.1 + Math.sin((scene.time?.now || 0) / 600) * 0.08;
      sprite.auraGlow.setAlpha(pulse);
    } else if (sprite.auraGlow) {
      sprite.auraGlow.destroy();
      sprite.auraGlow = null;
    }

    // Death timer display
    if (p.isDying && p.deathTimer > 0) {
      const secs = (p.deathTimer / 1000).toFixed(1);
      sprite.nameText.setText(`${p.name} [${secs}s]`);
    } else if (p.disconnected) {
      sprite.nameText.setText(`${p.name} [DC]`);
    } else {
      // Show paragon level suffix when applicable
      const paragonSuffix = (p.paragonLevel > 0) ? ` (P${p.paragonLevel})` : '';
      sprite.nameText.setText(`${p.name}${paragonSuffix}`);
    }
  },

  /** Remove sprites for players no longer in the seen set, or destroy ALL (for dungeon:enter). */
  cleanupPlayerSprites(scene, seenPlayers) {
    if (!seenPlayers) {
      // Full cleanup (dungeon:enter path)
      for (const [id, sprite] of scene.playerSprites) {
        if (sprite.nameText) sprite.nameText.destroy();
        if (sprite.hpBar) sprite.hpBar.destroy();
        if (sprite.dcLabel) sprite.dcLabel.destroy();
        if (sprite.auraGlow) sprite.auraGlow.destroy();
        sprite.destroy();
      }
      scene.playerSprites.clear();
      return;
    }
    for (const [id, sprite] of scene.playerSprites) {
      if (!seenPlayers.has(id)) {
        if (sprite.nameText) sprite.nameText.destroy();
        if (sprite.hpBar) sprite.hpBar.destroy();
        if (sprite.dcLabel) sprite.dcLabel.destroy();
        if (sprite.auraGlow) sprite.auraGlow.destroy();
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
      if (m.type === 'skeleton') {
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
      } else if (m.type === 'zombie') {
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
      } else if (m.type === 'demon') {
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
      } else if (m.type === 'fire_imp') {
        // Small fiery creature — orange body with flame wisps
        g.fillStyle(0xff6622, 0.8);
        g.fillCircle(s, s, s - 1);
        g.fillStyle(0xffaa00, 0.6);
        g.fillTriangle(s - 2, 4, s, 0, s + 2, 4); // flame tip
        g.fillTriangle(s - 4, 3, s - 2, 0, s, 3);  // left flame
        g.fillStyle(0xff4400, 1);
        g.fillCircle(s - 2, s - 1, 1.5);
        g.fillCircle(s + 2, s - 1, 1.5);
        g.fillStyle(0xffcc00, 1);
        g.fillCircle(s - 2, s - 1, 0.8);
        g.fillCircle(s + 2, s - 1, 0.8);
      } else if (m.type === 'hell_hound') {
        // Four-legged beast — elongated body
        g.fillStyle(0xcc4400, 1);
        g.fillRect(3, s - 3, d - 6, s); // body
        g.fillStyle(0xdd5500, 1);
        g.fillCircle(d - 5, s - 1, 4); // head
        g.fillStyle(0xff6600, 0.6);
        g.fillTriangle(d - 3, s - 5, d - 1, s - 3, d - 5, s - 3); // ear
        g.fillStyle(0xff0000, 1);
        g.fillCircle(d - 6, s - 2, 1.5); // eye
        g.fillStyle(0xaa3300, 1);
        g.fillRect(5, d - 5, 3, 5); // back legs
        g.fillRect(d - 10, d - 5, 3, 5); // front legs
      } else if (m.type === 'shadow_stalker') {
        // Dark wispy figure — translucent
        g.fillStyle(0x331155, 0.7);
        g.fillTriangle(s, 1, d - 3, d - 1, 3, d - 1);
        g.fillStyle(0x220044, 0.5);
        g.fillTriangle(s, 4, d - 6, d - 3, 6, d - 3);
        g.fillStyle(0xcc44ff, 0.9);
        g.fillCircle(s - 3, s - 2, 2); // eyes glow purple
        g.fillCircle(s + 3, s - 2, 2);
        g.fillStyle(0xffffff, 0.5);
        g.fillCircle(s - 3, s - 2, 0.8);
        g.fillCircle(s + 3, s - 2, 0.8);
      } else if (m.type === 'wraith') {
        // Ethereal floating figure — translucent purple
        g.fillStyle(0x6644aa, 0.5);
        g.fillCircle(s, s - 2, s * 0.6); // head
        g.fillStyle(0x5533aa, 0.4);
        g.fillTriangle(s, s - 1, d - 3, d - 1, 3, d - 1); // robe
        g.fillStyle(0x8866cc, 0.3);
        g.fillTriangle(s - 2, s + 2, 1, d, s - 6, d); // left tatter
        g.fillTriangle(s + 2, s + 2, d - 1, d, s + 6, d); // right tatter
        g.fillStyle(0x88ccff, 1);
        g.fillCircle(s - 3, s - 3, 2); // cold blue eyes
        g.fillCircle(s + 3, s - 3, 2);
      } else if (m.type === 'archer') {
        // Bone Archer — slim body with bow and quiver
        g.fillStyle(m.color, 1);
        g.fillRect(s - s * 0.4, 2, s * 0.8, d - 4); // slim body
        g.fillStyle(m.color + 0x111111, 0.9);
        g.fillCircle(s, 4, s * 0.35); // head
        // Bow (left side) — string + limbs
        g.lineStyle(2, 0xaa8844, 0.9);
        g.lineBetween(3, s - s * 0.5, 3, s + s * 0.5); // bow string
        g.lineBetween(3, s - s * 0.5, s * 0.5, s - s * 0.4); // top limb
        g.lineBetween(3, s + s * 0.5, s * 0.5, s + s * 0.4); // bottom limb
        // Quiver (right side behind body)
        g.fillStyle(0x886633, 1);
        g.fillRect(d - 5, s - s * 0.4, 3, s * 0.7);
        // Arrow tips poking out
        g.fillStyle(0xcccccc, 0.8);
        g.fillTriangle(d - 5, s - s * 0.4, d - 3, s - s * 0.4, d - 4, s - s * 0.55);
        g.fillTriangle(d - 4, s - s * 0.4, d - 2, s - s * 0.4, d - 3, s - s * 0.5);
        // Eyes (red glow)
        g.fillStyle(0xff4444, 1);
        g.fillCircle(s - 2, 3, 1.5);
        g.fillCircle(s + 2, 3, 1.5);
      } else if (m.type === 'spirit_wolf') {
        // Spirit wolf — ghostly blue quadruped with glowing eyes
        g.fillStyle(0x6688cc, 0.5);
        g.fillRect(3, s - 2, d - 6, s - 1); // body
        g.fillStyle(0x88aaee, 0.6);
        g.fillCircle(d - 5, s - 2, 4); // head
        g.fillStyle(0x7799dd, 0.4);
        g.fillTriangle(d - 4, s - 6, d - 1, s - 3, d - 6, s - 4); // ear right
        g.fillTriangle(d - 7, s - 5, d - 4, s - 3, d - 9, s - 3); // ear left
        // Legs
        g.fillStyle(0x6688cc, 0.45);
        g.fillRect(5, d - 5, 3, 5);
        g.fillRect(10, d - 5, 3, 5);
        g.fillRect(d - 13, d - 5, 3, 5);
        g.fillRect(d - 8, d - 5, 3, 5);
        // Tail
        g.lineStyle(2, 0x88aaee, 0.4);
        g.lineBetween(3, s, 0, s - 4);
        // Glowing eyes
        g.fillStyle(0xaaddff, 1);
        g.fillCircle(d - 6, s - 3, 1.5);
        g.fillCircle(d - 3, s - 3, 1.5);
        g.fillStyle(0xffffff, 0.8);
        g.fillCircle(d - 6, s - 3, 0.7);
        g.fillCircle(d - 3, s - 3, 0.7);
      } else if (m.type === 'slime' || m.type === 'slime_small') {
        // Slime blob — round body with top bump
        const isSmall = m.type === 'slime_small';
        g.fillStyle(m.color, 0.85);
        g.fillCircle(s, s + 2, s - 1); // main blob
        g.fillStyle(m.color, 0.75);
        g.fillCircle(s, s - s * 0.35, s * 0.45); // top bump
        // Darker underside for depth
        g.fillStyle(m.color - 0x113322, 0.4);
        g.fillCircle(s, s + 4, s * 0.7);
        // Eyes (dark, beady)
        const eyeR = isSmall ? 1.5 : 2;
        g.fillStyle(0x222222, 0.9);
        g.fillCircle(s - 3, s - 1, eyeR);
        g.fillCircle(s + 3, s - 1, eyeR);
        // Shiny highlight
        g.fillStyle(0xffffff, 0.3);
        g.fillCircle(s - 2, s - s * 0.35, s * 0.15);
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

    // Elite size scaling
    if (m.isElite && m.eliteRank === 'rare') {
      sprite.setScale(1.3);
    } else if (m.isElite && m.eliteRank === 'champion') {
      sprite.setScale(1.15);
    }

    // Friendly monsters: blue tint + slight transparency
    if (m.friendly) {
      sprite.setTint(0x88bbff);
      sprite.setAlpha(0.75);
    }

    // Name color: friendly > boss > elite > normal
    let nameColor = '#ff6666';
    if (m.friendly) nameColor = '#88ddff';
    else if (m.isBoss) nameColor = '#ff8800';
    else if (m.isElite && m.eliteRank === 'rare') nameColor = '#ffcc00';
    else if (m.isElite && m.eliteRank === 'champion') nameColor = '#4488ff';

    sprite.nameText = scene.add.text(m.x, m.y - m.size - 16, m.name, {
      fontSize: m.isBoss ? '14px' : '10px',
      fill: nameColor,
      fontFamily: 'Courier New',
      backgroundColor: '#00000066',
      padding: { x: 2, y: 1 },
    }).setOrigin(0.5).setDepth(9);

    // Affix label for elite monsters
    if (m.isElite && m.affixes && m.affixes.length > 0) {
      const affixStr = m.affixes.map(a => AFFIX_DISPLAY[a] || a).join(' \u00b7 ');
      const affixColor = m.eliteRank === 'rare' ? '#ccaa00' : '#3366cc';
      sprite.affixText = scene.add.text(m.x, m.y - m.size - 6, affixStr, {
        fontSize: '8px',
        fill: affixColor,
        fontFamily: 'Courier New',
        backgroundColor: '#00000066',
        padding: { x: 2, y: 0 },
      }).setOrigin(0.5).setDepth(9);
    }

    sprite.hpBar = scene.add.graphics().setDepth(9);
    sprite.monsterSize = m.size;
    sprite._isElite = m.isElite || false;
    sprite._eliteRank = m.eliteRank || null;

    // Shield visual (graphics object, drawn each frame)
    if (m.isElite) {
      sprite.shieldGfx = scene.add.graphics().setDepth(9);
    }
    // Friendly glow (spirit wolf etc.)
    if (m.friendly) {
      sprite.friendlyGlow = scene.add.graphics().setDepth(7);
    }
    // Fire enchanted glow
    if (m.fireEnchanted) {
      sprite.fireGfx = scene.add.graphics().setDepth(7);
    }

    scene.monsterSprites.set(m.id, sprite);
    return sprite;
  },

  /** Per-frame update: lerp, status alpha, HP bar, elite visuals. */
  updateMonsterSprite(scene, sprite, m) {
    sprite.x += (m.x - sprite.x) * 0.3;
    sprite.y += (m.y - sprite.y) * 0.3;
    if (sprite.nameText) sprite.nameText.setPosition(sprite.x, sprite.y - sprite.monsterSize - 16);
    if (sprite.affixText) sprite.affixText.setPosition(sprite.x, sprite.y - sprite.monsterSize - 6);

    // Stealth: near-invisible until revealed
    if (m.stealthed) {
      sprite.setAlpha(0.08 + Math.sin(Date.now() / 800) * 0.04);
      if (sprite.nameText) sprite.nameText.setAlpha(0);
      if (sprite.affixText) sprite.affixText.setAlpha(0);
    } else if (m.charging) {
      // Charge: bright flash during dash
      sprite.setAlpha(1);
      sprite.setTint(0xff8844);
      if (sprite.nameText) sprite.nameText.setAlpha(1);
      if (sprite.affixText) sprite.affixText.setAlpha(1);
    } else if (m.friendly) {
      // Friendly monsters: ghostly pulsing blue
      const ghostAlpha = 0.55 + Math.sin(Date.now() / 700) * 0.15;
      sprite.setAlpha(ghostAlpha);
      sprite.setTint(0x88bbff);
      if (sprite.nameText) sprite.nameText.setAlpha(0.8);
    } else {
      sprite.setAlpha(m.stunned ? 0.4 : m.slowed ? 0.7 : m.feared ? 0.6 : 1);
      if (m.feared) {
        sprite.setTint(0x9944dd); // purple tint when feared
      } else {
        sprite.clearTint();
      }
      if (sprite.nameText) sprite.nameText.setAlpha(1);
      if (sprite.affixText) sprite.affixText.setAlpha(1);
    }

    // Shield dome visual (pulsing white circle)
    if (sprite.shieldGfx) {
      sprite.shieldGfx.clear();
      if (m.shieldActive) {
        const shieldAlpha = 0.15 + Math.sin(Date.now() / 400) * 0.1; // 0.05–0.25 range → ~0.15–0.35
        const shieldRadius = sprite.monsterSize + 8;
        sprite.shieldGfx.lineStyle(2, 0xffffff, shieldAlpha + 0.15);
        sprite.shieldGfx.strokeCircle(sprite.x, sprite.y, shieldRadius);
        sprite.shieldGfx.fillStyle(0xffffff, shieldAlpha);
        sprite.shieldGfx.fillCircle(sprite.x, sprite.y, shieldRadius);
      }
    }

    // Fire enchanted glow (orange circle behind monster)
    if (sprite.fireGfx) {
      sprite.fireGfx.clear();
      if (m.fireEnchanted) {
        const fireAlpha = 0.2 + Math.sin(Date.now() / 300) * 0.1;
        sprite.fireGfx.fillStyle(0xff6600, fireAlpha);
        sprite.fireGfx.fillCircle(sprite.x, sprite.y, sprite.monsterSize + 6);
        sprite.fireGfx.fillStyle(0xff9900, fireAlpha * 0.6);
        sprite.fireGfx.fillCircle(sprite.x, sprite.y - 2, sprite.monsterSize + 3);
      }
    }

    // Friendly glow (soft blue aura around spirit wolf)
    if (sprite.friendlyGlow) {
      sprite.friendlyGlow.clear();
      const glowAlpha = 0.08 + Math.sin(Date.now() / 900) * 0.05;
      sprite.friendlyGlow.fillStyle(0x88bbff, glowAlpha);
      sprite.friendlyGlow.fillCircle(sprite.x, sprite.y, sprite.monsterSize + 5);
    }

    // HP bar — friendly: blue, hostile: red
    if (sprite.hpBar) {
      sprite.hpBar.clear();
      const mBarW = m.isBoss ? 60 : 30;
      const mBarH = m.isBoss ? 5 : 3;
      const mBarX = sprite.x - mBarW / 2;
      const mBarY = sprite.y - sprite.monsterSize - 8;
      sprite.hpBar.fillStyle(0x333333, 0.8);
      sprite.hpBar.fillRect(mBarX, mBarY, mBarW, mBarH);
      const mHpRatio = m.hp / m.maxHp;
      sprite.hpBar.fillStyle(m.friendly ? 0x4488cc : 0xcc2222, 1);
      sprite.hpBar.fillRect(mBarX, mBarY, mBarW * mHpRatio, mBarH);
    }
  },

  /** Remove a single dead monster sprite and its texture, with elite death FX. */
  destroyMonsterSprite(scene, id, m) {
    const sprite = scene.monsterSprites.get(id);
    if (!sprite) return;

    // Elite death effects
    if (sprite._isElite) {
      const isRare = sprite._eliteRank === 'rare';
      const particleCount = isRare ? 16 : 10;
      const particleSize = isRare ? 4 : 3;
      const particleColor = isRare ? 0xffcc00 : 0x4488ff;
      const gfx = scene.add.graphics().setDepth(20);
      const particles = [];
      for (let i = 0; i < particleCount; i++) {
        const angle = (Math.PI * 2 / particleCount) * i;
        const speed = 40 + Math.random() * 60;
        particles.push({
          x: sprite.x, y: sprite.y,
          vx: Math.cos(angle) * speed,
          vy: Math.sin(angle) * speed,
          life: 1,
        });
      }
      const startTime = Date.now();
      const duration = isRare ? 600 : 400;
      const updateEvent = scene.time.addEvent({
        delay: 16, loop: true,
        callback: () => {
          const elapsed = Date.now() - startTime;
          const t = elapsed / duration;
          if (t >= 1) { gfx.destroy(); updateEvent.destroy(); return; }
          gfx.clear();
          for (const pt of particles) {
            pt.x += pt.vx * 0.016;
            pt.y += pt.vy * 0.016;
            pt.life = 1 - t;
            gfx.fillStyle(particleColor, pt.life);
            gfx.fillCircle(pt.x, pt.y, particleSize * pt.life);
          }
        },
      });
      // Rare: screen shake
      if (isRare) {
        scene.cameras.main.shake(250, 0.005);
      }
    }

    if (sprite.nameText) sprite.nameText.destroy();
    if (sprite.affixText) sprite.affixText.destroy();
    if (sprite.hpBar) sprite.hpBar.destroy();
    if (sprite.shieldGfx) sprite.shieldGfx.destroy();
    if (sprite.fireGfx) sprite.fireGfx.destroy();
    if (sprite.friendlyGlow) sprite.friendlyGlow.destroy();
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
        if (sprite.affixText) sprite.affixText.destroy();
        if (sprite.hpBar) sprite.hpBar.destroy();
        if (sprite.shieldGfx) sprite.shieldGfx.destroy();
        if (sprite.fireGfx) sprite.fireGfx.destroy();
        if (sprite.friendlyGlow) sprite.friendlyGlow.destroy();
        sprite.destroy();
      }
      scene.monsterSprites.clear();
      return;
    }
    for (const [id, sprite] of scene.monsterSprites) {
      if (!seenMonsters.has(id)) {
        if (sprite.nameText) sprite.nameText.destroy();
        if (sprite.affixText) sprite.affixText.destroy();
        if (sprite.hpBar) sprite.hpBar.destroy();
        if (sprite.shieldGfx) sprite.shieldGfx.destroy();
        if (sprite.fireGfx) sprite.fireGfx.destroy();
        if (sprite.friendlyGlow) sprite.friendlyGlow.destroy();
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
    sprite._isSetItem = (gi.rarity === 'set' || gi.isSetItem);

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

    // Set item sparkle sprites (green, 6 sparkles, slightly larger radius)
    if (sprite._isSetItem && !sprite._isLegendary) {
      sprite._sparkles = [];
      for (let si = 0; si < 6; si++) {
        const sparkle = scene.add.graphics().setDepth(7);
        sparkle._angle = (Math.PI * 2 / 6) * si;
        sparkle._radius = 16;
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

    // Legendary / Set rotating sparkles
    if (sprite._sparkles) {
      const time = Date.now() / 800;
      const sparkColor = sprite._isSetItem ? 0x00cc66 : 0xffcc00;
      for (const sparkle of sprite._sparkles) {
        sparkle.clear();
        const a = sparkle._angle + time;
        const sx = sprite._glowX + Math.cos(a) * sparkle._radius;
        const sy = sprite._baseY + bobOffset + Math.sin(a) * sparkle._radius;
        const sparkAlpha = 0.5 + Math.sin(time * 3 + sparkle._angle) * 0.5;
        sparkle.fillStyle(sparkColor, sparkAlpha);
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
