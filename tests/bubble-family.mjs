import fs from 'node:fs';import vm from 'node:vm';import path from 'node:path';import assert from 'node:assert/strict';
const root=path.resolve(import.meta.dirname,'..'),cache={};function lib(name){if(cache[name])return cache[name];const text=fs.readFileSync(path.join(root,name),'utf8'),ctx={};for(const m of text.matchAll(/^\.import "([^"]+)" as (\w+)/gm))ctx[m[2]]=lib(m[1]);const c=vm.createContext(ctx);cache[name]=c;vm.runInContext(text.replace(/^\.(pragma|import).*$/gm,''),c);return c}
const P=lib('WallpaperPet.js'),B=lib('PetBehavior.js'),R=lib('GlassRoutes.js'),Bounds={x:.02,y:.02,width:1.73,height:.96},C={height:1080,bounds:Bounds,widgets:[]};
const rooms=[{id:0,stackKey:0,x:.82,y:.49,w:.28,h:.28,angle:0,kind:0,glass:1},{id:1,stackKey:1,x:.25,y:.23,w:.3,h:.3,angle:5,kind:0,glass:1},{id:2,stackKey:2,x:1.42,y:.74,w:.3,h:.3,angle:-5,kind:0,glass:1}],net={nodes:rooms,edges:[],bounds:Bounds};
let totalTransfers=0;
for(let seed=0;seed<4;seed++){
 const s=P.create('separate-bubbles-'+seed);s.home=0;s.nextSplit=1e9;s.nextTrip=1e9;s.nextGoal=1e9;P.advance(s,1/30,rooms,false,0,0,net,[],C);P.beginSplit(s,rooms);let seeded=false,simultaneous=false,distinct=false,merged=false,lastTwo=null;const ids=new Set();
 for(let i=0;i<12000;i++){
  P.advance(s,1/30,rooms,false,0,0,net,[],C);
  if(s.children&&!seeded){seeded=true;s.roamUntil=35;for(let j=0;j<2;j++){const a=s.children[j];a.nextTrip=0;a.nextGoal=0;a.nextBubble=0;B.plan(a,P.navigation(a,rooms,net,[]),j+1)}}
  if(s.children){
   simultaneous||=s.carriers.length===2;distinct||=s.children[0].home!==s.children[1].home
   for(const a of s.children)if(a.carrier){ids.add(a.carrier.id);const p=a.points[0];assert(p.lightRenderer==='carrier'||p.containerKind==='room');if(a.carrier.phase==='float')assert(Math.hypot(p.x-a.carrier.bubble.x,p.y-a.carrier.bubble.y)<a.carrier.plan.radius*.6)}
   if(s.points.length===2)lastTwo=s.points.map(p=>({...p}))
  }
  if(seeded&&!s.children&&s.mode==='single'){merged=true;assert.equal(s.home,0);assert(Math.hypot(lastTwo[0].x-lastTwo[1].x,lastTwo[0].y-lastTwo[1].y)<.0025);break}
 }
 assert(simultaneous&&distinct&&merged,JSON.stringify({seed,simultaneous,distinct,merged,actors:s.children?.map(a=>({home:a.home,phase:a.play,reason:a.replanReason,crumbs:a.breadcrumbs.length}))}));assert(ids.size>=4);totalTransfers+=ids.size;
}
console.log(JSON.stringify({pass:true,seeds:4,twoSimultaneousCarriers:true,independentBubbleJourneys:true,verifiedReturnAndMergeAtBirthplace:true,uniqueTransportIds:totalTransfers},null,2));
// A plastic wall can divide one glass room into disconnected chambers. The
// reunion belongs to the original chamber, not the geometric centre.
{
 const wall={id:20,stackKey:20,x:.82,y:.49,w:.016,h:.45,angle:0,kind:0,glass:0};const s=P.create('birth-chamber');s.home=0;s.nextGoal=1e9;s.nextTrip=1e9;s.nextSplit=1e9;
 const p={x:.75,y:.49,a:1,size:1,core:.6,owner:0,containerKind:'room',containerId:0};s.points=[p];s.motors=[lib('PetMotion.js').create(p)];P.beginSplit(s,rooms);let begun=false,done=false;
 for(let i=0;i<4000;i++){P.advance(s,1/30,rooms,false,0,0,net,[wall],C);if(s.children&&!begun){begun=true;s.roamUntil=3;for(const a of s.children){a.nextGoal=1e9;a.nextTrip=1e9}}if(begun&&!s.children&&s.mode==='single'){done=true;break}}
 assert(done,'reunion stays in the safe birth chamber');assert(s.points[0].x<wall.x-wall.w/2);console.log('PASS reunion behind a separating plastic wall');
}
