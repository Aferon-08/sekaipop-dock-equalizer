import QtQuick
import QtQuick.Window
import Quickshell
import ".." as Plugin
import "../WallpaperPet.js" as Pet
ShellRoot {
 id:demo;settings.watchFiles:false
 property real elapsed:0;property int frame:0;property bool saving:false
 property string output:Quickshell.env("DEMO_OUT")
 QtObject {id:palette;property bool dark:true;property color surface:"#16232b";property color accentCyan:"#8bbce1";property color accentMint:"#9bd8bb"}
 Window {id:win;visible:true;width:1280;height:720;minimumWidth:1280;maximumWidth:1280;minimumHeight:720;maximumHeight:720;flags:Qt.Tool|Qt.FramelessWindowHint;color:"black"
  Plugin.ProceduralWallpaper {id:scene;anchors.fill:parent;seed:"living-glass-release";screenName:"showcase";theme:palette
   settings:({wallpaperPet:true,wallpaperMotion:true,wallpaperDensity:"rich",wallpaperGlass:.85})
   music:({playing:demo.elapsed>12,beatPulse:Math.max(0,Math.sin(demo.elapsed*6.8)),beatBpm:130,beatConfidence:.9})
  }
 }
 Timer {interval:70;repeat:true;running:true;onTriggered:{
  demo.elapsed+=.07
  if(demo.elapsed>6 && demo.elapsed<6.1)Pet.beginSplit(scene.pet.state,scene.pet.glass)
  if(demo.elapsed>18){palette.accentCyan="#bd9fea";palette.accentMint="#f0aabe"}
  if(demo.elapsed>26)Qt.quit()
  if(!demo.saving){demo.saving=true;win.contentItem.grabToImage(r=>{r.saveToFile(demo.output+"/"+String(demo.frame++).padStart(5,"0")+".png");demo.saving=false})}
 }}
}
