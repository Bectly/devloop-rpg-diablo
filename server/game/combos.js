// ─── Cross-Class Combo System ───────────────────────────────────────
// Detects when two players combine skill effects for bonus damage/effects.
// Checked each tick in the game loop after combat events are processed.

/**
 * Combo definitions. Each combo has:
 * - id: unique identifier
 * - name: display name
 * - conditions: what triggers it
 * - effect: what happens
 * - cooldown: ms before this combo can trigger again
 */
const COMBO_DEFS = [
  {
    id: 'shatter_blast',
    name: 'Shatter Blast',
    description: 'Frozen enemy shattered by physical hit — ice explosion!',
    // Trigger: monster is stunned (frozen by Blizzard L5) AND takes physical damage from a different player
    check(monster, event, players) {
      if (event.type !== 'combat:hit') return null;
      if (event.damageType !== 'physical') return null;
      if (!monster.stunned || monster.stunned <= 0) return null;
      // Must be from a different player than whoever froze it
      // We can't track who froze, so just require 2+ players alive
      const alivePlayers = players.filter(p => p.alive);
      if (alivePlayers.length < 2) return null;
      return { targetId: monster.id, x: monster.x, y: monster.y, triggerId: event.attackerId, damage: event.damage || 0 };
    },
    execute(combo, monster, players) {
      const results = [];
      // Ice explosion: AOE 100px around the shattered monster
      const aoeDamage = Math.floor((combo.damage || 50) * 2);
      results.push({
        type: 'combo:trigger',
        comboId: 'shatter_blast',
        comboName: 'Shatter Blast',
        x: monster.x,
        y: monster.y,
        radius: 100,
        damage: aoeDamage,
        triggerId: combo.triggerId,
      });
      return results;
    },
    cooldown: 5000,
  },
  {
    id: 'chain_reaction',
    name: 'Chain Reaction',
    description: 'Chain Lightning hits an arrow-pierced target — sparks fly to all nearby!',
    // Trigger: monster was hit by Chain Lightning AND has an active Arrow Volley projectile hit within 2s
    check(monster, event, players) {
      if (event.type !== 'combat:hit') return null;
      if (event.skillName !== 'Chain Lightning') return null;
      // Check if monster was recently hit by Arrow Volley (tracked via recentHits)
      if (!monster._recentVolleyHit || Date.now() - monster._recentVolleyHit > 2000) return null;
      const alivePlayers = players.filter(p => p.alive);
      if (alivePlayers.length < 2) return null;
      return { targetId: monster.id, x: monster.x, y: monster.y, triggerId: event.attackerId };
    },
    execute(combo, monster, players) {
      return [{
        type: 'combo:trigger',
        comboId: 'chain_reaction',
        comboName: 'Chain Reaction',
        x: monster.x,
        y: monster.y,
        radius: 120,
        triggerId: combo.triggerId,
      }];
    },
    cooldown: 5000,
  },
  {
    id: 'battle_fury',
    name: 'Battle Fury',
    description: 'Whirlwind during Battle Shout — vortex pulls enemies in!',
    // Trigger: Whirlwind hit while caster has attack_up buff (from Battle Shout)
    check(monster, event, players) {
      if (event.type !== 'combat:hit') return null;
      if (event.skillName !== 'Whirlwind') return null;
      const attacker = players.find(p => p.id === event.attackerId);
      if (!attacker) return null;
      if (!attacker.buffs || !attacker.buffs.some(b => b.effect === 'attack_up')) return null;
      // Need another player to have cast the shout (can't self-combo warrior)
      const alivePlayers = players.filter(p => p.alive);
      if (alivePlayers.length < 2) return null;
      return { targetId: monster.id, x: attacker.x, y: attacker.y, triggerId: attacker.id };
    },
    execute(combo, monster, players) {
      return [{
        type: 'combo:trigger',
        comboId: 'battle_fury',
        comboName: 'Battle Fury',
        x: combo.x,
        y: combo.y,
        radius: 140,
        effect: 'pull',
        triggerId: combo.triggerId,
      }];
    },
    cooldown: 8000,
  },
  {
    id: 'shadow_barrage',
    name: 'Shadow Barrage',
    description: 'Sniper Shot while shadow decoy is alive — fires from decoy too!',
    // Trigger: Sniper Shot projectile created while a shadow decoy exists
    check(monster, event, players) {
      // This checks events, not monsters — use a special path
      if (event.type !== 'projectile:create') return null;
      if (event.skillName !== 'Sniper Shot') return null;
      return { triggerId: event.ownerId, x: event.x, y: event.y, angle: event.angle };
    },
    needsDecoy: true, // Special flag: combo system checks for active decoys
    execute(combo, monster, players, world) {
      // Find active shadow decoy
      if (!world || !world.monsters) return [];
      const decoy = world.monsters.find(m => m.name === 'Shadow Decoy' && m.alive && m.friendly);
      if (!decoy) return [];
      return [{
        type: 'combo:trigger',
        comboId: 'shadow_barrage',
        comboName: 'Shadow Barrage',
        x: decoy.x,
        y: decoy.y,
        angle: combo.angle,
        effect: 'duplicate_projectile',
        triggerId: combo.triggerId,
      }];
    },
    cooldown: 8000,
  },
  {
    id: 'firestorm',
    name: 'Firestorm',
    description: 'Blizzard meets burning ground — steam cloud blinds enemies!',
    // Trigger: Blizzard hits a monster standing in burning ground area
    check(monster, event, players) {
      if (event.type !== 'combat:hit') return null;
      if (event.skillName !== 'Blizzard') return null;
      // Check if there's active burning ground near this monster
      if (!monster._inBurningGround) return null;
      const alivePlayers = players.filter(p => p.alive);
      if (alivePlayers.length < 2) return null;
      return { targetId: monster.id, x: monster.x, y: monster.y, triggerId: event.attackerId };
    },
    execute(combo, monster, players) {
      return [{
        type: 'combo:trigger',
        comboId: 'firestorm',
        comboName: 'Firestorm',
        x: combo.x,
        y: combo.y,
        radius: 100,
        effect: 'blind',
        duration: 3000,
        triggerId: combo.triggerId,
      }];
    },
    cooldown: 6000,
  },
];

/**
 * Combo tracker — manages cooldowns and detection.
 */
class ComboTracker {
  constructor() {
    this.cooldowns = {}; // { comboId: expiresAt }
  }

  /**
   * Check all combat events against combo definitions.
   * @param {object[]} events - combat events from this tick
   * @param {object[]} players - all players
   * @param {object[]} monsters - all monsters
   * @param {object} world - world state (for decoy check)
   * @returns {object[]} combo trigger events
   */
  checkCombos(events, players, monsters, world) {
    const now = Date.now();
    const comboEvents = [];

    // Track Arrow Volley hits on monsters (for Chain Reaction)
    for (const event of events) {
      if (event.type === 'combat:hit' && event.skillName === 'Arrow Volley') {
        const target = monsters.find(m => m.id === event.targetId);
        if (target) target._recentVolleyHit = now;
      }
    }

    for (const event of events) {
      for (const combo of COMBO_DEFS) {
        // Skip if on cooldown
        if (this.cooldowns[combo.id] && this.cooldowns[combo.id] > now) continue;

        // For monster-targeted combos
        if (event.targetId) {
          const monster = monsters.find(m => m.id === event.targetId);
          if (!monster || !monster.alive) continue;

          const match = combo.check(monster, event, players);
          if (match) {
            const results = combo.execute(match, monster, players, world);
            comboEvents.push(...results);
            this.cooldowns[combo.id] = now + combo.cooldown;
            break; // One combo per event
          }
        }

        // For non-monster-targeted events (like projectile:create for Shadow Barrage)
        if (combo.needsDecoy && event.type === 'projectile:create') {
          const match = combo.check(null, event, players);
          if (match) {
            const results = combo.execute(match, null, players, world);
            if (results.length > 0) {
              comboEvents.push(...results);
              this.cooldowns[combo.id] = now + combo.cooldown;
            }
          }
        }
      }
    }

    return comboEvents;
  }

  /**
   * Reset all cooldowns (e.g., on game restart).
   */
  reset() {
    this.cooldowns = {};
  }
}

module.exports = { ComboTracker, COMBO_DEFS };
