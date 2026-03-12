const { generateLoot } = require('./items');

class CombatSystem {
  constructor() {
    this.events = []; // combat events to broadcast
  }

  clearEvents() {
    const events = this.events;
    this.events = [];
    return events;
  }

  // Calculate player attack damage
  calcPlayerDamage(player) {
    let baseDamage = player.attackPower;

    // Weapon damage
    if (player.equipment.weapon) {
      baseDamage += player.equipment.weapon.damage || 0;
    }

    // Buff: attack_up
    const attackBuff = player.buffs.find(b => b.effect === 'attack_up');
    if (attackBuff) {
      baseDamage = Math.floor(baseDamage * 1.3);
    }

    // Random variance (+/- 15%)
    const variance = 0.85 + Math.random() * 0.3;
    baseDamage = Math.floor(baseDamage * variance);

    // Crit check
    let isCrit = false;
    if (Math.random() * 100 < player.critChance) {
      baseDamage = Math.floor(baseDamage * 2.0);
      isCrit = true;
    }

    // Dagger bonus crit damage
    if (player.equipment.weapon && player.equipment.weapon.subType === 'dagger') {
      if (isCrit) {
        baseDamage = Math.floor(baseDamage * 1.2); // extra 20% on crit
      }
    }

    return { damage: Math.max(1, baseDamage), isCrit };
  }

  // Player attacks nearest monster
  playerAttack(player, monsters) {
    if (!player.canAttack()) return null;

    // Find nearest monster in range
    let nearest = null;
    let nearestDist = Infinity;

    for (const monster of monsters) {
      if (!monster.alive) continue;
      const dx = monster.x - player.x;
      const dy = monster.y - player.y;
      const dist = Math.sqrt(dx * dx + dy * dy);
      if (dist <= player.attackRange && dist < nearestDist) {
        nearest = monster;
        nearestDist = dist;
      }
    }

    if (!nearest) return null;

    player.startAttackCooldown();
    const { damage, isCrit } = this.calcPlayerDamage(player);
    const dealt = nearest.takeDamage(damage);

    const event = {
      type: 'combat:hit',
      attackerId: player.id,
      attackerName: player.name,
      targetId: nearest.id,
      targetName: nearest.name,
      damage: dealt,
      isCrit,
      targetHp: nearest.hp,
      targetMaxHp: nearest.maxHp,
    };
    this.events.push(event);

    // Check for kill
    if (!nearest.alive) {
      const loot = generateLoot(nearest.lootTier, nearest.type);
      const deathEvent = {
        type: 'combat:death',
        entityId: nearest.id,
        entityName: nearest.name,
        killedBy: player.id,
        killedByName: player.name,
        isBoss: nearest.isBoss,
        loot: loot.map(item => ({
          ...item,
          worldX: nearest.x + (Math.random() - 0.5) * 40,
          worldY: nearest.y + (Math.random() - 0.5) * 40,
        })),
        xpReward: nearest.xpReward,
      };
      this.events.push(deathEvent);

      // Award XP
      const levelResult = player.gainXp(nearest.xpReward);
      if (levelResult) {
        this.events.push({
          type: 'player:levelup',
          playerId: player.id,
          playerName: player.name,
          level: levelResult.level,
        });
      }
    }

    return event;
  }

  // Player uses a skill
  playerSkill(player, skillIndex, monsters, allPlayers) {
    const skill = player.useSkill(skillIndex);
    if (!skill) return null;

    const results = [];

    switch (skill.type) {
      case 'aoe': {
        // Damage all monsters in radius
        for (const monster of monsters) {
          if (!monster.alive) continue;
          const dx = monster.x - player.x;
          const dy = monster.y - player.y;
          const dist = Math.sqrt(dx * dx + dy * dy);
          if (dist <= skill.radius) {
            const baseDmg = (skill.name === 'Fireball' || skill.name === 'Frost Nova')
              ? Math.floor(player.spellPower * skill.damage)
              : Math.floor(player.attackPower * skill.damage);

            const dealt = monster.takeDamage(baseDmg);

            // Apply effects
            if (skill.effect === 'stun') monster.applyStun(skill.duration);
            if (skill.effect === 'slow') monster.applySlow(skill.duration);

            results.push({
              type: 'combat:hit',
              attackerId: player.id,
              targetId: monster.id,
              targetName: monster.name,
              damage: dealt,
              isCrit: false,
              skillName: skill.name,
              targetHp: monster.hp,
              targetMaxHp: monster.maxHp,
            });

            if (!monster.alive) {
              const loot = generateLoot(monster.lootTier, monster.type);
              results.push({
                type: 'combat:death',
                entityId: monster.id,
                entityName: monster.name,
                killedBy: player.id,
                isBoss: monster.isBoss,
                loot: loot.map(item => ({
                  ...item,
                  worldX: monster.x + (Math.random() - 0.5) * 40,
                  worldY: monster.y + (Math.random() - 0.5) * 40,
                })),
                xpReward: monster.xpReward,
              });
              const levelResult = player.gainXp(monster.xpReward);
              if (levelResult) {
                results.push({ type: 'player:levelup', playerId: player.id, level: levelResult.level });
              }
            }
          }
        }
        break;
      }

      case 'single': {
        // Hit nearest monster
        let nearest = null;
        let nearestDist = Infinity;
        for (const monster of monsters) {
          if (!monster.alive) continue;
          const dist = Math.sqrt((monster.x - player.x) ** 2 + (monster.y - player.y) ** 2);
          if (dist <= player.attackRange * 1.5 && dist < nearestDist) {
            nearest = monster;
            nearestDist = dist;
          }
        }
        if (nearest) {
          const baseDmg = Math.floor(player.attackPower * skill.damage);
          const dealt = nearest.takeDamage(baseDmg);
          if (skill.effect === 'stun') nearest.applyStun(skill.duration);

          results.push({
            type: 'combat:hit',
            attackerId: player.id,
            targetId: nearest.id,
            damage: dealt,
            skillName: skill.name,
            targetHp: nearest.hp,
            targetMaxHp: nearest.maxHp,
          });

          if (!nearest.alive) {
            const loot = generateLoot(nearest.lootTier, nearest.type);
            results.push({
              type: 'combat:death',
              entityId: nearest.id,
              killedBy: player.id,
              isBoss: nearest.isBoss,
              loot: loot.map(item => ({
                ...item,
                worldX: nearest.x + (Math.random() - 0.5) * 40,
                worldY: nearest.y + (Math.random() - 0.5) * 40,
              })),
              xpReward: nearest.xpReward,
            });
            const levelResult = player.gainXp(nearest.xpReward);
            if (levelResult) {
              results.push({ type: 'player:levelup', playerId: player.id, level: levelResult.level });
            }
          }
        }
        break;
      }

      case 'multi': {
        // Hit multiple targets (Multi-Shot)
        const targets = [];
        for (const monster of monsters) {
          if (!monster.alive) continue;
          const dist = Math.sqrt((monster.x - player.x) ** 2 + (monster.y - player.y) ** 2);
          if (dist <= 200) targets.push({ monster, dist });
        }
        targets.sort((a, b) => a.dist - b.dist);

        for (let i = 0; i < Math.min(skill.count, targets.length); i++) {
          const t = targets[i].monster;
          const baseDmg = Math.floor(player.attackPower * skill.damage);
          const dealt = t.takeDamage(baseDmg);

          results.push({
            type: 'combat:hit',
            attackerId: player.id,
            targetId: t.id,
            damage: dealt,
            skillName: skill.name,
            targetHp: t.hp,
            targetMaxHp: t.maxHp,
          });

          if (!t.alive) {
            const loot = generateLoot(t.lootTier, t.type);
            results.push({
              type: 'combat:death',
              entityId: t.id,
              killedBy: player.id,
              isBoss: t.isBoss,
              loot: loot.map(item => ({
                ...item,
                worldX: t.x + (Math.random() - 0.5) * 40,
                worldY: t.y + (Math.random() - 0.5) * 40,
              })),
              xpReward: t.xpReward,
            });
            const levelResult = player.gainXp(t.xpReward);
            if (levelResult) {
              results.push({ type: 'player:levelup', playerId: player.id, level: levelResult.level });
            }
          }
        }
        break;
      }

      case 'dot': {
        // Poison arrow — single target with DoT
        let nearest = null;
        let nearestDist = Infinity;
        for (const monster of monsters) {
          if (!monster.alive) continue;
          const dist = Math.sqrt((monster.x - player.x) ** 2 + (monster.y - player.y) ** 2);
          if (dist <= 200 && dist < nearestDist) {
            nearest = monster;
            nearestDist = dist;
          }
        }
        if (nearest) {
          const baseDmg = Math.floor(player.attackPower * skill.damage);
          const dealt = nearest.takeDamage(baseDmg);
          // Set poison timer on monster
          nearest.poisonTick = skill.duration;
          nearest.poisonDamage = skill.tickDamage;

          results.push({
            type: 'combat:hit',
            attackerId: player.id,
            targetId: nearest.id,
            damage: dealt,
            skillName: skill.name,
            effect: 'poison',
            targetHp: nearest.hp,
            targetMaxHp: nearest.maxHp,
          });

          if (!nearest.alive) {
            const loot = generateLoot(nearest.lootTier, nearest.type);
            results.push({
              type: 'combat:death',
              entityId: nearest.id,
              killedBy: player.id,
              isBoss: nearest.isBoss,
              loot: loot.map(item => ({
                ...item,
                worldX: nearest.x + (Math.random() - 0.5) * 40,
                worldY: nearest.y + (Math.random() - 0.5) * 40,
              })),
              xpReward: nearest.xpReward,
            });
            const levelResult = player.gainXp(nearest.xpReward);
            if (levelResult) {
              results.push({ type: 'player:levelup', playerId: player.id, level: levelResult.level });
            }
          }
        }
        break;
      }

      case 'buff': {
        // Apply buff to player (and party for War Cry)
        const targets = skill.name === 'War Cry' ? allPlayers : [player];
        for (const target of targets) {
          if (!target.alive) continue;
          target.buffs.push({
            effect: skill.effect,
            duration: skill.duration,
            remaining: skill.duration,
          });
          results.push({
            type: 'buff:apply',
            playerId: target.id,
            effect: skill.effect,
            duration: skill.duration,
            skillName: skill.name,
          });
        }
        break;
      }

      case 'movement': {
        // Teleport
        // Move player forward in facing direction
        const dirMap = { up: [0, -1], down: [0, 1], left: [-1, 0], right: [1, 0] };
        const dir = dirMap[player.facing] || [0, 0];
        player.x += dir[0] * skill.range;
        player.y += dir[1] * skill.range;
        // Clamp
        player.x = Math.max(16, Math.min(1264, player.x));
        player.y = Math.max(16, Math.min(704, player.y));

        results.push({
          type: 'effect:spawn',
          effectType: 'teleport',
          playerId: player.id,
          x: player.x,
          y: player.y,
        });
        break;
      }
    }

    this.events.push(...results);
    return results;
  }

  // Process monster attacks (called from monster AI)
  processMonsterAttack(event, players) {
    const target = players.find(p => p.id === event.targetId);
    if (!target || !target.alive) return null;

    const dealt = target.takeDamage(event.damage);

    const hitEvent = {
      type: 'combat:hit',
      attackerId: event.monsterId,
      targetId: target.id,
      damage: dealt === -1 ? 0 : dealt,
      dodged: dealt === -1,
      attackType: event.attackType,
    };
    this.events.push(hitEvent);

    // Poison DoT setup
    if (event.attackType === 'poison' && dealt > 0) {
      // Poison handled separately if needed
    }

    if (!target.alive) {
      this.events.push({
        type: 'combat:player_death',
        playerId: target.id,
        playerName: target.name,
        killedBy: event.monsterId,
      });
    }

    return hitEvent;
  }

  // Process poison ticks on monsters
  processPoison(monster, dt) {
    if (monster.poisonTick > 0 && monster.alive) {
      monster.poisonTick -= dt;
      // Apply damage every 1 second
      if (Math.floor((monster.poisonTick + dt) / 1000) > Math.floor(monster.poisonTick / 1000)) {
        const dealt = monster.takeDamage(monster.poisonDamage || 5);
        this.events.push({
          type: 'combat:hit',
          attackerId: 'poison',
          targetId: monster.id,
          damage: dealt,
          attackType: 'poison_tick',
        });
      }
    }
  }
}

module.exports = { CombatSystem };
