import fs from "fs";
import path from "path";
import zlib from "zlib";

const publicImagesDir = path.join(process.cwd(), "public", "images");
if (!fs.existsSync(publicImagesDir)) {
  fs.mkdirSync(publicImagesDir, { recursive: true });
}

// Simple CRC32 implementation for standard PNG chunks
function makeCrcTable() {
  const cTable = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) {
      c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    }
    cTable[n] = c;
  }
  return cTable;
}

const crcTable = makeCrcTable();

function crc32(buf) {
  let c = 0xffffffff;
  for (let i = 0; i < buf.length; i++) {
    c = crcTable[(c ^ buf[i]) & 0xff] ^ (c >>> 8);
  }
  return (c ^ 0xffffffff) >>> 0;
}

function makeChunk(type, data) {
  const len = data.length;
  const chunk = Buffer.alloc(4 + 4 + len + 4);
  chunk.writeUInt32BE(len, 0);
  chunk.write(type, 4, 4, "ascii");
  data.copy(chunk, 8);
  const typeAndData = chunk.subarray(4, 8 + len);
  const crc = crc32(typeAndData);
  chunk.writeUInt32BE(crc, 8 + len);
  return chunk;
}

function generatePng(width, height, getPixel) {
  const header = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);

  const ihdrData = Buffer.alloc(13);
  ihdrData.writeUInt32BE(width, 0);
  ihdrData.writeUInt32BE(height, 4);
  ihdrData.writeUInt8(8, 8); // 8-bit depth
  ihdrData.writeUInt8(6, 9); // RGBA
  ihdrData.writeUInt8(0, 10);
  ihdrData.writeUInt8(0, 11);
  ihdrData.writeUInt8(0, 12);
  const ihdrChunk = makeChunk("IHDR", ihdrData);

  const rowSize = 1 + width * 4;
  const rawData = Buffer.alloc(height * rowSize);

  for (let y = 0; y < height; y++) {
    const rowOffset = y * rowSize;
    rawData[rowOffset] = 0; // Filter: None
    for (let x = 0; x < width; x++) {
      const pxOffset = rowOffset + 1 + x * 4;
      const [r, g, b, a] = getPixel(x, y, width, height);
      rawData[pxOffset] = r;
      rawData[pxOffset + 1] = g;
      rawData[pxOffset + 2] = b;
      rawData[pxOffset + 3] = a;
    }
  }

  const compressedData = zlib.deflateSync(rawData);
  const idatChunk = makeChunk("IDAT", compressedData);
  const iendChunk = makeChunk("IEND", Buffer.alloc(0));

  return Buffer.concat([header, ihdrChunk, idatChunk, iendChunk]);
}

// 1. Generate hero-illustration.png (gradient branded medical hero card)
const heroPng = generatePng(600, 600, (x, y, w, h) => {
  const nx = x / w;
  const ny = y / h;
  // Gradient background from navy (#0B2A4A) to teal (#0F766E)
  const r = Math.round(11 + (15 - 11) * nx + (18 - 11) * ny);
  const g = Math.round(42 + (118 - 42) * nx + (90 - 42) * ny);
  const b = Math.round(74 + (110 - 74) * nx + (80 - 74) * ny);
  return [r, g, b, 255];
});

fs.writeFileSync(path.join(publicImagesDir, "hero-illustration.png"), heroPng);

// 2. Generate sample-report.png (clean white/slate document preview)
const reportPng = generatePng(400, 560, (x, y, w, h) => {
  const isBorder = x < 4 || x > w - 5 || y < 4 || y > h - 5;
  if (isBorder) return [203, 213, 225, 255]; // slate-300
  if (y < 80) return [241, 245, 249, 255]; // header slate-100
  // simulated text rows
  const rowY = (y - 80) % 28;
  if (rowY < 12 && x > 20 && x < w - 20) {
    return [226, 232, 240, 255]; // slate-200 line
  }
  return [255, 255, 255, 255];
});

fs.writeFileSync(path.join(publicImagesDir, "sample-report.png"), reportPng);

console.log("Assets generated successfully!");
