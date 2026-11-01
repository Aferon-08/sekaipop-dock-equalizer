"""Track-level singer clustering; short changes of register are not new voices."""
from collections import defaultdict
import importlib
import math
from pathlib import Path
import compute_runtime as compute

MODEL_HASH='e658943ca6ec063cbdafda0b7a8be5ff7b78b66cf9e4aaaddead41edc4d937a0'
_ENCODER=None


def stabilize(document,vocal,progress=None):
    global _ENCODER
    engine=importlib.import_module('multivoice-engine');engine._optional_path()
    import numpy as np
    import torch
    from scipy.signal import resample_poly
    from scipy.cluster.hierarchy import linkage,fcluster
    from scipy.spatial.distance import squareform
    model=engine.ROOT/'models/singer-byol.ts'
    if not model.is_file():
        document.setdefault('multivoice',{})['singingIdentity']={'status':'unavailable'}
        return document
    if _ENCODER is None:
        if engine._hash(model)!=MODEL_HASH:raise ValueError('Singer encoder checksum mismatch.')
        _ENCODER=torch.jit.load(str(model),map_location='cpu').eval()
    audio=engine._decode(vocal,24000)
    groups=defaultdict(list)
    for word in document['words']:groups[word['line']].append(word)
    entries=[dict(t=min(w['start'] for w in g),end=max(w['end'] for w in g),words=g,
                  text=' '.join(w['word'] for w in g),ids=g[0].get('voiceIds',[]),
                  fixed=any(w.get('voiceSource') in ('annotation','manual','import') and w.get('voiceIds') for w in g)) for g in groups.values()]
    entries += [dict(t=l['t'],end=l['end'],words=None,fallback=l,text=l['text'],ids=l.get('voiceIds',[]),fixed=False) for l in document.get('fallbackLines',[])]
    entries.sort(key=lambda e:e['t'])
    training=[]
    for i,row in enumerate(entries):
        length=row['end']-row['t']
        if length<.8:continue
        start=max(0,row['t']+(length-min(length,3.5))*.35)
        clip=audio[round(start*24000):round(min(row['end'],start+3.5)*24000)]
        clip=resample_poly(clip,147,80).astype('float32')
        if len(clip)<44100*.8:continue
        with torch.inference_mode():value=compute.run('singer',_ENCODER,lambda device: _ENCODER(torch.from_numpy(clip).reshape(1,-1).to(device))).cpu().numpy().reshape(-1)
        value=value/max(1e-9,np.linalg.norm(value));row['vector']=value
        # A supplied simultaneous counterpoint is a mixture, not a solo seed.
        if '(' not in row['text'] and '（' not in row['text'] and len(row['ids'])<=1:training.append(row)
        if progress:progress('voice_stabilizing',(i+1)/max(1,len(entries)))
    fixed={v['id']:v for v in document.get('voices',[]) if any(e['fixed'] and e['ids']==[v['id']] for e in entries)}
    if len(training)<6:return document
    matrix=np.stack([r['vector'] for r in training]);distance=np.clip(1-matrix@matrix.T,0,2);np.fill_diagonal(distance,0)
    if fixed:
        prototypes={identity:np.mean([e['vector'] for e in entries if e.get('vector') is not None and e['fixed'] and e['ids']==[identity]],axis=0) for identity in fixed}
        prototypes={k:v/np.linalg.norm(v) for k,v in prototypes.items() if np.all(np.isfinite(v))}
        names=list(fixed.values());chosen=None
    else:
        tree=linkage(squareform(distance,checks=False),method='average')
        best=None
        for k in range(2,min(8,len(training)//3)+1):
            labels=fcluster(tree,k,criterion='maxclust')
            valid=[]
            for label in set(labels):
                idx=np.flatnonzero(labels==label);rows=[training[j] for j in idx]
                span=max(e['end'] for e in rows)-min(e['t'] for e in rows)
                share=sum(min(5,e['end']-e['t']) for e in rows)/max(1,sum(min(5,e['end']-e['t']) for e in training))
                if len(idx)>=3 and (span>=25 or share>=.25):valid.append(label)
            keep=np.array([x in valid for x in labels]);kept=np.flatnonzero(keep)
            if len(valid)<2:continue
            scores=[]
            for i in kept:
                same=[j for j in kept if j!=i and labels[j]==labels[i]]
                within=float(distance[i,same].mean()) if same else 0
                other=min(float(distance[i,[j for j in kept if labels[j]==label]].mean()) for label in valid if label!=labels[i])
                scores.append((other-within)/max(1e-8,within,other))
            score=float(np.mean(scores))-.08*(len(valid)-1)
            if best is None or score>best[0]:best=(score,labels,valid)
        labels=best[1] if best and best[0]>.10 else np.ones(len(training),dtype=int)
        valid=best[2] if best and best[0]>.10 else [1]
        ordered=sorted(valid,key=lambda label:min(training[i]['t'] for i in range(len(training)) if labels[i]==label))
        prototypes={}
        names=[]
        for i,label in enumerate(ordered):
            identity='vocal-'+str(i+1);v=matrix[labels==label].mean(axis=0);prototypes[identity]=v/np.linalg.norm(v)
            names.append(dict(id=identity,label='Голос '+str(i+1)))
        chosen={'silhouetteWithComplexityPenalty':best[0] if best else 0,'count':len(prototypes)}
    if not prototypes:return document
    prior=next(iter(prototypes));uncertain=0
    for row in entries:
        if row['fixed']:
            if len(row['ids'])==1:prior=row['ids'][0]
            continue
        vector=row.get('vector');identity,score,margin=engine._best(vector,prototypes)
        reliable=identity is not None and score>=.76 and (len(prototypes)==1 or margin>=.035)
        if not reliable: identity=prior;uncertain+=1
        else:prior=identity
        if row['words']:
            for w in row['words']:
                w.update(voiceIds=[identity],voiceSource='acoustic' if reliable else 'unassigned',voiceConfidence=max(0,min(.9,score)) if reliable else 0,voiceReviewRequired=True)
        else:row['fallback']['voiceIds']=[identity]
    # Preserve IDs in explicit shared phrases, including singers lacking a solo.
    used={v for w in document['words'] for v in w.get('voiceIds',[])}
    for v in document.get('voices',[]):
        if v['id'] in used and not any(n['id']==v['id'] for n in names):names.append(v)
    document['voices']=names
    document.setdefault('multivoice',{})['singingIdentity']={'status':'estimated','model':'SonyCSL Singer BYOL',
        'revision':'55e09cdfcd733b1c01f2b94f316a0280995a909e','trainingPhrases':len(training),
        'uncertainPhrases':uncertain,'selection':chosen,'reviewRequired':True}
    return document
