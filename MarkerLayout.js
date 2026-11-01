.pragma library

function smooth(t) {t=Math.max(0,Math.min(1,t));return t*t*(3-2*t)}
function nearest(points,target) {
    return points.reduce((best,p)=>!best || Math.hypot(p.x-target.x,p.y-target.y)<Math.hypot(best.x-target.x,best.y-target.y)?p:best,null)
}
function move(from,to,t,id) {
    const p=smooth(t)
    return Object.assign({},to,{id:id || to.id,
        x:from.x+(to.x-from.x)*p,y:from.y+(to.y-from.y)*p,
        anchorX:from.x+(to.x-from.x)*p,anchorY:from.y+(to.y-from.y)*p,
        alpha:(from.alpha || 0)+((to.alpha || 0)-(from.alpha || 0))*p,
        scaleX:1,scaleY:1,angle:0,air:0,pulseAge:-1,trail:[]})
}
function frame(from,targets,age,duration) {
    if(!targets.length)return []
    if(!from.length || age>=duration)return targets
    const t=Math.max(0,age/Math.max(.01,duration))
    if(from.length>targets.length) {
        // Render the arriving sources only, never a second bead at the target.
        return from.map(source=>{
            const target=targets.find(p=>p.id===source.id) || nearest(targets,source)
            return move(source,target,t,source.id)
        })
    }
    return targets.map(target=>{
        const source=from.find(p=>p.id===target.id) || nearest(from,target)
        return move(source,target,t,target.id)
    })
}
