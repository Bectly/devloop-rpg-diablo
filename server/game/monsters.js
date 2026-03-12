const { v4: uuidv4 } = require('uuid');

const MONSTER_DEFS = {
  skeleton: {
    name: 'Skeleton',
    hp: 80,
    damage: 12,
    armor: 3,
    speed: 80,
    attackRange: 40,
    attackSpeed: 1200,
    aggroRadius: 150,
    leashDistance: 400,
    xpReward: 25,
    lootTier: 1,
    behavior: 'melee',
    damageType: 'physical',
    color: 0xccccaa,
    size: 14,
  },
  zombie: {
    name: 'Zombie',
    hp: 150,
    damage: 18,
    armor: 2,
    speed: 45,
    attackRange: 40,
    attackSpeed: 2000,
    aggroRadius: 120,
    leashDistance: 300,
    xpReward: 35,
    lootTier: 2,
    behavior: 'melee_poison',
    damageType: 'poison',
    color: 0x66aa66,
    size: 16,
  },
  demon: {
    name: 'Demon',
    hp: 120,
    damage: 22,
    armor: 5,
    speed: 110,
    attackRange: 180,
    attackSpeed: 1500,
    aggroRadius: 200,
    leashDistance: 450,
    xpReward: 50,
    lootTier: 3,
    behavior: 'ranged',
    damageType: 'fire',
    color: 0xcc3333,
    size: 15,
  },
  archer: {
    name: 'Bone Archer',
    hp: 60,
    damage: 16,
    armor: 2,
    speed: 70,
    attackRange: 200,
    attackSpeed: 1800,
    aggroRadius: 220,
    leashDistance: 400,
    xpReward: 30,
    lootTier: 2,
    behavior: 'ranged_kite',
    damageType: 'physical',
    color: 0xccaa66,
    size: 13,
    projectileSpeed: 300,
    preferredRange: 140, // tries to stay at this distance
  },
  slime: {
    name: 'Slime',
    hp: 50,
    damage: 8,
    armor: 0,
    speed: 55,
    attackRange: 35,
    attackSpeed: 1400,
    aggroRadius: 100,
    leashDistance: 300,
    xpReward: 15,
    lootTier: 1,
    behavior: 'melee_split',
    damageType: 'poison',
    color: 0x44cc88,
    size: 12,
    splitCount: 2,     // splits into 2 smaller slimes on death
    splitType: 'slime_small',
  },
  slime_small: {
    name: 'Small Slime',
    hp: 20,
    damage: 4,
    armor: 0,
    speed: 65,
    attackRange: 30,
    attackSpeed: 1200,
    aggroRadius: 80,
    leashDistance: 250,
    xpReward: 8,
    lootTier: 0,
    behavior: 'melee',
    damageType: 'poison',
    color: 0x33aa77,
    size: 8,
  },
  boss_knight: {
    name: 'Dark Knight',
    hp: 500,
    damage: 35,
    armor: 15,
    speed: 70,
    attackRange: 50,
    attackSpeed: 1800,
    aggroRadius: 250,
    leashDistance: 600,
    xpReward: 200,
    lootTier: 4,
    behavior: 'boss',
    damageType: 'physical',
    color: 0x8800aa,
    size: 22,
    isBoss: true,
    phases: [
      { hpPercent: 100, mode: 'melee',      damageType: 'physical' },
      { hpPercent: 60,  mode: 'charge',     damageType: 'fire' },
      { hpPercent: 30,  mode: 'aoe_frenzy', damageType: 'physical' },
    ],
  },
};

const AI_STATES = {
  IDLE: 'idle',
  ALERT: 'alert',
  ATTACK: 'attack',
  FLEE: 'flee',
  LEASH: 'leash',
  DEAD: 'dead',
};

class Monster {
  constructor(type, x, y, floor = 0) {
    const def = MONSTER_DEFS[type];
    if (!def) throw new Error(`Unknown monster type: ${type}`);

    this.id = uuidv4();
    this.type = type;
    this.name = def.name;

    // Position
    this.x = x;
    this.y = y;
    this.spawnX = x;
    this.spawnY = y;
    this.facing = 'down';

    // Floor scaling
    const hpScale = 1 + floor * 0.2;
    const dmgScale = 1 + floor * 0.15;

    // Stats from definition (scaled by floor)
    this.maxHp = Math.floor(def.hp * hpScale);
    this.hp = this.maxHp;
    this.damage = Math.floor(def.damage * dmgScale);
    this.armor = def.armor + Math.floor(floor * 0.5);
    this.speed = def.speed;
    this.attackRange = def.attackRange;
    this.attackSpeed = def.attackSpeed;
    this.aggroRadius = def.aggroRadius;
    this.leashDistance = def.leashDistance;
    this.xpReward = Math.floor(def.xpReward * (1 + floor * 0.1));
    this.lootTier = def.lootTier + Math.floor(floor / 2);
    this.behavior = def.behavior;
    this.color = def.color;
    this.size = def.size;
    this.isBoss = def.isBoss || false;
    this.phases = def.phases || null;

    // Damage type
    this.damageType = def.damageType || 'physical';

    // Ranged/archer specifics
    this.projectileSpeed = def.projectileSpeed || 0;
    this.preferredRange = def.preferredRange || 0;

    // Split mechanics (slime)
    this.splitCount = def.splitCount || 0;
    this.splitType = def.splitType || null;

    // AI state
    this.aiState = AI_STATES.IDLE;
    this.targetId = null;
    this.attackCooldown = 0;
    this.alive = true;

    // Idle wandering
    this.wanderTimer = 0;
    this.wanderDx = 0;
    this.wanderDy = 0;

    // Boss phase tracking
    this.currentPhase = 0;

    // Effects
    this.stunned = 0;
    this.slowed = 0;
    this.poisonTick = 0;
    this.poisonDamage = 0;

    // Store floor for reference
    this.floor = floor;
  }

  distanceTo(entity) {
    const dx = this.x - entity.x;
    const dy = this.y - entity.y;
    return Math.sqrt(dx * dx + dy * dy);
  }

  findClosestPlayer(players) {
    let closest = null;
    let closestDist = Infinity;
    for (const player of players) {
      if (!player.alive) continue;
      const dist = this.distanceTo(player);
      if (dist < closestDist) {
        closestDist = dist;
        closest = player;
      }
    }
    return { player: closest, distance: closestDist };
  }

  moveToward(targetX, targetY, dt) {
    const dx = targetX - this.x;
    const dy = targetY - this.y;
    const dist = Math.sqrt(dx * dx + dy * dy);
    if (dist < 2) return;

    const speed = this.slowed > 0 ? this.speed * 0.5 : this.speed;
    const step = speed * (dt / 1000);
    const ratio = Math.min(step / dist, 1);

    this.x += dx * ratio;
    this.y += dy * ratio;

    if (Math.abs(dx) > Math.abs(dy)) {
      this.facing = dx > 0 ? 'right' : 'left';
    } else {
      this.facing = dy > 0 ? 'down' : 'up';
    }
  }

  moveAwayFrom(targetX, targetY, dt) {
    const dx = this.x - targetX;
    const dy = this.y - targetY;
    const dist = Math.sqrt(dx * dx + dy * dy);
    if (dist < 1) return;

    const speed = this.slowed > 0 ? this.speed * 0.5 : this.speed;
    const step = speed * (dt / 1000);

    this.x += (dx / dist) * step;
    this.y += (dy / dist) * step;

    if (Math.abs(dx) > Math.abs(dy)) {
      this.facing = dx > 0 ? 'right' : 'left';
    } else {
      this.facing = dy > 0 ? 'down' : 'up';
    }
  }

  update(dt, players) {
    if (!this.alive) return [];
    const events = [];

    // Decrement stun/slow
    if (this.stunned > 0) {
      this.stunned -= dt;
      return events;
    }
    if (this.slowed > 0) {
      this.slowed -= dt;
    }

    // Attack cooldown
    if (this.attackCooldown > 0) {
      this.attackCooldown -= dt;
    }

    // Boss phase check
    if (this.isBoss && this.phases) {
      const hpPercent = (this.hp / this.maxHp) * 100;
      for (let i = this.phases.length - 1; i >= 0; i--) {
        if (hpPercent <= this.phases[i].hpPercent) {
          if (this.currentPhase !== i) {
            this.currentPhase = i;
            events.push({ type: 'boss_phase', monsterId: this.id, phase: i, mode: this.phases[i].mode });
          }
          break;
        }
      }
    }

    const { player: closest, distance: closestDist } = this.findClosestPlayer(players);

    switch (this.aiState) {
      case AI_STATES.IDLE:
        this.wanderTimer -= dt;
        if (this.wanderTimer <= 0) {
          this.wanderTimer = 2000 + Math.random() * 3000;
          const angle = Math.random() * Math.PI * 2;
          this.wanderDx = Math.cos(angle) * 30;
          this.wanderDy = Math.sin(angle) * 30;
        }
        this.moveToward(this.spawnX + this.wanderDx, this.spawnY + this.wanderDy, dt);

        if (closest && closestDist < this.aggroRadius) {
          this.aiState = AI_STATES.ALERT;
          this.targetId = closest.id;
        }
        break;

      case AI_STATES.ALERT:
        if (!closest || !closest.alive) {
          this.aiState = AI_STATES.IDLE;
          this.targetId = null;
          break;
        }

        // Check leash
        const distFromSpawn = Math.sqrt(
          (this.x - this.spawnX) ** 2 + (this.y - this.spawnY) ** 2
        );
        if (distFromSpawn > this.leashDistance) {
          this.aiState = AI_STATES.LEASH;
          this.targetId = null;
          break;
        }

        // Archer kiting behavior
        if (this.behavior === 'ranged_kite' && this.preferredRange > 0) {
          if (closestDist < this.preferredRange * 0.7) {
            // Too close, back away
            this.moveAwayFrom(closest.x, closest.y, dt);
          } else if (closestDist > this.preferredRange * 1.3) {
            // Too far, move closer
            this.moveToward(closest.x, closest.y, dt);
          }
          // At preferred range, strafe slightly
          else {
            const strafeAngle = Math.atan2(closest.y - this.y, closest.x - this.x) + Math.PI / 2;
            this.moveToward(
              this.x + Math.cos(strafeAngle) * 20,
              this.y + Math.sin(strafeAngle) * 20,
              dt
            );
          }
        } else {
          this.moveToward(closest.x, closest.y, dt);
        }

        if (closestDist <= this.attackRange) {
          this.aiState = AI_STATES.ATTACK;
        }

        this.targetId = closest.id;
        break;

      case AI_STATES.ATTACK:
        if (!closest || !closest.alive) {
          this.aiState = AI_STATES.IDLE;
          this.targetId = null;
          break;
        }

        if (closestDist > this.attackRange * 1.2) {
          this.aiState = AI_STATES.ALERT;
          break;
        }

        // Flee behavior for weak non-boss monsters
        if (!this.isBoss && this.hp < this.maxHp * 0.2 && this.behavior !== 'boss') {
          this.aiState = AI_STATES.FLEE;
          break;
        }

        // Archer repositioning during attack
        if (this.behavior === 'ranged_kite' && closestDist < this.preferredRange * 0.5) {
          this.moveAwayFrom(closest.x, closest.y, dt);
        }

        // Attack
        if (this.attackCooldown <= 0) {
          this.attackCooldown = this.attackSpeed;

          let dmg = this.damage;
          let attackType = 'melee';
          let damageType = this.damageType;

          // Boss phase modifiers
          if (this.isBoss && this.phases) {
            const phase = this.phases[this.currentPhase];
            if (phase.mode === 'charge') {
              dmg = Math.floor(this.damage * 1.5);
              attackType = 'charge';
            } else if (phase.mode === 'aoe_frenzy') {
              dmg = Math.floor(this.damage * 0.8);
              attackType = 'aoe';
            }
            // Phase-specific damage type override
            if (phase.damageType) {
              damageType = phase.damageType;
            }
          }

          if (this.behavior === 'melee_poison') {
            attackType = 'poison';
          }

          if (this.behavior === 'ranged' || this.behavior === 'ranged_kite') {
            attackType = 'ranged';
          }

          events.push({
            type: 'monster_attack',
            monsterId: this.id,
            targetId: closest.id,
            damage: dmg,
            damageType,
            attackType,
            projectile: this.behavior === 'ranged_kite' ? {
              fromX: this.x,
              fromY: this.y,
              toX: closest.x,
              toY: closest.y,
              speed: this.projectileSpeed,
            } : null,
          });
        }

        // Face the target
        const atDx = closest.x - this.x;
        const atDy = closest.y - this.y;
        if (Math.abs(atDx) > Math.abs(atDy)) {
          this.facing = atDx > 0 ? 'right' : 'left';
        } else {
          this.facing = atDy > 0 ? 'down' : 'up';
        }
        break;

      case AI_STATES.FLEE:
        if (closest) {
          this.moveAwayFrom(closest.x, closest.y, dt);
        }
        if (this.hp > this.maxHp * 0.3 || !closest || closestDist > this.aggroRadius * 2) {
          this.aiState = AI_STATES.ALERT;
        }
        break;

      case AI_STATES.LEASH:
        this.moveToward(this.spawnX, this.spawnY, dt);
        const distToSpawn = Math.sqrt(
          (this.x - this.spawnX) ** 2 + (this.y - this.spawnY) ** 2
        );
        if (distToSpawn < 10) {
          this.aiState = AI_STATES.IDLE;
          this.hp = this.maxHp;
        }
        break;
    }

    return events;
  }

  takeDamage(amount) {
    if (!this.alive) return 0;
    if (amount <= 0) return 0;
    const reduced = Math.max(1, Math.floor(amount - this.armor * 0.4));
    this.hp -= reduced;
    if (this.hp <= 0) {
      this.hp = 0;
      this.alive = false;
      this.aiState = AI_STATES.DEAD;
    }
    return reduced;
  }

  applyStun(duration) {
    this.stunned = Math.max(this.stunned, duration);
  }

  applySlow(duration) {
    this.slowed = Math.max(this.slowed, duration);
  }

  // Returns split monsters array if this monster splits on death (slime)
  getSplitMonsters() {
    if (!this.splitType || !this.splitCount || this.type === 'slime_small') return [];

    const splits = [];
    for (let i = 0; i < this.splitCount; i++) {
      const offsetX = (Math.random() - 0.5) * 40;
      const offsetY = (Math.random() - 0.5) * 40;
      const split = new Monster(this.splitType, this.x + offsetX, this.y + offsetY, this.floor);
      splits.push(split);
    }
    return splits;
  }

  serialize() {
    return {
      id: this.id,
      type: this.type,
      name: this.name,
      x: Math.round(this.x),
      y: Math.round(this.y),
      facing: this.facing,
      hp: this.hp,
      maxHp: this.maxHp,
      alive: this.alive,
      aiState: this.aiState,
      isBoss: this.isBoss,
      color: this.color,
      size: this.size,
      stunned: this.stunned > 0,
      slowed: this.slowed > 0,
      behavior: this.behavior,
      // Affix data
      affixes: this.affixes || null,
      isElite: this.isElite || false,
      eliteRank: this.eliteRank || null,
      shieldActive: this.shieldActive || false,
      fireEnchanted: this.fireEnchanted || false,
      coldEnchanted: this.coldEnchanted || false,
    };
  }
}

function createMonster(type, x, y, floor = 0) {
  return new Monster(type, x, y, floor);
}

module.exports = { Monster, createMonster, MONSTER_DEFS, AI_STATES };
