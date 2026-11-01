import QtQuick
import QtQuick.Window
import Quickshell
import ".." as Plugin
ShellRoot {
 id:demo;settings.watchFiles:false
 property real elapsed:0;property int frame:0;property bool saving:false;property string output:Quickshell.env("DEMO_OUT")
 Window {id:win;visible:true;width:1000;height:260;minimumWidth:1000;maximumWidth:1000;minimumHeight:260;maximumHeight:260;flags:Qt.Tool|Qt.FramelessWindowHint
  Rectangle {anchors.fill:parent;color:"#222c36"}
  Text {x:28;y:20;text:"Three voices · one little world";color:"#d6e0e8";font.family:"Noto Sans";font.pixelSize:16}
  Plugin.MultiVoiceLyrics {id:lyric;x:28;y:55;width:944;height:165;playing:true;lyricTime:demo.elapsed;theme:({fontFamily:"Noto Sans"});accent:"#c3b1ff";moduleColor:"#222230"
   document:({duration:30,voices:[{id:"a",label:"Voice 1"},{id:"b",label:"Voice 2"},{id:"c",label:"Voice 3"}],lines:[
    {t:0,end:3,text:"A little spark is waking",voiceIds:["a"],imported:true},
    {t:2,end:6,text:"Another light comes through",voiceIds:["b"],imported:true},
    {t:4,end:8,text:"A third is dancing too",voiceIds:["c"],imported:true},
    {t:5,end:8,text:"We follow every heartbeat",voiceIds:["a"],imported:true},
    {t:6,end:8,text:"(every heartbeat)",role:"backing",hostVoiceId:"a",voiceIds:["b"]},
    {t:10,end:14,text:"Together we can shine",voiceIds:["a","b","c"],unisonId:"all",imported:true},
    {t:16,end:19,text:"A story for another day",voiceIds:["b"],imported:true}
   ]})
  }
 }
 Timer {interval:50;repeat:true;running:true;onTriggered:{demo.elapsed+=.05;if(demo.elapsed>25)Qt.quit();if(!demo.saving){demo.saving=true;win.contentItem.grabToImage(r=>{r.saveToFile(demo.output+"/"+String(demo.frame++).padStart(5,"0")+".png");demo.saving=false})}}}
}
