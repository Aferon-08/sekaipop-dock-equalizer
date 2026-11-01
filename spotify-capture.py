#!/usr/bin/env python3
"""Capture ONLY one Spotify sink-input, controlled by the selected MPRIS player."""
import json
import math
import os
from pathlib import Path
import selectors
import signal
import subprocess
import sys
import tempfile
import shutil
import time
import wave

from wordtime import data_directory, track_info

RATE = 44100
CHANNELS = 2
FRAME = CHANNELS * 2
BPS = RATE * FRAME


def first_capture(track):
    key, _ = track_info(track)
    folder = data_directory().parent / 'recording-seen'
    folder.mkdir(parents=True, exist_ok=True, mode=0o700)
    try:
        fd = os.open(folder / key, os.O_WRONLY | os.O_CREAT | os.O_EXCL, 0o600)
    except FileExistsError:
        return False
    os.close(fd)
    return True


def emit(data):
    print(json.dumps(data, ensure_ascii=False, allow_nan=False), flush=True)


def streams():
    def query(kind):
        return json.loads(subprocess.check_output(['pactl', '--format=json', 'list', kind], timeout=3))
    inputs = [x for x in query('sink-inputs') if
              str(x.get('properties', {}).get('application.name', '')).casefold() == 'spotify'
              or x.get('properties', {}).get('application.id') == 'com.spotify.Client']
    if len(inputs) != 1:
        raise ValueError('Не найден единственный поток Spotify. Общий аудиовыход записываться не будет.')
    node = inputs[0]
    sink = next((s for s in query('sinks') if s['index'] == node['sink']), None)
    if not sink or not sink.get('monitor_source'):
        raise ValueError('Не найден монитор потока Spotify.')
    return node['index'], str(sink['monitor_source'])


class Timeline:
    def __init__(self):
        self.pcm = bytearray()

    def commit(self, chunk, start, end):
        if not chunk:
            return
        wanted = round((end - start) * RATE)
        if wanted < 0 or abs(wanted - len(chunk) // FRAME) > RATE * .4:
            raise ValueError('Запись разошлась с позицией плеера. Неполный результат отброшен.')
        offset = round(start * RATE)
        existing = len(self.pcm) // FRAME
        if abs(offset - existing) > RATE * (.6 if not existing else .4):
            raise ValueError('Обнаружен пропуск в аудио. Дождитесь полного прослушивания.')
        if offset > existing:
            self.pcm.extend(b'\0' * ((offset - existing) * FRAME))
        skip = max(0, existing - offset)
        self.pcm.extend(chunk[skip * FRAME:max(skip, wanted) * FRAME])

    def finish(self, duration):
        frames = round(duration * RATE)
        if abs(frames - len(self.pcm) // FRAME) > RATE * .4 or not self.pcm:
            raise ValueError('Песня записана не полностью. Тайминги не изменены.')
        self.pcm = self.pcm[:frames * FRAME]
        self.pcm.extend(b'\0' * max(0, frames * FRAME - len(self.pcm)))


def capture(initial, incoming=sys.stdin, resolver=streams):
    state = initial['state']
    duration = float(initial['track']['duration'])
    if not math.isfinite(duration) or not 0 < duration <= 1800 or not 0 <= state['position'] <= .35:
        raise ValueError('Запись Spotify начнётся при следующем воспроизведении с начала.')
    identity = state['key']
    timeline = Timeline()
    selector = selectors.DefaultSelector()
    selector.register(incoming.fileno(), selectors.EVENT_READ, 'state')
    recorder = None
    segment = bytearray()
    start = None
    last_event = time.monotonic()
    buffer = b''
    last_progress = 0

    def position_at(stamp):
        return state['position'] + (max(0, stamp - state['stamp'] / 1000) if state['playing'] else 0)

    def begin():
        nonlocal recorder, segment, start
        index, monitor = resolver()
        recorder = subprocess.Popen(['parec', '--raw', '--format=s16le', '--rate=' + str(RATE), '--channels=' + str(CHANNELS),
            '--latency-msec=20', '--process-time-msec=20', '--device=' + monitor,
            '--monitor-stream=' + str(index), '--client-name=SekaiPop Wordtime', '--stream-name=Spotify timing capture'],
            stdout=subprocess.PIPE, stderr=subprocess.DEVNULL)
        selector.register(recorder.stdout, selectors.EVENT_READ, 'audio')
        segment = bytearray(); start = None

    def read_audio(data):
        nonlocal start
        if data and start is None:
            start = max(0, position_at(time.time()) - len(data) / BPS)
        segment.extend(data)

    def end(position):
        nonlocal recorder
        if not recorder:
            return
        selector.unregister(recorder.stdout)
        recorder.terminate()
        try:
            tail, _ = recorder.communicate(timeout=2)
        except subprocess.TimeoutExpired:
            recorder.kill(); tail, _ = recorder.communicate()
        read_audio(tail)
        recorder = None
        if start is not None:
            timeline.commit(segment, start, position)

    try:
        if state['playing']:
            begin()
        emit({'type': 'recording', 'first': first_capture(initial['track'])})
        complete = False
        while not complete:
            if time.monotonic() - last_event > 2.5:
                raise ValueError('Плеер перестал сообщать состояние. Запись отброшена.')
            for key, _ in selector.select(.05):
                if key.data == 'audio':
                    data = os.read(key.fileobj.fileno(), 65536)
                    if not data:
                        if state['position'] >= duration - .35:
                            complete = True; break
                        raise ValueError('Аудиопоток Spotify исчез. Запись отброшена.')
                    read_audio(data)
                else:
                    data = os.read(incoming.fileno(), 65536)
                    if not data:
                        raise InterruptedError()
                    buffer += data
                    while b'\n' in buffer:
                        line, buffer = buffer.split(b'\n', 1)
                        new = json.loads(line)
                        stamp = time.monotonic(); last_event = stamp
                        if not new.get('enabled', True):
                            raise InterruptedError()
                        if new['key'] != identity or new['position'] < state['position'] - .45:
                            if state['position'] >= duration - .35:
                                complete = True; break
                            raise ValueError('Трек переключён или перемотан. Неполная запись отброшена.')
                        expected = position_at(new['stamp'] / 1000)
                        # Spotify can freeze its MPRIS clock for ~1s at EOF and
                        # then publish the real final position. Accept only this
                        # narrow recovery; PCM completeness is still verified by
                        # end()/Timeline.finish, so a real skipped tail fails.
                        final_clock_recovery = (state['position'] >= duration - 1.25
                            and new['position'] >= duration - .35
                            and 0 <= new['position'] - state['position'] <= 1.25)
                        if abs(new['position'] - expected) > .5 and not final_clock_recovery:
                            raise ValueError('Обнаружена перемотка. Запись отброшена.')
                        if state['playing'] and not new['playing']:
                            end(new['position'])
                        state = new
                        if state['playing'] and recorder is None:
                            begin()
                        if not state['playing'] and state['position'] >= duration - .02:
                            complete = True; break
            if time.monotonic() - last_progress > .5:
                emit({'type': 'progress', 'phase': 'capturing' if state['playing'] else 'capture_paused',
                      'fraction': min(1, state['position'] / duration)})
                last_progress = time.monotonic()
        end(duration)
        timeline.finish(duration)
        folder = data_directory().parent / 'audio-tmp'
        folder.mkdir(parents=True, exist_ok=True, mode=0o700)
        fd, path = tempfile.mkstemp(prefix='capture-', suffix='.wav', dir=folder)
        os.close(fd)
        try:
            with wave.open(path, 'wb') as output:
                output.setnchannels(CHANNELS); output.setsampwidth(2); output.setframerate(RATE)
                output.writeframes(timeline.pcm)
        except BaseException:
            Path(path).unlink(missing_ok=True)
            raise
        return path
    finally:
        if recorder:
            recorder.kill(); recorder.wait()
        selector.close()


def main():
    folder = data_directory().parent / 'audio-tmp'
    if len(sys.argv) > 1 and sys.argv[1] in ('cleanup', 'remove'):
        for path in (list(folder.iterdir()) if sys.argv[1] == 'cleanup' and folder.exists()
                     else [Path(sys.argv[2])] if len(sys.argv) > 2 else []):
            if path.parent.resolve() != folder.resolve(): continue
            if path.name.startswith('capture-'): path.unlink(missing_ok=True)
            elif path.name.startswith(('youtube-', 'voices-')) and not path.is_symlink(): shutil.rmtree(path, ignore_errors=True)
        return 0
    if os.getpgrp() != os.getpid(): os.setsid()
    def stop(_sig, _frame): raise InterruptedError()
    signal.signal(signal.SIGTERM, stop); signal.signal(signal.SIGINT, stop)
    try:
        initial = json.loads(sys.stdin.buffer.readline(262145))
        path = capture(initial, sys.stdin.buffer)
        folder = data_directory().parent / 'recordings'
        folder.mkdir(parents=True, exist_ok=True, mode=0o700)
        key, _ = track_info(initial['track'])
        destination = folder / (key + '.wav')
        os.replace(path, destination)
        os.chmod(destination, 0o600)
        emit({'type': 'result', 'ok': True, 'audio': str(destination)})
        return 0
    except InterruptedError:
        emit({'type': 'result', 'ok': False, 'message': 'Запись остановлена.'})
    except Exception as error:
        emit({'type': 'result', 'ok': False, 'message': str(error)[:400]})
    return 2


if __name__ == '__main__':
    raise SystemExit(main())
