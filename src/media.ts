const imageModules = import.meta.glob(
    "./assets/display-images/*.jpg",
    { eager: true, import: "default", query: "?url" },
) as Record<string, string>

const thumbnailModules = import.meta.glob(
    "./assets/display-thumbnails/*.jpg",
    { eager: true, import: "default", query: "?url" },
) as Record<string, string>

const birthdayShootModules = import.meta.glob(
    "./assets/birthday-shoot-display/*.jpg",
    { eager: true, import: "default", query: "?url" },
) as Record<string, string>

const birthdayShootThumbnailModules = import.meta.glob(
    "./assets/birthday-shoot-thumbnails/*.jpg",
    { eager: true, import: "default", query: "?url" },
) as Record<string, string>

export type MediaAsset = {
    id: string
    source: string
    thumbnail: string
    type: "image"
    shape: MediaShape
}

export type MediaShape = "portrait" | "landscape" | "square"

const landscapeFileNames = new Set([
    "999a2982-6c55-4ee9-ba8d-9958b7bb0ae0",
    "IMG_7921",
    "b0c016d9-67ff-4d62-8fb1-cb3eb5982473",
    "ee1d19a1-e83f-43f0-9791-d8ce4fa00448",
    "f06f28d6-47d1-42db-b19c-f022f3324b4b",
])

const squareFileNames = new Set([
    "2d4d50ff-b597-4ed2-a105-10222f034337",
])

const getMediaShape = (path: string): MediaShape => {
    const fileName = path.split("/").pop() ?? path
    const fileStem = fileName.replace(/\.[^.]+$/, "")
    if (landscapeFileNames.has(fileStem)) return "landscape"
    if (squareFileNames.has(fileStem)) return "square"
    return "portrait"
}

const getMediaId = (path: string) => {
    const fileName = path.split("/").pop() ?? path
    return fileName.replace(/\.[^.]+$/, "")
}

export const imageMediaAssets: MediaAsset[] = Object.entries(imageModules)
    .sort(([firstPath], [secondPath]) => firstPath.localeCompare(secondPath))
    .map(([path, source]) => ({
        id: getMediaId(path),
        source,
        thumbnail: Object.entries(thumbnailModules).find(([thumbnailPath]) =>
            thumbnailPath.split("/").pop() === path.split("/").pop()
        )?.[1] ?? source,
        type: "image" as const,
        shape: getMediaShape(path),
    }))

export const birthdayShootAssets: MediaAsset[] = Object.entries(birthdayShootModules)
    .sort(([firstPath], [secondPath]) => firstPath.localeCompare(secondPath))
    .map(([path, source]) => ({
        id: getMediaId(path),
        source,
        thumbnail: Object.entries(birthdayShootThumbnailModules)
            .find(([thumbnailPath]) => getMediaId(thumbnailPath) === getMediaId(path))?.[1] ?? source,
        type: "image" as const,
        shape: "portrait" as const,
    }))

export const mediaAssets = [...birthdayShootAssets, ...imageMediaAssets]

let preloadPromise: Promise<void> | null = null
let preloadProgress = 0
const preloadListeners = new Set<(progress: number) => void>()
const sessionImageCache = new Map<string, HTMLImageElement>()
const sessionImageLoads = new Map<string, Promise<void>>()

const reportPreloadProgress = (progress: number) => {
    preloadProgress = progress
    preloadListeners.forEach((listener) => listener(progress))
}

const warmSessionImageCache = (source: string) => {
    if (sessionImageCache.has(source)) {
        return Promise.resolve()
    }
    const existingLoad = sessionImageLoads.get(source)
    if (existingLoad) return existingLoad

    const load = new Promise<void>((resolve) => {
        const image = new Image()
        image.decoding = "async"
        image.fetchPriority = "auto"
        image.onload = () => {
            image.decode()
                .catch(() => undefined)
                .finally(() => {
                    // Keep the decoded image alive for this tab session so
                    // revisiting either room does not rebuild it from cold.
                    sessionImageCache.set(source, image)
                    resolve()
                })
        }
        image.onerror = () => resolve()
        image.src = source
    }).finally(() => {
        sessionImageLoads.delete(source)
    })

    sessionImageLoads.set(source, load)
    return load
}

const runPreloadQueue = async (
    sources: string[],
    workerCount: number,
    load: (source: string) => Promise<void>,
    onItemComplete: () => void,
) => {
    let nextSourceIndex = 0

    const worker = async () => {
        while (nextSourceIndex < sources.length) {
            const sourceIndex = nextSourceIndex
            nextSourceIndex += 1

            try {
                await load(sources[sourceIndex])
            } catch {
                // One failed image should not hold up the rest of the gallery.
            } finally {
                onItemComplete()
            }
        }
    }

    await Promise.all(Array.from(
        { length: Math.min(workerCount, sources.length) },
        () => worker(),
    ))
}

export const preloadImagesForSession = (
    sources: string[],
    workerCount = 4,
) => runPreloadQueue(
    [...new Set(sources.filter(Boolean))],
    workerCount,
    warmSessionImageCache,
    () => undefined,
)

const startMediaPreload = async () => {
    const isMobile = window.matchMedia("(max-width: 640px)").matches
    const thumbnailSources = [...new Set(mediaAssets.map(({ thumbnail }) => thumbnail))]
    const totalAssets = thumbnailSources.length
    let completed = 0
    const markComplete = () => {
        completed += 1
        reportPreloadProgress(totalAssets === 0 ? 1 : completed / totalAssets)
    }

    // Decode every lightweight wall thumbnail during the intro and retain it
    // for this tab session. Full-resolution lightbox images remain on demand.
    await runPreloadQueue(
        thumbnailSources,
        isMobile ? 4 : 6,
        warmSessionImageCache,
        markComplete,
    )

    if (totalAssets === 0) reportPreloadProgress(1)
}

export const preloadAllMedia = (onProgress: (progress: number) => void) => {
    preloadListeners.add(onProgress)
    onProgress(preloadProgress)

    if (preloadPromise === null) {
        preloadPromise = startMediaPreload()
    }

    return preloadPromise.finally(() => {
        preloadListeners.delete(onProgress)
    })
}
