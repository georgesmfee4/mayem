"""Tableur de relecture des points du contrôle (créé par npm run relecture, réimporté par npm run import).

« Corriger » remplace le bulu dans corpus.csv ou glossaire.csv ; « Garder » est noté dans decisions.csv.
Comme partout : une décision ne compte que si deux personnes différentes l'ont signée, et une ligne
dont le bulu a changé depuis l'export est laissée de côté (le tableur serait plus ancien que le corpus).
"""
import csv, datetime
from openpyxl import Workbook
from openpyxl.styles import Alignment, Font, PatternFill
from openpyxl.worksheet.datavalidation import DataValidation

ENTETES = ['N°', 'Type', 'Réf.', 'Texte français', 'Bulu actuel', 'Ce qui est signalé', 'Terme du glossaire',
           'DÉCISION', 'NOUVEAU BULU', 'Corrigé par', 'Relu par', 'Commentaire', 'point', 'type_point']
LARGEURS = [5, 16, 7, 40, 40, 52, 18, 12, 40, 14, 14, 26, 10, 10]
DECISIONS = ['type', 'point', 'ref', 'bulu', 'decide_par', 'relu_par', 'date', 'commentaire']

GUIDE = [
    "RELECTURE — à remplir par deux personnes",
    "",
    "Chaque ligne est un endroit où une traduction déjà validée s'écarte du glossaire, ou ressemble à une autre.",
    "Ce n'est pas forcément une erreur : vous connaissez la langue, le glossaire peut avoir tort.",
    "",
    "Pour chaque ligne :",
    "1. Lisez « Ce qui est signalé ».",
    "2. Dans DÉCISION, choisissez « Garder » (la traduction actuelle est juste) ou « Corriger ».",
    "3. Si vous corrigez, écrivez la nouvelle traduction dans NOUVEAU BULU. Ne changez aucun chiffre ni rien entre {accolades}.",
    "4. Écrivez votre nom dans « Corrigé par ». Une deuxième personne relit et écrit le sien dans « Relu par ».",
    "   Sans deux noms différents, la ligne n'est pas prise en compte.",
    "",
    "Les lignes « Négation » viennent en premier : un « ne… pas » ou un « jamais » oublié inverse le sens d'un message de sécurité.",
    "Plusieurs lignes avec le même N° parlent du même point : décidez-les ensemble.",
]


def exporter(csv_chemin, sortie):
    lignes = list(csv.DictReader(open(csv_chemin, encoding='utf-8-sig', newline='')))
    wb = Workbook()
    guide = wb.active
    guide.title = "Mode d'emploi"
    guide.column_dimensions['A'].width = 120
    for i, texte in enumerate(GUIDE, 1):
        guide.cell(row=i, column=1, value=texte).alignment = Alignment(wrap_text=True)
    guide['A1'].font = Font(bold=True, size=13)

    ws = wb.create_sheet('Relecture')
    ws.append(ENTETES)
    for c in ws[1]:
        c.font = Font(bold=True, color='FFFFFF')
        c.fill = PatternFill('solid', fgColor='0F4C5C')
        c.alignment = Alignment(wrap_text=True, vertical='center')
    jaune = PatternFill('solid', fgColor='FFF2CC')
    rouge = Font(bold=True, color='B42318')
    for l in lignes:
        ws.append([int(l['numero']), l['type'], l['ref'], l['fr'], l['bulu'], l['signale'], l['attendu'],
                   '', '', '', '', '', l['point'], l['cle_type']])
        rang = ws.max_row
        for col in range(1, len(ENTETES) + 1):
            ws.cell(row=rang, column=col).alignment = Alignment(wrap_text=True, vertical='top')
        for col in (8, 9, 10, 11):
            ws.cell(row=rang, column=col).fill = jaune
        if l['critique'] == '1':
            ws.cell(row=rang, column=3).font = rouge
    choix = DataValidation(type='list', formula1='"Garder,Corriger"', allow_blank=True)
    ws.add_data_validation(choix)
    choix.add(f'H2:H{ws.max_row}')
    for i, largeur in enumerate(LARGEURS):
        ws.column_dimensions[chr(65 + i)].width = largeur
    # Colonnes techniques, utiles à l'import seulement
    ws.column_dimensions['M'].hidden = True
    ws.column_dimensions['N'].hidden = True
    ws.freeze_panes = 'D2'
    wb.save(sortie)
    print(f"{len(lignes)} lignes ({len({l['numero'] for l in lignes})} points) -> {sortie}")


def _deux_personnes(a, b):
    return bool(a and b and a.strip().lower() != b.strip().lower())


def importer(wb, dossier, corpus_chemin, champs_corpus, bulu_column):
    ws = wb['Relecture']
    rangs = list(ws.iter_rows(values_only=True))
    index = {nom: i for i, nom in enumerate(rangs[0])}
    cellule = lambda rang, nom: ('' if rang[index[nom]] is None else str(rang[index[nom]]).strip())

    corpus = list(csv.DictReader(open(corpus_chemin, encoding='utf-8-sig', newline='')))
    par_id = {r['id']: r for r in corpus}
    glossaire_chemin = dossier / 'glossaire.csv'
    glossaire = list(csv.reader(open(glossaire_chemin, encoding='utf-8-sig', newline='')))
    b, t, r = bulu_column(glossaire[0])
    par_ref = {g[0].strip(): g for g in glossaire[1:] if g}
    decisions_chemin = dossier / 'decisions.csv'
    nouvelles_decisions, corrigees, gardees, laissees, changements = [], 0, 0, [], []
    aujourd_hui = datetime.date.today().isoformat()

    for rang in rangs[1:]:
        if not rang or not rang[index['Réf.']]:
            continue
        ref, decision = cellule(rang, 'Réf.'), cellule(rang, 'DÉCISION').lower()
        actuel, nouveau = cellule(rang, 'Bulu actuel'), cellule(rang, 'NOUVEAU BULU')
        par, relu = cellule(rang, 'Corrigé par'), cellule(rang, 'Relu par')
        if decision not in ('garder', 'corriger') or not _deux_personnes(par, relu) or (decision == 'corriger' and not nouveau):
            laissees.append(ref)
            continue
        phrase, terme = par_id.get(ref), par_ref.get(ref)
        present = phrase['bulu'] if phrase else (terme[b] if terme and b is not None else None)
        # Même phrase sur deux lignes (deux points) avec la même correction : déjà faite
        if decision == 'corriger' and present is not None and present.strip() == nouveau:
            continue
        if present is None or present.strip() != actuel:
            laissees.append(f'{ref} (bulu changé depuis l’export)')
            continue
        if decision == 'garder':
            nouvelles_decisions.append({'type': cellule(rang, 'type_point'), 'point': cellule(rang, 'point'), 'ref': ref,
                                        'bulu': actuel, 'decide_par': par, 'relu_par': relu, 'date': aujourd_hui,
                                        'commentaire': cellule(rang, 'Commentaire')})
            gardees += 1
            continue
        changements.append(f'  {ref} : « {actuel} » -> « {nouveau} »')
        if phrase:
            phrase.update(bulu=nouveau, valide_par=f'{par} / relu par {relu}', valide='1')
        else:
            terme[b] = nouveau
            if t is not None: terme[t] = par
            if r is not None: terme[r] = relu
        corrigees += 1

    with open(corpus_chemin, 'w', encoding='utf-8-sig', newline='') as f:
        w = csv.DictWriter(f, fieldnames=champs_corpus)
        w.writeheader()
        w.writerows(corpus)
    with open(glossaire_chemin, 'w', encoding='utf-8-sig', newline='') as f:
        csv.writer(f).writerows(glossaire)
    if nouvelles_decisions:
        existe = decisions_chemin.exists()
        with open(decisions_chemin, 'a', encoding='utf-8-sig' if not existe else 'utf-8', newline='') as f:
            w = csv.DictWriter(f, fieldnames=DECISIONS)
            if not existe: w.writeheader()
            w.writerows(nouvelles_decisions)

    print(f'relecture : {corrigees} corrigée(s), {gardees} gardée(s), {len(laissees)} laissée(s)')
    if changements:
        print('\n'.join(changements))
    if laissees:
        print('Laissées (décision, nouveau bulu ou deux noms différents manquants) : ' + ', '.join(laissees))
