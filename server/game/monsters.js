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
    color: 0xcc3333,
    size: 15,
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
    color: 0x8800aa,
    size: 22,
    isBoss: true,
    phases: [
      { hpPercent: 100, mode: 'melee' },
      { hpPercent: 60, mode: 'charge' },
      { hpPercent: 30, mode: 'aoe_frenzy' },
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
  constructor(type, x, y) {
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

    // Stats from definition
    this.maxHp = def.hp;
    this.hp = def.hp;
    this.damage = def.damage;
    this.armor = def.armor;
    this.speed = def.speed;
    this.attackRange = def.attackRange;
    this.attackSpeed = def.attackSpeed;
    this.aggroRadius = def.aggroRadius;
    this.leashDistance = def.leashDistance;
    this.xpReward = def.xpReward;
    this.lootTier = def.lootTier;
    this.behavior = def.behavior;
    this.color = def.color;
    this.size = def.size;
    this.isBoss = def.isBoss || false;
    this.phases = def.phases || null;

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
    this.stunned = 0; // ms remaining
    this.slowed = 0;
    this.poisonTick = 0;
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

    // Update facing
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
      return events; // can't do anything while stunned
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
        // Wander randomly
        this.wanderTimer -= dt;
        if (this.wanderTimer <= 0) {
          this.wanderTimer = 2000 + Math.random() * 3000;
          const angle = Math.random() * Math.PI * 2;
          this.wanderDx = Math.cos(angle) * 30;
          this.wanderDy = Math.sin(angle) * 30;
        }
        this.moveToward(this.spawnX + this.wanderDx, this.spawnY + this.wanderDy, dt);

        // Check aggro
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

        // Move toward target
        this.moveToward(closest.x, closest.y, dt);

        // Switch to attack when in range
        if (closestDist <= this.attackRange) {
          this.aiState = AI_STATES.ATTACK;
        }

        // Re-target closest
        this.targetId = closest.id;
        break;

      case AI_STATES.ATTACK:
        if (!closest || !closest.alive) {
          this.aiState = AI_STATES.IDLE;
          this.targetId = null;
          break;
        }

        // If out of range, chase
        if (closestDist > this.attackRange * 1.2) {
          this.aiState = AI_STATES.ALERT;
          break;
        }

        // Flee behavior for weak monsters
        if (!this.isBoss && this.hp < this.maxHp * 0.2 && this.behavior !== 'boss') {
          this.aiState = AI_STATES.FLEE;
          break;
        }

        // Attack
        if (this.attackCooldown <= 0) {
          this.attackCooldown = this.attackSpeed;

          let dmg = this.damage;
          let attackType = 'melee';

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
          }

          // Poison for zombies
          if (this.behavior === 'melee_poison') {
            attackType = 'poison';
          }

          if (this.behavior === 'ranged') {
            attackType = 'ranged';
          }

          events.push({
            type: 'monster_attack',
            monsterId: this.id,
            targetId: closest.id,
            damage: dmg,
            attackType,
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
          // Move away from player
          const fleeDx = this.x - closest.x;
          const fleeDy = this.y - closest.y;
          const fleeDist = Math.sqrt(fleeDx * fleeDx + fleeDy * fleeDy);
          if (fleeDist > 0) {
            this.moveToward(
              this.x + (fleeDx / fleeDist) * 100,
              this.y + (fleeDy / fleeDist) * 100,
              dt
            );
          }
        }
        // Return to alert if healed or far enough
        if (this.hp > this.maxHp * 0.3 || !closest || closestDist > this.aggroRadius * 2) {
          this.aiState = AI_STATES.ALERT;
        }
        break;

      case AI_STATES.LEASH:
        // Return to spawn
        this.moveToward(this.spawnX, this.spawnY, dt);
        const distToSpawn = Math.sqrt(
          (this.x - this.spawnX) ** 2 + (this.y - this.spawnY) ** 2
        );
        if (distToSpawn < 10) {
          this.aiState = AI_STATES.IDLE;
          // Heal on leash
          this.hp = this.maxHp;
        }
        break;
    }

    return events;
  }

  takeDamage(amount) {
    if (!this.alive) return 0;
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
    };
  }
}

function createMonster(type, x, y) {
  return new Monster(type, x, y);
}

module.exports = { Monster, createMonster, MONSTER_DEFS, AI_STATES };
