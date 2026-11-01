pragma ComponentBehavior: Bound
import QtQuick
import "MarkerMotion.js" as Motion

// The desktop LyricsLine uses Burst's flying diamonds on each main word.
// This smaller fan uses song time, retaining overlapping impacts on fast lyrics.
Item {
    id: root
    property var bursts: []
    property color accent: "#acf4da"
    readonly property int activeCount: Math.min(8, bursts.length)
    visible: activeCount > 0

    // A fixed pool avoids recreating particles on every clock frame.
    Repeater {
        model: 8
        delegate: Item {
            id: splash
            required property int index
            readonly property var impact: root.bursts[index] || null
            readonly property real age: impact ? impact.age : -1
            readonly property real phase: Math.max(0, Math.min(1, age / 0.42))
            readonly property real travel: 1 - Math.pow(1 - phase, 3)
            readonly property real radius: impact ? Math.max(11, impact.size * 2.7) : 11
            readonly property real upward: impact ? Math.max(0, Math.min(radius * 0.75, impact.y - 2.5)) : 0
            visible: !!impact && age >= 0 && age < 0.42

            Repeater {
                model: 6
                delegate: Rectangle {
                    id: bit
                    required property int index
                    readonly property real angle: (-165 + index * 30) * Math.PI / 180
                    readonly property real reach: 0.72 + 0.28 * ((index * 7) % 5) / 4
                    width: (splash.impact ? Math.max(2.4, splash.impact.size * 0.56) : 2.4)
                        * (1 - 0.5 * splash.phase)
                    height: width; radius: 0.35
                    x: (splash.impact ? splash.impact.x : 0)
                        + Math.cos(angle) * splash.radius * reach * splash.travel - width / 2
                    y: (splash.impact ? splash.impact.y : 0)
                        + Math.sin(angle) * splash.upward * reach * splash.travel
                        + 3 * splash.phase * splash.phase - height / 2
                    rotation: 45 + (index % 2 ? 95 : -75) * splash.phase
                    color: index % 3 === 1 ? Qt.tint(root.accent, Qt.rgba(1, 1, 1, 0.7)) : index % 3 === 2 ? Qt.lighter(root.accent, 1.13) : root.accent
                    opacity: 0.9 * Motion.smooth(splash.phase / 0.07) * (1 - splash.phase * splash.phase)
                }
            }
        }
    }
}
