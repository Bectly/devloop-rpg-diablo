// ─── Minimal QR Code Generator ─────────────────────────────────
// Pure JS, no dependencies. Generates QR code as Canvas or SVG.
// Based on public domain QR code algorithm.
// Exposed as window.QRCode

window.QRCode = {
  // Generate QR code and draw on a canvas element
  toCanvas(canvas, text, size = 256) {
    const modules = this._generate(text);
    const ctx = canvas.getContext('2d');
    const cellSize = size / modules.length;
    canvas.width = size;
    canvas.height = size;
    ctx.fillStyle = '#0a0a12';
    ctx.fillRect(0, 0, size, size);
    ctx.fillStyle = '#ffffff';
    for (let r = 0; r < modules.length; r++) {
      for (let c = 0; c < modules.length; c++) {
        if (modules[r][c]) {
          ctx.fillRect(c * cellSize, r * cellSize, cellSize + 0.5, cellSize + 0.5);
        }
      }
    }
  },

  // Generate QR code as data URL
  toDataURL(text, size = 256) {
    const canvas = document.createElement('canvas');
    this.toCanvas(canvas, text, size);
    return canvas.toDataURL();
  },

  // ── Internal QR generation (Version 2-6, ECC L) ──

  _generate(text) {
    const data = this._encodeBytes(text);
    const version = this._pickVersion(data.length);
    const size = 17 + version * 4;
    const modules = Array.from({ length: size }, () => Array(size).fill(null));
    const reserved = Array.from({ length: size }, () => Array(size).fill(false));

    this._placeFinderPatterns(modules, reserved, size);
    this._placeAlignmentPatterns(modules, reserved, version, size);
    this._placeTimingPatterns(modules, reserved, size);
    this._placeDarkModule(modules, reserved, version);
    this._reserveFormatBits(reserved, size);

    const eccData = this._addECC(data, version);
    this._placeData(modules, reserved, eccData, size);
    this._applyBestMask(modules, reserved, size);
    this._placeFormatBits(modules, size, 0); // mask 0 placeholder

    return modules;
  },

  _encodeBytes(text) {
    const bytes = new TextEncoder().encode(text);
    const bits = [];
    // Mode indicator: byte mode (0100)
    bits.push(0, 1, 0, 0);
    // Character count (8 bits for versions 1-9)
    for (let i = 7; i >= 0; i--) bits.push((bytes.length >> i) & 1);
    // Data
    for (const b of bytes) {
      for (let i = 7; i >= 0; i--) bits.push((b >> i) & 1);
    }
    // Terminator
    bits.push(0, 0, 0, 0);
    // Pad to byte boundary
    while (bits.length % 8 !== 0) bits.push(0);
    return bits;
  },

  _pickVersion(bitLen) {
    // Data capacity (bits) for versions 1-6 at ECC level L (byte mode)
    const caps = [0, 152, 272, 440, 640, 864, 1088];
    for (let v = 1; v <= 6; v++) {
      if (bitLen <= caps[v]) return v;
    }
    return 6; // max supported
  },

  _addECC(dataBits, version) {
    // Total codewords and ECC codewords for each version (ECC L)
    const specs = {
      1: { total: 26, ecc: 7 },
      2: { total: 44, ecc: 10 },
      3: { total: 70, ecc: 15 },
      4: { total: 100, ecc: 20 },
      5: { total: 134, ecc: 26 },
      6: { total: 172, ecc: 36 },
    };
    const spec = specs[version];
    const dataCodewords = spec.total - spec.ecc;

    // Convert bits to bytes, pad
    const bytes = [];
    for (let i = 0; i < dataBits.length; i += 8) {
      let byte = 0;
      for (let j = 0; j < 8 && i + j < dataBits.length; j++) {
        byte = (byte << 1) | dataBits[i + j];
      }
      bytes.push(byte);
    }
    // Pad with 236/17 alternating
    const pads = [236, 17];
    let padIdx = 0;
    while (bytes.length < dataCodewords) {
      bytes.push(pads[padIdx % 2]);
      padIdx++;
    }

    // Reed-Solomon ECC
    const ecc = this._reedSolomon(bytes, spec.ecc);

    // Convert all to bits
    const result = [];
    for (const b of bytes) {
      for (let i = 7; i >= 0; i--) result.push((b >> i) & 1);
    }
    for (const b of ecc) {
      for (let i = 7; i >= 0; i--) result.push((b >> i) & 1);
    }
    return result;
  },

  _reedSolomon(data, eccCount) {
    // GF(256) with polynomial 0x11D
    const gfExp = new Uint8Array(512);
    const gfLog = new Uint8Array(256);
    let x = 1;
    for (let i = 0; i < 255; i++) {
      gfExp[i] = x;
      gfLog[x] = i;
      x = (x << 1) ^ (x >= 128 ? 0x11D : 0);
    }
    for (let i = 255; i < 512; i++) gfExp[i] = gfExp[i - 255];

    const gfMul = (a, b) => (a === 0 || b === 0) ? 0 : gfExp[gfLog[a] + gfLog[b]];

    // Generator polynomial
    let gen = [1];
    for (let i = 0; i < eccCount; i++) {
      const newGen = new Array(gen.length + 1).fill(0);
      for (let j = 0; j < gen.length; j++) {
        newGen[j] ^= gen[j];
        newGen[j + 1] ^= gfMul(gen[j], gfExp[i]);
      }
      gen = newGen;
    }

    // Division
    const msg = new Uint8Array(data.length + eccCount);
    msg.set(data);
    for (let i = 0; i < data.length; i++) {
      const coef = msg[i];
      if (coef !== 0) {
        for (let j = 1; j < gen.length; j++) {
          msg[i + j] ^= gfMul(gen[j], coef);
        }
      }
    }
    return Array.from(msg.slice(data.length));
  },

  _placeFinderPatterns(m, r, size) {
    const place = (row, col) => {
      for (let dr = -1; dr <= 7; dr++) {
        for (let dc = -1; dc <= 7; dc++) {
          const rr = row + dr, cc = col + dc;
          if (rr < 0 || rr >= size || cc < 0 || cc >= size) continue;
          r[rr][cc] = true;
          if (dr >= 0 && dr <= 6 && dc >= 0 && dc <= 6) {
            const outer = dr === 0 || dr === 6 || dc === 0 || dc === 6;
            const inner = dr >= 2 && dr <= 4 && dc >= 2 && dc <= 4;
            m[rr][cc] = outer || inner ? 1 : 0;
          } else {
            m[rr][cc] = 0;
          }
        }
      }
    };
    place(0, 0);
    place(0, size - 7);
    place(size - 7, 0);
  },

  _placeAlignmentPatterns(m, r, version, size) {
    if (version < 2) return;
    const positions = [6, size - 7];
    for (const row of positions) {
      for (const col of positions) {
        if (r[row][col]) continue; // skip if overlaps finder
        for (let dr = -2; dr <= 2; dr++) {
          for (let dc = -2; dc <= 2; dc++) {
            const rr = row + dr, cc = col + dc;
            r[rr][cc] = true;
            const outer = Math.abs(dr) === 2 || Math.abs(dc) === 2;
            const center = dr === 0 && dc === 0;
            m[rr][cc] = outer || center ? 1 : 0;
          }
        }
      }
    }
  },

  _placeTimingPatterns(m, r, size) {
    for (let i = 8; i < size - 8; i++) {
      if (!r[6][i]) { m[6][i] = i % 2 === 0 ? 1 : 0; r[6][i] = true; }
      if (!r[i][6]) { m[i][6] = i % 2 === 0 ? 1 : 0; r[i][6] = true; }
    }
  },

  _placeDarkModule(m, r, version) {
    const row = 4 * version + 9;
    m[row][8] = 1;
    r[row][8] = true;
  },

  _reserveFormatBits(r, size) {
    for (let i = 0; i < 8; i++) {
      r[8][i] = true; r[8][size - 1 - i] = true;
      r[i][8] = true; r[size - 1 - i][8] = true;
    }
    r[8][8] = true;
  },

  _placeData(m, r, bits, size) {
    let bitIdx = 0;
    let upward = true;
    for (let col = size - 1; col >= 1; col -= 2) {
      if (col === 6) col = 5; // skip timing column
      const rows = upward ? Array.from({ length: size }, (_, i) => size - 1 - i) : Array.from({ length: size }, (_, i) => i);
      for (const row of rows) {
        for (const dc of [0, -1]) {
          const c = col + dc;
          if (c < 0 || r[row][c]) continue;
          m[row][c] = bitIdx < bits.length ? bits[bitIdx] : 0;
          bitIdx++;
        }
      }
      upward = !upward;
    }
  },

  _applyBestMask(m, r, size) {
    // Apply mask 0 (checkerboard) — simplest, works well enough
    for (let row = 0; row < size; row++) {
      for (let col = 0; col < size; col++) {
        if (r[row][col]) continue;
        if ((row + col) % 2 === 0) {
          m[row][col] ^= 1;
        }
      }
    }
  },

  _placeFormatBits(m, size, mask) {
    // Format info for ECC L + mask 0 = 0x77C4 (pre-computed)
    const formatBits = 0x77C4;
    const bits = [];
    for (let i = 14; i >= 0; i--) bits.push((formatBits >> i) & 1);

    // Place around top-left finder
    const positions1 = [[8,0],[8,1],[8,2],[8,3],[8,4],[8,5],[8,7],[8,8],[7,8],[5,8],[4,8],[3,8],[2,8],[1,8],[0,8]];
    for (let i = 0; i < 15; i++) {
      m[positions1[i][0]][positions1[i][1]] = bits[i];
    }
    // Place around other finders
    for (let i = 0; i < 7; i++) m[size - 1 - i][8] = bits[i];
    for (let i = 7; i < 15; i++) m[8][size - 15 + i] = bits[i];
  },
};
