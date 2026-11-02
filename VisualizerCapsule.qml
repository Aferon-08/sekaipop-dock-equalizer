import QtQuick

Item {
    id: root
    required property var host
    required property int channel
    property bool housingVisible: true
    readonly property var t: host.theme
    property var palette: host.dock.palette
    readonly property var values: host.service ? host.service.bands : []
    readonly property bool live: host.working && !!host.service && host.service.playing
    property var heldValues: []
    property real level: 0
    readonly property real sensitivity: Math.max(0.1, Math.min(5, host.settings.sensitivity))
    readonly property string style: host.settings.style
    property var ribbonAmplitudes: []
    property real ribbonClock: 0
    FrameAnimation {
        running: root.visible && root.opacity > 0.001 && root.style !== "bars" && root.level > 0.001
        onTriggered: root.ribbonClock += Math.min(frameTime, 0.05)
    }

    // Retain only the last visual frame, without keeping an audio stream open.
    // New playback cancels the fade; pause smoothly takes that frame to zero.
    function syncFrame() {
        if (live && values.length > 0) {
            fade.stop()
            heldValues = values
            level = 1
        } else if (level > 0 && !fade.running) {
            fade.from = level
            fade.start()
        }
    }
    NumberAnimation {
        id: fade
        target: root
        property: "level"
        to: 0
        duration: Math.min(root.host.settings.spectrumFade ?? 450, Math.max(120, (root.host.settings.collapseDelay || 600) - 100))
        easing.type: Easing.OutCubic
        onFinished: root.heldValues = []
    }

    // Keep the housing still; only the small canvas inside is redrawn for audio.
    Rectangle {
        visible: root.housingVisible
        x: 0
        y: root.host.dock.capsule ? 1 : 3
        width: parent.width
        height: parent.height - 3
        radius: height / 2
        color: root.palette.shadow
    }
    Rectangle {
        id: housing
        width: parent.width
        height: parent.height - 3
        radius: height / 2
        color: root.housingVisible ? root.palette.fill : "transparent"
        border.color: root.palette.rim
        border.width: root.housingVisible ? root.palette.border : 0
        antialiasing: true

        Rectangle {
            visible: root.housingVisible
            anchors.fill: parent
            anchors.margins: root.palette.border + 2
            radius: height / 2
            color: "transparent"
            border.width: 1
            border.color: Qt.rgba(root.palette.ink.r, root.palette.ink.g, root.palette.ink.b, 0.16)
        }

        Canvas {
            id: canvas
            visible: root.style === "bars"
            anchors.fill: parent
            anchors.margins: root.palette.border + 5
            renderStrategy: Canvas.Threaded
            transform: Scale {
                origin.x: canvas.width / 2
                xScale: root.channel === 0 && root.host.settings.mirrorLeft !== false ? -1 : 1
            }
            property var amplitudes: new Array(32).fill(0)

            onAvailableChanged: {
                if (available)
                    refreshBands()
            }

            function refreshBands() {
                const next = []
                // Keep CAVA's two channel halves separate on the two sides.
                for (let i = 0; i < 32; ++i) {
                    const value = Math.min(1, (root.heldValues[root.channel * 32 + i] || 0) / 1000 * root.sensitivity) * root.level
                    next.push(value)
                }
                amplitudes = next
                const smooth = []
                for (let i=0; i<16; ++i) {
                    // Lift quiet audio without turning silence into an idle wave.
                    const raw = Math.max(next[i*2], next[i*2+1])
                    const lifted = Math.pow(raw, 0.62)
                    const previous = root.ribbonAmplitudes[i] || 0
                    smooth.push(previous + (lifted-previous) * (lifted>previous ? 0.68 : 0.38))
                }
                root.ribbonAmplitudes = root.level < 0.001 ? [] : smooth
                if (visible) requestPaint()
            }

            onWidthChanged: requestPaint()
            onHeightChanged: requestPaint()
            onPaint: {
                const ctx = getContext("2d")
                ctx.clearRect(0, 0, width, height)
                if (width < 2 || height < 2)
                    return
                const mid = height / 2
                const n = amplitudes.length
                const step = width / (n - 1)
                ctx.lineWidth = 1
                ctx.strokeStyle = Qt.rgba(root.palette.ink.r, root.palette.ink.g, root.palette.ink.b, 0.35)
                ctx.beginPath()
                ctx.moveTo(0, mid)
                ctx.lineTo(width, mid)
                ctx.stroke()
                if (!amplitudes.some(v => v > 0.002))
                    return
                const gradient = ctx.createLinearGradient(0, 0, width, 0)
                gradient.addColorStop(0, root.palette.accent)
                gradient.addColorStop(1, root.palette.ink)
                ctx.fillStyle = gradient
                if (root.style === "bars") {
                    const barStep = width / n
                    for (let i = 0; i < n; ++i) {
                        const h = Math.max(1, amplitudes[i] * (height - 2))
                        ctx.fillRect(i * barStep, mid - h / 2, Math.max(1, barStep - 2), h)
                    }
                } else {
                    ctx.beginPath()
                    ctx.moveTo(0, mid)
                    for (let i = 0; i < n; ++i) {
                        const envelope = Math.sin(Math.PI * i / (n - 1)) * 0.85 + 0.15
                        const amp = Math.max(0.4, amplitudes[i] * (mid - 1) * envelope)
                        const x = i * step
                        const prev = i === 0 ? mid : mid - Math.max(0.4, amplitudes[i - 1] * (mid - 1)
                            * (Math.sin(Math.PI * (i - 1) / (n - 1)) * 0.85 + 0.15))
                        ctx.bezierCurveTo(x - step * 0.5, prev, x - step * 0.5, mid - amp, x, mid - amp)
                    }
                    for (let i = n - 1; i >= 0; --i) {
                        const amp = Math.max(0.4, amplitudes[i] * (mid - 1)
                            * (Math.sin(Math.PI * i / (n - 1)) * 0.85 + 0.15))
                        ctx.lineTo(i * step, mid + amp)
                    }
                    ctx.closePath()
                    ctx.fill()
                }
            }
        }
        SpectrumRibbon {
            anchors.fill: parent
            anchors.margins: root.palette.border + 4
            visible: root.style !== "bars"
            amplitudes: root.ribbonAmplitudes
            palette: root.palette
            secondary: root.host.theme.accentMint || root.palette.ink
            clock: root.ribbonClock
            mirrored: root.channel === 0 && root.host.settings.mirrorLeft !== false
        }
    }

    onValuesChanged: syncFrame()
    onLiveChanged: syncFrame()
    onHeldValuesChanged: canvas.refreshBands()
    onLevelChanged: canvas.refreshBands()
    onSensitivityChanged: canvas.refreshBands()
    onStyleChanged: canvas.requestPaint()
    onPaletteChanged: canvas.requestPaint()
    Component.onCompleted: {
        syncFrame()
        canvas.refreshBands()
    }
}
