const { generateLoot } = require('./items');
const { modifyDamageByAffixes, processAffixOnDeath } = require('./affixes');
const { getSkillDamageType } = require('./damage-types');
const { rollSetDrop, generateSetItem } = require('./sets');

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
function calcSkillDamage(player, skill, baseDmg, monster) {
  const isSpell = skill.name === 'Fireball' || skill.name === 'Frost Nova';

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

  // XP calculation with set bonus + party aura
  let xpReward = monster.xpReward;
  if (player.setBonuses && player.setBonuses.xpPercent) {
    xpReward = Math.floor(xpReward * (1 + player.setBonuses.xpPercent / 100));
  }
  if (partyBuffs && partyBuffs.xp_percent > 0) {
    xpReward = Math.floor(xpReward * (1 + partyBuffs.xp_percent / 100));
  }

  const levelResult = player.gainXp(xpReward);
  if (levelResult) {
    results.push({ type: 'player:levelup', playerId: player.id, level: levelResult.level });
  }
}

// ── Per-type handler functions ──────────────────────────────────────

/**
 * AOE skill: damage all monsters within skill.radius.
 * Spells (Fireball, Frost Nova) use spellPower; others use attackPower.
 * Applies stun/slow effects based on skill.effect / skill.duration.
 */
function executeAoe(player, skill, monsters, partyBuffs, skillDamageType) {
  const results = [];

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

      baseDmg = calcSkillDamage(player, skill, baseDmg, monster);
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
function executeSingle(player, skill, monsters, partyBuffs, skillDamageType) {
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
    baseDmg = calcSkillDamage(player, skill, baseDmg, nearest);
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
function executeMulti(player, skill, monsters, partyBuffs, skillDamageType) {
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
    baseDmg = calcSkillDamage(player, skill, baseDmg, t);
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
 * DoT skill (Poison Arrow): nearest monster within 200.
 * Sets poisonTick / poisonDamage on target. Adds effect: 'poison' to hit event.
 */
function executeDot(player, skill, monsters, partyBuffs, skillDamageType) {
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
    baseDmg = calcSkillDamage(player, skill, baseDmg, nearest);
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
 * Buff skill: 'War Cry' targets allPlayers, others target [player].
 * Pushes buff to target.buffs[].
 */
function executeBuff(player, skill, allPlayers) {
  const results = [];

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

  return results;
}

/**
 * Movement skill (Teleport): dirMap lookup, move player, clamp to bounds.
 */
function executeMovement(player, skill) {
  const results = [];

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
  let results;

  switch (skill.type) {
    case 'aoe':
      results = executeAoe(player, skill, monsters, partyBuffs, skillDamageType);
      break;
    case 'single':
      results = executeSingle(player, skill, monsters, partyBuffs, skillDamageType);
      break;
    case 'multi':
      results = executeMulti(player, skill, monsters, partyBuffs, skillDamageType);
      break;
    case 'dot':
      results = executeDot(player, skill, monsters, partyBuffs, skillDamageType);
      break;
    case 'buff':
      results = executeBuff(player, skill, allPlayers);
      break;
    case 'movement':
      results = executeMovement(player, skill);
      break;
    default:
      results = [];
  }

  combat.events.push(...results);
  return results;
}

module.exports = { executeSkill };
