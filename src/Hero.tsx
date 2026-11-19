import { useEffect, useRef, useState, type ReactNode } from "react"
import { ArrowRight } from "lucide-react"
import { birthdayShootAssets, preloadAllMedia } from "./media"
import CallIntro from "./CallIntro"
import MessageBoard from "./MessageBoard"
import PhotoWall from "./PhotoWall"
import Room from "./Room"

type HeroProps = {
    children?: ReactNode
    front?: ReactNode
    left?: ReactNode
    right?: ReactNode
    ceiling?: ReactNode
    floor?: ReactNode
}

export default function Hero({
    children,
    front,
    left,
    right,
    ceiling,
    floor,
}: HeroProps) {
    const [introComplete, setIntroComplete] = useState(false)
    const [galleryMounted, setGalleryMounted] = useState(false)
    const [roomView, setRoomView] = useState<"gallery" | "messages">("gallery")
    const [roomTransition, setRoomTransition] = useState<"idle" | "gallery-out" | "message-out">("idle")
    const transitionTimerRef = useRef<number | null>(null)

    useEffect(() => {
        // The call and photo mosaic are the loading experience. Warm the
        // gallery in the background so it is ready when the mosaic ends.
        void preloadAllMedia(() => undefined)
    }, [])

    useEffect(() => () => {
        if (transitionTimerRef.current !== null) {
            window.clearTimeout(transitionTimerRef.current)
        }
    }, [])

    const enterMessageRoom = () => {
        if (roomTransition !== "idle") return
        setRoomTransition("gallery-out")
        const duration = window.matchMedia("(prefers-reduced-motion: reduce)").matches
            ? 50
            : 1900
        transitionTimerRef.current = window.setTimeout(() => {
            setRoomView("messages")
            setRoomTransition("idle")
        }, duration)
    }

    const returnToGallery = () => {
        if (roomTransition !== "idle") return
        setRoomTransition("message-out")
        const duration = window.matchMedia("(prefers-reduced-motion: reduce)").matches
            ? 50
            : 700
        transitionTimerRef.current = window.setTimeout(() => {
            setRoomView("gallery")
            setRoomTransition("idle")
        }, duration)
    }

    const galleryIsVisible = roomView === "gallery" || roomTransition !== "idle"
    const galleryIsActive = roomView === "gallery" && roomTransition === "idle"

    return (
        <div className="relative h-dvh min-h-svh w-screen overflow-hidden overscroll-none bg-light-pink">
            {galleryMounted && (
                <div
                    className={`gallery-room-shell absolute inset-0 h-full w-full ${galleryIsVisible ? roomTransition === "gallery-out" ? "gallery-room-leaving z-20" : "z-10" : "invisible pointer-events-none z-0"}`}
                    aria-hidden={!galleryIsVisible}
                >
                    <Room
                        front={front ?? children ?? (
                            <div className="relative h-full w-full">
                                <PhotoWall
                                    seed={11}
                                    assets={birthdayShootAssets}
                                    count={14}
                                    mediaOffset={0}
                                    wallColorClass="bg-bright-pink"
                                    spacious
                                    leaving={roomTransition === "gallery-out"}
                                    mobileCount={12}
                                    mobileColumns={4}
                                    active={galleryIsActive}
                                />
                                <div className="front-wall-text-panel pointer-events-none absolute left-1/2 top-1/2 z-10 flex min-h-[16%] w-[90%] -translate-x-1/2 -translate-y-1/2 flex-col items-center justify-center gap-1 rounded-[clamp(0.8rem,2vw,1.5rem)] border px-2 text-center sm:min-h-[27%] sm:w-[46%] sm:gap- sm:px-4">
                                    <p className="font-oi text-[clamp(1.65rem,4.5vw,4.5rem)] leading-none tracking-[0.08em] text-dark-pink drop-shadow-sm">
                                        HIF '26
                                    </p>
                                    <p className="text-center text-dark-pink drop-shadow-sm font-compagnon text-xs sm:text-lg">
                                        a new chapter for the main character!
                                    </p>
                                </div>
                            </div>
                        )}
                        left={left ?? (
                            <PhotoWall seed={29} count={12} columns={4} mediaOffset={10} wallColorClass="bg-bright-pink" leaving={roomTransition === "gallery-out"} mobileCount={12} mobileColumns={4} frontEdge="right" active={galleryIsActive} />
                        )}
                        right={right ?? (
                            <PhotoWall seed={47} count={12} columns={4} mediaOffset={22} wallColorClass="bg-bright-pink" leaving={roomTransition === "gallery-out"} mobileCount={12} mobileColumns={4} frontEdge="left" active={galleryIsActive} />
                        )}
                        ceiling={ceiling ?? (
                            <PhotoWall seed={71} count={18} mediaOffset={34} wallColorClass="bg-blush-pink" compact leaving={roomTransition === "gallery-out"} mobileCount={12} mobileColumns={6} mobileSurfaceEdge="bottom" active={galleryIsActive} />
                        )}
                        floor={floor ?? (
                            <PhotoWall seed={89} count={18} mediaOffset={52} wallColorClass="bg-blush-pink" compact leaving={roomTransition === "gallery-out"} mobileCount={12} mobileColumns={6} mobileSurfaceEdge="top" active={galleryIsActive} />
                        )}
                    />
                    <button
                        type="button"
                        className={`next-room-motion next-room-glimmer absolute right-[max(clamp(1rem,3vw,2.5rem),env(safe-area-inset-right))] bottom-[max(clamp(1rem,3vw,2.5rem),env(safe-area-inset-bottom))] z-30 flex size-13 items-center justify-center gap-0 overflow-hidden rounded-full border-2 border-dark-pink bg-deep-pink p-0 font-compagnon font-medium not-italic whitespace-nowrap text-light-pink shadow-[0_10px_28px_rgb(99_17_58/0.28)] transition-[background-color,box-shadow] duration-200 hover:bg-dark-pink hover:shadow-[0_13px_34px_rgb(99_17_58/0.38)] active:bg-[#831843] disabled:pointer-events-none ${introComplete ? "attention-pill-ready" : ""}`}
                        aria-label="Enter the message room"
                        onClick={enterMessageRoom}
                        disabled={roomTransition !== "idle"}
                    >
                        <span className="flex h-full items-center justify-center">
                            <span className="attention-pill-copy inline-flex max-w-0 items-center overflow-hidden text-sm leading-none opacity-0">leave a little love</span>
                            <ArrowRight className="attention-pill-icon block shrink-0" size={19} strokeWidth={2.4} aria-hidden="true" />
                        </span>
                    </button>
                </div>
            )}
            {galleryMounted && (roomView === "messages" || roomTransition === "gallery-out") && (
                <div className={`message-room-shell absolute inset-0 h-full w-full ${roomTransition === "message-out" ? "message-room-leaving z-20" : "z-10"}`}>
                    <MessageBoard onBack={returnToGallery} />
                </div>
            )}
            {!introComplete && (
                <CallIntro
                    onRevealStart={() => setGalleryMounted(true)}
                    onComplete={() => setIntroComplete(true)}
                />
            )}
        </div>
    )
}
