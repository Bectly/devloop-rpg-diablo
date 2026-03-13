// ─── DevLoop RPG — Fog of War + Torch Lighting + Ambient Particles ───
// Created as a separate module to keep effects.js focused on environment.
// Exports: Lighting.init(scene), Lighting.update(scene, players, world),
//          Lighting.cleanup()

const Lighting = (() => {

  // ── Config ──
  const FOG_ALPHA = 0.85;          // Darkness of fully unexplored areas
  const EXPLORED_DARKNESS = 0.45;  // Remaining darkness for explored-but-not-visible areas
  // Eraser alpha needed: erase(a) removes a fraction of fog.
  // We want: FOG_ALPHA * (1 - eraserAlpha) = EXPLORED_DARKNESS
  // eraserAlpha = 1 - EXPLORED_DARKNESS / FOG_ALPHA ≈ 0.47
  const EXPLORED_ERASER_ALPHA = 1 - (EXPLORED_DARKNESS / FOG_ALPHA);

  const VISION_RADIUS_TILES = 5;   // Player vision in tiles
  const VISION_RADIUS = VISION_RADIUS_TILES * TILE_SIZE; // ~160px
  const LIGHT_BASE_RADIUS = 140;   // Torch light base radius
  const LIGHT_FLICKER_RANGE = 8;   // +/- px flicker
  const LIGHT_FLOOR_PENALTY = 5;   // Radius reduction per floor
  const PARTICLE_COUNT = 25;       // Ambient particle count
  const ERASER_SIZE = 360;         // Diameter of the eraser texture (~2x vision radius + margin)

  // ── State ──
  let fogRT = null;                // Phaser.GameObjects.RenderTexture — the visible fog overlay
  let exploredMask = null;         // Persistent RT — white pixels where players have been
  let exploredStamp = null;        // Hidden Image used to stamp into exploredMask via draw()
  let torchGfx = null;             // Graphics object for torch light overlay
  let particleGfx = null;          // Graphics object for ambient particles
  let particles = [];              // Array of particle objects
  let revealedTiles = null;        // Set of "r,c" strings for explored tiles
  let lastWorldW = 0;
  let lastWorldH = 0;
  let flickerOffset = 0;           // Smoothed flicker value
  let flickerTarget = 0;           // Target flicker value
  let frameCount = 0;              // Frame counter for flicker updates
  let lastExploredPositions = {};  // Track last stamped tile per player id

  // ── Init ──
  function init(scene) {
    revealedTiles = new Set();

    // Create the eraser textures (pre-baked radial gradients)
    _createEraserTextures(scene);

    // Create a hidden Image from the explored eraser texture for use with RT.draw()
    // (RenderTexture.draw() requires a game object, not a texture key string)
    exploredStamp = scene.add.image(0, 0, '_fog_eraser_explored')
      .setOrigin(0, 0)
      .setVisible(false);

    // Create particle array
    particles = [];
    for (let i = 0; i < PARTICLE_COUNT; i++) {
      particles.push(_createParticle());
    }

    // Particle graphics (rendered just above tiles, behind everything else)
    particleGfx = scene.add.graphics().setDepth(1);

    // Torch light graphics (warm glow, rendered just below the fog layer)
    torchGfx = scene.add.graphics().setDepth(44);

    // Fog and explored RenderTextures are created lazily in update()
    // once we know the world dimensions.
  }

  function _createEraserTextures(scene) {
    const g = scene.make.graphics({ add: false });
    const half = ERASER_SIZE / 2;

    // ── Main vision eraser — fully clears fog around active player positions ──
    // White center (fully erases) with soft feathered edges
    const steps = 28;
    for (let i = 0; i < steps; i++) {
      const ratio = i / steps; // 0 = outermost ring, 1 = innermost
      const radius = half * (1 - ratio);
      // Smooth alpha ramp: transparent at edge, fully opaque inside
      const alpha = Math.pow(ratio, 1.8);
      g.fillStyle(0xffffff, alpha);
      g.fillCircle(half, half, radius);
    }
    // Solid opaque core (inner 55%)
    g.fillStyle(0xffffff, 1);
    g.fillCircle(half, half, half * 0.55);
    g.generateTexture('_fog_eraser_full', ERASER_SIZE, ERASER_SIZE);

    // ── Explored-area stamp — drawn INTO exploredMask to mark visited areas ──
    // Lower alpha so when used as erase source on fogRT, it only partially clears
    g.clear();
    const expSteps = 20;
    for (let i = 0; i < expSteps; i++) {
      const ratio = i / expSteps;
      const radius = half * (1 - ratio);
      const alpha = Math.pow(ratio, 2.0) * EXPLORED_ERASER_ALPHA;
      g.fillStyle(0xffffff, alpha);
      g.fillCircle(half, half, radius);
    }
    g.fillStyle(0xffffff, EXPLORED_ERASER_ALPHA);
    g.fillCircle(half, half, half * 0.5);
    g.generateTexture('_fog_eraser_explored', ERASER_SIZE, ERASER_SIZE);

    g.destroy();
  }

  function _ensureFogTextures(scene, worldW, worldH) {
    if (fogRT && lastWorldW === worldW && lastWorldH === worldH) return;

    // Destroy old if world size changed
    if (fogRT) { fogRT.destroy(); fogRT = null; }
    if (exploredMask) { exploredMask.destroy(); exploredMask = null; }

    lastWorldW = worldW;
    lastWorldH = worldH;

    // Fog overlay — redrawn each frame, sits on top of game world
    fogRT = scene.add.renderTexture(0, 0, worldW, worldH)
      .setDepth(45)
      .setOrigin(0, 0);

    // Explored mask — persistent, starts fully transparent.
    // White pixels accumulate wherever players have visited.
    // Used as an erase source on fogRT to reveal explored areas.
    exploredMask = scene.add.renderTexture(0, 0, worldW, worldH)
      .setDepth(-1)
      .setOrigin(0, 0)
      .setVisible(false);
    // Starts transparent (no explored areas)
  }

  // ── Particle factory ──
  function _createParticle() {
    return {
      x: 0,
      y: 0,
      vx: (Math.random() - 0.5) * 0.8,
      vy: (Math.random() - 0.5) * 0.8,
      alphaPhase: Math.random() * Math.PI * 2,
      alphaSpeed: 0.015 + Math.random() * 0.02, // ~2-3 second full cycle
      size: 1 + Math.random() * 1.5,
      needsSpawn: true, // Flag: needs initial position relative to camera
    };
  }

  // ── Main Update ──
  function update(scene, players, world) {
    if (!particleGfx) return; // Not initialized

    const tiles = world.tiles;
    if (!tiles || tiles.length === 0) return;

    const gridH = tiles.length;
    const gridW = tiles[0].length;
    const worldW = gridW * TILE_SIZE;
    const worldH = gridH * TILE_SIZE;
    const currentFloor = world.currentFloor || 0;

    // Ensure fog textures match world size
    _ensureFogTextures(scene, worldW, worldH);

    // Camera bounds for particle management
    const cam = scene.cameras.main;
    const camL = cam.scrollX;
    const camT = cam.scrollY;
    const camR = camL + cam.width;
    const camB = camT + cam.height;

    // A: Fog of War
    _updateFog(scene, players, tiles, gridW, gridH);

    // B: Torch Lights
    _updateTorchLights(scene, players, currentFloor);

    // C: Ambient Particles
    _updateParticles(scene, camL, camT, camR, camB);

    frameCount++;
  }

  // ── A: Fog of War ──
  function _updateFog(scene, players, tiles, gridW, gridH) {
    if (!fogRT) return;

    // Step 1: Fill fog with full darkness
    fogRT.fill(0x000000, FOG_ALPHA);

    // Step 2: Mark newly explored tiles + stamp explored mask
    if (players && players.length > 0) {
      for (const p of players) {
        if (!p.alive) continue;
        const pc = Math.floor(p.x / TILE_SIZE);
        const pr = Math.floor(p.y / TILE_SIZE);
        const radiusTiles = VISION_RADIUS_TILES + 1;

        for (let dr = -radiusTiles; dr <= radiusTiles; dr++) {
          for (let dc = -radiusTiles; dc <= radiusTiles; dc++) {
            const r = pr + dr;
            const c = pc + dc;
            if (r < 0 || r >= gridH || c < 0 || c >= gridW) continue;
            if (tiles[r][c] === -1) continue; // Skip VOID tiles
            const dist = Math.sqrt(dr * dr + dc * dc);
            if (dist <= VISION_RADIUS_TILES + 0.5) {
              revealedTiles.add(`${r},${c}`);
            }
          }
        }

        // Stamp this position into the explored mask, but only when the player
        // moves to a new tile to avoid over-accumulation of alpha.
        const tileKey = `${pr},${pc}`;
        const pid = p.id || p.name || `p${p.x}_${p.y}`;
        if (exploredMask && exploredStamp && lastExploredPositions[pid] !== tileKey) {
          lastExploredPositions[pid] = tileKey;
          exploredMask.draw(exploredStamp, p.x - ERASER_SIZE / 2, p.y - ERASER_SIZE / 2);
        }
      }
    }

    // Step 3: Use explored mask to partially erase fog (explored areas become dimmer)
    if (exploredMask) {
      fogRT.erase(exploredMask, 0, 0);
    }

    // Step 4: Fully erase fog at current player positions (active vision)
    if (players && players.length > 0) {
      for (const p of players) {
        if (!p.alive) continue;
        fogRT.erase(
          '_fog_eraser_full',
          p.x - ERASER_SIZE / 2,
          p.y - ERASER_SIZE / 2
        );
      }
    }
  }

  // ── B: Torch Lights ──
  function _updateTorchLights(scene, players, floor) {
    if (!torchGfx) return;
    torchGfx.clear();

    if (!players || players.length === 0) return;

    // Update flicker with noise-like smoothing (not pure sine)
    if (frameCount % 3 === 0) {
      flickerTarget = (Math.random() - 0.5) * 2 * LIGHT_FLICKER_RANGE;
    }
    flickerOffset += (flickerTarget - flickerOffset) * 0.15;

    const baseRadius = Math.max(60, LIGHT_BASE_RADIUS - floor * LIGHT_FLOOR_PENALTY);
    const radius = baseRadius + flickerOffset;

    for (const p of players) {
      if (!p.alive) continue;

      // Per-player flicker variation so multiple players don't flicker in sync
      // Use player index (i) as a seed since p.id may be a string
      const pSeed = typeof p.id === 'number' ? p.id : (p.x * 7 + p.y * 13);
      const playerFlicker = Math.sin(frameCount * 0.07 + pSeed * 2.7) * 4;
      const r = radius + playerFlicker;

      // Draw warm orange-yellow radial glow using concentric circles
      const steps = 14;
      for (let i = steps; i >= 0; i--) {
        const ratio = i / steps; // 1 = full radius, 0 = center
        const circleR = r * ratio;

        // Color gradient: orange (outer) → warm yellow (inner)
        const red = 0xff;
        const green = Math.floor(0x66 + (0xcc - 0x66) * (1 - ratio));
        const blue = Math.floor(0x00 + 0x44 * (1 - ratio));
        const color = (red << 16) | (green << 8) | blue;

        // Alpha: very faint outer, moderate inner glow
        const alpha = (1 - ratio) * 0.06 + 0.005;

        torchGfx.fillStyle(color, alpha);
        torchGfx.fillCircle(p.x, p.y, circleR);
      }

      // Tiny bright core for a visible torch "point"
      torchGfx.fillStyle(0xffdd88, 0.08);
      torchGfx.fillCircle(p.x, p.y, 6);
    }
  }

  // ── C: Ambient Particles ──
  function _updateParticles(scene, camL, camT, camR, camB) {
    if (!particleGfx) return;
    particleGfx.clear();

    const margin = 60;
    const viewW = camR - camL;
    const viewH = camB - camT;

    for (let i = 0; i < particles.length; i++) {
      const pt = particles[i];

      // Initialize/respawn position relative to current camera view
      if (pt.needsSpawn) {
        pt.x = camL + Math.random() * viewW;
        pt.y = camT + Math.random() * viewH;
        pt.needsSpawn = false;
      }

      // Move (very slow drift)
      pt.x += pt.vx;
      pt.y += pt.vy;

      // Alpha pulse: smooth oscillation between 0.1 and 0.3
      pt.alphaPhase += pt.alphaSpeed;
      const pulseAlpha = 0.1 + (Math.sin(pt.alphaPhase) * 0.5 + 0.5) * 0.2;

      // Recycle if drifted outside camera view + margin
      if (pt.x < camL - margin || pt.x > camR + margin ||
          pt.y < camT - margin || pt.y > camB + margin) {
        // Respawn at a random edge of the viewport
        const edge = Math.floor(Math.random() * 4);
        switch (edge) {
          case 0: pt.x = camL - 10; pt.y = camT + Math.random() * viewH; break; // left
          case 1: pt.x = camR + 10; pt.y = camT + Math.random() * viewH; break; // right
          case 2: pt.y = camT - 10; pt.x = camL + Math.random() * viewW; break; // top
          case 3: pt.y = camB + 10; pt.x = camL + Math.random() * viewW; break; // bottom
        }
        pt.vx = (Math.random() - 0.5) * 0.8;
        pt.vy = (Math.random() - 0.5) * 0.8;
      }

      // Only draw if this tile position has been revealed
      if (revealedTiles && revealedTiles.size > 0) {
        const tc = Math.floor(pt.x / TILE_SIZE);
        const tr = Math.floor(pt.y / TILE_SIZE);
        if (!revealedTiles.has(`${tr},${tc}`)) continue;
      }

      // Draw — tiny white/gray dust mote
      const color = (i % 3 === 0) ? 0xbbbbbb : 0x999999;
      particleGfx.fillStyle(color, pulseAlpha);
      particleGfx.fillCircle(pt.x, pt.y, pt.size);
    }
  }

  // ── Cleanup (called on floor transitions) ──
  function cleanup() {
    // Destroy render textures (they'll be recreated for the new floor)
    if (fogRT) { fogRT.destroy(); fogRT = null; }
    if (exploredMask) { exploredMask.destroy(); exploredMask = null; }

    // Clear graphics (keep the objects, just clear drawn content)
    if (torchGfx) torchGfx.clear();
    if (particleGfx) particleGfx.clear();
    // exploredStamp persists across floors (it's just a hidden image reference)

    // Reset all exploration data for the new floor
    if (revealedTiles) revealedTiles.clear();

    lastWorldW = 0;
    lastWorldH = 0;
    frameCount = 0;
    flickerOffset = 0;
    flickerTarget = 0;
    lastExploredPositions = {};

    // Re-scatter particles (they'll get positioned on next update)
    for (let i = 0; i < particles.length; i++) {
      particles[i] = _createParticle();
    }
  }

  return { init, update, cleanup };
})();
