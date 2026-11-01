pragma ComponentBehavior: Bound
import QtQuick
import "LyricsMath.js" as LM
Item {
    id: root
    required property var line
    property real time: 0
    property real amount: 1
    property color accent: "#acf4da"
    property string fontFamily: "sans-serif"
    property real pixelSize: 12
    readonly property real entrance: Math.max(0,Math.min(1,(time-line.t)/.22))
    readonly property real release: Math.max(0,Math.min(1,(line.end+.4-time)/.4))
    readonly property real progress: {
        const spans=line.wordSpans || [], tokens=LM.tokens(line.text)
        if(!spans.length)return Math.max(0,Math.min(1,(time-line.t)/Math.max(.1,line.end-line.t)))
        let done=0,total=0
        for(let i=0;i<tokens.length;++i){
            const n=tokens[i].s.length,span=spans[i]
            total+=n
            if(span)done+=n*Math.max(0,Math.min(1,(time-span.from)/Math.max(.04,span.to-span.from)))
        }
        return done/Math.max(1,total)
    }
    implicitWidth: base.implicitWidth
    implicitHeight: base.implicitHeight
    opacity:time>=line.t && time<line.end+.4 ? entrance*release*amount : 0
    transform:Translate{y:(1-root.entrance)*5}
    Text {
        id:base;anchors.fill:parent;text:root.line.text;textFormat:Text.PlainText
        font.family:root.fontFamily;font.pixelSize:root.pixelSize
        fontSizeMode:Text.HorizontalFit;minimumPixelSize:8
        color:root.accent;opacity:.44
    }
    Item {
        width:root.width*root.progress;height:root.height;clip:true
        Text {width:root.width;height:root.height;text:base.text;font:base.font
            fontSizeMode:Text.HorizontalFit;minimumPixelSize:8;color:root.accent;opacity:.8}
    }
}
