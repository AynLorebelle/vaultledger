'use strict';

/**
 * Zero-dependency icon generator for VaultLedger.
 * Procedurally renders a 256x256 anti-aliased RGBA PNG matching the
 * obsidian + emerald vault shield emblem and wraps it in a valid Windows ICO.
 *
 * Outputs:
 *   - build/icon.png (256x256 RGBA PNG)
 *   - build/icon.ico (256x256 PNG-in-ICO for Windows NSIS/portable builds)
 */

const fs = require('fs');
const path = require('path');
const zlib = require('zlib');

const PNG_SIZE = 512;
const ICO_SIZE = 256;
const BUILD_DIR = path.resolve(__dirname, '../build');
const PNG_PATH = path.join(BUILD_DIR, 'icon.png');
const ICO_PATH = path.join(BUILD_DIR, 'icon.ico');

// ---------------------------------------------------------------------------
// Math & SDF Primitives
// ---------------------------------------------------------------------------

function clamp(v, lo, hi) {
  return v < lo ? lo : v > hi ? hi : v;
}

function lerp(a, b, t) {
  return a + (b - a) * t;
}

function smoothstep(edge0, edge1, x) {
  const t = clamp((x - edge0) / (edge1 - edge0), 0, 1);
  return t * t * (3 - 2 * t);
}

function mixColor(c0, c1, t) {
  const k = clamp(t, 0, 1);
  return [
    lerp(c0[0], c1[0], k),
    lerp(c0[1], c1[1], k),
    lerp(c0[2], c1[2], k),
  ];
}

function blendOver(dst, srcRgb, srcAlpha) {
  const a = clamp(srcAlpha, 0, 1);
  if (a <= 0) return;
  const invA = 1 - a;
  const outA = a + dst[3] * invA;
  if (outA <= 0) return;
  dst[0] = (srcRgb[0] * a + dst[0] * dst[3] * invA) / outA;
  dst[1] = (srcRgb[1] * a + dst[1] * dst[3] * invA) / outA;
  dst[2] = (srcRgb[2] * a + dst[2] * dst[3] * invA) / outA;
  dst[3] = outA;
}

/** Signed distance to an axis-aligned rounded rectangle. */
function sdRoundedBox(px, py, cx, cy, halfW, halfH, radius) {
  const dx = Math.abs(px - cx) - halfW + radius;
  const dy = Math.abs(py - cy) - halfH + radius;
  const outside = Math.hypot(Math.max(dx, 0), Math.max(dy, 0));
  const inside = Math.min(Math.max(dx, dy), 0);
  return outside + inside - radius;
}

/**
 * Generates polygon vertices for the VaultLedger shield matching public/icon.svg
 * scaled from 512x512 coordinates into 256x256 space.
 */
function buildShieldPolygon(scale = 1) {
  const cx = 128;
  const cy = 128;
  const s = (x, y) => [cx + (x - cx) * scale, cy + (y - cy) * scale];

  // Key control points matching SVG path (scaled 0.5x from 512 -> 256):
  // M128 38 L198 64 V123 C198 167 168 197 128 216 C88 197 58 167 58 123 V64 Z
  const pts = [];
  pts.push(s(128, 38));
  pts.push(s(198, 64));
  pts.push(s(198, 123));

  const steps = 20;
  // Right cubic Bezier curve: P0(198,123), P1(198,167), P2(168,197), P3(128,216)
  for (let i = 1; i <= steps; i++) {
    const t = i / steps;
    const u = 1 - t;
    const x = u * u * u * 198 + 3 * u * u * t * 198 + 3 * u * t * t * 168 + t * t * t * 128;
    const y = u * u * u * 123 + 3 * u * u * t * 167 + 3 * u * t * t * 197 + t * t * t * 216;
    pts.push(s(x, y));
  }

  // Left cubic Bezier curve: P0(128,216), P1(88,197), P2(58,167), P3(58,123)
  for (let i = 1; i <= steps; i++) {
    const t = i / steps;
    const u = 1 - t;
    const x = u * u * u * 128 + 3 * u * u * t * 88 + 3 * u * t * t * 58 + t * t * t * 58;
    const y = u * u * u * 216 + 3 * u * u * t * 197 + 3 * u * t * t * 167 + t * t * t * 123;
    pts.push(s(x, y));
  }

  pts.push(s(58, 64));
  return pts;
}

/** Exact signed distance to a closed 2D polygon (negative inside, positive outside). */
function sdPolygon(px, py, poly) {
  let minDistSq = Infinity;
  let inside = false;

  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const xi = poly[i][0];
    const yi = poly[i][1];
    const xj = poly[j][0];
    const yj = poly[j][1];

    // Ray-cast parity for inside/outside sign
    if ((yi > py) !== (yj > py) && px < ((xj - xi) * (py - yi)) / (yj - yi) + xi) {
      inside = !inside;
    }

    // Distance to segment (xi,yi)-(xj,yj)
    const ex = xj - xi;
    const ey = yj - yi;
    const wx = px - xi;
    const wy = py - yi;
    const lenSq = ex * ex + ey * ey;
    const t = lenSq > 0 ? clamp((wx * ex + wy * ey) / lenSq, 0, 1) : 0;
    const dx = wx - ex * t;
    const dy = wy - ey * t;
    const dSq = dx * dx + dy * dy;
    if (dSq < minDistSq) minDistSq = dSq;
  }

  const dist = Math.sqrt(minDistSq);
  return inside ? -dist : dist;
}

// ---------------------------------------------------------------------------
// Rasterizer (256x256 RGBA)
// ---------------------------------------------------------------------------

function renderIconBitmap(size = 512) {
  const outerShield = buildShieldPolygon(1.0);
  const innerShield = buildShieldPolygon(0.81);
  const rgba = Buffer.alloc(size * size * 4);
  const scaleTo256 = 256 / size;

  // Color palette (RGB 0..255)
  const bgTop = [15, 23, 42]; // #0f172a
  const bgMid = [6, 12, 26]; // #060c1a
  const bgBot = [2, 6, 23]; // #020617
  const rimColor = [30, 41, 59]; // #1e293b
  const shieldFillTop = [17, 31, 53]; // #111f35
  const shieldFillBot = [7, 17, 32]; // #071120
  const emeraldLight = [110, 231, 183]; // #6ee7b7
  const emeraldMid = [16, 185, 129]; // #10b981
  const emeraldDark = [5, 150, 105]; // #059669
  const emeraldMint = [167, 243, 208]; // #a7f3d0
  const emeraldBright = [52, 211, 153]; // #34d399

  const aa = 0.75 * scaleTo256;

  for (let y = 0; y < size; y++) {
    const py = (y + 0.5) * scaleTo256;
    for (let x = 0; x < size; x++) {
      const px = (x + 0.5) * scaleTo256;
      const dst = [0, 0, 0, 0];

      // 1. Obsidian rounded icon plate (20..492 in 512 space => 10..246 in 256 space)
      const plateDist = sdRoundedBox(px, py, 128, 128, 118, 118, 54);
      const plateAlpha = 1 - smoothstep(-aa, aa, plateDist);

      if (plateAlpha > 0) {
        const diagT = clamp(((px - 32) * 0.45 + (py - 16) * 0.85) / 224, 0, 1);
        const bgCol =
          diagT < 0.55
            ? mixColor(bgTop, bgMid, diagT / 0.55)
            : mixColor(bgMid, bgBot, (diagT - 0.55) / 0.45);
        blendOver(dst, bgCol, plateAlpha);

        // Radial emerald glow near upper center
        const glowDist = Math.hypot(px - 128, py - 82) / 148;
        const glowAlpha = Math.pow(clamp(1 - glowDist, 0, 1), 1.8) * 0.28 * plateAlpha;
        blendOver(dst, emeraldMid, glowAlpha);

        // Subtle obsidian slate border ring
        const rimDist = Math.abs(plateDist + 2.5) - 1.25;
        const rimAlpha = (1 - smoothstep(-aa, aa, rimDist)) * plateAlpha;
        blendOver(dst, rimColor, rimAlpha);
      }

      // 2. Geometric vault shield fill & emerald border
      const shieldDist = sdPolygon(px, py, outerShield);
      const shieldFillAlpha = 1 - smoothstep(-aa, aa, shieldDist);
      if (shieldFillAlpha > 0) {
        const fillT = clamp((py - 42) / 172, 0, 1);
        const fillCol = mixColor(shieldFillTop, shieldFillBot, fillT);
        blendOver(dst, fillCol, shieldFillAlpha);
      }

      // Inner subtle vault frame
      const innerDist = Math.abs(sdPolygon(px, py, innerShield)) - 1.0;
      const innerAlpha = (1 - smoothstep(-aa, aa, innerDist)) * 0.28;
      if (innerAlpha > 0) {
        blendOver(dst, emeraldMid, innerAlpha);
      }

      // Outer shield stroke (half-width 4.5px => 9px stroke)
      const strokeDist = Math.abs(shieldDist) - 4.5;
      const strokeAlpha = 1 - smoothstep(-aa, aa, strokeDist);
      if (strokeAlpha > 0) {
        const st = clamp(((px - 56) * 0.45 + (py - 36) * 0.75) / 180, 0, 1);
        const strokeCol =
          st < 0.5
            ? mixColor(emeraldLight, emeraldMid, st * 2)
            : mixColor(emeraldMid, emeraldDark, (st - 0.5) * 2);
        blendOver(dst, strokeCol, strokeAlpha);
      }

      // 3. Vault crest accent dot at (128, 77), radius 5
      const dotDist = Math.hypot(px - 128, py - 77) - 5.2;
      const dotAlpha = 1 - smoothstep(-aa, aa, dotDist);
      if (dotAlpha > 0) {
        blendOver(dst, emeraldBright, dotAlpha);
      }

      // 4. Three rising ledger bars
      // Bar 1: x 89..108 (cx=98.5, hw=9.5), y 132..168 (cy=150, hh=18)
      const b1Dist = sdRoundedBox(px, py, 98.5, 150, 9.5, 18, 4.5);
      const b1Alpha = 1 - smoothstep(-aa, aa, b1Dist);
      if (b1Alpha > 0) {
        const bt = clamp((py - 132) / 36, 0, 1);
        blendOver(dst, mixColor(emeraldBright, emeraldDark, bt), b1Alpha);
      }

      // Bar 2: x 118.5..137.5 (cx=128, hw=9.5), y 112..168 (cy=140, hh=28)
      const b2Dist = sdRoundedBox(px, py, 128, 140, 9.5, 28, 4.5);
      const b2Alpha = 1 - smoothstep(-aa, aa, b2Dist);
      if (b2Alpha > 0) {
        const bt = clamp((py - 112) / 56, 0, 1);
        blendOver(dst, mixColor(emeraldLight, emeraldMid, bt), b2Alpha);
      }

      // Bar 3: x 148..167 (cx=157.5, hw=9.5), y 91..168 (cy=129.5, hh=38.5)
      const b3Dist = sdRoundedBox(px, py, 157.5, 129.5, 9.5, 38.5, 4.5);
      const b3Alpha = 1 - smoothstep(-aa, aa, b3Dist);
      if (b3Alpha > 0) {
        const bt = clamp((py - 91) / 77, 0, 1);
        blendOver(dst, mixColor(emeraldMint, emeraldMid, bt), b3Alpha);
      }

      // 5. Ledger baseline: x 87..169 (cx=128, hw=41), y 173..178 (cy=175.5, hh=2.5)
      const baseDist = sdRoundedBox(px, py, 128, 175.5, 41, 2.5, 2.5);
      const baseAlpha = (1 - smoothstep(-aa, aa, baseDist)) * 0.58;
      if (baseAlpha > 0) {
        blendOver(dst, emeraldMid, baseAlpha);
      }

      const idx = (y * size + x) * 4;
      rgba[idx] = Math.round(clamp(dst[0], 0, 255));
      rgba[idx + 1] = Math.round(clamp(dst[1], 0, 255));
      rgba[idx + 2] = Math.round(clamp(dst[2], 0, 255));
      rgba[idx + 3] = Math.round(clamp(dst[3] * 255, 0, 255));
    }
  }

  return rgba;
}

// ---------------------------------------------------------------------------
// PNG & ICO Binary Encoders (Built-in zlib + CRC-32)
// ---------------------------------------------------------------------------

const CRC_TABLE = (() => {
  const table = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) {
      c = (c & 1) !== 0 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    }
    table[n] = c >>> 0;
  }
  return table;
})();

function crc32(buffer) {
  let c = 0xffffffff;
  for (let i = 0; i < buffer.length; i++) {
    c = CRC_TABLE[(c ^ buffer[i]) & 0xff] ^ (c >>> 8);
  }
  return (c ^ 0xffffffff) >>> 0;
}

function makePngChunk(type, data) {
  const typeBuf = Buffer.from(type, 'ascii');
  const lenBuf = Buffer.alloc(4);
  lenBuf.writeUInt32BE(data.length, 0);

  const crcInput = Buffer.concat([typeBuf, data]);
  const crcBuf = Buffer.alloc(4);
  crcBuf.writeUInt32BE(crc32(crcInput), 0);

  return Buffer.concat([lenBuf, typeBuf, data, crcBuf]);
}

function encodePng(width, height, rgba) {
  const signature = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);

  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(width, 0);
  ihdr.writeUInt32BE(height, 4);
  ihdr[8] = 8; // bit depth: 8
  ihdr[9] = 6; // color type: RGBA
  ihdr[10] = 0; // compression: deflate
  ihdr[11] = 0; // filter: adaptive
  ihdr[12] = 0; // interlace: none

  const stride = width * 4;
  const rawScanlines = Buffer.alloc((stride + 1) * height);
  for (let y = 0; y < height; y++) {
    const rowStart = y * (stride + 1);
    rawScanlines[rowStart] = 0; // filter type 0 (None)
    rgba.copy(rawScanlines, rowStart + 1, y * stride, (y + 1) * stride);
  }

  const compressed = zlib.deflateSync(rawScanlines, { level: 9 });

  return Buffer.concat([
    signature,
    makePngChunk('IHDR', ihdr),
    makePngChunk('IDAT', compressed),
    makePngChunk('IEND', Buffer.alloc(0)),
  ]);
}

/**
 * Wraps a 256x256 PNG buffer into a standard Windows Vista+ ICO container.
 * Width/height byte 0 in ICONDIRENTRY denotes 256px per the ICO specification.
 */
function encodeIcoFromPng(pngBuffer) {
  const header = Buffer.alloc(6);
  header.writeUInt16LE(0, 0); // reserved
  header.writeUInt16LE(1, 2); // image type: 1 = icon (.ICO)
  header.writeUInt16LE(1, 4); // image count: 1

  const entry = Buffer.alloc(16);
  entry[0] = 0; // width: 256
  entry[1] = 0; // height: 256
  entry[2] = 0; // color palette count
  entry[3] = 0; // reserved
  entry.writeUInt16LE(1, 4); // color planes
  entry.writeUInt16LE(32, 6); // bits per pixel
  entry.writeUInt32LE(pngBuffer.length, 8); // image data size
  entry.writeUInt32LE(header.length + entry.length, 12); // offset to image data (22)

  return Buffer.concat([header, entry, pngBuffer]);
}

function main() {
  fs.mkdirSync(BUILD_DIR, { recursive: true });

  const rgba512 = renderIconBitmap(PNG_SIZE);
  const pngBuffer512 = encodePng(PNG_SIZE, PNG_SIZE, rgba512);

  const rgba256 = renderIconBitmap(ICO_SIZE);
  const pngBuffer256 = encodePng(ICO_SIZE, ICO_SIZE, rgba256);
  const icoBuffer = encodeIcoFromPng(pngBuffer256);

  fs.writeFileSync(PNG_PATH, pngBuffer512);
  fs.writeFileSync(ICO_PATH, icoBuffer);

  console.log(
    `[VaultLedger] Generated desktop icons: build/icon.png (${PNG_SIZE}x${PNG_SIZE}, ${pngBuffer512.length} bytes), build/icon.ico (${ICO_SIZE}x${ICO_SIZE}, ${icoBuffer.length} bytes)`
  );
}

main();
