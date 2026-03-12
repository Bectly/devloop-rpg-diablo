const { v4: uuidv4 } = require('uuid');
const { QuestManager } = require('./quests');

const CLASS_BONUSES = {
  warrior: { str: 3, dex: 0, int: 0, vit: 2 },
  ranger:  { str: 2, dex: 3, int: 0, vit: 0 },
  mage:    { str: 0, dex: 2, int: 3, vit: 0 },
};

const CLASS_SKILLS = {
  warrior: [
    { name: 'Cleave',      shortName: 'CLV', mpCost: 15, cooldown: 3000, damage: 1.8, type: 'aoe',    radius: 60, description: 'Wide slash hitting all nearby enemies' },
    { name: 'Shield Bash',  shortName: 'BSH', mpCost: 20, cooldown: 5000, damage: 1.2, type: 'single', effect: 'stun', duration: 2000, description: 'Stun an enemy for 2 seconds' },
    { name: 'War Cry',      shortName: 'CRY', mpCost: 25, cooldown: 15000, damage: 0, type: 'buff',    effect: 'attack_up', duration: 8000, description: 'Boost party attack by 30%' },
  ],
  ranger: [
    { name: 'Multi-Shot',   shortName: 'MLT', mpCost: 18, cooldown: 4000, damage: 0.8, type: 'multi',  count: 3, description: 'Fire 3 arrows in a spread' },
    { name: 'Poison Arrow',  shortName: 'PSN', mpCost: 12, cooldown: 3000, damage: 0.6, type: 'dot',    tickDamage: 5, duration: 5000, description: 'Poison dealing damage over time' },
    { name: 'Evasion',       shortName: 'EVD', mpCost: 20, cooldown: 12000, damage: 0, type: 'buff',    effect: 'dodge_up', duration: 5000, description: 'Greatly increase dodge chance' },
  ],
  mage: [
    { name: 'Fireball',     shortName: 'FBL', mpCost: 22, cooldown: 3500, damage: 2.5, type: 'aoe',    radius: 50, description: 'Explosive fireball dealing area damage' },
    { name: 'Frost Nova',   shortName: 'FRZ', mpCost: 18, cooldown: 6000, damage: 1.0, type: 'aoe',    radius: 80, effect: 'slow', duration: 3000, description: 'Freeze nearby enemies' },
    { name: 'Teleport',     shortName: 'TLP', mpCost: 30, cooldown: 8000, damage: 0,   type: 'movement', range: 150, description: 'Blink to target location' },
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

    // Quests
    this.questManager = new QuestManager();

    // Damage flash tracking
    this.lastDamageTaken = 0;

    // Affix debuffs (fire DoT, cold slow, etc.)
    this.debuffs = [];
  }

  recalcStats() {
    const s = this.stats;
    const eb = this.equipBonuses;
    const totalStr = s.str + eb.str;
    const totalDex = s.dex + eb.dex;
    const totalInt = s.int + eb.int;
    const totalVit = s.vit + eb.vit;

    this.maxHp = 100 + (totalVit * 10) + (this.level * 15);
    this.maxMp = 50 + (totalInt * 5) + (this.level * 8);
    this.armor = eb.armor + (totalVit * 0.5);
    this.critChance = 5 + (totalDex * 1);
    this.dodgeChance = totalDex * 0.5;
    this.attackPower = eb.damage + (totalStr * 2);
    this.spellPower = totalInt * 3;

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
    for (const slot of Object.keys(this.equipment)) {
      const item = this.equipment[slot];
      if (!item) continue;
      if (item.bonuses) {
        for (const [stat, val] of Object.entries(item.bonuses)) {
          if (this.equipBonuses[stat] !== undefined) {
            this.equipBonuses[stat] += val;
          }
        }
      }
      if (item.armor) this.equipBonuses.armor += item.armor;
      if (item.damage) this.equipBonuses.damage += item.damage;
    }
    this.recalcStats();
  }

  gainXp(amount) {
    if (!this.alive) return null;
    this.xp += amount;
    if (this.xp >= this.xpToNext) {
      return this.levelUp();
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
    return { level: this.level, freeStatPoints: this.freeStatPoints };
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
    this.hp = Math.min(this.maxHp, this.hp + Math.floor(this.maxHp * 0.35));
    return true;
  }

  useManaPotion() {
    if (this.manaPotions <= 0) return false;
    if (this.mp >= this.maxMp) return false;
    this.manaPotions -= 1;
    this.mp = Math.min(this.maxMp, this.mp + Math.floor(this.maxMp * 0.4));
    return true;
  }

  takeDamage(amount) {
    if (!this.alive || this.isDying) return 0;

    // Dodge check
    if (Math.random() * 100 < this.dodgeChance) {
      return -1; // dodged
    }

    // Armor reduction
    const reduced = Math.max(1, Math.floor(amount - this.armor * 0.4));
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
    this.skillCooldowns[index] = skill.cooldown;
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
    const slow = this.debuffs.find(d => d.effect === 'slow');
    return slow ? slow.speedMult : 1.0;
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
      buffs: this.buffs.map(b => ({ effect: b.effect, remaining: b.remaining })),
      debuffs: this.debuffs.map(d => ({ effect: d.effect, ticksRemaining: d.ticksRemaining })),
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

    // Recalc bonuses from restored equipment, then set HP/MP to max
    this.recalcEquipBonuses();
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
      lastDamageTaken: this.lastDamageTaken,
      quests: this.questManager.getActiveQuests(),
    };
  }
}

module.exports = { Player, CLASS_SKILLS, DEATH_DURATION, RESPAWN_HP_PERCENT, DEATH_GOLD_DROP_PERCENT };
