pragma ComponentBehavior: Bound
import QtQuick
import "FireflyMotion.js" as Motion

Item {
    id: root
    property var targets: []
    property bool playing: false
    property color accent: "#acf4da"
    property var scene: null
    property real age: 0
    property var lastTargets: []
    property string lastKey: ""
    property real pulse: 0
    property real beat: 0
    property point resumeOrigin: Qt.point(width/2,height/2)
    readonly property bool active: !!scene
    readonly property var points: Motion.sample(scene,age,targets)
    property bool ready: false
    property bool resuming: false
    Component.onCompleted: { ready=true; reset() }
    function reset() { scene=null;lastKey=targets.map(t=>t.id).join("|");lastTargets=targets.slice() }
    function change() {
        if(!ready)return
        const key=targets.map(t=>t.id).join("|")
        if(!lastKey || !playing || !lastTargets.length){reset();return}
        if(key===lastKey){if(!scene)lastTargets=targets.slice();return}
        const from=scene && points.length?points.slice():lastTargets.slice()
        const split=targets.length>lastTargets.length
        const merge=targets.length===1 && lastTargets.length>1
        scene={kind:split && lastTargets.length===1?"split":merge?"merge":"reflow",from:from,
            stage:{x:width*(.30+Math.random()*.40),y:Math.max(14,height*(.18+Math.random()*.13))}}
        if(merge)scene.stage={x:width/2,y:height*.32}
        age=0;lastKey=key;lastTargets=targets.slice()
    }
    onTargetsChanged: change()
    onPlayingChanged: {
        if(!playing){scene=null;resuming=true}
        else if(resuming && targets.length){
            scene={kind:"reflow",from:[{x:resumeOrigin.x,y:resumeOrigin.y}],stage:{x:width/2,y:height/2}}
            age=0;lastKey=targets.map(t=>t.id).join("|");lastTargets=targets.slice();resuming=false
        }
    }
    FrameAnimation {
        running: root.active && root.playing && root.visible
        onTriggered: {
            root.age+=Math.min(.05,frameTime)
            const end=root.scene.kind==="split"?1.65:root.scene.kind==="merge"?1.22:.4
            if(root.age>=end){root.scene=null;root.lastTargets=root.targets.slice()}
        }
    }
    opacity: playing?1:0
    Behavior on opacity {NumberAnimation{duration:180}}
    Repeater {
        model: root.points.length
        delegate: Item {
            id: light
            required property int index
            readonly property var point: root.points[index] || ({x:0,y:0,alpha:0})
            x:point.x;y:point.y
            rotation:point.rotation || 0
            scale:(point.scale || 1)*(1+.035*Math.sin(root.age*8)+root.beat*.05)
            MultiVoiceGlow {
                width:1;height:1;accent:root.accent;poolWidth:80;poolHeight:46
                pose:({x:0,y:0,alpha:light.point.alpha || 0})
                nearPose:({x:-5,y:-7,alpha:.6})
                farPose:({x:-10,y:-15,alpha:.3})
            }
        }
    }
}
