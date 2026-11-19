// Brings the real face from a photo into an illustration made from it, so the
// illustrated character looks more like her while keeping the painted style.
//
// 1. Finds the 76 facial landmarks in both images (scripts/landmarks.swift).
// 2. Aligns the photo face onto the illustration face (least-squares
//    similarity transform: scale, rotation, shift).
// 3. Colour-matches the photo face to the illustration's skin tone and
//    lighting, smooths photo noise, and blends it in with a feathered mask that
//    covers brows → chin, leaving hair, ears and outline painted.
//
// Usage: node scripts/face-likeness.mjs <illustration.png> <photo.png> <output.png> [strength 0–1]
import { execFileSync } from "node:child_process"
import path from "node:path"
import { fileURLToPath } from "node:url"
import sharp from "sharp"

const [illustrationPath, photoPath, outputPath, strengthArg] = process.argv.slice(2)
if (!illustrationPath || !photoPath || !outputPath) {
    console.error("usage: node scripts/face-likeness.mjs <illustration.png> <photo.png> <output.png> [strength]")
    process.exit(1)
}
const STRENGTH = strengthArg ? Number(strengthArg) : 0.7
const scriptsDir = path.dirname(fileURLToPath(import.meta.url))

const landmarks = (image) => {
    // LANDMARKS_BIN can point at a compiled copy of landmarks.swift (faster).
    const [command, args] = process.env.LANDMARKS_BIN
        ? [process.env.LANDMARKS_BIN, [image]]
        : ["swift", [path.join(scriptsDir, "landmarks.swift"), image]]
    const json = JSON.parse(execFileSync(command, args, { encoding: "utf8", stdio: ["ignore", "pipe", "ignore"] }))
    if (!json.points) throw new Error(`no face found in ${image}`)
    return json.points
}

const load = async (file) => {
    const { data, info } = await sharp(file).ensureAlpha().raw().toBuffer({ resolveWithObject: true })
    return { data, W: info.width, H: info.height }
}

const ill = await load(illustrationPath)
const photo = await load(photoPath)
const target = landmarks(illustrationPath)
const sourcePts = landmarks(photoPath)

// Least-squares similarity transform mapping illustration → photo points
// (the inverse direction, so each output pixel knows where to sample).
function similarity(from, to) {
    const n = from.length
    const mean = (pts) => pts.reduce(([sx, sy], [x, y]) => [sx + x / n, sy + y / n], [0, 0])
    const [fx, fy] = mean(from)
    const [tx, ty] = mean(to)
    let a = 0, b = 0, norm = 0
    for (let i = 0; i < n; i++) {
        const px = from[i][0] - fx, py = from[i][1] - fy
        const qx = to[i][0] - tx, qy = to[i][1] - ty
        a += px * qx + py * qy
        b += px * qy - py * qx
        norm += px * px + py * py
    }
    const c = a / norm, s = b / norm
    return (x, y) => [c * (x - fx) - s * (y - fy) + tx, s * (x - fx) + c * (y - fy) + ty]
}
const toPhoto = similarity(target, sourcePts)

// Feathered face mask from the illustration's landmarks (brows → chin).
const xs = target.map(([x]) => x), ys = target.map(([, y]) => y)
const minX = Math.min(...xs), maxX = Math.max(...xs), minY = Math.min(...ys), maxY = Math.max(...ys)
const cx = (minX + maxX) / 2, cy = (minY + maxY) / 2 + (maxY - minY) * 0.03
const rx = (maxX - minX) * 0.5 * 0.94, ry = (maxY - minY) * 0.5 * 1.0
const x0 = Math.max(0, Math.floor(cx - rx * 1.2)), x1 = Math.min(ill.W, Math.ceil(cx + rx * 1.2))
const y0 = Math.max(0, Math.floor(cy - ry * 1.2)), y1 = Math.min(ill.H, Math.ceil(cy + ry * 1.2))
const BW = x1 - x0, BH = y1 - y0

const sample = (x, y) => {
    const X = Math.floor(x), Y = Math.floor(y)
    if (X < 0 || Y < 0 || X + 1 >= photo.W || Y + 1 >= photo.H) return null
    const fx = x - X, fy = y - Y
    const out = [0, 0, 0, 0]
    for (const [dx, dy, w] of [[0, 0, (1 - fx) * (1 - fy)], [1, 0, fx * (1 - fy)], [0, 1, (1 - fx) * fy], [1, 1, fx * fy]]) {
        const i = ((Y + dy) * photo.W + X + dx) * 4
        for (let c = 0; c < 4; c++) out[c] += photo.data[i + c] * w
    }
    return out
}

// Warp the photo face into the illustration box.
const warped = new Float32Array(BW * BH * 3)
const mask = new Float32Array(BW * BH)
for (let y = 0; y < BH; y++) for (let x = 0; x < BW; x++) {
    const X = x + x0, Y = y + y0
    const e = Math.hypot((X - cx) / rx, (Y - cy) / ry)
    let m = Math.min(1, Math.max(0, (1 - e) / 0.28))
    m = m * m * (3 - 2 * m)
    const illAlpha = ill.data[(Y * ill.W + X) * 4 + 3] / 255
    const [sx, sy] = toPhoto(X, Y)
    const p = sample(sx, sy)
    const k = y * BW + x
    if (!p || p[3] < 200 || illAlpha < 0.9) { mask[k] = 0; continue }
    warped[k * 3] = p[0] / 255; warped[k * 3 + 1] = p[1] / 255; warped[k * 3 + 2] = p[2] / 255
    mask[k] = m
}

// Light edge-preserving smoothing to drop photo grain.
const smooth = Float32Array.from(warped)
const R = 2, sigS = 1.6, sigR = 0.07
for (let y = 0; y < BH; y++) for (let x = 0; x < BW; x++) {
    const k = y * BW + x
    if (mask[k] === 0) continue
    let s0 = 0, s1 = 0, s2 = 0, sw = 0
    for (let dy = -R; dy <= R; dy++) for (let dx = -R; dx <= R; dx++) {
        const xx = x + dx, yy = y + dy
        if (xx < 0 || yy < 0 || xx >= BW || yy >= BH) continue
        const j = yy * BW + xx
        if (mask[j] === 0) continue
        const d = (warped[j * 3] - warped[k * 3]) ** 2 + (warped[j * 3 + 1] - warped[k * 3 + 1]) ** 2 + (warped[j * 3 + 2] - warped[k * 3 + 2]) ** 2
        const w = Math.exp(-(dx * dx + dy * dy) / (2 * sigS * sigS) - d / (2 * sigR * sigR))
        s0 += warped[j * 3] * w; s1 += warped[j * 3 + 1] * w; s2 += warped[j * 3 + 2] * w; sw += w
    }
    smooth[k * 3] = s0 / sw; smooth[k * 3 + 1] = s1 / sw; smooth[k * 3 + 2] = s2 / sw
}

// Match the photo's colour statistics to the illustration's face.
const stats = (get) => {
    let sw = 0
    const mean = [0, 0, 0], sq = [0, 0, 0]
    for (let k = 0; k < BW * BH; k++) {
        const w = mask[k] > 0.5 ? 1 : 0
        if (!w) continue
        const v = get(k)
        for (let c = 0; c < 3; c++) { mean[c] += v[c]; sq[c] += v[c] * v[c] }
        sw++
    }
    return mean.map((m, c) => {
        const mu = m / sw
        return [mu, Math.sqrt(Math.max(1e-6, sq[c] / sw - mu * mu))]
    })
}
const illPixel = (k) => {
    const X = (k % BW) + x0, Y = Math.floor(k / BW) + y0
    const i = (Y * ill.W + X) * 4
    return [ill.data[i] / 255, ill.data[i + 1] / 255, ill.data[i + 2] / 255]
}
const photoStats = stats((k) => [smooth[k * 3], smooth[k * 3 + 1], smooth[k * 3 + 2]])
const illStats = stats(illPixel)

const out = Buffer.from(ill.data)
for (let k = 0; k < BW * BH; k++) {
    const m = mask[k] * STRENGTH
    if (m <= 0) continue
    const X = (k % BW) + x0, Y = Math.floor(k / BW) + y0
    const i = (Y * ill.W + X) * 4
    for (let c = 0; c < 3; c++) {
        const [pm, ps] = photoStats[c]
        const [im, is] = illStats[c]
        // Keep a little of the photo's own contrast so features stay defined.
        const matched = (smooth[k * 3 + c] - pm) * (is / ps * 0.75 + 0.25) + im
        const v = ill.data[i + c] / 255 * (1 - m) + Math.min(1, Math.max(0, matched)) * m
        out[i + c] = Math.round(v * 255)
    }
}

await sharp(out, { raw: { width: ill.W, height: ill.H, channels: 4 } }).png().toFile(outputPath)
console.log(`wrote ${outputPath}`)
