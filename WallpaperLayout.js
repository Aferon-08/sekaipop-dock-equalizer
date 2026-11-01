.pragma library
.import "GlassRoutes.js" as Routes
// Geometry is generated once in units of monitor height. Widget rectangles are a separate optional placement constraint.
function hash(text) {
    let h=2166136261
    for(let i=0;i<text.length;i++) h=Math.imul(h^text.charCodeAt(i),16777619)
    return h>>>0
}
// Conservative rotated envelopes include ambient drift. Using envelopes here
// also protects irregular shapes and moving edges without pixel sampling.
function envelope(o,pad) {
    const bx=o.w/2,by=o.h/2
    let rx=0,ry=0
    // Bound the real rounded/elliptical contour rather than its rotated
    // rectangular texture. The old texture bounds erased almost all overlaps.
    for(let i=-2;i<=2;i++){
        const angle=(o.angle+i)*Math.PI/180,c=Math.abs(Math.cos(angle)),s=Math.abs(Math.sin(angle))
        if(o.kind===0 || o.kind===3 || o.kind===4){
            const r=Math.min(bx,by)*(o.kind===3?1:.47)
            rx=Math.max(rx,(bx-r)*c+(by-r)*s+r)
            ry=Math.max(ry,(bx-r)*s+(by-r)*c+r)
        }else{
            const outer=o.kind===2?.95:o.kind===5?1.015:1
            rx=Math.max(rx,outer*Math.hypot(bx*c,by*s))
            ry=Math.max(ry,outer*Math.hypot(bx*s,by*c))
        }
    }
    // Cover the sub-degree extrema between samples as well as ambient drift.
    const slack=Math.hypot(bx,by)*.0001
    rx+=pad+slack;ry+=pad+slack
    return {x:o.x-rx,y:o.y-ry,width:2*rx,height:2*ry}
}
function intersection(a,b) {
    const x=Math.max(a.x,b.x),y=Math.max(a.y,b.y)
    return {x:x,y:y,width:Math.max(0,Math.min(a.x+a.width,b.x+b.width)-x),height:Math.max(0,Math.min(a.y+a.height,b.y+b.height)-y)}
}
function area(r){return r.width*r.height}
function inkOverlap(a,b){
    const r=intersection(envelope(a,0),envelope(b,0))
    if(area(r)<=0)return false
    for(let y=0;y<8;y++)for(let x=0;x<8;x++){
        const p={x:r.x+(x+.5)*r.width/8,y:r.y+(y+.5)*r.height/8}
        if(Routes.distance(a,p)<0 && Routes.distance(b,p)<0)return true
    }
    return false
}
function pack(shapes,bounds,widgets,rnd,pixelHeight) {
    const placed=[],boxes=[],guard=4/Math.max(240,pixelHeight || 1080)+.003
    const wantedPairs=Math.min(3,Math.max(1,Math.round(shapes.length/6)))
    let pairs=0
    function acceptable(o,b){
        const widgetBox=envelope(o,.022+guard)
        if(widgets.some(w=>area(intersection(widgetBox,w))>1e-10))return false
        const overlaps=[]
        for(let i=0;i<placed.length;i++){
            const common=intersection(b,boxes[i]),a=area(common)
            // Every supported SDF covers >40% of its unrotated w*h.
            // 18% is therefore a conservative <45% of either real shape,
            // below the requested 50%, with headroom for motion.
            if(a>.18*Math.min(o.w*o.h,placed[i].w*placed[i].h)+1e-10)return false
            if(a>1e-10)overlaps.push(common)
        }
        // No point can belong to three objects, even inside padded envelopes.
        for(let i=0;i<overlaps.length;i++)for(let j=0;j<i;j++)
            if(area(intersection(overlaps[i],overlaps[j]))>1e-10)return false
        return true
    }
    for(const original of shapes){
        let chosen=null
        // A bounded search: move first, then reduce size; omit an object when
        // there is still no valid space. A small monitor gets more size steps.
        const passes=pixelHeight && pixelHeight<800?8:6
        for(let pass=0;pass<passes && !chosen;pass++){
            const scale=Math.pow(.84,pass),o=Object.assign({},original,{w:original.w*scale,h:original.h*scale})
            const b=envelope(o,.035+guard),rx=b.width/2,ry=b.height/2
            if(2*rx>bounds.width || 2*ry>bounds.height)continue
            const minX=bounds.x+rx,maxX=bounds.x+bounds.width-rx,minY=bounds.y+ry,maxY=bounds.y+bounds.height-ry
            let best=Infinity
            // Deliberately compose a few lightly overlapping pairs. Uniform
            // random samples almost never land in that narrow valid region.
            if(pass===0 && pairs<wantedPairs){
                const centered=Object.assign({},o,{x:0,y:0}),phase=rnd()*Math.PI*2
                for(const buddy of placed){
                    if(Math.min(o.w*o.h,buddy.w*buddy.h)<.25*Math.max(o.w*o.h,buddy.w*buddy.h))continue
                    for(let j=0;j<24;j++){
                        const a=phase+j*Math.PI/12,ux=Math.cos(a),uy=Math.sin(a)
                        const port=Routes.surface(buddy,{x:buddy.x+ux,y:buddy.y+uy}),tip=Routes.surface(centered,{x:-ux,y:-uy})
                        const depth=.12*Math.min(o.w,o.h,buddy.w,buddy.h)
                        o.x=port.x-tip.x-ux*depth;o.y=port.y-tip.y-uy*depth
                        if(o.x<minX || o.x>maxX || o.y<minY || o.y>maxY)continue
                        const cost=Math.hypot(o.x-original.x,o.y-original.y)
                        if(cost<best && acceptable(o,envelope(o,guard)) && inkOverlap(o,buddy)){chosen=Object.assign({},o);best=cost}
                    }
                }
            }
            if(chosen)break
            for(let j=0;j<145;j++){
                const x=j===0?Math.max(minX,Math.min(maxX,original.x)):minX+rnd()*(maxX-minX)
                const y=j===0?Math.max(minY,Math.min(maxY,original.y)):minY+rnd()*(maxY-minY)
                const cost=Math.hypot(x-original.x,y-original.y)
                if(cost>=best)continue
                o.x=x;o.y=y
                if(acceptable(o,envelope(o,guard))){chosen=Object.assign({},o);best=cost;if(j===0)break}
            }
        }
        if(chosen){if(placed.some(o=>inkOverlap(o,chosen)))pairs++;placed.push(chosen);boxes.push(envelope(chosen,guard))}
    }
    return placed
}
function generate(seed,screen,aspect,density,glass,safe,widgets,pixelHeight) {
    let state=hash(String(seed)+":"+screen)
    function rnd(){state=(state+0x6D2B79F5)|0;let t=state;t=Math.imul(t^(t>>>15),t|1);t^=t+Math.imul(t^(t>>>7),t|61);return ((t^(t>>>14))>>>0)/4294967296}
    function between(a,b){return a+(b-a)*rnd()}
    const a=Math.max(.5,Math.min(5,aspect)), rich=density==="rich" || (density!=="calm" && rnd()>.5)
    const mode=Math.floor(rnd()*4), shapes=[], links=[]
    let centers=mode===0?[[a*.72,.51]]:mode===1?[[a*.17,.56],[a*.83,.42]]:mode===2?[[a*.51,.5]]:[[a*.31,.64],[a*.72,.34]]
    const count=rich?16+Math.floor(rnd()*9):2+Math.floor(rnd()*8)
    for(let i=0;i<count;i++) {
        const c=centers[i%centers.length], major=i<(rich?5:3)
        const size=major?between(.25,.48):between(.035,.16)
        let x,y
        for(let attempt=0;attempt<32;attempt++) {
            x=Math.max(-size*.2,Math.min(a+size*.2,c[0]+between(-1,1)*(major?.28:.54)))
            y=Math.max(-size*.15,Math.min(1+size*.15,c[1]+between(-1,1)*(major?.25:.43)))
            // Small objects must have breathing room; major layers may deliberately overlap.
            if(major || !shapes.some(o=>Math.hypot(o.x-x,o.y-y)<(o.w+size)*.29)) break
        }
        const kind=major?[0,1,4,5,2][Math.floor(rnd()*5)]:Math.floor(rnd()*6)
        const w=size*(kind===3?between(1.8,3.2):between(.85,1.2)), h=size*(kind===3?.30:between(.85,1.15))
        const material=glass>0 && ((major && i%3===1) || rnd()<glass*.43)?1:0
        const edge=Math.floor(rnd()*4)
        shapes.push({id:i,x:x,y:y,w:w,h:h,kind:kind,glass:material,color:i%3,
            angle:between(-18,18),phase:between(0,6.283),delay:.95+i*.045+between(0,.12),
            edge:edge,travel:between(.12,.32),major:major})
    }
    // Fit rotated bounding boxes, including shadow/drift, inside the bar-free rectangle.
    const bounds=safe || {x:.025,y:.025,width:a-.05,height:.95}
    const pad=.035
    for(const o of shapes){
        const angle=(Math.abs(o.angle)+2)*Math.PI/180
        let rx=(Math.cos(angle)*o.w+Math.sin(angle)*o.h)/2
        let ry=(Math.sin(angle)*o.w+Math.cos(angle)*o.h)/2
        const scale=Math.min(1,Math.max(.01,bounds.width-2*pad)/(2*rx),Math.max(.01,bounds.height-2*pad)/(2*ry))
        o.w*=scale;o.h*=scale;rx*=scale;ry*=scale
        o.x=Math.max(bounds.x+rx+pad,Math.min(bounds.x+bounds.width-rx-pad,o.x))
        o.y=Math.max(bounds.y+ry+pad,Math.min(bounds.y+bounds.height-ry-pad,o.y))
    }
    const placed=pack(shapes,bounds,widgets || [],rnd,pixelHeight)
    const network=Routes.build(placed,bounds)
    return {seed:seed,screen:screen,aspect:a,rich:rich,mode:mode,shapes:placed,network:network,links:network.edges.filter(e=>!e.near)}
}
