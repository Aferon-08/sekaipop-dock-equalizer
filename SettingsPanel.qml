pragma ComponentBehavior: Bound
import QtQuick
import QtQuick.Controls
import QtQuick.Layouts
import Quickshell.Io
import "SettingsMotion.js" as Motion
Item {
 id:root
 required property var pst
 required property var theme
 property var extensionHost:null
 property Item phone:null
 property rect phoneRect:Qt.rect((width-1120)/2,(height-600)/2,1120,600)
 property rect backgroundRect:Qt.rect(0,0,width,height)
 property string screenName:"demo"
 property bool opened:pst && pst.service && pst.service.settingsPanelOpen
 property string mode:"closed"
 property real phase:0
 readonly property bool ownsPhone:mode==="opening" || mode==="open" || mode==="closing"
 readonly property bool showing:mode!=="closed"
 readonly property bool closing:mode==="closing"
 readonly property var pose:Motion.frame(closing,mode==="open"?1:phase,phoneRect,Qt.rect((width-card.width)/2,(height-card.height)/2,card.width,card.height))
 visible:showing
 focus:opened
 readonly property var prefs:pst ? pst.settings : ({})
 readonly property var manifest:pst ? pst.plugin : ({settings:{},settingsInfo:{}})
 readonly property color ink:theme.ink || "#e4f4f2"
 readonly property color accent:theme.accentCyan || "#9cddd2"
 readonly property color surface:theme.surface || "#152322"
 property string query:""
 property bool phoneDelivered:false
 property var phoneGrab:null
 function close(){if(extensionHost)extensionHost.close();else pst.service.settingsPanelOpen=false}
 function beginWhenReady(){
  if(mode!=="capturing" || !phoneDelivered || phoneImage.status!==Image.Ready)return
  if(!opened){mode="closed";return}
  phase=0;mode="opening";forceActiveFocus();morph.start()
 }
 function capture(){
  if(!opened){mode="closed";return}
  if(phone && phone.captureReady===false){mode="capturing";captureRetry.restart();return}
  if(!phone || phone.width<=0 || phone.height<=0){mode="closed";pst.service.settingsPanelOpen=false;return}
  mode="capturing";phoneDelivered=false;phoneGrab=null
  const ok=phone.grabToImage(r=>{if(mode!=="capturing")return;phoneDelivered=true;phoneGrab=r;beginWhenReady()},Qt.size(Math.round(width),Math.round(height)))
  if(!ok){mode="closed";pst.service.settingsPanelOpen=false}
 }
 Timer {id:captureRetry;interval:50;onTriggered:root.capture()}
 function startClosing(){phase=0;mode="closing";morph.start()}
 Keys.onEscapePressed:event=>{close();event.accepted=true}
 onOpenedChanged:{
  if(opened && mode==="closed")Qt.callLater(capture)
  else if(!opened && mode==="open")startClosing()
 }
 NumberAnimation {id:morph;target:root;property:"phase";from:0;to:1;duration:Math.max(2600,(root.prefs.settingsDuration ?? 1100)*3)*(root.closing?.9:1)
  onFinished:{if(root.mode==="opening"){root.mode="open";if(!root.opened)root.startClosing()}else{root.mode="closed";if(root.opened)Qt.callLater(root.capture)}}
 }
 // Keep the live phone until its actual bitmap is decoded. No hide-before-capture gap.
 ShaderEffectSource {sourceItem:root.phone;hideSource:root.ownsPhone;visible:false;live:false}
 Image {id:phoneImage;visible:false;source:root.phoneGrab?root.phoneGrab.url:"";onStatusChanged:root.beginWhenReady()}
 SettingsUnderlay {id:underlay;anchors.fill:parent;screenName:root.screenName;viewport:root.backgroundRect;active:root.ownsPhone}
 ShaderEffectSource {id:backdrop;anchors.fill:parent;sourceItem:underlay;hideSource:true;live:root.ownsPhone;visible:false}
 MouseArea {anchors.fill:parent;enabled:root.ownsPhone;onClicked:root.close()}
 ShaderEffect {
  anchors.fill:parent;visible:root.ownsPhone
  property var source:phoneImage
  property var background:backdrop
  property vector2d resolution:Qt.vector2d(width,height)
  property vector4d phoneBox:Qt.vector4d(root.phoneRect.x,root.phoneRect.y,root.phoneRect.width,root.phoneRect.height)
  property vector4d shapeBox:Qt.vector4d(root.pose.x,root.pose.y,root.pose.w,root.pose.h)
  property vector4d backdropBox:Qt.vector4d(0,0,width,height)
  property real radius:root.pose.r
  property real water:root.pose.water
  property real photo:root.pose.photo
  property real clock:root.phase
  property real hasBackground:1
  property color tint:root.surface
  property color accent:root.accent
  fragmentShader:Qt.resolvedUrl("settings-morph.frag.qsb")
 }
 IpcHandler {
  target:"docksettings-"+root.screenName
  function status():string{return JSON.stringify({mode:root.mode,phase:root.phase,phoneReady:phoneImage.status===Image.Ready,backgroundWindows:underlay.windows.length,pose:root.pose})}
  function snapshot(path:string):void{root.grabToImage(r=>r.saveToFile(path))}
 }
 Item {
  id:card
  width:Math.min(root.width-40,root.prefs.settingsWidth ?? 1100)
  height:Math.min(root.height-48,root.prefs.settingsHeight ?? 900)
  anchors.centerIn:parent
  opacity:root.ownsPhone?root.pose.content:0
  transform: [Translate {x:root.pose.x-root.width/2;y:root.pose.y-root.height/2},Scale {origin.x:card.width/2;origin.y:card.height/2;xScale:root.pose.w/card.width;yScale:root.pose.h/card.height}]
  enabled:root.opened && root.mode==="open"
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
