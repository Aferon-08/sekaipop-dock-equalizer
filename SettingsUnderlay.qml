pragma ComponentBehavior: Bound
import QtQuick
import Quickshell.Hyprland
import Quickshell.Wayland
Item {
 id:root
 property string screenName:""
 property rect viewport:Qt.rect(0,0,width,height)
 property bool active:false
 readonly property var monitor:Hyprland.monitors.values.find(m=>m.name===screenName) || null
 readonly property var windows:{
  if(!monitor || !active)return []
  const ws=monitor.activeWorkspace?.id
  return Hyprland.toplevels.values.filter(t=>{
   const i=t.lastIpcObject || {}
   return !!t.wayland && i.mapped!==false && i.hidden!==true && i.visible!==false && !t.wayland.minimized
     && i.monitor===monitor.id && (i.workspace?.id===ws || i.pinned===true)
  }).slice().sort((a,b)=>(b.lastIpcObject?.focusHistoryID ?? 100)-(a.lastIpcObject?.focusHistoryID ?? 100))
 }
 Repeater {model:root.windows
  ScreencopyView {
   id:preview;required property var modelData
   readonly property var info:modelData.lastIpcObject || {}
   x:(info.at?.[0] || 0)-(root.monitor?.lastIpcObject?.x || 0)-root.viewport.x
   y:(info.at?.[1] || 0)-(root.monitor?.lastIpcObject?.y || 0)-root.viewport.y
   width:info.size?.[0] || 1;height:info.size?.[1] || 1
   captureSource:root.active ? modelData.wayland : null
   live:false;paintCursor:false
   Timer {interval:83;repeat:true;running:root.active;onTriggered:preview.captureFrame()}
  }
 }
}
