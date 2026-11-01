.pragma library
.import "LyricsMath.js" as LM

// Unlike the stock karaoke parser, keep close headings and simultaneous lyrics
// as separate events. Otherwise a heading can absorb its first sung phrase.
function rawLines(text) {
    const result = [], offsetMatch = String(text).match(/\[offset:([+-]?\d+)\]/i)
    const offset = offsetMatch ? Number(offsetMatch[1]) / 1000 : 0
    for (const raw of String(text).split(/\r?\n/)) {
        const stamp = /\[(\d+):(\d{1,2})(?:[.:](\d{1,3}))?\]/g
        const times = []; let m
        while ((m = stamp.exec(raw)) !== null) times.push(Math.max(0, LM.parseTime(m[1], m[2], m[3]) + offset))
        const bg = raw.match(/\[bg:\s*([^\]]*)\]/i)
        let body = raw.replace(/\[(\d+):(\d{1,2})(?:[.:](\d{1,3}))?\]/g, "")
            .replace(/\[[A-Za-z][\w-]*:[^\]]*\]/g, "").trim()
        if (/^[\[({（](?:chorus|verse\s*\d*|intro|outro|bridge|instrumental|background vocals?|backing vocals?|бэк(?:-вокал)?|куплет\s*\d*|припев)[\])}）]$/i.test(body)) body = ""
        const parsed = LM.readBody(body)
        if(bg && !parsed.text){parsed.text=bg[1].trim();parsed.adlib=true}
        else if(bg)parsed.bg={t:times[0] || 0,text:bg[1].trim()}
        if (parsed.end < 0) delete parsed.end
        else parsed.end += offset
        parsed.marks = (parsed.marks || []).map(mark => ({ cs: mark.cs, t: mark.t + offset }))
        for (const time of times) {
            const shift = time - times[0]
            const line = Object.assign({}, parsed, { t: time,
                marks: (parsed.marks || []).map(mark => ({ cs: mark.cs, t: Math.max(0, mark.t + shift) })) })
            if (parsed.end !== undefined) line.end = Math.max(time, parsed.end + shift)
            result.push(line)
        }
    }
    return result.sort((a, b) => a.t - b.t)
}

function label(text) {
    const match = String(text || "").trim().match(/^([^\[\]<>\n:：]{1,48})\s*[:：]\s*$/)
    if (!match) return ""
    const name = match[1].trim()
    return /^(verse\s*\d*|chorus|pre[- ]?chorus|bridge|intro|outro|instrumental|куплет\s*\d*|припев|проигрыш|бэк(?:-вокал)?|back(?:ing|ground) vocals?)$/i.test(name) ? "" : name
}
function isAll(name) { return /^(all|everyone|together|ensemble|все|вместе|хор)$/i.test(name) }

// Named source headings are evidence. Parentheses alone do not identify a singer.
function fromLines(lines, duration) {
    const names = [], voices = [], clean = []
    for (const line of lines) {
        const name = label(line.text)
        if (name && !isAll(name) && !names.some(n => n.toLowerCase() === name.toLowerCase())) names.push(name)
    }
    if (names.length < 2 || names.length > 12) return { voices: [], lines: lines, duration: duration }
    names.forEach((name, index) => voices.push({ id: "v" + (index + 1), label: name, lines: [] }))
    const unknown = { id: "unassigned", label: "Неопределённая партия", lines: [] }
    let current = []
    for (let i = 0; i < lines.length; ++i) {
        const source = lines[i], name = label(source.text)
        if (name) {
            current = isAll(name) ? voices.map(v => v.id)
                : [voices[names.findIndex(n => n.toLowerCase() === name.toLowerCase())].id]
            continue
        }
        if (!String(source.text || "").trim()) continue
        const backing = source.adlib || /^[（(]/.test(source.text)
        const ids = backing || !current.length ? [unknown.id] : current.slice()
        const next = lines.slice(i + 1).find(l => l.t > source.t)
        const line = Object.assign({}, source, { voiceIds: ids, unisonId: ids.length > 1 ? "annotation-all-" + i : "" })
        if (!isFinite(line.end) || line.end <= line.t) {
            line.endEstimated = true
            line.end = next ? next.t : Math.max(line.t + 0.1, duration || line.t + 4)
        }
        clean.push(line)
        for (const id of ids) (id === unknown.id ? unknown : voices.find(v => v.id === id)).lines.push(line)
        if (source.bg && source.bg.text) {
            const bg = { t: source.bg.t, text: source.bg.text, adlib: true, voiceIds: [unknown.id] }
            bg.end = next ? next.t : Math.max(bg.t + 0.1, duration || bg.t + 4)
            unknown.lines.push(bg); clean.push(bg)
        }
    }
    if (unknown.lines.length) voices.push(unknown)
    return { voices: voices, lines: clean.sort((a, b) => a.t - b.t), duration: duration,
        multivoice: { source: "lyrics-annotations", reviewRequired: true } }
}
