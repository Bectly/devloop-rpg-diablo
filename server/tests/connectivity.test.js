import { describe, it, expect } from 'vitest';
import { createRequire } from 'module';
import { fileURLToPath } from 'url';
import { dirname } from 'path';
const require = createRequire(import.meta.url);

const fs = require('fs');
const path = require('path');
const __dirname = dirname(fileURLToPath(import.meta.url));

// ═══════════════════════════════════════════════════════════════════════
//  PING & CONNECTIVITY TESTS
// ═══════════════════════════════════════════════════════════════════════

describe('Ping & Connectivity', () => {
  const indexSrc = fs.readFileSync(require.resolve('../index.js'), 'utf8');

  // ── Server-side ping handler ─────────────────────────────────────
  it('ping:check handler exists in index.js', () => {
    expect(indexSrc).toContain("socket.on('ping:check'");
  });

  it('ping:check callback pattern calls cb when cb is a function', () => {
    expect(indexSrc).toMatch(/ping:check.*cb.*typeof cb.*function.*cb\(\)/s);
  });

  // ── Cache busting ────────────────────────────────────────────────
  describe('Cache busting — phone HTML', () => {
    const phoneHtml = fs.readFileSync(
      path.join(__dirname, '../../client/phone/index.html'), 'utf8'
    );
    const localScripts = phoneHtml
      .match(/src="[^"]*\.js[^"]*"/g)
      .filter(s => !s.includes('cdn'));

    it('has local script tags', () => {
      expect(localScripts.length).toBeGreaterThan(0);
    });

    it('every local script tag includes a ?v= cache-buster', () => {
      for (const script of localScripts) {
        expect(script).toMatch(/\?v=\d+/);
      }
    });
  });

  describe('Cache busting — TV HTML', () => {
    const tvHtml = fs.readFileSync(
      path.join(__dirname, '../../client/tv/index.html'), 'utf8'
    );
    const localScripts = tvHtml
      .match(/src="[^"]*\.js[^"]*"/g)
      .filter(s => !s.includes('cdn'));

    it('has local script tags', () => {
      expect(localScripts.length).toBeGreaterThan(0);
    });

    it('every local script tag includes a ?v= cache-buster', () => {
      for (const script of localScripts) {
        expect(script).toMatch(/\?v=\d+/);
      }
    });
  });

  // ── Connection indicator elements in phone HTML ──────────────────
  describe('Connection indicator HTML', () => {
    const phoneHtml = fs.readFileSync(
      path.join(__dirname, '../../client/phone/index.html'), 'utf8'
    );

    it('#conn-dot element exists', () => {
      expect(phoneHtml).toContain('id="conn-dot"');
    });

    it('#hud-ping element exists', () => {
      expect(phoneHtml).toContain('id="hud-ping"');
    });
  });

  // ── ChatUI.init wired in controller.js ───────────────────────────
  describe('ChatUI.init called in controller.js', () => {
    const controllerSrc = fs.readFileSync(
      path.join(__dirname, '../../client/phone/controller.js'), 'utf8'
    );

    it('calls ChatUI.init(socket)', () => {
      expect(controllerSrc).toContain('ChatUI.init(socket)');
    });
  });
});
