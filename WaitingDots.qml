pragma ComponentBehavior: Bound
import QtQuick
import "MarkerMotion.js" as Motion

Item {
    id: root
    property real time: 0
    property real startTime: 0
    property real endTime: 1
    property bool playing: false
    property bool arrivedFromWord: false
    property bool departing: false
    property real firstMask: 0
    property real lastMask: 0
    property color accent: "#acf4da"
    readonly property real progress: Math.max(0, Math.min(1,
        (time - startTime) / Math.max(0.1, endTime - startTime)))

    function rockAt(stamp) {
        const age = stamp - startTime
        if (!arrivedFromWord || age < 0 || age > 0.8) return 0
        return -5 * Math.exp(-age * 5) * Math.sin(age * 18)
            * (1 - Motion.smooth((age - 0.65) / 0.15))
    }
    function anchorAt(index, stamp, withImpact) {
        const age = stamp - startTime
        const hit = withImpact && arrivedFromWord && index === 0 ? Motion.settle(age) : 0
        const angle = rockAt(stamp) * Math.PI / 180
        const dx = (index - 1) * 15
        const breath = Math.sin(stamp * 5 - index * 1.1)
        const dy = -1.8 * breath
        const leaving = index === 2 && departing ? 1 : Math.max(0, Math.min(1, (endTime - stamp) / 0.5))
        return { x: width / 2 + dx * Math.cos(angle) - dy * Math.sin(angle),
            y: height / 2 + dx * Math.sin(angle) + dy * Math.cos(angle) + 0.6 * hit,
            size: 6 * (0.9 + 0.14 * breath) * leaving,
            scaleX: 1 + 0.28 * hit, scaleY: 1 - 0.24 * hit,
            angle: 0, air: 0, gap: true, impact: hit }
    }
    Repeater {
        model: 3
        delegate: Rectangle {
            id: dot
            required property int index
            readonly property var point: root.anchorAt(index, root.time, true)
            readonly property real lit: Math.max(0, Math.min(1, root.progress * 3 - index))
            readonly property real flash: root.arrivedFromWord && index === 0 && root.time >= root.startTime
                ? Math.exp(-(root.time - root.startTime) / 0.4) : 0
            width: Math.max(0.01, point.size); height: width; radius: width / 2
            x: point.x - width / 2; y: point.y - height / 2
            color: root.accent
            opacity: (0.28 + 0.72 * Math.max(lit, flash))
                * (index === 0 ? 1 - root.firstMask : index === 2 ? 1 - root.lastMask : 1)
            transform: Scale {
                origin.x: dot.width / 2; origin.y: dot.height / 2
                xScale: dot.point.scaleX; yScale: dot.point.scaleY
            }
        }
    }
}
