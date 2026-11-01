pragma ComponentBehavior: Bound
import QtQuick
import "MarkerMotion.js" as Motion

// One renderer, shared by every row in the reel, survives line changes.
Item {
    id: root
    property var pose: ({ x: 0, y: 0, size: 5, scaleX: 1, scaleY: 1, angle: 0, air: 0, alpha: 0 })
    property var trail: []
    property real presence: 1
    property color accent: "#acf4da"
    property real pulseX: pose.x
    property real pulseY: pose.y
    property real pulseAge: -1
    property real pulseDuration: 0.3
    readonly property real pulse: Math.max(0, Math.min(1, pulseAge / Math.max(0.04, pulseDuration)))
    readonly property bool pulseVisible: pulseAge >= 0 && pulseAge < pulseDuration
    opacity: Math.max(0, Math.min(1, presence))

    // A small, low-contrast ripple at the landing, rather than a persistent underline.
    Rectangle {
        width: root.pose.size * (1.4 + 3 * Motion.travel(root.pulse))
        height: width * 0.3
        x: root.pulseX - width / 2; y: root.pulseY + 1 - height / 2
        radius: height / 2
        color: "transparent"
        border.width: 0.8; border.color: root.accent
        opacity: root.pulseVisible ? 0.36 * Math.pow(1 - root.pulse, 2) : 0
    }
    Repeater {
        model: root.trail
        delegate: Rectangle {
            required property int index
            required property var modelData
            width: root.pose.size * (0.72 - index * 0.18)
            height: width; radius: width / 2
            x: modelData.x - width / 2; y: modelData.y - height / 2
            color: root.accent
            opacity: root.pose.air * (0.15 - index * 0.05) * root.pose.alpha * (modelData.alpha ?? 1)
        }
    }
    Item {
        id: bead
        width: root.pose.size; height: width
        x: root.pose.x - width / 2; y: root.pose.y - height / 2
        scale: Math.max(0, root.pose.alpha)
        opacity: Math.max(0, Math.min(1, root.pose.alpha))
        rotation: root.pose.angle
        transform: Scale {
            origin.x: bead.width / 2; origin.y: bead.height / 2
            xScale: root.pose.scaleX; yScale: root.pose.scaleY
        }
        Rectangle {
            anchors.centerIn: parent
            width: parent.width * 1.85; height: width; radius: width / 2
            color: root.accent; opacity: 0.06 + 0.04 * root.pose.air
        }
        Rectangle {
            anchors.fill: parent; radius: height / 2
            color: root.accent
            border.width: 0.6; border.color: Qt.lighter(root.accent, 1.12)
        }
        Rectangle {
            x: parent.width * 0.23; y: parent.height * 0.17
            width: parent.width * 0.26; height: width * 0.65; radius: height / 2
            color: "white"; opacity: 0.45
        }
    }
}
