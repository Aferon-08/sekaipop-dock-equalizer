import QtQuick
import QtQuick.Window
import Quickshell
import ".." as Plugin

ShellRoot {
    id: test
    settings.watchFiles: false
    property int failures: 0
    property real elapsed: 0
    property var spectrum: Array.from({length:64},(_,i)=>100)
    property int frame: 0
    property string output: Quickshell.env("DEMO_OUT")
    property bool saving: false
    function check(ok, name) { console.log((ok ? "PASS " : "FAIL ") + name); if (!ok) ++failures }
    QtObject {
        id: demoPlayer
        property bool lengthSupported: true
        property real length: 120
        property bool positionSupported: true
        property bool canSeek: true
        property bool canGoPrevious: true
        property bool canGoNext: true
        property bool canTogglePlaying: true
        property bool volumeSupported: true
        property bool canControl: true
        property real volume: 0.8
        property real position: 2.2
        property var metadata: ({ "xesam:url": "file:///demo.ogg" })
    }
    QtObject {
        id: demoMedia
        property var player: demoPlayer
        property bool playing: false
        property string title: "A little light"
        property string artist: "SekaiPOP Demo"
        property string artUrl: ""
        function togglePlaying() { playing = !playing }
        function next() { console.log("NEXT") }
        function previous() { console.log("PREVIOUS") }
    }
    QtObject {
        id: demoLyrics
        property string status: "ready"
        property var lastArgs: ["SekaiPOP Demo", "A little light"]
        property int syncTotal: 0
        property var lines: [
            {t:0,text:"A little light begins to glow",marks:[{cs:0,t:0},{cs:2,t:.4},{cs:9,t:1.2},{cs:15,t:2.1},{cs:22,t:2.8},{cs:25,t:3.2}]},
            {t:4,text:"It follows every word we know",marks:[{cs:0,t:4},{cs:3,t:4.5},{cs:11,t:5.3},{cs:17,t:6.1},{cs:22,t:6.8},{cs:25,t:7.4}]},
            {t:8,text:"Across the glass and into blue",marks:[{cs:0,t:8},{cs:7,t:8.6},{cs:11,t:9.1},{cs:17,t:9.8},{cs:21,t:10.5},{cs:26,t:11.1}]},
            {t:12,text:"A tiny world that moves with you",marks:[{cs:0,t:12},{cs:2,t:12.4},{cs:7,t:13},{cs:13,t:13.5},{cs:18,t:14},{cs:24,t:14.7},{cs:29,t:15.2}]},
            {t:17,text:"Let every little spark shine through"}
        ]
    }
    QtObject {
        id: demoHost
        property var settings: ({ enabled: true, width: 200, height: 38, gap: 12, sensitivity: 1.25, style: "wave", collapseDelay: 600, lyrics: true, expandLyrics: true, lyricsWidth: 560 })
        property bool working: true
        property var service: ({ playing: demoMedia.playing, bands: test.spectrum, beatPulse: Math.max(0,Math.sin(test.elapsed*7)), beatBpm: 118, beatConfidence: .9 })
        property var theme: ({ fontFamily: "Noto Sans", iconFont: "Material Symbols Rounded" })
        property QtObject dock: QtObject {
            property var item: pill
            property bool vertical: false
            property bool capsule: true
            property string look: "capsule"
            property real radius: Math.min(pill.width, pill.height - 4) / 2
            property real shadow: 4
            property bool asleep: false
            property var mediaSource: demoMedia
            property var lyrics: demoLyrics
            property bool hovered: false
            property bool editing: false
            property bool desktopEmpty: false
            property real baseCapHeight: 69
            property real baseWidth: 432
            property real stageWidth: 1100
            property var palette: ({ fill: Qt.color("#101b18"), rim: Qt.color("#284a3d"), shadow: Qt.color("#060d0a"), ink: Qt.color("#e8f4ee"), accent: Qt.color("#96dcc0"), border: 3, ringWidth: 3, ring: Qt.color("#101b18") })
        }
    }
    Window {
        id: win
        visible: true
        width: 1100; height: 360; minimumWidth:1100; maximumWidth:1100; minimumHeight:360; maximumHeight:360; flags:Qt.Tool|Qt.FramelessWindowHint; color: "#29383e"
        Rectangle {anchors.fill:parent;color:"#29383e"}
        Plugin.DockWings { id: wings; anchors.fill: parent; host: demoHost }
        Item {
            id: pill
            width: 432 + wings.lyricsWidthExtra
            height: 73 + wings.lyricsHeightExtra
            x: (parent.width - width) / 2; y: 55
            readonly property real capWidth: width
            readonly property real capHeight: height - 4
            Row {
                anchors.centerIn: parent
                anchors.verticalCenterOffset: wings.iconsOffset / 2
                scale: wings.iconsScale
                opacity: wings.iconsOpacity
                spacing: 24
                Repeater { model: ["search", "folder", "content_paste", "timer", "web", "terminal", "push_pin"]; Text { required property string modelData; text: modelData; color: "white"; font.family: "Material Symbols Rounded"; font.pixelSize: 30 } }
            }
        }
    }
    Timer { interval: 50; running:true; repeat:true; onTriggered: {
        test.elapsed+=.05
        demoMedia.playing=test.elapsed>1 && !(test.elapsed>15 && test.elapsed<18)
        demoHost.dock.desktopEmpty=test.elapsed>5
        if(demoMedia.playing)demoPlayer.position+=.05
        test.spectrum=Array.from({length:64},(_,i)=>Math.round(70+180*Math.pow((1+Math.sin(i*.41+test.elapsed*5.8))*.5,3)))
        if(test.elapsed>22)Qt.quit()
        if(!test.saving){test.saving=true;win.contentItem.grabToImage(r=>{r.saveToFile(test.output+"/"+String(test.frame++).padStart(5,"0")+".png");test.saving=false})}
    }}
}
