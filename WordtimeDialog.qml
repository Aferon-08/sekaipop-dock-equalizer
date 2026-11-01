pragma ComponentBehavior: Bound
import QtQuick
import QtQuick.Window
import QtQuick.Dialogs
import QtQuick.Controls as Controls

Window {
    id: root
    required property var store
    property var theme: ({})
    property var track: ({})
    property string audioFile: ""
    property alias lyricsText: editor.text
    property bool fillingLyrics: false
    readonly property var result: store.resultFor(track)
    readonly property bool imported: !!result && (result.status === "ready" || result.status === "partial")
    readonly property bool occupied: store.busy || store.generationBusy
    readonly property string notice: store.lastAction.token === store.token(track) ? store.lastAction.message || "" : ""
    readonly property var phases: ({ preparing: "Подготовка", dependencies: "Установка компонентов",
        model: "Загрузка модели", loading_model: "Подготовка модели", detecting_language: "Определение языка",
        aligning: "Разметка слов", refining: "Уточнение границ", repairing: "Проверка сложных строк",
        saving: "Сохранение", done: "Проверка результата", downloading: "Получение аудио YouTube",
        cuda_setup: "Подготовка NVIDIA CUDA", cuda_dependencies: "Установка CUDA-компонентов", cuda_verifying: "Проверка дискретной NVIDIA",
        voices: "Анализ вокальных партий", voice_models: "Подготовка моделей голосов",
        voice_identifying: "Распределение партий по голосам", voice_done: "Проверка голосов",
        voice_stems: "Выделение вокала", voice_seeds: "Сравнение голосов",
        voice_loading: "Загрузка моделей голосов", voice_extracting_vocals: "Выделение вокала",
        voice_stabilizing: "Уточнение устойчивых голосов", voice_parallel_phrases: "Разделение параллельных фраз", voice_transcribing: "Распознавание независимых партий", voice_exemplars: "Сравнение образцов голосов", voice_recovering_words: "Восстановление сложных строк" })
    width: 520; height: Math.min(740, content.implicitHeight + 48)
    minimumWidth: 440; maximumWidth: 720; minimumHeight: 400
    title: "Тайминги слов · Dock Equalizer"
    color: theme.surface || theme.capBody || "#18201d"
    readonly property color ink: theme.ink || theme.pInk || "#e8f4ee"
    readonly property color accent: theme.capLit || theme.accentCyan || "#96dcc0"
    readonly property string fontFamily: theme.fontFamily || "sans-serif"
    Rectangle { anchors.fill: parent; color: root.color; z: -1 }
    Shortcut { sequences: [StandardKey.Cancel]; enabled: root.visible; onActivated: root.close() }
    FileDialog {
        id: picker
        objectName: "wordtimeFilePicker"
        property var targetTrack: ({})
        parentWindow: root
        title: "JSON · " + (targetTrack.title || "Lyrics Wordtime Extractor")
        nameFilters: ["Тайминги слов (*.json)"]
        onAccepted: root.store.enqueue("import", targetTrack, String(selectedFile))
    }
    FileDialog {
        id: audioPicker
        objectName: "wordtimeAudioPicker"
        property string targetToken: ""
        parentWindow: root
        title: "Аудиофайл этой записи песни"
        nameFilters: ["Аудиофайлы (*.mp3 *.flac *.ogg *.opus *.wav *.m4a *.aac *.aiff *.wma)", "Все файлы (*)"]
        onAccepted: { if (targetToken === root.store.token(root.track)) root.audioFile = String(selectedFile) }
    }
    Flickable {
        anchors.fill: parent; anchors.margins: 24
        contentWidth: width; contentHeight: content.implicitHeight
        clip: true; boundsBehavior: Flickable.StopAtBounds
        Column {
            id: content
            width: parent.width; spacing: 14
            Text {
                width: parent.width; text: "Тайминги слов"; color: root.ink
                font.family: root.fontFamily; font.pixelSize: 22; font.bold: true
            }
            Text {
                width: parent.width; text: [root.track.title || "", root.track.artist || ""].filter(Boolean).join("\n")
                textFormat: Text.PlainText; wrapMode: Text.Wrap; color: root.ink
                font.family: root.fontFamily; font.pixelSize: 15
            }
            Text {
                width: parent.width; text: "Рассчитайте время слов по аудиофайлу и тексту песни или импортируйте готовый JSON. Нужна та же запись песни, что выбрана в плеере."
                wrapMode: Text.Wrap; color: root.ink; opacity: .7
                font.family: root.fontFamily; font.pixelSize: 13
            }
            Text {
                width: parent.width; text: root.audioFile ? "Аудио: " + decodeURIComponent(root.audioFile.split("/").pop()) : "Spotify: запись сохраняется при полном прослушивании. YouTube: аудио будет получено при запуске обработки. Для остальных источников выберите аудиофайл."
                textFormat: Text.PlainText; wrapMode: Text.Wrap; color: root.ink
                font.family: root.fontFamily; font.pixelSize: 13
            }
            Controls.ScrollView {
                width: parent.width; height: 126
                Controls.TextArea {
                    id: editor
                    objectName: "wordtimeLyricsEditor"
                    placeholderText: "Текст песни или LRC. Найденная лирика подставляется автоматически."
                    wrapMode: TextEdit.Wrap; selectByMouse: true
                    onTextChanged: {
                        if (!root.fillingLyrics && text.trim() && root.store.captureJob
                            && root.store.token(root.store.captureJob.track) === root.store.token(root.track)) {
                            root.store.captureJob.text = text
                            root.store.captureJob.manualText = true
                        }
                    }
                    color: root.ink; placeholderTextColor: Qt.rgba(root.ink.r, root.ink.g, root.ink.b, .5)
                    font.family: root.fontFamily; font.pixelSize: 13
                    background: Rectangle { radius: 12; color: Qt.rgba(root.ink.r, root.ink.g, root.ink.b, .06) }
                }
            }
            Text {
                width: parent.width; wrapMode: Text.Wrap; textFormat: Text.PlainText
                text: root.store.generationBusy ? (root.store.cancelling ? "Отменяем обработку…"
                    : (root.store.generationJob.setup ? "Подготовка обработчика" : "Обрабатывается: " + root.store.generationJob.track.title)
                        + "\n" + (root.phases[root.store.generationPhase] || "Обработка") + " · " + Math.round(root.store.generationProgress * 100) + "%")
                    : root.store.captureBusy ? (root.store.capturePhase === "capture_paused" ? "Spotify на паузе · запись звука остановлена"
                        : "Записываем только звук Spotify · " + Math.round(root.store.captureProgress * 100) + "%")
                    : root.store.busy ? "Проверяем файл…" : root.notice || (root.imported
                        ? "Импортировано слов: " + root.result.wordCount + (root.result.fallbackLineCount ? ". Строк с исходными построчными метками: " + root.result.fallbackLineCount : "") + (root.result.reviewCount ? ". Требуют проверки: " + root.result.reviewCount + "." : ".")
                        : root.result && root.result.status === "error" ? root.result.message
                        : root.store.capturePhase === "awaiting_start" ? "Spotify: ждём следующего воспроизведения с начала."
                        : "Используется обычная лирика. Запись Spotify сохраняется после полного прослушивания. Обработка запускается только по нажатию.")
                color: root.ink; font.family: root.fontFamily; font.pixelSize: 13
            }
            Text {
                width: parent.width; wrapMode: Text.Wrap
                visible: root.store.generationBusy && !!root.store.generationCompute.device
                text: (root.store.generationCompute.device === "cuda:0" ? root.store.generationCompute.name + " · CUDA" : "CPU")
                    + " · " + (root.store.generationCompute.threads || 0) + " потоков CPU"
                    + (root.store.generationCompute.fallbackReason ? "\n"+root.store.generationCompute.fallbackReason : "")
                    + (Object.keys(root.store.generationCompute.stageFallbacks || {}).length ? "\nЧасть этапов выполняется на CPU." : "")
                color: root.ink; opacity: .7; font.family: root.fontFamily; font.pixelSize: 12
            }
            Text {
                width: parent.width; wrapMode: Text.Wrap
                visible: root.store.generationBusy && root.store.generationDetail.audioSeconds > 0
                text: visible ? "Фрагмент " + root.store.generationDetail.windowDone + "/" + root.store.generationDetail.windowTotal
                    + " · аудио " + Math.round(root.store.generationDetail.processedSeconds) + "/" + Math.round(root.store.generationDetail.audioSeconds) + " с" : ""
                color: root.ink; opacity: .7; font.family: root.fontFamily; font.pixelSize: 12
            }
            Rectangle {
                width: parent.width; height: 4; radius: 2
                visible: root.store.generationBusy
                color: Qt.rgba(root.ink.r, root.ink.g, root.ink.b, .1)
                Rectangle {
                    width: parent.width * root.store.generationProgress; height: parent.height; radius: 2; color: root.accent
                    Behavior on width { NumberAnimation { duration: 160 } }
                }
            }
            Text {
                width: parent.width; wrapMode: Text.Wrap; textFormat: Text.PlainText
                visible: root.imported && !!root.result.analysis
                text: visible ? "Партии: " + (root.result.voices || []).map(v => v.label).join(" · ")
                    + "\nАвтоматическое определение голосов экспериментальное. Безымянные партии обозначены номерами; имена из текста сохраняются."
                    + ((root.result.multivoice || {}).message ? "\n"+root.result.multivoice.message : "") : ""
                color: root.ink; opacity: .7; font.family: root.fontFamily; font.pixelSize: 12
            }
            Repeater {
                model: [
                    { action: "generate", label: "Рассчитать тайминги" },
                    { action: "reanalyze", label: "Перегенерировать" },
                    { action: "audio", label: "Выбрать аудиофайл…" },
                    { action: "setup", label: "Подготовить обработчик" },
                    { action: "voices", label: "Подготовить модели голосов" },
                    { action: "cuda", label: "Подготовить NVIDIA CUDA" },
                    { action: "cancel", label: "Отменить обработку" },
                    { action: "import", label: "Выбрать JSON…" },
                    { action: "remove", label: "Вернуть обычную лирику" }
                ]
                delegate: Rectangle {
                    id: button
                    required property var modelData
                    objectName: "wordtimeAction-" + modelData.action
                    width: content.width; height: 40; radius: 12
                    visible: modelData.action === "setup" ? !root.store.generationBusy
                        : modelData.action === "cancel" ? root.store.generationBusy || Object.keys(root.store.analysisRequests).length > 0
                        : modelData.action === "remove" ? root.imported : true
                    enabled: modelData.action === "cancel" ? !root.store.cancelling : !root.occupied
                        && ((modelData.action !== "voices" && modelData.action !== "cuda") || root.store.engineReady)
                        && (modelData.action !== "generate" || (root.store.engineReady && !!root.audioFile && !!root.lyricsText.trim()))
                    opacity: enabled ? 1 : .4
                    color: Qt.rgba(root.accent.r, root.accent.g, root.accent.b, area.containsMouse ? .24 : .13)
                    Text {
                        anchors.centerIn: parent
                        text: button.modelData.action === "setup" && root.store.engineReady ? "Обновить обработчик" : button.modelData.label
                        color: root.ink
                        font.family: root.fontFamily; font.pixelSize: 14
                    }
                    MouseArea {
                        id: area
                        anchors.fill: parent; hoverEnabled: true; cursorShape: Qt.PointingHandCursor
                        onClicked: {
                            switch (button.modelData.action) {
                            case "reanalyze": if(root.audioFile) root.store.startGeneration(root.track,root.audioFile,root.lyricsText,false); else root.store.reanalyze(root.track,root.lyricsText); break
                            case "generate": root.store.startGeneration(root.track, root.audioFile, root.lyricsText, false); break
                            case "audio": audioPicker.targetToken = root.store.token(root.track); audioPicker.open(); break
                            case "setup": root.store.prepareEngine(); break
                            case "voices": root.store.prepareVoices(); break
                            case "cuda": root.store.prepareCuda(); break
                            case "cancel": root.store.cancelGeneration(); break
                            case "import": picker.targetTrack = root.track; picker.open(); break
                            case "remove": root.store.enqueue("remove", root.track, ""); break
                            }
                        }
                    }
                }
            }
            Text {
                width: parent.width; wrapMode: Text.Wrap
                text: "Обработка идёт локально в фоне. Закрытие этого окна её не прерывает. Результат сохраняется для выбранной записи."
                color: root.ink; opacity: .6; font.family: root.fontFamily; font.pixelSize: 12
            }
        }
    }
}
