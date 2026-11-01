pragma ComponentBehavior: Bound
import QtQuick
import "LyricsMath.js" as LM
import "LyricsTimeline.js" as Timeline
import "MarkerMotion.js" as Motion

Item {
    id: root
    required property var theme
    property var lines: []
    property real duration: 0
    property real time: 0
    property bool playing: false
    property bool rendering: true
    property bool markerVisible: true
    property real upperContextOpacity: 1
    property real pixelSize: 17
    property color ink: "#acf4da"
    property color accent: "#acf4da"
    readonly property var timeline: Timeline.build(lines, duration)
    readonly property int currentIndex: LM.lineIndexAt(timeline, time)
    readonly property var current: timeline[currentIndex] || ({ t: 0, text: "" })
    readonly property bool waiting: timeline.length > 0 && !String(current.text || "").trim()
    readonly property real waitProgress: waiting ? Math.max(0, Math.min(1,
        (time - current.t) / Math.max(0.1, current.end - current.t))) : 0
    readonly property real cursor: LM.cursor(timeline, time, 0.45, 0)
    readonly property int base: Math.round(cursor)
    readonly property var transfer: transferAt(time)
    property int layoutEpoch: 0
    // Loading may finish while the song clock is paused.
    readonly property var markerPose: poseAt(time, layoutEpoch)
    readonly property var landings: landingsAt(time, layoutEpoch)
    clip: true

    function transferAt(stamp) {
        const index = LM.lineIndexAt(timeline, stamp)
        if (index < 0 || index + 1 >= timeline.length) return null
        const end = timeline[index + 1].t
        const length = Math.min(0.5, (end - timeline[index].t) * 0.45)
        if (length <= 0 || stamp < end - length) return null
        return { from: index, to: index + 1, start: end - length, end: end,
            phase: Motion.clamp((stamp - end + length) / length, 0, 1) }
    }
    function slotAt(index): var { return slots.itemAt(index) }
    function handoffStartFor(index) {
        if (!timeline[index] || index + 1 >= timeline.length) return Infinity
        const end = timeline[index + 1].t
        return end - Math.min(0.5, (end - timeline[index].t) * 0.45)
    }
    function landingsAt(stamp, revision) {
        const result = []
        const index = LM.lineIndexAt(timeline, stamp)
        for (let i = Math.max(0, index - 2); i <= index; ++i) {
            const slot = slotAt(i)
            if (!timeline[i]?.text || !slot || !slot.item) continue
            const impacts = slot.item.wordLine.landingsAt(stamp)
            for (const impact of impacts) result.push(mapPose(i, stamp, impact))
        }
        result.sort((a, b) => b.born - a.born)
        return result.slice(0, 8)
    }
    function emptyPose() {
        return { x: width / 2, y: height / 2, size: 5, scaleX: 1, scaleY: 1,
            angle: 0, air: 0, alpha: 0, duration: 0, pulseAge: -1 }
    }
    function mapPose(index, stamp, local) {
        const d = index - LM.cursor(timeline, stamp, 0.45, 0)
        const s = 0.96 + 0.04 * LM.smooth(Math.max(0, 1 - Math.abs(d)))
        const y = height / 2 - 18 + d * 30
        const result = Object.assign({}, local, {
            x: width / 2 + (local.x - width / 2) * s,
            y: y + 18 + (local.y - 18) * s,
            size: local.size * s })
        if (local.anchorX !== undefined) {
            result.anchorX = width / 2 + (local.anchorX - width / 2) * s
            result.anchorY = y + 18 + (local.anchorY - 18) * s
        }
        return result
    }
    function normalPose(index, stamp) {
        const slot = slotAt(index)
        if (!slot || !slot.item) return emptyPose()
        const view = slot.item
        const entry = timeline[index]
        if (entry.text) {
            const local = view.wordLine.markerAt(stamp)
            local.pulseAge = stamp - local.start
            local.pulseDuration = local.next > local.start ? Math.min(0.3, (local.next - local.start) * 0.75) : 0.3
            return mapPose(index, stamp, local)
        }
        const local = view.dots.anchorAt(0, stamp, true)
        const arrived = index > 0 && !!timeline[index - 1].text
        local.alpha = arrived ? 1 - Motion.smooth((stamp - entry.t) / 0.14) : 0
        local.pulseAge = arrived ? stamp - entry.t : -1
        local.pulseDuration = 0.3
        local.anchorX = local.x; local.anchorY = local.y
        return mapPose(index, stamp, local)
    }
    function endpoint(index, stamp, first) {
        const slot = slotAt(index)
        if (!slot || !slot.item) return emptyPose()
        const entry = timeline[index]
        const view = slot.item
        const local = entry.text ? view.wordLine.anchorAt(first ? "first" : "last")
            : view.dots.anchorAt(first ? 0 : 2, stamp, false)
        return mapPose(index, stamp, local)
    }
    function poseAt(stamp, revision) {
        const index = LM.lineIndexAt(timeline, stamp)
        if (index < 0) return emptyPose()
        const handoff = transferAt(stamp)
        if (!handoff) return normalPose(index, stamp)
        const source = timeline[index].text ? normalPose(index, stamp) : endpoint(index, stamp, false)
        const target = endpoint(handoff.to, stamp, true)
        if (target.alpha === 0) return source
        const pose = Motion.bridge(stamp, handoff.start, handoff.end, source, target, 0)
        pose.pulseAge = -1
        return pose
    }

    Repeater {
        id: slots
        model: root.timeline.length
        delegate: Loader {
            id: slot
            required property int index
            readonly property var entry: root.timeline[index] || ({ t: 0, end: 1, text: "" })
            readonly property real distance: index - root.cursor
            readonly property real emphasis: Math.max(0, 1 - Math.abs(distance))
            readonly property real edge: 1 - LM.smooth((Math.abs(distance) - 1.15) / 0.6)
            readonly property real expanded: Math.max(0, Math.min(1, (root.height - 34) / 60))
            readonly property real compactFade: LM.smooth(emphasis)
            active: root.rendering && Math.abs(index - root.base) <= 2
            onLoaded: ++root.layoutEpoch
            x: 0
            y: root.height / 2 - height / 2 + distance * 30
            width: root.width
            height: 36
            opacity: edge * (0.4 + 0.6 * LM.smooth(emphasis))
                * (distance < -0.3 ? root.upperContextOpacity : 1)
                * (compactFade + (1 - compactFade) * expanded)
            scale: 0.96 + 0.04 * LM.smooth(emphasis)
            sourceComponent: Item {
                property alias wordLine: lineView
                property alias dots: gapView
                KaraokeLine {
                    id: lineView
                    anchors.fill: parent
                    visible: !!slot.entry.text
                    theme: root.theme
                    line: slot.entry
                    endTime: slot.entry.end
                    time: root.time
                    playing: root.playing
                    active: slot.index === root.currentIndex
                    sharedMarker: true
                    handoffStart: root.handoffStartFor(slot.index)
                    entryImpact: root.transfer && root.transfer.to === slot.index
                        ? Motion.smooth((root.transfer.phase - 0.8) / 0.2) : 0
                    emphasis: slot.emphasis
                    topInset: slot.y
                    pixelSize: root.pixelSize
                    ink: root.ink; accent: root.accent
                }
                WaitingDots {
                    id: gapView
                    anchors.fill: parent
                    visible: !slot.entry.text
                    time: root.time
                    startTime: slot.entry.t
                    endTime: slot.entry.end
                    playing: root.playing
                    arrivedFromWord: slot.index > 0 && !!root.timeline[slot.index - 1]?.text
                    departing: !!root.transfer && root.transfer.from === slot.index
                    firstMask: arrivedFromWord ? 1 - Motion.smooth((root.time - slot.entry.t) / 0.14) : 0
                    lastMask: departing ? Motion.smooth(root.transfer.phase / 0.14) : 0
                    accent: root.accent
                }
            }
        }
    }
    LandingSplashes {
        anchors.fill: parent
        bursts: root.landings
        accent: root.accent
    }
    LyricMarker {
        objectName: "reelMarker"
        visible: root.markerVisible
        anchors.fill: parent
        pose: root.markerPose
        trail: [root.poseAt(root.time - 0.018, root.layoutEpoch), root.poseAt(root.time - 0.036, root.layoutEpoch)]
        accent: root.accent
        pulseX: pose.anchorX !== undefined ? pose.anchorX : pose.x
        pulseY: pose.anchorY !== undefined ? pose.anchorY : pose.y
        pulseAge: pose.pulseAge ?? -1
        pulseDuration: pose.pulseDuration ?? 0.3
    }
}
