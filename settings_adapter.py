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
('            SettingsStage {','''            // BEGIN dock-equalizer liquid settings
            Loader {
                id: liquidPluginSettings
                anchors.fill: parent
                z: 500
                readonly property var st: PluginService.stateFor("dock-equalizer")
                active: !!st && st.loaded && root.settingsShown
                readonly property bool showing: !!item && item.showing
                function loadPanel(){if(active)setSource("file://"+st.dir+"/SettingsPanel.qml",{pst:st,theme:sstage.mt,phone:sstage})}
                onActiveChanged: {if(active)loadPanel();else if(st && st.service)st.service.settingsPanelOpen=false}
                Component.onCompleted:loadPanel()
            }
            // END dock-equalizer liquid settings
            SettingsStage {'''),
('x: win.setMidX - sstage.phone.screenCenterX * win.sFit','x: liquidPluginSettings.showing ? 0 : win.setMidX - sstage.phone.screenCenterX * win.sFit'),
('y: win.setMidY - sstage.phone.screenCenterY * win.sFit','y: liquidPluginSettings.showing ? 0 : win.setMidY - sstage.phone.screenCenterY * win.sFit'),
('width: root.settingsOpen ? sstage.phone.implicitWidth * win.sFit : 0','width: liquidPluginSettings.showing ? stage.width : (root.settingsOpen ? sstage.phone.implicitWidth * win.sFit : 0)'),
('height: root.settingsOpen ? sstage.phone.implicitHeight * win.sFit : 0','height: liquidPluginSettings.showing ? stage.height : (root.settingsOpen ? sstage.phone.implicitHeight * win.sFit : 0)')]
}
def transform(text,name,uninstall=False):
 # Blocks can evolve across versions: strip tagged blocks independently of their contents.
 text=re.sub(r"            // BEGIN dock-equalizer (?:liquid settings|settings button)\n.*?            // END dock-equalizer (?:liquid settings|settings button)\n", "", text, flags=re.S)
 for old,new in reversed(EDITS[name]):text=text.replace(new,old)
 if uninstall:return text
 for old,new in EDITS[name]:
  if text.count(old)!=1:raise RuntimeError('Settings phone structure changed: '+name+' / '+old[:65])
  text=text.replace(old,new,1)
 return text
