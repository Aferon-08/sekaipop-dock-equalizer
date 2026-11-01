.pragma library
.import "LightMotion.js" as Idle
.import "GlassRoutes.js" as Routes
.import "PetPhysics.js" as Physics
.import "PetMotion.js" as Motion
.import "PetNavigation.js" as Nav
.import "PetBehavior.js" as Behavior
.import "BubbleTransfer.js" as Bubble
function smooth(x){x=Math.max(0,Math.min(1,x));return x*x*(3-2*x)}
function random(s){s.rng=(Math.imul(s.rng,1664525)+1013904223)>>>0;return s.rng/4294967296}
function create(seed){let h=2166136261;for(let i=0;i<seed.length;i++)h=Math.imul(h^seed.charCodeAt(i),16777619);const s={rng:h>>>0,time:0,clock:0,heart:0,energy:0,dance:0,mode:"single",age:0,points:[],history:[],home:null,trip:null,nextTrip:12,impacts:[],play:"wander"};Behavior.initialize(s);s.motors=[];s.carrier=null;s.serial=0;s.nextSplit=90-Math.log(Math.max(.001,random(s)))*180;return s}
function point(shape,t,variant,dance){
 const phase=t*(.55+dance*.75)+variant*2.7
 let x,y
 if(shape.kind===2){const a=phase*.55;x=Math.cos(a)*.58;y=Math.sin(a)*.58}
 else{x=Math.sin(phase)*.42;y=Math.sin(phase*.79+.8)*.38}
 const a=shape.angle*Math.PI/180,px=x*shape.w/2,py=y*shape.h/2
 return {x:shape.x+px*Math.cos(a)-py*Math.sin(a),y:shape.y+px*Math.sin(a)+py*Math.cos(a),a:1,size:1}
}
function homeNode(s,shapes){return shapes.find(n=>n.id===s.home) || shapes[0]}
function inside(shape,p,t){
 const anchor=point(shape,t,0,0)
 for(let i=0;i<8 && Routes.distance(shape,p)>-.002;i++)p=mix(p,anchor,.4)
 return p
}
function addImpact(s,node,at,peak){s.impacts.push({id:node.id,x:at.x,y:at.y,age:0,peak:Math.min(.018,Math.min(node.w,node.h)*Math.abs(peak))*Math.sign(peak)})}
function impactValue(hit){
 if(hit.age<.5)return hit.peak*Math.sin(hit.age/.5*Math.PI/2)
 const t=hit.age-.5;return hit.peak*Math.exp(-t*4.5)*Math.cos(t*17)
}
function navigation(s,nodes,network,walls){
 if(s.time>=(s.nextEdgeRetry||Infinity) && s.graph){
  s.nextEdgeRetry=Infinity
  for(const e of s.graph.edges)if(e.blockedUntil){if(e.blockedUntil<=s.time){e.blocked=false;delete e.blockedUntil}else s.nextEdgeRetry=Math.min(s.nextEdgeRetry,e.blockedUntil)}
 }
 if(!s.graph)s.graph=Nav.build(nodes,network,walls)
 return s.graph
}
function blockEdge(s,edge){
 for(const e of s.graph.edges)if(e.id===edge.id){e.blocked=true;e.blockedUntil=s.time+40}
 s.nextEdgeRetry=Math.min(s.nextEdgeRetry||Infinity,s.time+40)
}
function replan(s,reason){
 s.replanReason=reason
 if(!s.journey)return
 const goal=s.journey.goalRoomId,result=Nav.search(s.graph,s.home,goal)
 if(result){s.journey.steps=result.steps;s.journey.path=result.path;s.journey.stepIndex=0;s.journey.cost=result.cost;s.journey.failures++;s.nextTrip=s.time+2}
 else{s.deferred[goal]=s.time+40;s.journey=null;s.nextGoal=s.time+8}
}
function planRoom(s,room,start,end,walls,purpose,context){
 if(!context.asynchronous){
  const path=Nav.roomPath(room,start,end,walls),blockers=Physics.blockers(room,walls)
  return path?Nav.flowing(path,Math.min(room.w,room.h)*.16,s.rng,p=>Physics.clearance(room,p,blockers,true)>=.001):null
 }
 if(!s.pendingRoom || s.pendingRoom.purpose!==purpose){s.pendingRoom={kind:"room",request:++s.serial,room:room,start:start,end:end,walls:walls,purpose:purpose,seed:s.rng,requested:false,ready:false};return undefined}
 if(!s.pendingRoom.ready)return undefined
 const result=s.pendingRoom.result;s.pendingRoom=null;return result.path||null
}
function nextTripId(s){const id=++s.serial;return s.actorId===undefined?id:s.actorId+":"+id}
function returnItinerary(s){
 if(!s.returning || !s.breadcrumbs || !s.breadcrumbs.length)return false
 const steps=s.breadcrumbs.slice().reverse().map(c=>Object.assign({},c.edge,{from:c.target,to:c.source,kind:c.kind,returnPlan:c.returnPlan,retrace:true}))
 s.journey={id:++s.journeySerial,goalRoomId:s.returnHome,path:[s.home].concat(steps.map(e=>e.to)),steps:steps,stepIndex:0,cost:[steps.filter(e=>e.kind==="bubble").length,0],failures:0,started:s.time}
 return true
}
function startTrip(s,nodes,network,walls,context){
 if(s.mode!=="single" || s.trip || nodes.length<2)return false
 const graph=navigation(s,nodes,network,walls)
 if(s.returning){
  if(s.home===s.returnHome){s.journey=null;s.breadcrumbs=[];s.nextTrip=Infinity;return false}
  if(!s.journey || s.journey.goalRoomId!==s.returnHome)returnItinerary(s)
 }
 if(!s.journey){const goal=Behavior.chooseGoal(s,graph);if(goal===null){s.nextGoal=s.time+12;s.nextTrip=s.nextGoal;return false};if(!Behavior.plan(s,graph,goal))return false}
 const edge=s.journey.steps[s.journey.stepIndex];if(!edge)return false
 const source=nodes.find(n=>n.id===s.home),dest=nodes.find(n=>n.id===edge.to)
 if(!source || !dest){s.graph=null;s.journey=null;return false}
 const cost={pipe:.02,near:.12,bubble:.32}[edge.kind]
 if(s.stamina<cost+.12){s.play="rest";s.nextTrip=s.time+1;return false}
 if(edge.kind==="bubble" && !s.returning && s.time<s.nextBubble){s.nextTrip=Math.min(s.nextBubble,s.time+2);return false}
 const origin=s.points[0] || point(source,s.clock,0,s.dance)
 if(edge.kind==="bubble"){
  let plan
  if(edge.returnPlan){
   plan=Object.assign({},edge.returnPlan)
   const entry=Bubble.world(source,plan.sourceInnerLocal),approach=planRoom(s,source,origin,entry,walls,"port:return:"+edge.id,context)
   if(approach===undefined){s.nextTrip=s.time+.12;return false}
   if(!approach){s.nextTrip=s.time+2;return false}
   plan.approach=approach
  }else if(context && context.asynchronous){
   if(!s.pendingPlan){s.pendingPlan={request:++s.serial,source:source,target:dest,rooms:nodes,walls:walls,context:{height:context.height,bounds:context.bounds,widgets:context.widgets},origin:origin,ready:false,requested:false,requireReturn:!!s.isChild};s.nextTrip=s.time+.15;return false}
   if(!s.pendingPlan.ready){s.nextTrip=s.time+.15;return false}
   plan=s.pendingPlan.result
   if(!plan.reason && !Physics.segmentClear(source,origin,plan.approach[Math.min(1,plan.approach.length-1)],Physics.blockers(source,walls),true)){
    s.pendingPlan.origin=origin;s.pendingPlan.ready=false;s.pendingPlan.requested=false;s.nextTrip=s.time+.15;return false
   }
   s.pendingPlan=null
   if(!plan.reason)plan.approach[0]={x:origin.x,y:origin.y}
  }else{
   plan=Bubble.plan(source,dest,nodes,walls,context||{},origin)
   if(!plan.reason && s.isChild){const back=Bubble.plan(dest,source,nodes,walls,context,plan.entry);if(back.reason)plan={reason:"no safe return: "+back.reason};else plan.returnPlan=back}
  }
  if(!plan.reason){s.trip=Bubble.create(plan,source,dest,origin,nextTripId(s));s.trip.edge=edge;s.trip.retrace=!!edge.retrace;s.local=null;return true}
  blockEdge(s,edge);replan(s,plan.reason);return false
 }
 let g=Routes.physical(edge,nodes,network,s.home)
 const srcWalls=Physics.blockers(source,walls),dstWalls=Physics.blockers(dest,walls)
 let n={x:g.a.x-source.x,y:g.a.y-source.y},length=Math.hypot(n.x,n.y)||1;n.x/=length;n.y/=length
 const inner=Physics.safe(source,{x:g.a.x-n.x*.016,y:g.a.y-n.y*.016},walls)
 const approach=inner?planRoom(s,source,origin,inner,walls,"port:"+edge.id,context):null
 if(approach===undefined){s.nextTrip=s.time+.12;return false}
 let safe=!!approach && !srcWalls.some(w=>Routes.distance(w,g.a)<.012) && !dstWalls.some(w=>Routes.distance(w,g.b)<.012)
 // Verify the complete tube and near corridor, including crossing layers.
 for(let i=0;safe && i<=24;i++){
  const p=Routes.sample(g,i/24)
  if(srcWalls.concat(dstWalls).some(w=>Routes.distance(w,p)<.008))safe=false
 }
 if(!safe){blockEdge(s,edge);replan(s,"blocked port or inside approach");return false}
 s.trip={kind:edge.kind,retrace:!!edge.retrace,id:nextTripId(s),target:dest.id,edge:edge,source:s.home,age:0,origin:origin,impacted:false,arrived:false,approach:approach,approachIndex:1,ready:false,wait:0};s.local=null;return true
}
function finishTrip(s,kind,source,target){
 const finished=s.trip
 if(s.isChild){
  if(finished.retrace)s.breadcrumbs.pop()
  else if(target===s.returnHome)s.breadcrumbs=[]
  else {
   const visited=s.breadcrumbs.findIndex(c=>c.target===target)
   if(visited>=0)s.breadcrumbs=s.breadcrumbs.slice(0,visited+1)
   else s.breadcrumbs.push({source:source,target:target,kind:kind,edge:finished.edge,returnPlan:finished.plan?.returnPlan})
  }
 }
 s.previousHome=source;s.home=target;s.trip=null;s.carrier=null
 Behavior.completed(s,kind);s.play="wander"
 if(kind==="bubble")s.nextBubble=s.time+60+Behavior.random(s)*40
}
function travel(s,nodes,network){
 const trip=s.trip;let g=Routes.physical(trip.edge,nodes,network,trip.source)
 const source=nodes.find(n=>n.id===g.from),dest=nodes.find(n=>n.id===g.to)
 // An open tube is already a passage. Never push or deform either socket.
 if(!trip.edge.near){
  const age=trip.age,cross=Math.max(3,Math.min(12,g.length/.12));let p
  if(age<.65){p=mix(trip.origin,g.a,smooth(age/.65));s.play="tube-approach"}
  else if(age<.65+cross){if(!trip.curveTable)trip.curveTable=Routes.curveTable(g)
   const u=Motion.ease((age-.65)/cross),parameter=Routes.parameter(trip.curveTable,u)
   p=Routes.sample(g,parameter);p.wire=g;p.wireParameter=parameter;p.owner=null;s.play="wire"}
  else{
   const local=Idle.motionTime(s.clock)*(1-s.dance)+s.clock*s.dance
   p=mix(g.b,point(dest,local,0,s.dance),smooth((age-.65-cross)/.65));p.owner=g.to;s.home=g.to;s.play="land"
   if(age>=1.3+cross){trip.done=true}
  }
  return p
 }
 let membrane=source,inward=false,skipArrival=false
 let normal={x:g.a.x-source.x,y:g.a.y-source.y}
 let length=Math.hypot(normal.x,normal.y)||1;normal.x/=length;normal.y/=length
 if(trip.edge.near && Routes.distance(source,g.b)<0 && Routes.distance(dest,g.a)>=0){
  g.a=g.b;membrane=dest;inward=true;skipArrival=true
  normal={x:dest.x-g.a.x,y:dest.y-g.a.y};length=Math.hypot(normal.x,normal.y)||1;normal.x/=length;normal.y/=length
 }
 if(trip.edge.near && (inward || Routes.distance(dest,g.a)<0)){
  g.b=inside(dest,{x:g.a.x+normal.x*.025,y:g.a.y+normal.y*.025,a:1,size:1},s.clock)
  g.c1=mix(g.a,g.b,.32);g.c2=mix(g.a,g.b,.68);skipArrival=true
 }
 const dx=normal.x,dy=normal.y,n=1
 const windup=inside(source,{x:g.a.x-dx/n*.075,y:g.a.y-dy/n*.075,a:1,size:1},s.clock)
 let p;const age=trip.age,cross=trip.edge.near?.48:Math.max(1.4,Math.min(4,g.length*3))
 if(age<.65){p=mix(trip.origin,windup,smooth(age/.65));s.play="windup"}
 else if(age<1.05){const u=(age-.65)/.4;p=mix(windup,g.a,u*u*u);p.size=1-.12*u;s.play="charge"}
 else if(age<1.6){
  if(!trip.impacted){addImpact(s,membrane,g.a,inward?-.09:.09);trip.impacted=true}
  const u=smooth((age-1.05)/.55);p={x:g.a.x+dx/n*.009*Math.sin(u*Math.PI),y:g.a.y+dy/n*.009*Math.sin(u*Math.PI),a:1,size:1-.22*Math.sin(u*Math.PI)};s.play="push"
 }else if(age<1.6+cross){
  p=Routes.sample(g,smooth((age-1.6)/cross));p.owner=(age-1.6)/cross<.5?g.from:g.to;if(p.owner===g.to)s.home=g.to
  s.play=trip.edge.near?"squeeze":"wire"
 }else{
  if(!trip.arrived){if(!skipArrival)addImpact(s,dest,g.b,-.055);trip.arrived=true}
  p=mix(g.b,point(dest,Idle.motionTime(s.clock)*(1-s.dance)+s.clock*s.dance,0,s.dance),smooth((age-1.6-cross)/.65));p.owner=g.to;s.home=g.to;s.play="land"
  if(age>=2.25+cross){trip.done=true}
 }
 return p
}
function playPair(s,node){
 if(s.nextGame===undefined || s.age>=s.nextGame){s.game=Math.floor(random(s)*3);s.gameStarted=s.age;s.nextGame=s.age+4+random(s)*8}
 const segment=s.game,t=s.clock,base=point(node,Idle.motionTime(t),0,s.dance)
 let radius=Math.min(node.w,node.h)*.18
 // Stay on the annulus in gears; other bubbles have room for loops and play bows.

 const angle=t*(1.35+s.dance),phase=s.age-s.gameStarted
 let p,q
 if(node.kind===2){p=point(node,t,0,s.dance);q=point(node,t-.9,0,s.dance);s.play="chase"}
 else if(segment===0){
  p={x:base.x+Math.cos(angle)*radius,y:base.y+Math.sin(angle)*radius*.6,a:1,size:1}
  q={x:base.x+Math.cos(angle-1.2)*radius,y:base.y+Math.sin(angle-1.2)*radius*.6,a:1,size:1};s.play="chase"
 }else if(segment===1){
  const separation=radius*(.25+.75*Math.abs(Math.sin(phase*Math.PI/3.5)))
  p={x:base.x-separation,y:base.y-Math.abs(Math.sin(phase*3))*.009,a:1,size:1}
  q={x:base.x+separation,y:base.y-Math.abs(Math.sin(phase*3+.7))*.009,a:1,size:1};s.play="greet"
 }else{
  p={x:base.x+Math.sin(angle)*radius,y:base.y+Math.sin(angle*2)*radius*.52,a:1,size:1}
  q={x:base.x-Math.sin(angle)*radius,y:base.y-Math.sin(angle*2)*radius*.52,a:1,size:1};s.play="tumble"
 }
 p=inside(node,p,t);q=inside(node,q,t)
 if(s.playSegment!==segment){s.playFrom=s.points.slice();s.playStarted=s.age;s.playSegment=segment}
 if(s.age-s.playStarted<.6 && s.playFrom.length===2){const u=smooth((s.age-s.playStarted)/.6);p=mix(s.playFrom[0],p,u);q=mix(s.playFrom[1],q,u)}
 return [p,q]
}
function mix(a,b,t){return {x:a.x+(b.x-a.x)*t,y:a.y+(b.y-a.y)*t,a:1,size:1}}
function beginSplit(s,shapes){
 if(s.mode!=="single" || s.trip || !shapes.length)return false
 s.splitHome=s.home;s.familySerial=(s.familySerial||0)+1;s.mode="split";s.age=0;s.playSegment=-1;s.nextGame=undefined;s.origin=s.points[0] || point(homeNode(s,shapes),s.clock,0,s.dance);s.birthLocal=Routes.local(homeNode(s,shapes),s.origin)
 // A small startled retreat remains close to its current glass home.
 s.stage=inside(homeNode(s,shapes),{x:s.origin.x+(random(s)-.5)*.022,y:s.origin.y-.012,a:1,size:1},s.clock);s.history=[];return true
}
function localPose(s,node,walls,dt,context){
 const desired=Behavior.localTarget(s,node,walls),local=s.local,current=s.points[0]||desired
 if(s.pendingRoom && s.pendingRoom.purpose.indexOf("port:")===0)return Object.assign({},current,{a:1,size:1})
 if(!local.path && !local.failed){
  const path=planRoom(s,node,current,desired,walls,"local:"+local.started,context)
  if(path===undefined)return Object.assign({},current,{a:1,size:1})
  if(!path){local.failed=true;return Object.assign({},current,{a:1,size:1})}
  local.path=path;local.progress=0;local.pathLength=Nav.length(path)
 }
 let p=desired
 if(local.path){
  const speed=(local.mode==="observe" || s.play==="rest")?.012:.025+s.dance*.025
  local.progress=Math.min(1,local.progress+dt*speed/Math.max(.001,local.pathLength))
  p=Nav.along(local.path,Motion.ease(local.progress))
  if(!local.finished && local.progress>=1 && Math.hypot(current.x-desired.x,current.y-desired.y)<.007){local.finished=true;s.nextLocal=Math.max(s.nextLocal,s.time+1)}
 }
 const pause=local.mode==="observe" || s.play==="rest",amplitude=pause?.00035:.0008+s.dance*.0018
 let q={x:p.x+Math.sin(s.clock*1.1)*amplitude,y:p.y+Math.sin(s.clock*.85+.8)*amplitude,a:1,size:1}
 if(Physics.clearance(node,q,Physics.blockers(node,walls),true)<.006)q=Object.assign({},p,{a:1,size:1})
 return q
}
function advance(s,dt,shapes,playing,beat,bpm,network,walls,context){
 walls=walls||[];context=context||{}
 shapes=shapes.map((n,i)=>Object.assign({},n,{id:n.id===undefined?i:n.id}))
 network=network||Routes.build(shapes.map(n=>Object.assign({},n,{glass:1})))
 dt=Math.max(0,Math.min(.05,dt));if(!dt)return s
 s.time+=dt;s.age+=dt
 s.dance+=(Number(playing)-s.dance)*(1-Math.exp(-dt*2.4))
 const energy=Math.max(0,Math.min(1,beat));s.energy+=(energy-s.energy)*(1-Math.exp(-dt*(energy>s.energy?10:3.5)))
 s.clock+=dt*(.42+s.dance*(1.15+s.energy*.45))
 s.tempo=(s.tempo||95)+((playing?Math.max(55,Math.min(190,bpm||95)):39)-(s.tempo||95))*(1-Math.exp(-dt*1.4))
 s.heart+=dt*s.tempo/60
 s.impacts.forEach(h=>h.age+=dt);s.impacts=s.impacts.filter(h=>h.age<1.9)
 if(!shapes.length){s.points=[];s.history=[];s.trip=null;s.carrier=null;s.impacts=[];return s}
 if(s.children)return advanceFamily(s,dt,shapes,playing,beat,bpm,network,walls,context)
 const graph=navigation(s,shapes,network,walls)
 if(!graph.nodes.length){s.points=[];return s}
 if(s.home===null){s.home=graph.nodes[0].id;s.visits[s.home]=s.time}
 const node=homeNode(s,shapes)
 if(!s.points.length && !s.trip && s.mode==="single"){
  const p=Physics.safe(node,point(node,s.clock,0,s.dance),walls)
  if(!p){s.points=[];return s}
  s.motors=[Motion.create(p)]
 }
 if(!s.trip){s.stamina=Math.min(1,s.stamina+dt*(s.play==="rest"?.045:.012))}
 if(s.splitEnabled!==false && !s.isChild && s.mode==="single" && !s.trip && !s.pendingPlan && s.time>=s.nextSplit)beginSplit(s,shapes)
 if(!context.gatherTarget && !context.playTarget && s.mode==="single" && !s.trip && s.time>=s.nextTrip && (s.journey || s.time>=s.nextGoal))startTrip(s,shapes,network,walls,context)
 let poses=[],trip=s.trip
 if(trip && trip.kind==="bubble"){
  poses=[Bubble.sample(trip,dt,shapes)];s.play="bubble-"+trip.phase;s.carrier=trip
 }else if(trip){
  if(!trip.ready){
   const p=trip.approach[Math.min(trip.approachIndex,trip.approach.length-1)];poses=[Object.assign({},p,{a:1,size:1,owner:s.home})];s.play="port-approach";trip.wait+=dt
   if(s.points[0] && Math.hypot(s.points[0].x-p.x,s.points[0].y-p.y)<.007){if(trip.approachIndex<trip.approach.length-1)trip.approachIndex++;else{trip.ready=true;trip.origin=s.points[0];trip.age=0}}
   if(trip.wait>14){blockEdge(s,trip.edge);s.trip=null;replan(s,"approach blocked");trip=null}
  }else{trip.age+=dt;poses=[travel(s,shapes,network)]}
 }else if(s.mode==="single"){
  if(s.play!=="rest" || s.stamina>.65)s.play="wander"
  poses=[context.playTarget?Object.assign({},context.playTarget,{a:1,size:1}):context.gatherTarget?gatherPose(s,node,walls,context,dt):localPose(s,node,walls,dt,context)]
 }
 const local=Idle.motionTime(s.clock)*(1-s.dance)+s.clock*s.dance,a=point(node,local,0,s.dance),b=point(node,local,1,s.dance)
 if(s.mode==="split"){
  if(s.age<.35)poses=[mix(s.origin,s.stage,smooth(s.age/.35))]
  else if(s.age<1.05){const u=(s.age-.35)/.7,p=mix(s.stage,s.stage,0);p.x+=Math.sin(u*Math.PI*12)*Math.sin(u*Math.PI)*.005;p.y+=Math.sin(u*Math.PI*18)*.0015;p.size=1+.14*Math.sin(u*Math.PI);poses=[p]}
  else{const u=Motion.ease((s.age-1.05)/.65);poses=[mix(s.stage,a,u),mix(s.stage,b,u)]}
  if(s.age>=1.7){s.mode="twins";s.age=0}
 }
 const previous=s.points;let finish=false
 poses=poses.filter(p=>!!p).map((p,index)=>{
  if(p.owner===undefined)p.owner=trip?trip.source:s.home
  if(!s.motors[index])s.motors[index]=Motion.create(previous[0]||p)
  const m=s.motors[index]
  const confined=!trip || (!trip.ready && trip.kind!=="bubble") || (trip.kind==="bubble" && (trip.phase==="approach" || trip.phase==="backstep"))
  const pace=trip && trip.kind==="bubble"?.14:.055+s.dance*.085
  Motion.step(m,p,dt,{omega:trip?12:5,speed:confined?pace:.28,acceleration:trip?.8:.16})
  let q=Object.assign({},p,{x:m.x,y:m.y})
  if(p.wireParameter!==undefined){q.x=p.x;q.y=p.y;const old=previous[index]||q;m.vx=(q.x-old.x)/dt;m.vy=(q.y-old.y)/dt}
  if(!trip || !trip.ready && trip.kind!=="bubble"){
   const room=homeNode(s,shapes)
   q=Physics.move(room,q,previous[index]||previous[0],walls,dt,s.dance)
  }else if(trip.kind==="bubble"){
   // The connected union or the detached capsule owns one continuous head.
   if(trip.phase==="approach" || trip.phase==="backstep")q=Physics.move(node,q,previous[index]||previous[0],walls,dt,1)
   if(trip.bubble && ["float","contact","release","neck"].indexOf(trip.phase)>=0){
    const centre=trip.bubble,d=Math.hypot(q.x-centre.x,q.y-centre.y),limit=trip.plan.radius*.58
    if(d>limit){q.x=centre.x+(q.x-centre.x)*limit/d;q.y=centre.y+(q.y-centre.y)*limit/d}
   }
   if(trip.arrivalDone){
    const dest=shapes.find(n=>n.id===trip.target)
    const prev=previous[index] && Physics.safe(dest,previous[index],walls)===previous[index]?previous[index]:q
    q=Physics.move(dest,q,prev,walls,dt,1);s.home=trip.target;if(q)q.owner=trip.target
   }
   if(trip.done && q && Physics.clearance(shapes.find(n=>n.id===trip.target),q,Physics.blockers(shapes.find(n=>n.id===trip.target),walls),true)>=.0004)finish=true
  }else{
   // A scripted membrane corridor authorizes the single owner handoff.
   const dest=shapes.find(n=>n.id===trip.target)
   const handoffReady=trip.kind==="near"?trip.age>=1.84:trip.age>=.65
   if(!trip.handedOff && trip.ready && handoffReady && Routes.distance(dest,q)<-.003)trip.handedOff=true
   if(trip.handedOff){
    const prev=previous[index] && Routes.distance(dest,previous[index])<-.001?previous[index]:q
    q=Physics.move(dest,q,prev,walls,dt,1)
    if(!q)return null
    q.owner=trip.target;s.home=trip.target
   }
   else if(q.owner!==null){q.owner=trip.source;s.home=trip.source}
   const bad=Physics.blockers(shapes.find(n=>n.id===q.owner)||node,walls).some(w=>Routes.distance(w,q)<.006)
   if(bad && previous[index]){q=Object.assign({},previous[index]);s.trip=null;s.home=q.owner===null?trip.source:q.owner;replan(s,"wall at transfer");trip=null}
   if(trip && trip.done && q.owner===trip.target && Physics.clearance(dest,q,Physics.blockers(dest,walls),true)>=.0004)finish=true
  }
  if(!q)return null
  Motion.reconcile(m,q,dt)
  if(trip && trip.kind==="pipe" && trip.ready){
   q.wire=Routes.physical(trip.edge,shapes,network,trip.source);q.transportId=trip.id
   const room=q.owner===null?null:shapes.find(n=>n.id===q.owner)
   q.wireWeight=room?1-smooth(Math.max(0,-Routes.distance(room,q))/Math.min(.028,Math.min(room.w,room.h)*.20)):1
   q.containerKind=room?"room":"pipe";q.containerId=room?q.owner:trip.id
  }
  q.containerKind=q.containerKind||(q.wire?"pipe":"room");q.containerId=q.containerId===undefined?(q.wire?trip.id:q.owner):q.containerId
  const room=shapes.find(n=>n.id===(trip?trip.target:q.owner)),fit=room?Math.max(.42,Math.min(1,Math.min(room.w,room.h)/.10)):1
  const pulse=Math.pow(Math.max(0,Math.sin(s.heart*Math.PI*2)),7),breath=.95+.045*Math.sin(s.time*.83)+.025*Math.sin(s.time*1.79)
  q.a=Motion.channel(m,"alpha",p.a*(.84+s.energy*.4)*breath,dt,7)
  q.size=Motion.channel(m,"size",p.size*(.95+.04*Math.sin(s.time*1.3)+s.energy*.12)*fit,dt,5)
  q.core=Motion.channel(m,"core",.55+pulse*(.22+s.dance*.3),dt,13);q.facing=m.facing
  return q
 }).filter(p=>!!p)
 s.points=poses;s.motors=s.motors.slice(0,poses.length)
 if(s.mode==="twins" && !s.children)spawnFamily(s)
 if(finish && s.trip){const t=s.trip;finishTrip(s,t.kind,t.source,t.target);s.points.forEach(p=>{p.owner=s.home;p.containerKind="room";p.containerId=s.home;delete p.lightRenderer;delete p.transportId;delete p.wire;delete p.wireWeight;delete p.wireParameter})}
 s.history.push({time:s.time,points:s.points.map(p=>Object.assign({},p))});while(s.history.length && s.history[0].time<s.time-.6)s.history.shift()
 return s
}
function delayed(s,frames,index){return delayedTime(s,frames===4?.12:.35,index)}
function delayedTime(s,seconds,index){
 const current=s.points[index];if(!current)return {x:0,y:0,a:0,size:1,core:0}
 const time=s.time-seconds;let found=null
 for(const h of s.history){if(h.time<=time)found=h.points[index];else break}
 if(found && found.actorId===current.actorId && found.transportId===current.transportId && current.transportId!==undefined && found.wire && current.wire)return found
 if(!found || found.owner!==current.owner || found.containerKind!==current.containerKind || found.transportId!==current.transportId || found.actorId!==current.actorId)return Object.assign({},current,{a:0})
 return found
}

function spawnFamily(s){
 s.carriers=[];s.familyPhase="greet";s.reunionHome=s.splitHome;s.familyAge=0;s.roamUntil=(s.twinDuration ?? 80)-10+random(s)*20
 s.children=s.points.map((point,index)=>{
  const child=create("family:"+s.rng+":"+s.familySerial+":"+index)
  child.actorId=s.familySerial+":"+index;child.isChild=true;child.home=s.splitHome;child.returnHome=s.splitHome;child.breadcrumbs=[]
  child.points=[Object.assign({},point,{actorId:child.actorId})];child.motors=[Object.assign({},s.motors[index])]
  child.nextSplit=Infinity;child.nextGoal=7+index*2;child.nextTrip=child.nextGoal;child.nextBubble=3;child.stamina=1
  child.time=0;child.clock=s.clock;child.heart=s.heart;child.dance=s.dance;child.energy=s.energy;return child
 })
}
function actors(s){return s.children||[s]}
function acceptPlan(s,message){
 const actor=actors(s).find(a=>(a.actorId===undefined?"single":a.actorId)===(message.actor||"single"))
 if(!actor)return false
 const pending=message.kind==="room"?actor.pendingRoom:actor.pendingPlan
 if(!pending || pending.request!==message.request)return false
 pending.result=message.result;pending.ready=true;return true
}
function requests(s){
 const result=[]
 for(const actor of actors(s))for(const pending of [actor.pendingRoom,actor.pendingPlan])if(pending && !pending.requested){
  pending.requested=true;result.push(Object.assign({},pending,{actor:actor.actorId===undefined?"single":actor.actorId}))
 }
 return result
}
function gatherPose(s,node,walls,context,dt){
 const target=context.gatherTarget,purpose="gather:"+context.gatherId
 if(!s.gather || s.gather.id!==purpose)s.gather={id:purpose,path:null,progress:0}
 if(!s.gather.path){
  if((s.gather.retryAt||0)>s.time)return Object.assign({},s.points[0]||target,{a:1,size:1})
  const path=planRoom(s,node,s.points[0]||target,target,walls,purpose,context)
  if(path===undefined)return Object.assign({},s.points[0]||target,{a:1,size:1})
  if(!path){s.gather.retryAt=s.time+3;return Object.assign({},s.points[0]||target,{a:1,size:1})}
  s.gather.path=path;s.gather.length=Nav.length(path)
 }
 s.gather.progress=Math.min(1,s.gather.progress+dt*.025/Math.max(.001,s.gather.length))
 return Object.assign(Nav.along(s.gather.path,Motion.ease(s.gather.progress)),{a:1,size:1})
}
function advanceFamily(s,dt,shapes,playing,beat,bpm,network,walls,context){
 s.familyAge+=dt
 const home=shapes.find(n=>n.id===s.reunionHome)
 if(s.familyAge>=s.roamUntil && s.familyPhase!=="gather" && s.mode!=="merge")s.familyPhase="return"
 const pair=s.familyPhase==="greet"?playPair(s,home):null
 if(s.familyPhase==="greet" && s.familyAge>7)s.familyPhase="explore"
 for(let i=0;i<s.children.length;i++){
  const child=s.children[i],options=Object.assign({},context)
  if(s.familyPhase==="greet")options.playTarget=pair[i]
  if(s.familyPhase==="return" || s.familyPhase==="gather" || s.mode==="merge"){
   child.returning=true
   if(!child.trip && !child.pendingPlan && child.home!==s.reunionHome && child.journey?.goalRoomId!==s.reunionHome){child.journey=null;returnItinerary(child);child.nextTrip=child.time}
   if(child.home===s.reunionHome && !child.trip){
    child.journey=null;child.nextTrip=Infinity
    if(s.meeting){options.gatherTarget=s.meeting;options.gatherId=s.familySerial}
   }
  }
  advance(child,dt,shapes,playing,beat,bpm,network,walls,options)
 }
 const ready=s.children.every(a=>a.home===s.reunionHome && !a.trip && !a.pendingPlan)
 if(s.familyPhase==="return" && ready){
  s.familyPhase="gather";s.meeting=Physics.safe(home,s.birthLocal?Bubble.world(home,s.birthLocal):s.children[0].points[0],walls)||s.children[0].points[0]
 }
 const near=s.meeting && s.children.every(a=>a.points[0] && Math.hypot(a.points[0].x-s.meeting.x,a.points[0].y-s.meeting.y)<.005)
 if(s.familyPhase==="gather" && near){s.mode="merge";s.mergeAge=0;s.familyPhase="merge"}
 if(s.mode==="merge")s.mergeAge+=dt
 s.points=s.children.map(child=>Object.assign({},child.points[0],{actorId:child.actorId}));s.motors=s.children.map(child=>child.motors[0])
 s.impacts=[];s.carriers=[]
 for(let i=0;i<s.children.length;i++){
  const child=s.children[i];s.impacts.push.apply(s.impacts,child.impacts)
  if(child.carrier)s.carriers.push(Object.assign({},child.carrier,{actorIndex:i}))
 }
 s.carrier=s.carriers[0]||null;s.play=s.mode==="merge"?"reuniting":s.familyPhase==="return"?"return-to-birthplace":s.familyPhase==="gather"?"gathering":s.familyPhase==="greet"?s.play:"independent-twins"
 if(s.mode==="merge"){
  // Both lights stay visible until their actual bodies meet. Total luminance
  // is conserved as two heads become one, never an index-based deletion.
  const fade=.5+.5*(1-Motion.ease(Math.min(1,s.mergeAge/1.0)))
  s.points.forEach(p=>p.a*=fade)
  const a=s.points[0],b=s.points[1],distance=Math.hypot(a.x-b.x,a.y-b.y)
  if(s.mergeAge>=1.1 && distance<.002){
   const merged=Object.assign({},a,{x:(a.x+b.x)/2,y:(a.y+b.y)/2,a:Math.min(1.3,a.a+b.a),owner:s.reunionHome,containerKind:"room",containerId:s.reunionHome})
   delete merged.actorId;delete merged.transportId;delete merged.lightRenderer
   const motor=Object.assign({},s.motors[0],{x:merged.x,y:merged.y,vx:(s.motors[0].vx+s.motors[1].vx)/2,vy:(s.motors[0].vy+s.motors[1].vy)/2,alpha:merged.a})
   s.points=[merged];s.motors=[motor];s.children=null;s.carriers=[];s.carrier=null;s.home=s.reunionHome;s.mode="single";s.familyPhase=null;s.age=0;s.play="reunited";s.local=null;s.pendingRoom=null;s.pendingPlan=null;s.meeting=null;s.nextTrip=s.time+5;s.nextSplit=s.time+120-Math.log(Math.max(.001,random(s)))*180
  }
 }
 s.history.push({time:s.time,points:s.points.map(p=>Object.assign({},p))});while(s.history.length && s.history[0].time<s.time-.6)s.history.shift()
 return s
}
