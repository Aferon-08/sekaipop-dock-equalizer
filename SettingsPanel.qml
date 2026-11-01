pragma ComponentBehavior: Bound
import QtQuick
import QtQuick.Controls
import QtQuick.Layouts
Item {
 id:root
 required property var pst
 required property var theme
 property Item phone:null
 property bool opened:pst && pst.service && pst.service.settingsPanelOpen
 property real phase:0
 readonly property bool showing:opened || phase>.001
 visible:showing
 focus:opened
 readonly property var prefs:pst ? pst.settings : ({})
 readonly property var manifest:pst ? pst.plugin : ({settings:{},settingsInfo:{}})
 readonly property color ink:theme.ink || "#e4f4f2"
 readonly property color accent:theme.accentCyan || "#9cddd2"
 readonly property color surface:theme.surface || "#152322"
 property string query:""
 function close(){pst.service.settingsPanelOpen=false}
 Keys.onEscapePressed:event=>{close();event.accepted=true}
 onOpenedChanged:{morph.stop();morph.to=opened?1:0;morph.start();if(opened){snapshot.scheduleUpdate();forceActiveFocus()}}
 NumberAnimation {id:morph;target:root;property:"phase";duration:root.prefs.settingsDuration ?? 1100;easing.type:Easing.InOutCubic}
 ShaderEffectSource {id:snapshot;sourceItem:root.phone;sourceRect:Qt.rect(0,0,root.width,root.height);textureSize:Qt.size(root.width,root.height);live:false;hideSource:root.showing;visible:false}
 MouseArea {anchors.fill:parent;onClicked:root.close()}
 ShaderEffect {
  anchors.fill:parent
  property var source:snapshot
  property vector2d resolution:Qt.vector2d(width,height)
  property vector2d panelSize:Qt.vector2d(card.width,card.height)
  property real progress:root.phase
  property color tint:root.surface
  property color accent:root.accent
  fragmentShader:Qt.resolvedUrl("settings-morph.frag.qsb")
 }
 Item {
  id:card
  width:Math.min(root.width-40,root.prefs.settingsWidth ?? 1100)
  height:Math.min(root.height-48,root.prefs.settingsHeight ?? 900)
  anchors.centerIn:parent
  opacity:Math.max(0,(root.phase-.72)/.28)
  scale:.96+.04*opacity
  enabled:root.opened && root.phase>.98
  MouseArea {anchors.fill:parent}
  ColumnLayout {
   anchors.fill:parent;anchors.margins:28;spacing:14
   RowLayout {
    Layout.fillWidth:true
    ColumnLayout {Layout.fillWidth:true
     Label {text:"Dock Equalizer";color:root.ink;font.pixelSize:26;font.bold:true}
     Label {text:Object.keys(root.manifest.settings).length+" настроек · сохраняются сразу";color:root.accent}
    }
    Button {font.pixelSize:14;leftPadding:16;rightPadding:16;topPadding:12;bottomPadding:12;palette.button:Qt.darker(root.surface,1.15);palette.buttonText:root.ink;text:"Сбросить всё";onClicked:resetDialog.open()}
    Button {font.pixelSize:14;leftPadding:16;rightPadding:16;topPadding:12;bottomPadding:12;palette.button:Qt.darker(root.surface,1.15);palette.buttonText:root.ink;text:"Вернуться  ×";onClicked:root.close()}
   }
   TextField {font.pixelSize:15;implicitHeight:46;Layout.fillWidth:true;background:Rectangle{radius:14;color:Qt.rgba(root.accent.r,root.accent.g,root.accent.b,.08);border.color:Qt.rgba(root.accent.r,root.accent.g,root.accent.b,.2)} placeholderText:"Поиск настроек…";onTextChanged:root.query=text.toLowerCase();color:root.ink}
   ScrollView {
    id:scroll;Layout.fillWidth:true;Layout.fillHeight:true;clip:true
    ScrollBar.horizontal.policy:ScrollBar.AlwaysOff
    contentWidth:availableWidth
    Flickable {id:flick;contentWidth:width;contentHeight:sections.height;boundsBehavior:Flickable.DragOverBounds;flickDeceleration:1400;maximumFlickVelocity:2200
     WheelHandler {onWheel:event=>{flick.cancelFlick();wheelAnim.stop();wheelAnim.from=flick.contentY;wheelAnim.to=Math.max(0,Math.min(flick.contentHeight-flick.height,flick.contentY-event.angleDelta.y*(root.prefs.settingsScroll ?? .8)));wheelAnim.start();event.accepted=true}}
     NumberAnimation {id:wheelAnim;target:flick;property:"contentY";duration:200;easing.type:Easing.OutCubic}
     Column {
      id:sections;width:flick.width;spacing:14
      Repeater {model:root.manifest.groups || []
       Column {
        id:group;required property string modelData;width:sections.width;spacing:8
        readonly property var keys:Object.keys(root.manifest.settings).filter(k=>(root.manifest.settingsInfo[k]?.group || "")===modelData)
        readonly property var matching:keys.filter(k=>root.query==="" || (root.manifest.settingsInfo[k]?.label+" "+k+" "+modelData).toLowerCase().includes(root.query))
        visible:matching.length>0
        Label {text:group.modelData;color:root.accent;font.pixelSize:18;font.bold:true;topPadding:14}
        Repeater {model:group.keys
         SettingsControl {required property string modelData;width:group.width;pst:root.pst;settingKey:modelData;ink:root.ink;accent:root.accent;visible:group.matching.includes(modelData)}
        }
       }
      }
     }
    }
   }
  }
 }
 Dialog {id:resetDialog;anchors.centerIn:parent;title:"Сбросить все настройки?";modal:true;standardButtons:Dialog.Ok|Dialog.Cancel
  Label {text:"Все параметры вернутся к значениям по умолчанию.\nЗаписи музыки и разметки сохранятся."}
  onAccepted:root.pst.resetAll()
 }
}
