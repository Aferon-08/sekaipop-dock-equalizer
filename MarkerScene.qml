pragma ComponentBehavior: Bound
import QtQuick
import "MarkerLayout.js" as Layout

// Lyric beads have their own short layout transition. The following glow has
// a separate clock and can still be thinking/shaking after these have landed.
Item {
    id: root
    property var targets: []
    property bool playing: false
    property color accent: "#acf4da"
    property real transitionDuration: .22
    property var origins: []
    property real age: 0
    property bool active: false
    property bool ready: false
    property string lastKey: ""
    property var settled: []
    readonly property var points: active ? Layout.frame(origins,targets,age,transitionDuration) : targets
    function reset() {
        flight.stop();active=false;origins=[];settled=targets.slice()
        lastKey=targets.map(p=>p.id).join("|")
    }
    function update() {
        if(!ready)return
        const key=targets.map(p=>p.id).join("|")
        if(key===lastKey){settled=targets.slice();return}
        const from=active?Layout.frame(origins,settled,age,transitionDuration):settled.slice()
        lastKey=key
        if(!from.length || !targets.length){reset();return}
        flight.stop()
        origins=from;settled=targets.slice();age=0;active=true
        flight.from=0;flight.to=transitionDuration;flight.duration=Math.round(transitionDuration*1000)
        flight.start()
        if(!playing)flight.pause()
    }
    Component.onCompleted:{ready=true;reset()}
    onTargetsChanged:update()
    onPlayingChanged: {
        if(ready && flight.running){if(playing)flight.resume();else flight.pause()}
    }
    NumberAnimation {
        id: flight
        target: root; property: "age"
        onFinished:{root.active=false;root.settled=root.targets.slice()}
    }
    Repeater {
        model: root.points.length
        delegate: LyricMarker {
            required property int index
            readonly property var point: root.points[index] || ({})
            objectName: "voiceMarker"
            anchors.fill:parent
            pose: Object.assign({x:0,y:0,size:5,scaleX:1,scaleY:1,angle:0,air:0,alpha:0},point)
            trail: point.trail || []
            accent:root.accent
            pulseX:point.anchorX ?? point.x ?? 0
            pulseY:point.anchorY ?? point.y ?? 0
            pulseAge:point.pulseAge ?? -1
            pulseDuration:point.pulseDuration ?? .3
        }
    }
}
