const { generateLoot } = require('./items');
const { modifyDamageByAffixes, processAffixOnHitPlayer, processAffixOnDealDamage, processAffixOnDeath } = require('./affixes');
const { applyResistance, getSkillDamageType, DAMAGE_TYPES } = require('./damage-types');
const { rollSetDrop, generateSetItem } = require('./sets');

/** Apply shatter bonus if target is stunned/frozen and player has the passive. */
function applyShatter(damage, player, target) {
  if (target.stunned > 0 && player.talentBonuses?.passives?.shatter_bonus) {
    return Math.floor(damage * (1 + player.talentBonuses.passives.shatter_bonus / 100));
  }
  return damage;
}

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

    // Talent passive: damage percent (e.g., Rampage +10%/rank)
    if (player.talentBonuses && player.talentBonuses.passives) {
      const tp = player.talentBonuses.passives;
      if (tp.damage_percent) {
        baseDamage = Math.floor(baseDamage * (1 + tp.damage_percent / 100));
      }
    }

    // Talent passive: crit damage percent (e.g., Piercing Shot +15%/rank)
    if (isCrit && player.talentBonuses && player.talentBonuses.passives) {
      const tp = player.talentBonuses.passives;
      if (tp.crit_damage_percent) {
        baseDamage = Math.floor(baseDamage * (1 + tp.crit_damage_percent / 100));
      }
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
  playerAttack(player, monsters, allPlayers) {
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
    let { damage, isCrit, damageType } = this.calcPlayerDamage(player);

    // Party aura buffs (str, attack_speed, xp_percent from Warlord/Beastmaster talents)
    const partyBuffs = allPlayers ? this.getPartyBuffs(allPlayers) : null;
    if (partyBuffs && partyBuffs.str > 0) {
      damage += partyBuffs.str;
    }
    // Attack speed aura: reduce cooldown (Warlord Commanding Presence), capped at 75%
    if (partyBuffs && partyBuffs.attack_speed > 0) {
      const haste = Math.min(partyBuffs.attack_speed, 75);
      player.attackCooldown = Math.max(50, Math.floor(player.attackCooldown * (1 - haste / 100)));
    }

    // Shatter bonus: extra damage to frozen/stunned targets (Phase 15.1)
    damage = applyShatter(damage, player, nearest);

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

    // Talent procs (e.g., bleed on_hit)
    if (player.talentBonuses && player.talentBonuses.procs && nearest.alive) {
      for (const proc of player.talentBonuses.procs) {
        if (proc.trigger === 'on_hit' && Math.random() < proc.chance) {
          if (proc.effect === 'bleed') {
            // Apply bleed DoT with separate bleed fields (Phase 15.2)
            const bleedDmg = Math.max(1, Math.floor(nearest.maxHp * 0.03));
            nearest.bleedTick = Math.max(nearest.bleedTick || 0, proc.duration || 3000);
            nearest.bleedDamage = Math.max(nearest.bleedDamage || 0, bleedDmg);
            this.events.push({
              type: 'combat:proc',
              attackerId: player.id,
              targetId: nearest.id,
              effect: 'bleed',
              damage: bleedDmg,
            });
          }
          if (proc.effect === 'execute') {
            // Execute: bonus damage to targets below threshold HP
            const hpPercent = nearest.hp / nearest.maxHp;
            if (hpPercent <= (proc.threshold_hp_percent || 30) / 100) {
              const bonusDmg = Math.floor(damage * ((proc.damage_multiplier || 2) - 1));
              nearest.takeDamage(bonusDmg, 'physical');
              this.events.push({
                type: 'combat:proc', attackerId: player.id, targetId: nearest.id,
                effect: 'execute', damage: bonusDmg,
              });
            }
          }
          if (proc.effect === 'sniper') {
            // Sniper: bonus damage to full-HP targets
            if (nearest.hp === nearest.maxHp) {
              const bonusDmg = Math.floor(damage * ((proc.damage_multiplier || 3) - 1));
              nearest.takeDamage(bonusDmg, 'physical');
              this.events.push({
                type: 'combat:proc', attackerId: player.id, targetId: nearest.id,
                effect: 'sniper', damage: bonusDmg,
              });
            }
          }
        }
      }
    }

    // Check for kill
    if (!nearest.alive) {
      const loot = generateLoot(nearest.lootTier, nearest.type, nearest.floor || 0, nearest.goldMult || 1.0);

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

      // Award keystone for boss kill on floor 3+ (use monster's floor, not player's)
      if (nearest.isBoss && (nearest.floor || 0) >= 3) {
        const keystones = player.difficulty === 'hell' ? 2 : 1;
        player.addKeystones(keystones);
        deathEvent.keystoneReward = keystones;
      }

      this.events.push(deathEvent);

      // Award XP and track kill (with set bonus)
      player.kills = (player.kills || 0) + 1;
      let xpReward = nearest.xpReward;
      if (player.setBonuses && player.setBonuses.xpPercent) {
        xpReward = Math.floor(xpReward * (1 + player.setBonuses.xpPercent / 100));
      }
      // Party aura: XP bonus (Warlord Inspire talent)
      if (partyBuffs && partyBuffs.xp_percent > 0) {
        xpReward = Math.floor(xpReward * (1 + partyBuffs.xp_percent / 100));
      }
      // On-kill talent procs (Bloodbath heal, etc.)
      if (player.talentBonuses && player.talentBonuses.procs) {
        for (const proc of player.talentBonuses.procs) {
          if (proc.trigger === 'on_kill' && Math.random() < (proc.chance ?? 1)) {
            if (proc.effect === 'heal_percent') {
              const heal = Math.floor(player.maxHp * (proc.value || 15) / 100);
              player.hp = Math.min(player.maxHp, player.hp + heal);
              this.events.push({ type: 'combat:proc', targetId: player.id, attackerId: player.id, effect: 'heal_on_kill', heal });
            }
          }
        }
      }

      const levelResult = player.gainXp(xpReward);
      if (levelResult) {
        this.events.push({
          type: 'player:levelup',
          playerId: player.id,
          playerName: player.name,
          level: levelResult.level,
          isParagon: levelResult.isParagon || false,
          paragonLevel: levelResult.paragonLevel || 0,
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
    const skillPartyBuffs = allPlayers ? this.getPartyBuffs(allPlayers) : null;

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
            // Talent passive: spell damage percent (e.g., Combustion +12%/rank)
            if (isSpell && player.talentBonuses && player.talentBonuses.passives) {
              const tp = player.talentBonuses.passives;
              if (tp.spell_damage_percent) {
                baseDmg = Math.floor(baseDmg * (1 + tp.spell_damage_percent / 100));
              }
            }
            // Set bonus: flat damage percent
            if (player.setBonuses && player.setBonuses.damagePercent) {
              baseDmg = Math.floor(baseDmg * (1 + player.setBonuses.damagePercent / 100));
            }
            // Talent passive: damage percent (e.g., Rampage +10%/rank)
            if (player.talentBonuses && player.talentBonuses.passives) {
              const tp = player.talentBonuses.passives;
              if (tp.damage_percent) {
                baseDmg = Math.floor(baseDmg * (1 + tp.damage_percent / 100));
              }
            }
            baseDmg = applyShatter(baseDmg, player, monster);
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
              const loot = generateLoot(monster.lootTier, monster.type, monster.floor || 0, monster.goldMult || 1.0);
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
              // Party aura: XP bonus (Warlord Inspire)
              if (skillPartyBuffs && skillPartyBuffs.xp_percent > 0) {
                xpReward = Math.floor(xpReward * (1 + skillPartyBuffs.xp_percent / 100));
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
          // Talent passive: damage percent (e.g., Rampage +10%/rank)
          if (player.talentBonuses && player.talentBonuses.passives) {
            const tp = player.talentBonuses.passives;
            if (tp.damage_percent) {
              baseDmg = Math.floor(baseDmg * (1 + tp.damage_percent / 100));
            }
          }
          baseDmg = applyShatter(baseDmg, player, nearest);
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
            const loot = generateLoot(nearest.lootTier, nearest.type, nearest.floor || 0, nearest.goldMult || 1.0);
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
            // Party aura: XP bonus (Warlord Inspire)
            if (allPlayers) {
              const pb = this.getPartyBuffs(allPlayers);
              if (pb.xp_percent > 0) xpReward = Math.floor(xpReward * (1 + pb.xp_percent / 100));
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
          // Talent passive: damage percent (e.g., Rampage +10%/rank)
          if (player.talentBonuses && player.talentBonuses.passives) {
            const tp = player.talentBonuses.passives;
            if (tp.damage_percent) {
              baseDmg = Math.floor(baseDmg * (1 + tp.damage_percent / 100));
            }
          }
          baseDmg = applyShatter(baseDmg, player, t);
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
            const loot = generateLoot(t.lootTier, t.type, t.floor || 0, t.goldMult || 1.0);
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
            // Party aura: XP bonus (Warlord Inspire)
            if (allPlayers) {
              const pb = this.getPartyBuffs(allPlayers);
              if (pb.xp_percent > 0) xpReward = Math.floor(xpReward * (1 + pb.xp_percent / 100));
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
          // Talent passive: damage percent (e.g., Rampage +10%/rank)
          if (player.talentBonuses && player.talentBonuses.passives) {
            const tp = player.talentBonuses.passives;
            if (tp.damage_percent) {
              baseDmg = Math.floor(baseDmg * (1 + tp.damage_percent / 100));
            }
          }
          baseDmg = applyShatter(baseDmg, player, nearest);
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
            const loot = generateLoot(nearest.lootTier, nearest.type, nearest.floor || 0, nearest.goldMult || 1.0);
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
            // Party aura: XP bonus (Warlord Inspire)
            if (allPlayers) {
              const pb = this.getPartyBuffs(allPlayers);
              if (pb.xp_percent > 0) xpReward = Math.floor(xpReward * (1 + pb.xp_percent / 100));
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

    const dodged = dealt === -1;

    // ── Defensive talent procs (Phase 15.0) ──
    if (target.talentBonuses && target.talentBonuses.procs) {
      for (const proc of target.talentBonuses.procs) {
        if (proc.trigger === 'on_take_damage' && !dodged && dealt > 0 && Math.random() < (proc.chance ?? 1)) {
          if (proc.effect === 'block') {
            // Shield Wall: block 50% of damage (refund to HP)
            const blocked = Math.floor(dealt * 0.5);
            target.hp = Math.min(target.maxHp, target.hp + blocked);
            this.events.push({ type: 'combat:proc', targetId: target.id, effect: 'block', value: blocked });
          }
          if (proc.effect === 'last_stand' && target.hp > 0 && target.hp / target.maxHp <= 0.2) {
            // Last Stand: below 20% HP → damage reduction for 5s
            target.lastStandTimer = Math.max(target.lastStandTimer || 0, proc.duration || 5000);
            this.events.push({ type: 'combat:proc', targetId: target.id, effect: 'last_stand' });
          }
          if (proc.effect === 'freeze' && monster) {
            // Ice Barrier: freeze attacker
            monster.stunned = Math.max(monster.stunned || 0, proc.duration || 2000);
            this.events.push({ type: 'combat:proc', targetId: target.id, attackerId: monster.id, effect: 'freeze' });
          }
        }
        if (proc.trigger === 'on_dodge' && dodged && Math.random() < (proc.chance ?? 1)) {
          if (proc.effect === 'slow' && monster) {
            // Caltrops: slow attacker on dodge
            monster.slowed = Math.max(monster.slowed || 0, proc.duration || 3000);
            this.events.push({ type: 'combat:proc', targetId: target.id, attackerId: monster.id, effect: 'caltrops' });
          }
        }
      }
    }

    // Last Stand DR: if active, refund 50% of damage taken
    if (!dodged && dealt > 0 && (target.lastStandTimer || 0) > 0) {
      const dr = Math.floor(dealt * 0.5);
      target.hp = Math.min(target.maxHp, target.hp + dr);
    }

    const hitEvent = {
      type: 'combat:hit',
      attackerId: event.monsterId,
      targetId: target.id,
      damage: dodged ? 0 : dealt,
      damageType,
      dodged,
      attackType: event.attackType,
    };
    this.events.push(hitEvent);

    // Affix on-hit effects (fire DoT, cold slow)
    if (monster && monster.affixes && dealt > 0 && !dodged) {
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

  // Process bleed ticks on monsters (separate from poison — Phase 15.2)
  processBleed(monster, dt) {
    if (monster.bleedTick > 0 && monster.alive) {
      monster.bleedTick -= dt;
      // Apply damage every 1 second (same pattern as processPoison)
      if (Math.floor((monster.bleedTick + dt) / 1000) > Math.floor(monster.bleedTick / 1000)) {
        const dealt = monster.takeDamage(monster.bleedDamage || 5);
        this.events.push({
          type: 'combat:hit',
          attackerId: 'bleed',
          targetId: monster.id,
          damage: dealt,
          damageType: 'physical',
          attackType: 'bleed_tick',
        });
      }
    }
  }

  // Aggregate party aura buffs from all players' talent bonuses
  // Talent aura stats: str, xp_percent, attack_speed, move_speed
  getPartyBuffs(players) {
    const buffs = { str: 0, xp_percent: 0, attack_speed: 0, move_speed: 0 };
    if (!players) return buffs;
    for (const p of players) {
      if (p.talentBonuses && p.talentBonuses.auras) {
        for (const aura of p.talentBonuses.auras) {
          if (aura.party && aura.stat in buffs) {
            buffs[aura.stat] += aura.value;
          }
        }
      }
    }
    return buffs;
  }
}

module.exports = { CombatSystem };
