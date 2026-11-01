pragma ComponentBehavior: Bound
import QtQuick

// One distance field joins the dock and both droplets without interior seams.
// Only the housing changes shape; dock keys remain sharp and interactive.
Item {
    id: root
    required property var host
    readonly property var dock: host.dock.item
    readonly property bool vertical: host.dock.vertical
    readonly property real bodyWidth: dock.capWidth
    readonly property real bodyHeight: dock.capHeight
    readonly property real bodyAlong: vertical ? bodyHeight : bodyWidth
    readonly property real bodyAcross: vertical ? bodyWidth : bodyHeight
    readonly property real gap: Math.max(4, Math.min(64, host.settings.gap))
    readonly property real length: Math.max(0, Math.min(host.settings.width,
        ((vertical ? parent.height - dock.height : parent.width - dock.width) / 2) - gap - 14))
    readonly property real thickness: Math.max(20, Math.min(host.settings.height, bodyAcross - 6))
    readonly property bool fits: length >= 64
    readonly property bool expanded: host.working && !!host.service && host.service.playing
    readonly property bool ownsHousing: visible && host.dock.look !== "transparent"
        && skin.status !== ShaderEffect.Error

    property real reveal: 0
    property bool motionReady: false
    readonly property int collapseDelay: Math.max(200, Math.min(3000, host.settings.collapseDelay || 600))

    function startClosing() {
        closing.from = reveal
        closing.start()
    }

    // Keep the curves fixed. Switching easing.type on a reused Behavior can
    // start the next job with the previous direction's curve in Qt.
    function animateReveal() {
        if (!motionReady)
            return
        const current = reveal
        closeWait.stop()
        opening.stop()
        closing.stop()
        if (expanded) {
            opening.from = current
            opening.start()
        } else if (host.working && visible && current > 0) {
            // Let the last spectrum decay before the liquid housing retracts.
            // This timer never keeps the audio stream alive.
            closeWait.restart()
        } else {
            startClosing()
        }
    }
    onExpandedChanged: animateReveal()
    Component.onCompleted: {
        motionReady = true
        if (expanded)
            animateReveal()
        if (wantsFusion) animateFusion()
    }
    NumberAnimation {
        id: opening
        target: root
        property: "reveal"
        to: 1
        duration: 900
        easing.type: Easing.OutBack
        easing.overshoot: 1.6
    }
    NumberAnimation {
        id: closing
        target: root
        property: "reveal"
        to: 0
        duration: 620
        easing.type: Easing.InOutCubic
    }
    Timer {
        id: closeWait
        interval: root.collapseDelay
        onTriggered: {
            if (!root.expanded)
                root.startClosing()
        }
    }
    readonly property bool wantsFusion: lyricLayer.wide && !vertical && host.dock.look !== "transparent"
    property real fusion: 0
    property real outline: 0
    property real edgeLight: host.working && lyricLayer.playing ? 1 : 0
    Behavior on edgeLight { NumberAnimation { duration: 450; easing.type: Easing.OutCubic } }
    function animateFusion() {
        fuseOpen.stop(); fuseClose.stop(); traceDraw.stop(); traceFade.stop(); contact.stop()
        if (wantsFusion) {
            fuseOpen.from = fusion; fuseOpen.start(); contact.restart()
        } else {
            fuseClose.from = fusion; fuseClose.start()
            traceFade.from = outline; traceFade.start()
        }
    }
    onWantsFusionChanged: if (motionReady) animateFusion()
    NumberAnimation { id: fuseOpen; target: root; property: "fusion"; to: 1; duration: 850; easing.type: Easing.InOutCubic }
    NumberAnimation { id: fuseClose; target: root; property: "fusion"; to: 0; duration: 800; easing.type: Easing.OutBack; easing.overshoot: 1.2 }
    Timer { id: contact; interval: 350; onTriggered: { traceDraw.from = root.outline; traceDraw.start() } }
    NumberAnimation { id: traceDraw; target: root; property: "outline"; to: 1; duration: 1050; easing.type: Easing.OutCubic }
    NumberAnimation { id: traceFade; target: root; property: "outline"; to: 0; duration: 260; easing.type: Easing.InOutCubic }
    function levels(offset) {
        const a = host.working && host.service && host.service.playing ? host.service.bands : []
        const gain = Math.max(0.1, Math.min(5, host.settings.sensitivity || 1))
        const result = []
        for (let group = 0; group < 3; ++group) {
            let sum = 0
            for (let i = 0; i < 10; ++i) {
                const value = (a[offset + group * 10 + i] || 0) / 1000
                sum += value * value
            }
            result.push(Math.min(1, Math.sqrt(sum / 10) * gain))
        }
        return Qt.vector3d(result[0], result[1], result[2])
    }
    property vector3d leftLevels: levels(0)
    property vector3d rightLevels: levels(32)
    Behavior on leftLevels { Vector3dAnimation { duration: 160 } }
    Behavior on rightLevels { Vector3dAnimation { duration: 160 } }
    readonly property color lightPrimary: colors.accent
    readonly property color lightSecondary: host.theme.accentMint || colors.ink
    readonly property color lightTertiary: Qt.tint(lightSecondary,
        Qt.rgba(colors.ink.r, colors.ink.g, colors.ink.b, 0.4))
    // Leave room for the opening overshoot, so the spring never hits a clamp.
    readonly property real phase: Math.max(0, Math.min(1.1, reveal * (1 - fusion)))
    readonly property real dropletLength: thickness + (length - thickness) * phase
    readonly property real radius: host.dock.radius + (40 - host.dock.radius) * lyricLayer.musicLayout
    readonly property real outward: -radius + (gap + length / 2 + radius) * phase
    readonly property real pad: 32
    readonly property real spectrumOpacity: Math.max(0, Math.min(1, (phase - 0.6) / 0.35))
    // Use the native dock palette in every layout, including live theme changes.
    readonly property var colors: host.dock.palette
    readonly property real lyricsWidthExtra: lyricLayer.extraWidth
    readonly property real lyricsHeightExtra: lyricLayer.extraHeight
    readonly property real lyricsHeaderHeight: lyricLayer.headerHeight
    readonly property real iconsOffset: lyricLayer.iconsOffset
    readonly property real iconsScale: lyricLayer.iconsScale
    readonly property bool suppressMediaKey: lyricLayer.wide
    readonly property real iconsOpacity: 1 - lyricLayer.lyricsOpacity

    visible: host.settings.enabled && fits && !host.dock.asleep

    Item {
        id: liquid
        width: root.bodyAlong + 2 * (root.length + root.gap + root.pad)
        height: root.bodyAcross + 2 * root.pad
        x: root.dock.x + root.bodyWidth / 2 - width / 2 + lyricLayer.swipeX
        y: root.dock.y + root.bodyHeight / 2 - height / 2 + lyricLayer.swipeY
        rotation: root.vertical ? 90 : 0

        ShaderEffect {
            id: skin
            anchors.fill: parent
            visible: root.host.dock.look !== "transparent" || root.phase > 0.001
            readonly property vector2d resolution: Qt.vector2d(width, height)
            readonly property vector4d dockRect: Qt.vector4d(
                (width - root.bodyAlong) / 2, root.pad, root.bodyAlong, root.bodyAcross)
            readonly property vector4d wingData: Qt.vector4d(
                dockRect.x - root.outward, root.pad + root.bodyAcross / 2,
                dockRect.x + root.bodyAlong + root.outward, root.dropletLength)
            readonly property vector4d params: Qt.vector4d(root.thickness, root.radius,
                Math.sin(Math.PI * Math.min(1, root.phase)) * root.thickness * 0.85,
                root.host.dock.shadow)
            readonly property vector4d skinStyle: Qt.vector4d(root.colors.border,
                root.colors.ringWidth, root.host.dock.look === "transparent" ? 0 : 1,
                root.vertical ? 1 : 0)
            readonly property vector4d lightData: Qt.vector4d(Math.max(0, Math.min(1, root.fusion)), root.outline, lyricLayer.waitingLightAmount, root.edgeLight)
            readonly property vector4d leftAudio: Qt.vector4d(root.leftLevels.x, root.leftLevels.y, root.leftLevels.z, 0)
            readonly property vector4d rightAudio: Qt.vector4d(root.rightLevels.x, root.rightLevels.y, root.rightLevels.z, 0)
            readonly property color lightPrimary: root.lightPrimary
            readonly property color lightSecondary: root.lightSecondary
            readonly property color lightTertiary: root.lightTertiary
            readonly property real heartPulse: lyricLayer.heartPulse
            readonly property vector2d glowBreath: lyricLayer.glowBreath
            readonly property vector4d wordLight: Qt.vector4d(lyricLayer.wordLight.x,
                lyricLayer.wordLight.y, lyricLayer.wordLight.z * lyricLayer.lyricsOpacity, 0)
            readonly property vector4d wordLightTail: Qt.vector4d(lyricLayer.wordLightTail.x,
                lyricLayer.wordLightTail.y, lyricLayer.wordLightTail.z * lyricLayer.lyricsOpacity, 0)
            readonly property vector4d wordLightMist: Qt.vector4d(lyricLayer.wordLightMist.x,
                lyricLayer.wordLightMist.y, lyricLayer.wordLightMist.z * lyricLayer.lyricsOpacity, 0)
            readonly property color fillColor: root.colors.fill
            readonly property color rimColor: root.colors.rim
            readonly property color ringColor: root.colors.ring
            readonly property color shadowColor: root.colors.shadow
            fragmentShader: Qt.resolvedUrl("liquid.frag.qsb")
        }

        Repeater {
            model: 2
            delegate: VisualizerCapsule {
                required property int index
                host: root.host
                channel: index
                palette: root.colors
                housingVisible: false
                visible: root.phase > 0.01
                opacity: root.spectrumOpacity
                width: root.dropletLength
                height: root.thickness + 3
                x: (index === 0 ? skin.wingData.x : skin.wingData.z) - width / 2
                y: skin.wingData.y - root.thickness / 2
            }
        }
    }
    DockLyrics {
        id: lyricLayer
        host: root.host
        glassSource: skin
        glassRect: Qt.rect((liquid.width - root.bodyWidth) / 2 + 16,
            root.pad + 93, Math.max(1, root.bodyWidth - 32), 110)
    }
}
