// ─── DevLoop RPG — Environment Effects (shrines, traps, shop NPC) ───
// Extracted from game.js (Cycle #82) to keep game.js under 1000 LOC.

const Effects = (() => {

  // ── Shop NPC ──
  function updateShopNpc(scene, state) {
    if (state.world.shopNpc) {
      const npc = state.world.shopNpc;
      if (!scene.shopNpcSprite) {
        scene.shopNpcSprite = scene.add.sprite(npc.x, npc.y, 'shop_npc').setDepth(9).setScale(1.2);
        scene.shopNpcLabel = scene.add.text(npc.x, npc.y - 26, 'SHOP', {
          fontSize: '11px',
          fill: '#ffcc00',
          fontFamily: 'Courier New',
          fontStyle: 'bold',
          backgroundColor: '#00000088',
          padding: { x: 4, y: 2 },
        }).setOrigin(0.5).setDepth(10);
      }
      scene.shopNpcSprite.setPosition(npc.x, npc.y);
      scene.shopNpcLabel.setPosition(npc.x, npc.y - 26);
      const bobShop = Math.sin(Date.now() / 600) * 1.5;
      scene.shopNpcSprite.y += bobShop;
      scene.shopNpcLabel.y += bobShop;
    } else {
      if (scene.shopNpcSprite) {
        scene.shopNpcSprite.destroy();
        scene.shopNpcSprite = null;
      }
      if (scene.shopNpcLabel) {
        scene.shopNpcLabel.destroy();
        scene.shopNpcLabel = null;
      }
    }
  }

  // ── Healing Shrines ──
  function updateShrines(scene, state) {
    if (!state.world.rooms) return;
    const seenShrines = new Set();
    for (const room of state.world.rooms) {
      if (!room.hasShrine || !room.discovered) continue;
      seenShrines.add(room.id);
      let shrine = scene.shrineSprites.get(room.id);
      if (!shrine) {
        const sx = (room.x + room.w / 2) * TILE_SIZE;
        const sy = (room.y + room.h / 2) * TILE_SIZE - 16;
        shrine = scene.add.sprite(sx, sy, 'shrine').setDepth(5).setScale(0.9);
        shrine._baseY = sy;
        shrine._baseX = sx;
        shrine.label = scene.add.text(sx, sy - 22, 'SHRINE', {
          fontSize: '9px',
          fill: room.shrineUsed ? '#444444' : '#44ffaa',
          fontFamily: 'Courier New',
          fontStyle: 'bold',
          backgroundColor: '#00000066',
          padding: { x: 3, y: 1 },
        }).setOrigin(0.5).setDepth(6);

        shrine._orbitDots = [];
        for (let di = 0; di < 4; di++) {
          const dot = scene.add.graphics().setDepth(6);
          dot._angle = (Math.PI * 2 / 4) * di;
          shrine._orbitDots.push(dot);
        }
        shrine._crackGfx = scene.add.graphics().setDepth(6);
        scene.shrineSprites.set(room.id, shrine);
      }
      if (room.shrineUsed) {
        shrine.setAlpha(0.25);
        shrine.setTint(0x555555);
        shrine.label.setColor('#444444');
        shrine.label.setText('DEPLETED');
        for (const dot of shrine._orbitDots) dot.clear();
        shrine._crackGfx.clear();
        shrine._crackGfx.lineStyle(1, 0x222222, 0.7);
        const cx = shrine._baseX;
        const cy = shrine._baseY;
        shrine._crackGfx.lineBetween(cx - 6, cy - 8, cx + 2, cy);
        shrine._crackGfx.lineBetween(cx + 2, cy, cx - 3, cy + 7);
        shrine._crackGfx.lineBetween(cx + 4, cy - 5, cx + 7, cy + 3);
        shrine._crackGfx.lineBetween(cx - 4, cy + 2, cx + 1, cy + 9);
      } else {
        shrine.clearTint();
        const pulse = 0.7 + Math.sin(Date.now() / 500) * 0.3;
        shrine.setAlpha(pulse);
        shrine.y = shrine._baseY + Math.sin(Date.now() / 800) * 2;
        shrine.label.y = shrine.y - 22;
        shrine._crackGfx.clear();
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
    for (const [id, shrine] of scene.shrineSprites) {
      if (!seenShrines.has(id)) {
        shrine.label.destroy();
        if (shrine._orbitDots) {
          for (const dot of shrine._orbitDots) dot.destroy();
        }
        if (shrine._crackGfx) shrine._crackGfx.destroy();
        shrine.destroy();
        scene.shrineSprites.delete(id);
      }
    }
  }

  // ── Environmental Traps ──
  function updateTraps(scene, state) {
    if (!state.world.traps) return;
    const seenTraps = new Set();
    for (const trap of state.world.traps) {
      seenTraps.add(trap.id);
      let sprite = scene.trapSprites.get(trap.id);
      if (!sprite) {
        const texKey = `trap_${trap.type}`;
        sprite = scene.add.sprite(trap.x, trap.y, texKey).setDepth(3).setScale(0.8).setAlpha(0.7);
        sprite._type = trap.type;
        sprite._baseX = trap.x;
        sprite._baseY = trap.y;
        scene.trapSprites.set(trap.id, sprite);
      }
      const t = Date.now();
      if (sprite._type === 'fire') {
        sprite.setAlpha(0.5 + Math.sin(t / 200) * 0.2);
        sprite.setScale(0.75 + Math.sin(t / 300) * 0.05);
      } else if (sprite._type === 'poison') {
        sprite.setAlpha(0.5 + Math.sin(t / 600) * 0.15);
        sprite.y = sprite._baseY + Math.sin(t / 400) * 1.5;
      } else if (sprite._type === 'void') {
        sprite.setAlpha(0.5 + Math.sin(t / 400) * 0.25);
        const rotScale = 0.75 + Math.sin(t / 500) * 0.08;
        sprite.setScale(rotScale);
      } else {
        sprite.setAlpha(0.55 + Math.sin(t / 800) * 0.1);
      }
    }
    for (const [id, sprite] of scene.trapSprites) {
      if (!seenTraps.has(id)) {
        sprite.destroy();
        scene.trapSprites.delete(id);
      }
    }
  }

  // ── Floor transition cleanup ──
  function cleanupAll(scene) {
    // Shop NPC
    if (scene.shopNpcSprite) {
      scene.shopNpcSprite.destroy();
      scene.shopNpcSprite = null;
    }
    if (scene.shopNpcLabel) {
      scene.shopNpcLabel.destroy();
      scene.shopNpcLabel = null;
    }
    // Shrines
    for (const [, shrine] of scene.shrineSprites) {
      if (shrine.label) shrine.label.destroy();
      if (shrine._orbitDots) {
        for (const dot of shrine._orbitDots) dot.destroy();
      }
      if (shrine._crackGfx) shrine._crackGfx.destroy();
      shrine.destroy();
    }
    scene.shrineSprites.clear();
    // Traps
    if (scene.trapSprites) {
      for (const [, s] of scene.trapSprites) s.destroy();
      scene.trapSprites.clear();
    }
  }

  return { updateShopNpc, updateShrines, updateTraps, cleanupAll };
})();
