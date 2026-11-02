"""Reversible integration for the settings phone; validate every anchor before writing."""
from pathlib import Path
import re
EDITS={
'settings/PluginEditor.qml':[
('    property var pst: null','    readonly property bool liquidSettings: !!pst && pst.pluginId === "dock-equalizer"\n    property var pst: null'),
('            // ----- settings -----','''            // BEGIN dock-equalizer settings button
            SettingChip {
                visible: root.liquidSettings
                label: "Открыть настройки Dock Equalizer"
                icon: "tune"
                onClicked: { if(root.pst.service)root.pst.service.settingsPanelOpen=true }
            }
            // END dock-equalizer settings button
            // ----- settings -----'''),
('visible: root.plugin !== null && Object.keys(root.plugin.settings).length > 0','visible: !root.liquidSettings && root.plugin !== null && Object.keys(root.plugin.settings).length > 0'),
('model: root.groups','model: root.liquidSettings ? [] : root.groups')],
 'quickPanel/QuickPanel.qml':[
('            SettingsStage {', '            // BEGIN dock-equalizer phone capture\n            Item {\n                id: settingsPhoneCapture\n                anchors.fill: parent\n                readonly property bool captureReady: sstage.settled && !sstage.moving\n            SettingsStage {'),
('            }\n        }\n    }\n}', '            }\n            } // END dock-equalizer phone capture\n        }\n    }\n}'),
('            // BEGIN dock-equalizer phone capture','''            // BEGIN dock-equalizer liquid settings
            Loader {
                id: liquidPluginSettings
                anchors.fill: parent
                z: 500
                readonly property var st: PluginService.stateFor("dock-equalizer")
                active: !!st && st.loaded && root.settingsShown
                readonly property bool showing: !!item && item.showing
                function loadPanel(){if(active)setSource("file://"+st.dir+"/SettingsPanel.qml",{pst:st,theme:sstage.mt,phone:settingsPhoneCapture,screenName:root.targetScreen ? root.targetScreen.name : "",
                    phoneRect:Qt.rect(win.setMidX-sstage.halfW*win.sFit,win.setMidY-sstage.halfH*win.sFit,2*sstage.halfW*win.sFit,2*sstage.halfH*win.sFit),
                    backgroundRect:Qt.rect((win.monitorW-win.implicitWidth)/2,win.monitorH+Math.ceil(win.bleed)-win.implicitHeight,win.monitorW,win.monitorH)})}
                onActiveChanged: {if(active)loadPanel();else if(st && st.service)st.service.settingsPanelOpen=false}
                Component.onCompleted:loadPanel()
            }
            // END dock-equalizer liquid settings
            // BEGIN dock-equalizer phone capture'''),
('x: win.setMidX - sstage.phone.screenCenterX * win.sFit','x: liquidPluginSettings.showing ? 0 : win.setMidX - sstage.phone.screenCenterX * win.sFit'),
('y: win.setMidY - sstage.phone.screenCenterY * win.sFit','y: liquidPluginSettings.showing ? 0 : win.setMidY - sstage.phone.screenCenterY * win.sFit'),
('width: root.settingsOpen ? sstage.phone.implicitWidth * win.sFit : 0','width: liquidPluginSettings.showing ? stage.width : (root.settingsOpen ? sstage.phone.implicitWidth * win.sFit : 0)'),
('height: root.settingsOpen ? sstage.phone.implicitHeight * win.sFit : 0','height: liquidPluginSettings.showing ? stage.height : (root.settingsOpen ? sstage.phone.implicitHeight * win.sFit : 0)')]
}
def transform(text,name,uninstall=False):
 # Blocks can evolve across versions: strip tagged blocks independently of their contents.
 text=re.sub(r"            // BEGIN dock-equalizer (?:liquid settings|settings button)\n.*?            // END dock-equalizer (?:liquid settings|settings button)\n", "", text, flags=re.S)
 text=re.sub(r"            // BEGIN dock-equalizer phone capture\n            Item \{\n                id: settingsPhoneCapture\n                anchors.fill: parent\n(?:                readonly property bool captureReady:.*\n)?", "", text)
 text=text.replace("            } // END dock-equalizer phone capture\n", "")
 for old,new in reversed(EDITS[name]):text=text.replace(new,old)
 if uninstall:return text
 for old,new in EDITS[name]:
  if text.count(old)!=1:raise RuntimeError('Settings phone structure changed: '+name+' / '+old[:65])
  text=text.replace(old,new,1)
 return text
