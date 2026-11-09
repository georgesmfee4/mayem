#!/usr/bin/env python3
"""Ajoute les sections B à L au glossaire d'un kit déjà rempli, sans rien modifier d'autre.

  python3 tools/extend_glossary.py kit-rempli.xlsx kit-glossaire-complet.xlsx

Les lignes existantes du glossaire et l'onglet « À traduire » ne sont pas touchés ;
le script vérifie après coup qu'ils sont identiques à l'original.
"""
import sys
from openpyxl import load_workbook
from openpyxl.styles import Alignment, Font, PatternFill

sys.path.insert(0, __file__.rsplit('/', 1)[0])
from glossary_ext import SECTIONS, PRIORITY_LABEL

TEAL = PatternFill('solid', fgColor='0F4C5C')
SECTION_FILL = {1: PatternFill('solid', fgColor='DCEBEE'), 2: PatternFill('solid', fgColor='E8F0F1'), 3: PatternFill('solid', fgColor='F1F4F5')}
YELLOW = PatternFill('solid', fgColor='FFF2CC')
RED = Font(bold=True, color='B42318')
WRAP = Alignment(wrap_text=True, vertical='top')


def snapshot(ws):
    return [[c.value for c in row] for row in ws.iter_rows()]


def main(src, dst):
    wb = load_workbook(src)
    before_tr = snapshot(wb['À traduire'])
    gl = wb['Glossaire']
    before_gl = snapshot(gl)
    existing = {str(r[0]).strip() for r in before_gl if r and r[0]}

    last = max(i for i, r in enumerate(before_gl, start=1) if any(v not in (None, '') for v in r))
    row = last + 2
    added = 0
    current_prio = None
    for code, title, prio, intro, items in SECTIONS:
        if prio != current_prio:
            current_prio = prio
            c = gl.cell(row=row, column=2, value=PRIORITY_LABEL[prio])
            c.font = Font(bold=True, color='FFFFFF', size=12)
            for col in range(1, 11):
                gl.cell(row=row, column=col).fill = TEAL
            row += 1
        head = gl.cell(row=row, column=2, value=f'{code} · {title}')
        head.font = Font(bold=True, size=12)
        if intro:
            gl.cell(row=row, column=4, value=intro).alignment = WRAP
        for col in range(1, 11):
            gl.cell(row=row, column=col).fill = SECTION_FILL[prio]
        row += 1
        for ref, fr, en, note, crit in items:
            if ref in existing:
                continue
            values = [ref, fr, en, note, 'Oui' if crit else 'Non', None, None, None, None, None]
            for col, v in enumerate(values, start=1):
                cell = gl.cell(row=row, column=col, value=v)
                cell.alignment = WRAP
            gl.cell(row=row, column=6).fill = YELLOW
            if crit:
                gl.cell(row=row, column=5).font = RED
            row += 1
            added += 1
        row += 1  # une ligne vide entre deux sections

    gl.auto_filter.ref = None
    wb.save(dst)

    # Vérification : rien d'autre n'a bougé
    check = load_workbook(dst)
    assert snapshot(check['À traduire']) == before_tr, "L'onglet « À traduire » a changé !"
    after_gl = snapshot(check['Glossaire'])
    assert after_gl[:len(before_gl)] == [r + [None] * (len(after_gl[0]) - len(r)) for r in before_gl], 'Les lignes existantes du glossaire ont changé !'
    for name in wb.sheetnames:
        if name not in ('Glossaire',):
            assert snapshot(check[name]) == snapshot(load_workbook(src)[name]), f'« {name} » a changé !'
    print(f'{added} lignes ajoutées au glossaire ; « À traduire », « Choix de style » et « Mode d’emploi » identiques -> {dst}')


if __name__ == '__main__':
    if len(sys.argv) != 3:
        print(__doc__); sys.exit(1)
    main(sys.argv[1], sys.argv[2])
