.pragma library
.import "LyricsTimeline.js" as Timeline
function bounds(lines,duration) {
    if(!lines || !lines.length)return {end:Infinity,precise:false}
    var end=0,precise=true
    const timeline=Timeline.build(lines.map(l=>{
        if(!l.endEstimated)return l
        const copy=Object.assign({},l);delete copy.end;return copy
    }),duration)
    for(const line of timeline){
        if(!String(line.text || "").trim())continue
        const spans=line.wordSpans || []
        const last=spans.length?Math.max(...spans.map(s=>s.to)):line.end
        if(!isFinite(last))return {end:Infinity,precise:false}
        end=Math.max(end,last)
        if(!spans.length)precise=false
    }
    return {end:end,precise:precise}
}
function frame(bounds,position,duration,analysis) {
    if(analysis && analysis.timelineComplete===false)return {ended:false,phase:0}
    const finish=bounds.end+(bounds.precise ? .6 : 1.5)
    const ended=isFinite(finish) && position>=finish
    const start=duration>0?Math.max(finish+.4,duration-Math.min(10,duration*.05)):Infinity
    return {ended:ended,phase:ended?Math.max(0,Math.min(1,(position-start)/.95)):0}
}
