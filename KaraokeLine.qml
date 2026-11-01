pragma ComponentBehavior: Bound
import QtQuick
import "LyricsMath.js" as LM
import "MarkerMotion.js" as Motion

Item {
    id: root
    required property var theme
    property var line: ({ t: 0, text: "" })
    property real endTime: line.t + 5
    property real time: 0
    property bool playing: false
    property bool active: true
    property bool sharedMarker: false
    property real entryImpact: 0
    property real handoffStart: Infinity
    property real emphasis: 1
    // The reel clips a compact line a little at the top; leave the dot room.
    property real topInset: 0
    property real pixelSize: 22
    property color ink: "white"
    property color accent: "#9ce9c2"
    readonly property var tokens: LM.tokens(line.text || "")
    readonly property var spans: line.wordSpans && line.wordSpans.length === tokens.length
        ? line.wordSpans : LM.spansFor(tokens, line.t, Math.max(0.1, endTime - line.t), line.marks || [])
    readonly property int activeWord: LM.wordAt(spans, time)
    readonly property var mainIndexes: LM.mainIndexes(tokens)
    readonly property var mainSpans: mainIndexes.map(index => spans[index])
    readonly property int markerWord: LM.wordAt(mainSpans, time)
    readonly property bool singing: active && time >= line.t && time < endTime && tokens.length > 0
    readonly property int here: mainIndexes[Math.max(0, markerWord)] ?? 0
    readonly property int there: mainIndexes[Math.min(mainIndexes.length - 1, Math.max(0, markerWord) + 1)] ?? here
    readonly property real fromX: row.implicitWidth > 0 ? wordCenter(here) : 0
    readonly property real toX: row.implicitWidth > 0 ? wordCenter(there) : 0
    readonly property real wordStart: mainSpans[Math.max(0, markerWord)]?.from ?? line.t
    readonly property real nextStart: there !== here ? (mainSpans[Math.max(0, markerWord) + 1]?.from ?? endTime) : wordStart
    readonly property real dotSize: Math.max(4.4, Math.min(6, pixelSize * 0.29))
    readonly property real ground: row.y + 1
    readonly property real arc: Math.max(0, Math.min(9,
        ground + Math.min(0, topInset) - dotSize * 0.65 - 1))
    readonly property var motion: Motion.sample(time, wordStart, nextStart, fromX, toX, arc)
    // Only the contact word may deform. The marker's combined impact also
    // contains recoil from the previous landing, so it cannot drive a neighbour.
    readonly property real approachingHit: there !== here ? Motion.smooth((motion.phase - 0.8) / 0.2) : 0
    readonly property int deformedWord: entryImpact > 0 ? (mainIndexes[0] ?? -1)
        : !singing || time >= handoffStart ? -1 : approachingHit > 0 ? there : here
    readonly property real wordImpact: entryImpact > 0 ? entryImpact
        : deformedWord < 0 ? 0 : approachingHit > 0 ? approachingHit
        : Motion.settle(time - wordStart) * (1 - Motion.smooth(motion.phase / 0.22))
    clip: true

    function wordCenter(index) {
        const word = words.itemAt(index)
        const gap = tokens[index] && tokens[index].gap ? pixelSize * 0.28 : 0
        return word ? word.x + (word.width + gap) / 2 : 0
    }

    readonly property real activeCenter: {
        // Follow the actual flight, so panning a long line cannot pull the
        // point sideways with a second, unrelated easing animation.
        return time >= line.t ? motion.x : wordCenter(mainIndexes[0] ?? 0)
    }
    Row {
        id: row
        spacing: 0
        x: implicitWidth <= root.width ? (root.width - implicitWidth) / 2
            : -Math.max(0, Math.min(implicitWidth - root.width, root.activeCenter - root.width * 0.45))
        y: (root.height - height) / 2 + 4

        Repeater {
            id: words
            model: root.tokens
            delegate: Item {
                id: word
                required property int index
                required property var modelData
                readonly property var span: root.spans[index] || ({ from: 0, to: 1 })
                readonly property real sung: LM.sung(span, root.time)
                readonly property real hit: index === root.deformedWord ? root.wordImpact : 0
                readonly property real gap: modelData.gap ? root.pixelSize * 0.28 : 0
                width: glyph.implicitWidth + gap
                height: glyph.implicitHeight
                y: 0.7 * hit
                transform: Scale {
                    origin.x: word.gap + (word.width - word.gap) / 2
                    origin.y: word.height
                    xScale: 1 + 0.045 * word.hit
                    yScale: 1 - 0.1 * word.hit
                }
                Text {
                    id: glyph
                    x: word.gap
                    text: word.modelData.s
                    font.family: root.theme.fontFamily
                    font.pixelSize: root.pixelSize
                    font.weight: Font.Medium
                    color: root.ink
                    opacity: 1 - 0.62 * root.emphasis
                }
                Item {
                    x: word.gap
                    width: glyph.implicitWidth * word.sung
                    height: glyph.implicitHeight
                    clip: true
                    Text {
                        text: glyph.text
                        font: glyph.font
                        color: root.accent
                    }
                }
            }
        }
    }
    // Geometry is exposed to the reel, which owns the single cross-line marker.
    function wordAnchor(index) {
        return { x: row.x + wordCenter(index), y: ground, size: dotSize,
            start: spans[index]?.from ?? line.t, end: spans[index]?.to ?? endTime,
            scaleX: 1, scaleY: 1, gap: false }
    }
    function anchorAt(which) {
        const index = which === "first" ? (mainIndexes[0] ?? 0)
            : which === "last" ? (mainIndexes[mainIndexes.length - 1] ?? 0) : here
        return wordAnchor(index)
    }
    function landingsAt(stamp) {
        const result = []
        for (let n = mainIndexes.length - 1; n >= 0; --n) {
            const index = mainIndexes[n]
            const born = spans[index]?.from ?? line.t
            const age = stamp - born
            if (age >= 0 && age < 0.42 && born >= line.t && born < Math.min(endTime, handoffStart)) {
                result.push(Object.assign(wordAnchor(index), { born: born, age: age }))
                if (result.length >= 8) break
            }
        }
        return result
    }
    function markerAt(stamp) {
        const k = Math.max(0, LM.wordAt(mainSpans, stamp))
        const index = mainIndexes[k] ?? 0
        const nextIndex = mainIndexes[Math.min(mainIndexes.length - 1, k + 1)] ?? index
        const start = mainSpans[k]?.from ?? line.t
        const next = nextIndex !== index ? (mainSpans[k + 1]?.from ?? endTime) : start
        const m = Motion.sample(stamp, start, next, wordCenter(index), wordCenter(nextIndex), arc)
        return Object.assign({}, m, { x: row.x + m.x, y: ground + m.y, size: dotSize,
            alpha: 1, gap: false, start: start, next: next, anchorX: row.x + wordCenter(index), anchorY: ground })
    }
    Loader {
        anchors.fill: parent
        active: !root.sharedMarker
        sourceComponent: LandingSplashes {
            bursts: root.landingsAt(root.time)
            accent: root.accent
        }
    }
    LyricMarker {
        id: marker
        anchors.fill: parent
        visible: !root.sharedMarker
        property real shown: root.singing ? 1 : 0
        Behavior on shown { NumberAnimation { duration: 150; easing.type: Easing.InOutCubic } }
        presence: shown
        pose: root.markerAt(root.time)
        trail: [root.markerAt(root.time - Math.min(0.018, root.motion.duration * 0.07)),
            root.markerAt(root.time - 2 * Math.min(0.018, root.motion.duration * 0.07))]
        accent: root.accent
        pulseX: pose.anchorX; pulseY: pose.anchorY
        pulseAge: root.time - pose.start
        pulseDuration: pose.next > pose.start ? Math.min(0.3, (pose.next - pose.start) * 0.75) : 0.3
    }
}
