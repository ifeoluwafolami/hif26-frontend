import {
    useCallback,
    useEffect,
    useMemo,
    useRef,
    useState,
    type CSSProperties,
    type TouchEvent,
} from "react"
import { createPortal } from "react-dom"
import { ChevronLeft, ChevronRight, X } from "lucide-react"
import type { MediaAsset } from "./media"

type MediaLightboxProps = {
    asset: MediaAsset | null
    assets?: MediaAsset[]
    onAssetChange: (asset: MediaAsset) => void
    onClose: () => void
}

const SWIPE_THRESHOLD = 48
const SWIPE_SETTLE_DURATION = 280
const MOBILE_BREAKPOINT = "(max-width: 640px)"

export default function MediaLightbox({
    asset,
    assets = [],
    onAssetChange,
    onClose,
}: MediaLightboxProps) {
    const touchStartRef = useRef<{ x: number; y: number } | null>(null)
    const dragXRef = useRef(0)
    const settleTimeoutRef = useRef<number | null>(null)
    const navigationInProgressRef = useRef(false)
    const [isMobile, setIsMobile] = useState(() =>
        window.matchMedia(MOBILE_BREAKPOINT).matches,
    )
    const [dragX, setDragX] = useState(0)
    const [isSettling, setIsSettling] = useState(false)
    const [hasInteracted, setHasInteracted] = useState(false)
    const galleryAssets = useMemo(() => {
        if (!asset) return assets

        return assets.some(({ source }) => source === asset.source)
            ? assets
            : [asset, ...assets]
    }, [asset, assets])
    const activeIndex = asset
        ? galleryAssets.findIndex(({ source }) => source === asset.source)
        : -1
    const canNavigate = galleryAssets.length > 1
    const loopedAssets = useMemo(() => canNavigate
        ? [galleryAssets[galleryAssets.length - 1], ...galleryAssets, galleryAssets[0]]
        : galleryAssets,
    [canNavigate, galleryAssets])
    const [visualIndex, setVisualIndex] = useState(() => Math.max(activeIndex + 1, 0))

    const move = useCallback((direction: number) => {
        if (!canNavigate || activeIndex < 0 || navigationInProgressRef.current) return

        const nextIndex = (activeIndex + direction + galleryAssets.length) % galleryAssets.length
        navigationInProgressRef.current = true
        setIsSettling(true)
        setVisualIndex((current) => current + direction)
        onAssetChange(galleryAssets[nextIndex])

        if (settleTimeoutRef.current !== null) {
            window.clearTimeout(settleTimeoutRef.current)
        }
        settleTimeoutRef.current = window.setTimeout(() => {
            dragXRef.current = 0
            navigationInProgressRef.current = false
            setIsSettling(false)
            setVisualIndex(nextIndex + 1)
            settleTimeoutRef.current = null
        }, SWIPE_SETTLE_DURATION)
    }, [activeIndex, canNavigate, galleryAssets, onAssetChange])

    const navigateFromControl = useCallback((direction: number) => {
        setHasInteracted(true)
        move(direction)
    }, [move])

    const close = useCallback(() => {
        if (settleTimeoutRef.current !== null) {
            window.clearTimeout(settleTimeoutRef.current)
            settleTimeoutRef.current = null
        }
        touchStartRef.current = null
        dragXRef.current = 0
        navigationInProgressRef.current = false
        setDragX(0)
        setIsSettling(false)
        setHasInteracted(false)
        onClose()
    }, [onClose])

    useEffect(() => {
        const mediaQuery = window.matchMedia(MOBILE_BREAKPOINT)
        const onChange = (event: MediaQueryListEvent) => setIsMobile(event.matches)

        mediaQuery.addEventListener("change", onChange)
        return () => mediaQuery.removeEventListener("change", onChange)
    }, [])

    useEffect(() => () => {
        if (settleTimeoutRef.current !== null) {
            window.clearTimeout(settleTimeoutRef.current)
        }
    }, [])

    useEffect(() => {
        if (navigationInProgressRef.current) return
        setVisualIndex(Math.max(activeIndex + (canNavigate ? 1 : 0), 0))
    }, [activeIndex, canNavigate])

    useEffect(() => {
        if (!asset) return

        const handleKeyDown = (event: KeyboardEvent) => {
            if (event.key === "Escape") {
                close()
            } else if (event.key === "ArrowLeft") {
                event.preventDefault()
                navigateFromControl(-1)
            } else if (event.key === "ArrowRight") {
                event.preventDefault()
                navigateFromControl(1)
            }
        }

        window.addEventListener("keydown", handleKeyDown)
        return () => window.removeEventListener("keydown", handleKeyDown)
    }, [asset, close, navigateFromControl])

    const startSwipe = (event: TouchEvent<HTMLElement>) => {
        if (!isMobile || !canNavigate || isSettling) return
        const target = event.target instanceof Element ? event.target : null
        if (target?.closest("button")) return
        const touch = event.touches[0]
        if (!touch) return

        if (settleTimeoutRef.current !== null) {
            window.clearTimeout(settleTimeoutRef.current)
            settleTimeoutRef.current = null
        }
        setHasInteracted(true)
        setIsSettling(false)
        dragXRef.current = 0
        setDragX(0)
        touchStartRef.current = { x: touch.clientX, y: touch.clientY }
    }

    const updateSwipe = (event: TouchEvent<HTMLElement>) => {
        const start = touchStartRef.current
        const touch = event.touches[0]
        if (!start || !touch || !isMobile || !canNavigate) return

        const distanceX = touch.clientX - start.x
        const distanceY = touch.clientY - start.y
        if (Math.abs(distanceY) > Math.abs(distanceX) && dragXRef.current === 0) return

        event.preventDefault()
        const constrainedDistance = Math.max(
            -window.innerWidth * 0.82,
            Math.min(window.innerWidth * 0.82, distanceX),
        )
        dragXRef.current = constrainedDistance
        setDragX(constrainedDistance)
    }

    const endSwipe = (event: TouchEvent<HTMLElement>) => {
        const start = touchStartRef.current
        const touch = event.changedTouches[0]
        touchStartRef.current = null
        if (!start || !touch) return

        const distanceX = dragXRef.current
        const direction = distanceX < 0 ? 1 : -1
        const shouldNavigate = canNavigate && Math.abs(distanceX) >= SWIPE_THRESHOLD

        setDragX(0)
        if (shouldNavigate) {
            move(direction)
        } else {
            setIsSettling(true)
            settleTimeoutRef.current = window.setTimeout(() => {
                dragXRef.current = 0
                setIsSettling(false)
                settleTimeoutRef.current = null
            }, SWIPE_SETTLE_DURATION)
        }
    }

    if (!asset) return null

    return createPortal(
        <div
            className="media-lightbox-backdrop fixed inset-0 z-100 grid place-items-center bg-dark-pink/75 p-4 backdrop-blur-md"
            onMouseDown={close}
            onTouchStart={startSwipe}
            onTouchMove={updateSwipe}
            onTouchEnd={endSwipe}
        >
            <button
                type="button"
                className="media-lightbox-close"
                aria-label="Close image"
                onMouseDown={(event) => event.stopPropagation()}
                onClick={close}
            >
                <X aria-hidden="true" />
            </button>
            {canNavigate && (
                <button
                    type="button"
                    className="media-lightbox-arrow media-lightbox-arrow-left"
                    aria-label="Previous memory"
                    onMouseDown={(event) => event.stopPropagation()}
                    onClick={() => navigateFromControl(-1)}
                >
                    <ChevronLeft aria-hidden="true" />
                </button>
            )}
            <div className="media-lightbox-mobile-viewport">
                <div
                    className={`media-lightbox-mobile-track ${isSettling ? "is-settling" : ""}`}
                    data-swipe-hint={isMobile && !hasInteracted && canNavigate || undefined}
                    style={{
                        "--lightbox-drag-x": `${dragX}px`,
                        "--lightbox-base-x": `${-(visualIndex * 100 / loopedAssets.length)}%`,
                        width: `${loopedAssets.length * 100}%`,
                    } as CSSProperties}
                >
                    {loopedAssets.map((slideAsset, index) => (
                        <div
                            className="media-lightbox-mobile-slide"
                            key={`${slideAsset.source}-${index}`}
                            aria-hidden={index !== visualIndex}
                            style={{
                                width: `${100 / loopedAssets.length}%`,
                                flexBasis: `${100 / loopedAssets.length}%`,
                            }}
                        >
                            {Math.abs(index - visualIndex) <= 2 && (
                                <figure
                                    className="media-lightbox-panel"
                                    data-media-type={slideAsset.type}
                                    data-media-shape={slideAsset.shape}
                                    role={index === visualIndex ? "dialog" : undefined}
                                    aria-modal={index === visualIndex ? "true" : undefined}
                                    aria-label={index === visualIndex ? "Selected image" : undefined}
                                    onMouseDown={(event) => event.stopPropagation()}
                                >
                                    <img
                                        src={slideAsset.source}
                                        alt={index === visualIndex ? "Selected memory" : ""}
                                        className="media-lightbox-content"
                                        loading={Math.abs(index - visualIndex) <= 1 ? "eager" : "lazy"}
                                        decoding="async"
                                        draggable={false}
                                    />
                                </figure>
                            )}
                        </div>
                    ))}
                </div>
            </div>
            {canNavigate && (
                <button
                    type="button"
                    className="media-lightbox-arrow media-lightbox-arrow-right"
                    aria-label="Next memory"
                    onMouseDown={(event) => event.stopPropagation()}
                    onClick={() => navigateFromControl(1)}
                >
                    <ChevronRight aria-hidden="true" />
                </button>
            )}
        </div>,
        document.body,
    )
}
