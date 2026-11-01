"""Recover inline counterpoint only when two acoustic streams support it."""
from collections import defaultdict
from contextlib import redirect_stdout
import importlib
import itertools
import re
import sys


def norm(text): return re.sub(r'[^\w]+',' ',str(text)).strip().casefold()


def candidates(lyrics,duration):
    records=[]
    for raw in str(lyrics).splitlines():
        times=re.findall(r'\[(\d+):(\d{2}(?:\.\d+)?)\]',raw)
        body=re.sub(r'\[\d+:\d{2}(?:\.\d+)?\]|<\d+:\d{2}(?:\.\d+)?>','',raw).strip()
        for m,s in times: records.append(dict(t=int(m)*60+float(s),text=body))
    records.sort(key=lambda r:r['t'])
    result=[]
    for i,row in enumerate(records):
        echoes=re.findall(r'[（(]([^()（）]+)[)）]',row['text'])
        main=re.sub(r'[（(][^()（）]+[)）]','',row['text']).strip()
        if len(echoes)!=1 or not main or not norm(main) or not norm(echoes[0]):continue
        if norm(main)==norm(echoes[0]):continue
        end=records[i+1]['t'] if i+1<len(records) else duration
        if .5<=end-row['t']<=7.2:
            result.append(dict(t=row['t'],end=end,text=row['text'],parts=[main,echoes[0]]))
    return result


def source_fallback(result,rows,verified):
    established=[v['id'] for v in result.get('voices',[]) if v['id']!='unassigned']
    pending=[r for r in rows if not any(p['row'] is r for p in verified)]
    if len(established)<2:return result,0
    original=defaultdict(list)
    for w in result['words']:original[w['line']].append(w)
    next_line=max([w['line'] for w in result['words']]+[l['line'] for l in result.get('fallbackLines',[])]+[0])+1
    count=0
    last_end=-100;block_primary=None;block_secondary=None
    for r in pending:
        matched=[g for g in original.values() if norm(' '.join(w['word'] for w in g))==norm(r['text']) and abs(g[0]['start']-r['t'])<2]
        line=next((l for l in result.get('fallbackLines',[]) if norm(l['text'])==norm(r['text']) and abs(l['t']-r['t'])<.1),None)
        if not matched and line is None:continue
        main=(matched[0][0].get('voiceIds') if matched else line.get('voiceIds')) or [established[0]]
        primary=main[0] if main[0] in established else established[0]
        if r['t']-last_end<2 and block_primary in established:
            primary=block_primary
        else:
            context=[g for g in original.values() if g[-1]['end']<=r['t']+.1
                and r['t']-g[-1]['end']<8 and len(g)>=3
                and '(' not in ' '.join(w['word'] for w in g)
                and g[0].get('voiceIds',[None])[0] in established]
            if context:primary=max(context,key=lambda g:g[-1]['end'])[0]['voiceIds'][0]
        others=[g for g in original.values() if g[0].get('voiceIds',[None])[0] in established and g[0]['voiceIds'][0]!=primary]
        secondary=min(others,key=lambda g:abs(g[0]['start']-r['t']))[0]['voiceIds'][0] if others else next(v for v in established if v!=primary)
        if r['t']-last_end<2 and block_secondary in established:secondary=block_secondary
        block_primary,block_secondary,last_end=primary,secondary,r['end']
        removed={g[0]['line'] for g in matched}
        result['words']=[w for w in result['words'] if w['line'] not in removed]
        result['fallbackLines']=[l for l in result.get('fallbackLines',[]) if l is not line]
        for text,identity in zip(r['parts'],[primary,secondary]):
            result.setdefault('fallbackLines',[]).append(dict(line=next_line,t=r['t'],end=r['end'],text=text,voiceIds=[identity],role='parallel'))
            next_line+=1
        count+=1
    return result,count

def recover(audio,document,lyrics,vocal=None,progress=None):
    engine=importlib.import_module('multivoice-engine');engine._optional_path()
    import numpy as np
    from scipy.signal import resample_poly
    rows=candidates(lyrics,document['duration'])
    if not rows:return document
    # No text split is committed until both phrases independently choose
    # DIFFERENT separated streams and have complete positive word bounds.
    samples=engine._decode(vocal,24000) if vocal else None
    pairs=[]
    for index,row in enumerate(rows[:32]):
        start=max(0,row['t']-.3);end=min(document['duration'],row['end']+.3,start+8.)
        signal=samples[round(start*24000):round(end*24000)] if samples is not None else engine.vocal_window(audio,start,end,sample_rate=24000)
        streams=[resample_poly(s,2,3).astype('float32') for s in engine.separate_samples(signal)]
        parts=[]
        for text in row['parts']:
            reference=[{'word':w} for w in text.split() if norm(w)]
            with redirect_stdout(sys.stderr): hit=engine._align_streams(streams,reference,document.get('language'))
            if not hit:break
            observed=hit['words']
            if len(reference)!=len(observed) or any(norm(a['word'])!=norm(b['word']) for a,b in zip(reference,observed)):break
            if any(not 0<=float(w['start'])<float(w['end'])<=len(streams[0])/16000+.02 for w in observed):break
            vector=engine._embed(streams[hit['source']])
            if vector is None:break
            parts.append(dict(words=[dict(word=w['word'].strip(),start=round(start+float(w['start']),3),end=round(start+float(w['end']),3)) for w in observed],
                              vector=vector,source=hit['source'],score=hit['score']))
        if len(parts)==2 and parts[0]['source']!=parts[1]['source']:
            pairs.append(dict(row=row,parts=parts))
        if progress:progress('voice_parallel_phrases',(index+1)/max(1,min(32,len(rows))))
    if not pairs:
        document,fallbacks=source_fallback(document,rows,[])
        document.setdefault('multivoice',{})['inlineParallel']={'tested':len(rows),'verified':0,'sourceTimedFallbacks':fallbacks,
            'fallbackMeaning':'source text split into established parts; singer ownership and within-line timing remain estimated'}
        return document
    # Two simultaneous texts establish two distinct vocal parts even if a
    # speech embedding confuses their singing registers. Output indices do not
    # establish their identities across windows: use a constrained assignment.
    if vocal is None:
        raise ValueError('Independent phrases require a vocal stem, not the full musical mix.')
    groups=defaultdict(list)
    for word in document['words']:groups[word['line']].append(word)
    mono=resample_poly(samples,2,3).astype('float32')
    named={v['id']:v for v in document.get('voices',[]) if any(
        w.get('voiceSource') in ('annotation','manual','import') and w.get('voiceIds')==[v['id']] for w in document['words'])}
    anchor=pairs[0]['parts']
    exemplars={} if named else {'part-1':[anchor[0]['vector']], 'part-2':[anchor[1]['vector']]}
    names=list(named.values()) if named else [dict(id='part-1',label='Голос 1'),dict(id='part-2',label='Голос 2')]
    # Retain explicit singers and genuinely distinct, repeated solo evidence.
    # A single contiguous changed-register passage is insufficient by itself.
    for voice in document.get('voices',[]):
        if voice['id']=='unassigned':continue
        rows_for_voice=[g for g in groups.values() if g[0].get('voiceIds')==[voice['id']]]
        if not rows_for_voice:continue
        if voice['id'] not in named and (len(rows_for_voice)<3 or rows_for_voice[-1][-1]['end']-rows_for_voice[0][0]['start']<25):continue
        vectors=[]
        for group in rows_for_voice[::max(1,len(rows_for_voice)//3)][:3]:
            a=min(w['start'] for w in group);b=min(max(w['end'] for w in group),a+3.5)
            v=engine._embed(mono[round(a*16000):round(b*16000)]) if b-a>=.6 else None
            if v is not None:vectors.append(v)
        prototype=engine._prototype(vectors)
        current=[engine._prototype(v) for v in exemplars.values()]
        if prototype is not None and (voice['id'] in named or all(float(prototype@v)<.58 for v in current)):
            exemplars[voice['id']]=vectors
            if not any(v['id']==voice['id'] for v in names):names.append(voice)
    if len(exemplars)<2:return document
    for pair in pairs:
        prototypes={key:engine._prototype(v) for key,v in exemplars.items()}
        order=max(itertools.permutations(prototypes,2), key=lambda ids:sum(float(p['vector']@prototypes[i]) for p,i in zip(pair['parts'],ids)))
        for part,identity in zip(pair['parts'],order):
            part['id']=identity;exemplars[identity].append(part['vector'])
    prototypes={key:engine._prototype(v) for key,v in exemplars.items()}
    for group in groups.values():
        a=min(w['start'] for w in group);b=min(max(w['end'] for w in group),a+3.5)
        vector=engine._embed(mono[round(a*16000):round(b*16000)]) if b-a>=.6 else None
        identity,score,margin=engine._best(vector,prototypes)
        if identity is None:
            # A short uncertain phrase stays with its nearest established
            # context, flagged for review; it does not become a new voice.
            identity=next((w.get('voiceIds',[None])[0] for w in reversed(document['words'])
                           if w['end']<=a and w.get('voiceIds',[None])[0] in prototypes),next(iter(prototypes)))
        for word in group:
            if word.get('voiceSource') in ('annotation','manual','import'):continue
            word.update(voiceIds=[identity],voiceConfidence=max(0,min(.85,score)),voiceSource='acoustic' if margin>=.08 else 'unassigned',voiceReviewRequired=True)
    for line in document.get('fallbackLines',[]):
        a,b=line['t'],min(line['end'],line['t']+3.5)
        identity,_,_=engine._best(engine._embed(mono[round(a*16000):round(b*16000)]),prototypes) if b-a>=.6 else (None,0,0)
        line['voiceIds']=[identity or next(iter(prototypes))]
    next_line=max([w['line'] for w in document['words']]+[l['line'] for l in document.get('fallbackLines',[])]+[0])+1
    for pair in pairs:
        row=pair['row']
        removed={key for key,g in groups.items() if norm(' '.join(w['word'] for w in g))==norm(row['text']) and abs(g[0]['start']-row['t'])<2}
        # Unresolved words may all be stamped at zero: use original line text
        # and its source timestamp rather than pretending those zeroes are real.
        for i,segment in enumerate(document.get('source_segments',[])):
            if norm(segment['text'])==norm(row['text']) and abs(segment['start']-row['t'])<.1:removed.add(i)
        document['words']=[w for w in document['words'] if w['line'] not in removed]
        document['fallbackLines']=[l for l in document.get('fallbackLines',[]) if not(norm(l['text'])==norm(row['text']) and abs(l['t']-row['t'])<.1)]
        for part in pair['parts']:
            for word in part['words']:
                word.update(line=next_line,voiceIds=[part['id']],voiceConfidence=min(.85,part['score']),voiceSource='acoustic',status='review',role='parallel')
                document['words'].append(word)
            next_line+=1
    document['voices']=names
    document,fallbacks=source_fallback(document,rows,pairs)
    document.setdefault('multivoice',{})['inlineParallel']={'tested':len(rows),'verified':len(pairs),'sourceTimedFallbacks':fallbacks,'method':'independent text-to-source alignment; constrained identity matching', 'reviewRequired':True}
    return document


def restore_backgrounds(document,lyrics):
    """Explicit [bg:] is source evidence for a backing role, not a new singer."""
    groups=defaultdict(list)
    for w in document['words']:groups[w['line']].append(w)
    times=sorted(int(m)*60+float(s) for m,s in re.findall(r'\[(\d+):(\d{2}(?:\.\d+)?)\]',lyrics))
    next_line=max([w['line'] for w in document['words']]+[l['line'] for l in document.get('fallbackLines',[])]+[0])+1
    recovered=0
    for raw in lyrics.splitlines():
        bg=re.search(r'\[bg:\s*([^\]]+)\]',raw,re.I);stamps=re.findall(r'\[(\d+):(\d{2}(?:\.\d+)?)\]',raw)
        if not bg or not stamps:continue
        for m,s in stamps:
            start=int(m)*60+float(s);text=bg[1].strip()
            if not norm(text):continue
            candidates=[g for g in groups.values() if g[0]['start']<=start+.1 and max(w['end'] for w in g)>start-.6 and norm(' '.join(w['word'] for w in g))!=norm(text)]
            lead=max(candidates,key=lambda g:len(g)) if candidates else None
            if lead is None:continue
            host=(lead[0].get('voiceIds') or ['unassigned'])[0]
            existing=[g for g in groups.values() if norm(' '.join(w['word'] for w in g))==norm(text) and abs(g[0]['start']-start)<1]
            if existing:
                for g in existing:
                    for w in g:w.update(role='backing',hostVoiceId=host)
                continue
            existing_lines=[l for l in document.get('fallbackLines',[]) if norm(l['text'])==norm(text) and abs(l['t']-start)<.1]
            if existing_lines:
                for l in existing_lines:l.update(role='backing',hostVoiceId=host)
                continue
            other=next((v['id'] for v in document.get('voices',[]) if v['id'] not in (host,'unassigned')),host)
            end=min(next((t for t in times if t>start),start+2.8),start+2.8,document['duration'])
            if end<=start:continue
            document.setdefault('fallbackLines',[]).append(dict(line=next_line,t=start,end=end,text=text,voiceIds=[other],role='backing',hostVoiceId=host));next_line+=1;recovered+=1
    if recovered:document.setdefault('multivoice',{})['sourceBackingsRecovered']=recovered
    return document
