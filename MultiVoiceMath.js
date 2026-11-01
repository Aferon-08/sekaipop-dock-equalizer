.pragma library

// Geometry depends on song time, including the transition itself. Seeking is
// deterministic and pausing cannot leave an independent animation running.
function clamp(x, a, b) { return Math.max(a, Math.min(b, x)) }
function smooth(x) { x = clamp(x, 0, 1); return x * x * (3 - 2 * x) }
function spring(x) {
    x = clamp(x, 0, 1)
    // Finite OutBack: ~3.7% overshoot, then a real return to the exact endpoint.
    // Sampling song time keeps this recoil frozen while the song is paused.
    const t = x - 1
    return 1 + 2 * t * t * t + t * t
}
function ids(line) {
    if (Array.isArray(line.voiceIds)) return line.voiceIds.map(String)
    if (Array.isArray(line.voices)) return line.voices.map(String)
    return [String(line.voiceId || line.voice || "lead")]
}
function normalize(document) {
    if (!document) return []
    var result = [], lookup = {}, source = document.voices || []
    for (var v of source) {
        var id = String(typeof v === "string" ? v : v.id)
        if (!id || lookup[id] !== undefined) continue
        lookup[id] = result.length
        result.push({ id: id, label: v.label || v.name || id, color: v.color || "", lines: (v.lines || []).slice() })
    }
    for (var line of (result.some(v => v.lines.length > 0) ? [] : (document.lines || []))) {
        var owners = ids(line)
        for (var owner of owners) {
            if (lookup[owner] === undefined) {
                lookup[owner] = result.length
                result.push({ id: owner, label: owner, color: "", lines: [] })
            }
            result[lookup[owner]].lines.push(Object.assign({}, line, {
                // A shared source phrase is an explicit unison declaration.
                unisonId: line.unisonId || line.unison || (owners.length > 1 ? "shared:" + line.t + ":" + line.text : "")
            }))
        }
    }
    result.forEach((voice,index)=>{
        if (!voice.label || voice.label===voice.id || /неопредел|общий вокал|вокальная партия/i.test(voice.label))
            voice.label="Голос "+(index+1)
        voice.lines=voice.lines.filter(l=>l.role!=="backing").sort((a,b)=>a.t-b.t)
    })
    return result.filter(v=>v.lines.length)

}
function activeLine(voice, time) {
    var lines = voice.lines || []
    for (var i = lines.length - 1; i >= 0; --i) {
        var l = lines[i]
        if (l.t <= time && time < l.end && String(l.text || "").trim()) return l
        // Keep the partition through a short phrase breath, then reevaluate at
        // the next phrase's exact boundary. This never delays a divergent word.
        var next = lines[i + 1]
        if (l.t <= time && next && time >= l.end && time < next.t
            && next.t - l.end <= 0.28 && String(l.text || "").trim()) return l
    }
    return null
}
function equivalent(a, b) {
    if (!a || !b) return false
    var key = a.unisonId || a.unison || ""
    if (!key || key !== (b.unisonId || b.unison || "")) return false
    if (String(a.text).trim() !== String(b.text).trim()) return false
    if (Math.abs(a.t - b.t) > 0.06 || Math.abs(a.end - b.end) > 0.06) return false
    var aa = a.wordSpans || [], bb = b.wordSpans || []
    if (aa.length !== bb.length) return false
    for (var i = 0; i < aa.length; ++i)
        if (Math.abs(aa[i].from - bb[i].from) > 0.06 || Math.abs(aa[i].to - bb[i].to) > 0.06) return false
    return true
}
function topology(voices, time, previousShape, reserved) {
    var result = [], n = voices.length, active = []
    for (var i = 0; i < n; ++i) {
        var line = activeLine(voices[i], time)
        if (line) active.push({ index: i, line: line })
        result.push({ first: i, last: i, owner: i, visible: 0, left: 0.5, span: 0, members: [i] })
    }
    if (!active.length && previousShape) return previousShape
    // Reserve a section cast, but let a real shared phrase merge.
    var shared = active.length > 1 && active.every(v => equivalent(active[0].line, v.line))
    if (!shared) for (var index of (reserved || []))
        if (!active.some(v => v.index === index)) active.push({ index: index, line: null })
    active.sort((a, b) => a.index - b.index)
    for (var i = 0; i < n; ++i)
        if (!result[i].visible) result[i].left = active.length ? active.filter(v => v.index < i).length / active.length : 0
    if (!active.length && n) {
        // Silence is not a singer change. Keep the last partition (including
        // a shared phrase) until a voice actually starts its next line.
        if (previousShape) return previousShape
        var resting = n % 2 ? Math.floor(n / 2) : 0
        result[resting] = { first: resting, last: resting, owner: resting, visible: 1,
            left: 0, span: 1, members: [resting] }
        return result
    }
    var at = 0
    while (at < active.length) {
        var end = at
        while (end + 1 < active.length && equivalent(active[at].line, active[end + 1].line)) ++end
        var members = active.slice(at, end + 1).map(v => v.index), count = members.length
        var owner = count % 2 ? members[Math.floor(count / 2)] : members[0]
        for (var j of members) result[j] = {
            first: members[0], last: members[members.length - 1], members: members,
            owner: owner, visible: j === owner ? 1 : 0,
            left: at / active.length, span: count / active.length }
        at = end + 1
    }
    return result
}
function key(topology) {
    return topology.map(r => r.owner + ":" + r.visible + ":" + r.left + ":" + r.span).join("|")
}
function exchangeSections(voices) {
    var starts = []
    voices.forEach((voice,index) => {
        for (var line of voice.lines)
            if (String(line.text || "").trim() && isFinite(line.t) && line.end > line.t)
                starts.push({ t:line.t, end:line.end, index:index })
    })
    starts.sort((a,b)=>a.t-b.t)
    var phrases=[]
    for (var start of starts) {
        var last=phrases[phrases.length-1]
        if (last && start.t-last.t<.06) {
            if (last.members.indexOf(start.index)<0) last.members.push(start.index)
            last.end=Math.max(last.end,start.end)
        } else phrases.push({t:start.t,end:start.end,members:[start.index]})
    }
    // Plan solo releases using the whole timeline. Brief replies and silence
    // cannot close a cast that has already introduced its singers.
    var releases=[]
    for (var i=0;i<phrases.length;) {
        var first=phrases[i], j=i+1, sung=first.end-first.t, end=first.end
        if (first.members.length!==1) {++i;continue}
        while (j<phrases.length && phrases[j].members.length===1
            && phrases[j].members[0]===first.members[0] && phrases[j].t-end<8) {
            sung+=Math.max(0,phrases[j].end-Math.max(end,phrases[j].t))
            end=Math.max(end,phrases[j].end);++j
        }
        var next=j<phrases.length?phrases[j].t:Infinity
        if (end-first.t>=18 && sung>=12 && next-first.t>=28)
            releases.push({t:first.t+18,index:first.members[0]})
        i=j
    }
    var boundaries=phrases.map(p=>({t:p.t,phrase:p})).concat(releases)
    boundaries.sort((a,b)=>a.t-b.t)
    var roster=[], sections=[]
    for (var entry of boundaries) {
        if (entry.phrase) for(var id of entry.phrase.members) {
            if(roster.indexOf(id)<0)roster.push(id)
        }
        else roster=[entry.index]
        roster.sort((a,b)=>a-b)
        var prev=sections[sections.length-1]
        if(prev && prev.members.join(",")===roster.join(","))continue
        if(prev)prev.end=entry.t
        sections.push({t:entry.t,end:Infinity,members:roster.slice()})
    }
    return sections
}
function build(voices) {
    var stamps = [0]
    var sections = exchangeSections(voices)
    for (var section of sections) { stamps.push(section.t); if (isFinite(section.end)) stamps.push(section.end) }
    for (var voice of voices) for (var line of voice.lines) {
        if (isFinite(line.t)) stamps.push(line.t)
        if (isFinite(line.end)) stamps.push(line.end)
    }
    stamps.sort((a, b) => a - b)
    var events = [], last = ""
    for (var t of stamps) {
        if (events.length && Math.abs(t - events[events.length - 1].t) < 0.00001) continue
        var shape = topology(voices, t + 0.000001,
            events.length ? events[events.length - 1].regions : null,
            (sections.find(s => s.t <= t && t < s.end) || {}).members), k = key(shape)
        if (k === last) continue
        events.push({ t: t, regions: shape }); last = k
    }
    return events
}
function baseGeometry(shape, index, width, gap) {
    var n = shape.length, slot = width / Math.max(1, n), r = shape[index]
    if (!r) return { x: 0, width: width, opacity: 0 }
    var x = r.left * width + gap / 2, w = r.span * width - gap
    // Absorbed regions converge on the stable owner's center, rather than
    // sliding behind a different singer's text.
    if (index !== r.owner) { x += index < r.owner ? 0 : w; w = 0 }
    return { x: x, width: Math.max(0, w), opacity: r.visible, owner: r.owner, first: r.first, last: r.last, members: r.members }
}
function frame(events, time, width, gap, duration) {
    if (!events.length) return []
    var k = 0
    while (k + 1 < events.length && events[k + 1].t <= time) ++k
    var current = events[k], previous = k > 0 ? events[k - 1] : current
    // Transition ends before the next phrase, preventing short unison passages
    // from leaving a half-merged region when the voices have already diverged.
    var room = k + 1 < events.length ? events[k + 1].t - current.t : duration
    var length = Math.max(0.02, Math.min(duration, room * 0.7))
    var f = k > 0 ? clamp((time - current.t) / length, 0, 1) : 1
    var p = spring(f), a = smooth(f), result = []
    for (var i = 0; i < current.regions.length; ++i) {
        var from = baseGeometry(previous.regions, i, width, gap)
        var to = baseGeometry(current.regions, i, width, gap)
        result.push({ x: from.x + (to.x - from.x) * p,
            width: Math.max(0, from.width + (to.width - from.width) * p),
            opacity: from.opacity + (to.opacity - from.opacity) * a,
            owner: to.owner, previousOwner: from.owner, first: to.first, last: to.last, members: to.members, phase: f })
    }
    return result
}
