import { useEffect, useRef, useState, type CSSProperties } from "react"
import MediaLightbox from "./MediaLightbox"
import {
    imageMediaAssets,
    type MediaAsset,
    type MediaShape,
} from "./media"

const DESKTOP_MEDIA_CHANGE_INTERVAL = 10 * 1000
const MOBILE_MEDIA_CHANGE_INTERVAL = 30 * 1000
const MOBILE_BREAKPOINT = "(max-width: 640px)"
const RIPPLE_DURATION = 1100
const FRAME_TAP_MOVEMENT_LIMIT = 12

const GALLERY_WALL_LAYOUTS = [
    { mediaOffset: 0, desktopCount: 14, mobileCount: 12 },
    { mediaOffset: 10, desktopCount: 12, mobileCount: 12 },
    { mediaOffset: 22, desktopCount: 12, mobileCount: 12 },
    { mediaOffset: 34, desktopCount: 18, mobileCount: 12 },
    { mediaOffset: 52, desktopCount: 18, mobileCount: 12 },
]

const MOBILE_FRONT_TOP_WIDTHS = [24, 23, 24, 23, 24.5, 23]
const MOBILE_FRONT_BOTTOM_WIDTHS = [24, 23, 24, 23, 24.5, 23]
const MOBILE_FRONT_TOP_LEFTS = [6, 39, 72, 6, 39, 72]
const MOBILE_FRONT_BOTTOM_LEFTS = [6, 39, 72, 6, 39, 72]
const DESKTOP_FRONT_WIDTHS = [
    12, 12, 21, 12, 12,
    12, 12.5, 12, 12.5, 12,
    9.5, 9.5, 9.5, 9.5,
]
const DESKTOP_FRONT_ROW_LEFTS = [
    3, 21.25, 39.5, 66.75, 85,
    3, 23.25, 44, 64.25, 85,
]
const DESKTOP_FRONT_SIDE_LEFTS = [4.5, 15.5, 75, 86]


type PhotoWallProps = {
    seed: number
    wallColorClass: "bg-bright-pink" | "bg-blush-pink"
    assets?: MediaAsset[]
    active?: boolean
    count?: number
    compact?: boolean
    spacious?: boolean
    columns?: number
    mediaOffset?: number
    mobileCount?: number
    mobileColumns?: number
    frontEdge?: "left" | "right"
    mobileSurfaceEdge?: "top" | "bottom"
    leaving?: boolean
}

type FramePlacement = {
    left: number
    top: number
    bottom?: number
    width: number
    height: number
    rotation: number
    edgeAnchor?: "left" | "right"
    shape: MediaShape
}

type FrameMediaProps = {
    asset: MediaAsset
    className?: string
    style?: CSSProperties
    prioritize?: boolean
}

function FrameMedia({
    asset,
    className = "",
    style,
    prioritize = true,
}: FrameMediaProps) {
    const mediaClass = `absolute inset-0 h-full w-full object-cover ${className}`

    return (
        <img
            src={asset.thumbnail}
            alt=""
            className={mediaClass}
            style={style}
            loading="eager"
            decoding="async"
            fetchPriority={prioritize ? "high" : "auto"}
            draggable={false}
            onError={(event) => {
                event.currentTarget.style.display = "none"
            }}
        />
    )
}

const createRandom = (seed: number) => {
    let value = seed

    return () => {
        value = (value * 9301 + 49297) % 233280
        return value / 233280
    }
}

const shuffleAssets = (assets: MediaAsset[], random: () => number) => {
    for (let index = assets.length - 1; index > 0; index -= 1) {
        const swapIndex = Math.floor(random() * (index + 1))
        ;[assets[index], assets[swapIndex]] = [assets[swapIndex], assets[index]]
    }

    return assets
}

const getFrameShape = (
    index: number,
    mediaOffset: number,
    mobile = false,
): MediaShape =>
    mobile && mediaOffset === 0
        ? "portrait"
        : mediaOffset === 0 && index === 4
        ? "square"
        : index === 2
            ? "landscape"
            : "portrait"

const getShapeRank = (
    mediaOffset: number,
    frameIndex: number,
    frameShape: MediaShape,
    mobile: boolean,
) => {
    let rank = 0

    for (const layout of GALLERY_WALL_LAYOUTS) {
        const count = mobile ? layout.mobileCount : layout.desktopCount

        for (let index = 0; index < count; index += 1) {
            const shape = getFrameShape(index, layout.mediaOffset, mobile)

            if (layout.mediaOffset === mediaOffset && index === frameIndex) {
                return rank
            }

            if (shape === frameShape) rank += 1
        }
    }

    return Math.abs(mediaOffset + frameIndex)
}

const shuffledMediaAssets = (() => {
    const random = createRandom(2026)
    return shuffleAssets([...imageMediaAssets], random)
})()

const createFrameLayout = (
    seed: number,
    count: number,
    compact: boolean,
    spacious: boolean,
    mobile: boolean,
    mediaOffset: number,
    requestedColumns?: number,
    frontEdge?: "left" | "right",
    mobileSurfaceEdge?: "top" | "bottom",
): FramePlacement[] => {
    const random = createRandom(seed)
    const columns = requestedColumns ?? (compact ? 6 : 5)
    const rows = Math.ceil(count / columns)
    const cellWidth = 100 / columns
    const horizontalCellWidth = !mobile && frontEdge
        ? 62 / columns
        : cellWidth
    const cellHeight = 100 / rows

    return Array.from({ length: count }, (_, index) => {
        const standardColumn = index % columns
        const column = mobile && count === 3 && columns === 2 &&
            frontEdge === "right" && index === 2
            ? 1
            : standardColumn
        const row = Math.floor(index / columns)
        const shape = getFrameShape(index, mediaOffset, mobile)
        const isMobileFrontPerimeter = mobile && mediaOffset === 0 && count >= 12
        const isDesktopFrontPerimeter = !mobile && mediaOffset === 0 && count >= 12
        const standardWidth = mobile
            ? compact && mobileSurfaceEdge
                ? horizontalCellWidth * (0.86 + random() * 0.05)
                : spacious
                ? horizontalCellWidth * (0.78 + random() * 0.08)
                : horizontalCellWidth * (0.72 + random() * 0.1)
            : frontEdge
              ? horizontalCellWidth * (0.68 + random() * 0.12)
            : spacious
              ? horizontalCellWidth * (0.57 + random() * 0.2)
              : horizontalCellWidth * (0.68 + random() * 0.14)
        const shapeScale = shape === "landscape"
            ? 1.08
            : shape === "square"
                ? 0.92
                : 1
        const surfaceScale = mobileSurfaceEdge ? 0.96 : 1
        const width = isMobileFrontPerimeter
            ? index < 6
                ? MOBILE_FRONT_TOP_WIDTHS[index]
                : MOBILE_FRONT_BOTTOM_WIDTHS[index - 6]
            : isDesktopFrontPerimeter
                ? DESKTOP_FRONT_WIDTHS[index]
            : standardWidth * shapeScale * surfaceScale
        const height = mobile
            ? spacious
                ? cellHeight * (0.62 + random() * 0.08)
                : compact
                  ? mobileSurfaceEdge
                    ? cellHeight * (0.4 + random() * 0.08)
                    : cellHeight * (0.64 + random() * 0.1)
                  : cellHeight * (0.66 + random() * 0.1)
            : frontEdge
              ? cellHeight * (0.54 + random() * 0.1)
              : compact
              ? cellHeight * (0.55 + random() * 0.18)
              : spacious
                ? cellHeight * (0.47 + random() * 0.2)
                : cellHeight * (0.68 + random() * 0.22)
        const horizontalPosition = 0.3 + random() * 0.4
        const verticalPosition = 0.3 + random() * 0.4
        const isFrontEdgeColumn = (
            (frontEdge === "left" && column === 0) ||
            (frontEdge === "right" && column === columns - 1)
        )

        const surfaceEdgeGap = mobile && mobileSurfaceEdge
            ? 5 + random() * 3
            : 5 + random() * 3
        const surfaceRowOffset = row * cellHeight * 0.5
        const perimeterTop = index < 3
            ? 2
            : index < 6
                ? 23
                : index < 9
                    ? 64
                    : 81
        const desktopPerimeterTop = index < 5
            ? 4
            : index < 10
                ? 72
                : 38
        const top = isMobileFrontPerimeter
            ? perimeterTop
            : isDesktopFrontPerimeter
                ? desktopPerimeterTop
            : mobile && mobileSurfaceEdge === "top"
            ? surfaceEdgeGap + surfaceRowOffset
            : mobile && mobileSurfaceEdge === "bottom"
                ? 0
                : row * cellHeight + verticalPosition * (cellHeight - height)
        const horizontalStart = !mobile && frontEdge === "right" ? 38 : 0
        const naturalLeft = horizontalStart + column * horizontalCellWidth +
            horizontalPosition * (horizontalCellWidth - width)
        const perimeterLeft = index < 6
            ? MOBILE_FRONT_TOP_LEFTS[index]
            : MOBILE_FRONT_BOTTOM_LEFTS[index - 6]
        const desktopPerimeterLeft = index < 10
            ? DESKTOP_FRONT_ROW_LEFTS[index]
            : DESKTOP_FRONT_SIDE_LEFTS[index - 10]
        const frontBottom = isMobileFrontPerimeter && index >= 6
            ? index < 9
                ? 23
                : 1
            : isDesktopFrontPerimeter && index >= 5 && index < 10
                ? 4
                : undefined

        return {
            left: isMobileFrontPerimeter
                ? perimeterLeft
                : isDesktopFrontPerimeter
                    ? desktopPerimeterLeft
                : isFrontEdgeColumn && frontEdge === "left"
                ? 4
                : naturalLeft,
            top,
            bottom: frontBottom ?? (
                mobile && mobileSurfaceEdge === "bottom"
                    ? surfaceEdgeGap + surfaceRowOffset
                    : undefined
            ),
            width,
            height,
            rotation: isMobileFrontPerimeter ||
                isDesktopFrontPerimeter ||
                (mobile && Boolean(mobileSurfaceEdge))
                ? 0
                : -0.45 + random() * 0.9,
            edgeAnchor: isFrontEdgeColumn ? frontEdge : undefined,
            shape,
        }
    })
}

export default function PhotoWall({
    seed,
    wallColorClass,
    assets = imageMediaAssets,
    active = true,
    count = 12,
    compact = false,
    spacious = false,
    columns,
    mediaOffset = 0,
    mobileCount,
    mobileColumns,
    frontEdge,
    mobileSurfaceEdge,
    leaving = false,
}: PhotoWallProps) {
    const wallAssets = assets.length > 0
        ? shuffleAssets([...assets], createRandom(2026 + seed))
        : shuffledMediaAssets
    const [isMobile, setIsMobile] = useState(() =>
        window.matchMedia(MOBILE_BREAKPOINT).matches,
    )
    const effectiveCount = isMobile ? (mobileCount ?? count) : count
    const effectiveColumns = isMobile ? (mobileColumns ?? columns) : columns
    const mediaChangeInterval = isMobile
        ? MOBILE_MEDIA_CHANGE_INTERVAL
        : DESKTOP_MEDIA_CHANGE_INTERVAL
    const frames = createFrameLayout(
        seed,
        effectiveCount,
        compact,
        spacious,
        isMobile,
        mediaOffset,
        effectiveColumns,
        frontEdge,
        mobileSurfaceEdge,
    )
    const [cycle, setCycle] = useState(() =>
        Math.floor(Date.now() / mediaChangeInterval),
    )
    const [previousCycle, setPreviousCycle] = useState<number | null>(null)
    const [selectedAsset, setSelectedAsset] = useState<MediaAsset | null>(null)
    const [lightboxAssets, setLightboxAssets] = useState<MediaAsset[]>([])
    const transitionTimeoutRef = useRef<number | null>(null)
    const framePointerStartRef = useRef<{ x: number; y: number } | null>(null)

    useEffect(() => {
        const mediaQuery = window.matchMedia(MOBILE_BREAKPOINT)
        const onChange = (event: MediaQueryListEvent) => setIsMobile(event.matches)

        mediaQuery.addEventListener("change", onChange)
        return () => mediaQuery.removeEventListener("change", onChange)
    }, [])

    useEffect(() => {
        const clearPointerStart = () => {
            window.setTimeout(() => {
                framePointerStartRef.current = null
            }, 0)
        }
        const cancelPointerStart = () => {
            framePointerStartRef.current = null
        }

        window.addEventListener("pointerup", clearPointerStart)
        window.addEventListener("pointercancel", cancelPointerStart)
        return () => {
            window.removeEventListener("pointerup", clearPointerStart)
            window.removeEventListener("pointercancel", cancelPointerStart)
        }
    }, [])

    useEffect(() => {
        if (!active || isMobile) return

        let changeTimeout = 0

        const scheduleNextChange = () => {
            const timeUntilNextChange =
                mediaChangeInterval - (Date.now() % mediaChangeInterval)

            changeTimeout = window.setTimeout(() => {
                setCycle((currentCycle) => {
                    if (!isMobile) setPreviousCycle(currentCycle)
                    return Math.floor(Date.now() / mediaChangeInterval)
                })

                if (!isMobile && transitionTimeoutRef.current !== null) {
                    window.clearTimeout(transitionTimeoutRef.current)
                }

                if (!isMobile) {
                    transitionTimeoutRef.current = window.setTimeout(() => {
                        setPreviousCycle(null)
                    }, RIPPLE_DURATION + 150)
                }

                scheduleNextChange()
            }, timeUntilNextChange)
        }

        scheduleNextChange()

        return () => {
            window.clearTimeout(changeTimeout)
            if (transitionTimeoutRef.current !== null) {
                window.clearTimeout(transitionTimeoutRef.current)
            }
        }
    }, [active, isMobile, mediaChangeInterval])

    const getMedia = (
        frameIndex: number,
        mediaCycle: number,
        frameShape: MediaShape,
    ) => {
        const shapeCompatibleAssets = wallAssets.filter(
            ({ shape }) => shape === frameShape,
        )
        const compatibleAssets = shapeCompatibleAssets.length > 0
            ? shapeCompatibleAssets
            : wallAssets
        const shapeRank = getShapeRank(
            mediaOffset,
            frameIndex,
            frameShape,
            isMobile,
        )
        const mediaIndex = Math.abs(
            shapeRank + mediaCycle * 23,
        ) % compatibleAssets.length

        return compatibleAssets[mediaIndex]
    }

    const currentAssets = frames.map((frame, index) =>
        getMedia(index, cycle, frame.shape),
    )
    return (
        <div
            className="relative h-full w-full"
            data-room-exit={leaving || undefined}
            aria-label="Photo gallery"
        >
            {frames.map((frame, index) => {
                const currentAsset = currentAssets[index]
                const previousAsset = previousCycle !== null
                    ? getMedia(index, previousCycle, frame.shape)
                    : null
                const displayWidth = frame.width
                const widthGrowth = displayWidth - frame.width
                const isFixedMobileFrontFrame = isMobile && mediaOffset === 0
                const openCurrentAsset = () => {
                    // Every surface shares one complete, stable queue. This keeps
                    // navigation from being limited to the frames on the wall that
                    // happened to open the lightbox.
                    setLightboxAssets(wallAssets)
                    setSelectedAsset(currentAsset)
                }
                const style: CSSProperties = {
                    left: frame.edgeAnchor === "right"
                        ? "auto"
                        : `${frame.left - widthGrowth / 2}%`,
                    right: frame.edgeAnchor === "right" ? "4%" : undefined,
                    top: frame.bottom === undefined ? `${frame.top}%` : "auto",
                    bottom: frame.bottom === undefined ? undefined : `${frame.bottom}%`,
                    width: `${displayWidth}%`,
                    height: isFixedMobileFrontFrame ? "16.5%" : "auto",
                    aspectRatio: isFixedMobileFrontFrame
                        ? undefined
                        : frame.shape === "portrait"
                        ? "2 / 3"
                        : frame.shape === "landscape"
                            ? "8 / 5"
                            : "1 / 1",
                    padding: "clamp(3px, 0.45vw, 9px)",
                    transform: `rotate(${frame.rotation}deg)`,
                    boxShadow: "0 8px 20px rgb(131 24 67 / 0.18)",
                }

                return (
                    <button
                        type="button"
                        key={`${seed}-${index}`}
                        className="room-frame absolute bg-dark-pink"
                        data-frame-shape={frame.shape}
                        aria-label="Open image"
                        onPointerDown={(event) => {
                            framePointerStartRef.current = {
                                x: event.clientX,
                                y: event.clientY,
                            }
                        }}
                        onClick={(event) => {
                            const pointerStart = framePointerStartRef.current
                            framePointerStartRef.current = null

                            if (pointerStart) {
                                const movement = Math.hypot(
                                    event.clientX - pointerStart.x,
                                    event.clientY - pointerStart.y,
                                )
                                if (movement > FRAME_TAP_MOVEMENT_LIMIT) return
                            }

                            openCurrentAsset()
                        }}
                        style={{
                            ...style,
                            border: 0,
                            cursor: "pointer",
                            "--frame-index": index,
                            "--frame-rotation": `${frame.rotation}deg`,
                            "--frame-exit-x": `${((index % 3) - 1) * (70 + (index % 4) * 16)}px`,
                            "--frame-exit-y": `${index % 2 === 0 ? -140 - index * 11 : 150 + index * 9}px`,
                        } as CSSProperties}
                    >
                        <div
                            className={`relative h-full w-full overflow-hidden ${wallColorClass}`}
                        >
                            <div className="relative h-full w-full overflow-hidden bg-light-pink">
                                {previousAsset && (
                                    <FrameMedia
                                        asset={previousAsset}
                                        prioritize={false}
                                    />
                                )}
                                <FrameMedia
                                    key={`${cycle}-${index}`}
                                    asset={currentAsset}
                                    className={previousCycle !== null ? "frame-media-change" : ""}
                                    prioritize={mediaOffset === 0 && index < (isMobile ? 6 : 10)}
                                />
                            </div>
                        </div>
                    </button>
                )
            })}
            <MediaLightbox
                asset={selectedAsset}
                assets={lightboxAssets}
                onAssetChange={setSelectedAsset}
                onClose={() => {
                    setSelectedAsset(null)
                    setLightboxAssets([])
                }}
            />
        </div>
    )
}
