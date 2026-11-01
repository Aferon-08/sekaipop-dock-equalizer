#!/usr/bin/env python3
"""Validate and store Lyrics Wordtime Extractor JSON; no model or audio capture."""
import argparse
import hashlib
import json
import math
import os
from pathlib import Path
import re
import stat
import tempfile
from urllib.parse import parse_qs, unquote, urlparse

MAX_BYTES = 4 * 1024 * 1024


def number(value):
    if isinstance(value, bool) or not isinstance(value, (int, float)) or not math.isfinite(value):
        raise ValueError("Временные отметки должны быть конечными числами.")
    return float(value)


def track_info(track):
    title = str(track.get("title", "")).strip()
    artist = str(track.get("artist", "")).strip()
    url = str(track.get("url", "")).strip()
    duration = number(track.get("duration", 0))
    if not title or max(len(title), len(artist), len(url)) > 4096 or duration < 0:
        raise ValueError("Сначала выберите трек в плеере.")
    parsed = urlparse(url)
    video = ""
    if parsed.hostname in ("youtube.com", "www.youtube.com", "m.youtube.com", "music.youtube.com"):
        video = parse_qs(parsed.query).get("v", [""])[0]
        if parsed.path.startswith(("/shorts/", "/embed/")):
            video = parsed.path.split("/")[2]
    elif parsed.hostname in ("youtu.be", "www.youtu.be"):
        video = parsed.path.strip("/")
    if re.fullmatch(r"[A-Za-z0-9_-]{11}", video):
        identity = ["youtube", video]
    elif (spotify := re.search(r'(?:spotify:track:|open\.spotify\.com/(?:intl-[^/]+/)?track/)([A-Za-z0-9]{22})(?:[^A-Za-z0-9]|$)', url)):
        identity = ["spotify", spotify[1]]
    elif url:
        identity = ["url", url]
    elif artist and duration > 0:
        identity = ["metadata", artist.casefold(), title.casefold(), round(duration)]
    else:
        raise ValueError("Плеер пока не сообщил адрес или длительность трека. Попробуйте позже.")
    key = hashlib.sha256(json.dumps(identity, ensure_ascii=False).encode()).hexdigest()
    return key, {"title": title, "artist": artist, "duration": duration}


def read_json(path):
    info = path.stat()
    if not stat.S_ISREG(info.st_mode) or info.st_size > MAX_BYTES:
        raise ValueError("Нужен обычный JSON-файл размером до 4 МБ.")
    with path.open("r", encoding="utf-8-sig") as handle:
        text = handle.read(MAX_BYTES + 1)
    if len(text.encode("utf-8")) > MAX_BYTES:
        raise ValueError("JSON-файл слишком большой (предел — 4 МБ).")
    try:
        data = json.loads(text)
    except (ValueError, RecursionError) as error:
        raise ValueError("Не удалось прочитать JSON. Выберите экспорт JSON экстрактора.") from error
    if not isinstance(data, dict):
        raise ValueError("Ожидался JSON-объект экстрактора с полями duration и words.")
    return data


def validate(document, track):
    if 'schema' in document and (type(document['schema']) is not int or document['schema'] not in (1, 2)):
        raise ValueError('Неподдерживаемая версия формата таймингов.')
    duration = number(document.get("duration"))
    if not 0 < duration <= 86400:
        raise ValueError("В JSON нет корректной длительности аудио.")
    if track["duration"] > 0 and abs(duration - track["duration"]) > max(2, min(5, duration * .01)):
        raise ValueError("Длительность JSON не совпадает с треком. Возможно, это другая версия песни.")
    raw = document.get("words")
    fallback_raw = document.get('fallbackLines', [])
    if not isinstance(fallback_raw, list) or len(fallback_raw) > 10000:
        raise ValueError('Некорректный список построчных таймингов (до 10 000 строк).')
    if fallback_raw and document.get('schema') == 1:
        raise ValueError('Построчные тайминги требуют формат версии 2.')
    if not isinstance(raw, list) or len(raw) > 10000 or not (raw or fallback_raw):
        raise ValueError("В JSON нужны слова или построчные тайминги (до 10 000 каждого вида).")
    voices, voice_ids = [], set()
    raw_voices = document.get('voices', [])
    if not isinstance(raw_voices, list) or len(raw_voices) > 16:
        raise ValueError('В разметке допускается до 16 вокальных партий.')
    for voice in raw_voices:
        if not isinstance(voice, dict):
            raise ValueError('Некорректное описание голоса.')
        identity, label = voice.get('id'), voice.get('label')
        if not isinstance(identity, str) or not re.fullmatch(r'[A-Za-z0-9_.-]{1,64}', identity) or identity in voice_ids:
            raise ValueError('Идентификаторы голосов должны быть уникальными.')
        if not isinstance(label, str) or not label.strip() or len(label) > 80 or any(ord(c) < 32 for c in label):
            raise ValueError('Некорректное название вокальной партии.')
        voice_ids.add(identity); voices.append({'id': identity, 'label': label.strip()})
    words, previous = [], {}
    for i, item in enumerate(raw):
        if not isinstance(item, dict):
            raise ValueError(f"Слово №{i + 1}: некорректная запись.")
        word = item.get("word")
        if not isinstance(word, str) or not any(c.isalnum() for c in word) or len(word) > 500 or any(ord(c) < 32 for c in word):
            raise ValueError(f"Слово №{i + 1}: некорректный текст.")
        start, end = number(item.get("start")), number(item.get("end"))
        line = item.get("line", 0)
        if isinstance(line, bool) or not isinstance(line, int) or not 0 <= line <= 50000:
            raise ValueError(f"Слово №{i + 1}: некорректный номер строки.")
        if item.get("status") == "unresolved" or end == start:
            raise ValueError(f"Слово №{i + 1} не размечено. Исправьте unresolved в экстракторе и повторите импорт.")
        assigned = item.get('voiceIds', [])
        if not isinstance(assigned, list) or len(assigned) > 16 or any(not isinstance(v, str) or v not in voice_ids for v in assigned) or len(set(assigned)) != len(assigned):
            raise ValueError(f'Слово №{i + 1}: неизвестная или повторяющаяся вокальная партия.')
        order_key = (line, tuple(assigned))
        if not 0 <= start < end <= duration + .05 or start < previous.get(order_key, -1):
            raise ValueError(f"Слово №{i + 1}: время вне песни или нарушен порядок слов.")
        previous[order_key] = start
        review = item.get("status") == "review" or item.get('voiceReviewRequired') is True or end - start < .04 or end - start > 5
        words.append({"word": word.strip(), "start": start, "end": end, "line": line,
                      "voice": "backing" if item.get("voice") == "backing" else "lead",
                      "status": "review" if review else "estimated"})
        if assigned:
            words[-1]['voiceIds'] = assigned
            confidence = number(item.get('voiceConfidence', 1))
            if not 0 <= confidence <= 1:
                raise ValueError('Уверенность определения голоса должна быть от 0 до 1.')
            words[-1]['voiceConfidence'] = confidence
            source = item.get('voiceSource', 'import')
            if source not in ('annotation', 'acoustic', 'unassigned', 'manual', 'import'):
                raise ValueError('Неизвестный источник разметки голосов.')
            words[-1]['voiceSource'] = source
        role = item.get('role', 'lead')
        if role not in ('lead', 'parallel', 'backing', 'unison'):
            raise ValueError('Неизвестная роль вокальной фразы.')
        words[-1]['role'] = role
        if item.get('hostVoiceId') in voice_ids:
            words[-1]['hostVoiceId'] = item['hostVoiceId']
        if item.get('unisonId') is not None:
            group = item['unisonId']
            if not assigned or not isinstance(group, str) or not re.fullmatch(r'[A-Za-z0-9_.-]{1,80}', group):
                raise ValueError('Некорректная группа совместного исполнения.')
            words[-1]['unisonId'] = group
    fallback, fallback_ids = [], set()
    word_lines = {word['line'] for word in words}
    for i, item in enumerate(fallback_raw):
        if not isinstance(item, dict):
            raise ValueError(f'Строка №{i + 1}: некорректная запись.')
        line = item.get('line')
        if isinstance(line, bool) or not isinstance(line, int) or not 0 <= line <= 50000 or line in fallback_ids or line in word_lines:
            raise ValueError(f'Строка №{i + 1}: некорректный или повторяющийся номер строки.')
        start, end = number(item.get('t')), number(item.get('end'))
        if not 0 <= start < end <= duration + .05:
            raise ValueError(f'Строка №{i + 1}: время вне песни.')
        text = item.get('text')
        if not isinstance(text, str) or not any(c.isalnum() for c in text) or len(text) > 10000 or any(ord(c) < 32 for c in text):
            raise ValueError(f'Строка №{i + 1}: некорректный текст.')
        assigned = item.get('voiceIds')
        if not isinstance(assigned, list) or len(assigned) > 16 or any(not isinstance(v, str) or v not in voice_ids for v in assigned) or len(set(assigned)) != len(assigned):
            raise ValueError(f'Строка №{i + 1}: неизвестная или повторяющаяся вокальная партия.')
        entry = {'line': line, 't': start, 'end': end, 'text': text.strip(), 'voiceIds': assigned}
        if item.get('unisonId') is not None:
            group = item['unisonId']
            if not assigned or not isinstance(group, str) or not re.fullmatch(r'[A-Za-z0-9_.-]{1,80}', group):
                raise ValueError('Некорректная группа совместного исполнения.')
            entry['unisonId'] = group
        if item.get('role') in ('lead', 'parallel', 'backing', 'unison'): entry['role'] = item['role']
        if item.get('hostVoiceId') in voice_ids: entry['hostVoiceId'] = item['hostVoiceId']
        fallback.append(entry); fallback_ids.add(line)
    result = {"duration": duration, "words": words}
    if fallback:
        result['fallbackLines'] = fallback
    if voices:
        result['voices'] = voices
        metadata = document.get('multivoice', {})
        if not isinstance(metadata, dict) or len(json.dumps(metadata, ensure_ascii=False, allow_nan=False)) > 8192:
            raise ValueError('Некорректные сведения об анализе голосов.')
        result['multivoice'] = metadata
    analysis = document.get('analysis')
    if analysis is not None:
        if not isinstance(analysis, dict) or len(json.dumps(analysis, allow_nan=False)) > 8192:
            raise ValueError('Некорректные сведения об этапах обработки.')
        result['analysis'] = analysis
    return result


def data_directory():
    return Path(os.environ.get("XDG_DATA_HOME", Path.home() / ".local/share")) / "sekaipop/dock-equalizer/wordtimes"


def local_file(value):
    if value.startswith("file:"):
        parsed = urlparse(value)
        if parsed.netloc not in ("", "localhost"):
            raise ValueError("Выберите локальный JSON-файл.")
        return Path(unquote(parsed.path))
    return Path(value).expanduser()


def ready_result(document):
    return {"ok": True, "status": "partial" if document.get('fallbackLines') else "ready", **document,
            "wordCount": len(document["words"]),
            "fallbackLineCount": len(document.get('fallbackLines', [])),
            "reviewCount": sum(w["status"] == "review" for w in document["words"])}


def save_result(document, track):
    key, info = track_info(track)
    result = validate(document, info)
    serialized = json.dumps({**result, "track": info, "schema": 2 if result.get('voices') or result.get('fallbackLines') else 1}, ensure_ascii=False, allow_nan=False)
    if len(serialized.encode('utf-8')) > MAX_BYTES:
        raise ValueError('JSON-файл слишком большой (предел — 4 МБ).')
    destination = data_directory() / (key + ".json")
    destination.parent.mkdir(parents=True, exist_ok=True, mode=0o700)
    fd, temporary = tempfile.mkstemp(prefix=".import-", dir=destination.parent)
    try:
        with os.fdopen(fd, "w", encoding="utf-8") as handle:
            handle.write(serialized)
            handle.flush()
            os.fsync(handle.fileno())
        os.replace(temporary, destination)
    finally:
        Path(temporary).unlink(missing_ok=True)
    return ready_result(result)


def saved_path(track):
    key, _ = track_info(track)
    destination = data_directory() / (key + '.json')
    if destination.exists(): return destination
    url = str(track.get('url',''))
    aliases = [url]
    match = re.search(r'(?:spotify:track:|open\.spotify\.com/(?:intl-[^/]+/)?track/)([A-Za-z0-9]{22})',url)
    if match: aliases += ['spotify:track:'+match[1], 'https://open.spotify.com/track/'+match[1]]
    for alias in aliases:
        old = hashlib.sha256(json.dumps(['url',alias],ensure_ascii=False).encode()).hexdigest()
        candidate=destination.with_name(old+'.json')
        if candidate.is_file(): return candidate
    return destination


def run(args):
    track = json.loads(args.track_json)
    if not isinstance(track, dict):
        raise ValueError("Некорректные данные трека.")
    key, info = track_info(track)
    destination = data_directory() / (key + ".json")
    if args.action == "remove":
        destination.unlink(missing_ok=True)
        for _ in range(4):
            previous = saved_path(track)
            if not previous.exists(): break
            previous.unlink()
        return {"ok": True, "status": "missing"}
    if args.action == "lookup": destination = saved_path(track)
    if args.action == "lookup" and not destination.exists():
        return {"ok": True, "status": "missing"}
    source = local_file(args.file) if args.action == "import" else destination
    document = read_json(source)
    # A lookup revalidates saved files too. Corruption never enters the renderer.
    if args.action == "import":
        return save_result(document, track)
    return ready_result(validate(document, info))


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("action", choices=["import", "lookup", "remove"])
    parser.add_argument("--track-json", required=True)
    parser.add_argument("--file", default="")
    args = parser.parse_args()
    try:
        result = run(args)
        if args.action == "lookup":
            key, _ = track_info(json.loads(args.track_json))
            audio = data_directory().parent / "recordings" / (key + ".wav")
            if audio.is_file() and not audio.is_symlink(): result["audio"] = str(audio)
    except (ValueError, TypeError, KeyError, OSError, UnicodeError, RecursionError) as error:
        message = str(error) if isinstance(error, ValueError) and not isinstance(error, json.JSONDecodeError) else "Не удалось прочитать или сохранить файл таймингов."
        result = {"ok": False, "message": message[:500]}
    print(json.dumps(result, ensure_ascii=False, allow_nan=False))
    return 0 if result["ok"] else 2


if __name__ == "__main__":
    raise SystemExit(main())
