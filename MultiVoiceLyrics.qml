pragma ComponentBehavior: Bound
import QtQuick
import "MultiVoiceMath.js" as Voices
import "LyricsEnd.js" as LyricsEnd
import "MultiVoiceFinale.js" as Finale
import "BackingLayout.js" as BackingLayout
import "LyricsMath.js" as LM
import "LightMotion.js" as LightMotion

// A stable delegate per singer retains its reel/marker across liquid joins.
Item {
    id: root
    required property var theme
    property var document: null
    property real lyricTime: 0
    readonly property bool rendering: visible && opacity>.001
    readonly property real displayTime: rendering ? lyricTime : 0
    property real duration: document && document.duration ? document.duration : 0
    property bool playing: false
    property bool allowFinale: true
    property point resumeOrigin: Qt.point(width/2,height/2)
    property real pixelSize: 17
    property real beatPulse: 0
    property real heartPulse: 0
    property color ink: "#e1fff3"
    property color accent: "#acf4da"
    property color moduleColor: "#20342f"
    property var glassSource: null
    property rect glassRect: Qt.rect(0, 0, width, height)
    property bool showGlass: true
    property vector4d materialStyle: Qt.vector4d(1,3.8,0.23,1)
    property real regionGap: 8
    property real transitionDuration: 0.42
    readonly property var voices: Voices.normalize(document)
    readonly property var topologyEvents: Voices.build(voices)
    readonly property var endBounds: LyricsEnd.bounds(document && document.lines && document.lines.length ? document.lines : voices.reduce((lines,v)=>lines.concat(v.lines || []),[]),duration)
    readonly property real finaleMerge: allowFinale ? Finale.mergeAmount(endBounds,lyricTime) : 0
    readonly property var regions: allowFinale
        ? Finale.regions(topologyEvents,lyricTime,width,regionGap,transitionDuration,endBounds)
        : Voices.frame(topologyEvents,lyricTime,width,regionGap,transitionDuration)
    readonly property var markerPoses: markerDots.points
    property int layoutEpoch: 0
    readonly property var fireflyTargets: targetPositions(lyricTime,layoutEpoch,true)
    readonly property var markerTargets: targetPositions(lyricTime,layoutEpoch,false)
    property real lastTime: lyricTime
    function targetPositions(stamp,epoch,glow) {
        let event=topologyEvents[0]
        for(const e of topologyEvents){if(e.t>stamp)break;event=e}
        const result=[]
        if(!rendering || !event)return result
        const ending=allowFinale && lyricTime>=Finale.finish(endBounds)
        const layout=ending?regions:event.regions
        for(let i=0;i<layout.length;++i){
            if(ending ? layout[i].opacity<=.5 : !layout[i].visible)continue
            const panel=panelAt(i)
            if(!panel || (!glow && panel.finale.ended))continue
            const p=glow?panel.glowPose(stamp-.055):panel.reel.poseAt(stamp,panel.reel.layoutEpoch)
            const left=panel.x+panel.reel.x,top=panel.reel.y
            const trail=glow?[]:[.018,.036].map(delay=>{
                const q=panel.reel.poseAt(stamp-delay,panel.reel.layoutEpoch)
                return Object.assign({},q,{x:left+q.x,y:top+q.y})
            })
            result.push(Object.assign({},p,{id:voices[i].id,x:left+p.x,y:top+p.y,
                anchorX:left+(p.anchorX ?? p.x),anchorY:top+(p.anchorY ?? p.y),trail:trail}))
        }
        return result
    }
    onLyricTimeChanged: {
        if(!rendering)return
        if(lyricTime<lastTime-.05 || lyricTime>lastTime+.7)resetFlights()
        lastTime=lyricTime
    }
    onDocumentChanged: resetFlights()

    function resetFlights() {
        Qt.callLater(fireflies.reset)
        Qt.callLater(markerDots.reset)
    }
    clip: true

    function panelAt(index): var { return panels.itemAt(index) }
    // A soft neck forms in the inter-panel seam during a join, and thins
    // during separation. The text stays clipped in each independent region.
    Repeater {
        model: Math.max(0, root.voices.length - 1)
        delegate: Canvas {
            id: neck
            required property int index
            readonly property var a: root.regions[index] || ({})
            readonly property var b: root.regions[index + 1] || ({})
            readonly property bool joining: a.owner === b.owner && a.previousOwner !== b.previousOwner
            readonly property bool splitting: a.previousOwner === b.previousOwner && a.owner !== b.owner
            width: root.regionGap + 24
            height: 38
            x: ((a.x || 0) + (a.width || 0) + (b.x || 0)) / 2 - width / 2
            y: (root.height - height) / 2
            opacity: root.showGlass && (joining || splitting) ? Math.sin(Math.PI * (a.phase || 0)) * 0.8 : 0
            visible: opacity > 0.001
            onPaint: {
                var c = getContext("2d"); c.reset(); c.scale(width, height)
                var g = c.createRadialGradient(0.5, 0.5, 0, 0.5, 0.5, 0.5)
                var m = root.moduleColor
                g.addColorStop(0, Qt.rgba(m.r, m.g, m.b, 0.88))
                g.addColorStop(0.38, Qt.rgba(m.r, m.g, m.b, 0.7))
                g.addColorStop(0.68, Qt.rgba(root.accent.r, root.accent.g, root.accent.b, 0.12))
                g.addColorStop(1, "transparent")
                c.fillStyle = g; c.fillRect(0, 0, 1, 1)
            }
            Connections { target: root; function onModuleColorChanged() { neck.requestPaint() } function onAccentChanged() { neck.requestPaint() } }
        }
    }
    Repeater {
        id: panels
        model: root.voices.length
        delegate: Item {
            id: panel
            required property int index
            readonly property var voice: root.voices[index]
            readonly property var region: root.regions[index] || ({ x: 0, width: 0, opacity: 0, owner: index })
            readonly property string memberKey:(region.members || [index]).join(",")
            readonly property var memberIndexes:memberKey.split(",").map(Number)
            readonly property var finaleBounds:Finale.boundsFor(root.voices,memberIndexes,root.document,root.duration)
            readonly property var finale:Finale.forBounds(finaleBounds,root.displayTime,root.duration,root.allowFinale)
            readonly property color voiceAccent: voice.color || root.accent
            property alias reel: voiceReel
            readonly property var backingLines: root.document && root.document.lines
                ? BackingLayout.forMembers(root.document.lines,root.voices,memberIndexes) : []
            readonly property bool backingActive: backingLines.some(l=>root.displayTime>=l.t && root.displayTime<l.end+.4)
            function glowPose(stamp) {
                if(finale.ended) {
                    const t=LightMotion.motionTime(Math.max(0,stamp)+panel.index*1.7)
                    return {x:voiceReel.width*(.5+.28*Math.sin(t*.47+panel.index)),
                        y:voiceReel.height*(.5+.18*Math.sin(t*.63+.6)),alpha:1}
                }
                const marker = voiceReel.poseAt(stamp, voiceReel.layoutEpoch)
                const index = LM.lineIndexAt(voiceReel.timeline, stamp)
                const entry = voiceReel.timeline[index]
                if (!entry || String(entry.text || "").trim()) return marker
                // The karaoke marker deliberately hides during the dots. The
                // light has its own orbit and must not inherit that zero alpha.
                const transfer = voiceReel.transferAt(stamp)
                const phase = transfer ? transfer.phase : 0
                const blend = 1 - phase * phase * (3 - 2 * phase)
                const angle = LightMotion.motionTime(Math.max(0, stamp - entry.t)) * Math.PI * 2 / 1.8
                const centerY = voiceReel.height / 2
                    + (index - LM.cursor(voiceReel.timeline, stamp, 0.45, 0)) * 30
                return { x: marker.x + (voiceReel.width / 2 + Math.cos(angle) * 23 - marker.x) * blend,
                    y: marker.y + (centerY + Math.sin(angle) * 23 - marker.y) * blend,
                    alpha: marker.alpha + (1 - marker.alpha) * blend }
            }
            x: region.x
            width: region.width
            height: root.height
            opacity: region.opacity
            visible: opacity > 0.001 && width > 0.1
            clip: true
            Component.onCompleted: ++root.layoutEpoch

            ShaderEffectSource {
                id: capture
                sourceItem: root.glassSource
                // glass.frag expects an eight-pixel guard band around its region.
                sourceRect: Qt.rect(root.glassRect.x + panel.x - 8,
                    root.glassRect.y - 8, panel.width + 16, panel.height + 16)
                live: panel.visible && root.showGlass
                visible: false
                smooth: true
            }
            ShaderEffect {
                id: glass
                anchors.fill: parent
                property var backdrop: capture
                property vector2d resolution: Qt.vector2d(width, height)
                property color tintColor: root.moduleColor
                property color highlightColor: panel.voiceAccent
                property vector4d materialStyle: root.materialStyle
                fragmentShader: Qt.resolvedUrl("glass.frag.qsb")
                visible: root.showGlass && !!root.glassSource && GraphicsInfo.api !== GraphicsInfo.Software && status !== ShaderEffect.Error
            }
            Rectangle {
                anchors.fill: parent
                radius: Math.min(26, width / 2, height / 2)
                color: Qt.rgba(root.moduleColor.r, root.moduleColor.g, root.moduleColor.b, root.materialStyle.x > 0.5 ? 0.42 : 1)
                border.width: 0.7
                border.color: Qt.rgba(panel.voiceAccent.r, panel.voiceAccent.g, panel.voiceAccent.b, 0.15)
                visible: root.showGlass && !glass.visible
            }
            // Each singer has a separate landing light, sampled from that
            // singer's marker. No common clock or marker steers another voice.
            MultiVoiceGlow {
                x: voiceReel.x; y: voiceReel.y
                width: voiceReel.width; height: voiceReel.height
                objectName: "voiceGlow"
                pose: panel.glowPose(root.displayTime - 0.065)
                nearPose: panel.glowPose(root.displayTime - (voiceReel.waiting ? 0.24 : 0.115))
                farPose: panel.glowPose(root.displayTime - (voiceReel.waiting ? 0.44 : 0.225))
                poolWidth: Math.min(124, Math.max(65, panel.width * 0.65))
                scale: 1 + .025*Math.sin(root.displayTime*1.7+panel.index) + root.beatPulse*.04
                intensity: .9 + root.beatPulse*.18 + root.heartPulse*.1
                poolHeight: 62
                accent: panel.voiceAccent
                // Paused playback uses the shared swimming light in DockLyrics.
                // Keep the frozen lyric marker, but retire its separate glow.
                opacity: root.playing && !fireflies.active ? 1 : 0
                Behavior on opacity { NumberAnimation { duration: 180 } }
                visible: root.showGlass && opacity > 0.001
            }
            Text {
                id: label
                x: 12; y: 6
                width: parent.width - 24
                text: {
                    var r = panel.region
                    if (r.owner === panel.index && r.last > r.first)
                        return (r.members || []).map(i => root.voices[i].label).join(" · ")
                    return panel.voice.label
                }
                color: panel.voiceAccent
                opacity: 0.55*(1-root.finaleMerge)
                font.family: root.theme.fontFamily
                font.pixelSize: 9
                elide: Text.ElideRight
                visible: root.height >= 65
            }
            BackingLayer {
                anchors.fill: parent
                lines: panel.backingLines;time:panel.visible ? root.displayTime:0
                amount:1-panel.finale.amount
                fontFamily:root.theme.fontFamily;pixelSize:root.pixelSize*.72
                accent:panel.voiceAccent;z:2
            }
            LyricsReel {
                id: voiceReel
                markerVisible: false
                opacity: 1-panel.finale.amount
                x: 8; y: root.height >= 65 ? 9 : 0
                width: Math.max(1, panel.width - 16)
                height: panel.height - y
                theme: root.theme
                lines: panel.voice.lines
                duration: root.duration
                rendering: panel.visible && root.rendering
                time: rendering ? root.displayTime : 0
                playing: rendering && root.playing
                upperContextOpacity: panel.backingActive ? .05 : 1
                Behavior on upperContextOpacity {NumberAnimation{duration:180}}
                pixelSize: root.pixelSize
                ink: root.ink
                accent: panel.voiceAccent
                onLayoutEpochChanged: ++root.layoutEpoch
            }
            LyricsFinale {
                objectName: "branchFinale"
                anchors.fill: voiceReel
                phase: panel.finale.phase
                opacity: panel.finale.amount
                visible: opacity>.001
                ink: root.ink; accent: panel.voiceAccent
                fontFamily: root.theme.fontFamily
                pixelSize: Math.min(root.pixelSize,Math.max(11,(panel.width-20)/12))
            }
        }
    }
    FireflyScene {
        id: fireflies
        objectName: "fireflyScene"
        anchors.fill: parent
        beat: root.beatPulse
        resumeOrigin: root.resumeOrigin
        targets: root.fireflyTargets
        playing: root.playing
        accent: root.accent
        visible: root.showGlass
        z: 5
    }
    MarkerScene {
        id: markerDots
        objectName: "voiceMarkers"
        anchors.fill: parent
        targets: root.markerTargets
        playing: root.playing
        accent: root.accent
        z: 6
    }
}
