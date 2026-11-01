import QtQuick
import QtQuick.Window
import Quickshell
import Quickshell.Io
import ".." as Plugin
ShellRoot {
 id:demo;settings.watchFiles:false
 property real elapsed:0;property int frame:0;property bool saving:false;property string output:Quickshell.env("DEMO_OUT")
 FileView {id:manifest;path:Qt.resolvedUrl("plugin.json").toString().replace("file://","");onLoaded:{model.plugin=JSON.parse(text());model.settings=Object.assign({},model.plugin.settings)}}
 QtObject {id:demoService;property bool settingsPanelOpen:false}
 QtObject {id:model;property var plugin:({settings:{},settingsInfo:{},groups:[]});property var settings:({});property var service:demoService
  function setSetting(k,v){const s=Object.assign({},settings);s[k]=v;settings=s;return true}
  function resetSetting(k){setSetting(k,plugin.settings[k])}
  function resetAll(){settings=Object.assign({},plugin.settings)}
 }
 Window {id:win;visible:true;width:1280;height:960;minimumWidth:1280;maximumWidth:1280;minimumHeight:960;maximumHeight:960;flags:Qt.Tool|Qt.FramelessWindowHint
  Item {id:backgroundScene;anchors.fill:parent
   Rectangle {anchors.fill:parent;color:"#26333b"}
   Rectangle {x:100;y:70;width:650;height:650;radius:180;rotation:-16;color:"#77acaa"}
   Rectangle {x:620;y:240;width:540;height:650;radius:110;rotation:14;color:"#a994c2"}
   Repeater {model:14;Rectangle{required property int index;x:50+index*85;y:450;width:22;height:300;rotation:28;radius:11;color:index%2?"#bbcfaf":"#879fb8"}}
  }
  Item {id:phone;anchors.fill:parent
   Rectangle {width:1120;height:600;anchors.centerIn:parent;radius:70;color:"#132925";border.width:6;border.color:"#73b7a1"
    Text {anchors.centerIn:parent;text:"Dock Equalizer\nНастройки плагина";color:"#c7e8df";font.pixelSize:28;horizontalAlignment:Text.AlignHCenter}
   }
  }
  Plugin.SettingsPanel {id:panel;anchors.fill:parent;pst:model;phone:phone;theme:({surface:Qt.color("#172a28"),ink:Qt.color("#d5ebe5"),accentCyan:Qt.color("#9ed8c8")})}
 }
 Timer {interval:50;running:true;repeat:true;onTriggered:{demo.elapsed+=.05;if(demo.elapsed>1 && demo.elapsed<1.1)demoService.settingsPanelOpen=true;if(demo.elapsed>4 && demo.elapsed<5)panel.query="питом";if(demo.elapsed>7)demoService.settingsPanelOpen=false;if(demo.elapsed>11)Qt.quit();if(!demo.saving){demo.saving=true;win.contentItem.grabToImage(r=>{r.saveToFile(demo.output+"/"+String(demo.frame++).padStart(5,"0")+".png");demo.saving=false})}}}
}
