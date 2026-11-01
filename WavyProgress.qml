import QtQuick

Item {
    id: root
    property real fraction: 0
    property bool indeterminate: false
    property bool playing: true
    property real waveAmount: playing ? 1 : 0
    Behavior on waveAmount { NumberAnimation { duration: 280; easing.type: Easing.InOutCubic } }
    property real phase: 0
    property bool seekable: false
    property color ink: "white"
    property color accent: "#9ce9c2"
    signal seek(real fraction)

    Canvas {
        id: canvas
        anchors.fill: parent
        renderStrategy: Canvas.Threaded
        onAvailableChanged: if (available) requestPaint()
        onWidthChanged: requestPaint()
        onHeightChanged: requestPaint()
        onPaint: {
            const ctx = getContext("2d")
            ctx.clearRect(0, 0, width, height)
            if (width < 8 || height < 8) return
            const mid = height / 2
            const end = Math.max(3, Math.min(width - 5, (root.indeterminate ? 0.45 + 0.35 * Math.sin(root.phase * 2) : root.fraction) * (width - 8) + 4))
            ctx.lineCap = "round"
            ctx.lineWidth = 3
            ctx.strokeStyle = Qt.rgba(root.ink.r, root.ink.g, root.ink.b, 0.16)
            ctx.beginPath(); ctx.moveTo(Math.min(width - 4, end + 9), mid); ctx.lineTo(width - 4, mid); ctx.stroke()
            ctx.strokeStyle = root.accent
            ctx.beginPath()
            for (let x = 4; x <= end; x += 1) {
                const envelope = Math.min(1, (x - 4) / 12, (end - x) / 12)
                const y = mid + Math.sin(x * Math.PI / 15 - root.phase * Math.PI * 2) * 3.5 * root.waveAmount * Math.max(0, envelope)
                if (x === 4) ctx.moveTo(x, y); else ctx.lineTo(x, y)
            }
            ctx.stroke()
            ctx.fillStyle = root.accent
            ctx.beginPath(); ctx.arc(end, mid, 3, 0, 2 * Math.PI); ctx.fill()
            ctx.fillStyle = root.ink
            ctx.beginPath(); ctx.arc(width - 4, mid, 1.8, 0, 2 * Math.PI); ctx.fill()
        }
    }
    onWaveAmountChanged: canvas.requestPaint()
    onIndeterminateChanged: canvas.requestPaint()
    onFractionChanged: canvas.requestPaint()
    onPhaseChanged: canvas.requestPaint()
    onInkChanged: canvas.requestPaint()
    onAccentChanged: canvas.requestPaint()
    MouseArea {
        anchors.fill: parent
        enabled: root.seekable
        cursorShape: Qt.PointingHandCursor
        onClicked: mouse => root.seek(Math.max(0, Math.min(1, mouse.x / width)))
    }
}
