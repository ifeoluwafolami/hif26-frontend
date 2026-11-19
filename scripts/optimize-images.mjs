import { mkdir, readdir } from "node:fs/promises"
import path from "node:path"
import sharp from "sharp"

const sourceDirectory = path.resolve("src/assets/images")
const outputDirectory = path.resolve("src/assets/display-images")
const thumbnailDirectory = path.resolve("src/assets/display-thumbnails")
const supportedExtensions = new Set([".jpeg", ".jpg", ".png"])

await mkdir(outputDirectory, { recursive: true })
await mkdir(thumbnailDirectory, { recursive: true })

const sourceFiles = (await readdir(sourceDirectory))
    .filter((fileName) => supportedExtensions.has(path.extname(fileName).toLowerCase()))
    .sort()

await Promise.all(
    sourceFiles.map(async (fileName) => {
        const outputName = `${path.parse(fileName).name}.jpg`

        const sourcePath = path.join(sourceDirectory, fileName)

        await Promise.all([
            sharp(sourcePath)
                .rotate()
                .resize({
                    width: 1200,
                    height: 1200,
                    fit: "inside",
                    withoutEnlargement: true,
                })
                .jpeg({ quality: 72, mozjpeg: true })
                .toFile(path.join(outputDirectory, outputName)),
            sharp(sourcePath)
                .rotate()
                .resize({
                    width: 480,
                    height: 480,
                    fit: "inside",
                    withoutEnlargement: true,
                })
                .jpeg({ quality: 64, mozjpeg: true })
                .toFile(path.join(thumbnailDirectory, outputName)),
        ])
    }),
)

console.log(`Optimized ${sourceFiles.length} images`)
