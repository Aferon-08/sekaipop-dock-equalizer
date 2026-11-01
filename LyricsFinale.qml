pragma ComponentBehavior: Bound
import QtQuick
Item {
    id: root
    property real phase: 0
    property color ink: "#e1fff3"
    property color accent: "#acf4da"
    property string fontFamily: "sans-serif"
    property real pixelSize: 17
    readonly property real eased: phase*phase*(3-2*phase)
    readonly property real fullWidth: endText.implicitWidth+middle.implicitWidth+smileText.implicitWidth+12
    readonly property real finalWidth: endText.implicitWidth+smileText.implicitWidth+6
    Text {
        id: middle;visible:false;text:"of lyrics";font.family:root.fontFamily;font.pixelSize:root.pixelSize
    }
    Text {
        id: endText
        text:"The end";textFormat:Text.PlainText
        font.family:root.fontFamily;font.pixelSize:root.pixelSize;color:root.ink
        x:(root.width-root.fullWidth)/2+(root.fullWidth-root.finalWidth)/2*root.eased
        anchors.verticalCenter:parent.verticalCenter
    }
    Repeater {
        model: "of lyrics".length
        delegate: Text {
            id: glyph
            required property int index
            readonly property string before: "of lyrics".slice(0,index)
            TextMetrics {id: glyphMetrics;font:middle.font;text:glyph.before}
            text:"of lyrics"[index];font:middle.font;color:root.accent
            x:(root.width-root.fullWidth)/2+endText.implicitWidth+6+glyphMetrics.advanceWidth
                + Math.sin(index*2.4)*root.phase*18
            y:(root.height-height)/2-root.phase*(9+index%3*6)
            rotation:(index%2?1:-1)*root.phase*(15+index*5)
            opacity:Math.pow(1-root.phase,2)
            scale:1-root.phase*.4
        }
    }
    Text {
        id: smileText;text:":)";font:middle.font;color:root.ink
        x:(root.width-root.fullWidth)/2+endText.implicitWidth+middle.implicitWidth+12
            - (root.fullWidth-root.finalWidth)/2*root.eased
        anchors.verticalCenter:parent.verticalCenter
    }
    Accessible.name: root.phase>.99?"The end :)":"The end of lyrics :)"
}
