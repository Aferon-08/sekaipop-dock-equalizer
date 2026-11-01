#!/usr/bin/env python3
"""NDJSON bridge to a pinned extractor and isolated CPU / NVIDIA runtimes."""
from contextlib import redirect_stdout
import json
import os
from pathlib import Path
import signal
import shutil
import stat
import subprocess
import sys
import tempfile
import importlib
import hashlib
import copy
import time

import wordtime
import compute_runtime as compute

REVISION = "6fd129aa4b8295eaf92e61055fcf886bd4f474b1"
ROOT = wordtime.data_directory().parent
ENGINE = ROOT / ("extractor-" + REVISION[:8])
PYTHON = ROOT / "runtime/bin/python"
MODEL = ROOT / "models/base.pt"
PROTOCOL = sys.stdout


def emit(event):
    print(json.dumps(event, ensure_ascii=False, allow_nan=False), file=PROTOCOL, flush=True)


def probe():
    try:
        config = json.loads((ROOT / "runtime.json").read_text())
        ready = config.get("revision") == REVISION and config.get("ready") is True
    except (OSError, ValueError):
        ready = False
    return {"ready": bool(ready and PYTHON.is_file() and MODEL.is_file()
                           and (ENGINE / "extractor.py").is_file()), "model": "base", "device": compute.status()["device"], "compute": compute.status(),
        "voicesReady": (ROOT / "multivoice-runtime.json").is_file() and (ROOT / "models/campplus-zh-en.onnx").is_file() and (ROOT / "models/singer-byol.ts").is_file()}


def stop(signum, _frame):
    # ffmpeg shares this private process group. Stop it along with the model.
    signal.signal(signal.SIGTERM, signal.SIG_IGN)
    if os.getpgrp() == os.getpid():
        os.killpg(os.getpgrp(), signal.SIGTERM)
    if signum == signal.SIGALRM:
        raise TimeoutError("Обработка заняла больше 40 минут. Обычная лирика сохранена.")
    raise InterruptedError("cancelled")


def retain_source_lines(document):
    """Keep uncertain lines line-timed, without manufacturing word timestamps."""
    groups = {}
    for word in document['words']: groups.setdefault(word['line'], []).append(word)
    bad = {line for line, words in groups.items()
        if any(w.get('status') == 'unresolved' or w['end'] <= w['start'] for w in words)}
    fallback = []
    segments = document.get('source_segments', [])
    for line in sorted(bad):
        if not 0 <= line < len(segments): raise ValueError('Нет исходного времени для неразмеченной строки.')
        source, words = segments[line], groups[line]
        start = source['start']
        end = source.get('end')
        if end is None or end <= start:
            end = next((s['start'] for s in segments[line + 1:] if s['start'] > start), document['duration'])
        item = dict(line=line, t=start, end=min(end, document['duration']), text=source['text'],
            voiceIds=words[0].get('voiceIds', []))
        if words[0].get('unisonId'): item['unisonId'] = words[0]['unisonId']
        if words[0].get('role'): item['role'] = words[0]['role']
        if words[0].get('hostVoiceId'): item['hostVoiceId'] = words[0]['hostVoiceId']
        fallback.append(item)
    document['words'] = [w for w in document['words'] if w['line'] not in bad]
    if fallback: document['fallbackLines'] = fallback
    return document


def generate(request):
    if request.get('setupVoices'):
        emit({'type': 'progress', 'phase': 'voice_models', 'fraction': .1})
        subprocess.run([sys.executable, str(Path(__file__).with_name('setup-multivoice.py'))],
            stdout=sys.stderr, check=True, timeout=900)
        emit({'type': 'result', 'ok': True, 'voiceSetup': True})
        return
    if request.get("youtube"):
        return generate_youtube(request)
    track = request.get("track")
    if not isinstance(track, dict):
        raise ValueError("Сначала выберите трек в плеере.")
    wordtime.track_info(track)
    audio_value = str(request.get("audio") or track.get("url", ""))
    if not audio_value or ("://" in audio_value and not audio_value.startswith("file:")):
        raise ValueError("Выберите локальный аудиофайл этой записи песни.")
    audio = wordtime.local_file(audio_value).resolve(strict=True)
    if not stat.S_ISREG(audio.stat().st_mode) or audio.stat().st_size > 2 * 1024**3:
        raise ValueError("Выберите обычный аудиофайл размером до 2 ГБ.")
    if not shutil.which("ffprobe"):
        raise ValueError("Для чтения аудио нужен ffprobe из пакета FFmpeg.")
    metadata = subprocess.run(["ffprobe", "-v", "error", "-protocol_whitelist", "file,pipe",
        "-show_entries", "format=duration", "-of", "json", str(audio)],
        capture_output=True, text=True, timeout=30, check=True)
    duration = float(json.loads(metadata.stdout)["format"]["duration"])
    if not 0 < duration <= 1800:
        raise ValueError("Поддерживаются аудиозаписи длительностью до 30 минут.")
    expected = track.get("duration", 0)
    if expected > 0 and abs(duration - expected) > max(2, min(5, duration * .01)):
        raise ValueError("Длительность аудиофайла не совпадает с треком в плеере.")
    lyrics = request.get("lyrics", "")
    if not isinstance(lyrics, str) or len(lyrics.encode()) > 128 * 1024:
        raise ValueError("Текст песни слишком большой (предел — 128 КБ).")
    if not lyrics.strip():
        raise ValueError("Добавьте текст песни или дождитесь найденной лирики.")
    before = audio.stat()
    from voice_annotations import prepare, apply
    clean_lyrics, voice_plan = prepare(lyrics)
    if not request.get('multivoice', True): voice_plan = None
    sys.path.insert(0, str(ENGINE))
    import audio as extractor_audio
    def decode_local(source, destination, channels=1):
        command = [extractor_audio.imageio_ffmpeg.get_ffmpeg_exe(), "-nostdin", "-v", "error",
                   "-y", "-protocol_whitelist", "file,pipe", "-threads", str(min(4,compute.cpu_threads())), "-i", str(source),
                   "-t", "1801", "-vn", "-ac", str(channels), "-ar", "16000", "-c:a", "pcm_s16le", str(destination)]
        subprocess.run(command, capture_output=True, check=True, timeout=120)
    # The extractor takes arrays after decoding. Restrict its file decoder to
    # local protocols, including repair's stereo passes; never follow web media.
    extractor_audio.decode_audio = decode_local
    from extractor import extract
    import stable_whisper
    # The pinned extractor hardcodes CPU. Redirect only its model factory in
    # this private worker; do not modify the upstream checkout.
    original_loader=stable_whisper.load_model
    loaded_model=[None]
    def load_accelerated(*args,**kwargs):
        kwargs['device']='cpu'
        model=original_loader(*args,**kwargs)
        loaded_model[0]=model
        compute.run('whisper',model,lambda device: None)
        return model

    def progress(phase, fraction):
        emit({"type": "progress", "phase": phase, "fraction": max(0, min(1, fraction)) * (.30 if request.get('multivoice', True) else 1)})
    key, info = wordtime.track_info(track)
    existing = None
    cache = wordtime.saved_path(track)
    if cache.is_file():
        existing = wordtime.validate(wordtime.read_json(cache), info)
    source_hash = hashlib.sha256(clean_lyrics.encode()).hexdigest()
    source_changed = bool(existing and existing.get('analysis',{}).get('sourceHash')
        and existing['analysis']['sourceHash'] != source_hash)
    previous_timings = existing
    if source_changed: existing = None
    # Voice upgrades preserve known word times instead of rerunning the aligner.
    if existing:
        document = copy.deepcopy(existing)
    elif request.get("reference"):
        document = wordtime.validate(request["reference"], info)
    else:
        stable_whisper.load_model=load_accelerated
        try:
            def extract_once():
                with redirect_stdout(sys.stderr):
                    return extract(audio,clean_lyrics,model_name="base",model_dir=MODEL.parent,
                        threads=compute.cpu_threads(),repair=True,refine=False,progress=progress)
            try:document=extract_once()
            except RuntimeError as error:
                if compute.status()['device']=='cpu' or not compute.gpu_error(error):raise
                compute.use_cpu('whisper',loaded_model[0],error)
                document=extract_once()
        finally:stable_whisper.load_model=original_loader
    if source_changed and previous_timings:
        def phrase_key(words): return ' '.join(w['word'].strip().casefold() for w in words)
        old, new = {}, {}
        for w in previous_timings['words']: old.setdefault(w['line'],[]).append(w)
        for w in document['words']: new.setdefault(w['line'],[]).append(w)
        for group in new.values():
            matches = [g for g in old.values() if len(g)==len(group) and phrase_key(g)==phrase_key(group)
                and abs(g[0]['start']-group[0]['start'])<2]
            if matches:
                observed=min(matches,key=lambda g:abs(g[0]['start']-group[0]['start']))
                for a,b in zip(group,observed): a['start'],a['end']=b['start'],b['end']
    after = audio.stat()
    if (before.st_size, before.st_mtime_ns) != (after.st_size, after.st_mtime_ns):
        raise ValueError("Аудиофайл изменился во время обработки. Повторите расчёт.")
    if request.get('multivoice', True):
        if not existing and not request.get("reference"): document = apply(document, voice_plan)
        if voice_plan:
            voices = importlib.import_module('multivoice-engine')
            if voices.probe()['ready'] and hasattr(voices, 'recover_unresolved'):
                with redirect_stdout(sys.stderr):
                    document = voices.recover_unresolved(audio, document, voice_plan,
                        progress=lambda phase, fraction: emit({'type': 'progress', 'phase': phase,
                            'fraction': .30 + .05 * max(0, min(1, fraction))}))
    if request.get('returnPartial') is True:
        # Diagnostic output only; incomplete timings never enter the saved cache.
        emit({'type': 'partial', 'document': document})
    unresolved = sum(w.get("status") == "unresolved" or w["end"] <= w["start"] for w in document["words"])
    if unresolved and (not request.get('multivoice', True) or not document.get('source_segments')):
        raise ValueError(f"Не удалось разметить слов: {unresolved}. Уточните текст песни и повторите расчёт. Обычная лирика сохранена.")
    if request.get('multivoice', True):
        try:
            voices = importlib.import_module('multivoice-engine')
            if voices.probe()['ready'] and (ROOT/'models/singer-byol.ts').is_file():
                emit({'type': 'progress', 'phase': 'voices', 'fraction': .35})
                with redirect_stdout(sys.stderr):
                    from voice_pipeline import analyze
                    document["_sourceLyrics"] = lyrics
                    document = analyze(audio, copy.deepcopy(document),
                        progress=lambda phase, fraction: emit({'type': 'progress', 'phase': phase,
                            'fraction': .35 + .64 * max(0, min(1, fraction))}),
                        progress_detail=lambda detail:emit({'type':'detail','detail':detail}))
                document['multivoice'] = {**document.get('multivoice', {}), **document.pop('voiceEvidence', {})}
                # Adopt independently aligned words only for a complete line;
                # mixed partial bounds can silently reverse its word order.
                groups = {}
                for word in document['words']: groups.setdefault(word['line'], []).append(word)
                for group in groups.values():
                    if not all(w.get('voiceMethod') == 'separated-lyric-alignment'
                        and isinstance(w.get('voiceAlignedStart'), (int, float))
                        and isinstance(w.get('voiceAlignedEnd'), (int, float))
                        and 0 <= w['voiceAlignedStart'] < w['voiceAlignedEnd'] <= duration for w in group):
                        continue
                    if any(a['voiceAlignedStart'] > b['voiceAlignedStart'] for a, b in zip(group, group[1:])): continue
                    for word in group:
                        word['start'], word['end'] = word['voiceAlignedStart'], word['voiceAlignedEnd']
                        word['status'] = 'review'
            else:
                document['multivoice'] = {'status': 'unavailable', 'message': 'Модели голосов не подготовлены.'}
        except (InterruptedError, TimeoutError):
            raise
        except Exception as error:
            # Independent timing remains usable if optional voice analysis fails.
            print('Voice analysis:', repr(error), file=sys.stderr)
            document.setdefault('multivoice', {})['status'] = 'failed'
            document['multivoice']['message'] = 'Анализ звука не завершён; прежняя лирика сохранена.'
    if request.get('multivoice', True):
        document = retain_source_lines(document)
        if document.get('voiceRecovery'):
            document.setdefault('multivoice', {})['timingRecovery'] = document.pop('voiceRecovery')
    if document.get('fallbackLines'):
        key, info = wordtime.track_info(track)
        previous = wordtime.data_directory() / (key + '.json')
        if previous.is_file() and not wordtime.validate(wordtime.read_json(previous), info).get('fallbackLines'):
            raise ValueError('Новый расчёт неполный; предыдущие точные тайминги сохранены.')
    from voice_pipeline import finalise, REVISION as ANALYSIS_REVISION
    if request.get('multivoice', True): document = finalise(document)
    evidence = document.get('multivoice', {})
    document['analysis'] = {'revision': ANALYSIS_REVISION, 'sourceSignature': str(request.get('sourceSignature',''))[:80],
        'sourceHash': hashlib.sha256(clean_lyrics.encode()).hexdigest(), 'completedAt': int(time.time()),
        'timings': 'partial' if document.get('fallbackLines') else 'ready',
        'voices': evidence.get('status', 'uncertain') if request.get('multivoice',True) else 'disabled',
        'compute': compute.status(), 'textScanComplete': bool(evidence.get('fullScan')), 'timelineComplete': True}
    emit({"type": "progress", "phase": "saving", "fraction": .99})
    result = wordtime.save_result(document, track)
    emit({"type": "result", **result})


def generate_youtube(request):
    import re
    from urllib.parse import urlparse, parse_qs
    from yt_dlp import YoutubeDL
    parsed = urlparse(str(request['track'].get('url', '')))
    if parsed.hostname not in ('youtube.com', 'www.youtube.com', 'music.youtube.com', 'm.youtube.com', 'youtu.be'):
        raise ValueError('Нужна ссылка на конкретное видео YouTube.')
    video = parsed.path.strip('/') if parsed.hostname == 'youtu.be' else parse_qs(parsed.query).get('v', [''])[0]
    if parsed.path.startswith(('/shorts/', '/embed/')): video = parsed.path.split('/')[2]
    if not re.fullmatch(r'[A-Za-z0-9_-]{11}', video):
        raise ValueError('Не удалось определить видео YouTube.')
    emit({'type': 'progress', 'phase': 'downloading', 'fraction': 0})
    folder = ROOT / 'audio-tmp'; folder.mkdir(parents=True, exist_ok=True, mode=0o700)
    with tempfile.TemporaryDirectory(prefix='youtube-', dir=folder) as directory:
        emit({'type': 'temporary', 'audio': directory})
        def match(info, *, incomplete=False):
            if info.get('is_live') or info.get('live_status') == 'is_live': return 'Прямые эфиры не поддерживаются.'
            length = info.get('duration')
            if length is not None and not 0 < length <= 1800: return 'Поддерживаются записи до 30 минут.'
            return None
        options = {'format': 'bestaudio', 'noplaylist': True, 'quiet': True, 'no_warnings': True,
            'outtmpl': directory + '/audio.%(ext)s', 'cachedir': False, 'socket_timeout': 15,
            'retries': 1, 'fragment_retries': 1, 'max_filesize': 128 * 1024**2, 'match_filter': match,
            'js_runtimes': {'node': {'path': shutil.which('node')}} if shutil.which('node') else {}}
        try:
            with redirect_stdout(sys.stderr), YoutubeDL(options) as ydl:
                info = ydl.extract_info('https://www.youtube.com/watch?v=' + video, download=True)
                if not info: raise ValueError('Видео недоступно или не подходит для обработки.')
                audio = ydl.prepare_filename(info)
        except Exception as error:
            if isinstance(error, InterruptedError): raise
            raise ValueError('YouTube не предоставил аудио этого видео. Обычная лирика сохранена; можно выбрать локальный файл.') from error
        return generate({**request, 'youtube': False, 'audio': audio})


def remove_temporary(audio):
    path = Path(str(audio))
    folder = ROOT / 'audio-tmp'
    if path.parent.resolve() == folder.resolve() and path.name.startswith('capture-'):
        path.unlink(missing_ok=True)


def main():
    if len(sys.argv) == 2 and sys.argv[1] == "probe":
        emit(probe())
        return 0
    if not probe()["ready"]:
        emit({"type": "result", "ok": False, "message": "Сначала подготовьте обработчик таймингов."})
        return 2
    selected=compute.selected_python(PYTHON)
    if Path(sys.prefix).resolve() != selected.parent.parent.resolve():
        os.execve(str(selected), [str(selected), str(Path(__file__).resolve()), "generate"], compute.environment())
    if os.getpgrp() != os.getpid():
        os.setsid()
    for sig in (signal.SIGTERM, signal.SIGINT, signal.SIGALRM):
        signal.signal(sig, stop)
    signal.alarm(2400)
    request = {}
    try:
        request = json.loads(sys.stdin.readline(256 * 1024 + 1))
        if not isinstance(request, dict):
            raise ValueError("Некорректное задание обработки.")
        compute.configure(request,notify=lambda state: emit({"type":"compute","compute":state}))
        generate(request)
        return 0
    except InterruptedError:
        emit({"type": "result", "ok": False, "cancelled": True, "message": "Обработка отменена."})
    except FileNotFoundError:
        emit({"type": "result", "ok": False, "message": "Аудиофайл не найден. Выберите его заново."})
    except (subprocess.CalledProcessError, subprocess.TimeoutExpired):
        emit({"type": "result", "ok": False, "message": "Не удалось прочитать аудио. Выберите поддерживаемый локальный аудиофайл."})
    except (ValueError, OSError, TimeoutError) as error:
        emit({"type": "result", "ok": False, "message": str(error)[:500]})
    except Exception as error:
        print(repr(error), file=sys.stderr)
        emit({"type": "result", "ok": False, "message": "Не удалось рассчитать тайминги. Обычная лирика сохранена."})
    finally:
        signal.alarm(0)
        if request.get('cleanupAudio'): remove_temporary(request.get('audio', ''))
    return 2


if __name__ == "__main__":
    raise SystemExit(main())
