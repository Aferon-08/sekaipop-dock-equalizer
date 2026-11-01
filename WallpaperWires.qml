pragma ComponentBehavior: Bound
import QtQuick
import QtQuick.Shapes
import "GlassRoutes.js" as Routes
Item {
 id:root
 required property var scene
 readonly property var nodes:Routes.posed(scene.layout.network.nodes,scene.motionTime,scene.movement,scene.height)
 property real growth:0
 Connections {
  target:root.scene
  function onIntroChanged(){if(root.scene.intro<2.8)root.growth=0}
 }
 opacity:Math.min(1,Math.max(0,(scene.intro-2.65)/.35))
 NumberAnimation {
  target:root;property:"growth";from:0;to:1;duration:1700
  running:root.scene.intro>=2.8
  paused:running && !root.scene.working
  easing.type:Easing.InOutCubic
 }
 function progress(index){return Math.max(0,Math.min(1,(growth-index*.045)/(1-index*.045)))}
 function extrusion(id){
  if(growth<=0 || growth>=1 || scene.intro<2.8)return Qt.vector4d(0,0,0,1)
  const edge=scene.layout.network.edges.find(e=>!e.near && e.from===id)
  if(!edge)return Qt.vector4d(0,0,0,1)
  const g=Routes.geometry(edge,nodes,scene.layout.network.bounds)
  return g?Qt.vector4d(g.a.x*scene.height,g.a.y*scene.height,Math.sin(Math.PI*growth)*scene.height*.012,scene.height*.065):Qt.vector4d(0,0,0,1)
 }
 Repeater {
  model:root.scene.layout.network.edges.filter(e=>!e.near)
  Item {
   id:wire
   required property int index
   required property var modelData
   anchors.fill:parent
   readonly property var geometry:Routes.geometry(modelData,root.nodes,root.scene.layout.network.bounds)
   readonly property real progress:root.progress(index)
   readonly property var curve:geometry?Routes.prefix(geometry,progress):({a:{x:0,y:0},b:{x:0,y:0},c1:{x:0,y:0},c2:{x:0,y:0}})
   readonly property real h:root.scene.height
   readonly property real stemWidth:7+Math.sin(Math.PI*progress)*5
   visible:!!geometry && progress>0
   Shape {
    anchors.fill:parent;preferredRendererType:Shape.CurveRenderer
    ShapePath {
     strokeColor:Qt.rgba(root.scene.highlight.r,root.scene.highlight.g,root.scene.highlight.b,.15)
     strokeWidth:wire.stemWidth;fillColor:"transparent";capStyle:ShapePath.RoundCap
     startX:wire.curve.a.x*wire.h;startY:wire.curve.a.y*wire.h
     PathCubic {x:wire.curve.b.x*wire.h;y:wire.curve.b.y*wire.h;control1X:wire.curve.c1.x*wire.h;control1Y:wire.curve.c1.y*wire.h;control2X:wire.curve.c2.x*wire.h;control2Y:wire.curve.c2.y*wire.h}
    }
    ShapePath {
     strokeColor:Qt.rgba(root.scene.highlight.r,root.scene.highlight.g,root.scene.highlight.b,.48)
     strokeWidth:1.2;fillColor:"transparent";capStyle:ShapePath.RoundCap
     startX:wire.curve.a.x*wire.h;startY:wire.curve.a.y*wire.h
     PathCubic {x:wire.curve.b.x*wire.h;y:wire.curve.b.y*wire.h;control1X:wire.curve.c1.x*wire.h;control1Y:wire.curve.c1.y*wire.h;control2X:wire.curve.c2.x*wire.h;control2Y:wire.curve.c2.y*wire.h}
    }
   }
   Rectangle {
    visible:wire.progress<1
    width:wire.stemWidth*1.15;height:width;radius:width/2
    x:wire.curve.b.x*wire.h-width/2;y:wire.curve.b.y*wire.h-height/2
    color:Qt.rgba(root.scene.highlight.r,root.scene.highlight.g,root.scene.highlight.b,.6)
    opacity:Math.min(1,(1-wire.progress)*8)
   }
  }
 }
}
