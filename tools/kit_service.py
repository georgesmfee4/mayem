#!/usr/bin/env python3
"""Classeur d'un service existant (argent mobile, téléphonie) pour l'équipe et les locuteurs.

  python3 tools/kit_service.py <service> [--langue X]      ->  service-<service>-<langue>.xlsx à la racine

<service> est un dossier de profiles/ (profiles/mtn-cm/ : services.csv, codes.csv, raccourcis.csv). Les parcours,
les intentions, les situations et les mots du métier viennent du socle commun flux/argent-mobile/ : un autre service
reprend le même socle, seuls ses noms, ses codes et ses touches changent. Deux temps : l'équipe relève sur un vrai
téléphone le texte exact de chaque écran et vérifie les codes ; les locuteurs traduisent. Une traduction déjà
validée dans le pack arrive pré-remplie. Retour : python3 tools/import_finale.py <classeur>
"""
import csv, json, pathlib, re, sys, unicodedata
try:
    from openpyxl import Workbook
except ImportError:
    sys.exit("openpyxl manque. L'installer une fois : python -m pip install openpyxl")
from openpyxl.formatting.rule import FormulaRule
from openpyxl.styles import Alignment, Font, PatternFill
from openpyxl.utils import get_column_letter
from openpyxl.worksheet.datavalidation import DataValidation

racine = pathlib.Path(__file__).resolve().parent.parent
SOCLE = racine / 'flux' / 'argent-mobile'

ARGS = sys.argv[1:]
if not ARGS or ARGS[0].startswith('--'):
    sys.exit(__doc__)
SERVICE = ARGS[0]
PROFIL = racine / 'profiles' / SERVICE
if not PROFIL.is_dir():
    sys.exit(f'Profil introuvable : profiles/{SERVICE}/')
presentes = sorted(p.parent.name for p in (racine / 'packs').glob('*/infos.json'))
CODE = ARGS[ARGS.index('--langue') + 1] if '--langue' in ARGS else (presentes[0] if len(presentes) == 1 else sys.exit('Ajouter --langue <code>'))
DOSSIER = racine / 'packs' / CODE
NOM = json.load(open(DOSSIER / 'infos.json', encoding='utf-8'))['nom']
LANGUE, MAJ = NOM.lower(), NOM.upper()

ENTETE = PatternFill('solid', fgColor='0F6B5C')
A_REMPLIR = PatternFill('solid', fgColor='FFF8E1')
DEJA = PatternFill('solid', fgColor='E8EEF0')
CRITIQUE = PatternFill('solid', fgColor='FDE2E1')
FIABILITE = {"vu à l'écran": 'D7EFDD', 'concordant': 'D7EFDD', 'officiel': 'D7EFDD', 'vérifié': 'B8E0C2', 'presse': 'E6F0F7', 'à vérifier': 'FFF1C2', 'contradictoire': 'F9D3B8'}
TYPES_CRITIQUES = {'recapitulatif', 'alerte', 'erreur'}


def lire(chemin):
    with open(chemin, encoding='utf-8-sig', newline='') as f:
        return list(csv.DictReader(f))


def comparable(texte):
    sans = ''.join(c for c in unicodedata.normalize('NFD', texte.lower()) if unicodedata.category(c) != 'Mn')
    sans = re.sub(r"['’]", ' ', sans)
    return re.sub(r'[\s.!?:;,]+$', '', re.sub(r'\s+', ' ', sans)).strip()


# Traductions déjà validées : phrases du corpus et termes du glossaire, retrouvées par leur français
def validees():
    trouvees = {}
    for r in lire(DOSSIER / 'corpus.csv'):
        if r.get('valide') == '1' and r.get('cible', '').strip():
            trouvees.setdefault(comparable(r['fr']), (r['id'], r['cible'].strip()))
    lignes = lire(DOSSIER / 'glossaire.csv')
    if lignes:
        fr = list(lignes[0])[1]
        cible = next(k for k in lignes[0] if 'TRADUCTION' in k.upper())
        for r in lignes:
            traduction = r[cible].strip()
            if traduction and not traduction.startswith('-') and '(' not in traduction:
                for forme in r[fr].split('/'):
                    trouvees.setdefault(comparable(re.sub(r'\s*\([^)]*\)', '', forme)), (r[list(r)[0]], traduction))
    return trouvees


VALIDEES = validees()


def lire_profil(nom):
    chemin = PROFIL / nom
    return lire(chemin) if chemin.exists() else []


def feuille(wb, titre, entetes, largeurs):
    ws = wb.create_sheet(titre)
    ws.append(entetes)
    for i, largeur in enumerate(largeurs, 1):
        ws.column_dimensions[get_column_letter(i)].width = largeur
        c = ws.cell(1, i)
        c.fill, c.font = ENTETE, Font(bold=True, color='FFFFFF')
        c.alignment = Alignment(wrap_text=True, vertical='center')
    ws.row_dimensions[1].height = 48
    ws.freeze_panes = 'C2'
    return ws


def habiller(ws, a_remplir, critique=None):
    for ligne in ws.iter_rows(min_row=2):
        for c in ligne:
            c.alignment = Alignment(wrap_text=True, vertical='top')
            if c.column in a_remplir and c.value in (None, ''):
                c.fill = A_REMPLIR
        if critique and critique(ligne):
            ligne[0].fill = CRITIQUE


def choix(ws, colonne, valeurs):
    regle = DataValidation(type='list', formula1='"' + ','.join(valeurs) + '"', allow_blank=True)
    ws.add_data_validation(regle)
    regle.add(f'{colonne}2:{colonne}{max(ws.max_row, 2)}')


def mode_emploi(wb, comptes):
    ws = wb.active
    ws.title = "Mode d'emploi"
    ws.column_dimensions['A'].width = 115
    nom_service = lire(PROFIL / 'services.csv')[0]['nom'] if (PROFIL / 'services.csv').exists() else SERVICE
    lignes = [
        f'Classeur du service : {nom_service}',
        'POURQUOI CE CLASSEUR',
        f'Mayem doit afficher en {LANGUE} tout ce que ce service montre (USSD, application, SMS, serveur vocal) et comprendre ce que '
        'les gens lui demandent. Ce classeur rassemble tout le parcours du service, écran par écran.',
        'DEUX TEMPS, DEUX ÉQUIPES',
        "1. L'équipe relève sur un vrai téléphone : pour chaque écran, recopiez le texte EXACT dans la colonne « Texte exact relevé » "
        "(gardez les majuscules et la ponctuation). Vérifiez chaque code de l'onglet « Codes » et notez ce qui s'affiche vraiment. "
        "Notez les touches de chaque opération dans l'onglet « Touches ».",
        "Déjà relevé : les écrans photographiés sur un téléphone sont recopiés dans l'onglet « Captures » (texte complet, chemin "
        "des touches, ce qui reste à relever) et leurs lignes sont déjà dans « Texte exact relevé ». Un chemin « probable » ou « inconnu » est à confirmer.",
        f"2. Les locuteurs traduisent le texte exact relevé (ou, s'il n'a pas pu être relevé, le texte type) dans la colonne « TRADUCTION {MAJ} ».",
        'CE QUI NE SE TRADUIT JAMAIS',
        "• Les noms des services et des marques (onglet « Services ») restent tels quels : ce sont des noms propres.",
        '• Les montants, numéros, dates, références et les cases {amount}, {name}… restent exactement comme en français, une fois chacune.',
        'LES COULEURS',
        '• Jaune : à remplir. Gris : déjà validé, ne pas changer. Réf. en rouge : écran critique (récapitulatif, alerte, erreur), à soigner en premier.',
        '• Fiabilité des codes : vert = concordant ou officiel, bleu = presse, jaune = à vérifier, orange = contradictoire entre les sources.',
        'RÈGLES',
        '• Une ligne compte quand elle porte deux noms différents (« Traduit par », « Relu par »).',
        "• Écrans secrets (code secret, code reçu par SMS) : on traduit l'invite, jamais ce que la personne tape.",
        '• Le parcours est le même pour tous les services d\'argent mobile : une traduction faite ici sert aussi pour les autres opérateurs.',
        'CONTENU',
        *[f'• {onglet} : {n} lignes' for onglet, n in comptes.items()],
    ]
    for t in lignes:
        ws.append([t])
        c = ws.cell(ws.max_row, 1)
        c.alignment = Alignment(wrap_text=True, vertical='top')
        if t.isupper():
            c.font = Font(bold=True)
    ws['A1'].font = Font(bold=True, size=14, color='0F6B5C')


def onglet_services(wb):
    ws = feuille(wb, 'Services', ['Nom (ne se traduit pas)', 'Type', 'Canaux', 'Ce que fait le service', 'Fiabilité', 'Source',
                                  'Vérifié sur un téléphone (oui / non)', 'Vérifié par', 'Commentaire'], [30, 20, 22, 50, 15, 34, 16, 14, 30])
    lignes = lire(PROFIL / 'services.csv')
    for r in lignes:
        ws.append([r['nom'], r['type'], r['canaux'], r['description'], r['fiabilite'], r['source']])
    habiller(ws, (7, 8))
    for ligne in ws.iter_rows(min_row=2):
        ligne[4].fill = PatternFill('solid', fgColor=FIABILITE.get(ligne[4].value, 'FFFFFF'))
    choix(ws, 'G', ['oui', 'non'])
    return len(lignes)


def onglet_codes(wb):
    ws = feuille(wb, 'Codes', ['Code', 'Service', 'À quoi il sert', 'Intention Mayem', 'Fiabilité', 'Source', 'Vérifié (oui / non)',
                               'Ce qui s\'affiche vraiment (premier écran)', 'Vérifié par', 'Commentaire'], [14, 26, 44, 18, 15, 34, 12, 44, 14, 30])
    lignes = lire(PROFIL / 'codes.csv')
    for r in lignes:
        verifie = r['fiabilite'] == 'vérifié'
        ws.append([r['code'], r['service'], r['utilite'], r['intention'], r['fiabilite'], r['source'],
                   'oui' if verifie else None, r.get('premier_ecran') or None, r.get('verifie_par') or None])
    habiller(ws, (7, 8, 9))
    for ligne in ws.iter_rows(min_row=2):
        ligne[4].fill = PatternFill('solid', fgColor=FIABILITE.get(ligne[4].value, 'FFFFFF'))
    choix(ws, 'G', ['oui', 'non'])
    return len(lignes)


def onglet_ecrans(wb):
    ws = feuille(wb, 'Écrans', ['Réf.', 'Canal', 'Parcours', 'Étape', 'Type', 'Intention', 'Texte type (français)',
                                'TEXTE EXACT RELEVÉ À L\'ÉCRAN', 'À savoir', f'TRADUCTION {MAJ}', 'Version USSD courte', 'Longueur USSD',
                                'Traduit par', 'Relu par', 'Commentaire', 'Chemin sur le téléphone', 'Capture'],
                 [14, 11, 30, 6, 13, 18, 44, 40, 30, 44, 34, 9, 12, 12, 26, 30, 16])
    lignes = lire(SOCLE / 'parcours.csv')
    releves = {r['ref']: r for r in lire_profil('releves.csv')}
    for r in lignes:
        releve = releves.get(r['ref'], {})
        deja, note = traduction_connue(r['texte_fr'], releve.get('texte_exact'))
        ws.append([r['ref'], r['canal'], r['parcours'], int(r['etape']), r['type'], r['intention'], r['texte_fr'],
                   releve.get('texte_exact') or None, note + r['a_noter'], deja, None, None, None, None, None,
                   releve.get('chemin') or None, releve.get('capture') or None])
    habiller(ws, (8, 10, 11, 13, 14), critique=lambda l: l[4].value in TYPES_CRITIQUES)
    for ligne in ws.iter_rows(min_row=2):
        if ligne[9].value:
            ligne[9].fill = DEJA
        if ligne[1].value != 'ussd':
            ligne[10].value = 'pas besoin'
            ligne[10].fill = DEJA
    for n in range(2, ws.max_row + 1):
        ws.cell(n, 12, f'=IF(K{n}="","",IF(K{n}="pas besoin","",LEN(K{n})))')
    ws.conditional_formatting.add(f'L2:L{ws.max_row}', FormulaRule(formula=['AND(L2<>"",L2>160)'], fill=PatternFill('solid', fgColor='F4B4AE')))
    return len(lignes)


# Le texte relevé est celui qui se traduit : une traduction validée du texte type n'y est qu'une piste
def traduction_connue(texte_type, releve):
    if releve:
        deja = VALIDEES.get(comparable(releve))
        if deja:
            return deja[1], f'Déjà validé ({deja[0]}). '
        piste = VALIDEES.get(comparable(texte_type))
        return None, (f'Piste : le texte type est déjà traduit « {piste[1]} » ({piste[0]}), à adapter au texte relevé. ' if piste else '')
    deja = VALIDEES.get(comparable(texte_type))
    return (deja[1], f'Déjà validé ({deja[0]}). ') if deja else (None, '')


def onglet_demandes(wb):
    # Mêmes colonnes que le tableur « Comment les gens demandent » : l'import est le même
    ws = feuille(wb, 'Demandes', ['Réf.', 'Priorité', 'Intention', 'Situation', 'Exemple en français (ne pas traduire mot à mot)', 'À savoir',
                                  'Façon 1 : comme à un proche', 'Façon 2 : poliment, à un agent', 'Façon 3 : très courte, comme un SMS',
                                  'Façon 4 : en mêlant le français, comme on parle vraiment', 'Façon 5 : autre façon', 'Écrit par',
                                  'Vérifié par (on dit vraiment ainsi)', 'Commentaire'], [7, 8, 18, 42, 32, 26, 30, 30, 26, 30, 26, 12, 14, 24])
    lignes = lire(SOCLE / 'demandes.csv')
    for r in lignes:
        ws.append([r['ref'], r['priorite'], r['intention'], r['situation'], r['exemple_fr'], r['a_noter']])
    habiller(ws, range(7, 14), critique=lambda l: l[1].value == 'P1')
    return len(lignes)


def onglet_mots(wb):
    ws = feuille(wb, 'Mots du métier', ['Réf.', 'Terme', 'Anglais', 'Sens dans le service', 'Critique (argent ou sécurité)',
                                        f'Terme {LANGUE} déjà validé', f'TRADUCTION {MAJ}', 'Traduit par', 'Relu par', 'Commentaire'],
                 [7, 24, 20, 46, 12, 26, 30, 12, 12, 26])
    lignes = lire(SOCLE / 'mots.csv')
    for r in lignes:
        deja = next((VALIDEES[k] for k in (comparable(f.strip()) for f in r['terme'].split('/')) if k in VALIDEES), None)
        ws.append([r['ref'], r['terme'], r['anglais'], r['sens'], 'oui' if r['critique'] == '1' else '', deja[1] if deja else None])
    habiller(ws, (7, 8, 9), critique=lambda l: l[4].value == 'oui')
    for ligne in ws.iter_rows(min_row=2):
        if ligne[5].value:
            ligne[5].fill = DEJA
    return len(lignes)


def onglet_touches(wb):
    intentions = {r['id']: r for r in lire(SOCLE / 'intentions.csv')}
    ws = feuille(wb, 'Touches', ['Intention', 'Ce que veut la personne', 'Valeurs nécessaires', 'Exemple de demande',
                                 'Touches à taper depuis le premier écran', 'Exemple de notation', 'Relevé par', 'Commentaire',
                                 'Début déjà relevé sur le téléphone'],
                 [20, 44, 24, 36, 34, 34, 14, 26, 44])
    lignes = lire(PROFIL / 'raccourcis.csv')
    for r in lignes:
        i = intentions.get(r['intention'], {})
        ws.append([r['intention'], i.get('description', ''), i.get('valeurs', ''), i.get('exemple_fr', ''), r['touches'] or None,
                   '*123# puis 2 > 1 > 1 > {telephone} > {montant}' if r['intention'] == 'transfert' else None, r['releve_par'] or None,
                   None, r.get('debut_releve') or None])
    habiller(ws, (5, 7))
    return len(lignes)


def onglet_captures(wb):
    ws = feuille(wb, 'Captures', ['Capture', 'Relevé le', 'Heure', 'Code ou application', 'Chemin (touches ou écrans)', 'Chemin sûr ?',
                                  "Texte complet tel qu'affiché", 'Repris dans Écrans', 'Reste à relever'], [9, 11, 7, 11, 30, 11, 52, 30, 44])
    lignes = lire_profil('captures.csv')
    for r in lignes:
        ws.append([r['ref'], r['releve_le'], r['heure'], r['code'], r['chemin'], r['certitude'], r['texte'], r['ecrans'], r['a_verifier'] or None])
    habiller(ws, ())
    couleurs = {'sûr': 'D7EFDD', 'probable': 'FFF1C2', 'inconnu': 'F9D3B8'}
    for ligne in ws.iter_rows(min_row=2):
        ligne[5].fill = PatternFill('solid', fgColor=couleurs.get(ligne[5].value, 'FFFFFF'))
    return len(lignes)


def recapitulatif(wb, comptes):
    ws = feuille(wb, 'Récapitulatif', ['Onglet', 'Lignes', 'Qui', 'Ordre conseillé'], [24, 10, 30, 50])
    ordre = {'Codes': ("L'équipe", '1. Vérifier les codes sur un téléphone'), 'Services': ("L'équipe", '1. Confirmer les services'),
             'Touches': ("L'équipe", '2. Relever les touches de chaque opération'),
             'Écrans': ("L'équipe puis les locuteurs", '3. Relever le texte exact, puis traduire (rouge d\'abord)'),
             'Mots du métier': ('Les locuteurs', '4. Traduire les mots (critiques d\'abord)'),
             'Demandes': ('Les locuteurs', '5. Dire chaque demande de cinq façons'),
             'Captures': ("L'équipe", "Écrans déjà relevés sur un téléphone, tels qu'affichés")}
    for onglet, n in comptes.items():
        ws.append([onglet, n, *ordre.get(onglet, ('', ''))])


def main():
    wb = Workbook()
    comptes = {'Services': onglet_services(wb), 'Codes': onglet_codes(wb), 'Touches': onglet_touches(wb), 'Écrans': onglet_ecrans(wb),
               'Mots du métier': onglet_mots(wb), 'Demandes': onglet_demandes(wb)}
    if (PROFIL / 'captures.csv').exists():
        comptes['Captures'] = onglet_captures(wb)
    recapitulatif(wb, comptes)
    mode_emploi(wb, comptes)
    wb.move_sheet("Mode d'emploi", offset=-(len(wb.sheetnames) - 1))
    # L'import retrouve le profil à mettre à jour, même si le fichier est renommé
    wb.properties.subject = SERVICE
    chemin = racine / f'service-{SERVICE}-{LANGUE}.xlsx'
    wb.save(chemin)
    releves = {r['ref']: r['texte_exact'] for r in lire_profil('releves.csv')}
    deja = sum(1 for r in lire(SOCLE / 'parcours.csv') if traduction_connue(r['texte_fr'], releves.get(r['ref']))[0])
    print(f'{chemin.name} : {", ".join(f"{k} {v}" for k, v in comptes.items())} ; {len(releves)} textes relevés ; {deja} écrans déjà traduits')


if __name__ == '__main__':
    main()
