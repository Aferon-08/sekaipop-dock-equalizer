import QtQuick

// Optional desktop information card; native dock works without placing it.
Item {
    id: root
    required property var host
    implicitWidth: 300
    implicitHeight: info.implicitHeight + 32
    Text {
        id: info
        x: 16
        y: 16
        width: parent.width - 32
        wrapMode: Text.WordWrap
        text: "Dock Equalizer — native extensions\n\nКапсулы появляются по краям дока при воспроизведении музыки. Настройки: Рабочий стол → Плагины → Dock Equalizer."
            + (root.host.service && root.host.service.error ? "\n\n" + root.host.service.error : "")
        color: root.host.theme.pInk
        font.family: root.host.theme.fontFamily
        font.pixelSize: 14
    }
}
