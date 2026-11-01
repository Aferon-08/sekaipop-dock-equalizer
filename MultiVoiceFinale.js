.pragma library
.import "LyricsEnd.js" as End
.import "MultiVoiceMath.js" as Voices

function finish(bounds) { return bounds.end + (bounds.precise ? .6 : 1.5) }
function mergeAmount(bounds,time) {
    return Voices.smooth((time-finish(bounds)-2.4)/1.1)
}
function regions(events,time,width,gap,transition,bounds) {
    const base=Voices.frame(events,Math.min(time,finish(bounds)),width,gap,transition)
    const amount=mergeAmount(bounds,time)
    if(!amount)return base
    const visible=base.map((r,i)=>r.opacity>.5?i:-1).filter(i=>i>=0)
    if(!visible.length)return base
    const owner=visible.length%2?visible[Math.floor(visible.length/2)]:visible[0]
    return base.map((r,i)=>Object.assign({},r,{
        x:r.x+((i===owner?gap/2:width/2)-r.x)*amount,
        width:r.width+((i===owner?width-gap:0)-r.width)*amount,
        opacity:r.opacity*(i===owner?1:1-Voices.smooth(Math.max(0,(amount-.3)/.7))),
        owner:owner,previousOwner:r.owner,phase:amount,
        first:visible[0],last:visible[visible.length-1],members:visible
    }))
}
function state(voices,members,document,time,duration,enabled) {
    const ids=(members || []).map(i=>voices[i] && voices[i].id)
    let lines=[]
    for(const i of (members || []))if(voices[i])lines=lines.concat(voices[i].lines)
    // Short backing phrases belong to the host's branch and must finish too.
    lines=lines.concat(((document || {}).lines || []).filter(l=>l.role==='backing' && ids.indexOf(l.hostVoiceId)>=0))
    const bounds=End.bounds(lines,duration)
    const frame=End.frame(bounds,time,duration,enabled?null:{timelineComplete:false})
    return {ended:frame.ended,phase:frame.phase,
        amount:frame.ended?Voices.smooth((time-finish(bounds))/.45):0}
}
