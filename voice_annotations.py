"""Read explicit named LRC sections; do not infer singer identity from punctuation."""
import re
import html

STAMP = re.compile(r'\[(\d+):(\d{2}(?:[.,]\d+)?)\]')
SECTION = re.compile(r'^(?:verse\s*\d*|chorus|pre[- ]?chorus|bridge|intro|outro|instrumental|куплет\s*\d*|припев|проигрыш|бэк(?:-вокал)?|back(?:ing|ground) vocals?)$', re.I)
ALL = re.compile(r'^(?:all|everyone|together|ensemble|все|вместе|хор)$', re.I)

def label(text):
    match = re.fullmatch(r'([^\[\]<>\n:：]{1,48})\s*[:：]\s*', text.strip())
    if not match:
        return None
    value = match[1].strip()
    return value if value and not SECTION.fullmatch(value) else None

def prepare(lyrics):
    lyrics = re.sub(r'\[bg:\s*([^\]]*)\]', lambda m: ' '+m[1], lyrics, flags=re.I)
    records, names = [], []
    offset_match = re.search(r'\[offset:([+-]?\d+)\]', lyrics, re.I)
    offset = int(offset_match[1]) / 1000 if offset_match else 0
    for raw in lyrics.splitlines():
        stamps = STAMP.findall(raw)
        text = html.unescape(STAMP.sub('', raw)).replace('**', '').replace('__', '')
        text = re.sub(r'\[[A-Za-z][\w-]*:[^\]]*\]', '', text)
        text = re.sub(r'<\d+:\d{2}(?:[.,]\d+)?>', '', text).strip()
        section = re.fullmatch(r'[\[({（](.*)[\])}）]', text)
        if section and SECTION.fullmatch(section[1]): text = ''
        # LRC metadata is retained for the extractor but never treated as a voice.
        name = label(text)
        if name and not ALL.fullmatch(name) and name.casefold() not in [n.casefold() for n in names]:
            names.append(name)
        records.append((raw, stamps, text, name))
    if not 2 <= len(names) <= 12:
        return lyrics, None
    voices = [{'id': 'v' + str(i + 1), 'label': name} for i, name in enumerate(names)]
    by_name = {v['label'].casefold(): v['id'] for v in voices}
    current, cleaned, events = [], [], []
    for raw, stamps, text, name in records:
        if name:
            current = [v['id'] for v in voices] if ALL.fullmatch(name) else [by_name[name.casefold()]]
            # Empty timed boundary prevents preceding lyrics swallowing the heading.
            cleaned.append(''.join('[' + a + ':' + b + ']' for a, b in stamps))
            continue
        cleaned.append(raw)
        if not any(c.isalnum() for c in text):
            continue
        for minutes, seconds in stamps:
            backing = text.startswith(('(', '（'))
            ids = list(current) if current and not backing else ['unassigned']
            events.append({'t': max(0, int(minutes) * 60 + float(seconds.replace(',', '.')) + offset),
                'text': text, 'voiceIds': ids, 'voiceSource': 'annotation' if ids != ['unassigned'] else 'unassigned'})
    events.sort(key=lambda entry: entry['t'])
    if not events:
        current = []
        for _, _, text, name in records:
            if name:
                current = [v['id'] for v in voices] if ALL.fullmatch(name) else [by_name[name.casefold()]]
            elif any(c.isalnum() for c in text):
                ids = list(current) if current and not text.startswith(('(', '（')) else ['unassigned']
                events.append({'t': 0, 'text': text, 'voiceIds': ids,
                    'voiceSource': 'annotation' if ids != ['unassigned'] else 'unassigned'})
    if any(e['voiceSource'] == 'unassigned' for e in events):
        voices.append({'id': 'unassigned', 'label': 'Неопределённая партия'})
    return '\n'.join(cleaned), {'voices': voices, 'events': events}

def apply(document, plan):
    if not plan:
        return document
    document['voices'] = plan['voices']
    for word in document['words']:
        index = word.get('line', -1)
        if not 0 <= index < len(plan['events']):
            continue
        event = plan['events'][index]
        word['voiceIds'] = event['voiceIds']
        word['voiceSource'] = event['voiceSource']
        word['voiceConfidence'] = 1 if event['voiceSource'] == 'annotation' else 0
        if len(event['voiceIds']) > 1:
            word['unisonId'] = 'annotation-all-' + str(index)
    document['multivoice'] = {'source': 'lyrics-annotations', 'reviewRequired': True,
        'message': 'Партии из обозначений в тексте; точность зависит от источника лирики.'}
    return document
