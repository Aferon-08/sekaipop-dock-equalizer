.pragma library
function clamp(x) { return Math.max(0,Math.min(1,x)) }
function smooth(x) { x=clamp(x);return x*x*(3-2*x) }
function mix(a,b,p) { return {x:a.x+(b.x-a.x)*p,y:a.y+(b.y-a.y)*p,alpha:1,scale:1,rotation:0} }
function arc(a,b,p,height) { const r=mix(a,b,smooth(p));r.y-=Math.sin(Math.PI*clamp(p))*height;return r }
function sample(scene,age,targets) {
    if(!scene || !targets.length)return []
    const stage=scene.stage, origin=scene.from[0] || stage
    if(scene.kind==="split") {
        if(age<.34)return [arc(origin,stage,age/.34,15)]
        if(age<.9){
            const t=(age-.34)/.56,shake=Math.sin(t*Math.PI*10)*Math.sin(Math.PI*t)
            const r=mix(stage,stage,0);r.x+=shake*7;r.y-=Math.sin(t*Math.PI)*3
            r.scale=1+.13*Math.abs(shake);r.rotation=shake*27;return [r]
        }
        if(age<1.04){const r=mix(stage,stage,0);r.scale=1+.25*Math.sin((age-.9)/.14*Math.PI);return[r]}
        return targets.map((target,i)=>{
            const t=clamp((age-1.04-i*.045)/.55), r=arc(stage,target,t*t,12+i*3)
            r.scale=(.72+.28*smooth(t))*(1+.10*Math.sin(t*Math.PI*3)*(1-t))
            r.rotation=30*(1-t)*(i%2?1:-1);return r
        })
    }
    if(scene.kind==="merge") {
        if(age<.5)return scene.from.map((point,i)=>{
            const r=arc(point,stage,age/.5,12);r.x+=Math.sin(age*18+i*2)*3*(age/.5);return r
        })
        if(age<.72){const r=mix(stage,stage,0);r.scale=1+.24*Math.sin((age-.5)/.22*Math.PI);return[r]}
        const t=clamp((age-.72)/.50),r=arc(stage,targets[0],t,22)
        r.x+=Math.sin(t*Math.PI*2)*7*(1-t);r.scale=1+.12*Math.sin(t*Math.PI*2)*(1-t);return[r]
    }
    return targets.map((target,i)=>arc(scene.from[i] || origin,target,age/.4,8))
}
