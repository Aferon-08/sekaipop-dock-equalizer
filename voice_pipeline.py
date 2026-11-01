"""Full-track vocal evidence and independent text for two-source overlaps.

Unknown identities remain explicitly uncertain. A separator output index is never
used as a global singer ID. Temporary stems are removed even on cancellation.
"""
from collections import defaultdict
from contextlib import redirect_stdout
from difflib import SequenceMatcher
import copy
import importlib
import math
from pathlib import Path
import re
import sys
import tempfile
import time
import compute_runtime as compute

REVISION = 3


def normalized(text):
    return re.sub(r'[^\w]+', ' ', str(text)).strip().casefold()


def phrases(document):
    groups = defaultdict(list)
    for word in document.get('words', []): groups[word['line']].append(word)
    return list(groups.values())


def finalise(document):
    """Keep source identity, phrase role and presentation separate."""
    for word in document.get('words', []):
        if not word.get('voiceIds'):
            word.update(voiceIds=['unassigned'],voiceSource='unassigned',voiceConfidence=0.)
    for line in document.get('fallbackLines', []):
        if not line.get('voiceIds'): line['voiceIds']=['unassigned']
    groups = phrases(document)
    first = {}
    for group in groups:
        for identity in group[0].get('voiceIds', []):
            first[identity] = min(first.get(identity, math.inf), group[0]['start'])
    for line in document.get('fallbackLines', []):
        for identity in line.get('voiceIds', []): first[identity] = min(first.get(identity, math.inf), line['t'])
    voices = document.setdefault('voices', [])
    for identity in first:
        if not any(v['id'] == identity for v in voices): voices.append(dict(id=identity, label=''))
    voices.sort(key=lambda v: (first.get(v['id'], math.inf), v['id']))
    for index, voice in enumerate(voices):
        if (not voice.get('label') or voice['id'] == 'unassigned'
                or re.match(r'^(?:acoustic|voice|speaker)[-_.\d]', voice['id'])
                or re.match(r'^(?:Голос \d+|Неопредел|Общий вокал|Вокальная партия)', voice.get('label', ''))):
            voice['label'] = 'Голос ' + str(index + 1)
    # An echo is short AND repeats another phrase. Parentheses are only a hint.
    # Different simultaneous text remains an independent counterpoint lane.
    for group in groups:
        source = group[0]
        if len(source.get('voiceIds', [])) > 1:
            for word in group: word['role'] = 'unison'
            continue
        start, end = group[0]['start'], max(w['end'] for w in group)
        own = normalized(' '.join(w['word'] for w in group)).split()
        candidates = [other for other in groups if other is not group
            and other[0].get('voiceIds') != source.get('voiceIds')
            and other[0]['start'] <= start + .15
            and max(w['end'] for w in other) > start - .6]
        if not candidates: continue
        main = max(candidates, key=lambda row: len(row))
        text = normalized(' '.join(w['word'] for w in main)).split()
        repeated = len(set(own) & set(text)) / max(1, len(set(own)))
        echo = (end-start <= 3.2 and len(own)<=6 and len(own)<len(text) and repeated>=.7)
        explicit_adlib = all(w.get('voice')=='backing' for w in group)
        echo = echo or (explicit_adlib and end-start<=2.5 and len(own)<=5
            and len(text)>=max(4,len(own)*1.5) and min(end,max(w['end'] for w in main))-start>=.25)
        for word in group:
            word['role'] = 'backing' if echo else 'parallel'
            if echo and main[0].get('voiceIds'): word['hostVoiceId'] = main[0]['voiceIds'][0]
    return document


def shared_phrase(group, observation, prototypes):
    """Independent singers, same words and tight timing; energy is insufficient."""
    identity = observation.get('id')
    current = group[0].get('voiceIds', [])
    if not current or identity in current or observation['confidence'] < .80: return False
    if any(w.get('voiceSource')=='annotation' for w in group): return False
    if identity not in prototypes or any(v not in prototypes for v in current): return False
    if any(float(prototypes[identity] @ prototypes[v]) >= .55 for v in current): return False
    observed = observation['words']
    if len(observed) != len(group): return False
    if any(normalized(a['word']) != normalized(b['word']) for a,b in zip(group,observed)): return False
    errors = [abs(a['start']-b['start']) for a,b in zip(group,observed)]
    return max(errors,default=1.) <= .30 and sum(errors)/max(1,len(errors)) <= .18


def analyze(audio, document, progress=None, budget_seconds=1350, progress_detail=None):
    engine = importlib.import_module('multivoice-engine')
    if not engine.probe()['ready'] or not engine.probe()['vocalStemReady']:
        document['voiceEvidence'] = dict(status='unavailable', message='Модели голосов не подготовлены.')
        return finalise(document)
    engine._optional_path()
    import numpy as np
    from scipy.signal import resample_poly
    deadline = time.monotonic() + budget_seconds
    def tick(phase, fraction):
        if progress: progress(phase, fraction)
    folder = engine.ROOT / 'audio-tmp'
    folder.mkdir(parents=True, exist_ok=True, mode=0o700)
    with tempfile.TemporaryDirectory(prefix='voices-', dir=folder) as temporary:
        vocal = Path(temporary) / 'vocals.wav'
        engine.extract_vocals(audio, vocal, progress=lambda phase, f: tick(phase, f * .4))
        # One full vocal extraction supplies both diarization and transcription.
        # Repeated per-line Demucs windows used to exhaust the analysis budget.
        document = engine.assign_voices(vocal, document, vocal_stem=True,
            separate_ambiguous=False, budget_seconds=max(15, deadline-time.monotonic()),
            progress=lambda phase,f: tick(phase, .4 + f*.15))
        samples = engine._decode(vocal, 24000)
        original_groups = phrases(document)
        prototypes = {}
        for voice in document.get('voices', []):
            if voice['id'] == 'unassigned': continue
            rows = [g for g in original_groups if g[0].get('voiceIds') == [voice['id']]
                and max(w['end'] for w in g) - g[0]['start'] >= 1.2]
            vectors = []
            for row in rows[:4]:
                a,b = row[0]['start'], min(max(w['end'] for w in row), row[0]['start']+4)
                vector = engine._embed(resample_poly(samples[round(a*24000):round(b*24000)],2,3).astype('float32'))
                if vector is not None: vectors.append(vector)
            prototype = engine._prototype(vectors)
            if prototype is not None: prototypes[voice['id']] = prototype
        engine.get_aligner()
        observations = []
        windows = 0
        # Overlapping windows cover every part, including omitted intro vocals.
        # Only their central ownership intervals commit words, avoiding duplicates.
        for start in np.arange(0., document['duration'], 6.):
            if time.monotonic() >= deadline: break
            end = min(document['duration'], start + 8.)
            if end-start < 1.: break
            mix = samples[round(start*24000):round(end*24000)]
            if float(np.mean(mix**2)) < 1e-7:
                tick('voice_transcribing', .55+.42*min(1,end/document['duration']))
                if progress_detail:progress_detail(dict(processedSeconds=end,audioSeconds=document['duration'],windowDone=int(start//6)+1,windowTotal=math.ceil(document['duration']/6)))
                continue
            streams24 = engine.separate_samples(mix)
            streams = [resample_poly(s,2,3).astype('float32') for s in streams24]
            energies = [float(np.mean(s**2)) for s in streams]
            for source, stream in enumerate(streams):
                if energies[source] < max(1e-7, max(energies)*.025): continue
                with redirect_stdout(sys.stderr):
                    result = compute.run('whisper',engine.get_aligner(),lambda device: engine._ALIGNER.transcribe(stream, language=document.get('language') or None,
                        verbose=None, fp16=device.startswith('cuda'), condition_on_previous_text=False,
                        temperature=0., word_timestamps=True, regroup=False))
                for segment in result.to_dict().get('segments', []):
                    words = segment.get('words', [])
                    if not words or segment.get('no_speech_prob',0) > .45 or segment.get('avg_logprob',0) < -.8: continue
                    if segment.get('compression_ratio',0) > 2.4: continue
                    confidence = sum(float(w.get('probability') or 0) for w in words)/len(words)
                    if confidence < .65: continue
                    accepted = [dict(word=w['word'].strip(), start=round(start+float(w['start']),3),
                                     end=round(min(document['duration'], start+float(w['end'])),3))
                        for w in words if float(w.get('probability') or 0) >= .4
                        and any(c.isalnum() for c in w['word'])
                        and start+float(w['start']) < min(document['duration'],start+float(w['end']))
                        and float(w['end']) > float(w['start'])+.035
                        and (float(w['start'])+float(w['end']))/2 < (6. if end<document['duration'] else 8.)]
                    if len(accepted)<2 or len(accepted)<len(words)*.8: continue
                    left,right = max(0.,accepted[0]['start']-start), min(len(stream)/16000,accepted[-1]['end']-start)
                    vector = engine._embed(stream[round(left*16000):round(right*16000)])
                    observations.append(dict(words=accepted, vector=vector, confidence=confidence, window=windows))
            windows += 1
            tick('voice_transcribing', .55 + .42*min(1,end/document['duration']))
            if progress_detail:progress_detail(dict(processedSeconds=end,audioSeconds=document['duration'],windowDone=int(start//6)+1,windowTotal=math.ceil(document['duration']/6)))
        # Join stream observations by acoustic identity, not source output index.
        clusters = []
        for row in observations:
            vector = row['vector']
            if vector is None: continue
            identity,score,margin = engine._best(vector, prototypes)
            if score >= .60 and margin >= .12:
                row['id'] = identity
                continue
            matches = [(float(vector @ engine._prototype([r['vector'] for r in cluster])),i)
                       for i,cluster in enumerate(clusters)]
            score,index = max(matches, default=(0.,-1))
            if score >= .68: clusters[index].append(row)
            else: clusters.append([row])
        anonymous_count = len(document.get('voices', []))
        for cluster in clusters:
            if len({r['window'] for r in cluster}) < 3 or sum(r['words'][-1]['end']-r['words'][0]['start'] for r in cluster)<6: continue
            if anonymous_count >= 15: break
            anonymous_count += 1
            identity = 'stream-' + str(anonymous_count)
            document['voices'].append(dict(id=identity,label='Голос '+str(anonymous_count)))
            prototypes[identity] = engine._prototype([r['vector'] for r in cluster])
            for row in cluster: row['id']=identity
        added = 0
        unisons = 0
        next_line = max([w['line'] for w in document['words']]+[l['line'] for l in document.get('fallbackLines',[])]+[0])+1
        for row in observations:
            if not row.get('id'): continue
            words=row['words']; text=normalized(' '.join(w['word'] for w in words))
            candidates=[g for g in original_groups if min(words[-1]['end'],max(w['end'] for w in g))-max(words[0]['start'],g[0]['start'])>.2]
            matching = sorted([(SequenceMatcher(None,text,normalized(' '.join(w['word'] for w in g))).ratio(),i)
                               for i,g in enumerate(candidates)],reverse=True)
            if matching and matching[0][0] >= .60:
                group=candidates[matching[0][1]]
                # Strong observed text can identify an unresolved existing line.
                if all(w.get('voiceSource') != 'annotation' for w in group):
                    for word in group:
                        if word.get('voiceIds') in ([],None,['unassigned']):
                            word.update(voiceIds=[row['id']],voiceSource='acoustic',voiceConfidence=row['confidence'],voiceReviewRequired=True)
                if shared_phrase(group,row,prototypes):
                    identities=sorted(set(group[0]['voiceIds']+[row['id']]))
                    for word in group:
                        word.update(voiceIds=identities,unisonId='acoustic-unison-'+str(word['line']),role='unison')
                    unisons += 1
                continue
            if len(text.split())<3 or row['confidence']<.75: continue
            # Reject repeated/reverberated variants and duplicates from overlaps.
            prior=phrases(document)
            if any(abs(g[0]['start']-words[0]['start'])<2 and SequenceMatcher(None,text,normalized(' '.join(w['word'] for w in g))).ratio()>.55 for g in prior): continue
            for word in words:
                word.update(line=next_line,voiceIds=[row['id']],voiceSource='acoustic',voiceConfidence=row['confidence'],
                            voiceReviewRequired=True,status='review',role='parallel')
                document['words'].append(word)
            next_line+=1;added+=1
        from singing_identity import stabilize
        from parallel_phrases import recover, restore_backgrounds
        document=stabilize(document,vocal,progress=lambda p,f:tick(p,.975+f*.01))
        document=recover(audio,document,document.get('_sourceLyrics',''),vocal=vocal,
            progress=lambda p,f:tick(p,.985+f*.01))
        document=restore_backgrounds(document,document.get('_sourceLyrics',''))
        document.setdefault('voiceEvidence',{}).update(independentTextLines=added, detectedUnisons=unisons, transcribedWindows=windows,
            unisonPolicy="provider or stable distinct identities with matching text and word timing",
            budgetLimited=time.monotonic()>=deadline, fullScan=bool(windows and end>=document['duration']-1),
            textModel='Whisper base; independent per-source recognition', revision=REVISION)
    return finalise(document)
