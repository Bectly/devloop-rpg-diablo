// ─── Talent Trees — Data + Engine ───────────────────────────────────
// Each class has 3 branches × 4 tiers = 12 talents per class, 36 total.
// Tier gates are based on points spent in THAT branch.
// Players gain 1 talent point per level.

const TIER_GATES = { 1: 0, 2: 3, 3: 6, 4: 9 };
const TIER_MAX_RANKS = { 1: 3, 2: 3, 3: 2, 4: 1 };

// ─── Warrior Talents ────────────────────────────────────────────────

const WARRIOR_TREE = {
  berserker: {
    name: 'Berserker',
    description: 'Raw offensive power. Strength, damage, and bloodlust.',
    talents: [
      {
        id: 'warrior_berserker_t1',
        name: 'Blood Fury',
        description: 'Pure rage fuels your strikes. +3 Strength per rank.',
        tier: 1,
        maxRank: 3,
        effects: [
          { type: 'stat_bonus', stat: 'str', value: 3, per_rank: true }
        ]
      },
      {
        id: 'warrior_berserker_t2',
        name: 'Rampage',
        description: 'Each kill drives you harder. +10% melee damage per rank.',
        tier: 2,
        maxRank: 3,
        effects: [
          { type: 'passive', property: 'damage_percent', value: 10, per_rank: true }
        ]
      },
      {
        id: 'warrior_berserker_t3',
        name: 'Execute',
        description: '8% chance on hit to deal 2x damage to targets below 30% HP per rank.',
        tier: 3,
        maxRank: 2,
        effects: [
          { type: 'proc_chance', trigger: 'on_hit', effect: 'execute', chance: 0.08, threshold_hp_percent: 30, damage_multiplier: 2, per_rank: true }
        ]
      },
      {
        id: 'warrior_berserker_t4',
        name: 'Bloodbath',
        description: 'Kills heal you for 15% of your max HP. Carnage sustains you.',
        tier: 4,
        maxRank: 1,
        effects: [
          { type: 'proc_chance', trigger: 'on_kill', effect: 'heal_percent', chance: 1.0, value: 15, per_rank: false }
        ]
      }
    ]
  },

  sentinel: {
    name: 'Sentinel',
    description: 'Unbreakable defense. Armor, blocking, and survival.',
    talents: [
      {
        id: 'warrior_sentinel_t1',
        name: 'Thick Skin',
        description: 'Your hide toughens with every battle. +3 Vitality per rank.',
        tier: 1,
        maxRank: 3,
        effects: [
          { type: 'stat_bonus', stat: 'vit', value: 3, per_rank: true }
        ]
      },
      {
        id: 'warrior_sentinel_t2',
        name: 'Iron Will',
        description: 'Steel resolve hardens your body. +8 Armor per rank.',
        tier: 2,
        maxRank: 3,
        effects: [
          { type: 'passive', property: 'armor', value: 8, per_rank: true }
        ]
      },
      {
        id: 'warrior_sentinel_t3',
        name: 'Shield Wall',
        description: '10% chance per rank to block incoming damage by 50%.',
        tier: 3,
        maxRank: 2,
        effects: [
          { type: 'proc_chance', trigger: 'on_take_damage', effect: 'block', chance: 0.10, damage_reduction: 0.50, per_rank: true }
        ]
      },
      {
        id: 'warrior_sentinel_t4',
        name: 'Last Stand',
        description: 'When HP drops below 20%, gain 50% damage reduction for 5s. 30s cooldown.',
        tier: 4,
        maxRank: 1,
        effects: [
          { type: 'proc_chance', trigger: 'on_take_damage', effect: 'last_stand', chance: 1.0, threshold_hp_percent: 20, damage_reduction: 0.50, duration: 5000, cooldown: 30000, per_rank: false }
        ]
      }
    ]
  },

  warlord: {
    name: 'Warlord',
    description: 'Lead from the front. Buffs and auras for the whole party.',
    talents: [
      {
        id: 'warrior_warlord_t1',
        name: 'Battle Shout',
        description: 'Your war cry empowers allies. +2 Strength to all party per rank.',
        tier: 1,
        maxRank: 3,
        effects: [
          { type: 'aura', stat: 'str', value: 2, party: true, per_rank: true }
        ]
      },
      {
        id: 'warrior_warlord_t2',
        name: 'Inspire',
        description: 'Your presence motivates. +5% XP gain for party per rank.',
        tier: 2,
        maxRank: 3,
        effects: [
          { type: 'aura', stat: 'xp_percent', value: 5, party: true, per_rank: true }
        ]
      },
      {
        id: 'warrior_warlord_t3',
        name: 'Commanding Presence',
        description: 'Allies attack faster near you. +5% party attack speed per rank.',
        tier: 3,
        maxRank: 2,
        effects: [
          { type: 'aura', stat: 'attack_speed', value: 5, party: true, per_rank: true }
        ]
      },
      {
        id: 'warrior_warlord_t4',
        name: 'Rallying Cry',
        description: 'War Cry also heals party for 20% of their max HP.',
        tier: 4,
        maxRank: 1,
        effects: [
          { type: 'skill_upgrade', skill: 'War Cry', property: 'heal_party_percent', value: 20, per_rank: false }
        ]
      }
    ]
  }
};

// ─── Ranger Talents ─────────────────────────────────────────────────

const RANGER_TREE = {
  marksman: {
    name: 'Marksman',
    description: 'Precision and lethality. Critical strikes and ranged mastery.',
    talents: [
      {
        id: 'ranger_marksman_t1',
        name: 'Steady Aim',
        description: 'Patience breeds accuracy. +3 Dexterity per rank.',
        tier: 1,
        maxRank: 3,
        effects: [
          { type: 'stat_bonus', stat: 'dex', value: 3, per_rank: true }
        ]
      },
      {
        id: 'ranger_marksman_t2',
        name: 'Piercing Shot',
        description: 'Your arrows find the weak spots. +15% critical damage per rank.',
        tier: 2,
        maxRank: 3,
        effects: [
          { type: 'passive', property: 'crit_damage_percent', value: 15, per_rank: true }
        ]
      },
      {
        id: 'ranger_marksman_t3',
        name: 'Eagle Eye',
        description: 'Nothing escapes your sight. +5% critical chance per rank.',
        tier: 3,
        maxRank: 2,
        effects: [
          { type: 'passive', property: 'crit_chance', value: 5, per_rank: true }
        ]
      },
      {
        id: 'ranger_marksman_t4',
        name: 'Sniper',
        description: 'First hit on a full-HP target deals 3x damage. One shot, one kill.',
        tier: 4,
        maxRank: 1,
        effects: [
          { type: 'proc_chance', trigger: 'on_hit', effect: 'sniper', chance: 1.0, condition: 'target_full_hp', damage_multiplier: 3, per_rank: false }
        ]
      }
    ]
  },

  trapper: {
    name: 'Trapper',
    description: 'Cunning and control. Traps, slows, and battlefield manipulation.',
    talents: [
      {
        id: 'ranger_trapper_t1',
        name: 'Trap Mastery',
        description: 'A keen mind for devices. +2 Dexterity and +2 Intelligence per rank.',
        tier: 1,
        maxRank: 3,
        effects: [
          { type: 'stat_bonus', stat: 'dex', value: 2, per_rank: true },
          { type: 'stat_bonus', stat: 'int', value: 2, per_rank: true }
        ]
      },
      {
        id: 'ranger_trapper_t2',
        name: 'Caltrops',
        description: '10% chance per rank on dodge to slow the attacker by 40% for 3s.',
        tier: 2,
        maxRank: 3,
        effects: [
          { type: 'proc_chance', trigger: 'on_dodge', effect: 'slow', chance: 0.10, slow_percent: 40, duration: 3000, per_rank: true }
        ]
      },
      {
        id: 'ranger_trapper_t3',
        name: 'Net Throw',
        description: 'Poison Arrow also slows target movement by 50% per rank.',
        tier: 3,
        maxRank: 2,
        effects: [
          { type: 'skill_upgrade', skill: 'Poison Arrow', property: 'slow_percent', value: 50, per_rank: true }
        ]
      },
      {
        id: 'ranger_trapper_t4',
        name: 'Explosive Trap',
        description: 'Multi-Shot arrows leave fire trails dealing AoE damage for 2s.',
        tier: 4,
        maxRank: 1,
        effects: [
          { type: 'skill_upgrade', skill: 'Multi-Shot', property: 'fire_trail', value: 1, duration: 2000, damage_percent: 30, per_rank: false }
        ]
      }
    ]
  },

  beastmaster: {
    name: 'Beastmaster',
    description: 'Primal bond with nature. Survivability and pack synergy.',
    talents: [
      {
        id: 'ranger_beastmaster_t1',
        name: 'Beast Bond',
        description: 'The wilds toughen your body. +3 Vitality per rank.',
        tier: 1,
        maxRank: 3,
        effects: [
          { type: 'stat_bonus', stat: 'vit', value: 3, per_rank: true }
        ]
      },
      {
        id: 'ranger_beastmaster_t2',
        name: 'Feral Instinct',
        description: 'Animal reflexes guide you. +5% dodge chance per rank.',
        tier: 2,
        maxRank: 3,
        effects: [
          { type: 'passive', property: 'dodge_chance', value: 5, per_rank: true }
        ]
      },
      {
        id: 'ranger_beastmaster_t3',
        name: 'Pack Leader',
        description: 'Your pack moves as one. +5% party movement speed per rank.',
        tier: 3,
        maxRank: 2,
        effects: [
          { type: 'aura', stat: 'move_speed', value: 5, party: true, per_rank: true }
        ]
      },
      {
        id: 'ranger_beastmaster_t4',
        name: 'Spirit Wolf',
        description: 'On kill, 25% chance to summon a wolf spirit dealing AoE damage.',
        tier: 4,
        maxRank: 1,
        effects: [
          { type: 'proc_chance', trigger: 'on_kill', effect: 'summon_spirit_wolf', chance: 0.25, damage_percent: 80, radius: 60, duration: 3000, per_rank: false }
        ]
      }
    ]
  }
};

// ─── Mage Talents ───────────────────────────────────────────────────

const MAGE_TREE = {
  pyromancer: {
    name: 'Pyromancer',
    description: 'Master of flame. Raw spell damage and fire destruction.',
    talents: [
      {
        id: 'mage_pyromancer_t1',
        name: 'Ignite',
        description: 'Fire courses through your veins. +3 Intelligence per rank.',
        tier: 1,
        maxRank: 3,
        effects: [
          { type: 'stat_bonus', stat: 'int', value: 3, per_rank: true }
        ]
      },
      {
        id: 'mage_pyromancer_t2',
        name: 'Combustion',
        description: 'Your spells burn hotter. +12% spell damage per rank.',
        tier: 2,
        maxRank: 3,
        effects: [
          { type: 'passive', property: 'spell_damage_percent', value: 12, per_rank: true }
        ]
      },
      {
        id: 'mage_pyromancer_t3',
        name: 'Fire Mastery',
        description: 'Fireball explosion radius +15% per rank.',
        tier: 3,
        maxRank: 2,
        effects: [
          { type: 'skill_upgrade', skill: 'Fireball', property: 'radius_percent', value: 15, per_rank: true }
        ]
      },
      {
        id: 'mage_pyromancer_t4',
        name: 'Inferno',
        description: 'Fireball leaves burning ground for 3s dealing fire DoT.',
        tier: 4,
        maxRank: 1,
        effects: [
          { type: 'skill_upgrade', skill: 'Fireball', property: 'burning_ground', value: 1, duration: 3000, damage_per_tick: 8, tick_interval: 500, per_rank: false }
        ]
      }
    ]
  },

  frost: {
    name: 'Frost',
    description: 'Ice and control. Freeze, shatter, and defensive barriers.',
    talents: [
      {
        id: 'mage_frost_t1',
        name: 'Frostbite',
        description: 'Cold hardens mind and body. +2 Intelligence and +2 Vitality per rank.',
        tier: 1,
        maxRank: 3,
        effects: [
          { type: 'stat_bonus', stat: 'int', value: 2, per_rank: true },
          { type: 'stat_bonus', stat: 'vit', value: 2, per_rank: true }
        ]
      },
      {
        id: 'mage_frost_t2',
        name: 'Shatter',
        description: 'Frozen enemies shatter under pressure. +15% damage to frozen targets per rank.',
        tier: 2,
        maxRank: 3,
        effects: [
          { type: 'passive', property: 'shatter_bonus', value: 15, per_rank: true }
        ]
      },
      {
        id: 'mage_frost_t3',
        name: 'Ice Barrier',
        description: '10% chance per rank when hit to freeze attacker for 2s.',
        tier: 3,
        maxRank: 2,
        effects: [
          { type: 'proc_chance', trigger: 'on_take_damage', effect: 'freeze', chance: 0.10, duration: 2000, per_rank: true }
        ]
      },
      {
        id: 'mage_frost_t4',
        name: 'Blizzard',
        description: 'Frost Nova also deals sustained damage over 3s after the initial hit.',
        tier: 4,
        maxRank: 1,
        effects: [
          { type: 'skill_upgrade', skill: 'Frost Nova', property: 'dot_after', value: 1, duration: 3000, damage_per_tick: 6, tick_interval: 500, per_rank: false }
        ]
      }
    ]
  },

  arcane: {
    name: 'Arcane',
    description: 'Mana mastery and spell efficiency. Cast more, cast harder.',
    talents: [
      {
        id: 'mage_arcane_t1',
        name: 'Mana Flow',
        description: 'The arcane flows freely through you. +3 Intelligence per rank.',
        tier: 1,
        maxRank: 3,
        effects: [
          { type: 'stat_bonus', stat: 'int', value: 3, per_rank: true }
        ]
      },
      {
        id: 'mage_arcane_t2',
        name: 'Arcane Intellect',
        description: 'Your mana pool deepens. +5% max MP per rank.',
        tier: 2,
        maxRank: 3,
        effects: [
          { type: 'passive', property: 'max_mp_percent', value: 5, per_rank: true }
        ]
      },
      {
        id: 'mage_arcane_t3',
        name: 'Spell Echo',
        description: '10% chance per rank to not consume MP when casting a skill.',
        tier: 3,
        maxRank: 2,
        effects: [
          { type: 'proc_chance', trigger: 'on_skill_use', effect: 'free_cast', chance: 0.10, per_rank: true }
        ]
      },
      {
        id: 'mage_arcane_t4',
        name: 'Arcane Surge',
        description: 'After casting 3 skills within 10s, next skill deals 2x damage.',
        tier: 4,
        maxRank: 1,
        effects: [
          { type: 'proc_chance', trigger: 'on_skill_use', effect: 'arcane_surge', chance: 1.0, required_casts: 3, window: 10000, damage_multiplier: 2, per_rank: false }
        ]
      }
    ]
  }
};

// ─── Master Tree Map ────────────────────────────────────────────────

const TALENT_TREES = {
  warrior: WARRIOR_TREE,
  ranger: RANGER_TREE,
  mage: MAGE_TREE
};

// ─── Lookup Helpers ─────────────────────────────────────────────────

// Build a flat index: talentId → { talent, branchName, characterClass }
const _talentIndex = {};
for (const [cls, tree] of Object.entries(TALENT_TREES)) {
  for (const [branchName, branch] of Object.entries(tree)) {
    for (const talent of branch.talents) {
      _talentIndex[talent.id] = { talent, branchName, characterClass: cls };
    }
  }
}

// ─── Engine Functions ───────────────────────────────────────────────

/**
 * Get the full talent tree for a class.
 * Returns { branchName: { name, description, talents: [...] }, ... }
 */
function getTalentTree(characterClass) {
  return TALENT_TREES[characterClass] || null;
}

/**
 * Get a single talent definition by class + talentId.
 * Returns the talent object or null.
 */
function getTalent(characterClass, talentId) {
  const entry = _talentIndex[talentId];
  if (!entry || entry.characterClass !== characterClass) return null;
  return entry.talent;
}

/**
 * How many total talent points have been allocated.
 */
function _totalAllocated(playerTalents) {
  let total = 0;
  for (const id in playerTalents) {
    total += playerTalents[id];
  }
  return total;
}

/**
 * Get available (unspent) talent points. 1 point per level, minus allocated.
 */
function getAvailablePoints(level, playerTalents) {
  // Level 1 = 0 talent points, level 2 = 1, etc.
  // Actually: players get 1 talent point per level starting from level 1.
  // Total points = level - 1 (no point at level 1) ... or level.
  // Convention: total points = level - 1 (you earn your first at level 2).
  // Keeping it simple: total points = level (1 at level 1 is fine for gameplay).
  // Following the spec: "1 talent point per level"
  const totalPoints = level;
  return Math.max(0, totalPoints - _totalAllocated(playerTalents));
}

/**
 * Count how many points a player has spent in a specific branch.
 */
function getPointsInBranch(playerTalents, characterClass, branchName) {
  const tree = TALENT_TREES[characterClass];
  if (!tree || !tree[branchName]) return 0;

  let points = 0;
  for (const talent of tree[branchName].talents) {
    points += (playerTalents[talent.id] || 0);
  }
  return points;
}

/**
 * Check whether a talent can be allocated.
 * Returns { ok: true } or { ok: false, reason: '...' }
 */
function canAllocate(characterClass, playerTalents, talentId, playerLevel) {
  // 1. Talent exists for this class?
  const entry = _talentIndex[talentId];
  if (!entry || entry.characterClass !== characterClass) {
    return { ok: false, reason: 'Talent not found for this class.' };
  }

  const talent = entry.talent;
  const branchName = entry.branchName;
  const currentRank = playerTalents[talentId] || 0;

  // 2. Already at max rank?
  if (currentRank >= talent.maxRank) {
    return { ok: false, reason: `${talent.name} is already at max rank (${talent.maxRank}).` };
  }

  // 3. Has available points?
  if (getAvailablePoints(playerLevel, playerTalents) <= 0) {
    return { ok: false, reason: 'No talent points available.' };
  }

  // 4. Tier gate — enough points spent in this branch?
  const branchPoints = getPointsInBranch(playerTalents, characterClass, branchName);
  const required = TIER_GATES[talent.tier];
  if (branchPoints < required) {
    return { ok: false, reason: `Requires ${required} points in ${entry.branchName} branch (have ${branchPoints}).` };
  }

  return { ok: true };
}

/**
 * Allocate one rank in a talent. Validates first.
 * Returns { ok: true, talents: {...} } or { ok: false, reason: '...' }
 */
function allocateTalent(characterClass, playerTalents, talentId, playerLevel) {
  const check = canAllocate(characterClass, playerTalents, talentId, playerLevel);
  if (!check.ok) {
    return { ok: false, reason: check.reason };
  }

  // Clone talents and increment
  const newTalents = Object.assign({}, playerTalents);
  newTalents[talentId] = (newTalents[talentId] || 0) + 1;

  return { ok: true, talents: newTalents };
}

/**
 * Compute all talent bonuses from a player's allocated talents.
 * Returns:
 * {
 *   statBonuses: { str, dex, int, vit },
 *   passives: { damage_percent, spell_damage_percent, crit_chance, ... },
 *   procs: [ { trigger, effect, chance, ... } ],
 *   auras: [ { stat, value, party } ],
 *   skillUpgrades: { 'Cleave': { damage: 0.30 }, ... }
 * }
 */
function computeTalentBonuses(playerTalents, characterClass) {
  const result = {
    statBonuses: { str: 0, dex: 0, int: 0, vit: 0 },
    passives: {},
    procs: [],
    auras: [],
    skillUpgrades: {}
  };

  const tree = TALENT_TREES[characterClass];
  if (!tree) return result;

  for (const [branchName, branch] of Object.entries(tree)) {
    for (const talent of branch.talents) {
      const rank = playerTalents[talent.id] || 0;
      if (rank === 0) continue;

      for (const eff of talent.effects) {
        const multiplier = eff.per_rank ? rank : 1;

        switch (eff.type) {
          case 'stat_bonus': {
            const stat = eff.stat;
            if (result.statBonuses.hasOwnProperty(stat)) {
              result.statBonuses[stat] += eff.value * multiplier;
            }
            break;
          }

          case 'passive': {
            const prop = eff.property;
            result.passives[prop] = (result.passives[prop] || 0) + eff.value * multiplier;
            break;
          }

          case 'proc_chance': {
            // Build the proc entry with scaled chance where per_rank applies
            const proc = Object.assign({}, eff);
            delete proc.type;
            delete proc.per_rank;
            if (eff.per_rank) {
              proc.chance = eff.chance * rank;
            }
            proc.sourceTalent = talent.id;
            proc.sourceName = talent.name;
            result.procs.push(proc);
            break;
          }

          case 'aura': {
            result.auras.push({
              stat: eff.stat,
              value: eff.value * multiplier,
              party: !!eff.party,
              sourceTalent: talent.id,
              sourceName: talent.name
            });
            break;
          }

          case 'skill_upgrade': {
            const skill = eff.skill;
            if (!result.skillUpgrades[skill]) {
              result.skillUpgrades[skill] = {};
            }
            const prop = eff.property;
            const val = eff.value * multiplier;
            // For boolean-like upgrades (value=1), store the full effect data
            if (eff.value === 1 && !eff.per_rank) {
              // This is a toggle-style upgrade (burning_ground, fire_trail, etc.)
              const upgradeData = Object.assign({}, eff);
              delete upgradeData.type;
              delete upgradeData.skill;
              delete upgradeData.per_rank;
              result.skillUpgrades[skill][prop] = upgradeData;
            } else {
              result.skillUpgrades[skill][prop] = (result.skillUpgrades[skill][prop] || 0) + val;
            }
            break;
          }
        }
      }
    }
  }

  return result;
}

/**
 * Full respec — wipe all talent allocations.
 * Returns an empty talents map.
 */
function respec(playerTalents) {
  return {};
}

// ─── Exports ────────────────────────────────────────────────────────

module.exports = {
  TALENT_TREES,
  TIER_GATES,
  TIER_MAX_RANKS,
  getTalentTree,
  getTalent,
  canAllocate,
  allocateTalent,
  computeTalentBonuses,
  getAvailablePoints,
  getPointsInBranch,
  respec
};
