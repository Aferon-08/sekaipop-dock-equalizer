.pragma library
function eligible(shapes){return shapes.filter(s=>s.glass && s.w*s.h>.006)}
function local(s,p){const a=-s.angle*Math.PI/180,x=p.x-s.x,y=p.y-s.y;return {x:x*Math.cos(a)-y*Math.sin(a),y:x*Math.sin(a)+y*Math.cos(a)}}
function distance(s,p){
 const v=local(s,p),bx=s.w/2,by=s.h/2,x=v.x,y=v.y
 if(s.kind===0 || s.kind===3 || s.kind===4){const r=Math.min(bx,by)*(s.kind===3?1:.47),qx=Math.abs(x)-bx+r,qy=Math.abs(y)-by+r;return Math.hypot(Math.max(qx,0),Math.max(qy,0))+Math.min(Math.max(qx,qy),0)-r}
 const X=x/bx,Y=y/by,R=Math.hypot(X,Y),a=Math.atan2(Y,X)
 if(s.kind===1)return (R-1)*Math.min(bx,by)
 if(s.kind===2)return Math.max(R-(.86+.09*Math.cos(a*9)),.37-R)*Math.min(bx,by)
 return (R-(.89+.09*Math.sin(a*3+.5)+.035*Math.cos(a*5)))*Math.min(bx,by)
}
function surface(s,toward){
 let dx=toward.x-s.x,dy=toward.y-s.y,n=Math.hypot(dx,dy);if(n<.00001){dx=1;dy=0;n=1}dx/=n;dy/=n
 // Radial materials have an exact outer radius, including the holed gear.
 // Rounded rectangles contain their centre, so binary search starts there.
 if(s.kind===1 || s.kind===2 || s.kind===5){
  const v=local(s,{x:s.x+dx,y:s.y+dy}),X=v.x/(s.w/2),Y=v.y/(s.h/2),a=Math.atan2(Y,X)
  const radius=s.kind===1?1:s.kind===2?.86+.09*Math.cos(a*9):.89+.09*Math.sin(a*3+.5)+.035*Math.cos(a*5)
  const q=radius/Math.hypot(X,Y)
  return {x:s.x+dx*q,y:s.y+dy*q}
 }
 let hi=Math.hypot(s.w,s.h)/2,lo=0
 for(let i=0;i<18;i++){const m=(lo+hi)/2;if(distance(s,{x:s.x+dx*m,y:s.y+dy*m})<=0)lo=m;else hi=m}
 return {x:s.x+dx*lo,y:s.y+dy*lo}
}
function gap(a,b){
 const A=surface(a,b),B=surface(b,a),dx=b.x-a.x,dy=b.y-a.y
 return Math.max(0,((B.x-A.x)*dx+(B.y-A.y)*dy)/(Math.hypot(dx,dy)||1))
}
// Find up to four disjoint far pairs. Nearest-first greedy matching can
// strand a bubble even when a different pairing would produce four tubes.
function farPairs(nodes,far){
 const adjacent=nodes.map(()=>[])
 for(const e of far){const a=nodes.findIndex(n=>n.id===e.from),b=nodes.findIndex(n=>n.id===e.to);adjacent[a].push({index:b,edge:e});adjacent[b].push({index:a,edge:e})}
 const initial=Math.pow(2,nodes.length)-1
 function solve(mask,need,failed){
  if(need===0)return []
  const key=mask+":"+need;if(failed[key])return null
  let count=0,vertex=-1,choices=null
  for(let i=0;i<nodes.length;i++)if(mask & (1<<i)){
   const list=adjacent[i].filter(e=>mask & (1<<e.index))
   if(list.length){count++;if(choices===null || list.length<choices.length){vertex=i;choices=list}}
  }
  if(count<need*2){failed[key]=true;return null}
  const rest=mask & ~(1<<vertex)
  for(const e of choices){const tail=solve(rest & ~(1<<e.index),need-1,failed);if(tail!==null)return [e.edge].concat(tail)}
  const skipped=solve(rest,need,failed)
  if(skipped!==null)return skipped
  failed[key]=true;return null
 }
 for(let n=Math.min(4,Math.floor(nodes.length/2));n>0;n--){const result=solve(initial,n,{});if(result!==null)return result}
 return []
}
function build(shapes,bounds){
 const nodes=eligible(shapes).map((s,i)=>Object.assign({},s,{id:s.id===undefined?i:s.id})),edges=[],all=[]
 for(let i=0;i<nodes.length;i++)for(let j=i+1;j<nodes.length;j++)all.push({from:nodes[i].id,to:nodes[j].id,gap:gap(nodes[i],nodes[j])})
 all.sort((a,b)=>a.gap-b.gap || a.from-b.from || a.to-b.to)
 const parent={};nodes.forEach(n=>parent[n.id]=n.id)
 function find(x){while(parent[x]!==x)x=parent[x];return x}
 // Nearby bubbles still use membrane crossings, without a pipe.
 for(const e of all.filter(e=>e.gap<=.055)){const a=find(e.from),b=find(e.to);if(a===b)continue;parent[a]=b;edges.push(Object.assign({},e,{id:e.from+":"+e.to,near:true}))}
 // Four pipes whenever a matching exists; otherwise the largest possible
 // smaller set. Each bubble owns only one far socket, in either direction.
 for(const e of farPairs(nodes,all.filter(e=>e.gap>.055))){
  edges.push(Object.assign({},e,{id:e.from+":"+e.to,near:false}))
 }
 return {nodes:nodes,edges:edges,bounds:bounds}
}
function posed(shapes,time,movement,height){return shapes.map((s,i)=>{
 const drift=movement*(s.major?2.5:4)/Math.max(1,height),phase=s.phase||0
 return Object.assign({},s,{id:s.id===undefined?i:s.id,x:s.x+Math.sin(time*.24+phase)*drift,y:s.y+Math.sin(time*.19+phase*1.7)*drift,angle:s.angle+Math.sin(time*.12+phase)*movement*.55})
})}
function geometry(edge,nodes,bounds){
 const A=nodes.find(n=>n.id===edge.from),B=nodes.find(n=>n.id===edge.to)
 if(!A || !B)return null
 const a=surface(A,B),b=surface(B,A),dx=b.x-a.x,dy=b.y-a.y,len=Math.hypot(dx,dy)||.001,sag=edge.near?0:Math.min(.07,len*.12)
 function control(t){let x=a.x+dx*t-dy/len*sag,y=a.y+dy*t+dx/len*sag
  if(bounds){x=Math.max(bounds.x,Math.min(bounds.x+bounds.width,x));y=Math.max(bounds.y,Math.min(bounds.y+bounds.height,y))}return {x:x,y:y}}
 return {id:edge.id,near:edge.near,a:a,b:b,c1:control(.32),c2:control(.68),from:edge.from,to:edge.to,length:len}
}
function reverse(g){return Object.assign({},g,{a:g.b,b:g.a,c1:g.c2,c2:g.c1,from:g.to,to:g.from})}
function sample(g,t){const q=1-t;return {x:q*q*q*g.a.x+3*q*q*t*g.c1.x+3*q*t*t*g.c2.x+t*t*t*g.b.x,y:q*q*q*g.a.y+3*q*q*t*g.c1.y+3*q*t*t*g.c2.y+t*t*t*g.b.y,a:1,size:1}}

function prefix(g,t){
 t=Math.max(0,Math.min(1,t));const a=g.a
 function lerp(p,q){return {x:p.x+(q.x-p.x)*t,y:p.y+(q.y-p.y)*t}}
 const c1=lerp(a,g.c1),q=lerp(g.c1,g.c2),c2=lerp(c1,q)
 return Object.assign({},g,{c1:c1,c2:c2,b:sample(g,t)})
}
// Navigation may orient an edge toward the next room. The physical tube has
// one canonical curve; reversing travel must reverse its controls, not its sag.
function physical(edge,nodes,network,source){
 const canonical=(network.edges||[]).find(e=>e.id===edge.id)||edge
 let g=geometry(canonical,nodes,network.bounds)
 if(g && source!==undefined && g.from!==source)g=reverse(g)
 return g
}
function curveTable(g){const points=[];for(let i=0;i<=64;i++)points.push(sample(g,i/64));let total=0;const lengths=[0];for(let i=1;i<points.length;i++){total+=Math.hypot(points[i].x-points[i-1].x,points[i].y-points[i-1].y);lengths.push(total)}return {points:points,lengths:lengths,total:total}}
function parameter(table,fraction){
 const d=Math.max(0,Math.min(1,fraction))*table.total;let lo=0,hi=table.lengths.length-1
 while(hi-lo>1){const mid=(lo+hi)>>1;if(table.lengths[mid]<d)lo=mid;else hi=mid}
 return (lo+(d-table.lengths[lo])/Math.max(.000001,table.lengths[hi]-table.lengths[lo]))/(table.lengths.length-1)
}
