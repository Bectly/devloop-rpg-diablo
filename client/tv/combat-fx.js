// ─── DevLoop RPG — Combat Visual Effects ────────────────────────
// Extracted from game.js (Cycle #82) to keep game.js under 1000 LOC.

const CombatFX = (() => {

  // ── Skill Visual Effect Spawners ──

  function spawnAoeEffect(scene, x, y, radius, color, duration) {
    const circle = scene.add.circle(x, y, radius, color, 0.3);
    circle.setDepth(7);
    scene.tweens.add({
      targets: circle,
      alpha: 0,
      scale: 1.2,
      duration: duration || 500,
      onComplete: () => circle.destroy(),
    });
  }

  function spawnProjectile(scene, fromX, fromY, toX, toY, color) {
    const proj = scene.add.circle(fromX, fromY, 4, color, 1);
    proj.setDepth(9);
    scene.tweens.add({
      targets: proj,
      x: toX,
      y: toY,
      duration: 200,
      onComplete: () => proj.destroy(),
    });
  }

  function spawnBuffEffect(scene, x, y, color) {
    for (let i = 0; i < 8; i++) {
      const angle = (i / 8) * Math.PI * 2;
      const px = x + Math.cos(angle) * 20;
      const py = y + Math.sin(angle) * 20;
      const particle = scene.add.circle(px, py, 3, color, 0.8);
      particle.setDepth(9);
      scene.tweens.add({
        targets: particle,
        y: py - 30,
        alpha: 0,
        duration: 800,
        delay: i * 50,
        onComplete: () => particle.destroy(),
      });
    }
  }

  function spawnBleedProc(scene, x, y) {
    // 4 small red circles that drift upward and fade — indicates a bleed proc
    for (let i = 0; i < 4; i++) {
      const ox = (Math.random() - 0.5) * 18;
      const oy = (Math.random() - 0.5) * 18;
      const dot = scene.add.circle(x + ox, y + oy, 2 + Math.random() * 2, 0xcc1111, 0.85);
      dot.setDepth(9);
      scene.tweens.add({
        targets: dot,
        y: dot.y - 18 - Math.random() * 10,
        alpha: 0,
        duration: 600 + Math.floor(Math.random() * 200),
        delay: i * 60,
        ease: 'Cubic.easeOut',
        onComplete: () => dot.destroy(),
      });
    }
  }

  function spawnTeleportEffect(scene, fromX, fromY, toX, toY) {
    const vanish = scene.add.circle(fromX, fromY, 16, 0xbb44ff, 0.6);
    vanish.setDepth(9);
    scene.tweens.add({
      targets: vanish,
      scale: 0,
      alpha: 0,
      duration: 300,
      onComplete: () => vanish.destroy(),
    });
    const appear = scene.add.circle(toX, toY, 0, 0xbb44ff, 0.6);
    appear.setDepth(9);
    scene.tweens.add({
      targets: appear,
      scale: 1,
      alpha: 0,
      duration: 300,
      delay: 150,
      onComplete: () => appear.destroy(),
    });
  }

  // ── Process all combat events for a frame ──
  function processCombatEvents(scene, state) {
    if (!state.events) return;
    for (const ev of state.events) {
      if (ev.type === 'combat:hit' && ev.damage > 0) {
        const target = state.world.monsters?.find(m => m.id === ev.targetId)
          || state.players?.find(p => p.id === ev.targetId);
        if (target) {
          HUD.spawnDamageText(scene, target.x || 0, (target.y || 0) - 30, ev.damage, ev.isCrit, ev.dodged, null, ev.damageType);
          if (ev.isCrit) {
            scene.cameras.main.shake(200, 0.003);
          }
        }

        // Skill visual effects
        if (ev.skillName) {
          const attacker = state.players?.find(p => p.id === ev.attackerId);
          switch (ev.skillName) {
            case 'Cleave': {
              const ax = attacker ? attacker.x : (target ? target.x : 0);
              const ay = attacker ? attacker.y : (target ? target.y : 0);
              spawnAoeEffect(scene, ax, ay, 60, 0xff8833, 500);
              break;
            }
            case 'Fireball': {
              const tx = target ? target.x : 0;
              const ty = target ? target.y : 0;
              spawnAoeEffect(scene, tx, ty, 50, 0xff3311, 600);
              break;
            }
            case 'Frost Nova': {
              const ax = attacker ? attacker.x : (target ? target.x : 0);
              const ay = attacker ? attacker.y : (target ? target.y : 0);
              spawnAoeEffect(scene, ax, ay, 80, 0x44ddff, 700);
              break;
            }
            case 'Multi-Shot': {
              if (attacker && target) {
                spawnProjectile(scene, attacker.x, attacker.y, target.x, target.y, 0x44cc44);
              }
              break;
            }
            case 'Poison Arrow': {
              if (attacker && target) {
                spawnProjectile(scene, attacker.x, attacker.y, target.x, target.y, 0x88cc22);
                spawnAoeEffect(scene, target.x, target.y, 20, 0x66aa11, 800);
              }
              break;
            }
            case 'Shield Bash': {
              if (target) {
                spawnAoeEffect(scene, target.x, target.y, 24, 0xffcc44, 300);
              }
              break;
            }
          }
        }
      }
      if (ev.type === 'combat:hit' && ev.dodged) {
        const target = state.players?.find(p => p.id === ev.targetId);
        if (target) {
          HUD.spawnDamageText(scene, target.x, target.y - 30, 'DODGE', false, true);
        }
      }
      if (ev.type === 'combat:heal') {
        const target = state.players?.find(p => p.id === ev.targetId || p.id === ev.playerId);
        if (target) {
          HUD.spawnHealNumber(scene, target.x, target.y - 30, ev.amount || ev.heal || ev.damage);
        }
      }
      if (ev.type === 'player:levelup') {
        const p = state.players?.find(p => p.id === ev.playerId);
        if (p) {
          if (ev.isParagon || p.paragonLevel > 0) {
            // Paragon level-up: use gold star notification
            const paragonLevel = ev.paragonLevel || p.paragonLevel || 1;
            HUD.spawnDamageText(scene, p.x, p.y - 50, `\u2B50 P${paragonLevel}!`, false, false, '#ffcc00');
            HUD.showParagonLevelNotification(scene, p.x, p.y, paragonLevel);
          } else {
            HUD.spawnDamageText(scene, p.x, p.y - 50, `LEVEL ${ev.level}!`, false, false, '#ffcc00');
            HUD.showTalentPointNotification(scene, p.x, p.y);
          }
        }
      }
      if (ev.type === 'combat:death' && ev.keystoneReward) {
        const killer = state.players?.find(p => p.id === ev.killedBy);
        const rx = killer ? killer.x : GAME_W / 2;
        const ry = killer ? killer.y : GAME_H / 2;
        HUD.showKeystoneNotification(scene, rx, ry, ev.keystoneReward);
      }
      if (ev.type === 'combat:proc') {
        const target = state.world.monsters?.find(m => m.id === ev.targetId)
          || state.players?.find(p => p.id === ev.targetId);
        if (target) {
          if (ev.procType === 'bleed') {
            spawnBleedProc(scene, target.x, target.y);
          }
        }
      }
      if (ev.type === 'buff:apply') {
        const p = state.players?.find(p => p.id === ev.playerId);
        if (p) {
          HUD.spawnDamageText(scene, p.x, p.y - 40, ev.skillName, false, false, '#44ccff');
          if (ev.skillName === 'War Cry') {
            spawnBuffEffect(scene, p.x, p.y, 0xffcc00);
          } else if (ev.skillName === 'Evasion') {
            spawnBuffEffect(scene, p.x, p.y, 0x44cc44);
          }
        }
      }
      if (ev.type === 'effect:spawn' && ev.effectType === 'teleport') {
        const p = state.players?.find(p => p.id === ev.playerId);
        const sprite = p ? scene.playerSprites.get(p.id) : null;
        const fromX = sprite ? sprite.x : ev.x;
        const fromY = sprite ? sprite.y : ev.y;
        spawnTeleportEffect(scene, fromX, fromY, ev.x, ev.y);
      }
      // Trap trigger burst effect
      if (ev.type === 'trap:trigger' && ev.x !== undefined) {
        const trapColors = {
          spike: 0x888899,
          fire: 0xff4400,
          poison: 0x44cc44,
          void: 0x8844dd,
        };
        const color = trapColors[ev.trapType] || 0xffffff;
        spawnAoeEffect(scene, ev.x, ev.y, 24, color, 400);
        scene.cameras.main.shake(150, 0.002);
        if (ev.damage > 0 && !ev.dodged) {
          const dmgTypeMap = { spike: 'physical', fire: 'fire', poison: 'poison', void: 'cold' };
          HUD.spawnDamageText(scene, ev.x, ev.y - 20, ev.damage, false, false, null, dmgTypeMap[ev.trapType] || 'physical');
        }
        if (ev.dodged) {
          HUD.spawnDamageText(scene, ev.x, ev.y - 20, 'DODGE', false, true);
        }
      }
    }
  }

  return { processCombatEvents, spawnAoeEffect, spawnProjectile, spawnBuffEffect, spawnTeleportEffect, spawnBleedProc };
})();
