import { writeFileSync } from 'fs';
import { join, dirname } from 'path';
import { deflateSync } from 'node:zlib';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// --- PNG/ICO Encoding Helpers (Adapted from electron-builder.mjs) ---

function makeCrc32() {
  const table = new Uint32Array(256);
  for (let i = 0; i < 256; i++) {
    let c = i;
    for (let k = 0; k < 8; k++) {
      c = (c & 1) ? (0xedb88320 ^ (c >>> 1)) : (c >>> 1);
    }
    table[i] = c >>> 0;
  }
  return (buf) => {
    let c = 0xffffffff;
    for (let i = 0; i < buf.length; i++) {
      c = table[(c ^ buf[i]) & 0xff] ^ (c >>> 8);
    }
    return (c ^ 0xffffffff) >>> 0;
  };
}

const crc32 = makeCrc32();

function pngChunk(type, data) {
  const payload = data ? Buffer.from(data) : Buffer.alloc(0);
  const typeBuf = Buffer.from(type, 'ascii');
  const len = Buffer.alloc(4);
  len.writeUInt32BE(payload.length, 0);
  const crc = Buffer.alloc(4);
  const crcValue = crc32(Buffer.concat([typeBuf, payload]));
  crc.writeUInt32BE(crcValue >>> 0, 0);
  return Buffer.concat([len, typeBuf, payload, crc]);
}

function encodePngRgba(width, height, rgba) {
  const signature = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(width, 0);
  ihdr.writeUInt32BE(height, 4);
  ihdr.writeUInt8(8, 8);
  ihdr.writeUInt8(6, 9);
  ihdr.writeUInt8(0, 10);
  ihdr.writeUInt8(0, 11);
  ihdr.writeUInt8(0, 12);

  const stride = width * 4;
  const raw = Buffer.alloc((stride + 1) * height);
  for (let y = 0; y < height; y++) {
    const rowStart = y * (stride + 1);
    raw[rowStart] = 0;
    raw.set(rgba.subarray(y * stride, (y + 1) * stride), rowStart + 1);
  }

  const idat = deflateSync(raw);
  return Buffer.concat([
    signature,
    pngChunk('IHDR', ihdr),
    pngChunk('IDAT', idat),
    pngChunk('IEND'),
  ]);
}

function encodeIcoFromPngBuffers(entries) {
  const count = entries.length;
  const header = Buffer.alloc(6);
  header.writeUInt16LE(0, 0);
  header.writeUInt16LE(1, 2);
  header.writeUInt16LE(count, 4);

  const dir = Buffer.alloc(16 * count);
  const images = [];
  let offset = 6 + 16 * count;

  for (let i = 0; i < count; i++) {
    const { size, png } = entries[i];
    const widthByte = size === 256 ? 0 : size;
    const heightByte = size === 256 ? 0 : size;
    const entry = Buffer.alloc(16);
    entry.writeUInt8(widthByte, 0);
    entry.writeUInt8(heightByte, 1);
    entry.writeUInt8(0, 2);
    entry.writeUInt8(0, 3);
    entry.writeUInt16LE(1, 4);
    entry.writeUInt16LE(32, 6);
    entry.writeUInt32LE(png.length, 8);
    entry.writeUInt32LE(offset, 12);
    entry.copy(dir, i * 16);
    images.push(png);
    offset += png.length;
  }
  return Buffer.concat([header, dir, ...images]);
}

// --- SDF Rendering Logic ---

// Distance to line segment (p1, p2)
function distSegment(px, py, x1, y1, x2, y2) {
  const dx = x2 - x1;
  const dy = y2 - y1;
  if (dx === 0 && dy === 0) return Math.hypot(px - x1, py - y1);
  const t = ((px - x1) * dx + (py - y1) * dy) / (dx * dx + dy * dy);
  const tClamped = Math.max(0, Math.min(1, t));
  const closestX = x1 + tClamped * dx;
  const closestY = y1 + tClamped * dy;
  return Math.hypot(px - closestX, py - closestY);
}

// Distance to Arc (center cx,cy, radius r, angle range? assuming full semi-circle bottom)
// U arc: center (256, 300), radius 136. From 180 deg to 360/0 deg (downwards)
// Actually standard SVG coordinate system: y increases downwards.
// V 300 means down to y=300.
// A 136 136 0 0 0 392 300.
// Start point (120, 300). End point (392, 300).
// Large arc flag 0, sweep flag 0.
// Center is midpoint of chord? (120+392)/2 = 256. y=300.
// So center is (256, 300). Radius 136.
// It draws a semi-circle from 120,300 to 392,300 going *down*?
// Wait, in SVG '0 0 0' sweep flag 0 means counter-clockwise?
// M120 300 -> 392 300.
// If center is (256, 300), radius 136.
// Points are (-136, 0) and (+136, 0) relative to center.
// Arc must go "down" to look like a U bottom.
// In SVG, positive Y is down.
// So points with y > 300.
// Distance to semi-circle:
// Calculate dist to full circle border |dist(p, c) - r|
// Check if point is in the correct half-plane (y >= 300).
// If not, distance is to endpoints.
function distArc(px, py, cx, cy, r) {
  // Check if angle is in [0, PI] (relative to x axis, y positive)
  // atan2(dy, dx).
  // We want the bottom half. y >= cy.
  const dy = py - cy;
  const dx = px - cx;
  
  if (dy >= 0) {
    // In the sector
    const dCenter = Math.hypot(dx, dy);
    return Math.abs(dCenter - r);
  } else {
    // Above the center line, closest point is one of the endpoints (cx-r, cy) or (cx+r, cy)
    const d1 = Math.hypot(px - (cx - r), py - cy);
    const d2 = Math.hypot(px - (cx + r), py - cy);
    return Math.min(d1, d2);
  }
}

function getSdf(x, y, scale) {
  // Original coordinates (512x512 reference)
  // Scale factor applied to inputs to map to 512 space
  const sx = x / scale;
  const sy = y / scale;

  // Shapes
  // 1. Left Vertical Line: (120, 100) to (120, 300)
  const dL1 = distSegment(sx, sy, 120, 100, 120, 300);
  
  // 2. Right Vertical Line: (392, 100) to (392, 300)
  const dL2 = distSegment(sx, sy, 392, 100, 392, 300);
  
  // 3. Bottom Arc: Center (256, 300), Radius 136
  const dArc = distArc(sx, sy, 256, 300, 136);
  
  // 4. Slash: (392, 100) to (320, 220)
  const dSlash = distSegment(sx, sy, 392, 100, 320, 220);

  // Union of shapes (min distance)
  const dU = Math.min(dL1, dL2, dArc);
  const dShape = Math.min(dU, dSlash);

  return dShape * scale; // Scale distance back to pixel space
}

function generateIcon(size) {
  const w = size;
  const h = size;
  const data = new Uint8Array(w * h * 4);
  const scale = size / 512;
  const strokeWidth = 48 * scale;
  const halfStroke = strokeWidth / 2;

  // Gradient Colors (Purple/Indigo)
  // Warm White Background (Gradient from slightly warmer to slightly cooler white)
  // bg0: #FDFBF7 (Warm White) -> r:253, g:251, b:247
  // bg1: #F5F5F5 (White Smoke) -> r:245, g:245, b:245
  const bg0 = { r: 253, g: 251, b: 247 };
  const bg1 = { r: 245, g: 245, b: 245 };

  // Bright Black Logo
  // #1A1A1A -> r:26, g:26, b:26
  const fg = { r: 26, g: 26, b: 26, a: 255 };
  const radius = Math.floor(size * 0.22); // Squircle radius
  const r2 = radius * radius;

  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const idx = (y * w + x) * 4;

      // 1. Render Background (Squircle Gradient)
      const t = (x + y) / (2 * (size - 1));
      const r = bg0.r + (bg1.r - bg0.r) * t;
      const g = bg0.g + (bg1.g - bg0.g) * t;
      const b = bg0.b + (bg1.b - bg0.b) * t;

      // Squircle mask
      let bgAlpha = 255;
      const dx = x < radius ? radius - x : x >= w - radius ? x - (w - radius - 1) : 0;
      const dy = y < radius ? radius - y : y >= h - radius ? y - (h - radius - 1) : 0;
      if (dx !== 0 && dy !== 0) {
        const d2 = dx * dx + dy * dy;
        // Basic AA for background
        const dist = Math.sqrt(d2);
        if (dist > radius) bgAlpha = 0;
        else if (dist > radius - 1) bgAlpha = Math.floor(255 * (radius - dist));
      }

      // 2. Render Logo (SDF)
      // Map x,y to centered logo coordinates
      // The logo is 512x512. We want to fit it inside the icon with some padding.
      // Let's say logo takes 70% of size.
      const logoScale = size / 512 * 0.7; 
      const logoOffsetX = (size - 512 * logoScale) / 2;
      const logoOffsetY = (size - 512 * logoScale) / 2;
      
      // Transform pixel to logo space
      const lx = (x - logoOffsetX) / logoScale;
      const ly = (y - logoOffsetY) / logoScale;
      
      // SDF in logo space (unscaled)
      // We pass 1.0 as scale to getSdf because we already transformed coordinates
      const dist = getSdf(lx, ly, 1.0);
      // const scaledStroke = 48 / 2; // Half stroke in logo space
      
      // AA for logo
      // Distance is from center of stroke.
      // We want pixels where dist <= scaledStroke
      // AA edge at scaledStroke +/- 0.5/logoScale? 
      // Actually simpler: map distance to pixel opacity.
      // dist is in logo units. 1 pixel = 1/logoScale units.
      const pixelDist = dist * logoScale; // Distance in screen pixels
      const targetStrokeWidth = 48 * logoScale;
      const halfTarget = targetStrokeWidth / 2;
      
      let logoAlpha = 0;
      if (pixelDist < halfTarget - 0.5) {
        logoAlpha = 255;
      } else if (pixelDist < halfTarget + 0.5) {
        logoAlpha = Math.floor(255 * (halfTarget + 0.5 - pixelDist));
      }

      // Composite: White Logo on Gradient Background
      // Or Transparent Logo (cutout) on Gradient Background?
      // White on Gradient pops more.
      
      if (bgAlpha === 0) {
        data[idx] = 0; data[idx+1] = 0; data[idx+2] = 0; data[idx+3] = 0;
      } else {
        // Blend logo (black) over background (white)
        const bgR = r; const bgG = g; const bgB = b;
        const fgR = fg.r; const fgG = fg.g; const fgB = fg.b;
        
        const a = logoAlpha / 255;
        
        data[idx] = Math.floor(fgR * a + bgR * (1 - a));
        data[idx+1] = Math.floor(fgG * a + bgG * (1 - a));
        data[idx+2] = Math.floor(fgB * a + bgB * (1 - a));
        data[idx+3] = bgAlpha;
      }
    }
  }
  return encodePngRgba(w, h, data);
}

function generateTrayIcon(size) {
  // Generates monochrome/template icon (just the logo shape, transparent background)
  const w = size;
  const h = size;
  const data = new Uint8Array(w * h * 4);
  
  // Padding 10%
  // Logo scale
  const logoScale = size / 512 * 0.8; 
  const logoOffsetX = (size - 512 * logoScale) / 2;
  const logoOffsetY = (size - 512 * logoScale) / 2;

  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const idx = (y * w + x) * 4;
      
      // Transform pixel to logo space
      const lx = (x - logoOffsetX) / logoScale;
      const ly = (y - logoOffsetY) / logoScale;
      
      const dist = getSdf(lx, ly, 1.0);
      const pixelDist = dist * logoScale;
      const targetStrokeWidth = 48 * logoScale;
      const halfTarget = targetStrokeWidth / 2;
      
      let alpha = 0;
      if (pixelDist < halfTarget - 0.5) {
        alpha = 255;
      } else if (pixelDist < halfTarget + 0.5) {
        alpha = Math.floor(255 * (halfTarget + 0.5 - pixelDist));
      }
      
      // Black for template (macOS handles color automatically based on alpha?)
      // Actually for "Template" images, only alpha channel matters. Color is ignored (treated as black).
      data[idx] = 0;
      data[idx+1] = 0;
      data[idx+2] = 0;
      data[idx+3] = alpha;
    }
  }
  return encodePngRgba(w, h, data);
}

// --- Main Execution ---

const rootDir = join(__dirname, '../..');
const resourcesDir = join(rootDir, 'frontend/resources/icons');
const buildResourcesDir = join(rootDir, 'frontend/buildResources');

const sizes = [16, 24, 32, 48, 64, 128, 256];
const entries = sizes.map(s => ({ size: s, png: generateIcon(s) }));

// Generate ICO
const icoBuffer = encodeIcoFromPngBuffers(entries);

// Generate main PNG (512x512)
const pngBuffer = generateIcon(512);

// Write files
console.log('Writing icons to:', resourcesDir);
writeFileSync(join(resourcesDir, 'icon.ico'), icoBuffer);
writeFileSync(join(resourcesDir, 'icon.png'), pngBuffer);

// Write individual size PNGs for Linux/Web
sizes.forEach(s => {
  writeFileSync(join(resourcesDir, `${s}x${s}.png`), generateIcon(s));
});
writeFileSync(join(resourcesDir, '512x512.png'), pngBuffer);

// Write Tray Icon (Template)
// Standard macOS tray size is ~22x22 points (usually @2x = 44px)
// Let's generate a 22x22 version as 'tray-icon-Template.png'
// Or maybe higher res? 'tray-icon-Template@2x.png'?
// tray.ts uses 'tray-icon-Template.png'. If it's a retina screen, Electron might scale it or look for @2x.
// Let's generate a high quality one. 44x44 but named appropriately?
// Actually just sticking to what was there.
// If I look at file list, there was 'tray-icon-Template.png'.
// Let's make it 22x22 (standard) or 44x44?
// Let's make it 44x44 for better quality and let OS scale down if needed?
// Or maybe 22x22.
// Standard is 22px height.
const trayBuffer = generateTrayIcon(22);
writeFileSync(join(resourcesDir, 'tray-icon-Template.png'), trayBuffer);
// Also a @2x version?
const trayBuffer2x = generateTrayIcon(44);
writeFileSync(join(resourcesDir, 'tray-icon-Template@2x.png'), trayBuffer2x);

// Also update buildResources
console.log('Writing icons to:', buildResourcesDir);
writeFileSync(join(buildResourcesDir, 'icon.ico'), icoBuffer);
writeFileSync(join(buildResourcesDir, 'icon.png'), pngBuffer);

console.log('Icons updated successfully.');
