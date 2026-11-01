import QtQuick
ShaderEffect {
 id:root
 required property var scene
 required property var backdrop
 required property int stackKey
 property int actorIndex:0
 readonly property var transfer:scene.pet.carriers.find(t=>t.actorIndex===actorIndex)
 readonly property bool selected:!!transfer && transfer.visualStack===stackKey
 readonly property var pose:selected?scene.pet.points[actorIndex]:null
 readonly property var bubble:selected?transfer.bubble:null
 readonly property var room:selected?scene.pet.layers.find(n=>n.id===(transfer.union===null?transfer.source:transfer.union)):null
 readonly property real h:scene.height
 readonly property real radius:bubble?bubble.r*h:0
 readonly property real pad:Math.max(100,h*.16)
 width:pad*2;height:pad*2
 x:(bubble?bubble.x:pose?pose.x:0)*h-width/2
 y:(bubble?bubble.y:pose?pose.y:0)*h-height/2
 visible:selected && scene.pet.active && !!pose && pose.lightRenderer==="carrier"
 property vector2d resolution:Qt.vector2d(width,height)
 property vector2d sceneSize:Qt.vector2d(scene.width,scene.height)
 property vector2d origin:Qt.vector2d(x,y)
 property vector4d capsule:bubble?Qt.vector4d(bubble.x*h,bubble.y*h,radius,transfer.stretch):Qt.vector4d(0,0,0,1)
 property vector4d roomRect:room?Qt.vector4d(room.x*h,room.y*h,room.w*h,room.h*h):Qt.vector4d(0,0,1,1)
 property real roomKind:room?room.kind:0
 property real roomAngle:room?room.angle*Math.PI/180:0
 property real unionAmount:selected?transfer.smoothing*h:0
 property real attached:selected && transfer.union!==null?1:0
 property real drawBody:selected && transfer.body?1:0
 property vector4d dent:room?scene.pet.dent(room.id):Qt.vector4d(0,0,0,1)
 property vector4d light:pose?Qt.vector4d(pose.x*h,pose.y*h,pose.a,pose.size):Qt.vector4d(0,0,0,1)
 function history(list){const p=list[actorIndex];return pose && p && p.transportId===pose.transportId?Qt.vector4d(p.x*h,p.y*h,p.a,p.size):Qt.vector4d(0,0,0,1)}
 property vector4d nearLight:history(scene.pet.near)
 property vector4d farLight:history(scene.pet.far)
 property color tint:scene.petColor
 property color fillColor:room?scene.colors[room.color]:scene.colors[0]
 property color highlight:scene.highlight
 property real core:scene.pet.core
 property real time:transfer?transfer.age:0
 fragmentShader:Qt.resolvedUrl("wallpaper-bubble.frag.qsb")
}
