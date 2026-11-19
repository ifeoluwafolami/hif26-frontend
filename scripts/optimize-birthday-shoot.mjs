import { mkdir, readdir, rm } from "node:fs/promises"
import path from "node:path"
import sharp from "sharp"

const sourceDirectory = path.resolve("src/assets/birthday-shoot")
const displayDirectory = path.resolve("src/assets/birthday-shoot-display")
const thumbnailDirectory = path.resolve("src/assets/birthday-shoot-thumbnails")
const supportedExtensions = new Set([".jpeg", ".jpg", ".png", ".webp", ".avif"])

await Promise.all([
    rm(displayDirectory, { recursive: true, force: true }),
    rm(thumbnailDirectory, { recursive: true, force: true }),
])
await Promise.all([
    mkdir(displayDirectory, { recursive: true }),
    mkdir(thumbnailDirectory, { recursive: true }),
])

const sourceFiles = (await readdir(sourceDirectory))
    .filter((fileName) => supportedExtensions.has(path.extname(fileName).toLowerCase()))
    .sort()

await Promise.all(sourceFiles.map(async (fileName) => {
    const outputName = `${path.parse(fileName).name}.jpg`
    const sourcePath = path.join(sourceDirectory, fileName)

    await Promise.all([
        sharp(sourcePath)
            .rotate()
            .resize({
                width: 1600,
                height: 2000,
                fit: "inside",
                withoutEnlargement: true,
            })
            .jpeg({ quality: 84, mozjpeg: true })
            .toFile(path.join(displayDirectory, outputName)),
        sharp(sourcePath)
            .rotate()
            .resize({
                width: 720,
                height: 900,
                fit: "inside",
                withoutEnlargement: true,
            })
            .jpeg({ quality: 80, mozjpeg: true })
            .toFile(path.join(thumbnailDirectory, outputName)),
    ])
}))

console.log(`Optimized ${sourceFiles.length} birthday-shoot images`)
