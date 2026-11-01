.pragma library
.import "GlassRoutes.js" as Routes
function blockers(room,walls){return (walls || []).filter(w=>(w.stackKey===undefined?w.id:w.stackKey)>(room.stackKey===undefined?room.id:room.stackKey))}
function clearance(room,p,walls,confine){
 let d=confine?-Routes.distance(room,p)-.002:100
 for(const w of walls)d=Math.min(d,Routes.distance(w,p)-.007)
 return d
}
function safe(room,target,walls){
 const relevant=blockers(room,walls)
 if(clearance(room,target,relevant,true)>=0)return target
 let best=null,score=Infinity
 for(let ring=0;ring<6;ring++)for(let j=0;j<32;j++){
  const a=j*Math.PI/16,r=.12+ring*.14,c=Math.cos(room.angle*Math.PI/180),sn=Math.sin(room.angle*Math.PI/180)
  const x=Math.cos(a)*room.w/2*r,y=Math.sin(a)*room.h/2*r
  const p={x:room.x+x*c-y*sn,y:room.y+x*sn+y*c}
  const dist=Math.hypot(p.x-target.x,p.y-target.y)
  if(dist<score && clearance(room,p,relevant,true)>=0){best=p;score=dist}
 }
 return best
}
function segmentClear(room,a,b,walls,confine){
 const distance=Math.hypot(a.x-b.x,a.y-b.y),count=Math.max(1,Math.ceil(distance/.005))
 for(let i=0;i<=count;i++){const t=i/count,p={x:a.x+(b.x-a.x)*t,y:a.y+(b.y-a.y)*t};if(clearance(room,p,walls,confine)<0)return false}
 return true
}
function move(room,target,previous,walls,dt,dance){
 const relevant=blockers(room,walls),maxStep=Math.max(.0001,dt*(.055+dance*.085))
 if(!previous){const p=safe(room,target,walls);return p?Object.assign({},target,p):null}
 let p={x:previous.x,y:previous.y}
 if(clearance(room,p,relevant,true)<0){
  const rescue=safe(room,p,walls);if(!rescue)return null
  const d=Math.hypot(rescue.x-p.x,rescue.y-p.y)||1,t=Math.min(1,maxStep/d)
  return Object.assign({},target,{x:p.x+(rescue.x-p.x)*t,y:p.y+(rescue.y-p.y)*t})
 }
 const total=Math.hypot(target.x-p.x,target.y-p.y),travel=Math.min(total,maxStep),steps=Math.max(1,Math.ceil(travel/.003))
 for(let i=0;i<steps;i++){
  const dx=target.x-p.x,dy=target.y-p.y,d=Math.hypot(dx,dy)||1,step=travel/steps
  let next={x:p.x+dx/d*step,y:p.y+dy/d*step}
  if(!segmentClear(room,p,next,relevant,true)){
   const e=.0003,gx=clearance(room,{x:p.x+e,y:p.y},relevant,true)-clearance(room,{x:p.x-e,y:p.y},relevant,true),gy=clearance(room,{x:p.x,y:p.y+e},relevant,true)-clearance(room,{x:p.x,y:p.y-e},relevant,true),n=Math.hypot(gx,gy)||1
   let tx=-gy/n,ty=gx/n;if(tx*dx+ty*dy<0){tx=-tx;ty=-ty}
   next={x:p.x+(tx*.9+gx/n*.25)*step,y:p.y+(ty*.9+gy/n*.25)*step}
   if(!segmentClear(room,p,next,relevant,true))break
  }
  p=next
 }
 return Object.assign({},target,p)
}
