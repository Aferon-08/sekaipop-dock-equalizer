.pragma library
function normalized(text) { return String(text || "").toLowerCase().replace(/[^\p{L}\p{N}]+/gu," ").trim() }
function project(document,source,duration) {
    const lines=(document.lines || []).map(l=>Object.assign({},l))
    for(const line of lines)if(!(line.end>line.t)) {
        const next=lines.filter(l=>l.t>line.t).sort((a,b)=>a.t-b.t)[0]
        line.end=next?next.t:Math.max(line.t+.1,duration || line.t+4)
        line.endEstimated=true
    }
    for(const raw of (source || [])) {
        const bg=raw.bg || (raw.adlib ? raw : null)
        if(!bg || !String(bg.text || "").trim())continue
        const t=bg.t ?? raw.t
        const host=lines.filter(l=>l.role!=="backing" && l.t<=t+.15 && l.end>t-.3 && normalized(l.text)!==normalized(bg.text))
            .sort((a,b)=>String(b.text).length-String(a.text).length)[0]
        if(!host)continue
        const match=lines.find(l=>Math.abs(l.t-t)<.35 && normalized(l.text)===normalized(bg.text))
        if(match){match.role="backing";match.hostVoiceId=(host.voiceIds || [])[0] || ""}
        else lines.push({t:t,end:Math.min(host.end,t+2.8,duration || Infinity),text:bg.text,
            voiceIds:(host.voiceIds || []).slice(),hostVoiceId:(host.voiceIds || [])[0] || "",role:"backing",lineOnly:true})
    }
    for(const line of lines) {
        if(line.role==='backing' || (line.voiceIds || []).length>1)continue
        const words=normalized(line.text).split(' ').filter(Boolean)
        if(!words.length || words.length>5 || !(line.end>line.t) || line.end-line.t>2.8)continue
        const host=lines.filter(other=>other!==line && other.role!=='backing'
            && other.t<=line.t+.15 && other.end>line.t+.25
            && normalized(other.text).split(' ').length>=Math.max(words.length+2,words.length*1.5))
            .find(other=>{
                const main=normalized(other.text).split(' ')
                return words.every(w=>main.indexOf(w)>=0)
                    && ((line.voiceIds || []).join(',')!==(other.voiceIds || []).join(',') || line.adlib)
            })
        if(host){line.role='backing';line.hostVoiceId=(host.voiceIds || [])[0] || "";line.backingEstimated=true}
    }
    // Rebuild voice line lists so backing-only singers do not reserve panels.
    return Object.assign({},document,{lines:lines.sort((a,b)=>a.t-b.t),voices:(document.voices || []).map(v=>
        Object.assign({},v,{lines:lines.filter(l=>(l.voiceIds || []).indexOf(v.id)>=0)}))})
}
function forMembers(lines,voices,members) {
    const ids=(members || []).map(i=>voices[i] && voices[i].id)
    return (lines || []).filter(l=>l.role==='backing' && ids.indexOf(l.hostVoiceId)>=0)
}
