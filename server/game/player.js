const { v4: uuidv4 } = require('uuid');
const { QuestManager } = require('./quests');
const { applyResistance, applyArmor, DAMAGE_TYPES } = require('./damage-types');

const MAX_LEVEL = 30;

const CLASS_BONUSES = {
  warrior: { str: 3, dex: 0, int: 0, vit: 2 },
  ranger:  { str: 2, dex: 3, int: 0, vit: 0 },
  mage:    { str: 0, dex: 2, int: 3, vit: 0 },
};

const CLASS_SKILLS = {
  warrior: [
    { name: 'Whirlwind',       shortName: 'WHL', mpCost: 20, cooldown: 4000, damage: 0.6, type: 'spin',       radius: 70, hits: 3, spinDuration: 500, description: 'Spin attack dealing 3 hits to all nearby enemies' },
    { name: 'Charging Strike',  shortName: 'CHG', mpCost: 22, cooldown: 6000, damage: 2.0, type: 'charge',     range: 200, effect: 'stun', duration: 2000, trailDamage: 0.5, description: 'Dash forward dealing heavy damage + stun' },
    { name: 'Battle Shout',     shortName: 'SHT', mpCost: 25, cooldown: 15000, damage: 0, type: 'buff_debuff', effect: 'attack_up', duration: 8000, fearRadius: 150, fearDuration: 1500, description: 'Boost party attack 30% + terrorize nearby enemies' },
  ],
  ranger: [
    { name: 'Arrow Volley',  shortName: 'VOL', mpCost: 18, cooldown: 3500, damage: 0.6, type: 'volley',       projectileCount: 5, spreadAngle: 30, piercing: true, range: 300, speed: 450, description: 'Fire 5 piercing arrows in a cone' },
    { name: 'Sniper Shot',   shortName: 'SNP', mpCost: 25, cooldown: 8000, damage: 3.0, type: 'sniper',       piercing: true, range: 400, speed: 200, description: 'Heavy piercing shot through all targets in a line' },
    { name: 'Shadow Step',   shortName: 'SHD', mpCost: 20, cooldown: 7000, damage: 0,   type: 'shadow_step',  range: 100, dodgeDuration: 1000, decoyDuration: 2000, description: 'Teleport forward, gain dodge, leave shadow decoy' },
  ],
  mage: [
    { name: 'Meteor Strike',    shortName: 'MTR', mpCost: 25, cooldown: 5000, damage: 2.5, type: 'meteor',    range: 350, speed: 350, aoeRadius: 80, useSpellPower: true, description: 'Fiery meteor exploding on impact in a wide area' },
    { name: 'Blizzard',         shortName: 'BLZ', mpCost: 22, cooldown: 7000, damage: 1.2, type: 'blizzard',  radius: 120, hits: 3, effect: 'slow', duration: 3000, useSpellPower: true, description: 'Icy storm dealing 3 hits and slowing enemies' },
    { name: 'Chain Lightning',  shortName: 'CLN', mpCost: 20, cooldown: 4000, damage: 2.0, type: 'chain',     range: 200, chainRange: 120, maxBounces: 4, falloff: 0.5, useSpellPower: true, description: 'Lightning bouncing between up to 4 targets' },
  ],
};

// Death/respawn constants
const DEATH_DURATION = 5000;     // 5 seconds dead before respawn
const RESPAWN_HP_PERCENT = 0.5;  // Respawn with 50% HP
const DEATH_GOLD_DROP_PERCENT = 0.1; // Drop 10% gold on death

class Player {
  constructor(name, characterClass) {
    this.id = uuidv4();
    this.name = name || 'Hero';
    this.characterClass = characterClass || 'warrior';

    // Position
    this.x = 400;
    this.y = 300;
    this.facing = 'down';
    this.moving = false;
    this.moveSpeed = 160;
    this.auraMoveBuff = 0; // Party aura move speed bonus (Beastmaster Pack Leader)

    // Movement input
    this.inputDx = 0;
    this.inputDy = 0;

    // Level
    this.level = 1;
    this.xp = 0;
    this.xpToNext = 100;
    this.freeStatPoints = 0;

    // Base stats
    const bonus = CLASS_BONUSES[this.characterClass] || CLASS_BONUSES.warrior;
    this.stats = {
      str: 10 + bonus.str,
      dex: 10 + bonus.dex,
      int: 10 + bonus.int,
      vit: 10 + bonus.vit,
    };

    // Derived stats
    this.maxHp = 0;
    this.maxMp = 0;
    this.hp = 0;
    this.mp = 0;
    this.armor = 0;
    this.critChance = 0;
    this.dodgeChance = 0;
    this.attackPower = 0;
    this.spellPower = 0;

    // Equipment slots (must be before recalcStats)
    this.equipment = {
      helmet: null,
      chest: null,
      gloves: null,
      boots: null,
      weapon: null,
      shield: null,
      ring1: null,
      ring2: null,
      amulet: null,
    };

    // Equipment bonuses
    this.equipBonuses = { str: 0, dex: 0, int: 0, vit: 0, armor: 0, damage: 0 };

    // Elemental resistances (0-75 cap, from gear)
    this.resistances = { fire: 0, cold: 0, poison: 0 };

    // Set bonuses (populated by recalcSetBonuses)
    this.activeSets = [];
    this.setBonuses = {};

    this.recalcStats();
    this.hp = this.maxHp;
    this.mp = this.maxMp;

    // Regen timers
    this.hpRegenAccum = 0;
    this.mpRegenAccum = 0;

    // Combat
    this.alive = true;
    this.attackCooldown = 0;
    this.baseAttackSpeed = 800;
    this.attackRange = 48;
    this.skillCooldowns = [0, 0, 0];
    this.buffs = [];

    // Death/Respawn
    this.deathTimer = 0;
    this.isDying = false;
    this.respawnX = 0;
    this.respawnY = 0;
    this.deathGoldDrop = 0;

    // Skills
    this.skills = CLASS_SKILLS[this.characterClass] || CLASS_SKILLS.warrior;

    // Inventory (managed externally)
    this.inventoryId = null;

    // Potions
    this.healthPotions = 3;
    this.manaPotions = 2;

    // Gold
    this.gold = 0;

    // Kill counter (for victory stats)
    this.kills = 0;

    // Summoned spirit wolf (Phase 15.4)
    this.summonedWolf = null;

    // Talents (map of talentId → rank)
    this.talents = {};
    this.talentBonuses = null; // cached result from computeTalentBonuses

    // Keystones (endgame rift currency)
    this.keystones = 0;
    this.healReduction = 1.0; // 1.0 = normal, 0.5 = cursed rift modifier
    this.lastStandTimer = 0; // Last Stand defensive proc (50% DR while > 0)

    // Paragon (post-max-level progression)
    this.paragonLevel = 0;
    this.paragonXp = 0;

    // Quests
    this.questManager = new QuestManager();

    // Damage flash tracking
    this.lastDamageTaken = 0;

    // Affix debuffs (fire DoT, cold slow, etc.)
    this.debuffs = [];
  }

  recalcTalentBonuses() {
    try {
      const { computeTalentBonuses } = require('./talents');
      this.talentBonuses = computeTalentBonuses(this.talents, this.characterClass);
    } catch (_) {
      this.talentBonuses = null;
    }
    this.recalcStats();
  }

  recalcStats() {
    const s = this.stats;
    const eb = this.equipBonuses;
    const tb = this.talentBonuses;

    // Talent stat bonuses (additive to base)
    const tStr = tb ? (tb.statBonuses.str || 0) : 0;
    const tDex = tb ? (tb.statBonuses.dex || 0) : 0;
    const tInt = tb ? (tb.statBonuses.int || 0) : 0;
    const tVit = tb ? (tb.statBonuses.vit || 0) : 0;

    const totalStr = s.str + eb.str + tStr;
    const totalDex = s.dex + eb.dex + tDex;
    const totalInt = s.int + eb.int + tInt;
    const totalVit = s.vit + eb.vit + tVit;

    this.maxHp = 100 + (totalVit * 10) + (this.level * 15);
    this.maxMp = 50 + (totalInt * 5) + (this.level * 8);
    this.armor = eb.armor + (totalVit * 0.5);
    this.critChance = 5 + (totalDex * 1);
    this.dodgeChance = totalDex * 0.5;
    this.attackPower = eb.damage + (totalStr * 2);
    this.spellPower = totalInt * 3;

    // Talent passives
    if (tb && tb.passives) {
      if (tb.passives.armor) this.armor += tb.passives.armor;
      if (tb.passives.crit_chance) this.critChance += tb.passives.crit_chance;
      if (tb.passives.dodge_chance) this.dodgeChance += tb.passives.dodge_chance;
      if (tb.passives.max_mp_percent) this.maxMp = Math.floor(this.maxMp * (1 + tb.passives.max_mp_percent / 100));
    }

    if (this.equipment.weapon) {
      const w = this.equipment.weapon;
      if (w.subType === 'bow' || w.subType === 'staff') {
        this.attackRange = 200;
      } else {
        this.attackRange = 48;
      }
      this.baseAttackSpeed = w.attackSpeed || 800;
    } else {
      this.attackRange = 48;
      this.baseAttackSpeed = 800;
    }

    if (this.hp > this.maxHp) this.hp = this.maxHp;
    if (this.mp > this.maxMp) this.mp = this.maxMp;
  }

  recalcEquipBonuses() {
    this.equipBonuses = { str: 0, dex: 0, int: 0, vit: 0, armor: 0, damage: 0 };
    let fireResist = 0, coldResist = 0, poisonResist = 0, allResist = 0;

    for (const slot of Object.keys(this.equipment)) {
      const item = this.equipment[slot];
      if (!item) continue;
      if (item.bonuses) {
        for (const [stat, val] of Object.entries(item.bonuses)) {
          if (this.equipBonuses[stat] !== undefined) {
            this.equipBonuses[stat] += val;
          }
          // Resistance bonuses
          if (stat === 'fire_resist') fireResist += val;
          if (stat === 'cold_resist') coldResist += val;
          if (stat === 'poison_resist') poisonResist += val;
          if (stat === 'all_resist') allResist += val;
        }
      }
      if (item.armor) this.equipBonuses.armor += item.armor;
      if (item.damage) this.equipBonuses.damage += item.damage;
    }

    // Apply all_resist to each element, cap at 75
    this.resistances.fire = Math.min(75, fireResist + allResist);
    this.resistances.cold = Math.min(75, coldResist + allResist);
    this.resistances.poison = Math.min(75, poisonResist + allResist);

    this.recalcStats();
    this.recalcSetBonuses();
  }

  recalcSetBonuses() {
    const { countSetPieces, getSetInfo } = require('./sets');

    // Reset set bonuses
    this.activeSets = [];
    this.setBonuses = {};

    const setCounts = countSetPieces(this.equipment);

    for (const [setId, count] of setCounts) {
      const setDef = getSetInfo(setId);
      if (!setDef) continue;

      const activeBonus = { setId, name: setDef.name, pieces: count, totalPieces: 3, bonuses: [] };

      // Check 2-piece bonus
      if (count >= 2 && setDef.bonuses[2]) {
        const b = setDef.bonuses[2];
        activeBonus.bonuses.push({ threshold: 2, description: b.description, active: true });
        // Apply stat bonuses
        if (b.armor) this.setBonuses.armor = (this.setBonuses.armor || 0) + b.armor;
        if (b.maxHpPercent) this.setBonuses.maxHpPercent = (this.setBonuses.maxHpPercent || 0) + b.maxHpPercent;
        if (b.critChance) this.setBonuses.critChance = (this.setBonuses.critChance || 0) + b.critChance;
        if (b.speedPercent) this.setBonuses.speedPercent = (this.setBonuses.speedPercent || 0) + b.speedPercent;
        if (b.spellDamagePercent) this.setBonuses.spellDamagePercent = (this.setBonuses.spellDamagePercent || 0) + b.spellDamagePercent;
        if (b.maxMana) this.setBonuses.maxMana = (this.setBonuses.maxMana || 0) + b.maxMana;
        if (b.all_resist) this.setBonuses.all_resist = (this.setBonuses.all_resist || 0) + b.all_resist;
        if (b.maxHp) this.setBonuses.maxHp = (this.setBonuses.maxHp || 0) + b.maxHp;
      }

      // Check 3-piece bonus
      if (count >= 3 && setDef.bonuses[3]) {
        const b = setDef.bonuses[3];
        activeBonus.bonuses.push({ threshold: 3, description: b.description, active: true });
        if (b.damagePercent) this.setBonuses.damagePercent = (this.setBonuses.damagePercent || 0) + b.damagePercent;
        if (b.critDamagePercent) this.setBonuses.critDamagePercent = (this.setBonuses.critDamagePercent || 0) + b.critDamagePercent;
        if (b.cooldownReduction) this.setBonuses.cooldownReduction = (this.setBonuses.cooldownReduction || 0) + b.cooldownReduction;
        if (b.lifestealPercent) this.setBonuses.lifestealPercent = (this.setBonuses.lifestealPercent || 0) + b.lifestealPercent;
        if (b.xpPercent) this.setBonuses.xpPercent = (this.setBonuses.xpPercent || 0) + b.xpPercent;
      }

      this.activeSets.push(activeBonus);
    }

    // Apply additive stat bonuses
    if (this.setBonuses.armor) this.armor += this.setBonuses.armor;
    if (this.setBonuses.maxHp) this.maxHp += this.setBonuses.maxHp;
    if (this.setBonuses.maxHpPercent) this.maxHp = Math.floor(this.maxHp * (1 + this.setBonuses.maxHpPercent / 100));
    if (this.setBonuses.maxMana) this.maxMp += this.setBonuses.maxMana;
    if (this.setBonuses.critChance) this.critChance += this.setBonuses.critChance;
    if (this.setBonuses.all_resist) {
      this.resistances.fire = Math.min(75, this.resistances.fire + this.setBonuses.all_resist);
      this.resistances.cold = Math.min(75, this.resistances.cold + this.setBonuses.all_resist);
      this.resistances.poison = Math.min(75, this.resistances.poison + this.setBonuses.all_resist);
    }
  }

  gainXp(amount) {
    if (!this.alive) return null;
    if (amount <= 0) return null;

    // At max level, overflow XP goes to paragon
    if (this.level >= MAX_LEVEL) {
      this.paragonXp += amount;
      let leveled = false;
      let paragonCost = (this.paragonLevel + 1) * 1000;
      while (this.paragonXp >= paragonCost) {
        this.paragonXp -= paragonCost;
        this.paragonLevel += 1;
        this.freeStatPoints += 1;
        leveled = true;
        paragonCost = (this.paragonLevel + 1) * 1000;
      }
      if (leveled) {
        return { level: this.level, paragonLevel: this.paragonLevel, isParagon: true, talentPoints: 0 };
      }
      return null;
    }

    // Normal leveling
    this.xp += amount;
    let result = null;
    while (this.xp >= this.xpToNext && this.level < MAX_LEVEL) {
      result = this.levelUp();
    }
    if (result) {
      // If we just hit MAX_LEVEL, feed leftover XP into paragon
      if (this.level >= MAX_LEVEL && this.xp > 0) {
        this.paragonXp += this.xp;
        this.xp = 0;
        let paragonCost = (this.paragonLevel + 1) * 1000;
        while (this.paragonXp >= paragonCost) {
          this.paragonXp -= paragonCost;
          this.paragonLevel += 1;
          this.freeStatPoints += 1;
          paragonCost = (this.paragonLevel + 1) * 1000;
        }
      }
      return result;
    }
    return null;
  }

  levelUp() {
    this.xp -= this.xpToNext;
    this.level += 1;
    this.xpToNext = Math.floor(100 * Math.pow(1.15, this.level));
    this.freeStatPoints += 5;
    this.recalcStats();
    this.hp = this.maxHp;
    this.mp = this.maxMp;
    const { getAvailablePoints } = require('./talents');
    const talentPoints = getAvailablePoints(this.level, this.talents);
    return { level: this.level, freeStatPoints: this.freeStatPoints, talentPoints };
  }

  allocateStat(stat) {
    if (this.freeStatPoints <= 0) return false;
    if (!this.stats.hasOwnProperty(stat)) return false;
    this.stats[stat] += 1;
    this.freeStatPoints -= 1;
    this.recalcStats();
    return true;
  }

  useHealthPotion() {
    if (this.healthPotions <= 0) return false;
    if (this.hp >= this.maxHp) return false;
    this.healthPotions -= 1;
    const healAmount = Math.floor(Math.floor(this.maxHp * 0.35) * (this.healReduction ?? 1.0));
    this.hp = Math.min(this.maxHp, this.hp + healAmount);
    return true;
  }

  useManaPotion() {
    if (this.manaPotions <= 0) return false;
    if (this.mp >= this.maxMp) return false;
    this.manaPotions -= 1;
    this.mp = Math.min(this.maxMp, this.mp + Math.floor(this.maxMp * 0.4));
    return true;
  }

  takeDamage(amount, damageType = 'physical') {
    if (!this.alive || this.isDying) return 0;

    // Dodge check — dodge_up buff (Shadow Step) guarantees dodge
    const hasDodgeBuff = this.buffs.some(b => b.effect === 'dodge_up');
    if (hasDodgeBuff || Math.random() * 100 < this.dodgeChance) {
      return -1; // dodged
    }

    let reduced;
    const typeDef = DAMAGE_TYPES[damageType];

    if (typeDef && typeDef.resistKey) {
      // Elemental damage — skip armor, apply resistance
      const resist = this.resistances[typeDef.resistKey] || 0;
      reduced = applyResistance(amount, resist);
    } else {
      // Physical damage — apply armor reduction (existing formula)
      reduced = applyArmor(amount, this.armor);
    }

    this.hp -= reduced;
    this.lastDamageTaken = Date.now();

    if (this.hp <= 0) {
      this.hp = 0;
      this.die();
    }

    return reduced;
  }

  // Death handling
  die() {
    this.alive = false;
    this.isDying = true;
    this.deathTimer = DEATH_DURATION;
    this.inputDx = 0;
    this.inputDy = 0;

    // Calculate gold to drop
    this.deathGoldDrop = Math.floor(this.gold * DEATH_GOLD_DROP_PERCENT);
    this.gold -= this.deathGoldDrop;
    if (this.gold < 0) this.gold = 0;
  }

  // Set respawn position (call before death timer runs out)
  setRespawnPoint(x, y) {
    this.respawnX = x;
    this.respawnY = y;
  }

  // Respawn after death timer
  respawn() {
    this.alive = true;
    this.isDying = false;
    this.deathTimer = 0;

    // Respawn at set point with 50% HP
    this.x = this.respawnX;
    this.y = this.respawnY;
    this.hp = Math.floor(this.maxHp * RESPAWN_HP_PERCENT);
    this.mp = Math.floor(this.maxMp * 0.3);

    return {
      type: 'player:respawn',
      playerId: this.id,
      playerName: this.name,
      x: this.x,
      y: this.y,
      hp: this.hp,
    };
  }

  canAttack() {
    return this.alive && !this.isDying && this.attackCooldown <= 0;
  }

  startAttackCooldown() {
    this.attackCooldown = this.baseAttackSpeed;
  }

  canUseSkill(index) {
    if (!this.alive || this.isDying) return false;
    if (index < 0 || index >= this.skills.length) return false;
    if (this.skillCooldowns[index] > 0) return false;
    if (this.mp < this.skills[index].mpCost) return false;
    return true;
  }

  useSkill(index) {
    if (!this.canUseSkill(index)) return null;
    const skill = this.skills[index];
    this.mp -= skill.mpCost;
    let cd = skill.cooldown;
    // Set bonus: cooldown reduction
    if (this.setBonuses && this.setBonuses.cooldownReduction) {
      cd = Math.floor(cd * (1 - this.setBonuses.cooldownReduction / 100));
    }
    this.skillCooldowns[index] = cd;
    return skill;
  }

  update(dt) {
    // Handle death timer
    if (this.isDying) {
      this.deathTimer -= dt;
      if (this.deathTimer <= 0) {
        return this.respawn();
      }
      return null;
    }

    if (!this.alive) return null;

    // Movement
    if (this.inputDx !== 0 || this.inputDy !== 0) {
      let dx = this.inputDx;
      let dy = this.inputDy;
      const len = Math.sqrt(dx * dx + dy * dy);
      if (len > 0) {
        dx /= len;
        dy /= len;
      }

      const effectiveSpeed = this.moveSpeed * this.speedMultiplier;
      this.x += dx * effectiveSpeed * (dt / 1000);
      this.y += dy * effectiveSpeed * (dt / 1000);
      this.moving = true;

      if (Math.abs(dx) > Math.abs(dy)) {
        this.facing = dx > 0 ? 'right' : 'left';
      } else {
        this.facing = dy > 0 ? 'down' : 'up';
      }
    } else {
      this.moving = false;
    }

    // Clamp to world bounds (will be overridden by world.isWalkable check in server)
    this.x = Math.max(16, Math.min(1920, this.x));
    this.y = Math.max(16, Math.min(1280, this.y));

    // Attack cooldown
    if (this.attackCooldown > 0) {
      this.attackCooldown -= dt;
    }

    // Skill cooldowns
    for (let i = 0; i < this.skillCooldowns.length; i++) {
      if (this.skillCooldowns[i] > 0) {
        this.skillCooldowns[i] -= dt;
        if (this.skillCooldowns[i] < 0) this.skillCooldowns[i] = 0;
      }
    }

    // Buffs
    for (let i = this.buffs.length - 1; i >= 0; i--) {
      this.buffs[i].remaining -= dt;
      if (this.buffs[i].remaining <= 0) {
        this.buffs.splice(i, 1);
      }
    }

    // Regen
    this.hpRegenAccum += dt;
    this.mpRegenAccum += dt;
    if (this.hpRegenAccum >= 1000) {
      this.hpRegenAccum -= 1000;
      const hpRegen = 1 + Math.floor(this.stats.vit / 10);
      this.hp = Math.min(this.maxHp, this.hp + hpRegen);
    }
    if (this.mpRegenAccum >= 1000) {
      this.mpRegenAccum -= 1000;
      this.mp = Math.min(this.maxMp, this.mp + 2);
    }

    return null;
  }

  /**
   * Apply a named debuff from traps/environment.
   * Maps high-level effect names to the internal debuff format used by addDebuff/processDebuffs.
   * @param {string} effect - 'stun', 'burning', 'poison', 'slow'
   * @param {number} duration - Duration in milliseconds
   */
  applyDebuff(effect, duration) {
    const tickInterval = 500; // debuffs tick every 500ms in the game loop (20 ticks/s, process each tick)
    const ticks = Math.max(1, Math.ceil(duration / tickInterval));

    switch (effect) {
      case 'stun':
        // Stun: stop movement for duration (reuse slow with 0 speed)
        this.addDebuff({
          source: 'trap_stun',
          effect: 'slow',
          speedMult: 0,
          ticksRemaining: ticks,
        });
        break;
      case 'burning':
        // Burning: fire DoT
        this.addDebuff({
          source: 'trap_burning',
          effect: 'fire_dot',
          damage: 3,
          ticksRemaining: ticks,
        });
        break;
      case 'poison':
        // Poison: poison DoT (uses fire_dot mechanic for damage ticks)
        this.addDebuff({
          source: 'trap_poison',
          effect: 'fire_dot',
          damage: 2,
          ticksRemaining: ticks,
        });
        break;
      case 'slow':
        // Slow: 50% movement speed
        this.addDebuff({
          source: 'trap_slow',
          effect: 'slow',
          speedMult: 0.5,
          ticksRemaining: ticks,
        });
        break;
    }
  }

  addDebuff(debuff) {
    // Replace existing debuff from same source
    this.debuffs = this.debuffs.filter(d => d.source !== debuff.source || d.effect !== debuff.effect);
    this.debuffs.push(debuff);
  }

  processDebuffs() {
    if (this.debuffs.length === 0) return 0;
    let totalDamage = 0;
    for (const d of this.debuffs) {
      if (d.effect === 'fire_dot' && d.ticksRemaining > 0) {
        totalDamage += d.damage;
        d.ticksRemaining--;
      }
      if (d.effect === 'slow' && d.ticksRemaining > 0) {
        d.ticksRemaining--;
      }
    }
    // Remove expired debuffs
    this.debuffs = this.debuffs.filter(d => d.ticksRemaining > 0);
    return totalDamage;
  }

  get speedMultiplier() {
    let mult = 1.0;
    const slow = this.debuffs.find(d => d.effect === 'slow');
    if (slow) mult = slow.speedMult;
    // Set bonus: speed percent
    if (this.setBonuses && this.setBonuses.speedPercent) {
      mult *= (1 + this.setBonuses.speedPercent / 100);
    }
    // Party aura: move speed (Beastmaster Pack Leader)
    if (this.auraMoveBuff > 0) {
      mult *= (1 + this.auraMoveBuff / 100);
    }
    return mult;
  }

  serialize() {
    return {
      id: this.id,
      name: this.name,
      characterClass: this.characterClass,
      x: Math.round(this.x),
      y: Math.round(this.y),
      facing: this.facing,
      moving: this.moving,
      level: this.level,
      hp: this.hp,
      maxHp: this.maxHp,
      mp: this.mp,
      maxMp: this.maxMp,
      alive: this.alive,
      isDying: this.isDying,
      deathTimer: this.deathTimer,
      disconnected: this.disconnected || false,
      resistances: { ...this.resistances },
      buffs: this.buffs.map(b => ({ effect: b.effect, remaining: b.remaining })),
      debuffs: this.debuffs.map(d => ({ effect: d.effect, ticksRemaining: d.ticksRemaining })),
      activeSets: this.activeSets,
      setBonuses: this.setBonuses,
      keystones: this.keystones,
      paragonLevel: this.paragonLevel,
      paragonXp: this.paragonXp,
      paragonXpToNext: (this.paragonLevel + 1) * 1000,
      talentBonuses: this.talentBonuses,
    };
  }

  /**
   * Restore player state from saved DB data.
   * Keeps the new UUID — only restores progression.
   * @param {object} savedData — from GameDatabase.loadCharacter()
   */
  restoreFrom(savedData) {
    this.level = savedData.level || 1;
    this.xp = savedData.xp || 0;
    this.xpToNext = Math.floor(100 * Math.pow(1.15, this.level));
    this.freeStatPoints = savedData.freeStatPoints || 0;
    this.gold = savedData.gold || 0;
    this.kills = savedData.kills || 0;
    this.healthPotions = savedData.healthPotions ?? 3;
    this.manaPotions = savedData.manaPotions ?? 2;
    this.keystones = savedData.keystones ?? 0;

    // Restore base stats
    if (savedData.stats) {
      this.stats.str = savedData.stats.str ?? this.stats.str;
      this.stats.dex = savedData.stats.dex ?? this.stats.dex;
      this.stats.int = savedData.stats.int ?? this.stats.int;
      this.stats.vit = savedData.stats.vit ?? this.stats.vit;
    }

    // Restore equipment
    if (savedData.equipment) {
      for (const slot of Object.keys(this.equipment)) {
        this.equipment[slot] = savedData.equipment[slot] || null;
      }
    }

    // Restore talents
    if (savedData.talents && typeof savedData.talents === 'object') {
      this.talents = savedData.talents;
    }

    // Restore paragon progression
    this.paragonLevel = savedData.paragonLevel ?? 0;
    this.paragonXp = savedData.paragonXp ?? 0;

    // Recalc bonuses from restored equipment (also recalcs resistances), then set HP/MP to max
    this.recalcEquipBonuses();
    this.recalcTalentBonuses();
    this.hp = this.maxHp;
    this.mp = this.maxMp;
  }

  serializeForPhone() {
    return {
      id: this.id,
      name: this.name,
      characterClass: this.characterClass,
      level: this.level,
      xp: this.xp,
      xpToNext: this.xpToNext,
      hp: this.hp,
      maxHp: this.maxHp,
      mp: this.mp,
      maxMp: this.maxMp,
      stats: { ...this.stats },
      freeStatPoints: this.freeStatPoints,
      armor: Math.round(this.armor),
      resistances: { ...this.resistances },
      critChance: Math.round(this.critChance),
      attackPower: Math.round(this.attackPower),
      spellPower: Math.round(this.spellPower),
      alive: this.alive,
      isDying: this.isDying,
      deathTimer: this.deathTimer,
      gold: this.gold,
      healthPotions: this.healthPotions,
      manaPotions: this.manaPotions,
      equipment: this.equipment,
      skillCooldowns: this.skillCooldowns,
      skills: this.skills.map((s, i) => ({
        name: s.name,
        shortName: s.shortName || s.name.substring(0, 3).toUpperCase(),
        mpCost: s.mpCost,
        cooldown: s.cooldown,
        cooldownRemaining: Math.max(0, this.skillCooldowns[i] || 0),
        type: s.type,
        description: s.description,
      })),
      buffs: this.buffs.map(b => ({ effect: b.effect, remaining: b.remaining })),
      debuffs: this.debuffs.map(d => ({ effect: d.effect, ticksRemaining: d.ticksRemaining })),
      lastDamageTaken: this.lastDamageTaken,
      lastStandTimer: this.lastStandTimer || 0,
      auraMoveBuff: this.auraMoveBuff || 0,
      quests: this.questManager.getActiveQuests(),
      activeSets: this.activeSets,
      setBonuses: this.setBonuses,
      talents: this.talents,
      talentBonuses: this.talentBonuses,
      keystones: this.keystones,
      paragonLevel: this.paragonLevel,
      paragonXp: this.paragonXp,
      paragonXpToNext: (this.paragonLevel + 1) * 1000,
    };
  }

  // ─── Keystone helpers ─────────────────────────────────────────

  /**
   * Award N keystones to the player.
   * @param {number} n
   */
  addKeystones(n) {
    if (typeof n !== 'number' || !Number.isFinite(n) || n <= 0) return;
    this.keystones = (this.keystones || 0) + Math.floor(n);
  }

  /**
   * Spend one keystone to open a rift.
   * @returns {boolean} true if successful, false if no keystones available
   */
  spendKeystone() {
    if ((this.keystones || 0) <= 0) return false;
    this.keystones -= 1;
    return true;
  }
}

module.exports = { Player, CLASS_SKILLS, DEATH_DURATION, RESPAWN_HP_PERCENT, DEATH_GOLD_DROP_PERCENT, MAX_LEVEL };
