const { generateLoot } = require('./items');
const { modifyDamageByAffixes, processAffixOnHitPlayer, processAffixOnDealDamage, processAffixOnDeath } = require('./affixes');
const { applyResistance, getSkillDamageType, DAMAGE_TYPES } = require('./damage-types');
const { rollSetDrop, generateSetItem } = require('./sets');

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

    // Set bonus: extra crit damage
    if (isCrit && player.setBonuses && player.setBonuses.critDamagePercent) {
      baseDamage = Math.floor(baseDamage * (1 + player.setBonuses.critDamagePercent / 100));
    }

    // Set bonus: flat damage percent increase
    if (player.setBonuses && player.setBonuses.damagePercent) {
      baseDamage = Math.floor(baseDamage * (1 + player.setBonuses.damagePercent / 100));
    }

    // Determine damage type from weapon bonuses (elemental weapons deal that type)
    let damageType = 'physical';
    if (player.equipment.weapon && player.equipment.weapon.bonuses) {
      const wb = player.equipment.weapon.bonuses;
      if (wb.fire_damage) damageType = 'fire';
      else if (wb.cold_damage) damageType = 'cold';
      else if (wb.poison_damage) damageType = 'poison';
    }

    return { damage: Math.max(1, baseDamage), isCrit, damageType };
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
    const { damage, isCrit, damageType } = this.calcPlayerDamage(player);
    const modifiedDamage = nearest.affixes ? modifyDamageByAffixes(nearest, damage) : damage;
    const dealt = nearest.takeDamage(modifiedDamage);

    // Set bonus: lifesteal
    if (dealt > 0 && player.setBonuses && player.setBonuses.lifestealPercent) {
      const heal = Math.floor(dealt * player.setBonuses.lifestealPercent / 100);
      player.hp = Math.min(player.maxHp, player.hp + heal);
    }

    const event = {
      type: 'combat:hit',
      attackerId: player.id,
      attackerName: player.name,
      targetId: nearest.id,
      targetName: nearest.name,
      damage: dealt,
      damageType,
      isCrit,
      targetHp: nearest.hp,
      targetMaxHp: nearest.maxHp,
    };
    this.events.push(event);

    // Check for kill
    if (!nearest.alive) {
      const loot = generateLoot(nearest.lootTier, nearest.type);

      // Set item drop chance
      const setDrop = rollSetDrop(nearest.floor || 0, nearest.isElite, nearest.eliteRank);
      if (setDrop) {
        const setItem = generateSetItem(setDrop.setId, setDrop.slot);
        if (setItem) loot.push(setItem);
      }

      const deathEvent = {
        type: 'combat:death',
        entityId: nearest.id,
        entityName: nearest.name,
        killedBy: player.id,
        killedByName: player.name,
        isBoss: nearest.isBoss,
        isElite: nearest.isElite || false,
        eliteRank: nearest.eliteRank || null,
        loot: loot.map(item => ({
          ...item,
          worldX: nearest.x + (Math.random() - 0.5) * 40,
          worldY: nearest.y + (Math.random() - 0.5) * 40,
        })),
        xpReward: nearest.xpReward,
      };

      // Affix on-death effects (fire_explosion etc.)
      if (nearest.affixes) {
        const affixDeathEvents = processAffixOnDeath(nearest);
        if (affixDeathEvents.length > 0) {
          deathEvent.affixEvents = affixDeathEvents;
        }
      }

      this.events.push(deathEvent);

      // Award XP and track kill (with set bonus)
      player.kills = (player.kills || 0) + 1;
      let xpReward = nearest.xpReward;
      if (player.setBonuses && player.setBonuses.xpPercent) {
        xpReward = Math.floor(xpReward * (1 + player.setBonuses.xpPercent / 100));
      }
      const levelResult = player.gainXp(xpReward);
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

    const skillDamageType = getSkillDamageType(skill.name);
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
            const isSpell = skill.name === 'Fireball' || skill.name === 'Frost Nova';
            let baseDmg = isSpell
              ? Math.floor(player.spellPower * skill.damage)
              : Math.floor(player.attackPower * skill.damage);
            // Set bonus: spell damage
            if (isSpell && player.setBonuses && player.setBonuses.spellDamagePercent) {
              baseDmg = Math.floor(baseDmg * (1 + player.setBonuses.spellDamagePercent / 100));
            }
            // Set bonus: flat damage percent
            if (player.setBonuses && player.setBonuses.damagePercent) {
              baseDmg = Math.floor(baseDmg * (1 + player.setBonuses.damagePercent / 100));
            }
            baseDmg = monster.affixes ? modifyDamageByAffixes(monster, baseDmg) : baseDmg;

            const dealt = monster.takeDamage(baseDmg);

            // Set bonus: lifesteal
            if (dealt > 0 && player.setBonuses && player.setBonuses.lifestealPercent) {
              const heal = Math.floor(dealt * player.setBonuses.lifestealPercent / 100);
              player.hp = Math.min(player.maxHp, player.hp + heal);
            }

            // Apply effects
            if (skill.effect === 'stun') monster.applyStun(skill.duration);
            if (skill.effect === 'slow') monster.applySlow(skill.duration);

            results.push({
              type: 'combat:hit',
              attackerId: player.id,
              targetId: monster.id,
              targetName: monster.name,
              damage: dealt,
              damageType: skillDamageType,
              isCrit: false,
              skillName: skill.name,
              targetHp: monster.hp,
              targetMaxHp: monster.maxHp,
            });

            if (!monster.alive) {
              player.kills = (player.kills || 0) + 1;
              const loot = generateLoot(monster.lootTier, monster.type);
              const setDrop = rollSetDrop(monster.floor || 0, monster.isElite, monster.eliteRank);
              if (setDrop) {
                const setItem = generateSetItem(setDrop.setId, setDrop.slot);
                if (setItem) loot.push(setItem);
              }
              const deathEvent = {
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
              };
              if (monster.isElite) {
                deathEvent.isElite = true;
                deathEvent.eliteRank = monster.eliteRank;
                deathEvent.affixEvents = processAffixOnDeath(monster);
              }
              results.push(deathEvent);
              let xpReward = monster.xpReward;
              if (player.setBonuses && player.setBonuses.xpPercent) {
                xpReward = Math.floor(xpReward * (1 + player.setBonuses.xpPercent / 100));
              }
              const levelResult = player.gainXp(xpReward);
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
          let baseDmg = Math.floor(player.attackPower * skill.damage);
          // Set bonus: flat damage percent
          if (player.setBonuses && player.setBonuses.damagePercent) {
            baseDmg = Math.floor(baseDmg * (1 + player.setBonuses.damagePercent / 100));
          }
          baseDmg = nearest.affixes ? modifyDamageByAffixes(nearest, baseDmg) : baseDmg;
          const dealt = nearest.takeDamage(baseDmg);
          if (skill.effect === 'stun') nearest.applyStun(skill.duration);

          // Set bonus: lifesteal
          if (dealt > 0 && player.setBonuses && player.setBonuses.lifestealPercent) {
            const heal = Math.floor(dealt * player.setBonuses.lifestealPercent / 100);
            player.hp = Math.min(player.maxHp, player.hp + heal);
          }

          results.push({
            type: 'combat:hit',
            attackerId: player.id,
            targetId: nearest.id,
            damage: dealt,
            damageType: skillDamageType,
            skillName: skill.name,
            targetHp: nearest.hp,
            targetMaxHp: nearest.maxHp,
          });

          if (!nearest.alive) {
            player.kills = (player.kills || 0) + 1;
            const loot = generateLoot(nearest.lootTier, nearest.type);
            const setDrop = rollSetDrop(nearest.floor || 0, nearest.isElite, nearest.eliteRank);
            if (setDrop) {
              const setItem = generateSetItem(setDrop.setId, setDrop.slot);
              if (setItem) loot.push(setItem);
            }
            const deathEvent = {
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
            };
            if (nearest.isElite) {
              deathEvent.isElite = true;
              deathEvent.eliteRank = nearest.eliteRank;
              deathEvent.affixEvents = processAffixOnDeath(nearest);
            }
            results.push(deathEvent);
            let xpReward = nearest.xpReward;
            if (player.setBonuses && player.setBonuses.xpPercent) {
              xpReward = Math.floor(xpReward * (1 + player.setBonuses.xpPercent / 100));
            }
            const levelResult = player.gainXp(xpReward);
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
          let baseDmg = Math.floor(player.attackPower * skill.damage);
          // Set bonus: flat damage percent
          if (player.setBonuses && player.setBonuses.damagePercent) {
            baseDmg = Math.floor(baseDmg * (1 + player.setBonuses.damagePercent / 100));
          }
          baseDmg = t.affixes ? modifyDamageByAffixes(t, baseDmg) : baseDmg;
          const dealt = t.takeDamage(baseDmg);

          // Set bonus: lifesteal
          if (dealt > 0 && player.setBonuses && player.setBonuses.lifestealPercent) {
            const heal = Math.floor(dealt * player.setBonuses.lifestealPercent / 100);
            player.hp = Math.min(player.maxHp, player.hp + heal);
          }

          results.push({
            type: 'combat:hit',
            attackerId: player.id,
            targetId: t.id,
            damage: dealt,
            damageType: skillDamageType,
            skillName: skill.name,
            targetHp: t.hp,
            targetMaxHp: t.maxHp,
          });

          if (!t.alive) {
            player.kills = (player.kills || 0) + 1;
            const loot = generateLoot(t.lootTier, t.type);
            const setDrop = rollSetDrop(t.floor || 0, t.isElite, t.eliteRank);
            if (setDrop) {
              const setItem = generateSetItem(setDrop.setId, setDrop.slot);
              if (setItem) loot.push(setItem);
            }
            const deathEvent = {
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
            };
            if (t.isElite) {
              deathEvent.isElite = true;
              deathEvent.eliteRank = t.eliteRank;
              deathEvent.affixEvents = processAffixOnDeath(t);
            }
            results.push(deathEvent);
            let xpReward = t.xpReward;
            if (player.setBonuses && player.setBonuses.xpPercent) {
              xpReward = Math.floor(xpReward * (1 + player.setBonuses.xpPercent / 100));
            }
            const levelResult = player.gainXp(xpReward);
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
          let baseDmg = Math.floor(player.attackPower * skill.damage);
          // Set bonus: flat damage percent
          if (player.setBonuses && player.setBonuses.damagePercent) {
            baseDmg = Math.floor(baseDmg * (1 + player.setBonuses.damagePercent / 100));
          }
          baseDmg = nearest.affixes ? modifyDamageByAffixes(nearest, baseDmg) : baseDmg;
          const dealt = nearest.takeDamage(baseDmg);
          // Set poison timer on monster
          nearest.poisonTick = skill.duration;
          nearest.poisonDamage = skill.tickDamage;

          // Set bonus: lifesteal
          if (dealt > 0 && player.setBonuses && player.setBonuses.lifestealPercent) {
            const heal = Math.floor(dealt * player.setBonuses.lifestealPercent / 100);
            player.hp = Math.min(player.maxHp, player.hp + heal);
          }

          results.push({
            type: 'combat:hit',
            attackerId: player.id,
            targetId: nearest.id,
            damage: dealt,
            damageType: skillDamageType,
            skillName: skill.name,
            effect: 'poison',
            targetHp: nearest.hp,
            targetMaxHp: nearest.maxHp,
          });

          if (!nearest.alive) {
            player.kills = (player.kills || 0) + 1;
            const loot = generateLoot(nearest.lootTier, nearest.type);
            const setDrop = rollSetDrop(nearest.floor || 0, nearest.isElite, nearest.eliteRank);
            if (setDrop) {
              const setItem = generateSetItem(setDrop.setId, setDrop.slot);
              if (setItem) loot.push(setItem);
            }
            const deathEvent = {
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
            };
            if (nearest.isElite) {
              deathEvent.isElite = true;
              deathEvent.eliteRank = nearest.eliteRank;
              deathEvent.affixEvents = processAffixOnDeath(nearest);
            }
            results.push(deathEvent);
            let xpReward = nearest.xpReward;
            if (player.setBonuses && player.setBonuses.xpPercent) {
              xpReward = Math.floor(xpReward * (1 + player.setBonuses.xpPercent / 100));
            }
            const levelResult = player.gainXp(xpReward);
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
  processMonsterAttack(event, players, monster) {
    const target = players.find(p => p.id === event.targetId);
    if (!target || !target.alive) return null;

    // Determine damage type: use event.damageType from monster, override for fire/cold enchanted
    let damageType = event.damageType || 'physical';
    if (monster && monster.fireEnchanted) damageType = 'fire';
    else if (monster && monster.coldEnchanted) damageType = 'cold';

    const dealt = target.takeDamage(event.damage, damageType);

    const hitEvent = {
      type: 'combat:hit',
      attackerId: event.monsterId,
      targetId: target.id,
      damage: dealt === -1 ? 0 : dealt,
      damageType,
      dodged: dealt === -1,
      attackType: event.attackType,
    };
    this.events.push(hitEvent);

    // Affix on-hit effects (fire DoT, cold slow)
    if (monster && monster.affixes && dealt > 0 && dealt !== -1) {
      processAffixOnHitPlayer(monster, target);

      // Vampiric healing (affix handles hp update internally)
      processAffixOnDealDamage(monster, dealt);
    }

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
