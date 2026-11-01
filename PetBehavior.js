.pragma library
.import "PetNavigation.js" as Nav
.import "PetPhysics.js" as Physics
function random(s){s.rng=(Math.imul(s.rng,1664525)+1013904223)>>>0;return s.rng/4294967296}
function initialize(s){s.stamina=1;s.visits={};s.deferred={};s.journey=null;s.journeySerial=0;s.nextGoal=12+random(s)*12;s.nextBubble=12;s.nextLocal=0;s.local=null;s.replanReason="initial"}
function chooseGoal(s,graph){
 let selected=null,score=-1
 for(const n of graph.nodes){if(n.id===s.home || (s.deferred[n.id]||0)>s.time || !Nav.search(graph,s.home,n.id))continue
  const last=s.visits[n.id],novel=last===undefined?2.5:Math.min(2,(s.time-last)/90)
  const value=novel+.2+random(s)*.8
  if(value>score){score=value;selected=n.id}
 }
 return selected
}
function plan(s,graph,goal){
 const result=Nav.search(graph,s.home,goal)
 s.replanReason=result?"goal committed":"no traversable route"
 if(!result){s.deferred[goal]=s.time+30;s.nextGoal=s.time+8;return false}
 s.journey={id:++s.journeySerial,goalRoomId:goal,path:result.path,steps:result.steps,stepIndex:0,cost:result.cost,failures:0,started:s.time};return true
}
function completed(s,kind){
 s.stamina=Math.max(0,s.stamina-({pipe:.02,near:.12,bubble:.32}[kind]||0))
 if(s.journey){s.journey.stepIndex++;s.journey.failures=0
  if(s.home===s.journey.goalRoomId){s.visits[s.home]=s.time;s.journey=null;s.nextGoal=s.time+12+random(s)*18;s.nextTrip=s.nextGoal}
  else s.nextTrip=s.time+.8+random(s)*1.7
 }
 s.local=null;s.nextLocal=0
}
function localTarget(s,node,walls){
 if(!s.local || (s.time>=s.nextLocal && (s.local.finished || s.local.failed || s.time-s.local.started>18))){
  const resting=s.play==="rest",mode=resting?"rest":random(s)<.22?"observe":"explore"
  let target=(mode!=="explore" && s.points[0])?{x:s.points[0].x,y:s.points[0].y}:null
  for(let i=0;i<12 && !target;i++){
   const a=random(s)*Math.PI*2,r=Math.sqrt(random(s))*.8
   const p={x:node.x+Math.cos(a)*node.w*.5*r,y:node.y+Math.sin(a)*node.h*.5*r}
   const candidate=Physics.safe(node,p,walls)
   if(candidate && Physics.clearance(node,candidate,Physics.blockers(node,walls),true)>.011)target=candidate
  }
  s.local={target:target||Physics.safe(node,{x:node.x,y:node.y},walls)||{x:node.x,y:node.y},mode:mode,path:null,index:1,started:s.time}
  s.nextLocal=s.time+(resting?2:1.8)+random(s)*(resting?3:4)
 }
 return s.local.target
}
