#!/usr/bin/env python3
"""Voice check for the outreach drafts. Fails on any em dash, en dash, a hyphen used
as a dash, an exclamation mark, an emoji, a subject over 6 words, or a body word
count outside 90 to 140. The body is everything after the Subject line; it is
counted both without and with the four-line sign-off, and both must be in range.
Run: python3 docs/leads/outreach/check.py"""
import glob, os, re, sys, unicodedata
here = os.path.dirname(os.path.abspath(__file__))
files = sorted(glob.glob(os.path.join(here, '[0-9][0-9]-*.md')))
bad = 0
for f in files:
    t = open(f, encoding='utf-8').read()
    name = os.path.basename(f)
    problems = []
    m = re.search(r'^Subject: (.*)$', t, re.M)
    if not m: problems.append('no Subject line')
    else:
        subj = m.group(1)
        if len(subj.split()) > 6: problems.append(f'subject {len(subj.split())} words')
    after = t[m.end():].strip() if m else t
    if '—' in after or '–' in after: problems.append('em or en dash')
    if re.search(r'(^|\s)-{1,2}(\s|$)', after, re.M) or re.search(r'\w--\w', after): problems.append('hyphen used as a dash')
    if '!' in after: problems.append('exclamation mark')
    for ch in after:
        if ord(ch) > 0x2000 and (unicodedata.category(ch) in ('So', 'Sk', 'Cs') or ord(ch) >= 0x1F000 or 0x2600 <= ord(ch) <= 0x27BF):
            problems.append(f'emoji or symbol U+{ord(ch):04X}'); break
    if 'Adam Miller\nMainline Web Design\nadam@mainline-webdesign.com\nhttps://mainline-webdesign.com' not in after:
        problems.append('sign-off missing or altered')
    core = after.split('\nAdam Miller\n')[0]
    n_core, n_full = len(core.split()), len(after.split())
    if not (90 <= n_core <= 140): problems.append(f'body {n_core} words without sign-off')
    if not (90 <= n_full <= 140): problems.append(f'body {n_full} words with sign-off')
    if len(re.findall(r'https?://\S+', core)) != 1: problems.append('expected exactly one link')
    if 'hope this finds you' in core.lower(): problems.append('banned phrase')
    status = 'OK ' if not problems else 'BAD'
    if problems: bad += 1
    print(f'{status} {name:42s} {n_core:3d}/{n_full:3d} words  {"; ".join(problems)}')
print(f'\n{len(files)} files checked, {bad} with problems')
sys.exit(1 if bad or len(files) != 34 else 0)
