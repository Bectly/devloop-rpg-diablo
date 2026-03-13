// ─── Chat UI ─────────────────────────────────────────────────
// Extracted from controller.js — chat message display, input & send logic
const ChatUI = (() => {
  const chatMessages = [];
  const MAX_CHAT_DISPLAY = 3;

  let _socket = null;

  function init(socket) {
    _socket = socket;
  }

  function showChatMessage(name, text) {
    chatMessages.push({ name, text, time: Date.now() });
    if (chatMessages.length > 10) chatMessages.shift();
    renderChatMessages();
  }

  function renderChatMessages() {
    let container = document.getElementById('chat-messages');
    if (!container) {
      container = document.createElement('div');
      container.id = 'chat-messages';
      document.getElementById('controller').appendChild(container);
    }
    // Show last N messages (safe DOM creation — no innerHTML with user text)
    const recent = chatMessages.slice(-MAX_CHAT_DISPLAY);
    container.innerHTML = '';
    for (const m of recent) {
      const row = document.createElement('div');
      row.className = 'chat-msg';
      const nameSpan = document.createElement('span');
      nameSpan.className = 'chat-name';
      nameSpan.textContent = m.name + ':';
      row.appendChild(nameSpan);
      row.appendChild(document.createTextNode(' ' + m.text));
      container.appendChild(row);
    }
    // Auto-fade after 5s
    clearTimeout(container._fadeTimer);
    container.classList.remove('fading');
    container._fadeTimer = setTimeout(() => container.classList.add('fading'), 5000);
  }

  function sendChat() {
    const input = document.getElementById('chat-input');
    if (!input) return;
    const text = input.value.trim();
    if (!text) return;
    _socket.emit('chat:send', { text });
    input.value = '';
    input.blur();
    toggleChatInput(false);
  }

  function toggleChatInput(show) {
    const wrapper = document.getElementById('chat-wrapper');
    if (!wrapper) return;
    if (show === undefined) show = wrapper.classList.contains('collapsed');
    wrapper.classList.toggle('collapsed', !show);
    if (show) {
      const input = document.getElementById('chat-input');
      if (input) input.focus();
    }
  }

  // Wire chat send
  document.addEventListener('DOMContentLoaded', () => {
    const sendBtn = document.getElementById('chat-send');
    if (sendBtn) {
      sendBtn.addEventListener('touchstart', (e) => { e.preventDefault(); sendChat(); });
      sendBtn.addEventListener('click', () => sendChat());
    }
    const chatInput = document.getElementById('chat-input');
    if (chatInput) {
      chatInput.addEventListener('keydown', (e) => {
        if (e.key === 'Enter') { e.preventDefault(); sendChat(); }
      });
    }
  });

  return { init, showChatMessage, renderChatMessages, sendChat, toggleChatInput };
})();
