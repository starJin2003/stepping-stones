/**
 * Draws the stone mark: three irregular stepping stones, the newest in stone red.
 * Writes public/favicon.svg (transparent) and PNG app icons on Mist. No dependencies:
 * the PNGs are rasterized here with 4x4 supersampling and encoded with node:zlib.
 *
 *   npm run icons
 */
import { mkdirSync, writeFileSync } from 'node:fs'
import { crc32, deflateSync } from 'node:zlib'

const MIST = [0xf3, 0xf6, 0xf4]
const LEAF = [0x18, 0x3d, 0x2b]
const STONE_RED = [0xb0, 0x18, 0x2f]

interface Stone {
  cx: number
  cy: number
  rx: number
  ry: number
  rotation: number
  wobble: [number, number, number]
  color: number[]
}

// In a 100 x 100 box, rising from bottom left to top right.
const STONES: Stone[] = [
  { cx: 26, cy: 71, rx: 17, ry: 11.5, rotation: -0.12, wobble: [0.4, 2.1, 4.0], color: LEAF },
  { cx: 51, cy: 51, rx: 15.5, ry: 10.5, rotation: 0.1, wobble: [1.7, 0.3, 2.8], color: LEAF },
  { cx: 75, cy: 30, rx: 14.5, ry: 10, rotation: -0.05, wobble: [2.9, 1.2, 0.6], color: STONE_RED },
]

/** Radius multiplier at angle t: a slightly lumpy ellipse, so no two stones look stamped. */
function edge(stone: Stone, t: number): number {
  const [a, b, c] = stone.wobble
  return 1 + 0.07 * Math.sin(2 * t + a) + 0.05 * Math.sin(3 * t + b) + 0.025 * Math.sin(5 * t + c)
}

/** Point (x, y) in box units; scale shrinks the mark about the center to leave a safe zone. */
function stoneAt(x: number, y: number, scale: number): Stone | null {
  for (const stone of STONES) {
    const dx = (x - 50) / scale + 50 - stone.cx
    const dy = (y - 50) / scale + 50 - stone.cy
    const cos = Math.cos(-stone.rotation)
    const sin = Math.sin(-stone.rotation)
    const lx = (dx * cos - dy * sin) / stone.rx
    const ly = (dx * sin + dy * cos) / stone.ry
    if (Math.hypot(lx, ly) <= edge(stone, Math.atan2(ly, lx))) return stone
  }
  return null
}

function svgPath(stone: Stone): string {
  const points: string[] = []
  for (let i = 0; i < 72; i++) {
    const t = (i / 72) * Math.PI * 2
    const r = edge(stone, t)
    const lx = Math.cos(t) * r * stone.rx
    const ly = Math.sin(t) * r * stone.ry
    const x = stone.cx + lx * Math.cos(stone.rotation) - ly * Math.sin(stone.rotation)
    const y = stone.cy + lx * Math.sin(stone.rotation) + ly * Math.cos(stone.rotation)
    points.push(`${x.toFixed(2)} ${y.toFixed(2)}`)
  }
  return `M${points.join('L')}Z`
}

const hex = (rgb: number[]) => '#' + rgb.map((v) => v.toString(16).padStart(2, '0')).join('')

function svg(): string {
  const paths = STONES.map((s) => `<path fill="${hex(s.color)}" d="${svgPath(s)}"/>`).join('')
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100">${paths}</svg>\n`
}

function png(size: number, scale: number): Buffer {
  const SAMPLES = 4
  const rows: Buffer[] = []
  for (let py = 0; py < size; py++) {
    const row = Buffer.alloc(1 + size * 3) // filter byte 0, then RGB
    for (let px = 0; px < size; px++) {
      const sum = [0, 0, 0]
      for (let sy = 0; sy < SAMPLES; sy++) {
        for (let sx = 0; sx < SAMPLES; sx++) {
          const x = ((px + (sx + 0.5) / SAMPLES) / size) * 100
          const y = ((py + (sy + 0.5) / SAMPLES) / size) * 100
          const color = stoneAt(x, y, scale)?.color ?? MIST
          for (let c = 0; c < 3; c++) sum[c] += color[c]
        }
      }
      for (let c = 0; c < 3; c++) row[1 + px * 3 + c] = Math.round(sum[c] / (SAMPLES * SAMPLES))
    }
    rows.push(row)
  }

  const chunk = (type: string, data: Buffer) => {
    const length = Buffer.alloc(4)
    length.writeUInt32BE(data.length)
    const body = Buffer.concat([Buffer.from(type, 'ascii'), data])
    const crc = Buffer.alloc(4)
    crc.writeUInt32BE(crc32(body))
    return Buffer.concat([length, body, crc])
  }
  const header = Buffer.alloc(13)
  header.writeUInt32BE(size, 0)
  header.writeUInt32BE(size, 4)
  header[8] = 8 // bit depth
  header[9] = 2 // RGB
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk('IHDR', header),
    chunk('IDAT', deflateSync(Buffer.concat(rows), { level: 9 })),
    chunk('IEND', Buffer.alloc(0)),
  ])
}

mkdirSync('public/icons', { recursive: true })
writeFileSync('public/favicon.svg', svg())
// 0.72 keeps every stone inside the maskable safe zone (a circle of radius 40% of the icon).
for (const size of [192, 512]) writeFileSync(`public/icons/icon-${size}.png`, png(size, 0.72))
console.log('Wrote public/favicon.svg and public/icons/icon-192.png, icon-512.png')
