pragma ComponentBehavior: Bound
import QtQuick
import QtQuick.Controls
import QtQuick.Layouts
Rectangle {
 id:root
 required property var pst
 required property string settingKey
 property color ink:"white"
 property color accent:"#aaddcc"
 readonly property var info:pst.plugin.settingsInfo[settingKey] || ({})
 readonly property var value:pst.settings[settingKey]
 readonly property var original:pst.plugin.settings[settingKey]
 readonly property bool numeric:typeof original==="number"
 readonly property bool boolean:typeof original==="boolean"
 height:visible?body.implicitHeight+26:0
 radius:16;color:Qt.rgba(.015,.035,.035,.35);border.color:Qt.rgba(accent.r,accent.g,accent.b,.12)
 ColumnLayout {id:body;x:16;y:13;width:parent.width-32;spacing:6
  RowLayout {Layout.fillWidth:true
   Label {text:root.info.label || root.settingKey;wrapMode:Text.WordWrap;Layout.fillWidth:true;color:root.ink;font.pixelSize:14}
   Label {visible:root.numeric;text:Number(root.value).toFixed(root.info.step<1?2:0);color:root.accent}
   Switch {
    id:toggle
    indicator: Rectangle {implicitWidth:46;implicitHeight:26;radius:13;color:toggle.checked?root.accent:Qt.rgba(root.ink.r,root.ink.g,root.ink.b,.15)
     Rectangle {x:toggle.checked?23:3;y:3;width:20;height:20;radius:10;color:toggle.checked?"#11231f":root.ink;Behavior on x {NumberAnimation{duration:150}}}
    }
    visible:root.boolean;checked:!!root.value;onToggled:root.pst.setSetting(root.settingKey,checked)}
   ToolButton {font.pixelSize:17;implicitWidth:36;implicitHeight:36;text:"↺";enabled:root.value!==root.original;onClicked:root.pst.resetSetting(root.settingKey)}
  }
  Label {visible:!!root.info.description;text:root.info.description || "";Layout.fillWidth:true;wrapMode:Text.WordWrap;color:Qt.rgba(root.ink.r,root.ink.g,root.ink.b,.6);font.pixelSize:12}
  Slider {
   id:slider
   background: Rectangle {x:slider.leftPadding;y:slider.topPadding+slider.availableHeight/2-3;width:slider.availableWidth;height:6;radius:3;color:Qt.rgba(root.accent.r,root.accent.g,root.accent.b,.18)
    Rectangle {width:slider.visualPosition*parent.width;height:6;radius:3;color:root.accent}
   }
   handle:Rectangle {x:slider.leftPadding+slider.visualPosition*(slider.availableWidth-width);y:slider.topPadding+slider.availableHeight/2-height/2;implicitWidth:18;implicitHeight:24;radius:8;color:root.ink;border.width:2;border.color:root.accent}
   visible:root.numeric;Layout.fillWidth:true;from:root.info.min ?? 0;to:root.info.max ?? 100;stepSize:root.info.step ?? 1;value:root.numeric ? Number(root.value ?? root.original) : 0;onMoved:root.pst.setSetting(root.settingKey,value)}
  ComboBox {font.pixelSize:14;implicitHeight:42;palette.button:"#223630";palette.buttonText:root.ink;palette.text:root.ink;palette.highlight:root.accent;visible:!root.boolean && !root.numeric;Layout.fillWidth:true;model:root.info.choices || [];textRole:"label";valueRole:"value";currentIndex:(root.info.choices || []).findIndex(c=>c.value===root.value);onActivated:root.pst.setSetting(root.settingKey,currentValue)}
 }
}
