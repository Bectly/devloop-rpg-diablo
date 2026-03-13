// ─── Death & Victory Screen Module ──────────────────────────────
const DeathVictory = (() => {
  let _socket = null;
  let _isDead = false;
  let _deathCountdown = 0;
  let _deathInterval = null;

  function init(socket) {
    _socket = socket;
  }

  function isDead() {
    return _isDead;
  }

  // ─── Death Screen ───────────────────────────────────────────────
  function showDeathScreen(timerMs, goldDropped) {
    _isDead = true;
    _deathCountdown = timerMs || 5000;

    const deathEl = document.getElementById('death-overlay');
    if (!deathEl) return;
    deathEl.classList.remove('hidden');

    const goldText = goldDropped > 0 ? `Lost ${goldDropped} gold` : '';
    document.getElementById('death-gold-text').textContent = goldText;

    // Strong haptic
    if (navigator.vibrate) navigator.vibrate([100, 50, 100, 50, 200]);

    // Countdown
    if (_deathInterval) clearInterval(_deathInterval);
    _deathInterval = setInterval(() => {
      _deathCountdown -= 100;
      if (_deathCountdown < 0) _deathCountdown = 0;
      const secs = (_deathCountdown / 1000).toFixed(1);
      document.getElementById('death-timer-text').textContent = `Reviving in ${secs}s`;

      if (_deathCountdown <= 0) {
        hideDeathScreen();
      }
    }, 100);
  }

  function hideDeathScreen() {
    _isDead = false;
    if (_deathInterval) {
      clearInterval(_deathInterval);
      _deathInterval = null;
    }
    const deathEl = document.getElementById('death-overlay');
    if (deathEl) deathEl.classList.add('hidden');
  }

  // ─── Victory Screen ──────────────────────────────────────────────
  function showVictoryScreen(data) {
    const victoryEl = document.getElementById('victory-overlay');
    if (!victoryEl) return;
    victoryEl.classList.remove('hidden');

    // Time display
    const totalSecs = Math.floor((data.totalTime || 0) / 1000);
    const mins = Math.floor(totalSecs / 60);
    const secs = totalSecs % 60;
    document.getElementById('victory-time').textContent = `Time: ${mins}m ${secs.toString().padStart(2, '0')}s`;

    // Player stats
    const statsEl = document.getElementById('victory-stats');
    statsEl.innerHTML = '';
    const classIcons = { warrior: '\u2694\uFE0F', ranger: '\uD83C\uDFF9', mage: '\uD83D\uDD2E' };

    // Find MVP (most kills)
    const players = data.players || [];
    let mvpIndex = -1;
    let maxKills = -1;
    for (let i = 0; i < players.length; i++) {
      if ((players[i].kills || 0) > maxKills) {
        maxKills = players[i].kills || 0;
        mvpIndex = i;
      }
    }

    for (let i = 0; i < players.length; i++) {
      const p = players[i];
      const card = document.createElement('div');
      card.className = 'victory-player-card';
      if (p.characterClass) card.setAttribute('data-class', p.characterClass);
      if (i === mvpIndex && maxKills > 0) card.classList.add('mvp');
      card.innerHTML = `
        <div class="victory-player-icon">${classIcons[p.characterClass] || '\u2694\uFE0F'}</div>
        <div class="victory-player-info">
          <div class="victory-player-name">${p.name}</div>
          <div class="victory-player-class">${p.characterClass}</div>
          <div class="victory-player-stats">\u2B06\uFE0F Lv.${p.level} \u00B7 \uD83D\uDC80 ${p.kills} \u00B7 \uD83E\uDE99 ${p.gold}</div>
        </div>
      `;
      statsEl.appendChild(card);
    }

    // New Game button handler
    const newGameBtn = document.getElementById('btn-new-game');
    // Remove old listener by cloning
    const freshBtn = newGameBtn.cloneNode(true);
    newGameBtn.parentNode.replaceChild(freshBtn, newGameBtn);

    const handleNewGame = () => {
      Sound.uiClick();
      if (navigator.vibrate) navigator.vibrate(50);
      _socket.emit('game:restart');
      hideVictoryScreen();
    };
    freshBtn.addEventListener('touchstart', (e) => {
      e.preventDefault();
      handleNewGame();
    });
    freshBtn.addEventListener('click', handleNewGame);

    // "View Leaderboard" button on victory screen
    const ldbVicBtn = document.getElementById('btn-victory-leaderboard');
    if (ldbVicBtn) {
      const freshLdbBtn = ldbVicBtn.cloneNode(true);
      ldbVicBtn.parentNode.replaceChild(freshLdbBtn, ldbVicBtn);
      const openLdb = () => {
        Sound.uiClick();
        Screens.toggleLeaderboard(_socket);
      };
      freshLdbBtn.addEventListener('touchstart', (e) => { e.preventDefault(); openLdb(); });
      freshLdbBtn.addEventListener('click', openLdb);
    }
  }

  function hideVictoryScreen() {
    const victoryEl = document.getElementById('victory-overlay');
    if (victoryEl) victoryEl.classList.add('hidden');
  }

  return {
    init,
    isDead,
    showDeathScreen,
    hideDeathScreen,
    showVictoryScreen,
    hideVictoryScreen,
  };
})();
