#!/usr/bin/env python3
"""Prepare an isolated CPU-only runtime. Does not change system Python."""
import argparse
import json
import os
from pathlib import Path
import shutil
import signal
import subprocess
import sys
import tempfile

from wordtime import data_directory

REVISION = "6fd129aa4b8295eaf92e61055fcf886bd4f474b1"
ROOT = data_directory().parent


def emit(phase, fraction):
    print(json.dumps({"type": "progress", "phase": phase, "fraction": fraction}), flush=True)


def run(*command):
    return subprocess.run(command, check=True, stdout=sys.stderr, stderr=sys.stderr)


def stop(_signum, _frame):
    signal.signal(signal.SIGTERM, signal.SIG_IGN)
    if os.getpgrp() == os.getpid():
        os.killpg(os.getpgrp(), signal.SIGTERM)
    raise InterruptedError()


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--python", default="3.12")
    args = parser.parse_args()
    if os.getpgrp() != os.getpid():
        os.setsid()
    signal.signal(signal.SIGTERM, stop)
    signal.signal(signal.SIGINT, stop)
    try:
        if not shutil.which("uv") or not shutil.which("git"):
            raise ValueError("Для подготовки обработчика нужны установленные uv и Git.")
        if not shutil.which("ffprobe"):
            raise ValueError("Для чтения аудио нужен FFmpeg с ffprobe.")
        ROOT.mkdir(parents=True, exist_ok=True, mode=0o700)
        engine = ROOT / ("extractor-" + REVISION[:8])
        emit("preparing", .05)
        if not engine.exists():
            run("git", "clone", "--no-checkout", "--depth", "1",
                "https://github.com/FASTDROPX/Lyrics-wordtime-extractor", str(engine))
            run("git", "-C", str(engine), "fetch", "--depth", "1", "origin", REVISION)
            run("git", "-C", str(engine), "checkout", "--detach", REVISION)
        revision = subprocess.check_output(["git", "-C", str(engine), "rev-parse", "HEAD"], text=True).strip()
        if revision != REVISION:
            raise ValueError("Версия экстрактора не совпадает с проверенной. Существующие файлы не изменены.")
        python = ROOT / "runtime/bin/python"
        if not python.exists():
            run("uv", "venv", "--python", args.python, str(ROOT / "runtime"))
        emit("dependencies", .15)
        run("uv", "pip", "install", "--python", str(python), "--torch-backend", "cpu",
            "-r", str(Path(__file__).with_name("wordtime-requirements.txt")))
        emit("model", .65)
        run(str(python), "-c", "import torch, torchaudio, stable_whisper, whisper; "
            "torch.set_num_threads(2); "
            "assert torch.version.cuda is None, 'expected CPU runtime'; "
            "whisper.load_model('base',device='cpu',download_root=" + repr(str(ROOT / "models")) + ")")
        lock = subprocess.check_output(["uv", "pip", "freeze", "--python", str(python)], text=True)
        (ROOT / "runtime-lock.txt").write_text(lock)
        fd, temporary = tempfile.mkstemp(prefix=".runtime-", dir=ROOT)
        try:
            with os.fdopen(fd, "w") as handle:
                json.dump({"ready": True, "revision": REVISION, "model": "base", "device": "cpu"}, handle)
            os.replace(temporary, ROOT / "runtime.json")
        finally:
            Path(temporary).unlink(missing_ok=True)
        print(json.dumps({"type": "result", "ok": True, "setup": True}), flush=True)
        return 0
    except InterruptedError:
        result = {"ok": False, "cancelled": True, "message": "Подготовка отменена."}
    except Exception as error:
        print(repr(error), file=sys.stderr)
        result = {"ok": False, "message": str(error)[:400] if isinstance(error, ValueError)
                  else "Не удалось подготовить обработчик. Проверьте подключение к интернету и свободное место."}
    print(json.dumps({"type": "result", **result}, ensure_ascii=False), flush=True)
    return 2


if __name__ == "__main__":
    raise SystemExit(main())
