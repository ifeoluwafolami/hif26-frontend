import {
    useEffect,
    useRef,
    useState,
    type CSSProperties,
    type ReactNode,
} from "react"

const MAX_YAW = 28
const MAX_PITCH = 20
const EASING = 0.025
const INPUT_RESISTANCE = 1.35
const DRAG_YAW_SENSITIVITY = 0.12
const DRAG_PITCH_SENSITIVITY = 0.09
const CLICK_CANCEL_DISTANCE = 10
const FLORAL_TILE_SIZE = 112
const SURFACE_SEAM_OVERLAP = 6

const clamp = (value: number, min: number, max: number) =>
    Math.min(Math.max(value, min), max)

const applyResistance = (value: number) =>
    Math.sign(value) * Math.abs(value) ** INPUT_RESISTANCE

const getRoomGeometry = () => ({
    perspective: Math.max(Math.min(window.innerWidth, window.innerHeight) * 0.55, 180),
    width: window.innerWidth * 0.72,
    height: window.innerHeight * 0.82,
})

export type RoomProps = {
    front?: ReactNode
    left?: ReactNode
    right?: ReactNode
    ceiling?: ReactNode
    floor?: ReactNode
}

export default function Room({ front, left, right, ceiling, floor }: RoomProps) {
    const roomRef = useRef<HTMLDivElement>(null)
    const sceneRef = useRef<HTMLDivElement>(null)
    const [room, setRoom] = useState(getRoomGeometry)
    const roomDepth = room.perspective * 2

    useEffect(() => {
        let viewportWidth = window.innerWidth

        const onResize = () => {
            // Mobile browser chrome changes innerHeight while scrolling. Only rebuild
            // the room when its width changes, which indicates a real layout change.
            if (Math.abs(window.innerWidth - viewportWidth) < 2) return

            viewportWidth = window.innerWidth
            setRoom(getRoomGeometry())
        }

        window.addEventListener("resize", onResize)
        return () => window.removeEventListener("resize", onResize)
    }, [])

    useEffect(() => {
        let targetYaw = 0
        let targetPitch = 0
        let currentYaw = 0
        let currentPitch = 0
        let isDragging = false
        let activePointerId: number | null = null
        let lastX = 0
        let lastY = 0
        let pointerStartX = 0
        let pointerStartY = 0
        let pressedFramePointerId: number | null = null
        let suppressNextClick = false
        let clickResetTimeout = 0
        let previousFrame = performance.now()
        let raf = 0

        const requestTick = () => {
            if (raf !== 0) return
            previousFrame = performance.now()
            raf = requestAnimationFrame(tick)
        }

        const onMove = (event: PointerEvent) => {
            if (event.pointerType === "touch") {
                if (!isDragging || event.pointerId !== activePointerId) return

                if (Math.hypot(
                    event.clientX - pointerStartX,
                    event.clientY - pointerStartY,
                ) > CLICK_CANCEL_DISTANCE) {
                    suppressNextClick = true
                }

                const deltaX = event.clientX - lastX
                const deltaY = event.clientY - lastY
                lastX = event.clientX
                lastY = event.clientY

                targetYaw = clamp(
                    targetYaw - deltaX * DRAG_YAW_SENSITIVITY,
                    -MAX_YAW,
                    MAX_YAW,
                )
                targetPitch = clamp(
                    targetPitch + deltaY * DRAG_PITCH_SENSITIVITY,
                    -MAX_PITCH,
                    MAX_PITCH,
                )
                requestTick()
                return
            }

            if (pressedFramePointerId !== null) return

            const x = (event.clientX / window.innerWidth) * 2 - 1
            const y = (event.clientY / window.innerHeight) * 2 - 1

            targetYaw = applyResistance(x) * MAX_YAW
            targetPitch = -applyResistance(y) * MAX_PITCH
            requestTick()
        }

        const onPointerDown = (event: PointerEvent) => {
            const target = event.target instanceof Element ? event.target : null
            const startedOnFrame = Boolean(target?.closest(".room-frame"))

            if (startedOnFrame && event.pointerType !== "touch") {
                // Hold the 3D scene still while a transformed frame is pressed.
                // Otherwise side, ceiling, and floor frames can move out from
                // beneath the pointer before the browser dispatches its click.
                pressedFramePointerId = event.pointerId
                targetYaw = currentYaw
                targetPitch = currentPitch
                return
            }

            if (event.pointerType !== "touch") return

            isDragging = true
            activePointerId = event.pointerId
            lastX = event.clientX
            lastY = event.clientY
            pointerStartX = event.clientX
            pointerStartY = event.clientY
            suppressNextClick = false
            window.clearTimeout(clickResetTimeout)
            // Keep taps targeted at frames, while window-level move handling
            // still allows a drag that starts over a frame to rotate the room.
            if (!startedOnFrame) {
                roomRef.current?.setPointerCapture(event.pointerId)
            }
        }

        const endDrag = (event: PointerEvent) => {
            if (event.pointerId === pressedFramePointerId) {
                pressedFramePointerId = null
                return
            }
            if (event.pointerId !== activePointerId) return

            isDragging = false
            activePointerId = null
            clickResetTimeout = window.setTimeout(() => {
                suppressNextClick = false
            }, 450)
        }

        const cancelDraggedClick = (event: MouseEvent) => {
            if (!suppressNextClick) return

            event.preventDefault()
            event.stopImmediatePropagation()
            suppressNextClick = false
        }

        const tick = (time: number) => {
            raf = 0
            const frameScale = Math.min((time - previousFrame) / (1000 / 60), 3)
            const easedAmount = 1 - (1 - EASING) ** frameScale
            previousFrame = time

            currentYaw += (targetYaw - currentYaw) * easedAmount
            currentPitch += (targetPitch - currentPitch) * easedAmount

            if (sceneRef.current) {
                sceneRef.current.style.transform = `rotateX(${currentPitch}deg) rotateY(${currentYaw}deg)`
            }

            if (
                Math.abs(targetYaw - currentYaw) > 0.01 ||
                Math.abs(targetPitch - currentPitch) > 0.01
            ) {
                raf = requestAnimationFrame(tick)
            } else {
                currentYaw = targetYaw
                currentPitch = targetPitch
            }
        }

        const roomElement = roomRef.current

        roomElement?.addEventListener("pointerdown", onPointerDown)
        roomElement?.addEventListener("click", cancelDraggedClick, true)
        window.addEventListener("pointermove", onMove, { passive: true })
        window.addEventListener("pointerup", endDrag)
        window.addEventListener("pointercancel", endDrag)

        return () => {
            roomElement?.removeEventListener("pointerdown", onPointerDown)
            roomElement?.removeEventListener("click", cancelDraggedClick, true)
            window.removeEventListener("pointermove", onMove)
            window.removeEventListener("pointerup", endDrag)
            window.removeEventListener("pointercancel", endDrag)
            window.clearTimeout(clickResetTimeout)
            cancelAnimationFrame(raf)
        }
    }, [])

    const face = (
        width: number,
        height: number,
        transform: string,
        distance: number,
    ): CSSProperties => ({
        position: "absolute",
        top: "50%",
        left: "50%",
        width,
        height,
        marginTop: -height / 2,
        marginLeft: -width / 2,
        transform: `translateZ(${room.perspective}px) ${transform} translateZ(${-distance}px)`,
        backfaceVisibility: "visible",
    })

    const wallClass = "flex items-center justify-center overflow-hidden"
    const wallpaperPhase = (stripOffset: number) => ({
        "--floral-offset-x": `${-(stripOffset % FLORAL_TILE_SIZE)}px`,
    }) as CSSProperties

    return (
        <div
            ref={roomRef}
            className="h-screen w-screen overflow-hidden bg-light-pink"
            style={{
                perspective: room.perspective,
                perspectiveOrigin: "50% 50%",
                touchAction: "none",
            }}
        >
            <div
                ref={sceneRef}
                className="relative h-full w-full"
                style={{
                    transformStyle: "preserve-3d",
                    transform: "rotateX(0deg) rotateY(0deg)",
                    transformOrigin: `50% 50% ${room.perspective}px`,
                    willChange: "transform",
                }}
            >
                <div
                    className={`${wallClass} room-surface room-surface-wall bg-bright-pink`}
                    style={{
                        ...face(
                            room.width + SURFACE_SEAM_OVERLAP,
                            room.height + SURFACE_SEAM_OVERLAP,
                            "rotateY(0deg)",
                            roomDepth / 2,
                        ),
                        ...wallpaperPhase(roomDepth),
                    }}
                >
                    {front}
                </div>
                <div
                    className={`${wallClass} room-surface room-surface-wall bg-bright-pink`}
                    style={{
                        ...face(
                            roomDepth + SURFACE_SEAM_OVERLAP,
                            room.height + SURFACE_SEAM_OVERLAP,
                            "rotateY(90deg)",
                            room.width / 2,
                        ),
                        ...wallpaperPhase(0),
                    }}
                >
                    {left}
                </div>
                <div
                    className={`${wallClass} room-surface room-surface-wall bg-bright-pink`}
                    style={{
                        ...face(
                            roomDepth + SURFACE_SEAM_OVERLAP,
                            room.height + SURFACE_SEAM_OVERLAP,
                            "rotateY(-90deg)",
                            room.width / 2,
                        ),
                        ...wallpaperPhase(roomDepth + room.width),
                    }}
                >
                    {right}
                </div>
                <div
                    className={`${wallClass} room-surface room-surface-horizontal bg-light-pink`}
                    style={face(
                        room.width + SURFACE_SEAM_OVERLAP,
                        roomDepth + SURFACE_SEAM_OVERLAP,
                        "rotateX(90deg)",
                        room.height / 2,
                    )}
                >
                    {floor}
                </div>
                <div
                    className={`${wallClass} room-surface room-surface-horizontal bg-light-pink`}
                    style={face(
                        room.width + SURFACE_SEAM_OVERLAP,
                        roomDepth + SURFACE_SEAM_OVERLAP,
                        "rotateX(-90deg)",
                        room.height / 2,
                    )}
                >
                    {ceiling}
                </div>
            </div>
        </div>
    )
}
