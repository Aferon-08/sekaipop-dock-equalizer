import QtQuick
import QtQuick.Window
Item {
 id:root
 required property var model
 required property var scene
 required property var backdrop
 property bool maskOnly:false
 property bool membraneOverlay:false
 property bool occupancyOverlay:false
 readonly property bool owned:occupancyOverlay && !!scene.pet && scene.pet.owns(model.id)
 property real rimProgress:0
 property real rimOrigin:0
 onOwnedChanged:{
  if(owned){
   const p=scene.pet.points.find(p=>p.owner===model.id)
   if(p){const a=-rotation*Math.PI/180,dx=p.x*h-(x+width/2),dy=p.y*h-(y+height/2);rimOrigin=Math.atan2((dx*Math.sin(a)+dy*Math.cos(a))/model.h,(dx*Math.cos(a)-dy*Math.sin(a))/model.w)}
  }
  rimProgress=owned?1:0
 }
 Behavior on rimProgress {NumberAnimation {duration:620;easing.type:Easing.OutCubic}}
 property real t: scene.motionTime
 readonly property real h:scene.height
 readonly property vector4d bubble:scene.pet && typeof scene.pet.bud==="function"?scene.pet.bud(model.id):Qt.vector4d(0,0,0,0)
 readonly property vector4d secondBubble:scene.pet && typeof scene.pet.bud==="function"?scene.pet.bud(model.id,1):Qt.vector4d(0,0,0,0)
 readonly property real stackDepth:(scene.layout.shapes.findIndex(o=>o.id===model.id)+1)/64
 readonly property real paintPad:model.glass?Math.max(48,bubble.z>0 || secondBubble.z>0?h*.12:48):32
 readonly property real settle:Math.min(1,Math.max(0,(scene.intro-model.delay)/1.05))
 // A small, single overshoot; the value is held at 1 once arrival completes.
 readonly property real ease:settle>=1?1:settle*settle*settle*(10+settle*(-15+6*settle))
 readonly property real drift:scene.movement*(model.major?2.5:4)
 readonly property real targetX:model.x*h+Math.sin(t*.24+model.phase)*drift
 readonly property real targetY:model.y*h+Math.sin(t*.19+model.phase*1.7)*drift
 readonly property real originX:model.edge===0?-width:model.edge===1?scene.width+width:targetX
 readonly property real originY:model.edge===2?-height:model.edge===3?scene.height+height:targetY
 x:originX+(targetX-originX)*ease-width/2
 y:originY+(targetY-originY)*ease-height/2
 width:model.w*h+paintPad*2;height:model.h*h+paintPad*2
 rotation:model.angle+(1-ease)*(model.edge%2?10:-10)+Math.sin(settle*Math.PI*2)*Math.pow(Math.sin(settle*Math.PI),2)*1.2+Math.sin(t*.12+model.phase)*scene.movement*.55
 opacity:Math.min(1,settle*5)
 visible:occupancyOverlay?owned:(!membraneOverlay || ((!!scene.pet && Math.abs(scene.pet.dent(model.id).z)>.05)
  || (!!scene.wires && Math.abs(scene.wires.extrusion(model.id).z)>.05)))
 ShaderEffect {
  layer.enabled:root.model.glass===0 && !root.maskOnly
  layer.smooth:true
  layer.mipmap:true
  // Supersample only cached opaque materials, with a 2048px allocation cap.
  readonly property real cacheScale:Math.min(2*Math.max(1,Screen.devicePixelRatio),2048/Math.max(1,width,height))
  layer.textureSize:Qt.size(Math.max(1,Math.ceil(width*cacheScale)),Math.max(1,Math.ceil(height*cacheScale)))
  anchors.fill:parent
  property vector2d resolution:Qt.vector2d(width,height)
  property vector2d coreSize:Qt.vector2d(root.model.w*root.h,root.model.h*root.h)
  property vector2d sceneSize:Qt.vector2d(Math.max(1,root.scene.width),Math.max(1,root.scene.height))
  property vector2d center:root.model.glass?Qt.vector2d(root.x+root.width/2,root.y+root.height/2):Qt.vector2d(0,0)
  property color fillColor:root.scene.colors[root.model.color]
  property color lightColor:root.scene.highlight
  property real kind:root.model.kind
  property real glass:root.model.glass
  property real angle:root.model.glass?root.rotation*Math.PI/180:0
  property real illumination:root.scene.lighting
  property real shimmer:root.model.glass?.5+.8*Math.sin(root.t*.10+root.model.phase):0
  property vector4d pet0:root.occupancyOverlay && root.scene.pet?root.scene.pet.lightFor(root.scene.pet.points,0,root.model.id):Qt.vector4d(0,0,0,1)
  property vector4d pet1:root.occupancyOverlay && root.scene.pet?root.scene.pet.lightFor(root.scene.pet.points,1,root.model.id):Qt.vector4d(0,0,0,1)
  property vector4d petNear0:root.occupancyOverlay && root.scene.pet?root.scene.pet.lightFor(root.scene.pet.near,0,root.model.id):Qt.vector4d(0,0,0,1)
  property vector4d petNear1:root.occupancyOverlay && root.scene.pet?root.scene.pet.lightFor(root.scene.pet.near,1,root.model.id):Qt.vector4d(0,0,0,1)
  property vector4d petFar0:root.occupancyOverlay && root.scene.pet?root.scene.pet.lightFor(root.scene.pet.far,0,root.model.id):Qt.vector4d(0,0,0,1)
  property vector4d petFar1:root.occupancyOverlay && root.scene.pet?root.scene.pet.lightFor(root.scene.pet.far,1,root.model.id):Qt.vector4d(0,0,0,1)
  property vector4d dent:{
   if(!root.model.glass)return Qt.vector4d(0,0,0,1)
   const hit=root.scene.pet && typeof root.scene.pet.dent === "function"?root.scene.pet.dent(root.model.id):Qt.vector4d(0,0,0,1)
   if(Math.abs(hit.z)>.001)return hit
   return root.scene.wires && typeof root.scene.wires.extrusion === "function"?root.scene.wires.extrusion(root.model.id):hit
  }
  property vector4d bud:root.bubble
  property vector4d bud2:root.secondBubble
  property real stackDepth:root.stackDepth
  property real rimProgress:root.rimProgress
  property real rimOrigin:root.rimOrigin
  property real maskOnly:root.maskOnly?1:0
  property real useWallMask:root.occupancyOverlay && !!root.scene.plasticMask?1:0
  property var wallMask:root.occupancyOverlay?(root.scene.plasticMask || null):null
  property real occupancyOverlay:root.occupancyOverlay?1:0
  property vector2d petOcclusion:root.occupancyOverlay && root.scene.pet?Qt.vector2d(root.scene.pet.coverage(root.scene.pet.points,0,root.model.id),root.scene.pet.coverage(root.scene.pet.points,1,root.model.id)):Qt.vector2d(0,0)
  property real membraneOverlay:root.membraneOverlay?1:0
  property color petColor:root.scene.petColor || root.scene.highlight
  property real petCore:root.occupancyOverlay && root.scene.pet?root.scene.pet.core:0
  property var backdrop:root.backdrop
  fragmentShader:Qt.resolvedUrl("wallpaper-object.frag.qsb")
 }
}
