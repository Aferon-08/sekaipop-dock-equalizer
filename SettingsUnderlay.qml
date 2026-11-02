pragma ComponentBehavior: Bound
import QtQuick
import Quickshell.Hyprland
import Quickshell.Wayland
Item {
 id:root
 property string screenName:""
 property rect viewport:Qt.rect(0,0,width,height)
 property bool active:false
 property bool intersectOnly:false
 property int refreshInterval:83
 readonly property var monitor:Hyprland.monitors.values.find(m=>m.name===screenName) || null
 readonly property var windows:{
  if(!monitor || !active)return []
  const ws=monitor.activeWorkspace?.id
  return Hyprland.toplevels.values.filter(t=>{
   const i=t.lastIpcObject || {}
   const x=(i.at?.[0] || 0)-(monitor.lastIpcObject?.x || 0)
   const y=(i.at?.[1] || 0)-(monitor.lastIpcObject?.y || 0)
   const intersects=!intersectOnly || (x+(i.size?.[0] || 0)>viewport.x && x<viewport.x+viewport.width
       && y+(i.size?.[1] || 0)>viewport.y && y<viewport.y+viewport.height)
   return intersects && !!t.wayland && i.mapped!==false && i.hidden!==true && i.visible!==false && !t.wayland.minimized
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
   Timer {interval:root.refreshInterval;repeat:true;running:root.active;onTriggered:preview.captureFrame()}
  }
 }
}
