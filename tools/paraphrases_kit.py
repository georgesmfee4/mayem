"""Tableur de vérification des paraphrases (packs/<langue>/paraphrases.csv) par un francophone de l'équipe.

Une paraphrase n'entre dans le pack que vérifiée par une personne qui ne l'a pas proposée (tools/build-pack.js).
Le tableur ne montre que du français : la personne dit seulement si deux phrases veulent dire la même chose.
« non » retire la paraphrase ; « oui » sans nom ne compte pas.
"""
import csv
from openpyxl import Workbook
from openpyxl.styles import Alignment, Font, PatternFill
from openpyxl.worksheet.datavalidation import DataValidation

ONGLET = 'Autres façons de dire'
COLONNES = ['Réf.', 'Important (argent ou sécurité)', "Phrase d'origine (déjà traduite)", 'Autre façon de dire',
            'À savoir', 'MÊME SENS ? (oui / non)', 'Vérifié par', 'Commentaire']
LARGEURS = [7, 14, 50, 50, 34, 16, 16, 30]
SECONDES_PAR_LIGNE = 20


def _lire(chemin):
    with open(chemin, encoding='utf-8-sig', newline='') as f:
        lignes = list(csv.DictReader(f))
    return (list(lignes[0].keys()) if lignes else ['id', 'fr', 'propose_par', 'verifie_par', 'source', 'commentaire']), lignes


def _a_verifier(ligne):
    verifie = (ligne.get('verifie_par') or '').strip().lower()
    return not verifie or verifie == (ligne.get('propose_par') or '').strip().lower()


def _guide(wb, nom_langue, lignes):
    ws = wb.active
    ws.title = "Mode d'emploi"
    minutes = max(10, round(lignes * SECONDES_PAR_LIGNE / 600) * 10)
    duree = f'environ {minutes} minutes' if minutes < 60 else f"environ {f'{round(minutes / 30) / 2:g}'.replace('.', ',')} heures"
    texte = [
        'VÉRIFICATION DES AUTRES FAÇONS DE DIRE — tout est en français',
        '',
        "Les services n'écrivent pas tous une phrase de la même façon. Pour chaque phrase déjà traduite",
        f"en {nom_langue}, voici d'autres façons de la dire en français. Si une autre façon dit exactement la même",
        f'chose, l\'application affichera la même traduction en {nom_langue}.',
        '',
        "Votre travail : pour chaque ligne, dire si « Autre façon de dire » veut dire EXACTEMENT la même chose",
        "que « Phrase d'origine ».",
        '- « oui » : même sens, rien de plus, rien de moins.',
        "- « non » : le sens change, même un peu : une négation, le temps (fait, à faire), qui fait l'action,",
        "  l'argent qui part ou qui arrive, un avertissement plus faible, une information en plus ou en moins.",
        "- Dans le doute, écrivez « non » : la phrase restera en français, ce qui est sans danger.",
        '- « Vérifié par » : votre nom. Vous ne pouvez pas vérifier une phrase que vous avez proposée vous-même.',
        "- « Commentaire » : si vous écrivez « non », dites en quelques mots ce qui change.",
        '',
        f'Combien de temps ? {duree} en tout. Plusieurs personnes peuvent se partager les lignes :',
        'un seul nom suffit par ligne.',
        "Commencez par les lignes « Important : Oui » (argent ou sécurité).",
        '',
        "Les noms servent uniquement à la vérification au sein de l'équipe ; ils ne sont jamais publiés.",
    ]
    for ligne in texte:
        ws.append([ligne])
    ws['A1'].font = Font(bold=True, size=13)
    ws.column_dimensions['A'].width = 110


def exporter(dossier, sortie, nom_langue):
    """Paraphrases encore à vérifier -> tableur, phrases importantes d'abord."""
    _, paraphrases = _lire(dossier / 'paraphrases.csv')
    with open(dossier / 'corpus.csv', encoding='utf-8-sig', newline='') as f:
        corpus = {r['id']: r for r in csv.DictReader(f)}
    lignes = [p for p in paraphrases if _a_verifier(p) and p['id'] in corpus]
    lignes.sort(key=lambda p: (corpus[p['id']]['critique'] != '1', list(corpus).index(p['id'])))
    wb = Workbook()
    _guide(wb, nom_langue, len(lignes))
    ws = wb.create_sheet(ONGLET)
    ws.append(COLONNES)
    for cellule in ws[1]:
        cellule.font = Font(bold=True, color='FFFFFF')
        cellule.fill = PatternFill('solid', fgColor='0F4C5C')
        cellule.alignment = Alignment(wrap_text=True, vertical='top')
    jaune = PatternFill('solid', fgColor='FFF2CC')
    for p in lignes:
        ligne = corpus[p['id']]
        ws.append([p['id'], 'Oui' if ligne['critique'] == '1' else 'Non', ligne['fr'], p['fr'], p.get('commentaire', ''), '', '', ''])
        for colonne in range(1, len(COLONNES) + 1):
            ws.cell(ws.max_row, colonne).alignment = Alignment(wrap_text=True, vertical='top')
        for colonne in (6, 7, 8):
            ws.cell(ws.max_row, colonne).fill = jaune
    choix = DataValidation(type='list', formula1='"oui,non"', allow_blank=True)
    ws.add_data_validation(choix)
    choix.add(f'F2:F{max(2, ws.max_row)}')
    for i, largeur in enumerate(LARGEURS):
        ws.column_dimensions[chr(65 + i)].width = largeur
    ws.freeze_panes = 'A2'
    wb.save(sortie)
    print(f'{len(lignes)} paraphrases à vérifier -> {sortie}')


def importer(wb, dossier):
    """« oui » + un nom (autre que celui qui l'a proposée) : vérifiée ; « non » : retirée de paraphrases.csv."""
    chemin = dossier / 'paraphrases.csv'
    entetes, paraphrases = _lire(chemin)
    rangs = list(wb[ONGLET].iter_rows(values_only=True))
    tete = [str(h).strip() if h is not None else '' for h in rangs[0]]
    reponses = {}
    for rang in rangs[1:]:
        r = dict(zip(tete, ('' if v is None else str(v).strip() for v in rang)))
        if r.get('Réf.') and r.get('Autre façon de dire'):
            reponses[(r['Réf.'], r['Autre façon de dire'])] = r
    verifiees, retirees, sans_nom, gardees = 0, [], 0, []
    for p in paraphrases:
        r = reponses.get((p['id'], p['fr'].strip()))
        decision = (r or {}).get('MÊME SENS ? (oui / non)', '').lower()
        nom = (r or {}).get('Vérifié par', '')
        commentaire = (r or {}).get('Commentaire', '')
        if decision == 'non':
            retirees.append(f"  {p['id']} : « {p['fr']} »{f' ({commentaire})' if commentaire else ''}")
            continue
        if decision == 'oui' and _a_verifier(p):
            if nom and nom.lower() != (p.get('propose_par') or '').strip().lower():
                p['verifie_par'] = nom
                verifiees += 1
            else:
                sans_nom += 1
        if commentaire and decision != 'non':
            p['commentaire'] = ' | '.join(x for x in (p.get('commentaire', ''), commentaire) if x)
        gardees.append(p)
    with open(chemin, 'w', encoding='utf-8-sig', newline='') as f:
        ecrire = csv.DictWriter(f, fieldnames=entetes)
        ecrire.writeheader()
        ecrire.writerows(gardees)
    print(f'paraphrases : {verifiees} vérifiées, {len(retirees)} retirées (sens différent)'
          + (f", {sans_nom} « oui » sans nom valable (non comptées)" if sans_nom else '') + ' -> paraphrases.csv')
    if retirees:
        print('\n'.join(retirees))
