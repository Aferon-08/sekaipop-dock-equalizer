import QtQuick
import QtQml.WorkerScript
import "WallpaperPet.js" as Pet
import "GlassRoutes.js" as Routes
QtObject {
 id:root
 required property var scene
 property var music:null
 property int generation:0
 property WorkerScript planner:WorkerScript {
  source:Qt.resolvedUrl("PetPlannerWorker.mjs")
  onMessage:message=>{if(message.generation===root.generation)Pet.acceptPlan(root.state,message)}
 }
 property var state:Pet.create(scene.seed+":"+scene.screenName)
 property var targetPoints:[]
 property var fromPoints:[]
 property real blend:1
 function interpolatePoint(a,b,u){if(!a)return b;return Object.assign({},b,{x:a.x+(b.x-a.x)*u,y:a.y+(b.y-a.y)*u,a:a.a+(b.a-a.a)*u,size:a.size+(b.size-a.size)*u,core:a.core+(b.core-a.core)*u,wireWeight:(a.wireWeight||0)+((b.wireWeight||0)-(a.wireWeight||0))*u})}
 property var points:targetPoints.map((p,i)=>interpolatePoint(fromPoints[i] || fromPoints[0],p,blend))
 property var near:[]
 property var far:[]
 property var impacts:[]
 property var targetCarriers:[]
 property var fromCarriers:[]
 function interpolateCarrier(a,b){
  if(!a || a.id!==b.id)return b
  const t=Object.assign({},b)
  if(a.bubble && b.bubble)t.bubble={x:a.bubble.x+(b.bubble.x-a.bubble.x)*blend,y:a.bubble.y+(b.bubble.y-a.bubble.y)*blend,r:a.bubble.r+(b.bubble.r-a.bubble.r)*blend}
  t.smoothing=a.smoothing+(b.smoothing-a.smoothing)*blend
  return t
 }
 readonly property var carriers:targetCarriers.map(b=>interpolateCarrier(fromCarriers.find(a=>a.id===b.id),b))
 readonly property var carrier:carriers[0]||null
 readonly property var layers:Routes.posed(scene.layout.shapes.map((o,i)=>Object.assign({},o,{stackKey:i})).filter(o=>o.glass),scene.motionTime,scene.movement,scene.height)
 readonly property var plastics:Routes.posed(scene.layout.shapes.map((o,i)=>Object.assign({},o,{stackKey:i})).filter(o=>!o.glass),scene.motionTime,scene.movement,scene.height)
 readonly property var glass:layers
 readonly property bool active:scene.working && scene.visible && scene.intro>=4 && (!scene.wires || scene.wires.growth>=.99) && scene.settings.wallpaperPet!==false && glass.length>0
 property double lastTick:0
 property double standaloneLogicTime:0
 property real standaloneAccum:0
 function splitNow(){return active && !state.children && Pet.beginSplit(state,glass)}
 function reset(){generation++;state=Pet.create(scene.seed+":"+scene.screenName);targetPoints=[];fromPoints=[];near=[];far=[];impacts=[];targetCarriers=[];fromCarriers=[];blend=1}
 property Connections sceneSignals:Connections {target:root.scene;function onLayoutChanged(){root.reset()}}
 function tick(dt){
  const oldPoints=targetPoints.slice(),oldCarriers=targetCarriers.slice()
  const s=Pet.advance(state,dt,glass,!!music?.playing,Number(music?.beatPulse)||0,Number(music?.beatBpm)||0,scene.layout.network,plastics,{asynchronous:true,height:scene.height,bounds:scene.layout.network.bounds,widgets:(scene.widgetAreas || []).map(r=>({x:r.x/scene.height,y:r.y/scene.height,width:r.width/scene.height,height:r.height/scene.height}))})
  if(planner.ready)for(const request of Pet.requests(s))planner.sendMessage(Object.assign({},request,{generation:generation}))
  fromPoints=oldPoints;fromCarriers=oldCarriers;targetCarriers=s.children?(s.carriers||[]):s.carrier?[Object.assign({},s.carrier,{actorIndex:0})]:[]
  impacts=s.impacts.slice();targetPoints=s.points.slice();blend=0
  near=[Pet.delayedTime(s,.12,0),Pet.delayedTime(s,.12,1)];far=[Pet.delayedTime(s,.35,0),Pet.delayedTime(s,.35,1)]

 }
 property Timer clock:Timer {
  interval:16;repeat:true;running:root.active && !root.scene.managesPetClock
  onRunningChanged:{root.lastTick=Date.now();root.standaloneLogicTime=root.lastTick;root.standaloneAccum=0}
  onTriggered:{
   const now=Date.now(),dt=Math.min(.05,(now-root.lastTick)/1000);root.lastTick=now;root.standaloneAccum+=dt
   let count=0;while(root.standaloneAccum>=1/30 && count<2){root.tick(1/30);root.standaloneAccum-=1/30;count++}
   root.blend=Math.min(1,root.standaloneAccum*30)
  }
 }
 function owns(id){return active && points.some(p=>p.owner===id && p.a>0)}
 function coverage(list,index,id){
  const p=list[index];if(!p || p.owner!==id)return 0
  const start=layers.findIndex(n=>n.id===id);let covered=0
  for(let i=start+1;i<layers.length;i++)covered=Math.max(covered,1-Pet.smooth((Routes.distance(layers[i],p)+.012)/.024))
  return covered
 }
 function lightFor(list,index,id){
  const p=list[index]
  if(!active || !points[index] || points[index].owner!==id || points[index].lightRenderer==="carrier" || !p || p.owner!==id)return Qt.vector4d(0,0,0,1)
  const hidden=coverage(list,index,id)
  return Qt.vector4d(p.x*scene.height,p.y*scene.height,p.a*(1-hidden*.25)*(1-(p.wireWeight||0)),p.size*(1+hidden*.2))
 }
 function light(list,index){const p=active?list[index]:null;return p?Qt.vector4d(p.x*scene.height,p.y*scene.height,p.a,p.size):Qt.vector4d(0,0,0,1)}
 readonly property vector4d first:light(points,0)
 readonly property vector4d second:light(points,1)
 readonly property vector4d nearFirst:light(near,0)
 readonly property vector4d nearSecond:light(near,1)
 readonly property vector4d farFirst:light(far,0)
 readonly property vector4d farSecond:light(far,1)
 readonly property real core:points.length?points[0].core:0
 function dent(id){
  if(!active)return Qt.vector4d(0,0,0,1)
  const transfer=carriers.map(t=>t.dent).find(d=>d && d.id===id)
  if(transfer && transfer.id===id)return Qt.vector4d(transfer.at.x*scene.height,transfer.at.y*scene.height,transfer.amount*scene.height,transfer.radius*scene.height)
  const hit=impacts.filter(h=>h.id===id).slice(-1)[0]
  return hit?Qt.vector4d(hit.x*scene.height,hit.y*scene.height,Pet.impactValue(hit)*scene.height,Math.min(80,scene.height*.07)):Qt.vector4d(0,0,0,1)
 }
 function bud(id,index){
  const t=carriers.filter(t=>t.union===id && t.bubble)[index||0]
  return t?Qt.vector4d(t.bubble.x*scene.height,t.bubble.y*scene.height,t.bubble.r*scene.height,t.smoothing*scene.height):Qt.vector4d(0,0,0,0)
 }
 function status(){
  const t=state.trip,j=state.journey,m=state.motors[0]
  return {actors:Pet.actors(state).map(a=>({id:a.actorId,home:a.home,goal:a.journey?.goalRoomId,route:a.journey?.path,activity:a.play,trip:a.trip?.kind,returning:!!a.returning})),familyPhase:state.familyPhase,reunionHome:state.reunionHome,active:active,mode:state.mode,activity:state.play,membrane:impacts.some(h=>Math.abs(Pet.impactValue(h))>.0001),home:state.home,owner:points.length?points[0].owner:null,travel:!!t,count:points.length,age:state.age,nextSplit:state.nextSplit-state.time,dance:state.dance,goal:j?.goalRoomId,route:j?.path,step:j?.stepIndex,steps:j?.steps.map(e=>e.kind),cost:j?.cost,replanReason:state.replanReason,stamina:state.stamina,velocity:m?{x:m.vx,y:m.vy}:null,trip:t?{id:t.id,kind:t.kind,phase:t.phase,source:t.source,target:t.target,age:t.age,progress:t.progress,depth:t.plan?.travelStackKey}:null}
 }
}
