// ─── DevLoop RPG — Combat UI ─────────────────────────────────────
// Extracted from controller.js — HUD updates, damage flash, skill cooldowns,
// combat button handlers, and combat-related socket events.
// Loaded BEFORE controller.js. Exposes window.CombatUI.

const CombatUI = (() => {

  let _socket = null;

  function init(socket) {
    _socket = socket;
    _registerSocketHandlers(socket);
    _startCooldownTicker();
    _initSkillTooltips();
  }

  // ─── Haptic Feedback ────────────────────────────────────────────
  function hapticFeedback() {
    if (navigator.vibrate) {
      navigator.vibrate(30);
    }
  }

  // ─── Damage Flash ───────────────────────────────────────────────
  function flashDamage() {
    const overlay = document.getElementById('damage-overlay');
    if (!overlay) return;
    overlay.classList.remove('hidden');
    overlay.style.opacity = '0.4';

    // Haptic
    if (navigator.vibrate) navigator.vibrate(40);

    setTimeout(() => {
      overlay.style.opacity = '0';
      setTimeout(() => overlay.classList.add('hidden'), 200);
    }, 100);
  }

  // ─── HUD Update ─────────────────────────────────────────────────
  function updateHUD(stats) {
    if (!stats) return;

    const hudName = document.getElementById('hud-name');
    hudName.textContent = stats.name;
    // Append HC badge if hardcore character
    if (stats.hardcore) {
      const badge = document.createElement('span');
      badge.className = 'hc-badge';
      badge.textContent = 'HC';
      hudName.appendChild(badge);
    }

    // Level display — show paragon suffix when at max level
    const MAX_LEVEL = 30;
    const hudLevel = document.getElementById('hud-level');
    if (stats.paragonLevel > 0) {
      hudLevel.innerHTML = `Lv.${stats.level} <span class="paragon-level">(P${stats.paragonLevel})</span>`;
    } else {
      hudLevel.textContent = `Lv.${stats.level}`;
    }

    // HP bar with label and color class
    const hpPct = (stats.hp / stats.maxHp) * 100;
    const hpBar = document.getElementById('hp-bar');
    hpBar.style.width = hpPct + '%';
    hpBar.className = 'stat-bar hp' + (hpPct < 25 ? ' low' : hpPct < 50 ? ' mid' : '');
    document.getElementById('hp-label').textContent = `${stats.hp}/${stats.maxHp}`;

    // MP bar with label
    const mpPct = (stats.mp / stats.maxMp) * 100;
    document.getElementById('mp-bar').style.width = mpPct + '%';
    document.getElementById('mp-label').textContent = `${stats.mp}/${stats.maxMp}`;

    // XP bar — switch to paragon XP display when at max level
    const xpBar = document.getElementById('xp-bar');
    const xpLabel = document.getElementById('xp-label');
    const isParagon = stats.paragonLevel > 0 || stats.level >= MAX_LEVEL;
    if (isParagon && stats.paragonXpToNext > 0) {
      const pxpPct = Math.round((stats.paragonXp / stats.paragonXpToNext) * 100);
      xpBar.style.width = pxpPct + '%';
      xpBar.className = 'stat-bar xp paragon-xp-bar';
      xpLabel.textContent = `P${stats.paragonLevel} ${pxpPct}%`;
    } else {
      const xpPct = stats.xpToNext > 0 ? Math.round((stats.xp / stats.xpToNext) * 100) : 0;
      xpBar.style.width = xpPct + '%';
      xpBar.className = 'stat-bar xp';
      xpLabel.textContent = `${xpPct}%`;
    }

    // Skill button labels + cooldowns
    if (stats.skills) {
      for (let i = 0; i < 3; i++) {
        const btn = document.getElementById(`btn-skill-${i}`);
        if (!btn || !stats.skills[i]) continue;
        const skill = stats.skills[i];
        const remaining = skill.cooldownRemaining || 0;

        btn.title = skill.description;

        if (remaining > 0) {
          // On cooldown: show timer overlay
          btn.classList.add('on-cooldown');
          // Set base label (short name + mp cost)
          btn.innerHTML = '';
          const nameEl = document.createElement('span');
          nameEl.className = 'skill-label';
          nameEl.textContent = skill.shortName || skill.name.substring(0, 3).toUpperCase();
          btn.appendChild(nameEl);
          const mpEl = document.createElement('span');
          mpEl.className = 'skill-mp-cost';
          mpEl.textContent = skill.mpCost;
          btn.appendChild(mpEl);
          // Level badge
          if (skill.level && skill.level > 1) {
            const lvBadge = document.createElement('span');
            lvBadge.className = 'skill-level-badge';
            lvBadge.textContent = `L${skill.level}`;
            if (skill.level >= 5) lvBadge.classList.add('max-level');
            btn.appendChild(lvBadge);
          }
          // Cooldown overlay
          let overlay = btn.querySelector('.cooldown-overlay');
          if (!overlay) {
            overlay = document.createElement('div');
            overlay.className = 'cooldown-overlay';
            btn.appendChild(overlay);
          }
          overlay.textContent = (remaining / 1000).toFixed(1);
        } else {
          // Ready: show skill name + mp cost
          btn.classList.remove('on-cooldown');
          const overlay = btn.querySelector('.cooldown-overlay');
          if (overlay) overlay.remove();
          btn.innerHTML = '';
          const nameEl = document.createElement('span');
          nameEl.className = 'skill-label';
          nameEl.textContent = skill.shortName || skill.name.substring(0, 3).toUpperCase();
          btn.appendChild(nameEl);
          const mpEl = document.createElement('span');
          mpEl.className = 'skill-mp-cost';
          mpEl.textContent = skill.mpCost;
          btn.appendChild(mpEl);
          // Level badge
          if (skill.level && skill.level > 1) {
            const lvBadge = document.createElement('span');
            lvBadge.className = 'skill-level-badge';
            lvBadge.textContent = `L${skill.level}`;
            if (skill.level >= 5) lvBadge.classList.add('max-level');
            btn.appendChild(lvBadge);
          }
        }
      }
    }

    // Check if respawned
    if (DeathVictory.isDead() && stats.alive && !stats.isDying) {
      DeathVictory.hideDeathScreen();
    }

    // Update debuff and buff indicators
    Reconnect.updateDebuffDisplay(stats.debuffs || []);
    Reconnect.updateBuffDisplay(stats);
  }

  // ─── Combat Action Buttons ──────────────────────────────────────
  // Called from controller.js initButtons() — wires attack, skill, potion,
  // pickup, and interact buttons.
  function initCombatButtons() {
    // Attack
    document.getElementById('btn-attack').addEventListener('touchstart', (e) => {
      e.preventDefault();
      if (DeathVictory.isDead()) return;
      Sound.hit(0.3);
      _socket.emit('attack');
      hapticFeedback();
    });
    document.getElementById('btn-attack').addEventListener('click', () => {
      if (DeathVictory.isDead()) return;
      Sound.hit(0.3);
      _socket.emit('attack');
    });

    // Skills
    for (let i = 0; i < 3; i++) {
      document.getElementById(`btn-skill-${i}`).addEventListener('touchstart', (e) => {
        e.preventDefault();
        if (DeathVictory.isDead()) return;
        _socket.emit('skill', { skillIndex: i });
        hapticFeedback();
      });
      document.getElementById(`btn-skill-${i}`).addEventListener('click', () => {
        if (DeathVictory.isDead()) return;
        _socket.emit('skill', { skillIndex: i });
      });
    }

    // Health Potion
    document.getElementById('btn-potion').addEventListener('touchstart', (e) => {
      e.preventDefault();
      if (DeathVictory.isDead()) return;
      _socket.emit('use:potion', { type: 'health' });
    });
    document.getElementById('btn-potion').addEventListener('click', () => {
      if (DeathVictory.isDead()) return;
      _socket.emit('use:potion', { type: 'health' });
    });

    // Interact
    document.getElementById('btn-interact').addEventListener('touchstart', (e) => {
      e.preventDefault();
      if (DeathVictory.isDead()) return;
      _socket.emit('interact');
    });
    document.getElementById('btn-interact').addEventListener('click', () => {
      if (DeathVictory.isDead()) return;
      _socket.emit('interact');
    });

    // Pickup (LOOT button)
    document.getElementById('btn-pickup').addEventListener('touchstart', (e) => {
      e.preventDefault();
      if (DeathVictory.isDead()) return;
      Sound.uiClick();
      _socket.emit('loot:pickup_nearest');
    });
    document.getElementById('btn-pickup').addEventListener('click', () => {
      if (DeathVictory.isDead()) return;
      Sound.uiClick();
      _socket.emit('loot:pickup_nearest');
    });
  }

  // ─── Combat Socket Handlers ─────────────────────────────────────
  function _registerSocketHandlers(socket) {
    socket.on('damage:taken', (data) => {
      Sound.playerHurt();
      flashDamage();

      // Elite encounter notification — show once per elite
      if (Reconnect.handleEliteEncounter(data)) {
        const affixList = (data.affixes || []).join(', ');
        if (data.eliteRank === 'rare') {
          showNotification(`\u{1F480} Rare ${data.monsterName} \u2014 ${affixList}`, 'elite_rare');
        } else {
          showNotification(`\u2694 Champion ${data.monsterName} \u2014 ${affixList}`, 'elite_champion');
        }
        if (navigator.vibrate) navigator.vibrate([60, 30, 60, 30, 100]);
      }
    });

    // Defensive proc notifications (Phase 15.0)
    socket.on('combat:proc', (data) => {
      if (data.effect === 'block') {
        showNotification(`Shield Wall! Blocked ${data.value} damage`, 'info');
        if (navigator.vibrate) navigator.vibrate([30, 20, 50]);
      } else if (data.effect === 'last_stand') {
        showNotification('Last Stand! 50% damage reduction', 'levelup');
      } else if (data.effect === 'freeze') {
        showNotification('Ice Barrier! Attacker frozen', 'info');
      } else if (data.effect === 'caltrops') {
        showNotification('Caltrops! Attacker slowed', 'info');
      } else if (data.effect === 'heal_on_kill') {
        showNotification(`Heal on kill! +${data.heal} HP`, 'info');
      } else if (data.effect === 'summon_spirit_wolf') {
        showNotification('Spirit Wolf summoned!', 'levelup');
        if (navigator.vibrate) navigator.vibrate([40, 30, 40, 30, 60]);
      }
    });

    socket.on('player:death', (data) => {
      DeathVictory.showDeathScreen(data.deathTimer, data.goldDropped, data.damageLog);
    });

    socket.on('player:respawn', (data) => {
      DeathVictory.hideDeathScreen();
    });
  }

  // ─── Cooldown Ticker ────────────────────────────────────────────
  function _startCooldownTicker() {
    setInterval(() => {
      if (!playerStats || !playerStats.skills) return;
      for (let i = 0; i < 3; i++) {
        const btn = document.getElementById(`btn-skill-${i}`);
        if (!btn) continue;
        const skill = playerStats.skills[i];
        if (!skill) continue;
        const cd = skill.cooldownRemaining || 0;
        if (cd > 0) {
          btn.classList.add('on-cooldown');
          let overlay = btn.querySelector('.cooldown-overlay');
          if (!overlay) {
            overlay = document.createElement('div');
            overlay.className = 'cooldown-overlay';
            btn.appendChild(overlay);
          }
          overlay.textContent = (cd / 1000).toFixed(1);
        } else {
          btn.classList.remove('on-cooldown');
          const overlay = btn.querySelector('.cooldown-overlay');
          if (overlay) overlay.remove();
        }
      }
    }, 100);
  }

  // ─── Skill Tooltips ─────────────────────────────────────────────
  function _initSkillTooltips() {
    document.querySelectorAll('.action-btn.skill').forEach((btn, i) => {
      let holdTimer;
      btn.addEventListener('touchstart', (e) => {
        holdTimer = setTimeout(() => {
          Screens.showSkillTooltip(i, btn, playerStats, selectedClass);
        }, 500);
      });
      btn.addEventListener('touchend', () => {
        clearTimeout(holdTimer);
        Screens.hideSkillTooltip();
      });
      btn.addEventListener('touchmove', () => {
        clearTimeout(holdTimer);
      });
    });
  }

  return {
    init,
    hapticFeedback,
    flashDamage,
    updateHUD,
    initCombatButtons,
  };

})();
