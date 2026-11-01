.pragma library
.import "LyricsMath.js" as LM

function units(text) {
    var measured = LM.lineUnits(text)
    if (measured > 0)
        return measured
    // The upstream estimator counts Latin/CJK syllables. A Cyrillic lyric
    // must not become a 400 ms line and an invented instrumental break.
    var vowels = String(text).match(/[аеёиоуыэюяіїє]/gi)
    return vowels ? vowels.length : Math.max(LM.tokens(text).length,
        String(text).replace(/\s/g, "").length / 3)
}

function sungEnd(line, next, rate) {
    if (line.imported && line.end > line.t) return line.end
    var room = next - line.t
    var known = line.end > line.t ? line.end - line.t : undefined
    var span = LM.sungSpan(line.text, room, rate, known)
    if (known === undefined && LM.lineUnits(line.text) <= 0) {
        var raw = units(line.text) / rate
        var want = (raw + 0.25) * 1.2
        span = isFinite(room) && room > 0 ? Math.min(room * 0.92, want) : want
        if (room < raw * LM.OVERLAP_BELOW)
            span = Math.max(span, Math.min(raw * 0.9, room + LM.MAX_OVERLAP))
        span = Math.max(span, Math.min(room, 0.4))
    }
    if (known === undefined && line.marks && line.marks.length > 0) {
        var last = line.marks[line.marks.length - 1]
        var tail = LM.tokens(line.text).map(function (token) { return token.s }).join("").slice(last.cs)
        var tailTime = tail ? Math.max(0.25, Math.min(1.2, units(tail) / rate * 1.2)) : 0
        span = Math.max(span, last.t - line.t + tailTime)
    }
    return line.t + span
}

// Keep the source timings. Like the desktop widget, estimate a sung duration
// only when the provider has not supplied an end stamp.
function build(lines, duration) {
    var result = []
    var rate = LM.songRate(lines)
    function append(line) {
        var previous = result[result.length - 1]
        if (previous && previous.text === "" && line.text === "") {
            previous.end = Math.max(previous.end, line.end)
        } else {
            result.push(line)
        }
    }
    if (lines.length > 0 && lines[0].t > 1.2)
        append({ t: 0, text: "", end: lines[0].t })
    for (var i = 0; i < lines.length; i++) {
        var source = lines[i]
        var next = i + 1 < lines.length ? lines[i + 1].t
            : duration > source.t ? duration : Infinity
        var blank = !String(source.text || "").trim()
        var end = blank ? (isFinite(next) ? next : source.t + 4)
            : sungEnd(source, next, rate)
        var line = Object.assign({}, source, { text: blank ? "" : source.text, end: end })
        append(line)
        // A short breath keeps its line; an instrumental gap gets a timed cue.
        if (!blank && isFinite(next) && next - end >= LM.GAP_MIN)
            append({ t: end + 0.5, text: "", end: next })
    }
    return result
}
