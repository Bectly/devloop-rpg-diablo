import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));

// ── Source files under test ──────────────────────────────────────
const spritesSrc     = readFileSync(join(__dirname, '../../client/tv/sprites.js'), 'utf8');
const statsUiSrc     = readFileSync(join(__dirname, '../../client/phone/stats-ui.js'), 'utf8');
const cssSrc         = readFileSync(join(__dirname, '../../client/phone/style.css'), 'utf8');
const indexHtmlSrc   = readFileSync(join(__dirname, '../../client/phone/index.html'), 'utf8');
const controllerSrc  = readFileSync(join(__dirname, '../../client/phone/controller.js'), 'utf8');

// ══════════════════════════════════════════════════════════════════
// Cycle #228 — Visual Features (spawn shadow, quick-compare, join status)
// ══════════════════════════════════════════════════════════════════

describe('Spawn Shadow (sprites.js)', () => {
  it('creates _spawnShadow when m.spawning is true', () => {
    expect(spritesSrc).toContain('m.spawning');
    expect(spritesSrc).toContain('_spawnShadow');
    // Shadow is created inside the spawning block
    expect(spritesSrc).toContain('sprite._spawnShadow = scene.add.graphics()');
  });

  it('sets shadow depth lower than sprite (depth - 1)', () => {
    expect(spritesSrc).toContain('.setDepth(sprite.depth - 1)');
  });

  it('destroys _spawnShadow in destroyMonsterSprite cleanup', () => {
    // The pattern appears in the destroy path for individual monsters
    expect(spritesSrc).toContain('if (sprite._spawnShadow) sprite._spawnShadow.destroy()');
  });

  it('destroys _spawnShadow in cleanupMonsterSprites bulk cleanup', () => {
    // _spawnShadow.destroy() must appear multiple times (individual + bulk cleanup paths)
    const matches = spritesSrc.match(/sprite\._spawnShadow\).*?\.destroy\(\)/g);
    expect(matches).not.toBeNull();
    expect(matches.length).toBeGreaterThanOrEqual(2);
  });

  it('renders shadow as a dark ellipse via fillEllipse', () => {
    expect(spritesSrc).toContain('fillEllipse');
    expect(spritesSrc).toContain('_spawnShadow.fillStyle(0x000000');
  });

  it('fades out and destroys shadow on spawn transition', () => {
    // When spawning ends, old shadow is nulled and tweened out
    expect(spritesSrc).toContain('sprite._spawnShadow = null');
  });
});

describe('Quick-Compare Tooltip (stats-ui.js)', () => {
  it('uses compare-section class for the comparison block', () => {
    expect(statsUiSrc).toContain('compare-section');
  });

  it('applies compare-better class for positive stat differences', () => {
    expect(statsUiSrc).toContain("'compare-better'");
  });

  it('applies compare-worse class for negative stat differences', () => {
    expect(statsUiSrc).toContain("'compare-worse'");
  });

  it('compares against equipped item via equipment[item.slot]', () => {
    expect(statsUiSrc).toContain('playerStats.equipment[item.slot]');
  });

  it('assigns class based on diff sign (positive = better, negative = worse)', () => {
    expect(statsUiSrc).toContain("diff > 0 ? 'compare-better' : 'compare-worse'");
  });

  it('compares damage, armor, and bonuses', () => {
    expect(statsUiSrc).toContain('item.damage');
    expect(statsUiSrc).toContain('equipped.damage');
    expect(statsUiSrc).toContain('item.armor');
    expect(statsUiSrc).toContain('equipped.armor');
    expect(statsUiSrc).toContain('item.bonuses');
    expect(statsUiSrc).toContain('equipped.bonuses');
  });

  it('only shows compare section for non-equipped items with a slot', () => {
    expect(statsUiSrc).toContain('!isEquipped && item.slot && playerStats');
  });
});

describe('Compare CSS (style.css)', () => {
  it('defines .compare-section style', () => {
    expect(cssSrc).toContain('.compare-section');
  });

  it('defines .compare-better with green color #44ff44', () => {
    expect(cssSrc).toContain('.compare-better');
    expect(cssSrc).toContain('#44ff44');
  });

  it('defines .compare-worse with red color #ff4444', () => {
    expect(cssSrc).toContain('.compare-worse');
    expect(cssSrc).toContain('#ff4444');
  });
});

describe('Join Screen Status (index.html)', () => {
  it('contains #join-status element', () => {
    expect(indexHtmlSrc).toContain('id="join-status"');
  });

  it('join-status has connecting class by default', () => {
    expect(indexHtmlSrc).toContain('join-status connecting');
  });

  it('join-status shows "Connecting..." as initial text', () => {
    expect(indexHtmlSrc).toContain('Connecting...');
  });
});

describe('Join Screen Status (controller.js)', () => {
  it('defines doJoin() function', () => {
    expect(controllerSrc).toContain('function doJoin()');
  });

  it('doJoin emits join event with name, class, and hardcore', () => {
    expect(controllerSrc).toContain("socket.emit('join'");
    expect(controllerSrc).toContain('characterClass');
    expect(controllerSrc).toContain('hardcore');
  });

  it('handles connect_error event', () => {
    expect(controllerSrc).toContain("socket.on('connect_error'");
  });

  it('updates join-status text on connect_error', () => {
    expect(controllerSrc).toContain('Connection failed:');
  });

  it('updates join-status on successful connection', () => {
    expect(controllerSrc).toContain("joinStatus.className = 'join-status connected'");
  });

  it('updates join-status on disconnect', () => {
    expect(controllerSrc).toContain("joinStatus.className = 'join-status disconnected'");
  });

  it('updates join-status on reconnect attempt', () => {
    expect(controllerSrc).toContain("joinStatus.className = 'join-status connecting'");
  });
});
