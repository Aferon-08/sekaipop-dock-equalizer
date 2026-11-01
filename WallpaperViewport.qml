import QtQuick
Item {
 id:root
 required property var scene
 default property alias content: contents.data
 x:scene.safeRect.x;y:scene.safeRect.y
 width:scene.safeRect.width;height:scene.safeRect.height
 clip:true
 Item {
  id:contents
  x:-root.x;y:-root.y
  width:root.scene.width;height:root.scene.height
 }
}
