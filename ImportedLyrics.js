.pragma library
.import "LyricsMath.js" as LM

function toLrc(lines) {
    function stamp(t) {
        var ms = Math.round(Math.max(0, t) * 1000)
        return "[" + String(Math.floor(ms / 60000)).padStart(2, "0") + ":"
            + String(Math.floor(ms / 1000) % 60).padStart(2, "0") + "." + String(ms % 1000).padStart(3, "0") + "]"
    }
    return lines.map(line => stamp(line.t) + String(line.text || "").replace(/[\r\n]/g, " ")).join("\n")
}

// Keep the extractor's explicit ends: silence between words must not fill them.
// Match character ranges after the same tokenizer used by the visible text.
function convert(document) {
    var groups = {}, result = []
    for (var word of document.words) {
        const key = String(word.line) + ":" + (word.voiceIds || []).join(",")
        if (!groups[key]) groups[key] = []
        groups[key].push(word)
    }
    for (var id of Object.keys(groups)) {
        var words = groups[id], text = words.map(w => w.word).join(" ")
        var tokens = LM.tokens(text), ranges = [], count = 0
        for (var w of words) {
            var length = LM.tokens(w.word).map(t => t.s).join("").length
            if (length > 0) ranges.push({ cs: count, length: length, from: w.start, to: w.end })
            count += length
        }
        if (tokens.map(t => t.s).join("").length !== count || !ranges.length)
            throw new Error("Не удалось сопоставить слова JSON с текстом строки.")
        var offset = 0, spans = [], first = 0, last = 0
        for (var token of tokens) {
            var endOffset = offset + token.s.length
            while (first + 1 < ranges.length && offset >= ranges[first].cs + ranges[first].length) ++first
            while (last + 1 < ranges.length && endOffset > ranges[last].cs + ranges[last].length) ++last
            var a = ranges[first], b = ranges[last]
            if (!a || !b) throw new Error("Некорректные границы слова JSON.")
            spans.push({ from: a.from + (a.to - a.from) * (offset - a.cs) / a.length,
                to: b.from + (b.to - b.from) * (endOffset - b.cs) / b.length })
            offset = endOffset
        }
        result.push({ t: words[0].start, end: Math.max(...words.map(w => w.end)),
            text: text, wordSpans: spans, imported: true, adlib: words.every(w => w.voice === "backing"),
            voiceIds: words[0].voiceIds || [],
            role: words[0].role || "lead", hostVoiceId: words[0].hostVoiceId || "",
            unisonId: words[0].unisonId || "" })
    }
    for (const line of (document.fallbackLines || []))
        result.push({ t: line.t, end: line.end, text: line.text, voiceIds: line.voiceIds || [],
            unisonId: line.unisonId || "", role: line.role || "lead", hostVoiceId: line.hostVoiceId || "", lineOnly: true })
    return result.sort((a, b) => a.t - b.t)
}

function voices(document, lines) {
    return (document.voices || []).map(v => ({ id: v.id, label: v.label,
        lines: lines.filter(l => l.voiceIds && l.voiceIds.indexOf(v.id) >= 0) }))
}

// Preserve provider word marks when upgrading voice analysis. Other phrases stay
// explicitly line-timed; estimated word spans are never passed off as exact.
function reference(lines,duration,voices) {
    if(!(duration>0) || !lines.some(l=>l.marks && l.marks.length))return null
    const words=[],fallback=[]
    for(let i=0;i<lines.length;++i){
        const l=lines[i],text=String(l.text || "").trim()
        if(!text)continue
        const next=lines.slice(i+1).find(n=>n.t>l.t)
        const end=l.end>l.t?Math.min(duration,l.end):next?next.t:duration
        if(!(end>l.t))continue
        const tokens=LM.tokens(text),spans=l.marks && l.marks.length?LM.spansFor(tokens,l.t,end-l.t,l.marks):[]
        if(spans.length===tokens.length && spans.every(s=>s.to>s.from && s.from>=0 && s.to<=duration))
            tokens.forEach((token,k)=>words.push({word:token.s,start:spans[k].from,end:spans[k].to,line:i,
                voiceIds:l.voiceIds || [],voiceSource:"annotation",status:"estimated"}))
        else fallback.push({line:i,t:l.t,end:end,text:text,voiceIds:l.voiceIds || []})
    }
    return words.length?{words:words,fallbackLines:fallback,duration:duration,voices:voices || []}:null
}
