const { generateLoot } = require('./items');
const { modifyDamageByAffixes, processAffixOnDeath } = require('./affixes');
const { getSkillDamageType } = require('./damage-types');
const { rollSetDrop, generateSetItem } = require('./sets');
const { getDamageMult, getLevel5Bonus } = require('./skill-levels');

/** Apply shatter bonus if target is stunned/frozen and player has the passive. */
function applyShatter(damage, player, target) {
  if (target.stunned > 0 && player.talentBonuses?.passives?.shatter_bonus) {
    return Math.floor(damage * (1 + player.talentBonuses.passives.shatter_bonus / 100));
  }
  return damage;
}

// ── Shared helpers ──────────────────────────────────────────────────

/**
 * Calculate skill damage applying set bonuses, talent passives, shatter, and affix mod.
 * @param {object} player
 * @param {object} skill      - the skill definition (needs .name, .damage)
 * @param {number} baseDmg    - raw base damage before bonuses
 * @param {object} monster    - target (for shatter + affix checks)
 * @returns {number} final damage value
 */
function calcSkillDamage(player, skill, baseDmg, monster, skillLevel) {
  // Skill level damage scaling (+15% per level above 1)
  baseDmg = Math.floor(baseDmg * getDamageMult(skillLevel || 1));

  const isSpell = skill.useSpellPower === true;

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

  return baseDmg;
}

/**
 * Apply set bonus lifesteal to player based on damage dealt.
 */
function applyLifesteal(player, dealt) {
  if (dealt > 0 && player.setBonuses && player.setBonuses.lifestealPercent) {
    const heal = Math.floor(dealt * player.setBonuses.lifestealPercent / 100);
    player.hp = Math.min(player.maxHp, player.hp + heal);
  }
}

/**
 * Handle a skill kill: increment kills, generate loot, roll set drop,
 * build death event (including elite data + affixEvents), calculate XP
 * with set bonus + party aura, call gainXp, push levelup event.
 *
 * @param {object}   player
 * @param {object}   monster
 * @param {object[]} results    - array to push death/levelup events into
 * @param {object}   partyBuffs - aggregated party aura buffs
 */
function handleSkillKill(player, monster, results, partyBuffs) {
  player.kills = (player.kills || 0) + 1;

  const hcBonus = player.hardcore ? 1 : 0;
  const loot = generateLoot(monster.lootTier + hcBonus, monster.type, monster.floor || 0, monster.goldMult || 1.0);
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
    killedByName: player.name,
    isBoss: monster.isBoss,
    isElite: monster.isElite || false,
    eliteRank: monster.eliteRank || null,
    loot: loot.map(item => ({
      ...item,
      worldX: monster.x + (Math.random() - 0.5) * 40,
      worldY: monster.y + (Math.random() - 0.5) * 40,
    })),
    xpReward: monster.xpReward,
  };

  // Affix on-death effects
  if (monster.affixes) {
    const affixDeathEvents = processAffixOnDeath(monster);
    if (affixDeathEvents.length > 0) {
      deathEvent.affixEvents = affixDeathEvents;
    }
  }

  // Award keystone for boss kill on floor 3+
  if (monster.isBoss && (monster.floor || 0) >= 3) {
    const keystones = player.difficulty === 'hell' ? 2 : 1;
    player.addKeystones(keystones);
    deathEvent.keystoneReward = keystones;
  }

  results.push(deathEvent);

  // XP calculation with set bonus + party aura
  let xpReward = monster.xpReward;
  if (player.setBonuses && player.setBonuses.xpPercent) {
    xpReward = Math.floor(xpReward * (1 + player.setBonuses.xpPercent / 100));
  }
  if (partyBuffs && partyBuffs.xp_percent > 0) {
    xpReward = Math.floor(xpReward * (1 + partyBuffs.xp_percent / 100));
  }

  // On-kill talent procs (Bloodbath heal, spirit wolf summon)
  if (player.talentBonuses && player.talentBonuses.procs) {
    for (const proc of player.talentBonuses.procs) {
      if (proc.trigger === 'on_kill' && Math.random() < (proc.chance ?? 1)) {
        if (proc.effect === 'heal_percent') {
          const heal = Math.floor(player.maxHp * (proc.value || 15) / 100);
          player.hp = Math.min(player.maxHp, player.hp + heal);
          results.push({ type: 'combat:proc', targetId: player.id, attackerId: player.id, effect: 'heal_on_kill', heal });
        } else if (proc.effect === 'summon_spirit_wolf') {
          results.push({
            type: 'summon:spirit_wolf',
            playerId: player.id,
            x: monster.x,
            y: monster.y,
          });
        }
      }
    }
  }

  const levelResult = player.gainXp(xpReward);
  if (levelResult) {
    results.push({
      type: 'player:levelup',
      playerId: player.id,
      playerName: player.name,
      level: levelResult.level,
      isParagon: levelResult.isParagon || false,
      paragonLevel: levelResult.paragonLevel || 0,
    });
  }
}

// ── Per-type handler functions ──────────────────────────────────────

/**
 * AOE skill: damage all monsters within skill.radius.
 * Spells (useSpellPower=true) use spellPower; others use attackPower.
 * Applies stun/slow effects based on skill.effect / skill.duration.
 */
function executeAoe(player, skill, monsters, partyBuffs, skillDamageType, skillLevel = 1) {
  const results = [];

  for (const monster of monsters) {
    if (!monster.alive) continue;
    const dx = monster.x - player.x;
    const dy = monster.y - player.y;
    const dist = Math.sqrt(dx * dx + dy * dy);
    if (dist <= skill.radius) {
      const isSpell = skill.useSpellPower === true;
      let baseDmg = isSpell
        ? Math.floor(player.spellPower * skill.damage)
        : Math.floor(player.attackPower * skill.damage);

      baseDmg = calcSkillDamage(player, skill, baseDmg, monster, skillLevel);
      const dealt = monster.takeDamage(baseDmg);

      applyLifesteal(player, dealt);

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
        handleSkillKill(player, monster, results, partyBuffs);
      }
    }
  }

  return results;
}

/**
 * Single-target skill: hits nearest monster within attackRange * 1.5.
 * Applies stun if skill.effect === 'stun'.
 */
function executeSingle(player, skill, monsters, partyBuffs, skillDamageType, skillLevel = 1) {
  const results = [];

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
    baseDmg = calcSkillDamage(player, skill, baseDmg, nearest, skillLevel);
    const dealt = nearest.takeDamage(baseDmg);
    if (skill.effect === 'stun') nearest.applyStun(skill.duration);

    applyLifesteal(player, dealt);

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
      handleSkillKill(player, nearest, results, partyBuffs);
    }
  }

  return results;
}

/**
 * Multi-target skill: all alive monsters within dist <= 200,
 * sorted by distance, takes min(skill.count, targets.length).
 */
function executeMulti(player, skill, monsters, partyBuffs, skillDamageType, skillLevel = 1) {
  const results = [];

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
    baseDmg = calcSkillDamage(player, skill, baseDmg, t, skillLevel);
    const dealt = t.takeDamage(baseDmg);

    applyLifesteal(player, dealt);

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
      handleSkillKill(player, t, results, partyBuffs);
    }
  }

  return results;
}

/**
 * DoT skill: nearest monster within 200.
 * Sets poisonTick / poisonDamage on target. Adds effect: 'poison' to hit event.
 */
function executeDot(player, skill, monsters, partyBuffs, skillDamageType, skillLevel = 1) {
  const results = [];

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
    baseDmg = calcSkillDamage(player, skill, baseDmg, nearest, skillLevel);
    const dealt = nearest.takeDamage(baseDmg);
    // Set poison timer on monster
    nearest.poisonTick = skill.duration;
    nearest.poisonDamage = skill.tickDamage;

    applyLifesteal(player, dealt);

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
      handleSkillKill(player, nearest, results, partyBuffs);
    }
  }

  return results;
}

/**
 * Buff skill: self-targeted buff.
 * Pushes buff to target.buffs[].
 */
function executeBuff(player, skill, allPlayers, skillLevel = 1) {
  const results = [];

  const targets = [player];
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

  return results;
}

/**
 * Spin attack: instant multi-hit AOE. All monsters within radius take
 * skill.hits ticks of damage. Each hit is skill.damage * attackPower.
 */
function executeSpin(player, skill, monsters, partyBuffs, skillDamageType, skillLevel = 1) {
  const results = [];
  const l5 = getLevel5Bonus(skill.name, skillLevel);
  const totalHits = skill.hits + (l5 && l5.extraHits ? l5.extraHits : 0);

  results.push({
    type: 'effect:spawn',
    effectType: 'whirlwind',
    playerId: player.id,
    x: player.x,
    y: player.y,
    radius: skill.radius,
    duration: skill.spinDuration,
  });

  for (const monster of monsters) {
    if (!monster.alive) continue;
    const dx = monster.x - player.x;
    const dy = monster.y - player.y;
    const dist = Math.sqrt(dx * dx + dy * dy);
    if (dist > skill.radius) continue;

    for (let hit = 0; hit < totalHits; hit++) {
      if (!monster.alive) break;
      let baseDmg = Math.floor(player.attackPower * skill.damage);
      baseDmg = calcSkillDamage(player, skill, baseDmg, monster, skillLevel);
      const dealt = monster.takeDamage(baseDmg);
      applyLifesteal(player, dealt);

      results.push({
        type: 'combat:hit',
        attackerId: player.id,
        targetId: monster.id,
        targetName: monster.name,
        damage: dealt,
        damageType: skillDamageType,
        isCrit: false,
        skillName: skill.name,
        hitIndex: hit,
        targetHp: monster.hp,
        targetMaxHp: monster.maxHp,
      });

      if (!monster.alive) {
        handleSkillKill(player, monster, results, partyBuffs);
      }
    }
  }

  return results;
}

/**
 * Charging Strike: dash toward nearest monster (or forward if none).
 * Trail damage to monsters along the path, main damage + stun on target.
 */
function executeCharge(player, skill, monsters, partyBuffs, skillDamageType, skillLevel = 1) {
  const results = [];
  const startX = player.x;
  const startY = player.y;

  let target = null;
  let targetDist = Infinity;
  for (const monster of monsters) {
    if (!monster.alive) continue;
    const dist = Math.sqrt((monster.x - player.x) ** 2 + (monster.y - player.y) ** 2);
    if (dist <= skill.range && dist < targetDist) {
      target = monster;
      targetDist = dist;
    }
  }

  let endX, endY;
  if (target) {
    endX = target.x;
    endY = target.y;
  } else {
    const dirMap = { up: [0, -1], down: [0, 1], left: [-1, 0], right: [1, 0] };
    const dir = dirMap[player.facing] || [0, 1];
    endX = player.x + dir[0] * skill.range;
    endY = player.y + dir[1] * skill.range;
  }

  endX = Math.max(16, Math.min(1904, endX));
  endY = Math.max(16, Math.min(1264, endY));
  player.x = endX;
  player.y = endY;

  results.push({
    type: 'effect:spawn',
    effectType: 'charge_dash',
    playerId: player.id,
    fromX: startX,
    fromY: startY,
    toX: endX,
    toY: endY,
  });

  // Trail damage: sample 10 points along path
  const trailHitIds = new Set();
  const trailRadius = 40;
  for (let s = 0; s <= 10; s++) {
    const t = s / 10;
    const sx = startX + (endX - startX) * t;
    const sy = startY + (endY - startY) * t;

    for (const monster of monsters) {
      if (!monster.alive || monster === target) continue;
      if (trailHitIds.has(monster.id)) continue;
      const dx = monster.x - sx;
      const dy = monster.y - sy;
      if (Math.sqrt(dx * dx + dy * dy) <= trailRadius) {
        trailHitIds.add(monster.id);
        let baseDmg = Math.floor(player.attackPower * skill.trailDamage);
        baseDmg = calcSkillDamage(player, skill, baseDmg, monster, skillLevel);
        const dealt = monster.takeDamage(baseDmg);
        applyLifesteal(player, dealt);
        results.push({
          type: 'combat:hit',
          attackerId: player.id,
          targetId: monster.id,
          targetName: monster.name,
          damage: dealt,
          damageType: skillDamageType,
          skillName: skill.name,
          isTrail: true,
          targetHp: monster.hp,
          targetMaxHp: monster.maxHp,
        });
        if (!monster.alive) handleSkillKill(player, monster, results, partyBuffs);
      }
    }
  }

  // Level 5 bonus: stun trail targets on impact
  const l5 = getLevel5Bonus(skill.name, skillLevel);
  if (l5 && l5.stunOnImpact) {
    for (const monster of monsters) {
      if (!monster.alive || !trailHitIds.has(monster.id)) continue;
      monster.stunned = (monster.stunned || 0) + l5.stunOnImpact;
    }
  }

  // Primary target: full damage + stun
  if (target && target.alive) {
    let baseDmg = Math.floor(player.attackPower * skill.damage);
    baseDmg = calcSkillDamage(player, skill, baseDmg, target, skillLevel);
    const dealt = target.takeDamage(baseDmg);
    if (skill.effect === 'stun') target.applyStun(skill.duration);
    applyLifesteal(player, dealt);
    results.push({
      type: 'combat:hit',
      attackerId: player.id,
      targetId: target.id,
      targetName: target.name,
      damage: dealt,
      damageType: skillDamageType,
      skillName: skill.name,
      targetHp: target.hp,
      targetMaxHp: target.maxHp,
    });
    if (!target.alive) handleSkillKill(player, target, results, partyBuffs);
  }

  return results;
}

/**
 * Buff+Debuff hybrid (Battle Shout): party buff + fear nearby monsters.
 */
function executeBuffDebuff(player, skill, monsters, allPlayers, skillLevel = 1) {
  const results = [];
  const l5 = getLevel5Bonus(skill.name, skillLevel);

  const targets = allPlayers || [player];
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

  // L5 bonus: party crit buff
  if (l5 && l5.partyCrit) {
    for (const p of targets) {
      if (!p.alive) continue;
      p.buffs.push({ effect: 'crit_up', value: l5.partyCrit, remaining: skill.duration });
      results.push({
        type: 'buff:apply',
        targetId: p.id,
        effect: 'crit_up',
        value: l5.partyCrit,
        duration: skill.duration,
      });
    }
  }

  if (skill.fearRadius && skill.fearDuration) {
    for (const monster of monsters) {
      if (!monster.alive) continue;
      const dx = monster.x - player.x;
      const dy = monster.y - player.y;
      if (Math.sqrt(dx * dx + dy * dy) <= skill.fearRadius) {
        monster.applyFear(skill.fearDuration);
        results.push({
          type: 'debuff:apply',
          targetId: monster.id,
          targetName: monster.name,
          effect: 'fear',
          duration: skill.fearDuration,
          skillName: skill.name,
        });
      }
    }
  }

  results.push({
    type: 'effect:spawn',
    effectType: 'battle_shout',
    playerId: player.id,
    x: player.x,
    y: player.y,
    radius: skill.fearRadius,
  });

  return results;
}

/**
 * Volley skill (Arrow Volley): fire multiple projectiles in a cone.
 * Emits projectile:create events for the game loop to spawn actual Projectile objects.
 */
function executeVolley(player, skill, monsters, partyBuffs, skillDamageType, skillLevel = 1) {
  const results = [];
  const l5 = getLevel5Bonus(skill.name, skillLevel);

  // Find nearest monster to aim at
  let targetAngle;
  let nearest = null;
  let nearestDist = Infinity;
  for (const monster of monsters) {
    if (!monster.alive) continue;
    const dist = Math.sqrt((monster.x - player.x) ** 2 + (monster.y - player.y) ** 2);
    if (dist <= skill.range && dist < nearestDist) {
      nearest = monster;
      nearestDist = dist;
    }
  }

  if (nearest) {
    targetAngle = Math.atan2(nearest.y - player.y, nearest.x - player.x);
  } else {
    // No target — fire in facing direction
    const dirMap = { up: -Math.PI / 2, down: Math.PI / 2, left: Math.PI, right: 0 };
    targetAngle = dirMap[player.facing] || 0;
  }

  // Spawn projectiles in a cone
  const spreadRad = (skill.spreadAngle * Math.PI) / 180;
  const count = (skill.projectileCount || 5) + (l5 && l5.extraProjectiles ? l5.extraProjectiles : 0);
  for (let i = 0; i < count; i++) {
    const offset = count <= 1 ? 0 : spreadRad * ((i / (count - 1)) - 0.5);
    const angle = targetAngle + offset;
    const projDamage = Math.floor(player.attackPower * skill.damage * getDamageMult(skillLevel));

    results.push({
      type: 'projectile:create',
      ownerId: player.id,
      x: player.x,
      y: player.y,
      angle,
      speed: skill.speed || 450,
      damage: projDamage,
      damageType: skillDamageType,
      piercing: skill.piercing || false,
      visual: 'arrow',
      skillName: skill.name,
    });
  }

  results.push({
    type: 'effect:spawn',
    effectType: 'arrow_volley',
    playerId: player.id,
    x: player.x,
    y: player.y,
    angle: targetAngle,
    count,
  });

  return results;
}

/**
 * Sniper Shot: fire a single heavy piercing projectile.
 * Emits one projectile:create event. Slow speed but pierces ALL targets.
 */
function executeSniper(player, skill, monsters, partyBuffs, skillDamageType, skillLevel = 1) {
  const results = [];

  // Find nearest monster to aim at
  let targetAngle;
  let nearest = null;
  let nearestDist = Infinity;
  for (const monster of monsters) {
    if (!monster.alive) continue;
    const dist = Math.sqrt((monster.x - player.x) ** 2 + (monster.y - player.y) ** 2);
    if (dist <= skill.range && dist < nearestDist) {
      nearest = monster;
      nearestDist = dist;
    }
  }

  if (nearest) {
    targetAngle = Math.atan2(nearest.y - player.y, nearest.x - player.x);
  } else {
    const dirMap = { up: -Math.PI / 2, down: Math.PI / 2, left: Math.PI, right: 0 };
    targetAngle = dirMap[player.facing] || 0;
  }

  const projDamage = Math.floor(player.attackPower * skill.damage * getDamageMult(skillLevel));
  const l5 = getLevel5Bonus(skill.name, skillLevel);

  results.push({
    type: 'projectile:create',
    ownerId: player.id,
    x: player.x,
    y: player.y,
    angle: targetAngle,
    speed: skill.speed || 200,
    damage: projDamage,
    damageType: skillDamageType,
    piercing: true,
    visual: 'sniper',
    skillName: skill.name,
    lifetime: 3000,
    guaranteedCrit: !!(l5 && l5.guaranteedCrit),
  });

  results.push({
    type: 'effect:spawn',
    effectType: 'sniper_shot',
    playerId: player.id,
    x: player.x,
    y: player.y,
    angle: targetAngle,
  });

  return results;
}

/**
 * Shadow Step: teleport in facing direction, gain dodge buff, leave shadow decoy.
 * The decoy is a friendly "monster" that draws aggro for decoyDuration.
 */
function executeShadowStep(player, skill, monsters, allPlayers, skillLevel = 1) {
  const results = [];
  const startX = player.x;
  const startY = player.y;
  const l5 = getLevel5Bonus(skill.name, skillLevel);
  const decoyCount = 1 + (l5 && l5.extraDecoys ? l5.extraDecoys : 0);

  // Teleport in facing direction
  const dirMap = { up: [0, -1], down: [0, 1], left: [-1, 0], right: [1, 0] };
  const dir = dirMap[player.facing] || [0, 0];
  player.x += dir[0] * skill.range;
  player.y += dir[1] * skill.range;
  // Clamp to world bounds
  player.x = Math.max(16, Math.min(1904, player.x));
  player.y = Math.max(16, Math.min(1264, player.y));

  // Apply dodge buff (100% dodge for dodgeDuration)
  player.buffs.push({
    effect: 'dodge_up',
    duration: skill.dodgeDuration,
    remaining: skill.dodgeDuration,
  });

  results.push({
    type: 'buff:apply',
    playerId: player.id,
    effect: 'dodge_up',
    duration: skill.dodgeDuration,
    skillName: skill.name,
  });

  // Spawn shadow decoy(s) at original position
  for (let d = 0; d < decoyCount; d++) {
    results.push({
      type: 'summon:shadow_decoy',
      playerId: player.id,
      x: startX + (d > 0 ? (Math.random() - 0.5) * 40 : 0),
      y: startY + (d > 0 ? (Math.random() - 0.5) * 40 : 0),
      duration: skill.decoyDuration,
    });
  }

  // Teleport visual
  results.push({
    type: 'effect:spawn',
    effectType: 'shadow_step',
    playerId: player.id,
    fromX: startX,
    fromY: startY,
    toX: player.x,
    toY: player.y,
  });

  return results;
}

/**
 * Meteor Strike: fire a projectile that explodes on impact (AOE).
 * Emits projectile:create event with aoeRadius. Uses spellPower.
 */
function executeMeteor(player, skill, monsters, partyBuffs, skillDamageType, skillLevel = 1) {
  const results = [];

  // Find nearest monster to aim at
  let targetAngle;
  let nearest = null;
  let nearestDist = Infinity;
  for (const monster of monsters) {
    if (!monster.alive) continue;
    const dist = Math.sqrt((monster.x - player.x) ** 2 + (monster.y - player.y) ** 2);
    if (dist <= skill.range && dist < nearestDist) {
      nearest = monster;
      nearestDist = dist;
    }
  }

  if (nearest) {
    targetAngle = Math.atan2(nearest.y - player.y, nearest.x - player.x);
  } else {
    const dirMap = { up: -Math.PI / 2, down: Math.PI / 2, left: Math.PI, right: 0 };
    targetAngle = dirMap[player.facing] || 0;
  }

  const projDamage = Math.floor(player.spellPower * skill.damage * getDamageMult(skillLevel));
  const l5 = getLevel5Bonus(skill.name, skillLevel);

  results.push({
    type: 'projectile:create',
    ownerId: player.id,
    x: player.x,
    y: player.y,
    angle: targetAngle,
    speed: skill.speed || 350,
    damage: projDamage,
    damageType: skillDamageType,
    piercing: false,
    aoeRadius: skill.aoeRadius || 80,
    visual: 'fireball',
    skillName: skill.name,
    burningGround: !!(l5 && l5.burningGround),
    burnDamage: l5 ? l5.burnDamage : 0,
    burnDuration: l5 ? l5.burnDuration : 0,
  });

  results.push({
    type: 'effect:spawn',
    effectType: 'meteor_cast',
    playerId: player.id,
    x: player.x,
    y: player.y,
    angle: targetAngle,
  });

  return results;
}

/**
 * Blizzard: AOE around player with multiple damage ticks + slow.
 * Uses spellPower. Hits all monsters in radius, applies slow.
 */
function executeBlizzard(player, skill, monsters, partyBuffs, skillDamageType, skillLevel = 1) {
  const results = [];
  const l5 = getLevel5Bonus(skill.name, skillLevel);

  results.push({
    type: 'effect:spawn',
    effectType: 'blizzard',
    playerId: player.id,
    x: player.x,
    y: player.y,
    radius: skill.radius,
    hits: skill.hits,
  });

  for (const monster of monsters) {
    if (!monster.alive) continue;
    const dx = monster.x - player.x;
    const dy = monster.y - player.y;
    const dist = Math.sqrt(dx * dx + dy * dy);
    if (dist > skill.radius) continue;

    for (let hit = 0; hit < skill.hits; hit++) {
      if (!monster.alive) break;
      let baseDmg = Math.floor(player.spellPower * skill.damage);
      baseDmg = calcSkillDamage(player, skill, baseDmg, monster, skillLevel);
      const dealt = monster.takeDamage(baseDmg);
      applyLifesteal(player, dealt);

      results.push({
        type: 'combat:hit',
        attackerId: player.id,
        targetId: monster.id,
        targetName: monster.name,
        damage: dealt,
        damageType: skillDamageType,
        isCrit: false,
        skillName: skill.name,
        hitIndex: hit,
        targetHp: monster.hp,
        targetMaxHp: monster.maxHp,
      });

      if (!monster.alive) {
        handleSkillKill(player, monster, results, partyBuffs);
      }
    }

    // Apply slow (or freeze at Level 5) after all hits
    if (monster.alive && skill.effect === 'slow') {
      if (l5 && l5.freezeInsteadOfSlow) {
        monster.stunned = (monster.stunned || 0) + l5.freezeDuration;
      } else {
        monster.applySlow(skill.duration);
      }
    }
  }

  return results;
}

/**
 * Chain Lightning: bounces between targets with damage falloff.
 * Uses spellPower. Finds nearest target, chains to next nearest within chainRange.
 */
function executeChain(player, skill, monsters, partyBuffs, skillDamageType, skillLevel = 1) {
  const results = [];
  const hitIds = new Set();
  const l5 = getLevel5Bonus(skill.name, skillLevel);

  // Find initial target (nearest within range)
  let current = null;
  let currentDist = Infinity;
  for (const monster of monsters) {
    if (!monster.alive) continue;
    const dist = Math.sqrt((monster.x - player.x) ** 2 + (monster.y - player.y) ** 2);
    if (dist <= skill.range && dist < currentDist) {
      current = monster;
      currentDist = dist;
    }
  }

  if (!current) return results;

  let currentDamage = Math.floor(player.spellPower * skill.damage);
  let sourceX = player.x;
  let sourceY = player.y;
  let bounceCount = 0;

  const maxBounces = (skill.maxBounces || 4) + (l5 && l5.extraBounces ? l5.extraBounces : 0);
  while (current && bounceCount < maxBounces) {
    hitIds.add(current.id);

    let dmg = currentDamage;
    dmg = calcSkillDamage(player, skill, dmg, current, skillLevel);
    const dealt = current.takeDamage(dmg);
    applyLifesteal(player, dealt);

    results.push({
      type: 'combat:hit',
      attackerId: player.id,
      targetId: current.id,
      targetName: current.name,
      damage: dealt,
      damageType: skillDamageType,
      isCrit: false,
      skillName: skill.name,
      bounceIndex: bounceCount,
      targetHp: current.hp,
      targetMaxHp: current.maxHp,
    });

    // Chain lightning arc visual
    results.push({
      type: 'effect:spawn',
      effectType: 'chain_lightning',
      fromX: sourceX,
      fromY: sourceY,
      toX: current.x,
      toY: current.y,
      bounceIndex: bounceCount,
    });

    if (!current.alive) {
      handleSkillKill(player, current, results, partyBuffs);
    }

    // Find next target within chainRange
    sourceX = current.x;
    sourceY = current.y;
    currentDamage = Math.floor(currentDamage * (skill.falloff || 0.5));
    bounceCount++;

    let next = null;
    let nextDist = Infinity;
    for (const monster of monsters) {
      if (!monster.alive || hitIds.has(monster.id)) continue;
      const dist = Math.sqrt((monster.x - sourceX) ** 2 + (monster.y - sourceY) ** 2);
      if (dist <= (skill.chainRange || 120) && dist < nextDist) {
        next = monster;
        nextDist = dist;
      }
    }
    current = next;
  }

  return results;
}

// ── Main entry ──────────────────────────────────────────────────────

/**
 * Execute a player skill: call useSkill(), get partyBuffs, dispatch to
 * the appropriate handler, push results to combat.events, return results.
 *
 * @param {CombatSystem} combat     - the CombatSystem instance
 * @param {object}       player     - the player using the skill
 * @param {number}       skillIndex - index into player's skill slots
 * @param {object[]}     monsters   - monsters in the zone
 * @param {object[]}     allPlayers - all players (for buffs / party auras)
 * @returns {object[]|null} results array, or null if skill couldn't fire
 */
function executeSkill(combat, player, skillIndex, monsters, allPlayers) {
  const skill = player.useSkill(skillIndex);
  if (!skill) return null;

  const skillDamageType = getSkillDamageType(skill.name);
  const partyBuffs = allPlayers ? combat.getPartyBuffs(allPlayers) : null;
  const skillLevel = (player.skillLevels && player.skillLevels[skillIndex]) || 1;
  let results;

  switch (skill.type) {
    case 'aoe':
      results = executeAoe(player, skill, monsters, partyBuffs, skillDamageType, skillLevel);
      break;
    case 'single':
      results = executeSingle(player, skill, monsters, partyBuffs, skillDamageType, skillLevel);
      break;
    case 'multi':
      results = executeMulti(player, skill, monsters, partyBuffs, skillDamageType, skillLevel);
      break;
    case 'dot':
      results = executeDot(player, skill, monsters, partyBuffs, skillDamageType, skillLevel);
      break;
    case 'buff':
      results = executeBuff(player, skill, allPlayers, skillLevel);
      break;
    case 'spin':
      results = executeSpin(player, skill, monsters, partyBuffs, skillDamageType, skillLevel);
      break;
    case 'charge':
      results = executeCharge(player, skill, monsters, partyBuffs, skillDamageType, skillLevel);
      break;
    case 'buff_debuff':
      results = executeBuffDebuff(player, skill, monsters, allPlayers, skillLevel);
      break;
    case 'volley':
      results = executeVolley(player, skill, monsters, partyBuffs, skillDamageType, skillLevel);
      break;
    case 'sniper':
      results = executeSniper(player, skill, monsters, partyBuffs, skillDamageType, skillLevel);
      break;
    case 'shadow_step':
      results = executeShadowStep(player, skill, monsters, allPlayers, skillLevel);
      break;
    case 'meteor':
      results = executeMeteor(player, skill, monsters, partyBuffs, skillDamageType, skillLevel);
      break;
    case 'blizzard':
      results = executeBlizzard(player, skill, monsters, partyBuffs, skillDamageType, skillLevel);
      break;
    case 'chain':
      results = executeChain(player, skill, monsters, partyBuffs, skillDamageType, skillLevel);
      break;
    default:
      results = [];
  }

  combat.events.push(...results);
  return results;
}

module.exports = { executeSkill, applyShatter };
