"""Reversible, validated integration with the existing wallpaper stage."""
from pathlib import Path
PROPERTY='    // BEGIN dock-equalizer wallpaper properties v1\n'
LOADER='        // BEGIN dock-equalizer wallpaper loader v1\n'
EDITS=[
 ('readonly property bool wallpaperEnabled:SettingsService.flag("wallpaper.enabled")', 'readonly property bool wallpaperEnabled:SettingsService.flag("wallpaper.enabled") && !win.proceduralDesired && !win.proceduralPending'),
 ('    color: "transparent" // shown before the first image finishes decoding','    color: (win.proceduralPending || win.proceduralDesired) ? "black" : "transparent" // shown before the first image finishes decoding'),
 ('        visible: win.wallpaperEnabled\n','        visible: win.wallpaperEnabled || win.proceduralDesired || win.proceduralPending\n'),
 ('            id: pic\n','            id: pic\n            visible: win.wallpaperEnabled\n')]
def clean(text):
    for start,end in [(PROPERTY,'    // END dock-equalizer wallpaper properties v1\n'),(LOADER,'        // END dock-equalizer wallpaper loader v1\n')]:
        if start not in text and end not in text:continue
        if text.count(start)!=1 or text.count(end)!=1:raise RuntimeError('Неоднозначный адаптер обоев')
        a=text.index(start);b=text.index(end,a)+len(end);text=text[:a]+text[b:]
    for old,new in EDITS:text=text.replace(new,old)
    return text

def patch(text,source):
    text=clean(text)
    for old,new in EDITS:
        if text.count(old)!=1:raise RuntimeError('Структура WallpaperLayer изменилась: '+old)
        text=text.replace(old,new,1)
    anchor='readonly property bool wallpaperEnabled:'
    text=text.replace(anchor,(Path(source)/'wallpaper-properties.qml').read_text()+anchor,1)
    anchor='        } // pic\n'
    if text.count(anchor)!=1:raise RuntimeError('Не найден stage обоев')
    return text.replace(anchor,anchor+(Path(source)/'wallpaper-adapter.qml').read_text(),1)
