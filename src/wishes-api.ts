export type RemoteWish = {
    id: string
    name: string
    message: string
    activity: string
    imageId: string
    createdAt: string
}

export type NewRemoteWish = Pick<RemoteWish, "name" | "message" | "activity" | "imageId">

const editTokenStorageKey = "hif26:wish-edit-tokens"

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
    return readResponse<{ wish: RemoteWish; editToken: string }>(response)
}

export const updateWish = async (id: string, wish: NewRemoteWish, editToken: string) => {
    const response = await fetch(`${wishesEndpoint}/${encodeURIComponent(id)}`, {
        method: "PATCH",
        headers: {
            accept: "application/json",
            authorization: `Bearer ${editToken}`,
            "content-type": "application/json",
        },
        body: JSON.stringify(wish),
    })
    const body = await readResponse<{ wish: RemoteWish }>(response)
    return body.wish
}

export const deleteWish = async (id: string, editToken: string) => {
    const response = await fetch(`${wishesEndpoint}/${encodeURIComponent(id)}`, {
        method: "DELETE",
        headers: { authorization: `Bearer ${editToken}` },
    })
    if (!response.ok) await readResponse<never>(response)
}

const readEditTokens = (): Record<string, string> => {
    try {
        const stored = window.localStorage.getItem(editTokenStorageKey)
        return stored ? JSON.parse(stored) as Record<string, string> : {}
    } catch {
        return {}
    }
}

export const getWishEditToken = (id: string) => readEditTokens()[id] ?? null

export const saveWishEditToken = (id: string, token: string) => {
    try {
        window.localStorage.setItem(editTokenStorageKey, JSON.stringify({
            ...readEditTokens(),
            [id]: token,
        }))
    } catch {
        // Editing is unavailable when browser storage is disabled.
    }
}

export const removeWishEditToken = (id: string) => {
    try {
        const tokens = readEditTokens()
        delete tokens[id]
        window.localStorage.setItem(editTokenStorageKey, JSON.stringify(tokens))
    } catch {
        // The server still enforces the editing window if cleanup fails.
    }
}
