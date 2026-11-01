#!/usr/bin/env python3
"""Optional local singing-voice evidence; no artist-count or punctuation heuristics.

UNMIXX separates at most TWO simultaneous sources. CAM++ is a speech-trained
embedding model, so its similarity is supporting evidence, not a calibrated
singer-identification probability. Explicit provider annotations are preserved.
Unknown material stays unassigned instead of inventing singer identities.
"""
from contextlib import redirect_stdout
from collections import defaultdict
import hashlib
import importlib.util
import json
import math
import os
from pathlib import Path
import subprocess
import sys
import types
import time
import compute_runtime as compute

ROOT = Path(os.environ.get('XDG_DATA_HOME', str(Path.home() / '.local/share'))) / 'sekaipop/dock-equalizer'
REVISION = '8e750521b5942f4717656cac86a23cf0bd90dea5'
SOURCE = ROOT / ('unmixx-' + REVISION[:8])
EXTRAS = ROOT / 'multivoice-runtime/lib'
EMBEDDING = ROOT / 'models/campplus-zh-en.onnx'
MODEL_HASH = 'edd8bd0782f85ebb8a6b26bec47808b3130d15c2ccd49c741d2ff5983cb6c359'
SOURCE_HASH = '225c7a9e2ebb63cfe42be9737fa32fe86426bf0455f04aeb7cfb947281b9403b'
EMBEDDING_HASH = 'aa3cfc16963a10586a9393f5035d6d6b57e98d358b347f80c2a30bf4f00ceba2'
_MODEL = None
_EMBEDDER = None
_STEM_MODEL = None
_ALIGNER = None
STEM_MODEL = ROOT / "models/955717e8-8726e21a.th"
STEM_HASH = "8726e21a993978c7ba086d3872e7608d7d5bfca646ca4aca459ffda844faa8b4"


def _optional_path():
    # Read isolated optional packages without modifying the timing runtime.
    for directory in EXTRAS.glob('python*/site-packages'):
        if str(directory) not in sys.path:
            sys.path.append(str(directory))


def _hash(path):
    with path.open('rb') as source:
        return hashlib.file_digest(source, 'sha256').hexdigest()


def probe():
    _optional_path()
    ready = (SOURCE / 'ckpt/best.ckpt').is_file() and EMBEDDING.is_file()
    ready = ready and all(importlib.util.find_spec(name) for name in ('torch', 'numpy', 'sherpa_onnx'))
    return {'ready': bool(ready), 'backend': 'unmixx-campplus-local', 'device': compute.status()['device'],
            'maxSimultaneousVoices': 2, 'totalVoicesLimit': 16,
            'identityModelDomain': 'speech', 'automaticIdentityIsExperimental': True,
            'requiresVocalStemForReliableSeparation': True,
            'vocalStemReady': STEM_MODEL.is_file() and importlib.util.find_spec('demucs') is not None}


def _load_separator():
    global _MODEL
    if _MODEL is not None:
        return _MODEL
    import torch
    model_path = SOURCE / 'ckpt/best.ckpt'
    code_path = SOURCE / 'look2hear/models/unmixx_model.py'
    if _hash(model_path) != MODEL_HASH or _hash(code_path) != SOURCE_HASH:
        raise ValueError('UNMIXX model/source checksum mismatch; run setup-multivoice.py.')
    prefix = '_dock_multivoice_unmixx'
    package = types.ModuleType(prefix)
    package.__path__ = [str(SOURCE / 'look2hear/models')]
    sys.modules[prefix] = package
    layers = types.ModuleType(prefix + '.layers')
    layers.__path__ = [str(SOURCE / 'look2hear/models/layers')]
    sys.modules[layers.__name__] = layers
    base = types.ModuleType(prefix + '.base_model')
    class BaseModel(torch.nn.Module):
        def __init__(self, sample_rate, in_chan=1):
            super().__init__()
            self._sample_rate, self._in_chan = sample_rate, in_chan
    base.BaseModel = BaseModel
    sys.modules[base.__name__] = base
    # The pinned upstream returns a flattened [B*S,T] buffer before applying
    # source consistency. Use the already-computed [B,S,T] view instead.
    # Avoid importing its entire research/training dependency stack.
    code = code_path.read_text().replace('from asteroid.utils.torch_utils import pad_x_to_y', '')
    code = code.replace('from look2hear.models.layers import', 'from ' + prefix + '.layers import')
    code = code.replace('reconstructed = pad_x_to_y(output, input)', 'reconstructed = b')
    module = types.ModuleType(prefix + '.network')
    module.__package__ = prefix
    exec(compile(code, str(code_path), 'exec'), module.__dict__)
    torch.set_num_threads(compute.cpu_threads())
    with redirect_stdout(sys.stderr):
        model = module.UNMIXX(out_channels=128, in_channels=256, num_blocks=8,
                             upsampling_depth=5, win=960, stride=240,
                             num_sources=2, sample_rate=24000)
    checkpoint = torch.load(model_path, map_location='cpu', weights_only=True)
    state = checkpoint.get('state_dict', checkpoint)
    model.load_state_dict({key.removeprefix('audio_model.'): value for key, value in state.items()}, strict=True)
    _MODEL = model.eval()
    return _MODEL


def _embed(samples):
    global _EMBEDDER
    _optional_path()
    import numpy as np
    import sherpa_onnx
    if len(samples) < 16000 or float(np.mean(samples ** 2)) < 1e-7:
        return None
    if _EMBEDDER is None:
        if _hash(EMBEDDING) != EMBEDDING_HASH:
            raise ValueError('CAM++ checksum mismatch; run setup-multivoice.py.')
        config = sherpa_onnx.SpeakerEmbeddingExtractorConfig(model=str(EMBEDDING), num_threads=min(4,compute.cpu_threads()), provider='cpu')
        _EMBEDDER = sherpa_onnx.SpeakerEmbeddingExtractor(config)
    stream = _EMBEDDER.create_stream()
    stream.accept_waveform(sample_rate=16000, waveform=np.asarray(samples, dtype=np.float32))
    stream.input_finished()
    if not _EMBEDDER.is_ready(stream):
        return None
    result = np.asarray(_EMBEDDER.compute(stream), dtype=np.float32)
    norm = float(np.linalg.norm(result))
    return result / norm if norm > 1e-8 else None


def _decode(audio, sample_rate):
    import numpy as np
    path = Path(audio).resolve(strict=True)
    if not path.is_file() or path.stat().st_size > 2 * 1024 ** 3:
        raise ValueError('Expected a local regular audio file below 2 GiB.')
    command = ['ffmpeg', '-nostdin', '-v', 'error', '-protocol_whitelist', 'file,pipe',
               '-threads', str(min(4,compute.cpu_threads())), '-i', str(path), '-t', '1801', '-vn', '-ac', '1',
               '-ar', str(sample_rate), '-f', 'f32le', '-']
    result = subprocess.run(command, capture_output=True, check=True, timeout=120)
    samples = np.frombuffer(result.stdout, np.float32).copy()
    if not 0 < len(samples) <= sample_rate * 1800:
        raise ValueError('Audio must be between 0 and 1800 seconds.')
    return samples



def _load_stem_model():
    global _STEM_MODEL
    if _STEM_MODEL is None:
        _optional_path()
        import torch
        from demucs.states import load_model
        if _hash(STEM_MODEL) != STEM_HASH:
            raise ValueError('Demucs checksum mismatch; run setup-multivoice.py.')
        # The verified official checkpoint serializes its architecture class.
        package = torch.load(STEM_MODEL, map_location='cpu', weights_only=False)
        _STEM_MODEL = load_model(package).eval()
        torch.set_num_threads(compute.cpu_threads())
    return _STEM_MODEL


def vocal_window(audio, start, end, *, sample_rate=16000):
    """Actual music-trained vocal extraction, before any identity embedding.

    Return mono vocals for the exact requested window on the verified compute
    device, with a CPU retry if that stage cannot use CUDA. At most 30s.
    """
    _optional_path()
    import numpy as np
    import torch
    from demucs.apply import apply_model
    from scipy.signal import resample_poly
    start, end = max(0., float(start)), float(end)
    if not 0.5 <= end - start <= 30.:
        raise ValueError('Vocal windows must be between .5 and 30 seconds.')
    path = Path(audio).resolve(strict=True)
    command = ['ffmpeg', '-nostdin', '-v', 'error', '-protocol_whitelist', 'file,pipe',
               '-threads', str(min(4,compute.cpu_threads())), '-ss', str(start), '-i', str(path), '-t', str(end-start),
               '-vn', '-ac', '2', '-ar', '44100', '-f', 'f32le', '-']
    result = subprocess.run(command, capture_output=True, check=True, timeout=120)
    raw = np.frombuffer(result.stdout, np.float32).copy().reshape(-1, 2).T
    if raw.shape[-1] < 22050:
        raise ValueError('Vocal window is outside the audio.')
    model = _load_stem_model()
    mix = torch.from_numpy(raw)
    ref = mix.mean(0)
    center, scale = ref.mean(), ref.std().clamp_min(1e-6)
    normalized = (mix - center) / scale
    with torch.inference_mode():
        separated = compute.run('demucs',model,lambda device: apply_model(model, normalized.unsqueeze(0), shifts=0, split=True,
                                segment=4. if device.startswith('cuda') else 6., overlap=.25, progress=False, device=device))
    vocal = separated[0, model.sources.index('vocals')].mean(0).cpu().numpy() * float(scale)
    divisor = math.gcd(44100, sample_rate)
    return resample_poly(vocal, sample_rate // divisor, 44100 // divisor).astype(np.float32)


def extract_vocals(audio, destination, progress=None, cancelled=None):
    """Optional full-track preprocessor. Write a 24kHz PCM vocal WAV atomically."""
    import wave
    import numpy as np
    samples = _decode(audio, 16000)
    duration = len(samples) / 16000
    result = np.zeros(round(duration * 24000), dtype=np.float32)
    # Include context and retain only chunk centers to reduce boundary damage.
    for start in range(0, math.ceil(duration), 20):
        if cancelled and cancelled():
            raise InterruptedError('cancelled')
        left, right = max(0., start - 2.), min(duration, start + 22.)
        vocal = vocal_window(audio, left, right, sample_rate=24000)
        target_end = min(len(result), (start + 20) * 24000)
        offset = round((start - left) * 24000)
        result[start * 24000:target_end] = vocal[offset:offset + target_end - start * 24000]
        if progress:
            progress('voice_extracting_vocals', min(1., (start + 20) / duration))
    destination = Path(destination)
    temporary = destination.with_name(destination.name + '.partial')
    try:
        with wave.open(str(temporary), 'wb') as output:
            output.setnchannels(1)
            output.setsampwidth(2)
            output.setframerate(24000)
            output.writeframes((np.clip(result, -1., 1.) * 32767).astype('<i2').tobytes())
        temporary.replace(destination)
    finally:
        temporary.unlink(missing_ok=True)
    return destination

def separate_samples(samples_24k):
    """Return two LOCAL source candidates, never two guaranteed singers."""
    import numpy as np
    import torch
    if len(samples_24k) > 24000 * 8:
        raise ValueError('Separate short windows of at most 8 seconds.')
    if len(samples_24k) < 24000:
        raise ValueError('At least one second is required for source separation.')
    model = _load_separator()
    with torch.inference_mode():
        candidates = compute.run('unmixx',model,lambda device: model(torch.from_numpy(np.asarray(samples_24k, dtype=np.float32)).reshape(1, 1, -1).to(device)))[0]
    return candidates[0].cpu().numpy()


def separate_window(audio, start, end):
    """Integration helper: 16 kHz streams and source diagnostics for alignment."""
    _optional_path()
    from scipy.signal import resample_poly
    samples = _decode(audio, 24000)
    start, end = max(0., float(start)), min(len(samples) / 24000, float(end))
    candidates = separate_samples(samples[round(start * 24000):round(end * 24000)])
    return [resample_poly(source, 2, 3).astype('float32') for source in candidates]



def get_aligner():
    global _ALIGNER
    import stable_whisper
    if _ALIGNER is None:
        _ALIGNER = stable_whisper.load_model('base', device='cpu', download_root=str(ROOT / 'models'))
    compute.run('whisper',_ALIGNER,lambda device: None)
    return _ALIGNER


def _align_streams(streams, words, language):
    """Independent acoustic alignment, used only after singer/source evidence.

    Forced alignment can hallucinate supplied text. Require a usable absolute
    score AND a margin over the competing stream; otherwise return no winner.
    """
    global _ALIGNER
    import re
    import stable_whisper
    get_aligner()
    text = ' '.join(str(w.get('word', '')) for w in words)
    text = re.sub(r'[()\[\]{}]', '', text).strip()
    if not text:
        return None
    if not language or language == 'auto':
        import whisper
        mel = whisper.log_mel_spectrogram(whisper.pad_or_trim(streams[0]), n_mels=_ALIGNER.dims.n_mels)
        with redirect_stdout(sys.stderr):
            _, probabilities = compute.run('whisper',_ALIGNER,lambda device:_ALIGNER.detect_language(mel.to(device)))
        language = max(probabilities, key=probabilities.get)
        if float(probabilities[language]) < .40:
            return None
    results = []
    for index, stream in enumerate(streams):
        with redirect_stdout(sys.stderr):
            result = compute.run('whisper',_ALIGNER,lambda device:_ALIGNER.align_words(stream, [{'start': 0., 'end': len(stream)/16000, 'text': text}],
                language=language, verbose=None, regroup=False, suppress_silence=False, min_word_dur=.02))
        aligned = result.to_dict()['segments'][0].get('words', []) if result and result.segments else []
        valid = [word for word in aligned if float(word.get('end', 0)) > float(word.get('start', 0)) + .025]
        probabilities = [float(word.get('probability') or 0.) for word in valid]
        coverage = len(valid) / max(1, len(aligned))
        score = sum(probabilities)/max(1, len(probabilities)) * coverage
        results.append((score, index, aligned))
    results.sort(reverse=True)
    if results[0][0] < .48 or results[0][0] - results[1][0] < .13:
        return None
    return {'source': results[0][1], 'words': results[0][2],
            'score': results[0][0], 'margin': results[0][0] - results[1][0]}


def _complete_alignment(stream, words, language):
    """Return actual model bounds only for complete, exact reference mapping."""
    global _ALIGNER
    import re
    import stable_whisper
    get_aligner()
    if not language or language == 'auto':
        import whisper
        mel = whisper.log_mel_spectrogram(whisper.pad_or_trim(stream), n_mels=_ALIGNER.dims.n_mels)
        _, scores = compute.run('whisper',_ALIGNER,lambda device:_ALIGNER.detect_language(mel.to(device)))
        language = max(scores, key=scores.get)
        if float(scores[language]) < .4:
            return None
    text = re.sub(r'[()\[\]{}]', '', ' '.join(str(w.get('word', '')) for w in words)).strip()
    with redirect_stdout(sys.stderr):
        result = compute.run('whisper',_ALIGNER,lambda device:_ALIGNER.align_words(stream, [{'start': 0., 'end': len(stream)/16000, 'text': text}],
            language=language, verbose=None, regroup=False, suppress_silence=False, min_word_dur=.02))
    observed = [word for segment in result.to_dict()['segments'] for word in segment.get('words', [])] if result else []
    normalize = lambda text: re.sub(r'[^\w]', '', str(text)).casefold()
    if len(observed) != len(words) or any(normalize(a.get('word','')) != normalize(b.get('word',''))
                                          for a,b in zip(observed, words)):
        return None
    previous_end, probabilities = 0., []
    for word in observed:
        start, end = float(word['start']), float(word['end'])
        probability = float(word.get('probability') or 0.)
        if (not all(math.isfinite(value) for value in (start,end,probability))
            or not 0 <= start < end <= len(stream)/16000 + .025
            or end-start < .035 or end-start > 5. or start < previous_end - .025
            or probability < .15):
            return None
        probabilities.append(probability)
        previous_end = end
    score = sum(probabilities)/max(1,len(probabilities))
    return {'words': observed, 'score': score} if score >= .55 else None


def recover_unresolved(audio, document, plan=None, progress=None, cancelled=None,
                       *, budget_seconds=90, max_lines=10):
    """Retry missing timings using real vocal/source audio near supplied LRC.

    Never interpolate, insert, drop or rename reference words. An entire line
    must have exact token mapping, real positive ordered bounds and sufficient
    model scores before any of its missing timings are replaced.
    """
    _optional_path()
    deadline = time.monotonic() + max(5., min(180., float(budget_seconds)))
    events = (plan or {}).get('events', [])
    segments = document.get('source_segments', [])
    duration = float(document.get('duration') or len(_decode(audio,16000))/16000)
    groups = _line_groups(document)
    unresolved = lambda word: word.get('status') == 'unresolved' or float(word['end']) <= float(word['start'])
    suspects = [words for words in groups if any(unresolved(word) for word in words)]
    suspects.sort(key=lambda words: -sum(unresolved(word) for word in words))
    stats = {'attemptedLines':0, 'recoveredLines':0, 'recoveredWords':0,
             'remainingWords':sum(unresolved(word) for words in groups for word in words),
             'budgetSeconds':budget_seconds, 'budgetLimited':False, 'exactMappingRequired':True,
             'maxLines':max_lines, 'lineLimitReached':len(suspects)>max_lines}
    if not suspects:
        stats['status'] = 'not-needed'
        document['voiceRecovery'] = stats
        return document
    if not probe()['ready'] or not probe()['vocalStemReady']:
        stats['status'] = 'unavailable'
        document['voiceRecovery'] = stats
        return document
    from scipy.signal import resample_poly
    for count, words in enumerate(suspects[:max(0,min(10,int(max_lines)))]):
        if cancelled and cancelled():
            raise InterruptedError('cancelled')
        if time.monotonic() >= deadline:
            stats['budgetLimited'] = True
            break
        line = int(words[0].get('line',-1))
        if not 0 <= line < max(len(events),len(segments)):
            continue
        event = events[line] if line < len(events) else {}
        source = segments[line] if line < len(segments) else {}
        anchor = float(source.get('start', event.get('t', min(float(w['start']) for w in words))))
        global_end = source.get('end')
        if global_end is None:
            global_end = next((float(e['t']) for e in events[line+1:] if float(e['t']) > anchor+.025), duration)
        global_end = float(global_end)
        ids = set(event.get('voiceIds', [])) - {'unassigned'}
        same_end = next((float(e['t']) for e in events[line+1:]
                         if ids and ids == set(e.get('voiceIds',[])) and float(e['t']) > anchor+.1), duration)
        # A dense duet can have another lyric line before this singer finishes.
        # The estimate sets an audio search window only; accepted word bounds
        # always come from the model and must pass complete acoustic validation.
        search_end = max(global_end, min(same_end, anchor + max(1.2,len(words)*.6)))
        left = max(0., anchor-1.)
        right = min(duration, left+8., max(anchor+1.,search_end+1.))
        if right-left < .6:
            continue
        if progress:
            progress('voice_recovering_words', count/max(1,min(len(suspects),max_lines)))
        stats['attemptedLines'] += 1
        vocal24 = vocal_window(audio,left,right,sample_rate=24000)
        vocal16 = resample_poly(vocal24,2,3).astype('float32')
        candidate = _complete_alignment(vocal16,words,document.get('language'))
        method = 'multivoice-vocal-alignment'
        if candidate is None and time.monotonic() < deadline:
            streams = separate_samples(vocal24)
            for stream in streams:
                if cancelled and cancelled():
                    raise InterruptedError('cancelled')
                if time.monotonic() >= deadline:
                    stats['budgetLimited'] = True
                    break
                trial = _complete_alignment(resample_poly(stream,2,3).astype('float32'),words,document.get('language'))
                if trial and (candidate is None or trial['score'] > candidate['score']):
                    candidate,method = trial,'multivoice-source-alignment'
        if candidate is None:
            continue
        observed = candidate['words']
        first = left + float(observed[0]['start'])
        last = left + float(observed[-1]['end'])
        if first < anchor-1. or last <= anchor-.25 or last > duration+.001:
            continue
        for word, aligned in zip(words,observed):
            was_missing = unresolved(word)
            word['start'] = round(left+float(aligned['start']),3)
            word['end'] = round(left+float(aligned['end']),3)
            word['score'] = round(float(aligned.get('probability') or 0.),4)
            word['status'] = 'review'
            word['recovery'] = method
            word['voiceReviewRequired'] = True
            if was_missing:
                stats['recoveredWords'] += 1
        stats['recoveredLines'] += 1
    stats['remainingWords'] = sum(unresolved(word) for word in document.get('words',[]))
    stats['status'] = 'recovered' if stats['recoveredWords'] else 'unresolved'
    document['voiceRecovery'] = stats
    if progress:
        progress('voice_recovering_words',1.)
    return document

def _line_groups(document):
    groups = defaultdict(list)
    for word in document.get('words', []):
        groups[word.get('line', 0)].append(word)
    return list(groups.values())


def _span(words):
    return min(float(w['start']) for w in words), max(float(w['end']) for w in words)


def _prototype(embeddings):
    import numpy as np
    if not embeddings:
        return None
    matrix = np.stack(embeddings)
    similarities = matrix @ matrix.T
    medoid = int(np.argmax(np.median(similarities, axis=1)))
    consistent = matrix[similarities[medoid] >= .55]
    if not len(consistent):
        return None
    mean = consistent.mean(axis=0)
    return mean / np.linalg.norm(mean)


def _best(embedding, prototypes):
    if embedding is None or not prototypes:
        return None, 0., 0.
    scores = sorted(((float(embedding @ value), key) for key, value in prototypes.items()), reverse=True)
    similarity, identity = scores[0]
    runner_up = scores[1][0] if len(scores) > 1 else 0.
    return identity, similarity, similarity - runner_up


def _clips(samples, start, end):
    """Several independent short observations, not one timbre average per song."""
    start, end = max(0., start), min(len(samples) / 16000, end)
    if end - start < .6:
        return []
    if end - start < 1.2:
        # Repeat observed audio only to satisfy the embedding frontend length.
        # This adds no singer/text evidence; these results still require review.
        import numpy as np
        clip = samples[round(start * 16000):round(end * 16000)]
        return [np.tile(clip, math.ceil(1.2 / (end - start)))]
    starts = [start]
    if end - start > 4.5:
        starts.append((start + end - 3.) / 2)
    if end - start > 7.:
        starts.append(end - 3.)
    return [samples[round(t * 16000):round(min(end, t + 3.) * 16000)] for t in starts]


def assign_voices(audio, document, progress=None, cancelled=None, *, vocal_stem=False,
                  separate_ambiguous=True, preprocess=False, budget_seconds=480):
    """Augment a timing document. Explicit annotation seeds always win.

    Fields: voices[{id,label}], words[].voiceIds, voiceConfidence,
    voiceSource, voiceReviewRequired; document.voiceEvidence describes limits.
    'unassigned' means no reliable singer identity. Time/text are unchanged.
    For known labels supply voiceSource='annotation' on solo seed words.
    Explicit All/unison words may have multiple IDs and an unisonId.
    """
    _optional_path()
    import numpy as np
    deadline = time.monotonic() + max(15., min(900., float(budget_seconds)))
    budget_limited = False
    last_fraction = 0.
    def tick(phase, fraction):
        nonlocal last_fraction
        last_fraction = max(last_fraction, min(1., float(fraction)))
        if cancelled and cancelled():
            raise InterruptedError('cancelled')
        if progress:
            progress(phase, last_fraction)
    tick('voice_loading', 0.)
    if not probe()['ready']:
        document['voiceEvidence'] = {**probe(), 'status': 'unavailable', 'reviewRequired': True}
        return document
    samples = _decode(audio, 16000)
    groups = _line_groups(document)
    vocal_cache = {}
    def clips_for(start, end):
        nonlocal budget_limited
        if time.monotonic() >= deadline:
            budget_limited = True
            return []
        if preprocess and not vocal_stem:
            # Keep .25s context for the music separator, then trim it away.
            left, right = max(0., start - .25), min(len(samples)/16000, end + .25)
            if right - left < .6:
                return []
            key = (round(left, 3), round(min(right, left + 8.), 3))
            if key not in vocal_cache:
                tick('voice_extracting_vocals', .1)
                vocal_cache[key] = vocal_window(audio, *key)
            clip = vocal_cache[key]
            offset = round((start - left) * 16000)
            clip = clip[offset:offset + round((end - start) * 16000)]
            return _clips(clip, 0., len(clip)/16000)
        return _clips(samples, start, end)
    names = {str(v['id']): dict(v) for v in document.get('voices', []) if v.get('id') != 'unassigned'}
    exemplars = defaultdict(list)
    seed_groups = defaultdict(list)
    for words in groups:
        identities = {str(w['voiceIds'][0]) for w in words if w.get('voiceSource') in ('annotation','manual','import')
                      and len(w.get('voiceIds', [])) == 1 and w['voiceIds'][0] != 'unassigned'}
        if len(identities) != 1 or any(len(w.get('voiceIds', [])) > 1 for w in words):
            continue
        identity = identities.pop()
        seed_groups[identity].append(words)
    for identity, lines in seed_groups.items():
        # Spread exemplars across the song to reduce pitch/production bias.
        indices = sorted(set(round(i * (len(lines) - 1) / min(2, len(lines) - 1)) for i in range(min(3, len(lines))))) if len(lines) > 1 else [0]
        for index in indices:
            for clip in clips_for(*_span(lines[index])):
                embedding = _embed(clip)
                if embedding is not None:
                    exemplars[identity].append(embedding)
        tick('voice_exemplars', .12)
    prototypes = {identity: _prototype(values) for identity, values in exemplars.items()}
    prototypes = {identity: value for identity, value in prototypes.items() if value is not None}
    anonymous = []
    observations = []
    for index, words in enumerate(groups):
        start, end = _span(words)
        if any(w.get('voiceSource') in ('annotation','manual','import') for w in words):
            for word in words:
                if word.get('voiceSource') in ('annotation','manual','import'):
                    word['voiceConfidence'] = 1.
                    word['voiceReviewRequired'] = False
            continue
        vectors = [e for clip in clips_for(start, end) if (e := _embed(clip)) is not None]
        vector = _prototype(vectors)
        observations.append((words, vector, start, end))
        if not prototypes and vector is not None and (vocal_stem or preprocess):
            anonymous.append((words, vector, start, end))
        tick('voice_identifying', .12 + .50 * (index + 1) / max(1, len(groups)))
    if not prototypes and anonymous:
        # Complete-link acoustic clustering. A singleton does not become a singer.
        clusters = []
        for item in anonymous:
            matches = [(min(float(item[1] @ other[1]) for other in cluster), i)
                       for i, cluster in enumerate(clusters)]
            score, cluster_index = max(matches, default=(0., -1))
            if score >= .68:
                clusters[cluster_index].append(item)
            else:
                clusters.append([item])
        supported = [cluster for cluster in clusters if len(cluster) >= 3
                     and sum(min(3., row[3] - row[2]) for row in cluster) >= 6.]
        for index, cluster in enumerate(supported[:15]):
            identity = 'acoustic-' + str(index + 1)
            prototypes[identity] = _prototype([row[1] for row in cluster])
            names[identity] = {'id': identity, 'label': 'Голос ' + str(index + 1),
                               'source': 'acoustic-cluster', 'reviewRequired': True}
    separation_count = 0
    aligned_count = 0
    assigned = 0
    annotation_spans = [_span(line) for line in groups if any(w.get('voiceSource') in ('annotation','manual','import') for w in line)]
    for index, (words, vector, start, end) in enumerate(observations):
        identity, similarity, margin = _best(vector, prototypes)
        reliable = (vocal_stem or preprocess) and similarity >= .58 and margin >= .12
        evidence = 'embedding'
        stream_alignment = None
        overlaps_known = any(min(end, right) - max(start, left) >= .12 for left, right in annotation_spans)
        # Full musical mixes are outside UNMIXX's vocal-mixture training domain.
        # Run only on a real vocal stem, and only if a single identity dominates.
        # Both streams being active never implies unison or separate lyrics.
        if (not reliable or overlaps_known) and (vocal_stem or preprocess) and separate_ambiguous and prototypes and .6 <= end - start <= 8. and separation_count < 24 and time.monotonic() < deadline:
            separation_start = max(0., start - .8)
            separation_end = min(len(samples)/16000, max(end + .8, separation_start + 3.))
            separation_end = min(separation_end, separation_start + 8.)
            reliable = False
            if vocal_stem:
                streams = separate_window(audio, separation_start, separation_end)
            else:
                from scipy.signal import resample_poly
                vocal24 = vocal_window(audio, separation_start, separation_end, sample_rate=24000)
                streams = [resample_poly(stream, 2, 3).astype('float32') for stream in separate_samples(vocal24)]
            candidates = []
            for stream_index, stream in enumerate(streams):
                candidate = _best(_embed(stream), prototypes)
                energy = float(np.mean(stream ** 2))
                candidates.append((*candidate, energy, stream_index))
            valid = [row for row in candidates if row[1] >= .64 and row[2] >= .15]
            # A two-singer window needs lyric-to-stream alignment by the caller.
            # Do not assign the entire mixed lyric line to whichever is louder.
            distinct = {row[0] for row in valid}
            if all(row[3] > 1e-7 for row in candidates):
                alignment = _align_streams(streams, words, document.get('language'))
                if alignment:
                    # Text-to-source evidence and singer identity are separate.
                    # Keep strong timing evidence even if the singer stays unknown.
                    stream_alignment = alignment
                    evidence = 'separated-lyric-alignment'
                    aligned_count += 1
                    candidate = candidates[alignment['source']]
                    if candidate[1] >= .64 and candidate[2] >= .15:
                        identity, similarity, margin = candidate[:3]
                        reliable = True
            if len(distinct) > 1:
                for word in words:
                    word['voiceCandidates'] = sorted(distinct)
                    word['voiceOverlapPossible'] = True
            separation_count += 1
        for word in words:
            if word.get('voiceSource') in ('annotation','manual','import'):
                continue
            if stream_alignment:
                aligned_words = stream_alignment['words']
                position = words.index(word)
                if len(aligned_words) == len(words):
                    import re
                    candidate_word = aligned_words[position]
                    normalize = lambda text: re.sub(r'[^\w]', '', str(text)).lower()
                    if normalize(candidate_word.get('word', '')) == normalize(word.get('word', '')):
                        word['voiceAlignedStart'] = round(separation_start + float(candidate_word['start']), 3)
                        word['voiceAlignedEnd'] = round(separation_start + float(candidate_word['end']), 3)
                word['voiceTextScore'] = round(stream_alignment['score'], 3)
                word['voiceTextMargin'] = round(stream_alignment['margin'], 3)
                word['voiceOverlapPossible'] = bool(overlaps_known)
            word['voiceIds'] = [identity] if reliable else ['unassigned']
            # Similarity is explicitly NOT an empirical identification probability.
            word['voiceConfidence'] = round(max(0., min(.85, similarity)) if reliable else 0., 3)
            word['voiceSimilarity'] = round(similarity, 3)
            word['voiceSource'] = 'acoustic' if reliable else 'unassigned'
            word['voiceMethod'] = evidence if reliable or stream_alignment else 'unassigned'
            word['voiceReviewRequired'] = True
            if reliable:
                assigned += 1
        tick('voice_identifying', .64 + .35 * (index + 1) / max(1, len(observations)))
    if any('unassigned' in w.get('voiceIds', []) for w in document.get('words', [])):
        names['unassigned'] = {'id': 'unassigned', 'label': 'Вокальная партия · не определена'}
    if not names:
        names['unassigned'] = {'id': 'unassigned', 'label': 'Общий вокал'}
    document['voices'] = list(names.values())
    document['voiceEvidence'] = {**probe(), 'status': 'estimated' if assigned else 'annotations-only' if seed_groups else 'uncertain',
        'revision': REVISION, 'seededIdentities': len(prototypes), 'assignedWords': assigned,
        'separatedWindows': separation_count, 'sourceAlignedLines': aligned_count, 'vocalStem': bool(vocal_stem or preprocess),
        'preprocessedWindows': len(vocal_cache), 'budgetLimited': budget_limited,
        'budgetSeconds': budget_seconds, 'vocalStemModel': 'htdemucs' if preprocess else None,
        'confidenceMeaning': 'cosine similarity, not calibrated probability',
        'unisonPolicy': 'explicit-provider-annotation-only',
        'overlappingDifferentLyrics': 'two-source lyric alignment with acoustic identity; ambiguous words remain unassigned',
        'reviewRequired': bool(observations),
        'limitations': ['UNMIXX has two output streams, not an arbitrary singer count.',
                       'Speech-trained embeddings can confuse singing registers and effects.',
                       'Instrumental mixes are not treated as isolated vocal sources.']}
    tick('voice_done', 1.)
    return document


def main():
    python = ROOT / 'runtime/bin/python'
    if python.is_file() and Path(sys.prefix).resolve() != python.parent.parent.resolve():
        os.execve(str(python), [str(python), str(Path(__file__).resolve()), *sys.argv[1:]], os.environ)
    if len(sys.argv) == 2 and sys.argv[1] == 'probe':
        print(json.dumps(probe(), ensure_ascii=False))
        return
    request = json.loads(sys.stdin.readline(2 * 1024 ** 2))
    document = assign_voices(request['audio'], request['document'], vocal_stem=bool(request.get('vocalStem')), preprocess=bool(request.get('preprocess')),
        progress=lambda phase, fraction: print(json.dumps({'type': 'progress', 'phase': phase, 'fraction': fraction}), flush=True))
    print(json.dumps({'type': 'result', 'ok': True, 'document': document}, ensure_ascii=False, allow_nan=False))

if __name__ == '__main__':
    main()
