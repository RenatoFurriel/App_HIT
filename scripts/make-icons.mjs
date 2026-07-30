/**
 * Gera os ícones PNG do app sem depender de nenhuma biblioteca externa:
 * o desenho é feito pixel a pixel e codificado à mão em PNG, usando só o
 * `zlib` que já vem no Node. Rode com `npm run icons`.
 */
import { deflateSync } from 'node:zlib'
import { writeFileSync, mkdirSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const OUT_DIR = join(dirname(fileURLToPath(import.meta.url)), '..', 'public')

const BG = [0x14, 0x16, 0x1a]
const TEAL = [0x5d, 0xca, 0xa5]
const WHITE = [0xee, 0xf1, 0xf5]

const SAMPLES = 4

function distanceToSegment(px, py, ax, ay, bx, by) {
  const dx = bx - ax
  const dy = by - ay
  const lengthSq = dx * dx + dy * dy
  const t = lengthSq === 0 ? 0 : Math.max(0, Math.min(1, ((px - ax) * dx + (py - ay) * dy) / lengthSq))
  const cx = ax + t * dx
  const cy = ay + t * dy
  return Math.hypot(px - cx, py - cy)
}

/** Cor da arte em coordenadas normalizadas, ou null onde ela é transparente. */
function artAt(x, y) {
  const cx = 0.5
  const cy = 0.5

  const ring = Math.abs(Math.hypot(x - cx, y - cy) - 0.335)
  if (ring < 0.03) return TEAL

  const bar = 0.026
  if (distanceToSegment(x, y, 0.443, 0.335, 0.443, 0.665) < bar) return WHITE
  if (distanceToSegment(x, y, 0.557, 0.335, 0.557, 0.665) < bar) return WHITE
  if (distanceToSegment(x, y, 0.443, 0.5, 0.557, 0.5) < bar) return WHITE

  return null
}

function renderPixels(size, artScale) {
  const rgba = Buffer.alloc(size * size * 4)

  for (let py = 0; py < size; py++) {
    for (let px = 0; px < size; px++) {
      let r = 0
      let g = 0
      let b = 0

      for (let sy = 0; sy < SAMPLES; sy++) {
        for (let sx = 0; sx < SAMPLES; sx++) {
          const x = (px + (sx + 0.5) / SAMPLES) / size
          const y = (py + (sy + 0.5) / SAMPLES) / size
          // A arte é encolhida em torno do centro para respeitar a zona segura
          // dos ícones recortáveis do Android.
          const ax = 0.5 + (x - 0.5) / artScale
          const ay = 0.5 + (y - 0.5) / artScale
          const color = ax < 0 || ax > 1 || ay < 0 || ay > 1 ? BG : (artAt(ax, ay) ?? BG)
          r += color[0]
          g += color[1]
          b += color[2]
        }
      }

      const total = SAMPLES * SAMPLES
      const offset = (py * size + px) * 4
      rgba[offset] = Math.round(r / total)
      rgba[offset + 1] = Math.round(g / total)
      rgba[offset + 2] = Math.round(b / total)
      rgba[offset + 3] = 255
    }
  }

  return rgba
}

const CRC_TABLE = (() => {
  const table = new Int32Array(256)
  for (let n = 0; n < 256; n++) {
    let c = n
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1
    table[n] = c
  }
  return table
})()

function crc32(buffer) {
  let c = 0xffffffff
  for (const byte of buffer) c = CRC_TABLE[(c ^ byte) & 0xff] ^ (c >>> 8)
  return (c ^ 0xffffffff) >>> 0
}

function chunk(type, data) {
  const length = Buffer.alloc(4)
  length.writeUInt32BE(data.length)
  const typeAndData = Buffer.concat([Buffer.from(type, 'ascii'), data])
  const crc = Buffer.alloc(4)
  crc.writeUInt32BE(crc32(typeAndData))
  return Buffer.concat([length, typeAndData, crc])
}

function encodePng(size, rgba) {
  const ihdr = Buffer.alloc(13)
  ihdr.writeUInt32BE(size, 0)
  ihdr.writeUInt32BE(size, 4)
  ihdr[8] = 8 // bits por canal
  ihdr[9] = 6 // RGBA
  ihdr[10] = 0
  ihdr[11] = 0
  ihdr[12] = 0

  // Cada linha carrega um byte de filtro na frente; 0 significa "sem filtro".
  const raw = Buffer.alloc(size * (size * 4 + 1))
  for (let y = 0; y < size; y++) {
    const from = y * size * 4
    const to = y * (size * 4 + 1)
    raw[to] = 0
    rgba.copy(raw, to + 1, from, from + size * 4)
  }

  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk('IHDR', ihdr),
    chunk('IDAT', deflateSync(raw, { level: 9 })),
    chunk('IEND', Buffer.alloc(0)),
  ])
}

mkdirSync(OUT_DIR, { recursive: true })

const targets = [
  { name: 'icon-192.png', size: 192, scale: 1 },
  { name: 'icon-512.png', size: 512, scale: 1 },
  { name: 'icon-180.png', size: 180, scale: 1 },
  { name: 'icon-maskable-512.png', size: 512, scale: 0.62 },
]

for (const { name, size, scale } of targets) {
  writeFileSync(join(OUT_DIR, name), encodePng(size, renderPixels(size, scale)))
  console.log(`${name} — ${size}×${size}`)
}
