import { spawn } from "node:child_process"
import { mkdir, readdir } from "node:fs/promises"
import path from "node:path"
import ffmpegPath from "ffmpeg-static"

const sourceDirectory = path.resolve("src/assets/images")
const outputDirectory = path.resolve("src/assets/display-videos")
const supportedExtensions = new Set([".mov", ".mp4", ".webm", ".m4v"])

if (!ffmpegPath) throw new Error("FFmpeg binary is unavailable")

await mkdir(outputDirectory, { recursive: true })

const sourceFiles = (await readdir(sourceDirectory))
    .filter((fileName) => supportedExtensions.has(path.extname(fileName).toLowerCase()))
    .sort()

const runFfmpeg = (inputPath, outputPath) =>
    new Promise((resolve, reject) => {
        const process = spawn(ffmpegPath, [
            "-y",
            "-i", inputPath,
            "-vf", "scale=960:960:force_original_aspect_ratio=decrease:force_divisible_by=2,fps=24",
            "-c:v", "libx264",
            "-preset", "medium",
            "-crf", "28",
            "-pix_fmt", "yuv420p",
            "-movflags", "+faststart",
            "-an",
            outputPath,
        ], { stdio: "ignore" })

        process.on("error", reject)
        process.on("exit", (code) => {
            if (code === 0) resolve()
            else reject(new Error(`FFmpeg exited with code ${code}`))
        })
    })

for (const [index, fileName] of sourceFiles.entries()) {
    const parsedPath = path.parse(fileName)
    const outputName = `${parsedPath.name}-${parsedPath.ext.slice(1).toLowerCase()}.mp4`

    console.log(`[${index + 1}/${sourceFiles.length}] ${fileName}`)
    await runFfmpeg(
        path.join(sourceDirectory, fileName),
        path.join(outputDirectory, outputName),
    )
}

console.log(`Compressed ${sourceFiles.length} videos`)
