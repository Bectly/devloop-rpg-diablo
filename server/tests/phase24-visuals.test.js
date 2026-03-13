import { describe, it, expect } from 'vitest';
import { createRequire } from 'module';
const require = createRequire(import.meta.url);
const fs = require('fs');
const path = require('path');

// ── Source files under test ──────────────────────────────────────
const spritesSrc  = fs.readFileSync(path.join(__dirname, '../../client/tv/sprites.js'), 'utf8');
const screensSrc  = fs.readFileSync(path.join(__dirname, '../../client/phone/screens.js'), 'utf8');
const cssSrc      = fs.readFileSync(path.join(__dirname, '../../client/phone/style.css'), 'utf8');

// ══════════════════════════════════════════════════════════════════
// Phase 24 — Visual Features (loot beams, damage dots, skill tooltips)
// ══════════════════════════════════════════════════════════════════

describe('Loot Beams', () => {
  it('defines LOOT_BEAM_RARITIES constant with all rarity tiers', () => {
    expect(spritesSrc).toContain('LOOT_BEAM_RARITIES');
    expect(spritesSrc).toContain('rare:');
    expect(spritesSrc).toContain('epic:');
    expect(spritesSrc).toContain('legendary:');
    expect(spritesSrc).toContain('set:');
  });

  it('renders loot beam via fillRect', () => {
    expect(spritesSrc).toContain('_lootBeam');
    expect(spritesSrc).toContain('fillRect');
  });

  it('cleans up _lootBeam on destroy', () => {
    // _lootBeam.destroy() must appear to prevent Phaser graphics leak
    expect(spritesSrc).toContain('_lootBeam');
    expect(spritesSrc).toContain('_lootBeam.destroy');
  });
});

describe('Damage Type Dots', () => {
  it('defines DAMAGE_TYPE_DOT_COLORS for fire, cold, poison, lightning', () => {
    expect(spritesSrc).toContain('DAMAGE_TYPE_DOT_COLORS');
    expect(spritesSrc).toContain('fire:');
    expect(spritesSrc).toContain('cold:');
    expect(spritesSrc).toContain('poison:');
    expect(spritesSrc).toContain('lightning:');
  });

  it('renders damage type dot via fillCircle using m.damageType', () => {
    expect(spritesSrc).toContain('DAMAGE_TYPE_DOT_COLORS');
    expect(spritesSrc).toContain('m.damageType');
    expect(spritesSrc).toContain('fillCircle');
  });
});

describe('Spawn Animation', () => {
  it('handles spawning state with Back.easeOut tween', () => {
    expect(spritesSrc).toContain('m.spawning');
    expect(spritesSrc).toContain('_spawnDone');
    expect(spritesSrc).toContain('Back.easeOut');
  });
});

describe('Skill Damage Preview', () => {
  it('defines SKILL_DAMAGE_MULT level scaling array', () => {
    expect(screensSrc).toContain('SKILL_DAMAGE_MULT');
  });

  it('renders skill-tooltip-damage element with useSpellPower check', () => {
    expect(screensSrc).toContain('skill-tooltip-damage');
    expect(screensSrc).toContain('useSpellPower');
  });

  it('has CSS styles for .skill-tooltip-damage', () => {
    expect(cssSrc).toContain('.skill-tooltip-damage');
  });
});
