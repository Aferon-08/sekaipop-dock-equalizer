import fs from 'node:fs';import vm from 'node:vm';import path from 'node:path';import assert from 'node:assert/strict';import {performance} from 'node:perf_hooks';
const root=path.resolve(import.meta.dirname,'..'),cache={};function lib(name){if(cache[name])return cache[name];const text=fs.readFileSync(path.join(root,name),'utf8'),ctx={};for(const m of text.matchAll(/^\.import "([^"]+)" as (\w+)/gm))ctx[m[2]]=lib(m[1]);const c=vm.createContext(ctx);cache[name]=c;vm.runInContext(text.replace(/^\.(pragma|import).*$/gm,''),c,{filename:name});return c}
const P=lib('WallpaperPet.js'),R=lib('GlassRoutes.js'),N=lib('PetNavigation.js'),B=lib('PetBehavior.js'),Bubble=lib('BubbleTransfer.js');
const room=(id,x,y,w=.24,h=.24,kind=0)=>({id,stackKey:id,x,y,w,h,kind,angle:0,glass:1,major:true,phase:0});
const bounds={x:.01,y:.01,width:1.75,height:.98},context={height:1080,bounds,widgets:[]};
const rooms=[room(0,.25,.26,.24,.24,process.env.PET_GEAR?2:0),room(1,.83,.48),room(2,1.4,.72)];const network={nodes:rooms,edges:[{id:'0:1',from:0,to:1,near:false},{id:'1:2',from:1,to:2,near:false}],bounds};
// Red/orange screenshot regression: the physical cubic is direction independent.
const physical=R.geometry(network.edges[0],rooms,bounds),opposite=R.physical({from:1,to:0,id:'0:1',kind:'pipe'},rooms,network,1);
for(let i=0;i<=100;i++){const a=R.sample(physical,i/100),b=R.sample(opposite,1-i/100);assert(Math.hypot(a.x-b.x,a.y-b.y)<1e-12)}
let wireSamples=0;
for(const [start,goal] of [[0,1],[1,0]]){
 const s=P.create('rail-'+start);s.home=start;s.nextTrip=1e9;s.nextGoal=1e9;s.nextSplit=1e9;P.advance(s,1/30,rooms,false,0,0,network,[],context);assert(B.plan(s,s.graph,goal));s.nextTrip=0;
 for(let i=0;i<2000;i++){P.advance(s,1/30,rooms,false,0,0,network,[],context);const p=s.points[0];if(p.wireParameter!==undefined){const expected=R.sample(R.physical(s.trip.edge,rooms,network,s.trip.source),p.wireParameter);assert(Math.hypot(p.x-expected.x,p.y-expected.y)<1e-12);wireSamples++}if(s.home===goal&&!s.trip)break}
 assert.equal(s.home,goal);assert(!s.trip)
}
// Natural, verified curves even in an unobstructed room and free-flight corridor.
const curved=N.flowing([{x:.2,y:.3},{x:.8,y:.3}],.08,1,()=>true);assert(curved.some(p=>Math.abs(p.y-.3)>.05));
const bubble=Bubble.plan(rooms[0],rooms[2],[rooms[0],rooms[2]],[],context,lib("PetPhysics.js").safe(rooms[0],{x:.25,y:.26},[]));assert(!bubble.reason,bubble.reason);assert(bubble.path.length>2);const a=bubble.path[0],b=bubble.path.at(-1),d=Math.hypot(b.x-a.x,b.y-a.y);assert(N.length(bubble.path)>d*1.005);
const family=P.create(process.env.PET_SEED||'family-regression');family.nextTrip=1e9;family.nextGoal=1e9;family.nextSplit=1e9;P.advance(family,1/30,rooms,false,0,0,network,[],context);assert(P.beginSplit(family,rooms));
let seeded=false,diverged=false,merged=false,lastTwo=null,maxStep=0,oldPoints=[],reunionStarted=false;
for(let i=0;i<18000;i++){
 P.advance(family,1/30,rooms,i%1000>400,.65,130,network,[],context);
 if(family.children && !seeded){seeded=true;family.roamUntil=45;family.children.forEach((child,j)=>{child.nextGoal=0;child.nextTrip=0;child.nextBubble=0;const graph=P.navigation(child,rooms,network,[]);assert(B.plan(child,graph,j+1))})}
 if(family.children){
  diverged ||= family.children[0].home!==family.children[1].home;
  reunionStarted ||= family.familyPhase==='return'||family.familyPhase==='gather'||family.mode==='merge';
  for(const child of family.children){const p=child.points[0];assert(p&&Number.isFinite(p.x+p.y));if(p.containerKind==='room'&&!child.trip)assert(R.distance(rooms.find(r=>r.id===p.owner),p)<.001)}
 }
 for(let j=0;j<family.points.length;j++){const p=family.points[j],old=oldPoints[j];if(old && old.actorId===p.actorId)maxStep=Math.max(maxStep,Math.hypot(p.x-old.x,p.y-old.y))}
 if(family.points.length===2)lastTwo=family.points.map(p=>({...p}));
 if(seeded&&!family.children&&family.mode==='single'){
  merged=true;assert(lastTwo);assert(Math.hypot(lastTwo[0].x-lastTwo[1].x,lastTwo[0].y-lastTwo[1].y)<.0025,'both heads meet before one is removed');assert.equal(family.home,0);break
 }
 oldPoints=family.points.map(p=>({...p}));
}
assert(seeded&&diverged&&reunionStarted&&merged,'independent journeys and reunion: '+JSON.stringify({seeded,diverged,reunionStarted,merged,phase:family.familyPhase,actors:family.children?.map(a=>({home:a.home,play:a.play,trip:a.trip?.kind,crumbs:a.breadcrumbs.length,reason:a.replanReason,goal:a.journey?.goalRoomId,request:a.pendingRoom?.purpose,gather:a.gather,point:a.points[0],meeting:family.meeting}))}));
assert(maxStep<.02);
console.log(JSON.stringify({pass:true,canonicalSamples:101,wireSamples,curvedLocal:true,curvedBubble:true,independentHomes:diverged,reunitedAtBirthplace:merged,maxStep,lastHeadSeparation:Math.hypot(lastTwo[0].x-lastTwo[1].x,lastTwo[0].y-lastTwo[1].y)},null,2));

console.log('PASS tube rail in both directions, independent twins and reunion');

const trail=P.create('trail-handoff');trail.points=[{x:1,y:0,a:1,size:1,owner:null,containerKind:'pipe',transportId:9,wire:{},actorId:'1:0'}];trail.time=1;trail.history=[{time:.8,points:[{x:.9,y:0,a:.8,size:1,owner:0,containerKind:'room',transportId:9,wire:{},actorId:'1:0'}]}];assert.equal(P.delayedTime(trail,.12,0).a,.8);trail.history[0].points[0].transportId=10;assert.equal(P.delayedTime(trail,.12,0).a,0);console.log('PASS continuous trail across tube handoff, foreign transport history excluded');
