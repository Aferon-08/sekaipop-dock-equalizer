.pragma library

var revision = 3
function identity(track) {
    const url = String(track.url || "")
    const spotify = url.match(/(?:spotify:track:|open\.spotify\.com\/(?:intl-[^/]+\/)?track\/)([A-Za-z0-9]{22})/)
    if (spotify) return "spotify:" + spotify[1]
    const video = url.match(/(?:[?&]v=|youtu\.be\/|\/shorts\/|\/embed\/)([A-Za-z0-9_-]{11})(?:[^A-Za-z0-9_-]|$)/)
    if (video && /^https?:\/\/(?:www\.|m\.|music\.)?(?:youtube\.com|youtu\.be)\//i.test(url)) return "youtube:" + video[1]
    return url || [track.artist, track.title, Math.round(track.duration || 0)].join("\u241f")
}
function signature(text) {
    let hash = 2166136261
    const normalized = String(text || "").trim().replace(/\r/g, "")
    for (let i = 0; i < normalized.length; ++i) hash = Math.imul(hash ^ normalized.charCodeAt(i), 16777619)
    return (hash >>> 0).toString(16)
}
function needed(result, multivoice, source, modelsReady) {
    if (!result || result.status === "error") return false
    if (result.status === "missing") return true
    if (!multivoice) return false
    const a = result.analysis || {}
    // An uncertain completed attempt is distinct from an unattempted stage.
    // No automatic retry loop: manual calculation or a new revision can retry.
    return a.revision !== revision || (source !== null && String(source || "").trim() !== "" && a.sourceSignature !== signature(source))
        || a.voices === "disabled" || (a.voices === "unavailable" && modelsReady===true)
}
