#!/usr/bin/env python3
"""Collect every finding row from audit/notes/*.md.
Writes raw/findings-index.tsv, raw/scorecard.md and raw/findings-all.md (used by REPORT.md).
Rows look like `ID | what | how | evidence | status | severity | fix | effort`, with or without leading pipes.
Usage: python3 audit/scripts/findings-index.py [Critical High ...]   # prints matching rows"""
import re, glob, sys, os, collections
here = os.path.dirname(os.path.abspath(__file__)); root = os.path.dirname(here)
STAT = re.compile(r'^(PASS|FAIL|RISK|NOT TESTED)', re.I)
SEV = re.compile(r'^(Critical|High|Medium|Low|Info)\b', re.I)
CAT = {'A': 'A Security', 'B': 'B Privacy and store compliance', 'C': 'C Memory and resources', 'D': 'D Rendering performance',
       'E': 'E Backend scalability', 'FR': 'F Reliability (DB races)', 'F': 'F Reliability', 'G': 'G Abuse, trust and safety',
       'H': 'H Code quality and tests', 'I': 'I Accessibility', 'J': 'J Launch operations'}
ORDER = {'Critical': 0, 'High': 1, 'Medium': 2, 'Low': 3, 'Info': 4, '-': 5}
rows = []
for f in sorted(glob.glob(os.path.join(root, 'notes', '[A-J]-*.md'))):
    for line in open(f):
        s = line.strip().strip('|').strip()
        m = re.match(r'^((?:FR|[A-J])-\d+[a-z]?)\s*\|', s)
        if not m: continue
        cols = [c.strip() for c in s.split('|')]
        st = next((STAT.match(c).group(1).upper() for c in cols[1:] if STAT.match(c)), '?')
        sev = next((SEV.match(c).group(1).capitalize() for c in cols[2:] if SEV.match(c)), '-')
        if st == 'PASS': sev = '-' if sev not in ('Info',) else sev
        si = next((i for i, c in enumerate(cols[2:], 2) if SEV.match(c) or c == '-'), None)
        si = si if si is not None and si + 1 < len(cols) and STAT.match(cols[si - 1] or '') else next((i for i, c in enumerate(cols[2:], 2) if STAT.match(c)), len(cols) - 3) + 1
        fix = cols[si + 1] if si + 1 < len(cols) else ''
        eff = cols[si + 2] if si + 2 < len(cols) else ''
        rows.append(dict(id=cols[0], st=st, sev=sev, what=re.sub(r'\s+', ' ', cols[1]), fix=re.sub(r'\s+', ' ', fix), eff=eff,
                         note=os.path.basename(f), cat=cols[0].split('-')[0]))
with open(os.path.join(root, 'raw', 'findings-index.tsv'), 'w') as w:
    for r in rows: w.write('\t'.join([r['id'], r['st'], r['sev'], r['what'][:160], r['note']]) + '\n')
# scorecard
sc = collections.OrderedDict((k, collections.Counter()) for k in ['A', 'B', 'C', 'D', 'E', 'F', 'G', 'H', 'I', 'J'])
for r in rows:
    k = 'F' if r['cat'] == 'FR' else r['cat']; sc[k][r['st']] += 1; sc[k]['sev:' + r['sev']] += 1
with open(os.path.join(root, 'raw', 'scorecard.md'), 'w') as w:
    w.write('| Category | PASS | FAIL | RISK | NOT TESTED | Critical | High | Medium | Low |\n|---|---|---|---|---|---|---|---|---|\n')
    for k, c in sc.items():
        w.write(f"| {CAT[k]} | {c['PASS']} | {c['FAIL']} | {c['RISK']} | {c['NOT TESTED']} | {c['sev:Critical']} | {c['sev:High']} | {c['sev:Medium']} | {c['sev:Low']} |\n")
# all findings, non-PASS, grouped by category, sorted by severity
with open(os.path.join(root, 'raw', 'findings-all.md'), 'w') as w:
    for k in ['A', 'B', 'C', 'D', 'E', 'F', 'FR', 'G', 'H', 'I', 'J']:
        rs = sorted([r for r in rows if r['cat'] == k and r['st'] != 'PASS'], key=lambda r: ORDER.get(r['sev'], 9))
        if not rs: continue
        w.write(f"\n### {CAT[k]}\n\nDetail, evidence and commands: [`notes/{rs[0]['note']}`](notes/{rs[0]['note']})\n\n")
        w.write('| ID | Result | Severity | Finding | Recommended fix | Effort |\n|---|---|---|---|---|---|\n')
        for r in rs:
            esc = lambda t: t.replace('|', '/')
            w.write(f"| {r['id']} | {r['st']} | {r['sev']} | {esc(r['what'])} | {esc(r['fix'])} | {esc(r['eff'])} |\n")
want = set(sys.argv[1:])
for r in rows:
    if r['sev'] in want and r['st'] != 'PASS': print('\t'.join([r['id'], r['st'], r['sev'], r['what'][:110]]))
