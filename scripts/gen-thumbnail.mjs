#!/usr/bin/env node
/** 從遊戲邏輯狀態渲染 640×480 封面幀（4:3），供 thumbnail.png 使用。 */
import { createGame, openRoute, upgradeDock, dispatchShip, acceptContract } from "../game.js";
import { writeFileSync } from "node:fs";
import { deflateSync } from "node:zlib";

const W = 640;
const H = 480;
const buf = new Uint8Array(W * H * 4);

function setPx(x, y, r, g, b, a = 255) {
  if (x < 0 || y < 0 || x >= W || y >= H) return;
  const i = (y * W + x) * 4;
  buf[i] = r;
  buf[i + 1] = g;
  buf[i + 2] = b;
  buf[i + 3] = a;
}

function fillRect(x0, y0, x1, y1, r, g, b) {
  for (let y = y0; y < y1; y += 1) {
    for (let x = x0; x < x1; x += 1) setPx(x, y, r, g, b);
  }
}

function fillGrad() {
  for (let y = 0; y < H; y += 1) {
    const t = y / H;
    const r = Math.round(26 + t * 8);
    const g = Math.round(90 - t * 40);
    const b = Math.round(122 - t * 50);
    for (let x = 0; x < W; x += 1) setPx(x, y, r, g, b);
  }
}

function drawText(text, cx, cy, size, color) {
  const glyphs = {
    藍: [[1, 0, 1], [1, 0, 1], [1, 1, 1], [1, 0, 1], [1, 0, 1]],
    港: [[0, 1, 0], [1, 1, 1], [1, 0, 1], [1, 1, 1], [0, 1, 0]],
    Q: [[0, 1, 1, 0], [1, 0, 0, 1], [1, 0, 1, 1], [1, 0, 0, 1], [0, 1, 1, 0]],
    1: [[0, 1, 0], [1, 1, 0], [0, 1, 0], [0, 1, 0], [1, 1, 1]],
    2: [[1, 1, 1], [0, 0, 1], [1, 1, 1], [1, 0, 0], [1, 1, 1]],
    3: [[1, 1, 1], [0, 0, 1], [1, 1, 1], [0, 0, 1], [1, 1, 1]],
    "/": [[0, 0, 1], [0, 1, 0], [1, 0, 0]],
    $: [[0, 1, 1, 0], [1, 1, 1, 1], [0, 1, 0], [1, 1, 1, 1], [0, 1, 1, 0]],
    0: [[0, 1, 1, 0], [1, 0, 0, 1], [1, 0, 0, 1], [1, 0, 0, 1], [0, 1, 1, 0]],
    5: [[1, 1, 1], [1, 0, 0], [1, 1, 1], [0, 0, 1], [1, 1, 1]],
    8: [[0, 1, 1, 0], [1, 0, 0, 1], [0, 1, 1, 0], [1, 0, 0, 1], [0, 1, 1, 0]],
  };
  let x = cx;
  for (const ch of text) {
    const g = glyphs[ch];
    if (!g) { x += size; continue; }
    for (let row = 0; row < g.length; row += 1) {
      for (let col = 0; col < g[row].length; col += 1) {
        if (!g[row][col]) continue;
        fillRect(x + col * 2, cy + row * 2, x + col * 2 + 2, cy + row * 2 + 2, ...color);
      }
    }
    x += g[0].length * 2 + 4;
  }
}

fillGrad();

let state = createGame({ seed: 7 });
state = upgradeDock(state, 0);
state = upgradeDock(state, 1);
state = openRoute(state, "shanghai");
state = openRoute(state, "tokyo");
state = dispatchShip(state, "shanghai");
if (state.offers[0]) state = acceptContract(state, state.offers[0].id);

const PORT = { x: W * 0.5, y: H * 0.72 };
fillRect(PORT.x - 90, PORT.y, PORT.x + 90, PORT.y + 30, 61, 41, 23);
fillRect(PORT.x - 30, PORT.y - 50, PORT.x + 30, PORT.y, 201, 214, 223);

for (let i = 0; i < 6; i += 1) {
  const x = 80 + i * 85;
  const lv = state.docks[i].level;
  const h = 30 + lv * 12;
  fillRect(x - 30, PORT.y + 30 - h, x + 30, PORT.y + 30, 42, 85, 112);
  fillRect(x - 30, PORT.y + 30 - h, x + 30, PORT.y + 30 - h + 6, 72, 202, 228);
}

const routes = [
  { x: 120, y: 120 },
  { x: 280, y: 80 },
  { x: 420, y: 100 },
  { x: 540, y: 150 },
];
for (const p of routes) {
  for (let t = 0; t < 1; t += 0.02) {
    const x = Math.round(PORT.x + (p.x - PORT.x) * t);
    const y = Math.round(PORT.y - 10 + (p.y - PORT.y + 10) * t);
    setPx(x, y, 72, 202, 228);
  }
  fillRect(p.x - 18, p.y - 18, p.x + 18, p.y + 18, 72, 202, 228);
}

drawText("藍港", PORT.x - 30, PORT.y - 70, 2, [238, 246, 251]);
drawText(`Q1/12`, 24, 24, 2, [72, 202, 228]);
drawText(`$${state.cash}`, 24, 48, 2, [110, 231, 168]);
drawText(`18`, W - 100, 24, 2, [240, 113, 103]);

function crc32(data) {
  let c = 0xffffffff;
  for (let i = 0; i < data.length; i += 1) {
    c ^= data[i];
    for (let k = 0; k < 8; k += 1) c = (c >>> 1) ^ (0xedb88320 & -(c & 1));
  }
  return (c ^ 0xffffffff) >>> 0;
}

function pngChunk(type, data) {
  const t = Buffer.from(type);
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length);
  const body = Buffer.concat([t, data]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(body));
  return Buffer.concat([len, body, crc]);
}

const raw = Buffer.alloc((W * 4 + 1) * H);
for (let y = 0; y < H; y += 1) {
  raw[y * (W * 4 + 1)] = 0;
  buf.slice(y * W * 4, (y + 1) * W * 4).forEach((v, i) => {
    raw[y * (W * 4 + 1) + 1 + i] = v;
  });
}

const sig = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);
const ihdr = Buffer.alloc(13);
ihdr.writeUInt32BE(W, 0);
ihdr.writeUInt32BE(H, 4);
ihdr[8] = 8;
ihdr[9] = 6;
const idat = deflateSync(raw, { level: 9 });
const out = Buffer.concat([
  sig,
  pngChunk("IHDR", ihdr),
  pngChunk("IDAT", idat),
  pngChunk("IEND", Buffer.alloc(0)),
]);
writeFileSync("thumbnail.png", out);
console.log("thumbnail.png", out.length, "bytes");
