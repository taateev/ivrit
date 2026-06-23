#!/usr/bin/env python3
"""
Frequency of Hebrew verb inflection patterns (binyan × tense × person/gender/number)
over data/os_sample.txt, using stanza's UD-Hebrew morphological tagger (emits HebBinyan).
Output → the tables in data/binyan-freq.md.

Setup (torch needs Python <= 3.12):
    python3.12 -m venv /tmp/hebnlp
    /tmp/hebnlp/bin/pip install stanza
    /tmp/hebnlp/bin/python scripts/binyan-freq.py
(stanza.download('he') runs automatically on first use.)
"""
import random
from collections import Counter
import stanza

ROOT = '/Users/dlesky/hebrew'
N = 8000
random.seed(42)
lines = [l.strip() for l in open(f'{ROOT}/data/os_sample.txt', encoding='utf-8') if l.strip() and len(l) > 4]
sample = random.sample(lines, min(N, len(lines)))

stanza.download('he', verbose=False)
nlp = stanza.Pipeline('he', processors='tokenize,mwt,pos,lemma', verbose=False, use_gpu=False, pos_batch_size=128)

BLBL = {'PAAL': "Pa'al", 'PIEL': "Pi'el", 'HIFIL': "Hif'il", 'NIFAL': "Nif'al",
        'HITPAEL': "Hitpa'el", 'PUAL': "Pu'al", 'HUFAL': "Huf'al", '?': '(untagged)'}
verbs = 0
binyan, tense, patt = Counter(), Counter(), Counter()
for i in range(0, len(sample), 500):
    doc = nlp('\n\n'.join(sample[i:i + 500]))
    for sent in doc.sentences:
        for w in sent.words:
            if w.upos not in ('VERB', 'AUX'):
                continue
            f = {}
            if w.feats:
                for kv in w.feats.split('|'):
                    if '=' in kv:
                        k, v = kv.split('=', 1); f[k] = v
            b = BLBL.get(f.get('HebBinyan', '?'), f.get('HebBinyan', '?'))
            t = f.get('Tense', f.get('VerbForm', '?'))
            p, g, n = f.get('Person', '-'), f.get('Gender', '-'), f.get('Number', '-')
            if t == 'Pres' or f.get('VerbForm') == 'Part':   # present = participle, no person → collapse
                p, t = '-', 'Pres'
            gn = (g[:1] if g != '-' else '') + (n[:2] if n != '-' else '')
            person = p if p in ('1', '2', '3') else ''
            verbs += 1
            binyan[b.split(' ')[0] if b != '(untagged)' else b] += 1
            tense[t] += 1
            patt[f'{b} · {t}' + (f' · {person}{gn}' if (person or gn) else '')] += 1

print(f'verb tokens: {verbs} · distinct patterns: {len(patt)}\n')
print('=== BINYAN ===')
for b, c in binyan.most_common():
    print(f'  {b:12} {c/verbs*100:5.1f}%')
print('\n=== TENSE ===')
for t, c in tense.most_common():
    print(f'  {t:8} {c/verbs*100:5.1f}%')
print('\n=== PATTERNS (to 80%) ===')
cum = 0
for i, (k, c) in enumerate(patt.most_common()):
    cum += c
    print(f'{i+1:3}. {c/verbs*100:4.1f}%  cum {cum/verbs*100:4.1f}%   {k}')
    if cum / verbs >= 0.8:
        break
for thr in (0.5, 0.8, 0.9, 0.95):
    s = kk = 0
    for _, c in patt.most_common():
        s += c; kk += 1
        if s / verbs >= thr:
            break
    print(f'  {int(thr*100)}%: top {kk}')
