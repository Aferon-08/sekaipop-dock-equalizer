from pathlib import Path
BEGIN="    // BEGIN dock-equalizer widget registry v1\n"
END="    // END dock-equalizer widget registry v1\n"
OLD="    function report() {\n"
NEW=OLD+"        root.reportWallpaperRect(false)\n"
def clean(text):
    text=text.replace(NEW,OLD)
    if BEGIN not in text and END not in text:return text
    if text.count(BEGIN)!=1 or text.count(END)!=1:raise RuntimeError("Неоднозначный адаптер виджетов")
    a=text.index(BEGIN);b=text.index(END,a)+len(END)
    return text[:a]+text[b:]
def patch(text,source):
    text=clean(text);anchor="Item {\n    id: root\n"
    if text.count(anchor)!=1 or text.count(OLD)!=1:raise RuntimeError("EditChrome изменился: файлы не изменены")
    return text.replace(anchor,anchor+(Path(source)/"widget-registry-adapter.qml").read_text(),1).replace(OLD,NEW,1)
