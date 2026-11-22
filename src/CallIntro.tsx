import {
    useEffect,
    useRef,
    useState,
    type CSSProperties,
    type KeyboardEvent,
    type PointerEvent,
} from "react"
import { ChevronRight, Clock3, MessageCircle } from "lucide-react"
import floralFallback from "./assets/floral-fallback.png"
import { imageMediaAssets } from "./media"

const ANSWER_THRESHOLD = 0.78
const INTRO_EXIT_DURATION = 1100
const MOSAIC_DURATION = 4200
const mosaicAssets = imageMediaAssets.length > 0
    ? Array.from(
        { length: 12 },
        (_, index) => imageMediaAssets[(index * 5) % imageMediaAssets.length],
    )
    : []

type IntroStage = "calling" | "mosaic" | "preparing" | "leaving"

type CallIntroProps = {
    onRevealStart: () => void
    onComplete: () => void
}

export default function CallIntro({ onRevealStart, onComplete }: CallIntroProps) {
    const [stage, setStage] = useState<IntroStage>("calling")
    const [sliderOffset, setSliderOffset] = useState(0)
    const [isDragging, setIsDragging] = useState(false)
    const trackRef = useRef<HTMLDivElement>(null)
    const dragStartRef = useRef({ pointerX: 0, offset: 0 })

    useEffect(() => {
        if (stage !== "mosaic") return

        const duration = window.matchMedia("(prefers-reduced-motion: reduce)").matches
            ? 700
            : MOSAIC_DURATION
        const timeout = window.setTimeout(() => {
            onRevealStart()
            setStage("preparing")
        }, duration)
        return () => window.clearTimeout(timeout)
    }, [onRevealStart, stage])

    useEffect(() => {
        if (stage !== "preparing") return

        const duration = window.matchMedia("(prefers-reduced-motion: reduce)").matches
            ? 10
            : 180
        const timeout = window.setTimeout(() => setStage("leaving"), duration)
        return () => window.clearTimeout(timeout)
    }, [stage])

    useEffect(() => {
        if (stage !== "leaving") return

        const duration = window.matchMedia("(prefers-reduced-motion: reduce)").matches
            ? 20
            : INTRO_EXIT_DURATION
        const timeout = window.setTimeout(onComplete, duration)
        return () => window.clearTimeout(timeout)
    }, [onComplete, stage])

    const getMaximumOffset = () => {
        const track = trackRef.current
        if (!track) return 0
        const handle = track.querySelector<HTMLElement>(".answer-call-handle")
        return Math.max(track.clientWidth - (handle?.offsetWidth ?? 64) - 12, 0)
    }

    const answerCall = () => {
        if (stage !== "calling") return

        setSliderOffset(getMaximumOffset())
        window.setTimeout(() => {
            setStage("mosaic")
        }, 240)
    }

    const startDrag = (event: PointerEvent<HTMLButtonElement>) => {
        if (stage !== "calling") return
        event.currentTarget.setPointerCapture(event.pointerId)
        dragStartRef.current = {
            pointerX: event.clientX,
            offset: sliderOffset,
        }
        setIsDragging(true)
    }

    const drag = (event: PointerEvent<HTMLButtonElement>) => {
        if (!isDragging) return
        const maximumOffset = getMaximumOffset()
        const nextOffset = dragStartRef.current.offset +
            event.clientX - dragStartRef.current.pointerX
        setSliderOffset(Math.min(Math.max(nextOffset, 0), maximumOffset))
    }

    const endDrag = (event: PointerEvent<HTMLButtonElement>) => {
        if (!isDragging) return
        if (event.currentTarget.hasPointerCapture(event.pointerId)) {
            event.currentTarget.releasePointerCapture(event.pointerId)
        }
        setIsDragging(false)

        const maximumOffset = getMaximumOffset()
        const finalOffset = Math.min(Math.max(
            dragStartRef.current.offset + event.clientX - dragStartRef.current.pointerX,
            0,
        ), maximumOffset)
        if (maximumOffset > 0 && finalOffset / maximumOffset >= ANSWER_THRESHOLD) {
            answerCall()
        } else {
            setSliderOffset(0)
        }
    }

    const answerWithKeyboard = (event: KeyboardEvent<HTMLButtonElement>) => {
        if (event.key !== "Enter" && event.key !== " ") return
        event.preventDefault()
        answerCall()
    }

    const sliderStyle = {
        transform: `translateX(${sliderOffset}px)`,
        transition: isDragging ? "none" : undefined,
    } as CSSProperties

    return (
        <div className="call-intro fixed inset-0 z-100 overflow-hidden" data-stage={stage}>
            <section
                className="incoming-call-screen absolute inset-0 flex flex-col text-light-pink"
                aria-label="Incoming call from 26!"
                style={{ "--call-wallpaper": `url(${floralFallback})` } as CSSProperties}
            >
                <div className="call-status-bar flex items-center justify-between px-7 pt-[max(1rem,env(safe-area-inset-top))] text-sm font-semibold" aria-hidden="true">
                    <span>9:26</span>
                    <div className="flex items-center gap-2">
                        <span className="call-signal">
                            <i /><i /><i />
                        </span>
                        <span className="call-battery"><i /></span>
                    </div>
                </div>

                <div className="relative z-10 flex flex-1 flex-col items-center px-6 pt-[clamp(3rem,9vh,6rem)] text-center">
                    <div className="call-avatar" aria-hidden="true">
                        <span className="font-zodiak">26!</span>
                    </div>
                    <p className="mt-12 text-[clamp(0.9rem,2.4vw,1.1rem)] font-medium tracking-[0.16em] text-light-pink/70 uppercase">
                        Incoming call
                    </p>
                    <h1 className="mt-4 font-zodiak text-[clamp(4rem,12vw,7.5rem)] leading-none tracking-[-0.04em]">
                        26!
                    </h1>
                    {/* <p className="mt-3 flex items-center gap-2 text-base text-light-pink/75">
                        <BellRing size={16} aria-hidden="true" /> calling…
                    </p> */}
                </div>

                <div className="relative z-10 mx-auto w-full max-w-md px-6 pb-[max(1.5rem,env(safe-area-inset-bottom))]">
                    <div className="mb-7 flex justify-around px-4 text-center text-xs text-light-pink/75" aria-hidden="true">
                        <div className="call-secondary-action">
                            <span><Clock3 /></span>
                            <p>Remind Me</p>
                        </div>
                        <div className="call-secondary-action">
                            <span><MessageCircle /></span>
                            <p>Message</p>
                        </div>
                    </div>

                    <div ref={trackRef} className="answer-call-track">
                        <p className="answer-call-copy" aria-hidden="true">
                            {/* <span>›</span><span>›</span><span>›</span>  */}
                            slide to answer
                        </p>
                        <button
                            type="button"
                            className="answer-call-handle"
                            style={sliderStyle}
                            aria-label="Slide to answer the call from 26!"
                            onPointerDown={startDrag}
                            onPointerMove={drag}
                            onPointerUp={endDrag}
                            onPointerCancel={endDrag}
                            onKeyDown={answerWithKeyboard}
                        >
                            <ChevronRight aria-hidden="true" strokeWidth={2.8} />
                        </button>
                    </div>
                </div>
            </section>

            <section className="mosaic-screen absolute inset-0 flex flex-col bg-soft-pink text-dark-pink" aria-label="HIF-26 photo grid">
                <header className="mosaic-header flex items-center justify-between px-[clamp(1rem,4vw,3rem)] pt-[max(1rem,env(safe-area-inset-top))] pb-3">
                    <div className="flex items-center gap-3">
                        <span className="grid size-10 place-items-center rounded-full bg-dark-pink font-zodiak text-sm text-light-pink">26!</span>
                        <div>
                            <p className="font-compagnon text-sm font-bold leading-none">hif.26</p>
                            <p className="mt-1 text-[0.62rem] tracking-[0.12em] text-dark-pink/65 uppercase">birthday archive</p>
                        </div>
                    </div>
                    <span className="font-reglo text-lg tracking-[0.18em]" aria-hidden="true">•••</span>
                </header>

                <div className="flex min-h-0 flex-1 items-center justify-center px-2 py-2 sm:px-6">
                    <div className="mosaic-grid grid aspect-3/5 w-[min(94vw,45dvh)] grid-cols-3 grid-rows-5 gap-0.75 bg-soft-pink sm:w-[min(72vw,48dvh)] sm:max-w-lg sm:gap-1.25" role="img" aria-label="Five rows of birthday photographs with HIF-26, 23 November 2026 in the middle row">
                        {mosaicAssets.slice(0, 6).map((asset, index) => (
                            <figure className="mosaic-tile relative overflow-hidden bg-blush-pink" style={{ "--mosaic-index": index } as CSSProperties} key={`top-${asset.source}`}>
                                <img className="size-full object-cover object-top" src={asset.thumbnail} alt="" loading="eager" decoding="async" />
                                <span className="absolute inset-0 bg-linear-to-t from-dark-pink/15 to-transparent" aria-hidden="true" />
                            </figure>
                        ))}

                        <div className="col-span-3 grid grid-cols-3 gap-0.75 sm:gap-1.25">
                            {[0, 1, 2].map((segment) => (
                                <div className="mosaic-tile mosaic-title-tile relative overflow-hidden" style={{ "--mosaic-index": segment + 6 } as CSSProperties} key={segment} aria-hidden="true">
                                    <div
                                        className="absolute inset-y-0 flex w-[300%] flex-col items-center justify-center bg-[linear-gradient(135deg,#9d174d_0%,#be185d_52%,#831843_100%)] px-3 text-center text-light-pink"
                                        style={{ left: `${segment * -100}%` }}
                                    >
                                        <p className="whitespace-nowrap font-oi text-[clamp(1.05rem,6vw,1.75rem)] leading-[0.9] tracking-[0.04em] sm:text-[2rem]">hif-26</p>
                                        <p className="mt-1.5 whitespace-nowrap font-compagnon text-[clamp(0.62rem,3.1vw,0.9rem)] font-medium leading-none tracking-[0.07em] uppercase sm:text-base">23 November 2026</p>
                                    </div>
                                </div>
                            ))}
                        </div>

                        {mosaicAssets.slice(6, 12).map((asset, index) => (
                            <figure className="mosaic-tile relative overflow-hidden bg-blush-pink" style={{ "--mosaic-index": index + 9 } as CSSProperties} key={`bottom-${asset.source}`}>
                                <img className="size-full object-cover object-top" src={asset.thumbnail} alt="" loading="eager" decoding="async" />
                                <span className="absolute inset-0 bg-linear-to-t from-dark-pink/15 to-transparent" aria-hidden="true" />
                            </figure>
                        ))}
                    </div>
                </div>

                <footer className="mosaic-footer px-5 pt-2 pb-[max(1rem,env(safe-area-inset-bottom))] text-center font-compagnon text-[0.68rem] font-medium tracking-[0.16em] text-dark-pink/65 uppercase">
                    a new chapter for the main character
                </footer>
            </section>
        </div>
    )
}
