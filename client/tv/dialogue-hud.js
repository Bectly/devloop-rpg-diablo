// ─── DevLoop RPG — TV Dialogue HUD Overlay ──────────────────────
// Extracted from hud.js. Exposes window.DialogueHUD for dialogue overlay drawing.

window.DialogueHUD = {
  _dialogueObjects: null,
  _dialogueFadeTween: null,

  _getNpcNameColor(npcName) {
    const n = npcName.toLowerCase();
    if (n.includes('sage'))                        return '#8888ff';
    if (n.includes('guardian'))                     return '#44cc44';
    if (n.includes('adventurer') || n.includes('herald')) return '#aaaaaa';
    if (n.includes('shop') || n.includes('merchant'))     return '#ffcc44';
    return '#ffaa33';
  },

  showDialogue(scene, npcName, text) {
    // Clean up previous dialogue (immediate destroy — safe even mid-fade)
    DialogueHUD._forceDestroyDialogue();

    const cam = scene.cameras.main;
    const w = cam.width;
    const h = cam.height;
    const y = cam.scrollY + h - 80;
    const x = cam.scrollX + w / 2;
    const pad = 50;
    const panelH = 80;
    const nameColor = DialogueHUD._getNpcNameColor(npcName);
    const nameColorInt = parseInt(nameColor.replace('#', ''), 16);

    // Outer glow border
    const bgOuter = scene.add.rectangle(x, y + 10, w - pad + 6, panelH + 6, 0x000000, 0);
    bgOuter.setStrokeStyle(2, nameColorInt, 0.25);
    bgOuter.setDepth(899);
    bgOuter.setScrollFactor(0);

    // Dark backdrop panel
    const bg = scene.add.rectangle(x, y + 10, w - pad, panelH, 0x000000, 0.8);
    bg.setStrokeStyle(1, 0x444444, 0.6);
    bg.setDepth(900);
    bg.setScrollFactor(0);

    // Darker inner fill for depth
    const bgInner = scene.add.rectangle(x, y + 10, w - pad - 8, panelH - 8, 0x0a0a0a, 0.5);
    bgInner.setDepth(900);
    bgInner.setScrollFactor(0);

    // NPC name (colored by type)
    const nameText = scene.add.text(x - (w / 2) + pad, y - 16, npcName, {
      fontSize: '13px',
      fontFamily: 'Courier New, monospace',
      color: nameColor,
      fontStyle: 'bold',
      stroke: '#000',
      strokeThickness: 2,
    });
    nameText.setDepth(901);
    nameText.setScrollFactor(0);

    // Decorative accent line under name
    const accentW = Math.min(nameText.width + 12, w - pad * 2);
    const accentY = y - 2;
    const accent = scene.add.rectangle(
      x - (w / 2) + pad + accentW / 2, accentY,
      accentW, 2, nameColorInt, 0.6
    );
    accent.setDepth(901);
    accent.setScrollFactor(0);

    // Dialogue text — starts empty for typewriter effect
    const dialogueText = scene.add.text(x - (w / 2) + pad, y + 6, '', {
      fontSize: '11px',
      fontFamily: 'Courier New, monospace',
      color: '#ffffff',
      stroke: '#000',
      strokeThickness: 1,
      wordWrap: { width: w - pad * 2 - 20 },
    });
    dialogueText.setDepth(901);
    dialogueText.setScrollFactor(0);

    // Typewriter reveal (~2 chars per tick, 30ms interval)
    let charIndex = 0;
    const typeTimer = scene.time.addEvent({
      delay: 30,
      loop: true,
      callback: () => {
        charIndex = Math.min(charIndex + 2, text.length);
        dialogueText.setText(text.substring(0, charIndex));
        if (charIndex >= text.length) {
          typeTimer.remove(false);
        }
      },
    });

    const allObjects = [bgOuter, bg, bgInner, nameText, accent, dialogueText, typeTimer];

    // Slide-up + fade-in animation (visual objects only)
    [bgOuter, bg, bgInner, nameText, accent, dialogueText].forEach(obj => {
      obj.setAlpha(0);
      scene.tweens.add({
        targets: obj,
        alpha: 1,
        y: obj.y - 10,
        duration: 250,
        ease: 'Cubic.easeOut',
      });
    });

    DialogueHUD._dialogueObjects = allObjects;
  },

  /** Immediate hard-destroy — used internally and as shutdown fallback. */
  _forceDestroyDialogue() {
    if (DialogueHUD._dialogueFadeTween) {
      DialogueHUD._dialogueFadeTween.stop();
      DialogueHUD._dialogueFadeTween = null;
    }
    if (DialogueHUD._dialogueObjects) {
      DialogueHUD._dialogueObjects.forEach(obj => {
        if (!obj) return;
        if (obj.remove) obj.remove(false);   // Phaser TimerEvent
        if (obj.destroy) obj.destroy();       // Phaser GameObjects
      });
      DialogueHUD._dialogueObjects = null;
    }
  },

  hideDialogue(scene) {
    if (!DialogueHUD._dialogueObjects) return;

    // Separate visual objects from the typewriter timer
    const objs = DialogueHUD._dialogueObjects;
    const visuals = objs.filter(o => o && o.setAlpha);
    const timers = objs.filter(o => o && o.remove && !o.setAlpha);

    // Stop typewriter immediately
    timers.forEach(t => t.remove(false));

    // Fade out visuals, then destroy everything
    DialogueHUD._dialogueFadeTween = scene.tweens.add({
      targets: visuals,
      alpha: 0,
      duration: 200,
      ease: 'Cubic.easeIn',
      onComplete: () => {
        visuals.forEach(obj => { if (obj && obj.destroy) obj.destroy(); });
        DialogueHUD._dialogueObjects = null;
        DialogueHUD._dialogueFadeTween = null;
      },
    });
  },
};
