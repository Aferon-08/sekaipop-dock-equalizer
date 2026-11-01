.pragma library
.import "GlassRoutes.js" as Routes
.import "PetPhysics.js" as Physics
function kind(e){return e.kind || (e.near?"near":"pipe")}
function depth(n){return n.stackKey===undefined?n.id:n.stackKey}
function components(graph){
 const parent={};graph.nodes.forEach(n=>parent[n.id]=n.id)
 function find(x){while(parent[x]!==x)x=parent[x];return x}
 graph.edges.filter(e=>kind(e)!=="bubble").forEach(e=>{const a=find(e.from),b=find(e.to);if(a!==b)parent[a]=b})
 const result={};graph.nodes.forEach(n=>result[n.id]=find(n.id));return result
}
function cheaper(a,b){return !b || a[0]<b[0] || (a[0]===b[0] && a[1]<b[1]-1e-9)}
function search(graph,start,goal){
 const comp=components(graph),cost={},prev={},done={};cost[start]=[0,0]
 while(true){
  let u=null;for(const n of graph.nodes)if(!done[n.id] && cost[n.id] && (u===null || cheaper(cost[n.id],cost[u])))u=n.id
  if(u===null)return null;if(u===goal)break;done[u]=true
  for(const e of graph.edges){
   const k=kind(e);if(e.blocked || (k==="bubble" && comp[e.from]===comp[e.to]))continue
   let v;if(e.from===u)v=e.to;else if(!e.directed && e.to===u)v=e.from;else continue
   const c=[cost[u][0]+Number(k==="bubble"),cost[u][1]+(e.effort===undefined?({pipe:1,near:6,bubble:24}[k]):e.effort)]
   if(cheaper(c,cost[v])){cost[v]=c;prev[v]={node:u,edge:Object.assign({},e,{from:u,to:v,kind:k})}}
  }
 }
 const path=[goal],steps=[];let u=goal
 while(u!==start){if(!prev[u])return null;steps.unshift(prev[u].edge);u=prev[u].node;path.unshift(u)}
 return {path:path,steps:steps,cost:cost[goal]}
}
function catalogue(shapes,walls){return shapes.filter(n=>n.glass!==false && n.glass!==0).map(n=>{
 const anchor=Physics.safe(n,{x:n.x,y:n.y},walls),scale=Math.max(.42,Math.min(1,Math.min(n.w,n.h)/.1))
 return Object.assign({},n,{anchor:anchor,lightScale:scale})
}).filter(n=>n.anchor && -Routes.distance(n,n.anchor)>.003)}
function build(shapes,network,walls){
 const nodes=catalogue(shapes,walls),ids=nodes.map(n=>n.id)
 const edges=network.edges.filter(e=>ids.indexOf(e.from)>=0 && ids.indexOf(e.to)>=0).map(e=>Object.assign({},e,{kind:e.near?"near":"pipe",effort:e.near?6:1}))
 for(let i=0;i<nodes.length;i++)for(let j=i+1;j<nodes.length;j++){
  const a=nodes[i],b=nodes[j],gap=Routes.gap(a,b)
  if(gap<=.055 && !edges.some(e=>(e.from===a.id&&e.to===b.id)||(e.from===b.id&&e.to===a.id)))edges.push({id:a.id+":"+b.id,from:a.id,to:b.id,kind:"near",near:true,gap:gap,effort:6+gap*8})
 }
 const graph={nodes:nodes,edges:edges},comp=components(graph)
 for(const a of nodes)for(const b of nodes)if(a.id!==b.id && comp[a.id]!==comp[b.id])edges.push({id:"bubble:"+a.id+":"+b.id,from:a.id,to:b.id,kind:"bubble",directed:true,effort:24+Math.hypot(a.x-b.x,a.y-b.y)*2})
 return graph
}
function roomPath(room,start,end,walls){
 const blockers=Physics.blockers(room,walls)
 if(Physics.segmentClear(room,start,end,blockers,true))return [start,end]
 // A small, local grid also lets the pet walk round a gear's hole or a wall.
 const step=Math.max(.004,Math.min(room.w,room.h)/22),pad=Math.hypot(room.w,room.h)/2
 const bounds={x:room.x-pad,y:room.y-pad,width:pad*2,height:pad*2}
 return gridPath(start,end,bounds,step,p=>Physics.clearance(room,p,blockers,true)>=.0005,4096)
}
function gridPath(start,end,bounds,step,free,maxCells){
 const cols=Math.ceil(bounds.width/step)+1,rows=Math.ceil(bounds.height/step)+1
 if(cols*rows>maxCells)return gridPath(start,end,bounds,step*1.2,free,maxCells)
 const cache={},g={},parent={},closed={},open=[]
 const ix=x=>Math.max(0,Math.min(cols-1,Math.round((x-bounds.x)/step))),iy=y=>Math.max(0,Math.min(rows-1,Math.round((y-bounds.y)/step)))
 const cell=p=>iy(p.y)*cols+ix(p.x),pos=id=>({x:bounds.x+(id%cols)*step,y:bounds.y+Math.floor(id/cols)*step})
 function clear(a,b){const d=Math.hypot(b.x-a.x,b.y-a.y),n=Math.max(1,Math.ceil(d/(step*.4)));for(let i=0;i<=n;i++)if(!free({x:a.x+(b.x-a.x)*i/n,y:a.y+(b.y-a.y)*i/n}))return false;return true}
 if(!free(start)||!free(end))return null
 if(clear(start,end))return [start,end]
 function nearest(p){let best=null,d=Infinity;for(let y=-2;y<=2;y++)for(let x=-2;x<=2;x++){const X=ix(p.x)+x,Y=iy(p.y)+y;if(X<0||Y<0||X>=cols||Y>=rows)continue;const id=Y*cols+X,q=pos(id),dist=Math.hypot(q.x-p.x,q.y-p.y);if(dist<d && clear(p,q)){best=id;d=dist}}return best}
 const first=nearest(start),last=nearest(end);if(first===null||last===null)return null
 function allowed(id){if(cache[id]===undefined)cache[id]=free(pos(id));return cache[id]}
 function push(id,score){open.push({id:id,f:score});let i=open.length-1;while(i>0){const p=(i-1)>>1;if(open[p].f<=score)break;open[i]=open[p];i=p}open[i]={id:id,f:score}}
 function pop(){const top=open[0],tail=open.pop();if(open.length){let i=0;while(i*2+1<open.length){let c=i*2+1;if(c+1<open.length&&open[c+1].f<open[c].f)c++;if(open[c].f>=tail.f)break;open[i]=open[c];i=c}open[i]=tail}return top.id}
 g[first]=0;push(first,0);let found=false
 while(open.length){const id=pop();if(closed[id])continue;if(id===last){found=true;break}closed[id]=true
  const x=id%cols,y=Math.floor(id/cols)
  for(let dy=-1;dy<=1;dy++)for(let dx=-1;dx<=1;dx++){if(!dx&&!dy)continue;const X=x+dx,Y=y+dy,v=Y*cols+X;if(X<0||Y<0||X>=cols||Y>=rows||closed[v]||!allowed(v))continue;if(dx&&dy&&(!allowed(y*cols+X)||!allowed(Y*cols+x)))continue
   const score=g[id]+Math.hypot(dx,dy);if(g[v]===undefined||score<g[v]){g[v]=score;parent[v]=id;push(v,score+Math.hypot(X-last%cols,Y-Math.floor(last/cols)))}}
 }
 if(!found)return null
 const path=[end];let id=last;while(id!==first){path.unshift(pos(id));id=parent[id]}path.unshift(start)
 const simple=[start];let i=0
 while(i<path.length-1){let j=path.length-1;while(j>i+1&&!clear(path[i],path[j]))j--;simple.push(path[j]);i=j}
 return simple
}
function length(path){let d=0;for(let i=1;i<path.length;i++)d+=Math.hypot(path[i].x-path[i-1].x,path[i].y-path[i-1].y);return d}
function arcTable(path){
 const cumulative=[0];let total=0
 for(let i=1;i<path.length;i++){total+=Math.hypot(path[i].x-path[i-1].x,path[i].y-path[i-1].y);cumulative.push(total)}
 return {total:total,lengths:cumulative}
}
function along(path,t){
 if(path.length<2)return path[0]
 if(!path.arc)path.arc=arcTable(path)
 const table=path.arc,d=Math.max(0,Math.min(1,t))*table.total;let lo=0,hi=path.length-1
 while(hi-lo>1){const mid=(lo+hi)>>1;if(table.lengths[mid]<d)lo=mid;else hi=mid}
 const a=path[lo],b=path[hi],u=(d-table.lengths[lo])/Math.max(1e-9,table.lengths[hi]-table.lengths[lo])
 return {x:a.x+(b.x-a.x)*u,y:a.y+(b.y-a.y)*u}
}
function rounded(path,radius,free){
 if(path.length<3)return path
 const result=[path[0]]
 for(let i=1;i<path.length-1;i++){
  const a=path[i-1],b=path[i],c=path[i+1],ab=Math.hypot(b.x-a.x,b.y-a.y),bc=Math.hypot(c.x-b.x,c.y-b.y)
  let accepted=null
  for(let attempt=0;attempt<4 && !accepted;attempt++){
   const d=Math.min(radius*Math.pow(.5,attempt),ab*.3,bc*.3),p={x:b.x+(a.x-b.x)*d/ab,y:b.y+(a.y-b.y)*d/ab},q={x:b.x+(c.x-b.x)*d/bc,y:b.y+(c.y-b.y)*d/bc},curve=[p]
   let safe=true
   for(let j=1;j<=12;j++){const t=j/12,u=1-t,v={x:u*u*p.x+2*u*t*b.x+t*t*q.x,y:u*u*p.y+2*u*t*b.y+t*t*q.y};if(!free(v))safe=false;curve.push(v)}
   if(safe)accepted=curve
  }
  if(!accepted)return path
  result.push.apply(result,accepted)
 }
 result.push(path[path.length-1]);return result
}
// Use a verified broad curve, including for a direct corridor. Every sampled
// chord is checked; aesthetic rounding never grants passage through a wall.
function flowing(path,amplitude,seed,free){
 if(!path || path.length<2)return path
 path=rounded(path,amplitude*.6,free)
 const result=[path[0]],sign=Math.sin(seed*1.7)>=0?1:-1
 for(let i=1;i<path.length;i++){
  const a=path[i-1],b=path[i],dx=b.x-a.x,dy=b.y-a.y,d=Math.hypot(dx,dy)
  if(d<.000001)continue
  let curve=null
  for(let attempt=0;attempt<6 && !curve;attempt++){
   const bend=Math.min(d*.22,amplitude)*Math.pow(.5,attempt)*sign,points=[],count=d<.025?1:Math.max(12,Math.ceil(d/.006));let okay=true,previous=a
   for(let j=1;j<=count;j++){
    const t=j/count,bow=Math.pow(Math.sin(Math.PI*t),2),q={x:a.x+dx*t-dy/d*bend*bow,y:a.y+dy*t+dx/d*bend*bow}
    if(!free(q))okay=false
    const mid={x:(previous.x+q.x)*.5,y:(previous.y+q.y)*.5};if(!free(mid))okay=false
    points.push(q);previous=q
   }
   if(okay)curve=points
  }
  if(curve)result.push.apply(result,curve);else result.push(b)
 }
 return result
}
