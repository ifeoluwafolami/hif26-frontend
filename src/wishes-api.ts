export type RemoteWish = {
    id: string
    name: string
    message: string
    activity: string
    imageId: string
    createdAt: string
}

export type NewRemoteWish = Pick<RemoteWish, "name" | "message" | "activity" | "imageId">

const configuredApiUrl = import.meta.env.VITE_API_URL?.trim()
const apiRoot = configuredApiUrl ? configuredApiUrl.replace(/\/+$/, "") : ""
const wishesEndpoint = `${apiRoot}/api/wishes`

const readResponse = async <T>(response: Response): Promise<T> => {
    const body = await response.json() as T & { error?: string }
    if (!response.ok) {
        throw new Error(body.error ?? "The wish service is unavailable.")
    }
    return body
}

export const fetchWishes = async () => {
    const response = await fetch(wishesEndpoint, {
        headers: { accept: "application/json" },
    })
    const body = await readResponse<{ wishes: RemoteWish[] }>(response)
    return body.wishes
}

export const createWish = async (wish: NewRemoteWish) => {
    const response = await fetch(wishesEndpoint, {
        method: "POST",
        headers: {
            accept: "application/json",
            "content-type": "application/json",
        },
        body: JSON.stringify(wish),
    })
    const body = await readResponse<{ wish: RemoteWish }>(response)
    return body.wish
}
