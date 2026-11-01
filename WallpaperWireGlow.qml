import QtQuick
ShaderEffect {
 id:root
 required property var scene
 required property var pose
 required property var nearPose
 required property var farPose
 readonly property var curve:pose.wire
 readonly property real padding:Math.min(75,Math.max(45,scene.height*.065))
 readonly property var samples:[pose,nearPose,farPose].filter(p=>p.a>0 && p.transportId===pose.transportId && (p.wireWeight||0)>.001)
 readonly property real minX:Math.min(pose.x,...samples.map(p=>p.x))*scene.height
 readonly property real maxX:Math.max(pose.x,...samples.map(p=>p.x))*scene.height
 readonly property real minY:Math.min(pose.y,...samples.map(p=>p.y))*scene.height
 readonly property real maxY:Math.max(pose.y,...samples.map(p=>p.y))*scene.height
 width:maxX-minX+padding*2;height:maxY-minY+padding*2
 x:minX-padding;y:minY-padding
 visible:!!curve && scene.pet.active
 property vector2d resolution:Qt.vector2d(width,height)
 property vector2d origin:Qt.vector2d(x,y)
 property vector2d a:curve?Qt.vector2d(curve.a.x*scene.height,curve.a.y*scene.height):Qt.vector2d(0,0)
 property vector2d b:curve?Qt.vector2d(curve.b.x*scene.height,curve.b.y*scene.height):Qt.vector2d(0,0)
 property vector2d c1:curve?Qt.vector2d(curve.c1.x*scene.height,curve.c1.y*scene.height):a
 property vector2d c2:curve?Qt.vector2d(curve.c2.x*scene.height,curve.c2.y*scene.height):b
 property real sceneHeight:scene.height
 property vector4d light:Qt.vector4d(pose.x*scene.height,pose.y*scene.height,pose.a*(pose.wireWeight||0),pose.size)
 property vector4d nearLight:Qt.vector4d(nearPose.x*scene.height,nearPose.y*scene.height,nearPose.a*(nearPose.transportId===pose.transportId?(nearPose.wireWeight||0):0),nearPose.size)
 property vector4d farLight:Qt.vector4d(farPose.x*scene.height,farPose.y*scene.height,farPose.a*(farPose.transportId===pose.transportId?(farPose.wireWeight||0):0),farPose.size)
 property color tint:scene.petColor || scene.highlight
 property real core:pose.core||scene.pet.core
 fragmentShader:Qt.resolvedUrl("wallpaper-wire-glow.frag.qsb")
}
