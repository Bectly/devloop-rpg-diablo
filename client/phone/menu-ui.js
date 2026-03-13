// ─── DevLoop RPG — Menu Drawer UI ────────────────────────────────
// Extracted from controller.js — menu drawer toggle, overlay, item routing.
// Loaded BEFORE controller.js. Exposes window.MenuUI.

const MenuUI = (() => {

  let _socket = null;
  let _getInventoryData = null;
  let _hapticFeedback = null;

  // ─── Init ───────────────────────────────────────────────────────
  // deps: { socket, getInventoryData, hapticFeedback }
  function init(deps) {
    _socket = deps.socket;
    _getInventoryData = deps.getInventoryData;
    _hapticFeedback = deps.hapticFeedback;
  }

  // ─── Menu Drawer Toggle & Overlay ──────────────────────────────
  function initMenuButtons() {
    const menuDrawer = document.getElementById('menu-drawer');
    const menuOverlay = document.getElementById('menu-drawer-overlay');

    document.getElementById('btn-menu').addEventListener('touchstart', (e) => {
      e.preventDefault();
      _hapticFeedback();
      menuDrawer.classList.toggle('hidden');
    });
    document.getElementById('btn-menu').addEventListener('click', () => {
      menuDrawer.classList.toggle('hidden');
    });

    menuOverlay.addEventListener('touchstart', (e) => {
      e.preventDefault();
      menuDrawer.classList.add('hidden');
    });
    menuOverlay.addEventListener('click', () => {
      menuDrawer.classList.add('hidden');
    });

    // ── Menu Items — wire data-action to routing ──
    document.querySelectorAll('.menu-item').forEach(btn => {
      btn.addEventListener('touchstart', (e) => {
        e.preventDefault();
        _hapticFeedback();
        menuDrawer.classList.add('hidden');
        handleMenuAction(btn.dataset.action);
      });
      btn.addEventListener('click', () => {
        menuDrawer.classList.add('hidden');
        handleMenuAction(btn.dataset.action);
      });
    });

    // Talent close button (still in talent-screen HTML)
    const talentClose = document.getElementById('talent-close');
    if (talentClose) {
      talentClose.addEventListener('touchstart', (e) => { e.preventDefault(); TalentsUI.hide(); });
      talentClose.addEventListener('click', () => TalentsUI.hide());
    }

    // Rift close button (still in rift-screen HTML)
    const riftClose = document.getElementById('rift-close');
    if (riftClose) {
      riftClose.addEventListener('touchstart', (e) => { e.preventDefault(); RiftUI.hide(); });
      riftClose.addEventListener('click', () => RiftUI.hide());
    }
  }

  // ─── Menu Action Router ─────────────────────────────────────────
  function handleMenuAction(action) {
    switch (action) {
      case 'inventory':
        openInventory();
        break;
      case 'quests':
        Screens.toggleQuestLog();
        break;
      case 'craft':
        Screens.toggleCrafting(_getInventoryData(), _socket, _hapticFeedback, () => {});
        break;
      case 'talents':
        Sound.uiClick();
        TalentsUI.show();
        break;
      case 'rift':
        Sound.uiClick();
        RiftUI.show();
        break;
      case 'chat':
        ChatUI.toggleChatInput();
        break;
      case 'leaderboard':
        Screens.toggleLeaderboard(_socket);
        break;
    }
  }

  return {
    init,
    initMenuButtons,
    handleMenuAction,
  };

})();
