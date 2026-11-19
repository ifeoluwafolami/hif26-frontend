// Renders a face-morph timelapse: photos in chronological order, each face
// lined up to the same spot, morphing smoothly into the next one.
//
// For every photo: facial landmarks (scripts/landmarks.swift) → similarity
// alignment onto a common template; anything beyond the photo's edge is
// filled with a soft, pink-tinted blur of the same photo. Between photos the
// landmarks are interpolated and both images are warped to the in-between
// shape (piecewise-affine over a Delaunay triangulation), then cross-faded —
// a classic face morph.
//
// Usage:
//   node scripts/morph-timelapse.mjs <out.mp4> <photo> [photo ...]
//     [--size 480x640] [--hold 0.3] [--morph 0.55] [--fps 30] [--poster out.jpg]
//
// Set LANDMARKS_BIN to a compiled landmarks.swift to skip recompiling it per
// photo. Uses ffmpeg-static to encode.
import { execFileSync, spawn } from "node:child_process"
import path from "node:path"
import { fileURLToPath } from "node:url"
import ffmpegPath from "ffmpeg-static"
import sharp from "sharp"

const args = process.argv.slice(2)
const option = (name, fallback) => {
    const index = args.indexOf(name)
    if (index === -1) return fallback
    const [value] = args.splice(index, 2).slice(1)
    return value
}
const [FW, FH] = option("--size", "480x640").split("x").map(Number)
const HOLD = Number(option("--hold", "0.3"))
const MORPH = Number(option("--morph", "0.55"))
const FPS = Number(option("--fps", "30"))
const POSTER = option("--poster", null)
const [output, ...photos] = args
if (!output || photos.length < 2) {
    console.error("usage: node scripts/morph-timelapse.mjs <out.mp4> <photo> <photo> [...]")
    process.exit(1)
}
const scriptsDir = path.dirname(fileURLToPath(import.meta.url))
const landmarks = (file) => {
    // LANDMARKS_BIN can point at a compiled landmarks.swift (much faster).
    const [command, commandArgs] = process.env.LANDMARKS_BIN
        ? [process.env.LANDMARKS_BIN, [file]]
        : ["swift", [path.join(scriptsDir, "landmarks.swift"), file]]
    return JSON.parse(execFileSync(command, commandArgs, { encoding: "utf8", stdio: ["ignore", "pipe", "ignore"] })).points
}

// ---------- geometry helpers
function similarity(from, to) {
    const n = from.length
    const mean = (pts) => pts.reduce(([sx, sy], [x, y]) => [sx + x / n, sy + y / n], [0, 0])
    const [fx, fy] = mean(from), [tx, ty] = mean(to)
    let a = 0, b = 0, norm = 0
    for (let i = 0; i < n; i++) {
        const px = from[i][0] - fx, py = from[i][1] - fy, qx = to[i][0] - tx, qy = to[i][1] - ty
        a += px * qx + py * qy; b += px * qy - py * qx; norm += px * px + py * py
    }
    const c = a / norm, s = b / norm
    return { c, s, fx, fy, tx, ty, apply: (x, y) => [c * (x - fx) - s * (y - fy) + tx, s * (x - fx) + c * (y - fy) + ty] }
}

// Bowyer–Watson Delaunay triangulation → list of [i, j, k] index triples.
function delaunay(points) {
    const big = 1e5
    const pts = [...points, [-big, -big], [big * 2, -big], [-big, big * 2]]
    const n = points.length
    let tris = [[n, n + 1, n + 2]]
    const circum = ([a, b, c]) => {
        const [ax, ay] = pts[a], [bx, by] = pts[b], [cx, cy] = pts[c]
        const d = 2 * (ax * (by - cy) + bx * (cy - ay) + cx * (ay - by))
        const ux = ((ax * ax + ay * ay) * (by - cy) + (bx * bx + by * by) * (cy - ay) + (cx * cx + cy * cy) * (ay - by)) / d
        const uy = ((ax * ax + ay * ay) * (cx - bx) + (bx * bx + by * by) * (ax - cx) + (cx * cx + cy * cy) * (bx - ax)) / d
        return [ux, uy, (ax - ux) ** 2 + (ay - uy) ** 2]
    }
    for (let p = 0; p < n; p++) {
        const [x, y] = pts[p]
        const bad = [], keep = []
        for (const t of tris) {
            const [ux, uy, r2] = circum(t)
            ;((x - ux) ** 2 + (y - uy) ** 2 < r2 ? bad : keep).push(t)
        }
        const edges = new Map()
        for (const [a, b, c] of bad) for (const [u, v] of [[a, b], [b, c], [c, a]]) {
            const key = u < v ? `${u},${v}` : `${v},${u}`
            edges.set(key, edges.has(key) ? null : [u, v])
        }
        tris = keep
        for (const edge of edges.values()) if (edge) tris.push([edge[0], edge[1], p])
    }
    return tris.filter((t) => t.every((i) => i < n))
}

// ---------- template: where the face sits in every frame
// Face width ≈ 42% of frame width, centred, a little above the middle.
const FACE_W = FW * 0.42
let template = null

// ---------- prepare each photo: align, fill the frame, soft edges
// Anything outside the photo is filled with a blurred, pink-tinted copy of the
// same photo so every frame is full-bleed.
const TINT = [252, 231, 243]
async function prepare(photo) {
    const points = landmarks(photo)
    const xs = points.map(([x]) => x), ys = points.map(([, y]) => y)
    const cx = (Math.min(...xs) + Math.max(...xs)) / 2, cy = (Math.min(...ys) + Math.max(...ys)) / 2
    const { data, info } = await sharp(photo).rotate().removeAlpha().raw().toBuffer({ resolveWithObject: true })
    const backdrop = await sharp(photo).rotate().removeAlpha()
        .resize(FW, FH, { fit: "cover" }).blur(18).raw().toBuffer()

    if (!template) {
        // Normalise the first face into the template position.
        const w = Math.max(...xs) - Math.min(...xs)
        const k = FACE_W / w
        template = points.map(([x, y]) => [(x - cx) * k + FW / 2, (y - cy) * k + FH * 0.42])
    }
    const forward = similarity(points, template)
    const inverse = similarity(template, points)
    const aligned = points.map(([x, y]) => forward.apply(x, y))
    const edge = 14 / Math.hypot(inverse.c, inverse.s) // feather width in photo px

    const rgba = new Float32Array(FW * FH * 4)
    for (let y = 0; y < FH; y++) for (let x = 0; x < FW; x++) {
        const [sx, sy] = inverse.apply(x, y)
        const o = (y * FW + x) * 4, bo = (y * FW + x) * 3
        const bg = [0, 1, 2].map((c) => backdrop[bo + c] * 0.7 + TINT[c] * 0.3)
        const X = Math.floor(sx), Y = Math.floor(sy)
        let px = bg, a = 0
        if (X >= 0 && Y >= 0 && X + 1 < info.width && Y + 1 < info.height) {
            const fx = sx - X, fy = sy - Y
            px = [0, 1, 2].map((c) => {
                const p = (yy, xx) => data[(yy * info.width + xx) * 3 + c]
                return p(Y, X) * (1 - fx) * (1 - fy) + p(Y, X + 1) * fx * (1 - fy) + p(Y + 1, X) * (1 - fx) * fy + p(Y + 1, X + 1) * fx * fy
            })
            const inside = Math.min(sx, sy, info.width - 1 - sx, info.height - 1 - sy)
            a = Math.min(1, inside / edge)
        }
        for (let c = 0; c < 3; c++) rgba[o + c] = px[c] * a + bg[c] * (1 - a)
        rgba[o + 3] = 255
    }
    // Control points: landmarks + frame border so the whole frame warps.
    const border = []
    for (let i = 0; i <= 4; i++) {
        border.push([(FW - 1) * i / 4, 0], [(FW - 1) * i / 4, FH - 1])
        if (i > 0 && i < 4) border.push([0, (FH - 1) * i / 4], [FW - 1, (FH - 1) * i / 4])
    }
    return { image: rgba, points: [...aligned, ...border] }
}

// Warp `src` (with control points `from`) onto control points `to`.
function warp(src, from, to, tris) {
    const out = new Float32Array(FW * FH * 3)
    for (const [a, b, c] of tris) {
        const [x0, y0] = to[a], [x1, y1] = to[b], [x2, y2] = to[c]
        const det = (y1 - y2) * (x0 - x2) + (x2 - x1) * (y0 - y2)
        if (Math.abs(det) < 1e-6) continue
        const minX = Math.max(0, Math.floor(Math.min(x0, x1, x2))), maxX = Math.min(FW - 1, Math.ceil(Math.max(x0, x1, x2)))
        const minY = Math.max(0, Math.floor(Math.min(y0, y1, y2))), maxY = Math.min(FH - 1, Math.ceil(Math.max(y0, y1, y2)))
        const [u0, v0] = from[a], [u1, v1] = from[b], [u2, v2] = from[c]
        for (let y = minY; y <= maxY; y++) for (let x = minX; x <= maxX; x++) {
            const l0 = ((y1 - y2) * (x - x2) + (x2 - x1) * (y - y2)) / det
            const l1 = ((y2 - y0) * (x - x2) + (x0 - x2) * (y - y2)) / det
            const l2 = 1 - l0 - l1
            if (l0 < -1e-4 || l1 < -1e-4 || l2 < -1e-4) continue
            const sx = Math.min(FW - 1.001, Math.max(0, l0 * u0 + l1 * u1 + l2 * u2))
            const sy = Math.min(FH - 1.001, Math.max(0, l0 * v0 + l1 * v1 + l2 * v2))
            const X = Math.floor(sx), Y = Math.floor(sy), fx = sx - X, fy = sy - Y
            const o = (y * FW + x) * 3
            for (let ch = 0; ch < 3; ch++) {
                const p = (yy, xx) => src[(yy * FW + xx) * 4 + ch]
                out[o + ch] = p(Y, X) * (1 - fx) * (1 - fy) + p(Y, X + 1) * fx * (1 - fy) + p(Y + 1, X) * (1 - fx) * fy + p(Y + 1, X + 1) * fx * fy
            }
        }
    }
    return out
}

// ---------- render frames, piping raw RGB into ffmpeg
const frames = []
const prepared = []
for (let i = 0; i < photos.length; i++) {
    prepared.push(await prepare(photos[i]))
    process.stdout.write(`prepared ${i + 1}/${photos.length}\r`)
}
console.log()

const encoder = spawn(ffmpegPath, [
    "-y", "-f", "rawvideo", "-pix_fmt", "rgb24", "-s", `${FW}x${FH}`, "-r", String(FPS), "-i", "-",
    "-c:v", "libx264", "-preset", "slow", "-crf", "24", "-pix_fmt", "yuv420p", "-movflags", "+faststart",
    "-an", output,
], { stdio: ["pipe", "ignore", "inherit"] })
const write = (rgb) => new Promise((resolve) => {
    const buffer = Buffer.alloc(FW * FH * 3)
    for (let i = 0; i < buffer.length; i++) buffer[i] = Math.max(0, Math.min(255, Math.round(rgb[i])))
    if (frames.length === 0 && POSTER) frames.push(buffer)
    encoder.stdin.write(buffer) ? resolve() : encoder.stdin.once("drain", resolve)
})
const toRgb = (rgba) => {
    const rgb = new Float32Array(FW * FH * 3)
    for (let i = 0; i < FW * FH; i++) for (let c = 0; c < 3; c++) rgb[i * 3 + c] = rgba[i * 4 + c]
    return rgb
}

const holdFrames = Math.round(HOLD * FPS), morphFrames = Math.round(MORPH * FPS)
for (let i = 0; i < prepared.length; i++) {
    const still = toRgb(prepared[i].image)
    for (let f = 0; f < holdFrames; f++) await write(still)
    if (i === prepared.length - 1) break
    const A = prepared[i], B = prepared[i + 1]
    const mid = A.points.map(([x, y], k) => [(x + B.points[k][0]) / 2, (y + B.points[k][1]) / 2])
    const tris = delaunay(mid)
    for (let f = 1; f <= morphFrames; f++) {
        const lin = f / (morphFrames + 1)
        const t = lin * lin * (3 - 2 * lin)
        const shape = A.points.map(([x, y], k) => [x + (B.points[k][0] - x) * t, y + (B.points[k][1] - y) * t])
        const wa = warp(A.image, A.points, shape, tris)
        const wb = warp(B.image, B.points, shape, tris)
        const blend = new Float32Array(FW * FH * 3)
        for (let k = 0; k < blend.length; k++) blend[k] = wa[k] * (1 - t) + wb[k] * t
        await write(blend)
    }
    process.stdout.write(`morphed ${i + 1}/${prepared.length - 1}\r`)
}
// Linger on the final (current) photo.
const last = toRgb(prepared.at(-1).image)
for (let f = 0; f < holdFrames * 2; f++) await write(last)
encoder.stdin.end()
await new Promise((resolve) => encoder.on("close", resolve))
if (POSTER && frames[0]) {
    await sharp(frames[0], { raw: { width: FW, height: FH, channels: 3 } }).jpeg({ quality: 82 }).toFile(POSTER)
}
console.log(`\nwrote ${output}`)
