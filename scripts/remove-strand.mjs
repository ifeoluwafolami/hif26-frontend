// Paints out a loose dark strand (e.g. a braid that isn't attached to the head)
// lying over light fabric, inside a box. Only dark marks wider than the
// illustration's ink lines are removed, so outlines and seams survive:
// a mark that a wide grey "closing" fills in but a narrow one does not is a
// strand. It is filled from the fabric around it (row and column).
//
// Usage: node scripts/remove-strand.mjs <in.png> <out.png> x0,y0,x1,y1
//   box as fractions of the image (0–1, top-left origin)
import sharp from "sharp"

const [input, output, boxArg] = process.argv.slice(2)
if (!input || !output || !boxArg) {
    console.error("usage: node scripts/remove-strand.mjs <in.png> <out.png> x0,y0,x1,y1")
    process.exit(1)
}
const { data, info } = await sharp(input).ensureAlpha().raw().toBuffer({ resolveWithObject: true })
const W = info.width, H = info.height
const [fx0, fy0, fx1, fy1] = boxArg.split(",").map(Number)
const bx0 = Math.floor(fx0 * W), bx1 = Math.ceil(fx1 * W)
const by0 = Math.floor(fy0 * H), by1 = Math.ceil(fy1 * H)
const lum = (i) => 0.299 * data[i * 4] + 0.587 * data[i * 4 + 1] + 0.114 * data[i * 4 + 2]

// Grey closing (max then min of luminance) that carries the colour of the
// chosen pixel, over a square window, restricted to opaque pixels.
function close(radius) {
    const pad = radius * 2
    const x0 = Math.max(0, bx0 - pad), x1 = Math.min(W, bx1 + pad)
    const y0 = Math.max(0, by0 - pad), y1 = Math.min(H, by1 + pad)
    const pass = (src, pick, horizontal) => {
        const out = Int32Array.from(src)
        for (let y = y0; y < y1; y++) for (let x = x0; x < x1; x++) {
            let best = src[y * W + x]
            for (let t = -radius; t <= radius; t++) {
                const xx = horizontal ? x + t : x, yy = horizontal ? y : y + t
                if (xx < 0 || yy < 0 || xx >= W || yy >= H) continue
                const j = src[yy * W + xx]
                if (data[j * 4 + 3] < 128) continue
                if (pick === "max" ? lum(j) > lum(best) : lum(j) < lum(best)) best = j
            }
            out[y * W + x] = best
        }
        return out
    }
    let idx = Int32Array.from({ length: W * H }, (_, i) => i)
    idx = pass(pass(idx, "max", true), "max", false)
    idx = pass(pass(idx, "min", true), "min", false)
    return idx
}

const scale = Math.max(1, W / 736)
const wide = close(Math.round(9 * scale))
const narrow = close(Math.round(3 * scale))
// Strand mask, grown a little so the braid's soft edges go too.
const strandMask = new Uint8Array(W * H)
for (let y = by0; y < by1; y++) for (let x = bx0; x < bx1; x++) {
    const i = y * W + x
    if (data[i * 4 + 3] < 128) continue
    const strand = (lum(wide[i]) - lum(i)) - (lum(narrow[i]) - lum(i))
    if (lum(wide[i]) >= 150 && strand >= 14) strandMask[i] = 1
}
const grow = Math.round(2 * scale)
const grown = new Uint8Array(W * H)
for (let y = by0; y < by1; y++) for (let x = bx0; x < bx1; x++) {
    if (!strandMask[y * W + x]) continue
    for (let dy = -grow; dy <= grow; dy++) for (let dx = -grow; dx <= grow; dx++) {
        const xx = x + dx, yy = y + dy
        if (xx >= bx0 && xx < bx1 && yy >= by0 && yy < by1) grown[yy * W + xx] = 1
    }
}

// Fill each masked pixel from the nearest clean fabric along its row and its
// column, weighting the shorter gap more; this follows the dress's folds and
// shading whichever way the strand runs.
const out = Buffer.from(data)
const clean = (x, y) => x >= 0 && y >= 0 && x < W && y < H && !grown[y * W + x] && data[(y * W + x) * 4 + 3] > 128
let changed = 0
for (let y = by0; y < by1; y++) for (let x = bx0; x < bx1; x++) {
    if (!grown[y * W + x]) continue
    const fills = []
    for (const [dx, dy] of [[1, 0], [0, 1]]) {
        let a = 1, b = 1
        while (a < 200 && !clean(x - dx * a, y - dy * a)) a++
        while (b < 200 && !clean(x + dx * b, y + dy * b)) b++
        const okA = clean(x - dx * a, y - dy * a), okB = clean(x + dx * b, y + dy * b)
        if (!okA && !okB) continue
        const ia = ((y - dy * a) * W + (x - dx * a)) * 4, ib = ((y + dy * b) * W + (x + dx * b)) * 4
        const t = a / (a + b)
        const colour = [0, 1, 2].map((c) =>
            okA && okB ? data[ia + c] * (1 - t) + data[ib + c] * t : okA ? data[ia + c] : data[ib + c])
        fills.push([colour, 1 / (a + b)])
    }
    if (!fills.length) continue
    const total = fills.reduce((sum, [, w]) => sum + w, 0)
    const i = (y * W + x) * 4
    for (let c = 0; c < 3; c++) out[i + c] = Math.round(fills.reduce((sum, [col, w]) => sum + col[c] * w, 0) / total)
    changed++
}
// Soften the filled area so it reads as smooth fabric, not streaks.
const blurRadius = Math.round(4 * scale)
const soft = Buffer.from(out)
for (let y = by0; y < by1; y++) for (let x = bx0; x < bx1; x++) {
    const i = y * W + x
    if (!grown[i]) continue
    const sum = [0, 0, 0]
    let n = 0
    for (let dy = -blurRadius; dy <= blurRadius; dy++) for (let dx = -blurRadius; dx <= blurRadius; dx++) {
        const xx = x + dx, yy = y + dy
        if (xx < 0 || yy < 0 || xx >= W || yy >= H || data[(yy * W + xx) * 4 + 3] < 128) continue
        const j = (yy * W + xx) * 4
        for (let c = 0; c < 3; c++) sum[c] += out[j + c]
        n++
    }
    for (let c = 0; c < 3; c++) soft[i * 4 + c] = Math.round(sum[c] / n)
}
await sharp(soft, { raw: { width: W, height: H, channels: 4 } }).png().toFile(output)
console.log(`wrote ${output} (${changed} px repainted)`)
