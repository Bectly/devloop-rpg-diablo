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

  // ── Mage Skill Effects (Phase 16.4) ──

  function spawnMeteorCastEffect(scene, x, y, angle) {
    // Fire charge-up at caster + fireball launch trail
    const flash = scene.add.circle(x, y, 10, 0xff4400, 0.6);
    flash.setDepth(8);
    scene.tweens.add({
      targets: flash,
      scale: 2,
      alpha: 0,
      duration: 400,
      onComplete: () => flash.destroy(),
    });
    // 6 fire sparks spiraling outward
    for (let i = 0; i < 6; i++) {
      const a = (i / 6) * Math.PI * 2;
      const spark = scene.add.circle(x, y, 2, 0xff6611, 0.9);
      spark.setDepth(9);
      scene.tweens.add({
        targets: spark,
        x: x + Math.cos(a) * 25,
        y: y + Math.sin(a) * 25,
        alpha: 0,
        duration: 300,
        delay: i * 30,
        onComplete: () => spark.destroy(),
      });
    }
  }

  function spawnBlizzardEffect(scene, x, y, radius, hits) {
    // Expanding ice ring + falling ice particles
    const ring = scene.add.circle(x, y, 10, 0x44ddff, 0.3);
    ring.setStrokeStyle(2, 0x88eeff, 0.6);
    ring.setDepth(7);
    scene.tweens.add({
      targets: ring,
      scale: radius / 10,
      alpha: 0,
      duration: 800,
      onComplete: () => ring.destroy(),
    });
    // Ice shards falling within radius
    const shardCount = 15;
    for (let i = 0; i < shardCount; i++) {
      const ox = (Math.random() - 0.5) * radius * 1.6;
      const oy = (Math.random() - 0.5) * radius * 1.6;
      const shard = scene.add.circle(x + ox, y + oy - 20, 2 + Math.random() * 2, 0x88ccff, 0.8);
      shard.setDepth(9);
      scene.tweens.add({
        targets: shard,
        y: shard.y + 25 + Math.random() * 15,
        alpha: 0,
        scale: 0.3,
        duration: 400 + Math.random() * 300,
        delay: i * 50,
        onComplete: () => shard.destroy(),
      });
    }
    // Ground frost patch
    const frost = scene.add.circle(x, y, radius * 0.8, 0x44aadd, 0.12);
    frost.setDepth(6);
    scene.tweens.add({
      targets: frost,
      alpha: 0,
      duration: 1500,
      delay: 400,
      onComplete: () => frost.destroy(),
    });
  }

  function spawnChainLightningEffect(scene, fromX, fromY, toX, toY, bounceIndex) {
    // Jagged lightning arc between two points
    const segments = 6;
    const dx = toX - fromX;
    const dy = toY - fromY;
    const perpX = -dy;
    const perpY = dx;
    const len = Math.sqrt(perpX * perpX + perpY * perpY) || 1;
    const normPX = perpX / len;
    const normPY = perpY / len;

    // Intensity decreases with each bounce
    const intensity = Math.max(0.3, 1 - bounceIndex * 0.2);
    const color = bounceIndex === 0 ? 0xffff44 : bounceIndex === 1 ? 0xdddd33 : 0xaaaa22;

    let prevX = fromX;
    let prevY = fromY;
    for (let i = 1; i <= segments; i++) {
      const t = i / segments;
      const baseX = fromX + dx * t;
      const baseY = fromY + dy * t;
      // Add random perpendicular offset (jagged look)
      const jag = i < segments ? (Math.random() - 0.5) * 20 * intensity : 0;
      const px = baseX + normPX * jag;
      const py = baseY + normPY * jag;

      // Draw segment as a small moving dot
      const bolt = scene.add.circle(prevX, prevY, 2, color, intensity);
      bolt.setDepth(10);
      scene.tweens.add({
        targets: bolt,
        x: px,
        y: py,
        alpha: 0,
        duration: 150,
        delay: i * 15 + bounceIndex * 80,
        onComplete: () => bolt.destroy(),
      });
      prevX = px;
      prevY = py;
    }

    // Impact flash at target
    const impact = scene.add.circle(toX, toY, 8, 0xffff66, 0.5 * intensity);
    impact.setDepth(9);
    scene.tweens.add({
      targets: impact,
      scale: 1.5,
      alpha: 0,
      duration: 200,
      delay: bounceIndex * 80,
      onComplete: () => impact.destroy(),
    });
  }

  // ── Ranger Skill Effects (Phase 16.3) ──

  function spawnArrowVolleyEffect(scene, x, y, angle, count) {
    // Fan of arrow trails emanating from player
    const spreadRad = (30 * Math.PI) / 180;
    for (let i = 0; i < count; i++) {
      const offset = spreadRad * ((i / (count - 1)) - 0.5);
      const a = angle + offset;
      const endX = x + Math.cos(a) * 120;
      const endY = y + Math.sin(a) * 120;
      const arrow = scene.add.circle(x, y, 3, 0x88cc44, 0.9);
      arrow.setDepth(9);
      scene.tweens.add({
        targets: arrow,
        x: endX,
        y: endY,
        alpha: 0,
        duration: 250,
        delay: i * 40,
        onComplete: () => arrow.destroy(),
      });
    }
    // Muzzle flash
    const flash = scene.add.circle(x, y, 8, 0xaadd66, 0.5);
    flash.setDepth(8);
    scene.tweens.add({
      targets: flash,
      scale: 1.5,
      alpha: 0,
      duration: 200,
      onComplete: () => flash.destroy(),
    });
  }

  function spawnSniperShotEffect(scene, x, y, angle) {
    // Bright line trail in firing direction + camera shake
    const len = 350;
    const endX = x + Math.cos(angle) * len;
    const endY = y + Math.sin(angle) * len;
    // Trail dots along the line
    const steps = 12;
    for (let i = 0; i <= steps; i++) {
      const t = i / steps;
      const px = x + (endX - x) * t;
      const py = y + (endY - y) * t;
      const dot = scene.add.circle(px, py, 2.5 - t * 1.5, 0xffdd44, 0.9 - t * 0.4);
      dot.setDepth(9);
      scene.tweens.add({
        targets: dot,
        alpha: 0,
        duration: 500,
        delay: i * 20,
        onComplete: () => dot.destroy(),
      });
    }
    // Muzzle flash (large, bright)
    const flash = scene.add.circle(x, y, 12, 0xffee88, 0.7);
    flash.setDepth(8);
    scene.tweens.add({
      targets: flash,
      scale: 2,
      alpha: 0,
      duration: 300,
      onComplete: () => flash.destroy(),
    });
    scene.cameras.main.shake(150, 0.002);
  }

  function spawnShadowStepEffect(scene, fromX, fromY, toX, toY) {
    // Dark smoke puff at origin
    for (let i = 0; i < 6; i++) {
      const ox = (Math.random() - 0.5) * 20;
      const oy = (Math.random() - 0.5) * 20;
      const smoke = scene.add.circle(fromX + ox, fromY + oy, 4, 0x333355, 0.7);
      smoke.setDepth(9);
      scene.tweens.add({
        targets: smoke,
        y: smoke.y - 15,
        alpha: 0,
        scale: 1.5,
        duration: 400,
        delay: i * 30,
        onComplete: () => smoke.destroy(),
      });
    }
    // Shadow afterimage at origin (lingers)
    const shadow = scene.add.circle(fromX, fromY, 10, 0x443366, 0.4);
    shadow.setDepth(7);
    scene.tweens.add({
      targets: shadow,
      alpha: 0,
      scale: 0.5,
      duration: 1500,
      onComplete: () => shadow.destroy(),
    });
    // Appear flash at destination
    const appear = scene.add.circle(toX, toY, 0, 0x6644aa, 0.6);
    appear.setDepth(9);
    scene.tweens.add({
      targets: appear,
      scale: 1.5,
      alpha: 0,
      duration: 300,
      delay: 100,
      onComplete: () => appear.destroy(),
    });
  }

  // ── Warrior Skill Effects (Phase 16.2) ──

  function spawnWhirlwindEffect(scene, x, y, radius, duration) {
    // Spinning arc particles around player
    const numArcs = 12;
    for (let i = 0; i < numArcs; i++) {
      const startAngle = (i / numArcs) * Math.PI * 2;
      const px = x + Math.cos(startAngle) * radius * 0.6;
      const py = y + Math.sin(startAngle) * radius * 0.6;
      const slash = scene.add.circle(px, py, 3, 0xff8833, 0.9);
      slash.setDepth(8);
      scene.tweens.add({
        targets: slash,
        x: x + Math.cos(startAngle + Math.PI) * radius,
        y: y + Math.sin(startAngle + Math.PI) * radius,
        alpha: 0,
        scale: 0.3,
        duration: duration || 500,
        delay: i * 30,
        onComplete: () => slash.destroy(),
      });
    }
    // Central spin ring
    const ring = scene.add.circle(x, y, radius, 0xff6600, 0.15);
    ring.setDepth(7);
    scene.tweens.add({
      targets: ring,
      scale: 1.3,
      alpha: 0,
      duration: (duration || 500) + 200,
      onComplete: () => ring.destroy(),
    });
  }

  function spawnChargeDashEffect(scene, fromX, fromY, toX, toY) {
    // Dash trail: line of fading afterimages
    const steps = 8;
    for (let i = 0; i <= steps; i++) {
      const t = i / steps;
      const px = fromX + (toX - fromX) * t;
      const py = fromY + (toY - fromY) * t;
      const ghost = scene.add.circle(px, py, 6, 0xffcc44, 0.6 - t * 0.4);
      ghost.setDepth(7);
      scene.tweens.add({
        targets: ghost,
        alpha: 0,
        scale: 0.2,
        duration: 400,
        delay: i * 30,
        onComplete: () => ghost.destroy(),
      });
    }
    // Impact flash at destination
    const impact = scene.add.circle(toX, toY, 20, 0xffdd66, 0.7);
    impact.setDepth(8);
    scene.tweens.add({
      targets: impact,
      scale: 1.8,
      alpha: 0,
      duration: 300,
      delay: steps * 30,
      onComplete: () => impact.destroy(),
    });
    scene.cameras.main.shake(200, 0.003);
  }

  function spawnBattleShoutEffect(scene, x, y, radius) {
    // Expanding shockwave ring
    const ring = scene.add.circle(x, y, 10, 0xffaa00, 0.5);
    ring.setStrokeStyle(3, 0xffcc00, 0.8);
    ring.setDepth(8);
    scene.tweens.add({
      targets: ring,
      scale: radius / 10,
      alpha: 0,
      duration: 600,
      onComplete: () => ring.destroy(),
    });
    // Exclamation particles radiating outward
    for (let i = 0; i < 6; i++) {
      const angle = (i / 6) * Math.PI * 2;
      const spark = scene.add.circle(x, y, 2, 0xffdd44, 1);
      spark.setDepth(9);
      scene.tweens.add({
        targets: spark,
        x: x + Math.cos(angle) * radius * 0.8,
        y: y + Math.sin(angle) * radius * 0.8,
        alpha: 0,
        duration: 500,
        delay: i * 40,
        onComplete: () => spark.destroy(),
      });
    }
  }

  function spawnFearEffect(scene, x, y) {
    // Purple skull/swirl above feared monster
    const fear = scene.add.circle(x, y - 20, 5, 0x9944dd, 0.8);
    fear.setDepth(10);
    scene.tweens.add({
      targets: fear,
      y: y - 35,
      alpha: 0,
      scale: 1.5,
      duration: 800,
      onComplete: () => fear.destroy(),
    });
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

  function spawnBlockProc(scene, x, y) {
    // Shield flash — expanding gold ring that fades (Shield Wall block)
    const ring = scene.add.circle(x, y, 8, 0xffcc00, 0);
    ring.setStrokeStyle(3, 0xffcc00, 0.9);
    ring.setDepth(9);
    scene.tweens.add({
      targets: ring,
      scale: 2.5,
      alpha: 0,
      duration: 400,
      ease: 'Cubic.easeOut',
      onComplete: () => ring.destroy(),
    });
    HUD.spawnDamageText(scene, x, y - 20, 'BLOCK', false, false, '#ffcc00');
  }

  function spawnFreezeProc(scene, x, y) {
    // Ice burst — blue particles radiate outward (Ice Barrier freeze)
    for (let i = 0; i < 6; i++) {
      const angle = (i / 6) * Math.PI * 2;
      const shard = scene.add.circle(x, y, 3, 0x4488ff, 0.9);
      shard.setDepth(9);
      scene.tweens.add({
        targets: shard,
        x: x + Math.cos(angle) * 22,
        y: y + Math.sin(angle) * 22,
        alpha: 0,
        scale: 0.3,
        duration: 500,
        ease: 'Cubic.easeOut',
        onComplete: () => shard.destroy(),
      });
    }
    HUD.spawnDamageText(scene, x, y - 20, 'FROZEN', false, false, '#4488ff');
  }

  function spawnLastStandProc(scene, x, y) {
    // Fiery aura — orange ring pulse (Last Stand activated)
    const ring = scene.add.circle(x, y, 20, 0xff6600, 0.15);
    ring.setStrokeStyle(2, 0xff6600, 0.8);
    ring.setDepth(9);
    scene.tweens.add({
      targets: ring,
      scale: 1.8,
      alpha: 0,
      duration: 600,
      ease: 'Cubic.easeOut',
      onComplete: () => ring.destroy(),
    });
    HUD.spawnDamageText(scene, x, y - 25, 'LAST STAND', false, false, '#ff6600');
  }

  function spawnCaltropsProc(scene, x, y) {
    // Ground scatter — small green dots spread at feet (Caltrops slow)
    for (let i = 0; i < 5; i++) {
      const ox = (Math.random() - 0.5) * 24;
      const oy = (Math.random() - 0.5) * 12 + 6;
      const dot = scene.add.circle(x + ox, y + oy, 2, 0x44cc44, 0.8);
      dot.setDepth(9);
      scene.tweens.add({
        targets: dot,
        alpha: 0,
        duration: 800,
        delay: i * 80,
        onComplete: () => dot.destroy(),
      });
    }
    HUD.spawnDamageText(scene, x, y - 20, 'SLOWED', false, false, '#44cc44');
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
            case 'Whirlwind': {
              const ax = attacker ? attacker.x : (target ? target.x : 0);
              const ay = attacker ? attacker.y : (target ? target.y : 0);
              spawnAoeEffect(scene, ax, ay, 70, 0xff8833, 500);
              break;
            }
            case 'Meteor Strike': {
              const tx = target ? target.x : 0;
              const ty = target ? target.y : 0;
              spawnAoeEffect(scene, tx, ty, 80, 0xff3311, 600);
              break;
            }
            case 'Blizzard': {
              const ax = attacker ? attacker.x : (target ? target.x : 0);
              const ay = attacker ? attacker.y : (target ? target.y : 0);
              spawnAoeEffect(scene, ax, ay, 120, 0x44ddff, 700);
              break;
            }
            case 'Chain Lightning': {
              if (target) {
                spawnAoeEffect(scene, target.x, target.y, 20, 0xffff44, 400);
              }
              break;
            }
            case 'Arrow Volley': {
              // Projectile hits are rendered by projectile sprites; just show impact
              if (target) {
                spawnAoeEffect(scene, target.x, target.y, 15, 0x88cc44, 300);
              }
              break;
            }
            case 'Sniper Shot': {
              // Heavy hit impact
              if (target) {
                spawnAoeEffect(scene, target.x, target.y, 20, 0xffdd44, 400);
              }
              break;
            }
            case 'Charging Strike': {
              if (target) {
                spawnAoeEffect(scene, target.x, target.y, 30, 0xffcc44, 400);
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
        // Attacker lookup for effects that play on the monster (freeze, caltrops)
        const attacker = ev.attackerId
          ? (state.world.monsters?.find(m => m.id === ev.attackerId) || null)
          : null;
        if (target) {
          if (ev.effect === 'bleed') {
            spawnBleedProc(scene, target.x, target.y);
          } else if (ev.effect === 'block') {
            spawnBlockProc(scene, target.x, target.y);
          } else if (ev.effect === 'last_stand') {
            spawnLastStandProc(scene, target.x, target.y);
          } else if (ev.effect === 'freeze' && attacker) {
            spawnFreezeProc(scene, attacker.x, attacker.y);
          } else if (ev.effect === 'caltrops' && attacker) {
            spawnCaltropsProc(scene, attacker.x, attacker.y);
          } else if (ev.effect === 'heal_on_kill') {
            spawnBuffEffect(scene, target.x, target.y, 0x44ff44);
          }
        }
      }
      if (ev.type === 'buff:apply') {
        const p = state.players?.find(p => p.id === ev.playerId);
        if (p) {
          HUD.spawnDamageText(scene, p.x, p.y - 40, ev.skillName, false, false, '#44ccff');
          if (ev.skillName === 'Battle Shout') {
            spawnBuffEffect(scene, p.x, p.y, 0xffcc00);
          } else if (ev.skillName === 'Shadow Step') {
            spawnBuffEffect(scene, p.x, p.y, 0x6644aa);
          }
        }
      }
      // Warrior skill effects (Phase 16.2)
      if (ev.type === 'effect:spawn' && ev.effectType === 'whirlwind') {
        const p = state.players?.find(p => p.id === ev.playerId);
        if (p) spawnWhirlwindEffect(scene, p.x, p.y, ev.radius || 70, ev.duration || 500);
      }
      if (ev.type === 'effect:spawn' && ev.effectType === 'charge_dash') {
        spawnChargeDashEffect(scene, ev.fromX, ev.fromY, ev.toX, ev.toY);
      }
      if (ev.type === 'effect:spawn' && ev.effectType === 'battle_shout') {
        const p = state.players?.find(p => p.id === ev.playerId);
        if (p) spawnBattleShoutEffect(scene, p.x, p.y, ev.radius || 150);
      }
      if (ev.type === 'debuff:apply' && ev.effect === 'fear') {
        const m = state.world.monsters?.find(m => m.id === ev.targetId);
        if (m) spawnFearEffect(scene, m.x, m.y);
      }
      // Mage skill effects (Phase 16.4)
      if (ev.type === 'effect:spawn' && ev.effectType === 'meteor_cast') {
        const p = state.players?.find(p => p.id === ev.playerId);
        if (p) spawnMeteorCastEffect(scene, p.x, p.y, ev.angle || 0);
      }
      if (ev.type === 'effect:spawn' && ev.effectType === 'blizzard') {
        const p = state.players?.find(p => p.id === ev.playerId);
        if (p) spawnBlizzardEffect(scene, p.x, p.y, ev.radius || 120, ev.hits || 3);
      }
      if (ev.type === 'effect:spawn' && ev.effectType === 'chain_lightning') {
        spawnChainLightningEffect(scene, ev.fromX, ev.fromY, ev.toX, ev.toY, ev.bounceIndex || 0);
      }
      // Ranger skill effects (Phase 16.3)
      if (ev.type === 'effect:spawn' && ev.effectType === 'arrow_volley') {
        const p = state.players?.find(p => p.id === ev.playerId);
        if (p) spawnArrowVolleyEffect(scene, p.x, p.y, ev.angle || 0, ev.count || 5);
      }
      if (ev.type === 'effect:spawn' && ev.effectType === 'sniper_shot') {
        const p = state.players?.find(p => p.id === ev.playerId);
        if (p) spawnSniperShotEffect(scene, p.x, p.y, ev.angle || 0);
      }
      if (ev.type === 'effect:spawn' && ev.effectType === 'shadow_step') {
        spawnShadowStepEffect(scene, ev.fromX, ev.fromY, ev.toX, ev.toY);
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

  return { processCombatEvents, spawnAoeEffect, spawnProjectile, spawnBuffEffect, spawnBleedProc, spawnBlockProc, spawnFreezeProc, spawnLastStandProc, spawnCaltropsProc, spawnWhirlwindEffect, spawnChargeDashEffect, spawnBattleShoutEffect, spawnFearEffect, spawnArrowVolleyEffect, spawnSniperShotEffect, spawnShadowStepEffect, spawnMeteorCastEffect, spawnBlizzardEffect, spawnChainLightningEffect };
})();
