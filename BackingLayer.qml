pragma ComponentBehavior: Bound
import QtQuick
Item {
    id: root
    property var lines: []
    property real time: 0
    property real amount: 1
    property color accent: "#acf4da"
    property string fontFamily: "sans-serif"
    property real pixelSize: 12
    readonly property var activeLines: lines.filter(l=>time>=l.t && time<l.end+.4)
    readonly property bool active: activeLines.length>0
    Repeater {
        model: root.activeLines
        delegate: BackingPhrase {
            required property var modelData
            required property int index
            objectName: "backingPhrase"
            line: modelData; time: root.time; amount: root.amount
            width:Math.max(1,Math.min(implicitWidth,root.width*.78));height:implicitHeight
            x:Math.max(8,root.width-width-14)
            y:Math.max(16,root.height/2-34)-index*(height+3)
            fontFamily:root.fontFamily;pixelSize:root.pixelSize
            accent:root.accent;rotation:root.width>180?-6:0
        }
    }
}
