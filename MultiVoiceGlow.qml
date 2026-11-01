pragma ComponentBehavior: Bound
import QtQuick

// Static gaussian textures move with song-time samples. Their soft edge and
// delayed pools remain completely still when the playback clock is paused.
Item {
    id: root
    property var pose: ({ x: 0, y: 0, alpha: 0 })
    property var nearPose: pose
    property var farPose: nearPose
    property color accent: "#acf4da"
    property real poolWidth: 112
    property real intensity: 1
    property real poolHeight: 64
    component Pool: Canvas {
        id: pool
        required property var point
        required property real strength
        property bool core: false
        width: root.poolWidth
        height: root.poolHeight
        x: point.x - width / 2
        y: point.y - height / 2 + 9
        opacity: (point.alpha || 0) * strength * root.intensity
        renderTarget: Canvas.Image
        onPaint: {
            var c = getContext("2d")
            c.reset()
            c.scale(width, height)
            var g = c.createRadialGradient(0.5, 0.5, 0, 0.5, 0.5, 0.5)
            var a = root.accent
            function tint(alpha) { return Qt.rgba(a.r, a.g, a.b, alpha) }
            g.addColorStop(0, core ? Qt.rgba(1, 1, 1, 0.72) : tint(0.6))
            g.addColorStop(0.085, tint(core ? 0.9 : 0.58))
            g.addColorStop(0.2, tint(0.48))
            g.addColorStop(0.38, tint(0.24))
            g.addColorStop(0.62, tint(0.075))
            g.addColorStop(0.82, tint(0.014))
            g.addColorStop(1, tint(0))
            c.fillStyle = g
            c.fillRect(0, 0, 1, 1)
        }
        Connections { target: root; function onAccentChanged() { pool.requestPaint() } }
    }
    Pool { point: root.farPose; strength: 0.13 }
    Pool { point: root.nearPose; strength: 0.22 }
    Pool { point: root.pose; strength: 0.45; core: true }
}
