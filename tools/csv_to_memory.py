#!/usr/bin/env python3
"""corpus.csv -> data/memory.js, avec contrôles d'intégrité.
Usage : python3 tools/csv_to_memory.py
Une traduction n'est utilisée que si valide=1 ET valide_par est renseigné.
La colonne « en » peut contenir plusieurs variantes séparées par « | »."""
import csv, json, pathlib, re, sys

root = pathlib.Path(__file__).resolve().parent.parent
slots = lambda s: re.findall(r'\{(\w+)\}', s)
nums = lambda s: sorted(re.findall(r'\d+', s))
rows, errors = [], []

with open(root / 'corpus.csv', encoding='utf-8-sig', newline='') as f:
    for r in csv.DictReader(f):
        i, fr = r['id'].strip(), r['fr'].strip()
        ens = [e.strip() for e in (r.get('en') or '').split('|') if e.strip()]
        bu = (r.get('bulu') or '').strip()
        valid = (r.get('valide') or '').strip().lower() in ('1', 'oui', 'yes', 'x')
        if len(set(slots(fr))) != len(slots(fr)):
            errors.append(f'{i}: champ {{...}} en double dans le français')
        for en in ens:
            if sorted(slots(en)) != sorted(slots(fr)):
                errors.append(f"{i}: les champs {{...}} de l'anglais diffèrent du français")
        if bu:
            if sorted(slots(bu)) != sorted(slots(fr)):
                errors.append(f'{i}: les champs {{...}} du bulu diffèrent du français')
            if nums(bu) != nums(fr):
                errors.append(f'{i}: les chiffres du bulu diffèrent du français')
        if valid and not bu:
            errors.append(f'{i}: marqué validé mais sans traduction bulu')
        if valid and not (r.get('valide_par') or '').strip():
            errors.append(f'{i}: marqué validé sans nom de validateur')
        rows.append({
            'id': i,
            'critical': (r.get('critique') or '').strip() == '1',
            'fr': fr, 'en': ens, 'bu': bu, 'validated': bool(valid and bu),
        })

if errors:
    print('\n'.join(errors)); sys.exit(1)
out = root / 'data' / 'memory.js'
out.write_text('// Généré par tools/csv_to_memory.py — ne pas éditer à la main\nglobalThis.SAFINUM_MEMORY = '
               + json.dumps(rows, ensure_ascii=False, indent=1) + ';\n', encoding='utf-8')
print(f"{len(rows)} entrées, {sum(r['validated'] for r in rows)} validées -> {out}")
