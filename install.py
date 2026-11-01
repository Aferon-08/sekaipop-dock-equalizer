#!/usr/bin/env python3
"""Install the plugin and a reversible adapter in SekaiPop's dock."""
import argparse
import datetime
import json
import importlib.util
import secrets
import os
from pathlib import Path
import shutil
import subprocess
import tempfile
import time

BEGIN = "            // BEGIN dock-equalizer adapter v1\n"
END = "            // END dock-equalizer adapter v1\n\n"
ANCHOR = "            Pill {\n                id: dockPill\n"
BARE_ORIGINAL = '                bare: dockWindow.look === "transparent"'
BARE_PATCHED = BARE_ORIGINAL + ' || (!!dockEqualizerAdapter.item && dockEqualizerAdapter.item.ownsHousing)'

LEGACY_SHELL_EDITS = [('                                           : dockWindow.rowLen + dockWindow.magData.total + dockWindow.pillPaddingH * 2', '                                           : dockWindow.rowLen + dockWindow.magData.total + dockWindow.pillPaddingH * 2 + (dockEqualizerAdapter.item ? dockEqualizerAdapter.item.lyricsWidthExtra : 0)'), ('                                            : dockWindow.iconSize + dockWindow.pillPaddingV * 2 + shadowDy', '                                            : dockWindow.iconSize + dockWindow.pillPaddingV * 2 + shadowDy + (dockEqualizerAdapter.item ? dockEqualizerAdapter.item.lyricsHeightExtra : 0)'), ('                                          + (dockWindow.vertical ? 0 : mt.shadowOffset)', '                                          + (dockWindow.vertical ? 0 : mt.shadowOffset) + (dockEqualizerAdapter.item ? dockEqualizerAdapter.item.lyricsHeightExtra : 0)'), ('                    id: dockRow\n                    anchors.centerIn: parent', '                    id: dockRow\n                    anchors.centerIn: parent\n                    anchors.verticalCenterOffset: (dockEqualizerAdapter.item ? dockEqualizerAdapter.item.lyricsHeaderHeight : 0) / 2\n                    opacity: dockEqualizerAdapter.item ? dockEqualizerAdapter.item.iconsOpacity : 1'), ('                id: hit\n                x: dockWindow.hitX\n                y: dockWindow.hitY\n                width: dockWindow.hitW\n                height: dockWindow.hitH', '                id: hit\n                x: dockWindow.hitX\n                y: dockWindow.hitY + (dockEqualizerAdapter.item ? dockEqualizerAdapter.item.lyricsHeaderHeight : 0)\n                width: dockWindow.hitW\n                height: Math.max(1, dockWindow.hitH - (dockEqualizerAdapter.item ? dockEqualizerAdapter.item.lyricsHeaderHeight : 0))')]

SHELL_EDITS = [('                                           : dockWindow.rowLen + dockWindow.magData.total + dockWindow.pillPaddingH * 2', '                                           : dockWindow.rowLen + dockWindow.magData.total + dockWindow.pillPaddingH * 2 + (dockEqualizerAdapter.item ? dockEqualizerAdapter.item.lyricsWidthExtra : 0)'), ('                                            : dockWindow.iconSize + dockWindow.pillPaddingV * 2 + shadowDy', '                                            : dockWindow.iconSize + dockWindow.pillPaddingV * 2 + shadowDy + (dockEqualizerAdapter.item ? dockEqualizerAdapter.item.lyricsHeightExtra : 0)'), ('                                          + (dockWindow.vertical ? 0 : mt.shadowOffset)', '                                          + (dockWindow.vertical ? 0 : mt.shadowOffset) + (dockEqualizerAdapter.item ? dockEqualizerAdapter.item.lyricsHeightExtra : 0)'), ('                    id: dockRow\n                    anchors.centerIn: parent', '                    id: dockRow\n                    anchors.centerIn: parent\n                    anchors.verticalCenterOffset: (dockEqualizerAdapter.item ? dockEqualizerAdapter.item.iconsOffset : 0) / 2\n                    opacity: dockEqualizerAdapter.item ? dockEqualizerAdapter.item.iconsOpacity : 1\n                    scale: dockEqualizerAdapter.item ? dockEqualizerAdapter.item.iconsScale : 1'), ('                id: hit\n                x: dockWindow.hitX\n                y: dockWindow.hitY\n                width: dockWindow.hitW\n                height: dockWindow.hitH', '                id: hit\n                x: dockWindow.hitX\n                y: dockWindow.hitY + (dockEqualizerAdapter.item ? dockEqualizerAdapter.item.lyricsHeaderHeight : 0)\n                width: dockWindow.hitW\n                height: Math.max(1, dockWindow.hitH - (dockEqualizerAdapter.item ? dockEqualizerAdapter.item.lyricsHeaderHeight : 0))'), ('        if (dockWindow.mediaShown) {', '        if (dockWindow.mediaShown && !(dockEqualizerAdapter.item && dockEqualizerAdapter.item.suppressMediaKey)) {')]


def without_adapter(text):
    text = text.replace(BARE_PATCHED, BARE_ORIGINAL)
    for original, patched in SHELL_EDITS + LEGACY_SHELL_EDITS:
        text = text.replace(patched, original)
    if BEGIN not in text and END not in text:
        return text
    if text.count(BEGIN) != 1 or text.count(END) != 1:
        raise RuntimeError("Неоднозначный адаптер дока. Файл не изменён.")
    start = text.index(BEGIN)
    end = text.index(END, start) + len(END)
    return text[:start] + text[end:]


def atomic_write(path, text):
    mode = path.stat().st_mode & 0o777
    fd, name = tempfile.mkstemp(prefix=".dock-equalizer-", suffix=".tmp", dir=path.parent)
    try:
        with os.fdopen(fd, "w", encoding="utf-8") as handle:
            handle.write(text)
            handle.flush()
            os.fsync(handle.fileno())
        os.chmod(name, mode)
        os.replace(name, path)
    finally:
        if os.path.exists(name):
            os.unlink(name)


def shell_running(shell):
    result = subprocess.run(["qs", "list", "-p", str(shell)], capture_output=True, text=True)
    return "Process ID:" in result.stdout


def stop_shell(shell):
    subprocess.run(["qs", "kill", "-p", str(shell)], capture_output=True, check=False)
    for _ in range(50):
        if not shell_running(shell):
            return
        time.sleep(0.1)
    raise RuntimeError("SekaiPop не завершился: файлы дока не изменены.")


def start_shell(shell):
    subprocess.run(["qs", "-p", str(shell), "-n", "-d"], capture_output=True, check=True)


def wait_plugin(shell, uninstall):
    for _ in range(60):
        result = subprocess.run(["qs", "-p", str(shell), "ipc", "call", "plugins", "list"],
                                capture_output=True, text=True)
        found = any(line.startswith("dock-equalizer  ") and "skipped:" not in line
                    for line in result.stdout.splitlines())
        if result.returncode == 0 and (not found if uninstall else found):
            return
        time.sleep(0.15)
    raise RuntimeError("Не удалось подтвердить загрузку плагина.")


def wallpaper_text(text, source, uninstall=False):
    spec = importlib.util.spec_from_file_location("wallpaper_adapter", source / "wallpaper_adapter.py")
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module.clean(text) if uninstall else module.patch(text, source)


def widget_registry_text(text, source, uninstall=False):
    spec = importlib.util.spec_from_file_location("widget_registry_adapter", source / "widget_registry_adapter.py")
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module.clean(text) if uninstall else module.patch(text, source)


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    config = Path(os.environ.get("XDG_CONFIG_HOME", Path.home() / ".config"))
    state = Path(os.environ.get("XDG_STATE_HOME", Path.home() / ".local/state"))
    parser.add_argument("--shell-dir", type=Path, default=config / "quickshell/sekaipop")
    parser.add_argument("--uninstall", action="store_true")
    parser.add_argument("--no-restart", action="store_true")
    parser.add_argument("--repair", action="store_true",
                        help="Восстановить подключения после обновления оболочки, сохранив записи, разметки и композицию обоев")
    args = parser.parse_args()
    source = Path(__file__).resolve().parent
    shell = args.shell_dir.expanduser().resolve()
    was_running = shell_running(shell)
    if args.repair and args.uninstall:
        parser.error("--repair нельзя использовать вместе с --uninstall")
    if was_running and args.no_restart and not args.uninstall:
        raise RuntimeError("Для сброса разметок нужно остановить обработчики. Повторите установку без --no-restart.")
    dock = shell / "modules/sekai/dock/Dock.qml"
    original = dock.read_text(encoding="utf-8")
    clean = without_adapter(original)
    if clean.count(ANCHOR) != 1:
        raise RuntimeError("Версия дока не распознана. Файлы не изменены.")
    if clean.count(BARE_ORIGINAL) != 1:
        raise RuntimeError("Оформление дока не распознано. Файлы не изменены.")
    for old, new in SHELL_EDITS:
        if clean.count(old) != 1:
            raise RuntimeError("Структура дока изменилась. Файлы не изменены.")
    for name in ("qs", "cava", "setpriv", "nice", "python3"):
        if shutil.which(name) is None:
            raise RuntimeError("Не найдена команда: " + name)
    if not (shell / "services/PluginService.qml").is_file():
        raise RuntimeError("Эта версия SekaiPop не поддерживает плагины.")
    destination = Path(os.environ.get("SEKAIPOP_PLUGINS_DIR", str(config / "sekaipop/plugins"))) / "dock-equalizer"
    if destination.exists() and destination.resolve() == source and args.uninstall:
        raise RuntimeError("Запустите удаление из копии архива, а не из удаляемой папки.")
    if args.uninstall and BEGIN not in original:
        raise RuntimeError("Адаптер не установлен. Файлы не изменены.")
    adapter = (source / "dock-adapter.qml").read_text(encoding="utf-8")
    updated = clean if args.uninstall else clean.replace(ANCHOR, adapter + ANCHOR, 1)
    if not args.uninstall:
        updated = updated.replace(BARE_ORIGINAL, BARE_PATCHED, 1)
        for old, new in SHELL_EDITS:
            updated = updated.replace(old, new, 1)
    wallpaper = shell / "modules/sekai/background/WallpaperLayer.qml"
    original_wallpaper = wallpaper.read_text(encoding="utf-8")
    updated_wallpaper = wallpaper_text(original_wallpaper, source, args.uninstall)
    chrome = shell / "modules/sekai/editMode/EditChrome.qml"
    original_chrome = chrome.read_text(encoding="utf-8")
    updated_chrome = widget_registry_text(original_chrome, source, args.uninstall)
    stamp = datetime.datetime.now().strftime("%Y%m%d-%H%M%S-%f")
    backup = state / "sekaipop/dock-equalizer-backups" / stamp
    backup.mkdir(parents=True)
    shutil.copy2(dock, backup / "Dock.qml")
    shutil.copy2(wallpaper, backup / "WallpaperLayer.qml")
    shutil.copy2(chrome, backup / "EditChrome.qml")
    if destination.exists():
        shutil.copytree(destination, backup / "plugin", symlinks=True)

    if was_running and args.repair:
        result = subprocess.run(["qs", "-p", str(shell), "ipc", "call", "dockequalizer", "status"],
                                capture_output=True, text=True)
        try:
            status = json.loads(result.stdout)
        except ValueError:
            status = None
        if status and any(status.get(k) for k in ("wordtimeBusy", "wordtimeGenerating", "wordtimeCapturing")):
            raise RuntimeError("Сейчас идёт запись или анализ лирики. Дождитесь завершения перед восстановлением.")
    if was_running and not args.no_restart:
        stop_shell(shell)
    mutated_plugin = False
    data_root = Path(os.environ.get("XDG_DATA_HOME", Path.home() / ".local/share")) / "sekaipop/dock-equalizer"
    reset_stage = None
    try:
        if args.uninstall:
            shutil.rmtree(destination)
            mutated_plugin = True
        elif destination.resolve() != source:
            destination.parent.mkdir(parents=True, exist_ok=True)
            if destination.exists():
                shutil.rmtree(destination)
            shutil.copytree(source, destination, ignore=shutil.ignore_patterns("__pycache__", "*.pyc", ".git", ".github", "docs", "tests", "tools", "dist"))
            mutated_plugin = True
        atomic_write(dock, updated)
        atomic_write(wallpaper, updated_wallpaper)
        atomic_write(chrome, updated_chrome)
        if not args.uninstall and not args.repair:
            data_root.mkdir(parents=True, exist_ok=True)
            reset_stage = Path(tempfile.mkdtemp(prefix=".reset-", dir=data_root))
            for name in ("wordtimes", "recording-seen", "audio-tmp", "recordings", "wallpaper-install-id"):
                path = data_root / name
                if path.exists() or path.is_symlink():
                    path.rename(reset_stage / name)
            (data_root / "wallpaper-install-id").write_text(secrets.token_hex(12))
        if was_running and not args.no_restart:
            start_shell(shell)
            wait_plugin(shell, args.uninstall)
    except Exception:
        if was_running and not args.no_restart:
            stop_shell(shell)
        if reset_stage is not None:
            (data_root / "wallpaper-install-id").unlink(missing_ok=True)
            for saved in reset_stage.iterdir():
                target = data_root / saved.name
                if target.is_symlink() or target.is_file(): target.unlink()
                elif target.is_dir(): shutil.rmtree(target)
                saved.rename(target)
            reset_stage.rmdir()
        atomic_write(dock, original)
        atomic_write(wallpaper, original_wallpaper)
        atomic_write(chrome, original_chrome)
        if mutated_plugin:
            if destination.exists():
                shutil.rmtree(destination)
            if (backup / "plugin").exists():
                shutil.copytree(backup / "plugin", destination, symlinks=True)
        if was_running and not args.no_restart:
            start_shell(shell)
        raise
    if reset_stage is not None:
        shutil.rmtree(reset_stage)
    print("Удалён" if args.uninstall else "Установлен", ":", destination)
    if args.repair:
        print("Подключения восстановлены. Записи, разметки, настройки и композиция обоев сохранены.")
    elif not args.uninstall:
        print("Сохранённые разметки и отметки первого прослушивания сброшены.")
    print("Резервная копия:", backup)
    if args.no_restart:
        print("Теперь перезапустите SekaiPop для применения.")


if __name__ == "__main__":
    main()
