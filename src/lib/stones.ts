// Irregular stepping stones, drawn the same way as the app icon (scripts/make-icons.ts): a slightly lumpy
// ellipse. Every number comes from the record id, so a visitor's stone looks the same on every render.

/** 32-bit FNV-1a of a string. */
function hash(text: string): number {
  let h = 0x811c9dc5
  for (let i = 0; i < text.length; i++) {
    h ^= text.charCodeAt(i)
    h = Math.imul(h, 0x01000193) >>> 0
  }
  return h
}

/** mulberry32: a tiny seeded generator, so one id always gives the same sequence. */
function seeded(seed: number): () => number {
  let a = seed
  return () => {
    a = (a + 0x6d2b79f5) >>> 0
    let t = a
    t = Math.imul(t ^ (t >>> 15), t | 1)
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

export interface StoneShape {
  /** Half width and half height, as fractions of the stone's nominal width. */
  rx: number
  ry: number
  rotation: number
  wobble: [number, number, number]
  /** -1 to 1: how far the stone sits off the stream line, so the path does not look ruled. */
  shift: number
}

export function stoneShape(id: string): StoneShape {
  const next = seeded(hash(id))
  const rx = 0.44 + next() * 0.06
  return {
    rx,
    ry: rx * (0.6 + next() * 0.12),
    rotation: (next() - 0.5) * 0.4,
    wobble: [next() * 2 * Math.PI, next() * 2 * Math.PI, next() * 2 * Math.PI],
    shift: next() * 2 - 1,
  }
}

const POINTS = 48

/** SVG path data for the stone of record `id`, centred on (cx, cy), about `width` across. */
export function stonePath(id: string, cx: number, cy: number, width: number): string {
  const { rx, ry, rotation, wobble } = stoneShape(id)
  const [a, b, c] = wobble
  const cos = Math.cos(rotation)
  const sin = Math.sin(rotation)
  const points: string[] = []
  for (let i = 0; i < POINTS; i++) {
    const t = (i / POINTS) * 2 * Math.PI
    const edge = 1 + 0.07 * Math.sin(2 * t + a) + 0.05 * Math.sin(3 * t + b) + 0.025 * Math.sin(5 * t + c)
    const lx = Math.cos(t) * edge * rx * width
    const ly = Math.sin(t) * edge * ry * width
    points.push(`${(cx + lx * cos - ly * sin).toFixed(1)} ${(cy + lx * sin + ly * cos).toFixed(1)}`)
  }
  return `M${points.join('L')}Z`
}
