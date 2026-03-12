// ─── DevLoop RPG — Phone Reconnect + Debuff UI ─────────────────
// Extracted from controller.js. Exposes window.Reconnect for reconnect overlay
// and debuff display management.

window.Reconnect = {
  // ── State ──
  _reconnectCountdownInterval: null,
  encounteredElites: new Set(),

  // ── Reconnect Overlay (created once, toggled via hidden class) ──
  _overlay: null,

  init() {
    const overlay = document.createElement('div');
    overlay.id = 'reconnect-overlay';
    overlay.className = 'hidden';
    overlay.innerHTML = `
      <div class="reconnect-content">
        <div class="reconnect-dot"></div>
        <div class="reconnect-text">Pripojuji se...</div>
        <div class="reconnect-countdown" id="reconnect-countdown">30</div>
      </div>`;
    document.body.appendChild(overlay);
    Reconnect._overlay = overlay;
  },

  /** Called on socket 'connect' — hides overlay, stops countdown. */
  onConnect() {
    if (Reconnect._reconnectCountdownInterval) {
      clearInterval(Reconnect._reconnectCountdownInterval);
      Reconnect._reconnectCountdownInterval = null;
    }

    const overlay = document.getElementById('reconnect-overlay');
    if (overlay && !overlay.classList.contains('hidden')) {
      overlay.classList.add('hidden');
      return true; // signals caller that a reconnect happened
    }
    return false;
  },

  /** Called on socket 'disconnect' — shows overlay, starts 30s countdown. */
  onDisconnect() {
    const overlay = Reconnect._overlay || document.getElementById('reconnect-overlay');
    if (!overlay) return;

    overlay.classList.remove('hidden');

    // Start visual 30s countdown (cosmetic — real grace period is server-side)
    if (Reconnect._reconnectCountdownInterval) clearInterval(Reconnect._reconnectCountdownInterval);
    let secsLeft = 30;
    const countdownEl = document.getElementById('reconnect-countdown');
    if (countdownEl) countdownEl.textContent = secsLeft;

    Reconnect._reconnectCountdownInterval = setInterval(() => {
      secsLeft--;
      if (countdownEl) countdownEl.textContent = Math.max(0, secsLeft);
      if (secsLeft <= 0) {
        clearInterval(Reconnect._reconnectCountdownInterval);
        Reconnect._reconnectCountdownInterval = null;
      }
    }, 1000);
  },

  /** Called on floor change to clear elite encounter tracking. */
  clearElites() {
    Reconnect.encounteredElites.clear();
  },

  /**
   * Called on 'damage:taken' — handles elite encounter notification.
   * Returns true if an elite notification should be shown.
   */
  handleEliteEncounter(data) {
    if (data.isElite && data.monsterName && !Reconnect.encounteredElites.has(data.monsterName)) {
      Reconnect.encounteredElites.add(data.monsterName);
      return true;
    }
    return false;
  },

  /** Update debuff indicator display on screen. */
  updateDebuffDisplay(debuffs) {
    let container = document.getElementById('debuff-indicators');
    if (!container) {
      container = document.createElement('div');
      container.id = 'debuff-indicators';
      container.className = 'debuff-indicator';
      document.body.appendChild(container);
    }

    container.innerHTML = '';
    if (!debuffs || debuffs.length === 0) {
      container.classList.add('hidden');
      return;
    }

    container.classList.remove('hidden');

    for (const d of debuffs) {
      const el = document.createElement('div');
      el.className = 'debuff-icon';
      const secs = Math.ceil(d.ticksRemaining / 20);

      if (d.effect === 'fire_dot') {
        el.classList.add('debuff-fire');
        el.innerHTML = `\u{1F525}<span class="debuff-timer">${secs}s</span>`;
      } else if (d.effect === 'slow') {
        el.classList.add('debuff-slow');
        el.innerHTML = `\u2744<span class="debuff-timer">${secs}s</span>`;
      }

      container.appendChild(el);
    }
  },
};

// Auto-init the overlay element on load
Reconnect.init();
