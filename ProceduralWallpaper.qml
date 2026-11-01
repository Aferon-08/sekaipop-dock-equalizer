pragma ComponentBehavior: Bound
import QtQuick
import Quickshell.Io
import "WallpaperLayout.js" as Layout
Item {
 id:root
 required property string seed
 required property string screenName
 required property var theme
 property var settings:({})
 property var widgetAreas:[]
 property var music:null
 readonly property var pet:petController
 readonly property var wires:wireNetwork
 WallpaperPet {id:petController;scene:root;music:root.music}
 property bool working:true
 property string barEdge:"bottom"
 property real barExtent:0
 readonly property rect safeRect:{
  const m=16, gap=barExtent>0?barExtent+12:0
  const l=m+(barEdge==="left"?gap:0),r=m+(barEdge==="right"?gap:0)
  const t=m+(barEdge==="top"?gap:0),b=m+(barEdge==="bottom"?gap:0)
  return Qt.rect(l,t,Math.max(1,width-l-r),Math.max(1,height-t-b))
 }
 readonly property bool entering:intro<4
 signal newComposition()
 property bool animateIntro:true
 property int layoutRevision:0
 property bool ready:false
 property real intro:0
 property real motionTime:0
 property real ambientTime:0
 property double lastAmbientTick:0
 readonly property bool managesPetClock:true
 readonly property real movement:settings.wallpaperMotion===false?0:(settings.wallpaperMotionAmount ?? 1)
 readonly property real lighting:Math.min(1,Math.max(0,(intro-.75)/.8))
 readonly property string density:settings.wallpaperDensity||"auto"
 readonly property real glassAmount:settings.wallpaperGlass===undefined?.65:settings.wallpaperGlass
 readonly property real aspect:width/Math.max(1,height)
 readonly property var layout:Layout.generate(seed,screenName,aspect,density,glassAmount,{x:safeRect.x/Math.max(1,height),y:safeRect.y/Math.max(1,height),width:safeRect.width/Math.max(1,height),height:safeRect.height/Math.max(1,height)},widgetAreas.map(r=>({x:r.x/Math.max(1,height),y:r.y/Math.max(1,height),width:r.width/Math.max(1,height),height:r.height/Math.max(1,height)})),height)
 function mix(a,b,t){return Qt.rgba(a.r+(b.r-a.r)*t,a.g+(b.g-a.g)*t,a.b+(b.b-a.b)*t,1)}
 readonly property color accentA:theme.accentCyan
 readonly property color accentB:theme.accentMint
 readonly property bool dark:!!theme.dark
 property color base:dark?mix(theme.surface,accentA,.12):mix(Qt.color("#fcfaf6"),accentA,.14)
 property color a:dark?mix(accentA,theme.surface,.25):mix(accentA,Qt.color("#ffffff"),.23)
 property color b:dark?mix(accentB,theme.surface,.25):mix(accentB,Qt.color("#ffffff"),.23)
 property color c:dark?mix(mix(accentA,accentB,.5),Qt.color("#ffffff"),.10):mix(mix(accentA,accentB,.5),Qt.color("#ffffff"),.48)
 readonly property var colors:[a,b,c]
 property color petColor:mix(accentA,accentB,.35)
 Behavior on petColor {ColorAnimation {duration:root.settings.paletteDuration ?? 1400}}
 readonly property color highlight:mix(Qt.color("#ffffff"),accentB,.10)
 Behavior on base {ColorAnimation {id:baseAnimation;duration:root.settings.paletteDuration ?? 1400}}
 Behavior on a {ColorAnimation {id:aAnimation;duration:root.settings.paletteDuration ?? 1400}}
 Behavior on b {ColorAnimation {id:bAnimation;duration:root.settings.paletteDuration ?? 1400}}
 Behavior on c {ColorAnimation {id:cAnimation;duration:root.settings.paletteDuration ?? 1400}}
 clip:true
 function replay(){intro=0;arrival.restart()}
 onLayoutChanged:{layoutRevision++;recapture.restart();if(ready && animateIntro) replay()}
 Component.onCompleted:{ready=true;if(animateIntro) replay();else intro=4}
 NumberAnimation {id:arrival;target:root;property:"intro";from:0;to:4;duration:root.settings.wallpaperIntro ?? 4000;running:false;paused:running && !root.working;onFinished:{capture.scheduleUpdate();wallCapture.scheduleUpdate()}}
 // One bounded 60Hz visual clock / 30Hz physics accumulator per monitor.
 property real logicAccumulator:0
 property double lastLogicTick:0
 Timer {interval:16;repeat:true;running:root.working && root.visible && (root.movement>0 || root.pet.active)
  onRunningChanged:{root.lastAmbientTick=Date.now();root.lastLogicTick=Date.now();root.logicAccumulator=0}
  onTriggered:{
   const now=Date.now(),dt=Math.max(0,Math.min(.05,(now-root.lastAmbientTick)/1000));root.lastAmbientTick=now
   if(root.movement>0)root.motionTime+=dt
   root.logicAccumulator+=dt
   let steps=0
   while(root.logicAccumulator>=1/30 && steps<2){
    if(root.pet.active)root.pet.tick(1/30)
    root.logicAccumulator-=1/30;steps++
   }
   if(steps>0 && !root.entering && root.backdropNeeded){capture.scheduleUpdate();wallCapture.scheduleUpdate()}
   root.pet.blend=Math.min(1,root.logicAccumulator*30)
  }
 }
 Rectangle {anchors.fill:parent;color:"black"}
 Item {
  id:opaqueScene;anchors.fill:parent
  ShaderEffect {
   anchors.fill:parent
   opacity:Math.min(1,Math.max(0,(root.intro-.12)/.48))
   property vector2d resolution:Qt.vector2d(width,height)
   property color baseColor:root.base
   property color colorA:root.a
   property color colorB:root.b
   property real lightAmount:root.lighting
   property real variant:root.layout.mode
   fragmentShader:Qt.resolvedUrl("wallpaper-background.frag.qsb")
  }
  WallpaperViewport {scene:root
  Repeater {
   model:root.layout.shapes.filter(o=>!o.glass)
   WallpaperObject {required property var modelData;model:modelData;scene:root;backdrop:null}
  }
  }
 }
 // Glass samples a live, capped backdrop throughout entrance and ambient motion.
 // The visible scene remains direct: no material/resolution switch at the end.
 readonly property bool backdropNeeded: working && (movement>0 || baseAnimation.running || aAnimation.running || bAnimation.running || cAnimation.running)
 readonly property bool backdropLive: working && (entering || (movement===0 && (baseAnimation.running || aAnimation.running || bAnimation.running || cAnimation.running)))
 ShaderEffectSource {
  id:capture;anchors.fill:parent;sourceItem:opaqueScene;hideSource:false;live:root.backdropLive;visible:false
  textureSize:Qt.size(Math.min(root.settings.wallpaperTexture ?? 1280,root.width),Math.min(root.settings.wallpaperTexture ?? 1280,root.width)*root.height/Math.max(1,root.width))
 }
 Timer {id:recapture;interval:150;onTriggered:{capture.scheduleUpdate();wallCapture.scheduleUpdate()}}
 onBaseChanged:recapture.restart()
 onAChanged:recapture.restart()
 onBChanged:recapture.restart()
 onWidthChanged:recapture.restart()
 onHeightChanged:recapture.restart()
 readonly property var plasticMask:wallCapture
 Item {
  id:wallSilhouettes;anchors.fill:parent
  Repeater {
   model:root.layout.shapes.filter(o=>!o.glass)
   WallpaperObject {required property var modelData;model:modelData;scene:root;backdrop:null;maskOnly:true;visible:root.pet.active}
  }
 }
 ShaderEffectSource {
  id:wallCapture;sourceItem:wallSilhouettes;hideSource:true;visible:false
  live:root.working && root.entering
  textureSize:Qt.size(Math.min(root.settings.wallpaperTexture ?? 1280,root.width),Math.min(root.settings.wallpaperTexture ?? 1280,root.width)*root.height/Math.max(1,root.width))
 }
 WallpaperViewport {scene:root
 WallpaperWires {id:wireNetwork;anchors.fill:parent;scene:root}
 Repeater {
  model:2
  WallpaperWireGlow {
   required property int index
   scene:root
   pose:root.pet.points[index] || ({x:0,y:0,a:0,size:1})
   nearPose:root.pet.near[index] || pose
   farPose:root.pet.far[index] || pose
  }
 }
 Repeater {
  model:root.layout.shapes
  Item {
   id:figureLayer
   required property var modelData
   required property int index
   anchors.fill:parent
   WallpaperObject {model:parent.modelData;scene:root;backdrop:capture;visible:model.glass || model.id>(root.layout.shapes.find(o=>o.glass)?.id ?? 99999)}
   Repeater {
    model:2
    WallpaperBubble {required property int index;scene:root;backdrop:capture;stackKey:figureLayer.index;actorIndex:index}
   }
  }
 }
 Repeater {
  model:root.layout.shapes.filter(o=>o.glass)
  WallpaperObject {required property var modelData;model:modelData;scene:root;backdrop:null;membraneOverlay:true}
 }
 Repeater {
  model:root.layout.shapes.filter(o=>o.glass)
  WallpaperObject {required property var modelData;model:modelData;scene:root;backdrop:null;occupancyOverlay:true}
 }
 } // overlay viewport
 property IpcHandler ipc: IpcHandler {
  target:"proceduralwallpaper-"+root.screenName
  function status():string {return JSON.stringify(root.status())}
  function splitPet():string {return root.pet.splitNow()?"started":"not ready"}
  function regenerate():void {root.newComposition()}
  function snapshot(path:string):void {root.grabToImage(result=>result.saveToFile(path))}
 }
 function status(){return {pet:petController.status(),petColor:String(petColor),seed:seed,screen:screenName,rich:layout.rich,mode:layout.mode,backdropLive:backdropLive,barEdge:barEdge,barExtent:barExtent,safeRect:{x:safeRect.x,y:safeRect.y,width:safeRect.width,height:safeRect.height},widgets:widgetAreas.length,layoutRevision:layoutRevision,geometryHash:Layout.hash(JSON.stringify(layout.shapes)),wires:layout.links.length,objects:layout.shapes.length,glass:layout.shapes.filter(o=>o.glass).length,intro:intro,moving:working&&movement>0,motionTime:motionTime}}
}
