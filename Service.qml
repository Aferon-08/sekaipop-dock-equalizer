import QtQuick
import Quickshell.Io
import "BeatTracker.js" as BeatTracker
import Quickshell.Services.Mpris

QtObject {
    id: root
    required property var host
    // A single session seed for all monitors; changing palette never regenerates geometry.
    property var widgetRects: ({})
    function setWidgetRect(id,rect) {
        if(JSON.stringify(widgetRects[id])===JSON.stringify(rect || undefined))return
        const next=Object.assign({},widgetRects)
        if(rect)next[id]=rect;else delete next[id]
        widgetRects=next
    }
    property string wallpaperSeed: ""
    property string wallpaperError: ""
    readonly property bool wallpaperNewRequested: host.settings.wallpaperRegenerate === true
    onWallpaperNewRequestedChanged: {
        if (wallpaperNewRequested && !wallpaperSeedJob.running) {
            wallpaperSeedJob.command = ["python3", host.path("wallpaper-seed.py"), "--new"]
            wallpaperSeedJob.running = true
        }
    }
    property Process wallpaperSeedJob: Process {
        running: true
        command: ["python3", root.host.path("wallpaper-seed.py")]
        stdout: StdioCollector { onStreamFinished: {
            try { root.wallpaperSeed = JSON.parse(text).seed; root.wallpaperError = "" }
            catch (_) { root.wallpaperError = "Не удалось получить seed обоев" }
        } }
        stderr: StdioCollector { onStreamFinished: { if(text.trim()) root.wallpaperError=text.trim().slice(0,300) } }
        onExited: {
            if(root.wallpaperNewRequested) root.host.setSetting("wallpaperRegenerate",false)
        }
    }
    property WordtimeStore wordtimes: WordtimeStore { host: root.host }

    property var beatState: BeatTracker.reset()
    property real beatPulse: 0
    property real beatBpm: 0
    property real beatConfidence: 0
    function resetRhythm() {
        beatState = BeatTracker.reset()
        beatPulse = 0; beatBpm = 0; beatConfidence = 0
    }
    property var bands: []
    property string error: ""
    property int frames: 0
    property int retryCount: 0
    property bool waiting: false
    property var surfaces: ({})
    function setSurface(screen, state) {
        const next = Object.assign({}, surfaces)
        next[screen] = state
        surfaces = next
    }
    // Share one metadata lookup between monitors. Never download media.
    property var durationCache: ({})
    property var durationQueue: []
    property string durationJob: ""
    function requestYoutubeDuration(id) {
        if (!/^[A-Za-z0-9_-]{11}$/.test(id) || durationCache[id] !== undefined
            || durationJob === id || durationQueue.includes(id)) return
        durationQueue = durationQueue.concat([id])
        pumpDuration()
    }
    function pumpDuration() {
        if (durationJob !== "" || durationQueue.length === 0) return
        durationJob = durationQueue[0]
        durationQueue = durationQueue.slice(1)
        durationLookup.command = ["python3", root.host.path("youtube-duration.py"), durationJob]
        durationLookup.running = true
    }
    property Process durationLookup: Process {
        stdout: StdioCollector {
            onStreamFinished: {
                try {
                    const result = JSON.parse(text)
                    const next = Object.assign({}, root.durationCache)
                    next[result.id] = Number.isFinite(result.seconds) && result.seconds > 0 ? result.seconds : 0
                    // Bound this session's cache without writing browsing history to disk.
                    const keys = Object.keys(next)
                    if (keys.length > 64) delete next[keys[0]]
                    root.durationCache = next
                } catch (_) {}
            }
        }
        onExited: {
            root.durationJob = ""
            Qt.callLater(root.pumpDuration)
        }
    }
    // MPRIS announces state changes. Waiting for music needs no audio tap.
    readonly property var playerModel: Mpris.players
    readonly property bool playing: playerModel.values.some(player =>
        player.playbackState === MprisPlaybackState.Playing)
    readonly property bool wanted: host.working && (host.settings.enabled || (host.settings.proceduralWallpaper === true && host.settings.wallpaperPet !== false)) && playing
    readonly property bool running: tap.running
    readonly property bool audible: bands.some(v => v > 5)

    onWantedChanged: {
        retryCount = 0
        waiting = false
        retry.stop()
        if (!wanted) {
            bands = []
            beatPulse = 0
            beatState = BeatTracker.reset()
        }
    }

    property Process tap: Process {
        running: root.wanted && !root.waiting && root.retryCount < 3
        // The stream follows the default output monitor, never the microphone.
        // The parent-death signal also cleans up cava on a shell crash.
        command: ["setpriv", "--pdeathsig", "TERM", "nice", "-n", "5", "cava", "-p", root.host.path("cava.conf")]
        stdout: SplitParser {
            onRead: data => {
                const values = data.split(";").filter(v => v.trim() !== "").map(Number)
                if (values.length !== 64 || !values.every(Number.isFinite))
                    return
                const next = values.map(v => Math.max(0, Math.min(1000, v)))
                root.beatState = BeatTracker.update(root.beatState, next, Date.now())
                root.beatPulse = root.beatState.pulse
                root.beatBpm = root.beatState.bpm
                root.beatConfidence = root.beatState.confidence
                ++root.frames
                root.error = ""
                // Silence during a playing track should not cause UI updates.
                if (next.some((v, i) => v !== root.bands[i]) || root.bands.length !== next.length)
                    root.bands = next
            }
        }
        stderr: StdioCollector {
            onStreamFinished: {
                if (text.trim() !== "")
                    root.error = text.trim().slice(0, 500)
            }
        }
        onExited: (code, status) => {
            root.bands = []
            if (root.wanted) {
                root.waiting = true
                ++root.retryCount
                if (root.error === "")
                    root.error = "CAVA остановлена (код " + code + "). Проверьте аудиовыход."
                if (root.retryCount < 3)
                    root.retry.restart()
            }
        }
    }

    property Timer retry: Timer {
        interval: 3000
        onTriggered: root.waiting = false
    }

    property IpcHandler ipc: IpcHandler {
        target: "dockequalizer"
        function status(): string {
            return JSON.stringify({ playing: root.playing, working: root.wanted, running: root.running,
                players: root.playerModel.values.length, surfaces: root.surfaces,
                frames: root.frames, beatPulse: root.beatPulse, bpm: root.beatBpm, beatConfidence: root.beatConfidence, audible: root.audible, error: root.error,
                wordtimeBusy: root.wordtimes.busy, wordtimeCached: Object.keys(root.wordtimes.cache).length,
                wordtimeEngineReady: root.wordtimes.engineReady, wordtimeGenerating: root.wordtimes.generationBusy,
                wordtimeCapturing: root.wordtimes.captureBusy, wordtimeCapturePhase: root.wordtimes.capturePhase,
                bands: root.bands.length, peak: Math.max(0, ...root.bands) })
        }
    }
}
