// Brings an illustration's body proportions closer to the reference photo:
// shortens the body below the chin (illustrations tend to draw long, slim,
// model-like bodies) and can widen it a little. The head is left untouched;
// the change eases in over the neck so there's no visible seam.
//
// Usage: node scripts/match-proportions.mjs <in.png> <out.png> <squash> [widen]
//   squash – body height multiplier (e.g. 0.85 = 15% shorter body)
//   widen  – body width multiplier (default 1)
//
// Measure the right values by comparing body length ÷ face width in the
// illustration and the photo (faces found with scripts/landmarks.swift).
import { execFileSync } from "node:child_process"
import path from "node:path"
import { fileURLToPath } from "node:url"
import sharp from "sharp"

const [input, output, squashArg, widenArg] = process.argv.slice(2)
if (!input || !output || !squashArg) {
    console.error("usage: node scripts/match-proportions.mjs <in.png> <out.png> <squash> [widen]")
    process.exit(1)
}
const SQUASH = Number(squashArg)
const WIDEN = widenArg ? Number(widenArg) : 1
const scriptsDir = path.dirname(fileURLToPath(import.meta.url))

const [command, args] = process.env.LANDMARKS_BIN
    ? [process.env.LANDMARKS_BIN, [input]]
    : ["swift", [path.join(scriptsDir, "landmarks.swift"), input]]
const { points } = JSON.parse(execFileSync(command, args, { encoding: "utf8", stdio: ["ignore", "pipe", "ignore"] }))
const xs = points.map(([x]) => x), ys = points.map(([, y]) => y)
const faceWidth = Math.max(...xs) - Math.min(...xs)
const neck = Math.max(...ys) + faceWidth * 0.12 // just below the chin
const ease = faceWidth * 0.6 // distance over which the change fades in

const { data, info } = await sharp(input).ensureAlpha().raw().toBuffer({ resolveWithObject: true })
const W = info.width, H = info.height

// Vertical: output row → source row. Scale is 1 above the neck, easing to
// SQUASH over `ease` pixels, so the body compresses smoothly.
const scaleAt = (y) => {
    if (y <= neck) return 1
    const t = Math.min(1, (y - neck) / ease)
    const s = t * t * (3 - 2 * t)
    return 1 + (SQUASH - 1) * s
}
const sourceRows = [] // sourceRows[outputY] = source y (float)
let outY = 0
for (let y = 0; y < H; y += 0.25) {
    // integrate output position: d(out) = scale * d(src)
    const next = outY + 0.25 * scaleAt(y)
    while (sourceRows.length < Math.floor(next)) sourceRows.push(y)
    outY = next
}
const OH = sourceRows.length

// Horizontal: widen around each row's body centre, eased in like the squash.
const centre = new Float32Array(H)
for (let y = 0; y < H; y++) {
    let sum = 0, n = 0
    for (let x = 0; x < W; x++) if (data[(y * W + x) * 4 + 3] > 128) { sum += x; n++ }
    centre[y] = n ? sum / n : W / 2
}
// Smooth centres so the body doesn't shear.
const smoothCentre = new Float32Array(H)
const span = Math.round(faceWidth * 0.5)
for (let y = 0; y < H; y++) {
    let sum = 0, n = 0
    for (let t = -span; t <= span; t++) { const yy = y + t; if (yy >= 0 && yy < H) { sum += centre[yy]; n++ } }
    smoothCentre[y] = sum / n
}
const widenAt = (y) => {
    if (y <= neck) return 1
    const t = Math.min(1, (y - neck) / ease)
    return 1 + (WIDEN - 1) * t * t * (3 - 2 * t)
}
const pad = Math.ceil((W * (WIDEN - 1)) / 2) + 2
const OW = W + pad * 2

const out = Buffer.alloc(OW * OH * 4)
for (let oy = 0; oy < OH; oy++) {
    const sy = sourceRows[oy]
    const y0 = Math.floor(sy), y1 = Math.min(H - 1, y0 + 1), fy = sy - y0
    const yRow = Math.min(H - 1, Math.round(sy))
    const w = widenAt(sy)
    const cx = smoothCentre[yRow] + pad
    for (let ox = 0; ox < OW; ox++) {
        const sx = (ox - cx) / w + cx - pad
        const x0 = Math.floor(sx), fx = sx - x0
        const acc = [0, 0, 0, 0]
        for (const [dx, dy, wt] of [[0, 0, (1 - fx) * (1 - fy)], [1, 0, fx * (1 - fy)], [0, 1, (1 - fx) * fy], [1, 1, fx * fy]]) {
            const xx = x0 + dx, yy = dy ? y1 : y0
            if (xx < 0 || xx >= W) continue
            const i = (yy * W + xx) * 4
            const a = data[i + 3] * wt
            acc[0] += data[i] * a; acc[1] += data[i + 1] * a; acc[2] += data[i + 2] * a; acc[3] += a
        }
        const o = (oy * OW + ox) * 4
        if (acc[3] > 0) {
            out[o] = Math.round(acc[0] / acc[3])
            out[o + 1] = Math.round(acc[1] / acc[3])
            out[o + 2] = Math.round(acc[2] / acc[3])
        }
        out[o + 3] = Math.round(acc[3])
    }
}

await sharp(out, { raw: { width: OW, height: OH, channels: 4 } })
    .trim({ threshold: 1 })
    .png()
    .toFile(output)
console.log(`wrote ${output} (${W}×${H} → body ×${SQUASH} tall, ×${WIDEN} wide)`)
