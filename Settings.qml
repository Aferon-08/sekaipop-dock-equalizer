import QtQuick
SettingsPanel {
 required property var host
 extensionHost:host
 pst:host.state
 theme:host.theme
 phone:host.phone
 phoneRect:host.phoneRect
 screenName:host.screenName
 backgroundRect:host.backgroundRect
 opened:host.opened
}
