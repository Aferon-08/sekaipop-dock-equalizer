pragma ComponentBehavior: Bound
import QtQuick
Item {
 id:root
 required property var host
 Loader {
  anchors.fill:parent
  active:!!root.host.service && root.host.service.wallpaperSeed!==""
  sourceComponent:ProceduralWallpaper {
   seed:root.host.service.wallpaperSeed
   screenName:root.host.screenName
   theme:root.host.theme
   widgetAreas:root.host.widgetAreas
   music:root.host.service
   barEdge:root.host.barEdge
   barExtent:root.host.barExtent
   settings:root.host.settings
   working:root.host.working
   onNewComposition:root.host.setSetting("wallpaperRegenerate",true)
  }
 }
}
