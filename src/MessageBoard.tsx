import { useEffect, useLayoutEffect, useMemo, useRef, useState, type CSSProperties, type FormEvent, type TouchEvent } from "react"
import { ArrowLeft, Check, ChevronLeft, ChevronRight, CircleAlert, Heart, ListChecks, Plus, Send, X } from "lucide-react"
import floralFallback from "./assets/floral-fallback.png"
import { imageMediaAssets, preloadImagesForSession, type MediaAsset } from "./media"
import { createWish, fetchWishes, type RemoteWish } from "./wishes-api"

type Wish = {
    id: string
    name: string
    message: string
    activity: string
    imageSource: string
}

type BoardView = "wishes" | "bucket-list"

const MESSAGES_PER_PAGE = 6
const MOBILE_BUCKETS_PER_PAGE = 6
const DESKTOP_BUCKETS_PER_PAGE = 10
const MESSAGE_SWIPE_THRESHOLD = 56
const MESSAGE_SWIPE_DURATION = 280
const FORM_STEP_ERRORS = [
    "Alas, the impossible choice must be made. Pick your favourite photo to continue.",
    "The birthday girl deserves at least one sweet line, don't you think?",
    "Add one fun idea for the year ahead.",
    "Tell me who you are right now! No mysterious admirers today.",
]

const birthdayShootModules = import.meta.glob(
    "./assets/birthday-shoot/*.{jpg,jpeg,png,webp,avif}",
    { eager: true, import: "default", query: "?url" },
) as Record<string, string>

const birthdayShootAssets: MediaAsset[] = Object.entries(birthdayShootModules)
    .sort(([firstPath], [secondPath]) => firstPath.localeCompare(secondPath))
    .map(([path, source]) => ({
        id: path.split("/").pop()?.replace(/\.[^.]+$/, "") ?? path,
        source,
        thumbnail: source,
        type: "image" as const,
        shape: "portrait" as const,
    }))

// Display images keep the experience complete until the birthday-shoot folder is populated.
const photoChoices = birthdayShootAssets.length > 0 ? birthdayShootAssets : imageMediaAssets.slice(0, 18)

const wishFromApi = (wish: RemoteWish): Wish => ({
    id: wish.id,
    name: wish.name,
    message: wish.message,
    activity: wish.activity,
    imageSource: photoChoices.find(({ id }) => id === wish.imageId)?.source ?? floralFallback,
})

const getFloatStyle = (index: number) => ({
    "--float-rotation": `${[-2.2, 1.5, -0.8, 2.1, -1.3, 0.9][index % 6]}deg`,
    "--float-delay": `${-(index % 7) * 0.55}s`,
    "--float-distance": `${5 + (index % 4) * 2}px`,
} as CSSProperties)

type MessageBoardProps = { onBack: () => void }

export default function MessageBoard({ onBack }: MessageBoardProps) {
    const [wishes, setWishes] = useState<Wish[]>([])
    const [view, setView] = useState<BoardView>("wishes")
    const [isFormOpen, setIsFormOpen] = useState(false)
    const [name, setName] = useState("")
    const [message, setMessage] = useState("")
    const [activity, setActivity] = useState("")
    const [selectedPhoto, setSelectedPhoto] = useState("")
    const [formStep, setFormStep] = useState(0)
    const [error, setError] = useState("")
    const [syncError, setSyncError] = useState("")
    const [isSubmitting, setIsSubmitting] = useState(false)
    const [messagePage, setMessagePage] = useState(0)
    const [bucketPage, setBucketPage] = useState(0)
    const [isMobileBoard, setIsMobileBoard] = useState(() => window.matchMedia("(max-width: 700px)").matches)
    const [selectedWish, setSelectedWish] = useState<Wish | null>(null)
    const [highlightedWishId, setHighlightedWishId] = useState<string | null>(null)
    const [messageDragX, setMessageDragX] = useState(0)
    const [isMessageSettling, setIsMessageSettling] = useState(false)
    const [hasTouchedMessages, setHasTouchedMessages] = useState(false)
    const [messageTrackHeight, setMessageTrackHeight] = useState<number | null>(null)
    const [isMessagePageScrollable, setIsMessagePageScrollable] = useState(true)
    const boardContentRef = useRef<HTMLElement>(null)
    const messageSlideRefs = useRef<Array<HTMLDivElement | null>>([])
    const messageTouchStartRef = useRef<{ x: number; y: number } | null>(null)
    const messageDragXRef = useRef(0)
    const messageSettleTimeoutRef = useRef<number | null>(null)

    const activities = useMemo(() => {
        return wishes
            .filter((wish) => wish.activity.trim().length > 0)
            .reverse()
    }, [wishes])
    const messagePageCount = Math.max(1, Math.ceil(wishes.length / MESSAGES_PER_PAGE))
    const bucketsPerPage = isMobileBoard ? MOBILE_BUCKETS_PER_PAGE : DESKTOP_BUCKETS_PER_PAGE
    const bucketPageCount = Math.max(1, Math.ceil(activities.length / bucketsPerPage))
    const activeCarouselPage = view === "wishes" ? messagePage : bucketPage
    const activeCarouselPageCount = view === "wishes" ? messagePageCount : bucketPageCount
    const visibleWishes = wishes.slice(
        messagePage * MESSAGES_PER_PAGE,
        messagePage * MESSAGES_PER_PAGE + MESSAGES_PER_PAGE,
    )
    const selectedMessageLength = selectedWish?.message.trim().length ?? 0
    const selectedActivityLength = selectedWish?.activity.trim().length ?? 0
    const selectedMessageSize = selectedMessageLength > 650
        ? "text-[0.88rem] leading-[1.28]"
        : selectedMessageLength > 380
            ? "text-[clamp(0.94rem,1.15vw,1.05rem)] leading-[1.24]"
            : selectedMessageLength > 220
                ? "text-[clamp(1rem,1.35vw,1.18rem)] leading-[1.2]"
                : "text-[clamp(1.1rem,1.6vw,1.4rem)] leading-[1.16]"
    const selectedActivitySize = selectedActivityLength > 220
        ? "text-[0.86rem] leading-tight"
        : selectedActivityLength > 120
            ? "text-[0.94rem] leading-tight"
            : "text-base leading-snug"
    const isCurrentStepComplete = [
        selectedPhoto.length > 0,
        message.trim().length > 0,
        activity.trim().length > 0,
        name.trim().length > 0,
        true,
    ][formStep] ?? true

    useEffect(() => () => {
        if (messageSettleTimeoutRef.current !== null) {
            window.clearTimeout(messageSettleTimeoutRef.current)
        }
    }, [])

    useEffect(() => {
        let cancelled = false

        void fetchWishes()
            .then((savedWishes) => {
                if (cancelled) return
                setWishes(savedWishes.map(wishFromApi))
                setSyncError("")
            })
            .catch(() => {
                if (!cancelled) {
                    setSyncError("Saved messages could not be loaded. Please try again later.")
                }
            })

        return () => { cancelled = true }
    }, [])

    useEffect(() => {
        const mediaQuery = window.matchMedia("(max-width: 700px)")
        const updateLayout = (event: MediaQueryListEvent) => {
            setIsMobileBoard(event.matches)
            setBucketPage(0)
        }

        mediaQuery.addEventListener("change", updateLayout)
        return () => mediaQuery.removeEventListener("change", updateLayout)
    }, [])

    useEffect(() => {
        const messageBoardSources = [
            ...photoChoices.flatMap(({ source, thumbnail }) => [thumbnail, source]),
            ...wishes.map(({ imageSource }) => imageSource),
        ]

        void preloadImagesForSession(messageBoardSources, isMobileBoard ? 3 : 5)
    }, [isMobileBoard, wishes])

    useLayoutEffect(() => {
        const activeSlide = messageSlideRefs.current[activeCarouselPage]
        const boardContent = boardContentRef.current
        if (!activeSlide || !boardContent) return

        const updateTrackHeight = () => {
            const slideHeight = Math.ceil(activeSlide.getBoundingClientRect().height)
            const contentStyles = window.getComputedStyle(boardContent)
            const topPadding = parseFloat(contentStyles.paddingTop)
            const bottomPadding = parseFloat(contentStyles.paddingBottom)
            const carouselTopPadding = 16
            const needsVerticalScroll = slideHeight + topPadding + bottomPadding + carouselTopPadding > boardContent.clientHeight

            setMessageTrackHeight(slideHeight)
            setIsMessagePageScrollable(needsVerticalScroll)
            if (!needsVerticalScroll) boardContent.scrollTop = 0
        }
        updateTrackHeight()

        const resizeObserver = new ResizeObserver(updateTrackHeight)
        resizeObserver.observe(activeSlide)
        resizeObserver.observe(boardContent)
        return () => resizeObserver.disconnect()
    }, [activeCarouselPage, view, wishes])

    useLayoutEffect(() => {
        boardContentRef.current?.scrollTo({ top: 0, behavior: "auto" })
    }, [activeCarouselPage, view])

    useEffect(() => {
        if (!highlightedWishId) return

        const animationFrame = window.requestAnimationFrame(() => {
            const boardContent = boardContentRef.current
            const searchRoot = isMobileBoard
                ? messageSlideRefs.current[activeCarouselPage]
                : boardContent
            if (!boardContent || !searchRoot) return

            const highlightedCard = Array.from(
                searchRoot.querySelectorAll<HTMLElement>("[data-wish-id]"),
            ).find((card) => card.dataset.wishId === highlightedWishId)
            if (!highlightedCard) return

            const boardRect = boardContent.getBoundingClientRect()
            const cardRect = highlightedCard.getBoundingClientRect()
            const centeredOffset = Math.max(0, (boardContent.clientHeight - cardRect.height) / 2)
            const scrollTop = boardContent.scrollTop + cardRect.top - boardRect.top - centeredOffset
            boardContent.scrollTo({ top: Math.max(0, scrollTop), behavior: "smooth" })
        })

        return () => window.cancelAnimationFrame(animationFrame)
    }, [activeCarouselPage, highlightedWishId, isMobileBoard, view])

    const wishesForPage = (page: number) => page < 0 || page >= messagePageCount
        ? []
        : wishes.slice(page * MESSAGES_PER_PAGE, page * MESSAGES_PER_PAGE + MESSAGES_PER_PAGE)

    const bucketsForPage = (page: number) => page < 0 || page >= bucketPageCount
        ? []
        : activities.slice(page * bucketsPerPage, page * bucketsPerPage + bucketsPerPage)

    const startMessageSwipe = (event: TouchEvent<HTMLDivElement>) => {
        if (activeCarouselPageCount <= 1 || isMessageSettling || !isMobileBoard) return
        const touch = event.touches[0]
        if (!touch) return

        setHasTouchedMessages(true)
        messageDragXRef.current = 0
        setMessageDragX(0)
        messageTouchStartRef.current = { x: touch.clientX, y: touch.clientY }
    }

    const updateMessageSwipe = (event: TouchEvent<HTMLDivElement>) => {
        const start = messageTouchStartRef.current
        const touch = event.touches[0]
        if (!start || !touch) return

        const distanceX = touch.clientX - start.x
        const distanceY = touch.clientY - start.y
        if (Math.abs(distanceY) > Math.abs(distanceX) && messageDragXRef.current === 0) return

        event.preventDefault()
        const canMove = distanceX < 0 ? activeCarouselPage < activeCarouselPageCount - 1 : activeCarouselPage > 0
        const resistedDistance = canMove ? distanceX : distanceX * 0.16
        const constrainedDistance = Math.max(-window.innerWidth * 0.82, Math.min(window.innerWidth * 0.82, resistedDistance))
        messageDragXRef.current = constrainedDistance
        setMessageDragX(constrainedDistance)
    }

    const endMessageSwipe = () => {
        if (!messageTouchStartRef.current) return
        messageTouchStartRef.current = null

        const distanceX = messageDragXRef.current
        const direction = distanceX < 0 ? 1 : -1
        const canMove = direction > 0 ? activeCarouselPage < activeCarouselPageCount - 1 : activeCarouselPage > 0
        const shouldMove = canMove && Math.abs(distanceX) >= MESSAGE_SWIPE_THRESHOLD

        setIsMessageSettling(true)
        setMessageDragX(0)
        if (shouldMove) {
            if (view === "wishes") setMessagePage((page) => page + direction)
            else setBucketPage((page) => page + direction)
        }

        messageSettleTimeoutRef.current = window.setTimeout(() => {
            messageDragXRef.current = 0
            setIsMessageSettling(false)
            messageSettleTimeoutRef.current = null
        }, MESSAGE_SWIPE_DURATION)
    }

    const resetForm = () => {
        setName("")
        setMessage("")
        setActivity("")
        setSelectedPhoto("")
        setFormStep(0)
        setError("")
    }

    const closeForm = () => {
        resetForm()
        setIsFormOpen(false)
    }

    const changeView = (nextView: BoardView) => {
        if (messageSettleTimeoutRef.current !== null) {
            window.clearTimeout(messageSettleTimeoutRef.current)
            messageSettleTimeoutRef.current = null
        }
        messageTouchStartRef.current = null
        messageDragXRef.current = 0
        setMessageDragX(0)
        setIsMessageSettling(false)
        setHasTouchedMessages(false)
        if (highlightedWishId) {
            const highlightedIndex = nextView === "wishes"
                ? wishes.findIndex(({ id }) => id === highlightedWishId)
                : activities.findIndex(({ id }) => id === highlightedWishId)
            const targetPage = highlightedIndex < 0
                ? 0
                : Math.floor(highlightedIndex / (nextView === "wishes" ? MESSAGES_PER_PAGE : bucketsPerPage))

            if (nextView === "wishes") setMessagePage(targetPage)
            else setBucketPage(targetPage)
        } else {
            setMessagePage(0)
            setBucketPage(0)
        }
        boardContentRef.current?.scrollTo({ top: 0, behavior: "auto" })
        setView(nextView)
    }

    const submitWish = async (event: FormEvent<HTMLFormElement>) => {
        event.preventDefault()
        const cleanName = name.trim()
        const cleanMessage = message.trim()
        const cleanActivity = activity.trim()

        if (formStep === 0 && !selectedPhoto) {
            setError(FORM_STEP_ERRORS[0])
            return
        }
        if (formStep === 1 && !cleanMessage) {
            setError(FORM_STEP_ERRORS[1])
            return
        }
        if (formStep === 2 && !cleanActivity) {
            setError(FORM_STEP_ERRORS[2])
            return
        }
        if (formStep === 3 && !cleanName) {
            setError(FORM_STEP_ERRORS[3])
            return
        }

        if (formStep < 4) {
            setError("")
            setFormStep((current) => current + 1)
            return
        }

        const selectedAsset = photoChoices.find(({ source }) => source === selectedPhoto)
        if (!selectedAsset) {
            setError("That photo is no longer available. Please choose another one.")
            setFormStep(0)
            return
        }

        setIsSubmitting(true)
        setError("")
        try {
            const savedWish = await createWish({
                name: cleanName,
                message: cleanMessage,
                activity: cleanActivity,
                imageId: selectedAsset.id,
            })
            const wish = wishFromApi(savedWish)

            setWishes((current) => [wish, ...current])
            setHighlightedWishId(wish.id)
            setMessagePage(0)
            resetForm()
            setIsFormOpen(false)
            setView("wishes")
            setSyncError("")
        } catch (submissionError) {
            setError(submissionError instanceof Error
                ? submissionError.message
                : "Your message could not be saved. Please try again.")
        } finally {
            setIsSubmitting(false)
        }
    }

    const renderWishCards = (pageWishes: Wish[], prioritize = false) => pageWishes.map((wish, index) => (
        <button type="button" className="wish-card-motion grid min-w-0 cursor-pointer grid-cols-[minmax(6.2rem,36%)_minmax(0,1fr)] items-center gap-[clamp(0.75rem,1.3vw,1.15rem)] rounded-[1.35rem] border border-light-pink/85 bg-light-pink/80 p-3 text-left shadow-[inset_0_1px_0_rgb(255_255_255/0.85),0_14px_34px_rgb(99_17_58/0.2)] backdrop-blur-xl transition-[box-shadow,background-color] hover:shadow-[inset_0_1px_0_rgb(255_255_255/0.85),0_20px_42px_rgb(99_17_58/0.3)] focus-visible:outline-3 focus-visible:outline-offset-2 focus-visible:outline-light-pink data-[highlighted=true]:bg-white/90 data-[highlighted=true]:shadow-[inset_0_0_0_3px_rgb(157_23_77),0_20px_48px_rgb(99_17_58/0.42)] max-[700px]:min-h-[7.3rem] max-[700px]:grid-cols-[minmax(5.4rem,31%)_minmax(0,1fr)] max-[700px]:gap-3 max-[700px]:rounded-[1.1rem] max-[700px]:p-2" key={wish.id} data-wish-id={wish.id} data-highlighted={wish.id === highlightedWishId} style={getFloatStyle(index)} onClick={() => setSelectedWish(wish)} aria-label={`Open message from ${wish.name}`}>
            <div className="relative aspect-4/5 overflow-hidden rounded-xl border-[5px] border-dark-pink bg-dark-pink shadow-[0_8px_18px_rgb(99_17_58/0.22)] max-[700px]:max-h-[8.8rem] max-[700px]:rounded-lg max-[700px]:border-4">
                <img className="block size-full object-cover" src={wish.imageSource} alt="" loading={prioritize ? "eager" : "lazy"} decoding="async" fetchPriority={prioritize && index < 2 ? "high" : "auto"} onError={(event) => { event.currentTarget.src = floralFallback }} />
                <Heart className="absolute right-2 bottom-2 text-light-pink drop-shadow-[0_2px_4px_rgb(99_17_58/0.55)]" size={17} fill="currentColor" aria-hidden="true" />
            </div>
            <div className="min-w-0 pr-1.5">
                <p className="line-clamp-6 overflow-hidden text-ellipsis font-compagnon text-[clamp(0.92rem,1.35vw,1.22rem)] leading-[1.16] max-[700px]:text-[0.94rem]">{wish.message}</p>
                <span className="mt-3 block font-reglo text-[0.86rem] font-bold tracking-[0.06em] text-[#be185d] uppercase max-[700px]:mt-2 max-[700px]:text-[0.78rem]">— {wish.name}</span>
            </div>
        </button>
    ))

    const renderBucketCards = (pageActivities: Wish[], pageStartIndex = 0, prioritize = false) => pageActivities.map((wish, index) => (
        <article className="bucket-card-motion relative grid min-w-0 grid-cols-[4.5rem_minmax(0,1fr)] items-center gap-4 rounded-[1.35rem] border border-light-pink/85 bg-light-pink/80 py-3 pr-4 pl-3 shadow-[inset_0_1px_0_rgb(255_255_255/0.82),0_14px_34px_rgb(99_17_58/0.18)] backdrop-blur-xl transition-[box-shadow,background-color] data-[highlighted=true]:bg-white/90 data-[highlighted=true]:shadow-[inset_0_0_0_3px_rgb(157_23_77),0_20px_48px_rgb(99_17_58/0.42)] max-[700px]:grid-cols-[3.8rem_minmax(0,1fr)] max-[700px]:gap-3 max-[700px]:rounded-[1.1rem]" key={`${wish.id}-activity`} data-wish-id={wish.id} data-highlighted={wish.id === highlightedWishId} style={getFloatStyle(index)}>
            <div className="pointer-events-none absolute top-2 right-3 font-soria text-[2.6rem] leading-none text-dark-pink/20">{String(pageStartIndex + index + 1).padStart(2, "0")}</div>
            <img className="h-[5.2rem] w-18 rounded-xl border-4 border-dark-pink object-cover max-[700px]:h-[4.6rem] max-[700px]:w-[3.8rem]" src={wish.imageSource} alt="" loading={prioritize ? "eager" : "lazy"} decoding="async" fetchPriority={prioritize && index < 2 ? "high" : "auto"} onError={(event) => { event.currentTarget.src = floralFallback }} />
            <div className="grid grid-cols-[auto_1fr] items-start gap-x-2">
                <Check className="mt-0.5 text-deep-pink" size={18} strokeWidth={2.6} aria-hidden="true" />
                <p className="pr-6 text-[clamp(0.95rem,1.5vw,1.25rem)] font-medium leading-[1.15] max-[700px]:text-[0.96rem]">{wish.activity}</p>
                <span className="col-start-2 mt-2 text-[0.67rem] tracking-wider text-[#be185d] uppercase">suggested by {wish.name}</span>
            </div>
        </article>
    ))

    return (
        <main className="message-board-floral relative isolate grid h-full min-h-0 grid-rows-[auto_minmax(0,1fr)] overflow-hidden bg-bright-pink text-dark-pink max-[700px]:h-dvh max-[700px]:min-h-dvh max-[700px]:grid-rows-[minmax(0,1fr)] max-[700px]:overscroll-none">
            <div className="message-board-ambient-glow pointer-events-none absolute inset-[-20%] -z-10" aria-hidden="true" />

            {syncError && (
                <p className="fixed right-4 bottom-4 left-4 z-60 mx-auto max-w-xl rounded-xl border border-white/70 bg-[#831843] px-4 py-3 text-center font-compagnon text-sm font-medium not-italic text-white shadow-xl" role="alert">
                    {syncError}
                </p>
            )}

            <button type="button" className="absolute top-[max(1rem,env(safe-area-inset-top))] left-[max(1rem,env(safe-area-inset-left))] z-50 grid size-11 place-items-center rounded-full border border-light-pink/75 bg-light-pink/70 text-dark-pink shadow-[0_10px_30px_rgb(99_17_58/0.18),inset_0_1px_0_rgb(255_255_255/0.7)] backdrop-blur-2xl max-[700px]:fixed" onClick={onBack} aria-label="Back to gallery">
                <ArrowLeft size={19} strokeWidth={2.4} aria-hidden="true" />
            </button>

            <header className="relative z-10 mx-[clamp(1rem,4vw,4rem)] mt-[max(0.75rem,env(safe-area-inset-top))] flex min-h-26 items-center justify-between gap-4 border-b border-light-pink/50 py-3 pr-0 pl-[clamp(3.5rem,6vw,5rem)] max-[700px]:fixed max-[700px]:inset-x-0 max-[700px]:top-0 max-[700px]:z-40 max-[700px]:m-0 max-[700px]:min-h-36 max-[700px]:flex-col max-[700px]:items-stretch max-[700px]:justify-center max-[700px]:border-light-pink/65 max-[700px]:bg-bright-pink/90 max-[700px]:pt-[max(0.5rem,env(safe-area-inset-top))] max-[700px]:pr-4 max-[700px]:pb-2 max-[700px]:pl-18 max-[700px]:shadow-[0_10px_30px_rgb(99_17_58/0.12)] max-[700px]:backdrop-blur-xl">
                <div key={view} className="form-step-motion">
                    {/* <p><Sparkles size={15} aria-hidden="true" /> birthday love, all in one place</p> */}
                    <h1 className={`font-oi text-[clamp(2.15rem,4vw,4.4rem)] leading-[0.8] max-[700px]:whitespace-nowrap ${view === "bucket-list" ? "max-[700px]:text-[clamp(1.55rem,7vw,1.9rem)]" : "max-[700px]:text-[clamp(2rem,10vw,3.2rem)]"}`}>{view === "wishes" ? "Fan Mail" : "For the Plot"}</h1>
                    <p className="mt-1 font-compagnon text-xl font-medium not-italic tracking-widest text-dark-pink uppercase max-[700px]:text-[0.7rem] max-[700px]:tracking-[0.08em]">{view === "wishes" ? "Love notes for the birthday girl!" : "An epic bucket list for the new year!"}</p>
                    
                </div>

                <nav className="flex shrink-0 gap-1 rounded-full border border-light-pink/70 bg-light-pink/60 p-1 shadow-[inset_0_1px_0_rgb(255_255_255/0.7),0_10px_30px_rgb(99_17_58/0.14)] backdrop-blur-2xl max-[700px]:-ml-11 max-[700px]:w-max max-[700px]:max-w-full max-[700px]:self-center" aria-label="Message board views">
                    <button type="button" className="flex items-center gap-1.5 rounded-full px-3.5 py-2.5 font-compagnon text-sm font-medium not-italic text-dark-pink data-[active=true]:bg-dark-pink data-[active=true]:text-light-pink data-[active=true]:shadow-[0_7px_18px_rgb(99_17_58/0.24)] max-[700px]:px-3 max-[700px]:py-2 max-[700px]:text-xs" data-active={view === "wishes"} onClick={() => changeView("wishes")}>
                        <Heart size={17} aria-hidden="true" /> Wishes
                    </button>
                    <button type="button" className="flex items-center gap-1.5 rounded-full px-3.5 py-2.5 font-compagnon text-sm font-medium not-italic text-dark-pink data-[active=true]:bg-dark-pink data-[active=true]:text-light-pink data-[active=true]:shadow-[0_7px_18px_rgb(99_17_58/0.24)] max-[700px]:px-3 max-[700px]:py-2 max-[700px]:text-xs" data-active={view === "bucket-list"} onClick={() => changeView("bucket-list")}>
                        <ListChecks size={18} aria-hidden="true" /> Bucket list
                    </button>
                </nav>
            </header>

            <section ref={boardContentRef} className={`relative z-2 min-h-0 overflow-auto overscroll-contain px-[clamp(1rem,4vw,4rem)] pt-[clamp(1rem,2.4vw,2rem)] pb-28 [scrollbar-color:rgb(157_23_77/0.45)_transparent] scrollbar-thin max-[700px]:h-full max-[700px]:px-3 max-[700px]:pt-40 max-[700px]:pb-24 max-[700px]:overscroll-none ${!isMessagePageScrollable ? "max-[700px]:overflow-y-hidden" : "max-[700px]:overflow-y-auto"}`} data-view={view}>
                {view === "wishes" ? (
                    <>
                        {/* <div className="message-board-intro">
                            <div>
                                <span>THE MESSAGE BOARD</span>
                                <h2>Pick a favourite. Leave a little love.</h2>
                            </div>
                            <p>Every note pairs a favourite photo with a birthday wish and one fun thing to try this year.</p>
                        </div> */}

                        {wishes.length === 0 && (
                            <div className="mx-auto mt-[clamp(2rem,10vh,7rem)] max-w-lg rounded-3xl border border-light-pink/70 bg-light-pink/65 px-6 py-10 text-center shadow-xl backdrop-blur-2xl">
                                <Heart className="mx-auto mb-3 text-dark-pink" size={30} aria-hidden="true" />
                                <h2 className="font-compagnon text-2xl font-medium">No wishes yet</h2>
                                <p className="mt-2 font-compagnon not-italic">Be the first to leave some birthday love.</p>
                            </div>
                        )}

                        <div key={messagePage} className="form-step-motion mx-auto hidden max-w-376 grid-cols-3 items-start gap-x-[clamp(0.75rem,1.5vw,1.25rem)] gap-y-[clamp(2rem,6vh,4.5rem)] min-[701px]:grid max-[980px]:grid-cols-2" aria-label="Birthday wishes">
                            {renderWishCards(visibleWishes, true)}
                        </div>
                        <div
                            className="message-pages-mobile-viewport pt-4 min-[701px]:hidden"
                            onTouchStart={startMessageSwipe}
                            onTouchMove={updateMessageSwipe}
                            onTouchEnd={endMessageSwipe}
                            onTouchCancel={endMessageSwipe}
                            aria-label="Swipe between message pages"
                        >
                            <div
                                key="wishes-swipe-track"
                                className={`message-pages-mobile-track ${isMessageSettling ? "is-settling" : ""}`}
                                data-swipe-hint={!hasTouchedMessages && messagePageCount > 1 || undefined}
                                style={{
                                    "--message-page-drag-x": `${messageDragX}px`,
                                    "--message-page-base-x": `${-(messagePage * 100 / messagePageCount)}%`,
                                    width: `${messagePageCount * 100}%`,
                                    height: messageTrackHeight === null ? undefined : `${messageTrackHeight}px`,
                                } as CSSProperties}
                            >
                                {Array.from({ length: messagePageCount }, (_, page) => (
                                    <div
                                        className="message-pages-mobile-slide"
                                        key={page}
                                        aria-hidden={page !== messagePage}
                                        ref={(element) => { messageSlideRefs.current[page] = element }}
                                        style={{
                                            width: `${100 / messagePageCount}%`,
                                            flexBasis: `${100 / messagePageCount}%`,
                                        }}
                                    >
                                        <div className="grid grid-cols-1 items-start gap-y-5 pb-10">
                                            {renderWishCards(wishesForPage(page), page === messagePage)}
                                        </div>
                                    </div>
                                ))}
                            </div>
                        </div>
                        {messagePageCount > 1 && (
                            <nav className="fixed bottom-[max(1rem,env(safe-area-inset-bottom))] left-1/2 z-40 flex -translate-x-1/2 items-center justify-center gap-3 px-2 py-1.5 max-[700px]:top-37 max-[700px]:bottom-auto" aria-label="Message pages">
                                <button type="button" className="grid size-10 place-items-center rounded-full border border-light-pink/80 bg-light-pink/75 text-dark-pink shadow-lg backdrop-blur-xl disabled:opacity-35 max-[700px]:hidden" onClick={() => setMessagePage((page) => Math.max(0, page - 1))} disabled={messagePage === 0} aria-label="Previous message page"><ChevronLeft size={19} aria-hidden="true" /></button>
                                <div className="flex items-center gap-1.5">
                                    {Array.from({ length: messagePageCount }, (_, page) => (
                                        <button key={page} type="button" className="h-2 w-2 rounded-full bg-dark-pink/30 transition-all data-[active=true]:w-7 data-[active=true]:bg-dark-pink" data-active={page === messagePage} onClick={() => setMessagePage(page)} aria-label={`Show message page ${page + 1}`} aria-current={page === messagePage ? "page" : undefined} />
                                    ))}
                                </div>
                                <button type="button" className="grid size-10 place-items-center rounded-full border border-light-pink/80 bg-light-pink/75 text-dark-pink shadow-lg backdrop-blur-xl disabled:opacity-35 max-[700px]:hidden" onClick={() => setMessagePage((page) => Math.min(messagePageCount - 1, page + 1))} disabled={messagePage === messagePageCount - 1} aria-label="Next message page"><ChevronRight size={19} aria-hidden="true" /></button>
                            </nav>
                        )}
                    </>
                ) : (
                    <>
                        {/* <div className="mx-auto mb-[clamp(1.1rem,2vw,1.8rem)] grid grid-cols-[minmax(0,1.3fr)_minmax(16rem,0.7fr)] items-end gap-8 rounded-[1.6rem] border border-light-pink/70 bg-light-pink/70 px-[clamp(1.1rem,2.5vw,2rem)] py-[clamp(1rem,2vw,1.5rem)] shadow-[inset_0_1px_0_rgb(255_255_255/0.76),0_18px_42px_rgb(99_17_58/0.14)] backdrop-blur-2xl max-[700px]:mb-3 max-[700px]:block max-[700px]:rounded-[1.2rem] max-[700px]:p-3.5">
                            <div>
                                <span className="mb-1 block text-[0.66rem] font-bold tracking-[0.14em] text-[#be185d]">THINGS TO TRY THIS YEAR</span>
                                <h2 className="font-compagnon text-[clamp(1.35rem,2.5vw,2.35rem)] font-medium leading-none max-[700px]:text-xl">The birthday bucket list</h2>
                            </div>
                            <p className="max-w-xl text-[clamp(0.83rem,1.15vw,1rem)] leading-snug text-dark-pink max-[700px]:mt-2 max-[700px]:text-xs">{activities.length} ideas, suggested with love. The more playful, surprising and memorable, the better.</p>
                        </div> */}

                        {activities.length === 0 && (
                            <div className="mx-auto mt-[clamp(2rem,10vh,7rem)] max-w-lg rounded-3xl border border-light-pink/70 bg-light-pink/65 px-6 py-10 text-center shadow-xl backdrop-blur-2xl">
                                <ListChecks className="mx-auto mb-3 text-dark-pink" size={30} aria-hidden="true" />
                                <h2 className="font-compagnon text-2xl font-medium">No ideas yet</h2>
                                <p className="mt-2 font-compagnon not-italic">The first submitted wish will start the bucket list.</p>
                            </div>
                        )}

                        <div className="mx-auto hidden max-w-312 grid-cols-2 gap-[clamp(0.75rem,1.5vw,1.25rem)] min-[701px]:grid" aria-label="Bucket list suggestions">
                            {renderBucketCards(bucketsForPage(bucketPage), bucketPage * bucketsPerPage, true)}
                        </div>
                        <div
                            className="message-pages-mobile-viewport pt-4 min-[701px]:hidden"
                            onTouchStart={startMessageSwipe}
                            onTouchMove={updateMessageSwipe}
                            onTouchEnd={endMessageSwipe}
                            onTouchCancel={endMessageSwipe}
                            aria-label="Swipe between bucket-list pages"
                        >
                            <div
                                key="bucket-list-swipe-track"
                                className={`message-pages-mobile-track ${isMessageSettling ? "is-settling" : ""}`}
                                data-swipe-hint={!hasTouchedMessages && bucketPageCount > 1 || undefined}
                                style={{
                                    "--message-page-drag-x": `${messageDragX}px`,
                                    "--message-page-base-x": `${-(bucketPage * 100 / bucketPageCount)}%`,
                                    width: `${bucketPageCount * 100}%`,
                                    height: messageTrackHeight === null ? undefined : `${messageTrackHeight}px`,
                                } as CSSProperties}
                            >
                                {Array.from({ length: bucketPageCount }, (_, page) => (
                                    <div
                                        className="message-pages-mobile-slide"
                                        key={page}
                                        aria-hidden={page !== bucketPage}
                                        ref={(element) => { messageSlideRefs.current[page] = element }}
                                        style={{
                                            width: `${100 / bucketPageCount}%`,
                                            flexBasis: `${100 / bucketPageCount}%`,
                                        }}
                                    >
                                        <div className="grid grid-cols-1 items-start gap-y-3 pb-10">
                                            {renderBucketCards(bucketsForPage(page), page * bucketsPerPage, page === bucketPage)}
                                        </div>
                                    </div>
                                ))}
                            </div>
                        </div>
                        {bucketPageCount > 1 && (
                            <nav className="fixed bottom-[max(1rem,env(safe-area-inset-bottom))] left-1/2 z-40 flex -translate-x-1/2 items-center justify-center gap-3 px-2 py-1.5 max-[700px]:top-37 max-[700px]:bottom-auto" aria-label="Bucket-list pages">
                                <button type="button" className="grid size-10 place-items-center rounded-full border border-light-pink/80 bg-light-pink/75 text-dark-pink shadow-lg backdrop-blur-xl disabled:opacity-35 max-[700px]:hidden" onClick={() => setBucketPage((page) => Math.max(0, page - 1))} disabled={bucketPage === 0} aria-label="Previous bucket-list page"><ChevronLeft size={19} aria-hidden="true" /></button>
                                <div className="flex items-center gap-1.5">
                                    {Array.from({ length: bucketPageCount }, (_, page) => (
                                        <button key={page} type="button" className="h-2 w-2 rounded-full bg-dark-pink/30 transition-all data-[active=true]:w-7 data-[active=true]:bg-dark-pink" data-active={page === bucketPage} onClick={() => setBucketPage(page)} aria-label={`Show bucket-list page ${page + 1}`} aria-current={page === bucketPage ? "page" : undefined} />
                                    ))}
                                </div>
                                <button type="button" className="grid size-10 place-items-center rounded-full border border-light-pink/80 bg-light-pink/75 text-dark-pink shadow-lg backdrop-blur-xl disabled:opacity-35 max-[700px]:hidden" onClick={() => setBucketPage((page) => Math.min(bucketPageCount - 1, page + 1))} disabled={bucketPage === bucketPageCount - 1} aria-label="Next bucket-list page"><ChevronRight size={19} aria-hidden="true" /></button>
                            </nav>
                        )}
                    </>
                )}
            </section>

            {selectedWish && (
                <div className="modal-fade-motion absolute inset-0 z-80 grid place-items-center overflow-y-auto bg-[#50072d]/60 p-[max(1rem,env(safe-area-inset-top))_max(1rem,env(safe-area-inset-right))_max(1rem,env(safe-area-inset-bottom))_max(1rem,env(safe-area-inset-left))] backdrop-blur-[10px]" onMouseDown={() => setSelectedWish(null)}>
                    <article className="modal-pop-motion relative grid h-[min(33rem,80dvh)] w-full max-w-208 grid-cols-[minmax(15rem,0.8fr)_minmax(0,1.2fr)] overflow-hidden rounded-4xl border border-white/85 bg-light-pink/95 p-3 text-[#831843] shadow-[inset_0_1px_0_white,0_35px_100px_rgb(80_7_45/0.48)] backdrop-blur-3xl max-[700px]:block max-[700px]:h-auto max-[700px]:max-h-[90dvh] max-[700px]:max-w-md max-[700px]:overflow-y-auto max-[700px]:overscroll-contain max-[700px]:rounded-3xl max-[700px]:[-ms-overflow-style:none] max-[700px]:scrollbar-none max-[700px]:[&::-webkit-scrollbar]:hidden" onMouseDown={(event) => event.stopPropagation()} role="dialog" aria-modal="true" aria-label={`Message from ${selectedWish.name}`}>
                        <button type="button" className="absolute top-4 right-4 z-10 grid size-10 place-items-center rounded-full border border-white/70 bg-light-pink/80 text-dark-pink shadow-lg backdrop-blur-xl" onClick={() => setSelectedWish(null)} aria-label="Close message"><X size={20} aria-hidden="true" /></button>
                        <div className="mx-auto aspect-4/5 w-full max-w-88 self-center overflow-hidden rounded-[1.35rem] border-[5px] border-dark-pink bg-dark-pink max-[700px]:max-w-76">
                            <img className="block size-full object-cover" src={selectedWish.imageSource} alt={`Favourite chosen by ${selectedWish.name}`} onError={(event) => { event.currentTarget.src = floralFallback }} />
                        </div>
                        <div className="relative flex max-h-[calc(100%-1.5rem)] min-h-0 min-w-0 self-center flex-col justify-start overflow-y-auto overscroll-contain px-[clamp(1rem,3vw,2.25rem)] py-[clamp(1.25rem,2.5vw,2rem)] pr-[clamp(3.5rem,5vw,4.5rem)] [-ms-overflow-style:none] scrollbar-none [&::-webkit-scrollbar]:hidden max-[700px]:h-auto max-[700px]:max-h-none max-[700px]:self-stretch max-[700px]:overflow-visible max-[700px]:px-[clamp(1rem,3vw,2.25rem)] max-[700px]:pt-5 max-[700px]:pb-4">
                            {/* <p className="mb-2 text-[0.65rem] font-bold tracking-[0.13em] text-[#be185d] uppercase">A sweet message</p> */}
                            <p className={`font-compagnon not-italic max-[700px]:text-[1.2rem] max-[700px]:leading-[1.15] ${selectedMessageSize}`}>{selectedWish.message}</p>
                            <div className="mt-4 rounded-2xl border border-dark-pink/15 bg-white/45 p-3.5">
                                <p className="mb-1.5 flex items-center gap-2 text-[0.75rem] font-medium tracking-widest text-[#be185d] uppercase"><ListChecks size={15} aria-hidden="true" /> Bucket-list suggestion</p>
                                <p className={`font-compagnon not-italic max-[700px]:text-base max-[700px]:leading-snug ${selectedActivitySize}`}>{selectedWish.activity}</p>
                            </div>
                            <p className="mt-4 font-reglo text-sm tracking-[0.06em] text-dark-pink uppercase">— {selectedWish.name}</p>
                        </div>
                    </article>
                </div>
            )}

            <button type="button" className="attention-pill-ready color-glaze absolute right-[max(1rem,env(safe-area-inset-right))] bottom-[max(1rem,env(safe-area-inset-bottom))] z-40 flex size-13 items-center justify-center overflow-hidden rounded-full border border-[#831843] bg-dark-pink p-0 font-compagnon text-sm font-medium not-italic whitespace-nowrap text-light-pink shadow-[0_14px_34px_rgb(99_17_58/0.34)] transition hover:bg-[#831843] max-[700px]:right-[max(0.7rem,env(safe-area-inset-right))] max-[700px]:bottom-[max(0.7rem,env(safe-area-inset-bottom))]" onClick={() => { resetForm(); setIsFormOpen(true) }}>
                <span className="flex h-full items-center justify-center leading-tight">
                    <span className="attention-pill-copy inline-flex max-w-0 items-center overflow-hidden py-0.5 leading-tight opacity-0">Leave a message</span>
                    <Plus className="attention-pill-icon block shrink-0" size={18} strokeWidth={2.5} aria-hidden="true" />
                </span>
            </button>

            {isFormOpen && (
                <div className="modal-fade-motion absolute inset-0 z-90 grid place-items-center overflow-y-auto bg-[#50072d]/55 p-[max(1rem,env(safe-area-inset-top))_max(1rem,env(safe-area-inset-right))_max(1rem,env(safe-area-inset-bottom))_max(1rem,env(safe-area-inset-left))] backdrop-blur-[9px] max-[700px]:p-[max(0.65rem,env(safe-area-inset-top))_0.5rem_max(0.5rem,env(safe-area-inset-bottom))]" onMouseDown={closeForm}>
                    <form className="modal-pop-motion grid max-h-[min(90vh,52rem)] w-full max-w-2xl grid-rows-[auto_minmax(0,1fr)_auto_auto] overflow-hidden rounded-[1.8rem] border border-white/85 bg-light-pink/90 p-[clamp(1rem,2.5vw,1.8rem)] text-[#831843] shadow-[inset_0_1px_0_white,0_35px_100px_rgb(80_7_45/0.48)] backdrop-blur-3xl data-[step=0]:max-w-248 data-[step=4]:max-w-208 max-[700px]:max-h-[94vh] max-[700px]:rounded-3xl max-[700px]:p-4" data-step={formStep} onSubmit={submitWish} onMouseDown={(event) => event.stopPropagation()}>
                        <div className="mb-[clamp(1rem,2vw,1.5rem)] flex items-center justify-between gap-4">
                            <div className="flex items-center gap-1.5" aria-label={`Step ${formStep + 1} of 5`}>
                                {[0, 1, 2, 3, 4].map((step) => (
                                    <span className="h-1 w-7 rounded-full bg-dark-pink/20 transition-all duration-300 data-[active=true]:w-9 data-[active=true]:bg-deep-pink max-[700px]:w-4 max-[700px]:data-[active=true]:w-6" key={step} data-active={step <= formStep} aria-hidden="true" />
                                ))}
                                <small className="ml-1.5 text-[0.64rem] font-semibold tracking-[0.06em] text-[#be185d] uppercase max-[700px]:text-[0.56rem]">Step {formStep + 1} of 5</small>
                            </div>
                            <button type="button" className="grid size-9 shrink-0 place-items-center rounded-full border border-dark-pink/20 bg-white/50 text-dark-pink" onClick={closeForm} aria-label="Close form"><X size={20} aria-hidden="true" /></button>
                        </div>

                        <div className="form-step-motion min-h-0 overflow-y-auto p-0.5 [scrollbar-color:rgb(157_23_77/0.35)_transparent] scrollbar-thin" key={formStep}>
                            {formStep === 0 && (
                                <>
                                    <div className="mb-[clamp(1rem,2.3vw,1.5rem)] text-center">
                                        <h2 className="mx-auto max-w-none whitespace-nowrap font-compagnon text-[clamp(1.75rem,4vw,3rem)] font-medium leading-[0.96] max-[700px]:whitespace-normal max-[700px]:text-[clamp(1.65rem,8vw,2.25rem)]">Choose your favourite picture</h2>
                                        <p className="mx-auto mt-2 max-w-152 font-compagnon text-[clamp(0.82rem,1.4vw,1rem)] leading-tight text-[#be185d]"><span className="max-[700px]:block">A herculean task, I know.</span>{" "}<span className="max-[700px]:block">They are all so prettyyyyy.</span></p>
                                    </div>
                                    <fieldset className="m-0 min-w-0 border-0 p-0">
                                        <legend className="sr-only">Choose your favourite picture</legend>
                                        <div className="grid auto-cols-[clamp(11rem,22vw,14rem)] grid-flow-col gap-[clamp(1rem,2vw,1.5rem)] overflow-x-auto px-2 py-4 [scrollbar-color:rgb(157_23_77/0.38)_transparent] [scroll-snap-type:x_mandatory] max-[700px]:auto-cols-[min(62vw,13rem)]">
                                            {photoChoices.map((asset, index) => (
                                                <div className="aspect-4/5 snap-start" key={asset.source}>
                                                    <label className="relative block size-full cursor-pointer overflow-hidden rounded-2xl border-4 border-transparent bg-blush-pink transition data-[selected=true]:-translate-y-1 data-[selected=true]:scale-[0.985] data-[selected=true]:border-dark-pink data-[selected=true]:shadow-[0_11px_26px_rgb(99_17_58/0.28)]" data-selected={selectedPhoto === asset.source}>
                                                        <input className="absolute size-px opacity-0" type="radio" name="favourite-photo" value={asset.source} checked={selectedPhoto === asset.source} onChange={() => { setSelectedPhoto(asset.source); setError("") }} />
                                                        <img className="block size-full object-cover" src={asset.thumbnail} alt={`Photo option ${index + 1}`} loading="lazy" decoding="async" onError={(event) => { event.currentTarget.src = floralFallback }} />
                                                        <span className="absolute right-2 bottom-2 hidden items-center gap-1 rounded-full bg-dark-pink px-2.5 py-1.5 text-[0.62rem] font-semibold text-light-pink uppercase in-data-[selected=true]:flex"><Heart size={16} fill="currentColor" aria-hidden="true" /></span>
                                                    </label>
                                                </div>
                                            ))}
                                        </div>
                                        <p className="mt-2.5 text-center text-xs text-dark-pink max-[700px]:text-[0.68rem]">Scroll to see them all, then choose the one that wins your heart.</p>
                                    </fieldset>
                                </>
                            )}

                            {formStep === 1 && (
                                <>
                                    <div className="mb-[clamp(1rem,2.3vw,1.5rem)] text-center">
                                        <h2 className="mx-auto max-w-152 font-compagnon text-[clamp(1.75rem,4vw,3rem)] font-medium leading-[0.96] max-[700px]:text-[clamp(1.65rem,8vw,2.25rem)]">A sweet message for the birthday girl</h2>
                                        <p className="mx-auto mt-2 max-w-152 font-compagnon text-[clamp(0.82rem,1.4vw,1rem)] leading-tight text-[#be185d]">Don your Shakespeare/Taylor Swift hat and write something amazing!</p>
                                    </div>
                                    <label className="mx-auto block max-w-xl">
                                        <span className="mb-2 block text-xs font-semibold text-dark-pink">Your masterpiece</span>
                                        <textarea className="block min-h-40 w-full resize-none rounded-2xl border border-dark-pink/20 bg-white/60 px-3.5 py-3 font-compagnon text-[clamp(1rem,1.8vw,1.15rem)] leading-snug text-[#831843] outline-none placeholder:text-[#831843]/55 focus:border-deep-pink focus:ring-3 focus:ring-deep-pink/15 max-[700px]:min-h-36" autoFocus value={message} onChange={(event) => { setMessage(event.target.value); setError("") }} maxLength={600} rows={7} placeholder="May this chapter be filled with…" />
                                        <small className="mt-1.5 block text-right text-[0.66rem] text-[#831843]/60">{message.length}/600</small>
                                    </label>
                                </>
                            )}

                            {formStep === 2 && (
                                <>
                                    <div className="mb-[clamp(1rem,2.3vw,1.5rem)] text-center">
                                        <h2 className="mx-auto max-w-152 font-compagnon text-[clamp(1.4rem,2.5vw,2rem)] font-medium leading-[1.02] max-[700px]:text-[clamp(1.65rem,8vw,2.25rem)] max-[700px]:leading-[0.96]">Give me a bucket list suggestion for the year ahead!</h2>
                                        <p className="mx-auto mt-2 max-w-152 font-compagnon text-[clamp(0.82rem,1.4vw,1rem)] leading-tight text-[#be185d]">Make it fun, wholesome, chaotic, or all three.</p>
                                    </div>
                                    <label className="mx-auto block max-w-xl">
                                        <span className="mb-2 block text-xs font-semibold text-dark-pink">Your brilliant suggestion</span>
                                        <textarea className="block min-h-40 w-full resize-none rounded-2xl border border-dark-pink/20 bg-white/60 px-3.5 py-3 font-compagnon text-[clamp(1rem,1.8vw,1.15rem)] leading-snug text-[#831843] outline-none placeholder:text-[#831843]/55 focus:border-deep-pink focus:ring-3 focus:ring-deep-pink/15 max-[700px]:min-h-36" autoFocus value={activity} onChange={(event) => { setActivity(event.target.value); setError("") }} maxLength={240} rows={6} placeholder="Take a class, plan a trip, start a silly tradition…" />
                                        <small className="mt-1.5 block text-right text-[0.66rem] text-[#831843]/60">{activity.length}/240</small>
                                    </label>
                                </>
                            )}

                            {formStep === 3 && (
                                <>
                                    <div className="mb-[clamp(1rem,2.3vw,1.5rem)] text-center">
                                        <h2 className="mx-auto max-w-152 font-compagnon text-[clamp(1.75rem,4vw,3rem)] font-medium leading-[0.96] max-[700px]:text-[clamp(1.65rem,8vw,2.25rem)]">Signing off</h2>
                                        <p className="mx-auto mt-2 max-w-152 font-compagnon text-[clamp(0.82rem,1.4vw,1rem)] leading-tight text-[#be185d]">What's your name? Or what do I know you as? Don't be vague, please.</p>
                                    </div>
                                    <label className="mx-auto block max-w-xl py-[clamp(1.5rem,5vw,3.5rem)]">
                                        <span className="mb-2 block text-xs font-semibold text-dark-pink">Signed with love by</span>
                                        <input className="block w-full rounded-2xl border border-dark-pink/20 bg-white/60 px-4 py-4 font-reglo text-[clamp(1.05rem,2vw,1.25rem)] text-[#831843] outline-none placeholder:text-[#831843]/55 focus:border-deep-pink focus:ring-3 focus:ring-deep-pink/15" autoFocus value={name} onChange={(event) => { setName(event.target.value); setError("") }} maxLength={60} placeholder="First name, nickname or full government name…" />
                                    </label>
                                </>
                            )}

                            {formStep === 4 && (
                                <>
                                    <div className="mb-[clamp(1rem,2.3vw,1.5rem)] text-center">
                                        <h2 className="mx-auto max-w-152 font-compagnon text-[clamp(1.75rem,4vw,3rem)] font-medium leading-[0.96] max-[700px]:text-[clamp(1.65rem,8vw,2.25rem)]">One last look</h2>
                                        <p className="mx-auto mt-2 max-w-152 font-compagnon text-[clamp(0.82rem,1.4vw,1rem)] leading-tight text-[#be185d]">Review your entry before sending all that love my way.</p>
                                    </div>
                                    <section className="mx-auto grid max-w-184 grid-cols-[minmax(10rem,0.75fr)_minmax(0,1.25fr)] gap-4 rounded-3xl border border-dark-pink/15 bg-white/40 p-3 max-[700px]:grid-cols-1">
                                        <div className="aspect-4/5 w-full max-w-[18rem] self-start overflow-hidden rounded-2xl border-4 border-dark-pink bg-dark-pink max-[700px]:mx-auto max-[700px]:max-w-60">
                                            <img className="block size-full object-cover" src={selectedPhoto} alt="Your selected favourite" onError={(event) => { event.currentTarget.src = floralFallback }} />
                                        </div>
                                        <div className="min-w-0 space-y-4 p-2">
                                            <div>
                                                <p className="mb-1 text-[0.62rem] font-bold tracking-widest text-[#be185d] uppercase">Your message</p>
                                                <p className="font-compagnon text-lg leading-snug not-italic">{message}</p>
                                            </div>
                                            <div className="rounded-2xl border border-dark-pink/15 bg-light-pink/50 p-3">
                                                <p className="mb-1 text-[0.62rem] font-bold tracking-widest text-[#be185d] uppercase">For the bucket list</p>
                                                <p className="font-compagnon text-base leading-snug not-italic">{activity}</p>
                                            </div>
                                            <p className="font-reglo text-sm tracking-[0.06em] text-dark-pink uppercase">— {name}</p>
                                        </div>
                                    </section>
                                </>
                            )}
                        </div>

                        {error && (
                            <p id="message-form-error" className="form-step-motion mt-3 flex items-start gap-2.5 rounded-xl border border-white/70 bg-[#831843] px-3.5 py-3 font-compagnon text-sm font-medium not-italic leading-snug text-white shadow-[0_8px_22px_rgb(99_17_58/0.3)]" role="alert">
                                <CircleAlert className="mt-0.5 shrink-0" size={18} strokeWidth={2.4} aria-hidden="true" />
                                <span>{error}</span>
                            </p>
                        )}
                        <div className="mt-4 flex justify-end gap-2.5">
                            {formStep > 0 && (
                                <button type="button" className="flex shrink-0 items-center justify-center gap-1.5 rounded-full border border-dark-pink/25 bg-white/45 px-4 py-3 font-compagnon text-sm font-medium not-italic text-dark-pink" onClick={() => { setError(""); setFormStep((current) => current - 1) }}>
                                    <ArrowLeft size={17} aria-hidden="true" /> Back
                                </button>
                            )}
                            <button
                                type="submit"
                                className="flex flex-1 items-center justify-center gap-2 rounded-full border-0 bg-dark-pink px-4 py-3 font-compagnon text-sm font-medium not-italic text-light-pink transition data-[complete=false]:cursor-not-allowed data-[complete=false]:bg-dark-pink/35 data-[complete=false]:text-dark-pink/55 data-[complete=false]:shadow-inner"
                                data-complete={isCurrentStepComplete}
                                disabled={isSubmitting}
                                aria-disabled={!isCurrentStepComplete || isSubmitting}
                                aria-describedby={error ? "message-form-error" : undefined}
                                onClick={(event) => {
                                    if (isCurrentStepComplete || isSubmitting) return
                                    event.preventDefault()
                                    setError(FORM_STEP_ERRORS[formStep] ?? "Complete this step before continuing.")
                                }}
                            >
                                {formStep === 4
                                    ? <>{isSubmitting ? "Sending…" : "Send some love"} <Send size={17} aria-hidden="true" /></>
                                    : <>Continue <span aria-hidden="true">→</span></>}
                            </button>
                        </div>
                    </form>
                </div>
            )}
        </main>
    )
}
