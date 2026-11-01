import QtQuick
import Quickshell.Io
import "ImportedLyrics.js" as ImportedLyrics
import "AnalysisPolicy.js" as AnalysisPolicy

QtObject {
    id: root
    required property var host
    property var cache: ({})
    property var queue: []
    property var job: null
    property bool received: false
    property var lastAction: ({})
    property int epoch: 0
    property bool engineReady: false
    property bool voicesReady: false
    property var attempted: ({})
    property var requestedRefresh: ({})
    property var generationJob: null
    property var generationResult: null
    property string generationPhase: ""
    property var generationCompute: ({})
    property var generationDetail: ({})
    property real generationProgress: 0
    property bool cancelling: false
    property string generationError: ""
    property string generationTemporary: ""
    property var captureJob: null
    property var captureResult: null
    property var recordings: ({})
    property var analysisRequests: ({})
    property var pendingCapture: null
    property real captureProgress: 0
    property string capturePhase: ""
    property var captureBlocked: ({})
    property string lastCaptureKey: ""
    property real lastCapturePosition: 0
    readonly property bool captureBusy: !!captureJob
    readonly property bool generationBusy: !!generationJob
    readonly property bool busy: !!job || queue.length > 0
    function token(track) { return AnalysisPolicy.identity(track) }
    function needsAnalysis(track, text, stableSource) {
        return requestedRefresh[token(track)]===true || AnalysisPolicy.needed(resultFor(track), host.settings ? host.settings.multivoice !== false : true, stableSource===false ? null : text, voicesReady)
    }
    function recordingFor(track) { return recordings[token(track)] || null }
    function requestAnalysis(track, text, reference) {
        const key=token(track), requests=Object.assign({},analysisRequests)
        requests[key]={track:track,text:text || "",reference:reference || null}
        analysisRequests=requests
        pumpCapture()
        if (!generationJob || generationJob.token !== key)
            lastAction={token:key,ok:true,message:recordingFor(track) ? "Запись готова. Ожидаем текст или свободный обработчик." : "Обработка запрошена. Spotify: дождитесь полной записи трека с начала."}
        return true
    }
    function reanalyze(track, text, reference) {
        return requestAnalysis(track,text || dialog.lyricsText,reference)
    }
    function resultFor(track) { return cache[token(track)] || null }
    function request(track, force) {
        const key = token(track)
        if (!track.title || (!force && cache[key] !== undefined)
            || (job && job.token === key) || queue.some(j => j.token === key)) return
        enqueue("lookup", track, "")
    }
    function enqueue(action, track, file) {
        if (queue.length >= 16) return false
        if (action !== "lookup" && captureJob && token(captureJob.track) === token(track)) capture.signal(15)
        if (action !== "lookup" && pendingCapture && token(pendingCapture.track) === token(track)) {
            discard(pendingCapture.audio); pendingCapture = null
        }
        if (action !== "lookup" && generationJob && generationJob.token === token(track)) cancelGeneration()
        queue = queue.concat([{ action: action, track: track, token: token(track), file: file }])
        pump()
        return true
    }
    function pump() {
        if (job || !queue.length) return
        job = Object.assign({}, queue[0], { epoch: epoch }); queue = queue.slice(1); received = false
        worker.command = ["nice", "-n", "10", "python3", host.path("wordtime.py"), job.action,
            "--track-json", JSON.stringify(job.track), "--file", job.file]
        worker.running = true
    }
    function complete(result) {
        if (!job) return
        received = true
        if (result.audio) {
            const recordings=Object.assign({},root.recordings)
            recordings[job.token]={track:job.track,audio:result.audio,text:"",reference:null}
            root.recordings=recordings
            Qt.callLater(pumpCapture)
        }
        if (job.action === "lookup" && job.epoch !== epoch) return
        if (result.ok && (result.status === "ready" || result.status === "partial")) {
            try { result.lines = ImportedLyrics.convert(result); result.voices = ImportedLyrics.voices(result, result.lines) }
            catch (error) { result = { ok: false, message: String(error.message) } }
        }
        if (result.ok || job.action === "lookup") {
            if (result.ok && job.action !== "lookup") ++epoch
            // Invalidate aliases (unknown/known duration, changed player URL) on
            // a mutation. Other visible docks request their current track again.
            const next = job.action === "lookup" ? Object.assign({}, cache) : {}
            next[job.token] = result.ok ? result : { status: "error", message: result.message }
            const keys = Object.keys(next)
            if (keys.length > 32) delete next[keys[0]]
            cache = next
        }
        if (job.action !== "lookup" || !result.ok)
            lastAction = { token: job.token, ok: result.ok,
                message: result.ok ? (job.action === "remove" ? "Возвращена обычная лирика."
                    : "Импортировано слов: " + result.wordCount + (result.fallbackLineCount ? ". Построчных фрагментов: " + result.fallbackLineCount : "") + (result.reviewCount
                        ? ". Требуют проверки в экстракторе: " + result.reviewCount + "." : ".")) : result.message }
    }
    function showForTrack(track, theme, text) {
        dialog.track = track
        dialog.theme = theme || ({})
        dialog.fillingLyrics = true
        dialog.lyricsText = text || ""
        dialog.fillingLyrics = false
        dialog.audioFile = String(track.url || "").startsWith("file:") ? track.url : ""
        lastAction = ({})
        request(track, true)
        dialog.show(); dialog.raise(); dialog.requestActivate()
    }
    function startGeneration(track, audio, text, automatic, youtube, cleanupAudio, reference) {
        if (generationBusy || !engineReady || !track.title || !text.trim()) return false
        const key = token(track)
        const attemptKey = key + ":" + AnalysisPolicy.revision + ":" + AnalysisPolicy.signature(text)
        if (automatic && attempted[attemptKey]) return false
        const next = Object.assign({}, attempted); next[attemptKey] = true
        if (Object.keys(next).length > 128) delete next[Object.keys(next)[0]]
        attempted = next
        const refresh=Object.assign({},requestedRefresh);delete refresh[key];requestedRefresh=refresh
        generationJob = { token: key, track: track, audio: audio, lyrics: text, setup: false,
            threads: host.settings ? Number(host.settings.analysisThreads || 8) : 8,
            computeMode: host.settings && host.settings.analysisDevice === "cpu" ? "cpu" : "nvidia",
            multivoice: host.settings ? host.settings.multivoice !== false : true,
            reference: reference || null, sourceSignature: AnalysisPolicy.signature(text), revision: AnalysisPolicy.revision,
            youtube: youtube === true, cleanupAudio: cleanupAudio === true }
        launchGeneration("wordtime-engine.py")
        return true
    }
    function prepareEngine() {
        if (generationBusy) return false
        generationJob = { token: "", track: {}, setup: true }
        launchGeneration("setup-wordtime.py")
        return true
    }
    function prepareCuda() {
        if (generationBusy || !engineReady) return false
        generationJob={token:"",track:{},setup:true,setupCuda:true}
        launchGeneration("setup-cuda.py")
        return true
    }
    function prepareVoices() {
        if (generationBusy || !engineReady) return false
        generationJob = { token: "", track: {}, setup: true, setupVoices: true }
        launchGeneration("wordtime-engine.py")
        return true
    }
    function launchGeneration(script) {
        generationCompute = ({}); generationDetail = ({}); cancelling = false; generationResult = null; generationError = ""; generationTemporary = ""; generationProgress = 0; generationPhase = "preparing"
        generator.command = ["setpriv", "--pdeathsig", "TERM", "nice", "-n", "15", "python3", host.path(script)]
        generator.running = true
    }
    function cancelGeneration() {
        analysisRequests=({})
        if (pendingCapture) { discard(pendingCapture.audio); pendingCapture = null }
        if (!generationBusy || cancelling) return false
        cancelling = true
        generator.signal(15)
        forceStop.restart()
        return true
    }
    function finishGeneration() {
        forceStop.stop()
        const current = generationJob
        if (!current) return
        if (current.cleanupAudio) discard(current.audio)
        if (generationTemporary) { discard(generationTemporary); generationTemporary = "" }
        let result = generationResult || { ok: false, message: cancelling ? "Обработка отменена." : "Обработчик завершился без результата." }
        if (current.setup) {
            lastAction = { token: token(dialog.track), ok: result.ok,
                message: result.ok ? (current.setupCuda ? "CUDA готова: используется дискретная NVIDIA. CPU-среда сохранена." : current.setupVoices ? "Модели голосов готовы. Обработка запускается по нажатию." : "Обработчик готов. Можно рассчитать тайминги.") : result.message }
            attempted = ({})
            if (current.setupVoices) cache = ({})
            engineProbe.running = true
        } else {
            if (result.ok) {
                try { result.lines = ImportedLyrics.convert(result); result.voices = ImportedLyrics.voices(result, result.lines) }
                catch (_) { result = { ok: false, message: "Не удалось сопоставить слова с текстом." } }
            }
            if (result.ok) {
                ++epoch
                const next = {}; next[current.token] = result; cache = next
            }
            lastAction = { token: current.token, ok: result.ok,
                message: result.ok ? (((result.analysis || {}).voices === "failed" ? "Голоса: анализ не завершён. "
                    : (result.analysis || {}).voices === "uncertain" ? "Голоса: результат требует проверки. " : "") + "Рассчитано слов: ") + result.wordCount + (result.fallbackLineCount ? ". Построчных фрагментов: " + result.fallbackLineCount : "") + (result.reviewCount
                    ? ". Требуют проверки: " + result.reviewCount + "." : ".") : result.message }
        }
        generationJob = null; generationResult = null; cancelling = false
        Qt.callLater(pumpCapture)
    }
    function discard(audio) {
        // An argument list, never a shell command; the helper restricts deletion
        // to its own private capture files.
        cleanup.command = ["python3", host.path("spotify-capture.py"), "remove", audio]
        cleanup.startDetached()
    }
    function pumpCapture() {
        if (generationBusy || !engineReady) return
        for (const key of Object.keys(analysisRequests)) {
            const entry=analysisRequests[key], recorded=recordingFor(entry.track)
            const text=entry.text.trim() ? entry.text : recorded ? recorded.text : ""
            const url=String(entry.track.url || "")
            const youtube=/^https?:\/\/(?:www\.|m\.|music\.)?(?:youtube\.com|youtu\.be)\//i.test(url)
            const audio=recorded ? recorded.audio : url.startsWith("file:") ? url : ""
            if ((!audio && !youtube) || !text.trim()) continue
            if (startGeneration(entry.track,audio,text,false,youtube && !audio,false,entry.reference)) {
                const requests=Object.assign({},analysisRequests);delete requests[key];analysisRequests=requests
                return
            }
        }
    }
    function updatePlayback(info) {
        const state = info.state
        if (captureJob) {
            if (captureJob.owner !== info.owner) return
            if (lastCapturePosition > 1 && state.position <= .35) {
                const next = Object.assign({}, captureBlocked); delete next[state.key]; captureBlocked = next
            }
            lastCaptureKey = state.key; lastCapturePosition = state.position
            if (captureJob.key === state.key && info.text.trim() && !captureJob.manualText) { captureJob.text = info.text; captureJob.reference = info.reference || null }
            if (capture.running) capture.write(JSON.stringify(state) + "\n")
            return
        }
        const newStart = lastCaptureKey !== state.key || (lastCapturePosition > 1 && state.position <= .35)
        lastCaptureKey = state.key; lastCapturePosition = state.position
        if (newStart) { const next = Object.assign({}, captureBlocked); delete next[state.key]; captureBlocked = next }
        if (!info.spotify || !state.enabled) { capturePhase = ""; return }
        if (!state.playing || !info.track.title) return
        const result = resultFor(info.track)
        if (recordingFor(info.track)) return
        if (state.position > .35) { capturePhase = "awaiting_start"; return }
        if (captureBlocked[state.key] || pendingCapture || (generationJob && generationJob.token === token(info.track))) return
        const blocked = Object.assign({}, captureBlocked); blocked[state.key] = true; captureBlocked = blocked
        captureJob = { owner: info.owner, key: state.key, track: info.track, text: info.text, reference: info.reference || null, state: state }
        captureResult = null; captureProgress = 0; capturePhase = "capturing"
        capture.command = ["setpriv", "--pdeathsig", "TERM", "nice", "-n", "10", "python3", host.path("spotify-capture.py")]
        capture.running = true
    }
    property Process cleanup: Process { command: ["python3", root.host.path("spotify-capture.py"), "cleanup"] }
    property Process capture: Process {
        stdinEnabled: true
        onStarted: { if (root.captureJob) write(JSON.stringify(root.captureJob) + "\n") }
        stdout: SplitParser { onRead: data => {
            try {
                const event = JSON.parse(data)
                if (event.type === "result") root.captureResult = event
                else if (event.type === "recording" && root.captureJob)
                    root.captureJob = Object.assign({}, root.captureJob, { firstCapture: event.first === true })
                else if (event.type === "progress") { root.capturePhase = event.phase; root.captureProgress = event.fraction }
            } catch (_) {}
        } }
        onExited: {
            const job = root.captureJob, result = root.captureResult
            root.captureJob = null; root.capturePhase = ""
            if (job && result && result.ok) {
                const recordings=Object.assign({},root.recordings)
                recordings[root.token(job.track)]={track:job.track,audio:result.audio,text:job.text,reference:job.reference || null}
                root.recordings=recordings
                root.lastAction={token:root.token(job.track),ok:true,message:"Запись готова. Нажмите значок в доке для обработки."}
                root.pumpCapture()
            } else if (job) root.lastAction = { token: root.token(job.track), ok: false, message: result ? result.message : "Неполная запись Spotify отброшена." }
        }
    }
    property Process engineProbe: Process {
        command: ["python3", root.host.path("wordtime-engine.py"), "probe"]
        stdout: StdioCollector { onStreamFinished: {
            try { const probe = JSON.parse(text); root.engineReady = probe.ready === true; root.voicesReady = probe.voicesReady === true; Qt.callLater(root.pumpCapture) } catch (_) { root.engineReady = false }
        } }
    }
    Component.onCompleted: { cleanup.running = true; engineProbe.running = true }
    Component.onDestruction: {
        if (capture.running) capture.signal(15)
        if (generator.running) generator.signal(15)
        cleanup.command = ["python3", host.path("spotify-capture.py"), "cleanup"]
        cleanup.startDetached()
    }
    property Timer forceStop: Timer {
        interval: 5000
        onTriggered: {
            if (!root.generator.running || !root.cancelling) return
            root.groupKill.command = ["kill", "-KILL", "--", "-" + String(root.generator.processId)]
            root.groupKill.running = true
            root.generator.signal(9)
        }
    }
    property Process groupKill: Process {}
    property Process generator: Process {
        stdinEnabled: true
        stderr: SplitParser { onRead: data => root.generationError = data.slice(-1500) }
        onStarted: {
            if (root.generationJob && (!root.generationJob.setup || root.generationJob.setupVoices))
                write(JSON.stringify(root.generationJob) + "\n")
        }
        stdout: SplitParser { onRead: data => {
            try {
                const event = JSON.parse(data)
                if (event.type === "progress") {
                    if(root.generationPhase !== event.phase)root.generationDetail=({})
                    root.generationPhase = event.phase
                    root.generationProgress = Math.max(root.generationProgress, event.fraction)
                } else if (event.type === "compute") root.generationCompute = event.compute || ({})
                else if (event.type === "detail") root.generationDetail = event.detail || ({})
                else if (event.type === "result") root.generationResult = event
                else if (event.type === "temporary") root.generationTemporary = event.audio
            } catch (_) {}
        } }
        onExited: root.finishGeneration()
    }
    property WordtimeDialog dialog: WordtimeDialog { store: root }
    property Process worker: Process {
        stdout: StdioCollector {
            onStreamFinished: {
                try { root.complete(JSON.parse(text)) }
                catch (_) { root.complete({ ok: false, message: "Не удалось прочитать результат импорта." }) }
            }
        }
        onExited: {
            if (!root.received) root.complete({ ok: false, message: "Не удалось запустить обработчик JSON." })
            const stale = root.job && root.job.action === "lookup" && root.job.epoch !== root.epoch ? root.job.track : null
            root.job = null
            if (stale) root.request(stale, true)
            Qt.callLater(root.pump)
        }
    }
}
