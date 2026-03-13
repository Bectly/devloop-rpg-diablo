// ─── DevLoop RPG — Projectile System (Phase 16.1) ───────────────
// Self-contained projectile physics: travel, collision, piercing, AOE.
// Projectiles are created by skills, updated in game loop, rendered by TV.

const { v4: uuidv4 } = require('uuid');

class Projectile {
  /**
   * @param {object} opts
   * @param {string} opts.ownerId   - player who fired it
   * @param {number} opts.x         - spawn x
   * @param {number} opts.y         - spawn y
   * @param {number} opts.vx        - velocity x (px/sec)
   * @param {number} opts.vy        - velocity y (px/sec)
   * @param {number} opts.speed     - magnitude (for normalization)
   * @param {number} opts.damage    - base damage on hit
   * @param {string} opts.damageType - 'physical', 'fire', 'cold', etc.
   * @param {boolean} opts.piercing - continues through first target
   * @param {number} opts.aoeRadius - 0 = no AOE, >0 = explodes on impact
   * @param {number} opts.lifetime  - ms before despawn
   * @param {string} opts.visual    - 'arrow', 'fireball', 'lightning', 'sniper'
   * @param {string} opts.skillName - originating skill name
   */
  constructor(opts) {
    this.id = uuidv4();
    this.ownerId = opts.ownerId;
    this.x = opts.x;
    this.y = opts.y;
    this.vx = opts.vx;
    this.vy = opts.vy;
    this.speed = opts.speed || 400;
    this.damage = opts.damage || 0;
    this.damageType = opts.damageType || 'physical';
    this.piercing = opts.piercing || false;
    this.aoeRadius = opts.aoeRadius || 0;
    this.lifetime = opts.lifetime || 2000;
    this.visual = opts.visual || 'arrow';
    this.skillName = opts.skillName || '';
    this.alive = true;
    this.hitIds = new Set(); // track pierced targets
  }

  serialize() {
    return {
      id: this.id,
      x: this.x,
      y: this.y,
      vx: this.vx,
      vy: this.vy,
      visual: this.visual,
      aoeRadius: this.aoeRadius,
    };
  }
}

/**
 * Create a projectile aimed at a target position.
 * @param {object} owner   - player (needs .id, .x, .y)
 * @param {number} targetX - destination x
 * @param {number} targetY - destination y
 * @param {object} opts    - additional Projectile options (damage, damageType, etc.)
 * @returns {Projectile}
 */
function createProjectile(owner, targetX, targetY, opts = {}) {
  const dx = targetX - owner.x;
  const dy = targetY - owner.y;
  const len = Math.sqrt(dx * dx + dy * dy) || 1;
  const speed = opts.speed || 400;

  return new Projectile({
    ownerId: owner.id,
    x: owner.x,
    y: owner.y,
    vx: (dx / len) * speed,
    vy: (dy / len) * speed,
    speed,
    ...opts,
  });
}

/**
 * Create a projectile aimed in a specific direction (angle in radians).
 * @param {object} owner - player
 * @param {number} angle - direction angle in radians
 * @param {object} opts  - additional options
 * @returns {Projectile}
 */
function createProjectileAngled(owner, angle, opts = {}) {
  const speed = opts.speed || 400;
  return new Projectile({
    ownerId: owner.id,
    x: owner.x,
    y: owner.y,
    vx: Math.cos(angle) * speed,
    vy: Math.sin(angle) * speed,
    speed,
    ...opts,
  });
}

/**
 * Update all projectiles: move, check lifetime, detect collisions.
 * Returns combat events (hits, deaths, explosions).
 *
 * @param {Projectile[]} projectiles - world.projectiles array (mutated: dead removed)
 * @param {object[]}     monsters    - world.monsters
 * @param {number}       dt          - delta time in ms
 * @param {object}       callbacks   - { onHit(proj, monster, dealt), onKill(proj, monster) }
 * @returns {object[]} events to push to combat.events
 */
function updateProjectiles(projectiles, monsters, dt) {
  const events = [];
  const hitRadius = 16; // collision radius for projectile vs monster

  for (let i = projectiles.length - 1; i >= 0; i--) {
    const proj = projectiles[i];
    if (!proj.alive) { projectiles.splice(i, 1); continue; }

    // Move
    proj.x += proj.vx * (dt / 1000);
    proj.y += proj.vy * (dt / 1000);
    proj.lifetime -= dt;

    // Out of bounds or expired
    if (proj.lifetime <= 0 || proj.x < -50 || proj.x > 1970 || proj.y < -50 || proj.y > 1330) {
      proj.alive = false;
      projectiles.splice(i, 1);
      continue;
    }

    // Collision detection: circle-circle vs alive hostile monsters
    for (const monster of monsters) {
      if (!monster.alive || monster.friendly) continue;
      if (proj.hitIds.has(monster.id)) continue; // already hit (piercing)

      const dx = monster.x - proj.x;
      const dy = monster.y - proj.y;
      const dist = Math.sqrt(dx * dx + dy * dy);
      const collisionDist = hitRadius + (monster.size || 14);

      if (dist <= collisionDist) {
        proj.hitIds.add(monster.id);

        if (proj.aoeRadius > 0) {
          // AOE explosion: damage all monsters in radius
          for (const aoeTarget of monsters) {
            if (!aoeTarget.alive || aoeTarget.friendly) continue;
            const adx = aoeTarget.x - proj.x;
            const ady = aoeTarget.y - proj.y;
            const adist = Math.sqrt(adx * adx + ady * ady);
            if (adist <= proj.aoeRadius) {
              const dealt = aoeTarget.takeDamage(proj.damage, proj.damageType);
              events.push({
                type: 'combat:hit',
                attackerId: proj.ownerId,
                targetId: aoeTarget.id,
                damage: dealt,
                damageType: proj.damageType,
                skillName: proj.skillName,
                targetHp: aoeTarget.hp,
                targetMaxHp: aoeTarget.maxHp,
                isProjectile: true,
              });
            }
          }
          events.push({
            type: 'effect:spawn',
            effectType: 'explosion',
            x: proj.x,
            y: proj.y,
            radius: proj.aoeRadius,
            damageType: proj.damageType,
          });
          proj.alive = false;
        } else {
          // Direct hit
          const dealt = monster.takeDamage(proj.damage, proj.damageType);
          events.push({
            type: 'combat:hit',
            attackerId: proj.ownerId,
            targetId: monster.id,
            damage: dealt,
            damageType: proj.damageType,
            skillName: proj.skillName,
            targetHp: monster.hp,
            targetMaxHp: monster.maxHp,
            isProjectile: true,
          });

          if (!proj.piercing) {
            proj.alive = false;
          }
        }

        // Only process one collision per frame for non-piercing
        if (!proj.alive) break;
      }
    }

    // Remove dead projectiles
    if (!proj.alive) {
      projectiles.splice(i, 1);
    }
  }

  return events;
}

module.exports = { Projectile, createProjectile, createProjectileAngled, updateProjectiles };
