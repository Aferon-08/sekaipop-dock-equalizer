.pragma library
.import "GlassRoutes.js" as Routes
.import "PetNavigation.js" as Nav
.import "PetPhysics.js" as Physics
.import "PetMotion.js" as Motion
function lerp(a,b,u){return {x:a.x+(b.x-a.x)*u,y:a.y+(b.y-a.y)*u}}
function normal(room,port){const dx=port.x-room.x,dy=port.y-room.y,n=Math.hypot(dx,dy)||1;return {x:dx/n,y:dy/n}}
function offset(p,n,d){return {x:p.x+n.x*d,y:p.y+n.y*d}}
function world(room,p){const a=room.angle*Math.PI/180,c=Math.cos(a),s=Math.sin(a);return {x:room.x+p.x*c-p.y*s,y:room.y+p.x*s+p.y*c}}
function rectangleDistance(p,r){const x=Math.max(r.x-p.x,0,p.x-r.x-r.width),y=Math.max(r.y-p.y,0,p.y-r.y-r.height);return Math.hypot(x,y)}
function plan(source,target,rooms,walls,context,origin){
 const H=context.height||1080,r=Math.min(34/H,Math.max(18/H,.026),Math.sqrt(source.w*source.h*.075/Math.PI),Math.min(target.w,target.h)*.22)
 if(r*H<12)return {reason:"room too small for safe bubble"}
 const stack=Nav.depth(source),pad=r*1.5+.007,bounds=context.bounds||{x:.015,y:.015,width:1.75,height:.97},widgets=context.widgets||[]
 const blockers=walls.filter(w=>Nav.depth(w)===undefined || Nav.depth(w)>=stack),arrivalWalls=Physics.blockers(target,walls)
 function clear(p){
  if(p.x<bounds.x+pad||p.y<bounds.y+pad||p.x>bounds.x+bounds.width-pad||p.y>bounds.y+bounds.height-pad)return false
  for(const w of blockers)if(Routes.distance(w,p)<pad)return false
  for(const g of rooms)if(Routes.distance(g,p)<pad)return false
  for(const w of widgets)if(rectangleDistance(p,w)<pad)return false
  return true
 }
 // Ports are local to a room. Search alternatives before any visible action.
 const aim=Math.atan2(target.y-source.y,target.x-source.x),angles=[0,.52,-.52,1.05,-1.05,1.57,-1.57,Math.PI]
 const candidates=[]
 for(const da of angles){
  const a=Routes.surface(source,{x:source.x+Math.cos(aim+da),y:source.y+Math.sin(aim+da)}),n=normal(source,a),start=offset(a,n,pad+.003)
  const inner=Physics.safe(source,offset(a,n,-.014),walls)
  if(!inner || Math.hypot(inner.x-a.x,inner.y-a.y)>.04 || !clear(start) || rooms.some(g=>g.id!==source.id && Routes.distance(g,a)<r*.8+.004))continue
  const approach=Nav.roomPath(source,origin||inner,inner,walls);if(!approach)continue
  // Do not move through plastic while still attached to the source.
  if(!Physics.segmentClear(source,inner,start,Physics.blockers(source,walls),false))continue
  for(const db of angles.slice(0,5)){
   const b=Routes.surface(target,{x:target.x-Math.cos(aim+db),y:target.y-Math.sin(aim+db)}),m=normal(target,b),end=offset(b,m,pad+.003),entry=Physics.safe(target,offset(b,m,-.016),walls)
   if(!entry || Math.hypot(entry.x-b.x,entry.y-b.y)>.045 || !clear(end) || rooms.some(g=>g.id!==target.id && Routes.distance(g,b)<r*.8+.004))continue
   const unionWalls=blockers.concat(arrivalWalls)
   if(!Physics.segmentClear(target,end,entry,unionWalls,false))continue
   if(!Nav.roomPath(target,entry,Physics.safe(target,{x:target.x,y:target.y},walls)||entry,walls))continue
   candidates.push({a:a,b:b,n:n,m:m,start:start,end:end,inner:inner,entry:entry,approach:approach,score:Math.hypot(start.x-end.x,start.y-end.y)+Math.abs(da)*.03+Math.abs(db)*.03})
  }
 }
 candidates.sort((a,b)=>a.score-b.score)
 for(const c of candidates.slice(0,8)){
  let path=Nav.gridPath(c.start,c.end,bounds,Math.max(.012,Math.sqrt(bounds.width*bounds.height/7000)),clear,8192)
  if(path){path=Nav.flowing(path,Math.max(r*2.6,.06),source.id*7+target.id*3,clear);const length=Nav.length(path);return Object.assign(c,{path:path,length:length,radius:r,sourceStackKey:stack,travelStackKey:stack,targetStackKey:Nav.depth(target),duration:Math.max(6,Math.min(18,length/.085)),reason:null,sourcePortLocal:Routes.local(source,c.a),targetPortLocal:Routes.local(target,c.b),sourceInnerLocal:Routes.local(source,c.inner),targetEntryLocal:Routes.local(target,c.entry),startLocal:Routes.local(source,c.start),endLocal:Routes.local(target,c.end)})}
 }
 return {reason:candidates.length?"no safe flight corridor":"no safe launch and landing ports"}
}
function create(plan,source,target,origin,id){return {kind:"bubble",id:id,source:source.id,target:target.id,age:0,phase:"approach",plan:plan,origin:{x:origin.x,y:origin.y},releaseDone:false,arrivalDone:false,progress:0}}
function sample(t,dt,rooms){
 t.age+=dt;const p=t.plan,r=p.radius,A=rooms.find(n=>n.id===t.source),B=rooms.find(n=>n.id===t.target)
 // Poses drift only a few pixels. End offsets follow the same evaluated pose.
 if(!A||!B)return null
 const a=world(A,p.sourcePortLocal),b=world(B,p.targetPortLocal),inner=world(A,p.sourceInnerLocal),entry=world(B,p.targetEntryLocal)
 const n=normal(A,a),m=normal(B,b)
 const attached=offset(a,n,-r*.25),back=offset(inner,n,-Math.min(.045,Math.min(A.w,A.h)*.15))
 const fly0=world(A,p.startLocal),fly1=world(B,p.endLocal),flightEnd=4.6+p.duration,contactEnd=flightEnd+.4,absorbEnd=contactEnd+1.15,settleEnd=absorbEnd+.8
 let light,bubble=null,union=null,dent=null,owner=t.source,container="room",phase=t.phase,body=false,stretch=1,k=0
 const age=t.age
 if(age<.9){phase="approach";light=Nav.along(p.approach,Motion.ease(age/.9))}
 else if(age<1.45){phase="backstep";light=lerp(inner,back,Motion.ease((age-.9)/.55))}
 else if(age<1.8){phase="charge";light=lerp(back,attached,Motion.ease((age-1.45)/.35))}
 else if(age<3.4){
  phase="strain";const u=Motion.ease((age-1.8)/1.6),push=(.45+.55*u)*Math.sin(Math.PI*Math.min(1,(age-1.8)/.5)/2)
  light=offset(a,n,-r*.25+u*r*.45);dent={id:t.source,at:a,amount:Math.min(.04,r*1.5)*push,radius:r*2.7}
  bubble={x:light.x,y:light.y,r:r*Motion.ease((age-2.2)/1.2)};union=t.source;k=r*1.6
 }else if(age<4.15){
  phase="neck";const u=Motion.ease((age-3.4)/.75);bubble=lerp(offset(a,n,r*.2),offset(a,n,r*.9),u);bubble.r=r
  light=bubble;union=t.source;k=r*(1.6-.5*u);dent={id:t.source,at:a,amount:r*(1-u)*.8,radius:r*2.7}
 }else if(age<4.6){
  phase="release";const u=Motion.ease((age-4.15)/.45);bubble=lerp(offset(a,n,r*.9),fly0,u);bubble.r=r;light=bubble;union=t.source;k=r*1.1*(1-u)
  stretch=1+.16*Math.sin(u*Math.PI);t.releaseDone=u>=1
 }else if(age<flightEnd){
  phase="float";t.releaseDone=true;owner=null;container="bubble";body=true
  const u=Motion.ease((age-4.6)/p.duration);t.progress=u;bubble=Nav.along(p.path,u);bubble.x+=(fly0.x-p.start.x)*(1-u)+(fly1.x-p.end.x)*u;bubble.y+=(fly0.y-p.start.y)*(1-u)+(fly1.y-p.end.y)*u
  // Small smooth lateral motion has reserved clearance; stops are finite.
  const tangent=Nav.along(p.path,Math.min(1,u+.002)),angle=Math.atan2(tangent.y-bubble.y,tangent.x-bubble.x)
  const bob=Math.sin((age-4.6)*1.8)*Math.sin(Math.PI*u)*r*.32
  bubble.x-=Math.sin(angle)*bob;bubble.y+=Math.cos(angle)*bob;bubble.r=r
  light={x:bubble.x+Math.sin(age*2.2)*r*.13,y:bubble.y+Math.sin(age*1.6+.5)*r*.13}
  stretch=1+.055*Math.sin(age*2.1)*Math.sin(Math.PI*u)
 }else if(age<contactEnd){
  phase="contact";owner=null;container="bubble";const u=Motion.ease((age-flightEnd)/.4)
  bubble=lerp(fly1,offset(b,m,r*.7),u);bubble.r=r;light=bubble;union=t.target;k=r*1.4*u;stretch=1-.1*Math.sin(Math.PI*u)
 }else if(age<absorbEnd){
  phase="absorb";const u=Motion.ease((age-contactEnd)/1.15)
  bubble=lerp(offset(b,m,r*.7),entry,u);bubble.r=r*(1-u*.5);light=lerp(offset(b,m,r*.7),entry,u);union=t.target;k=r*1.4
  owner=u>.8?t.target:null;container=owner===null?"bubble":"room";t.arrivalDone=u>.8
 }else{
  phase="settle";owner=t.target;container="room";light=entry;t.arrivalDone=true
  dent={id:t.target,at:b,amount:-r*.25*Math.exp(-(age-absorbEnd)*4)*Math.sin((age-absorbEnd)*10),radius:r*2.5}
 }
 if(age>=4.6 && age<5.9)dent={id:t.source,at:a,amount:-r*.22*Math.sin((age-4.6)*9)*Math.exp(-(age-4.6)*3),radius:r*2.7}
 t.phase=phase;t.body=body;t.union=union;t.bubble=bubble;t.smoothing=k;t.stretch=stretch;t.dent=dent
 t.visualStack=union===t.target?p.targetStackKey:p.travelStackKey
 t.light=Object.assign({},light,{a:1,size:1,owner:owner,containerKind:container,containerId:container==="bubble"?t.id:owner,transportId:t.id,lightRenderer:bubble?"carrier":"room"})
 t.done=age>=settleEnd
 return t.light
}
