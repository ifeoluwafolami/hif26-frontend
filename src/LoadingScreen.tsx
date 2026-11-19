import { useEffect, useRef, type CSSProperties } from "react"
import floralFallback from "./assets/floral-fallback.png"
import timelapsePoster from "./assets/loading-timelapse-poster.jpg"
import timelapse from "./assets/loading-timelapse.mp4"

// A face-morph timelapse (scripts/morph-timelapse.mjs) plays inside the arch,
// growing from baby to today, paced to finish as loading completes.

// Petals drifting up through the wallpaper (fixed layout, CSS-animated).
const petals = Array.from({ length: 14 }, (_, index) => ({
    left: (index * 37) % 100,
    size: 12 + ((index * 7) % 14),
    duration: 14 + ((index * 5) % 10),
    delay: -((index * 3.1) % 18),
    drift: ((index % 2 ? 1 : -1) * (20 + ((index * 11) % 40))),
    shape: index % 3 === 0 ? "♥" : "✿",
}))

type LoadingScreenProps = {
    progress: number
    /** How long loading is expected to take (ms); the video is paced to match. */
    duration: number
}

export default function LoadingScreen({ progress: rawProgress, duration }: LoadingScreenProps) {
    const progress = Number.isFinite(rawProgress) ? Math.min(Math.max(rawProgress, 0), 1) : 0
    const percentage = Math.round(progress * 100)
    const videoRef = useRef<HTMLVideoElement>(null)

    // Pace the timelapse so today's photo arrives as loading finishes; if
    // loading runs longer, the video simply rests on the last frame.
    useEffect(() => {
        const video = videoRef.current
        if (!video) return
        const pace = () => {
            if (Number.isFinite(video.duration) && video.duration > 0) {
                video.playbackRate = Math.min(4, Math.max(0.5, video.duration / (duration / 1000)))
            }
            video.play().catch(() => undefined)
        }
        if (video.readyState >= 1) pace()
        video.addEventListener("loadedmetadata", pace)
        return () => video.removeEventListener("loadedmetadata", pace)
    }, [duration])

    return (
        <div
            className="relative flex h-screen w-screen items-center justify-center overflow-hidden bg-light-pink text-dark-pink"
            role="status"
            aria-live="polite"
            aria-label={`Loading, ${percentage}%`}
        >
            {/* Animated wallpaper: slow drift, soft pink vignette, rising petals */}
            <div aria-hidden="true" className="pointer-events-none absolute inset-0">
                <div className="loading-wallpaper absolute inset-0" style={{ backgroundImage: `url(${floralFallback})` }} />
                <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_center,rgb(252_231_243/0.82)_0%,rgb(252_231_243/0.45)_38%,rgb(219_39_119/0.22)_100%)]" />
                {petals.map((petal, index) => (
                    <span
                        key={index}
                        className="loading-petal absolute -bottom-10 text-bright-pink/60"
                        style={{
                            left: `${petal.left}%`,
                            fontSize: petal.size,
                            animationDuration: `${petal.duration}s`,
                            animationDelay: `${petal.delay}s`,
                            "--drift": `${petal.drift}px`,
                        } as CSSProperties}
                    >
                        {petal.shape}
                    </span>
                ))}
            </div>

            {/* Arched frame with gradient border; the video takes its curved shape */}
            <div
                aria-hidden="true"
                className="loading-arch relative z-10 h-[min(80vh,660px)] w-[min(90vw,500px)] rounded-t-[999px] rounded-b-[2.25rem] p-0.75 shadow-[0_30px_80px_-20px_rgb(157_23_77/0.45)]"
            >
                <div className="relative h-full w-full overflow-hidden rounded-t-[999px] rounded-b-[calc(2.25rem-3px)] bg-light-pink">
                    <video
                        ref={videoRef}
                        src={timelapse}
                        poster={timelapsePoster}
                        className="absolute inset-0 h-full w-full object-cover"
                        autoPlay
                        muted
                        playsInline
                        preload="auto"
                        disablePictureInPicture
                    />

                    {/* Soft pink fades so the title and bar read over the photos */}
                    <div className="pointer-events-none absolute inset-x-0 top-0 h-[32%] bg-[linear-gradient(to_bottom,rgb(252_231_243/0.92),rgb(252_231_243/0.55)_45%,transparent)]" />
                    <div className="pointer-events-none absolute inset-x-0 bottom-0 h-[18%] bg-[linear-gradient(to_top,rgb(252_231_243/0.9),transparent)]" />
                    <div className="pointer-events-none absolute inset-2.5 rounded-t-[999px] rounded-b-[1.8rem] border border-light-pink/60" />

                    {/* Title curved along the inside of the arch */}
                    <svg className="pointer-events-none absolute inset-x-0 top-0 z-10 w-full" viewBox="0 0 500 250">
                        <path id="loading-title-arc" d="M 95 250 A 155 155 0 0 1 405 250" fill="none" />
                        <text className="fill-dark-pink font-soria" fontSize="40" letterSpacing="9">
                            <textPath href="#loading-title-arc" startOffset="50%" textAnchor="middle">
                                HIF-26
                            </textPath>
                        </text>
                    </svg>

                    {/* Progress bar */}
                    <div className="absolute inset-x-[11%] bottom-[clamp(1.25rem,4vh,2rem)] z-10">
                        <div className="relative h-3.5 rounded-full bg-soft-pink/90 shadow-[inset_0_2px_4px_rgb(157_23_77/0.25)]">
                            <div
                                className="loading-fill absolute inset-y-0 left-0 rounded-full"
                                style={{ width: `${Math.max(progress * 100, 4)}%` }}
                            >
                                <span className="loading-knob absolute -right-2.25 top-1/2 grid size-5.5 -translate-y-1/2 place-items-center rounded-full bg-light-pink text-[11px] leading-none text-deep-pink shadow-[0_0_0_3px_rgb(219_39_119),0_0_16px_4px_rgb(244_114_182/0.7)]">
                                    ♥
                                </span>
                            </div>
                        </div>
                    </div>
                </div>
            </div>
        </div>
    )
}
