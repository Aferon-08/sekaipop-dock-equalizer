import QtQuick

// Small GPU surface: smooth overlapping ribbons, no full-dock texture capture.
ShaderEffect {
    id: ribbon
    required property var amplitudes
    required property var palette
    required property color secondary
    property real clock: 0
    property bool mirrored: false
    readonly property vector2d resolution: Qt.vector2d(width, height)
    readonly property color primaryColor: palette.accent
    readonly property color secondaryColor: secondary
    readonly property color inkColor: palette.ink
    readonly property real direction: mirrored ? -1 : 1
    function group(start) {
        const a = amplitudes
        return Qt.vector4d(a[start] || 0, a[start+1] || 0, a[start+2] || 0, a[start+3] || 0)
    }
    property vector4d audio0: group(0)
    property vector4d audio1: group(4)
    property vector4d audio2: group(8)
    property vector4d audio3: group(12)
    fragmentShader: Qt.resolvedUrl("spectrum-ribbon.frag.qsb")
}
