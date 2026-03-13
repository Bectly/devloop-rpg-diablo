import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));

// ── Source files under test ──────────────────────────────────────
const lightingSrc = readFileSync(join(__dirname, '../../client/tv/lighting.js'), 'utf8');
const soundSrc    = readFileSync(join(__dirname, '../../client/shared/sound.js'), 'utf8');

// ══════════════════════════════════════════════════════════════════
// Cycle #232-233 — Phase 25 Atmosphere (lighting, zone particles,
//                  wall sconces, ambient drone, boss music)
// ══════════════════════════════════════════════════════════════════

describe('Lighting exports (lighting.js)', () => {
  it('exports init function', () => {
    expect(lightingSrc).toContain('function init(scene)');
  });

  it('exports update function', () => {
    expect(lightingSrc).toContain('function update(scene, players, world)');
  });

  it('exports cleanup function', () => {
    expect(lightingSrc).toContain('function cleanup()');
  });

  it('exports triggerBossBurst function', () => {
    expect(lightingSrc).toContain('function triggerBossBurst(centerX, centerY)');
  });

  it('returns all four public methods from the IIFE', () => {
    expect(lightingSrc).toContain('return { init, update, cleanup, triggerBossBurst }');
  });
});

describe('ZONE_PARTICLES config (lighting.js)', () => {
  it('defines catacombs zone', () => {
    expect(lightingSrc).toContain("catacombs: { colors:");
  });

  it('defines inferno zone', () => {
    expect(lightingSrc).toContain("inferno:   { colors:");
  });

  it('defines abyss zone', () => {
    expect(lightingSrc).toContain("abyss:     { colors:");
  });

  it('catacombs has colors array, speedMult, and sineWave', () => {
    const match = lightingSrc.match(/catacombs:\s*\{[^}]*colors:\s*\[[^\]]+\][^}]*speedMult:\s*[\d.]+[^}]*sineWave:\s*(true|false)/);
    expect(match).not.toBeNull();
  });

  it('inferno has colors array, speedMult, and sineWave', () => {
    const match = lightingSrc.match(/inferno:\s*\{[^}]*colors:\s*\[[^\]]+\][^}]*speedMult:\s*[\d.]+[^}]*sineWave:\s*(true|false)/);
    expect(match).not.toBeNull();
  });

  it('abyss has colors array, speedMult, and sineWave', () => {
    const match = lightingSrc.match(/abyss:\s*\{[^}]*colors:\s*\[[^\]]+\][^}]*speedMult:\s*[\d.]+[^}]*sineWave:\s*(true|false)/);
    expect(match).not.toBeNull();
  });
});

describe('Zone particle colors are distinct (lighting.js)', () => {
  // Extract color arrays from ZONE_PARTICLES (use [\s\S] to cross line/brace boundaries)
  const catColors = lightingSrc.match(/ZONE_PARTICLES\s*=\s*\{[\s\S]*?catacombs:\s*\{[^}]*colors:\s*\[([^\]]+)\]/);
  const infColors = lightingSrc.match(/ZONE_PARTICLES\s*=\s*\{[\s\S]*?inferno:\s*\{[^}]*colors:\s*\[([^\]]+)\]/);
  const abyColors = lightingSrc.match(/ZONE_PARTICLES\s*=\s*\{[\s\S]*?abyss:\s*\{[^}]*colors:\s*\[([^\]]+)\]/);

  it('catacombs colors are defined', () => {
    expect(catColors).not.toBeNull();
  });

  it('inferno colors are defined', () => {
    expect(infColors).not.toBeNull();
  });

  it('abyss colors are defined', () => {
    expect(abyColors).not.toBeNull();
  });

  it('each zone has different color values', () => {
    // Raw color strings from each zone should all differ
    expect(catColors[1]).not.toEqual(infColors[1]);
    expect(catColors[1]).not.toEqual(abyColors[1]);
    expect(infColors[1]).not.toEqual(abyColors[1]);
  });
});

describe('SCONCE_CHANCE (lighting.js)', () => {
  it('SCONCE_CHANCE is defined', () => {
    expect(lightingSrc).toContain('SCONCE_CHANCE');
  });

  it('SCONCE_CHANCE is between 0.01 and 0.5', () => {
    const match = lightingSrc.match(/SCONCE_CHANCE\s*=\s*([\d.]+)/);
    expect(match).not.toBeNull();
    const value = parseFloat(match[1]);
    expect(value).toBeGreaterThanOrEqual(0.01);
    expect(value).toBeLessThanOrEqual(0.5);
  });
});

describe('SCONCE_COLORS (lighting.js)', () => {
  it('defines catacombs sconce color', () => {
    expect(lightingSrc).toContain("catacombs: { color:");
  });

  it('defines inferno sconce color', () => {
    expect(lightingSrc).toContain("inferno:   { color:");
  });

  it('defines abyss sconce color', () => {
    expect(lightingSrc).toContain("abyss:     { color:");
  });
});

describe('Boss burst (lighting.js)', () => {
  it('BOSS_BURST_COUNT is 30', () => {
    const match = lightingSrc.match(/BOSS_BURST_COUNT\s*=\s*(\d+)/);
    expect(match).not.toBeNull();
    expect(parseInt(match[1])).toBe(30);
  });

  it('triggerBossBurst loops BOSS_BURST_COUNT times', () => {
    expect(lightingSrc).toContain('i < BOSS_BURST_COUNT');
  });

  it('burst particles are pushed with radial velocity (cos/sin)', () => {
    expect(lightingSrc).toContain('Math.cos(angle) * speed');
    expect(lightingSrc).toContain('Math.sin(angle) * speed');
  });
});

describe('Sound exports — ambient and boss (sound.js)', () => {
  it('exports ambientDroneStart(zoneId)', () => {
    expect(soundSrc).toContain('ambientDroneStart(zoneId)');
  });

  it('exports ambientDroneStop()', () => {
    expect(soundSrc).toContain('ambientDroneStop()');
  });

  it('exports bossMusic()', () => {
    expect(soundSrc).toContain('bossMusic()');
  });

  it('exports bossStop()', () => {
    expect(soundSrc).toContain('bossStop()');
  });

  it('exports floorTransition(zoneId)', () => {
    expect(soundSrc).toContain('floorTransition(zoneId)');
  });
});

describe('Ambient drone — zone-specific config (sound.js)', () => {
  it('defines catacombs drone config', () => {
    expect(soundSrc).toContain("catacombs: { freq:");
  });

  it('defines inferno drone config', () => {
    expect(soundSrc).toContain("inferno:   { freq:");
  });

  it('defines abyss drone config', () => {
    expect(soundSrc).toContain("abyss:     { freq:");
  });

  it('uses dual oscillators (osc and osc2) for richness', () => {
    // Extract ambientDroneStart body up to the ambientDroneStop definition
    // (skip the this.ambientDroneStop() call inside the function by searching for the
    //  standalone method definition pattern with leading newline)
    const startIdx = soundSrc.indexOf('ambientDroneStart(zoneId)');
    const endIdx = soundSrc.indexOf('\n  ambientDroneStop()', startIdx);
    const droneBlock = soundSrc.slice(startIdx, endIdx);
    expect(droneBlock).toContain('osc.start');
    expect(droneBlock).toContain('osc2.start');
  });

  it('creates filtered noise layer for texture', () => {
    const startIdx = soundSrc.indexOf('ambientDroneStart(zoneId)');
    const endIdx = soundSrc.indexOf('\n  ambientDroneStop()', startIdx);
    const droneBlock = soundSrc.slice(startIdx, endIdx);
    expect(droneBlock).toContain('createBiquadFilter');
    expect(droneBlock).toContain('noiseSrc.start');
  });
});

describe('Boss music — diminished chord (sound.js)', () => {
  it('bossMusic plays a diminished triad', () => {
    // C-Eb-Gb diminished frequencies
    expect(soundSrc).toContain('130.81');
    expect(soundSrc).toContain('155.56');
    expect(soundSrc).toContain('185.00');
  });
});

describe('Floor transition — zone-specific pitch (sound.js)', () => {
  it('defines zone-specific pitch values', () => {
    expect(soundSrc).toContain('catacombs: 80');
    expect(soundSrc).toContain('inferno: 60');
    expect(soundSrc).toContain('abyss: 50');
  });

  it('falls back to 80 when zone is unknown', () => {
    expect(soundSrc).toContain('zonePitch[zoneId] || 80');
  });
});
