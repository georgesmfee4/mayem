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


# Mots-outils du glossaire : les citer sous chaque texte n'aiderait pas le traducteur
OUTILS = {'comme', 'vers', 'pour', 'avec', 'dans', 'sans', 'mon', 'mes', 'votre', 'vos', 'plus', 'tous', 'comment', 'quels', 'voir'}


def termes_valides():
    lignes = lire(DOSSIER / 'glossaire.csv')
    if not lignes:
        return []
    fr = list(lignes[0])[1]
    cible = next(k for k in lignes[0] if 'TRADUCTION' in k.upper())
    termes = []
    for r in lignes:
        traduction = r[cible].strip()
        if traduction and not traduction.startswith('-'):
            for forme in r[fr].split('/'):
                forme = re.sub(r'\s*\([^)]*\)', '', forme).strip()
                if len(forme) > 3 and comparable(forme) not in OUTILS and '(' not in traduction:
                    termes.append((comparable(forme), forme, traduction))
    # Les termes longs d'abord : « code secret oublié » avant « code »
    return sorted(set(termes), key=lambda t: -len(t[0]))


TERMES = termes_valides()


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
        f'Classeur des textes du service : {nom_service}',
        'POURQUOI CE CLASSEUR',
        f'Mayem doit afficher en {LANGUE} ce que montrent les services d\'argent mobile (USSD, application, SMS) et comprendre ce que les '
        'gens leur demandent. Les textes viennent de vrais écrans photographiés, mais chacun est écrit une seule fois, comme une phrase '
        'de référence : la même traduction servira pour tous les services et toutes les applications qui affichent ce texte.',
        'PAR OÙ COMMENCER',
        '1. Onglet « Textes relevés » : traduisez la colonne « TEXTE DE RÉFÉRENCE ». Pour comprendre le contexte, lisez « Sens, à savoir », '
        '« Sur le même écran » (les autres lignes affichées avec ce texte) et cliquez « Voir la capture » pour l\'écran complet.',
        "2. « Autres écritures vues » : le même texte écrit autrement à l'écran (sans accent, en majuscules, en anglais). Votre traduction "
        'vaut pour toutes ces écritures : ne les traduisez pas à part.',
        '3. « Termes déjà validés dans ce texte » : gardez ces mots-là, pour que la langue reste la même partout.',
        '4. Puis « Mots du métier » et « Demandes ». L\'onglet « Écrans » liste des écrans types pas encore vus sur un téléphone.',
        'CE QUI NE SE TRADUIT JAMAIS',
        '• {name} : la case du nom d\'un service, d\'une société ou d\'une offre (MTN MoMo, Orange Money, ENEO…). Gardez {name} tel quel, '
        'une fois, à la bonne place dans la phrase. C\'est ce qui rend la traduction valable pour tous les services.',
        '• Les montants, numéros, codes, dates et les cases {amount}, {count}, {date} restent exactement comme en français.',
        '• Les noms de l\'onglet « Services » (marques, offres, pays, opérateurs) restent tels quels.',
        'LES COLONNES QUI SE CALCULENT TOUTES SEULES',
        '• Longueur : rouge si la traduction dépasse la longueur conseillée (bouton ou ligne de menu trop longs pour l\'écran).',
        '• Cases {…} : « à revoir » si la traduction n\'a pas autant de cases que le français.',
        '• État : à traduire, à relire, validé (deux noms différents), déjà validé. Le Récapitulatif suit l\'avancement par thème.',
        '• Portée : « commun » sert à tous les services ; « propre au service » (en jaune) décrit une offre de ce service seulement.',
        'LES COULEURS',
        '• Jaune : à remplir. Gris : déjà validé, ne pas changer. Réf. en rouge : message d\'erreur ou question posée à la personne, à soigner en premier.',
        'RÈGLES',
        '• Une ligne compte quand elle porte deux noms différents (« Traduit par », « Relu par »).',
        "• Écrans secrets (code secret, code reçu par SMS) : on traduit l'invite, jamais ce que la personne tape.",
        '• Utilisez les filtres en haut des colonnes (par thème, genre, état) pour travailler par morceaux.',
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
                                'Traduit par', 'Relu par', 'Commentaire'], [14, 11, 30, 6, 13, 18, 44, 40, 30, 44, 34, 9, 12, 12, 26])
    lignes = lire(SOCLE / 'parcours.csv')
    for r in lignes:
        deja = VALIDEES.get(comparable(r['texte_fr']))
        note = (f'Déjà validé ({deja[0]}). ' if deja else '') + r['a_noter']
        ws.append([r['ref'], r['canal'], r['parcours'], int(r['etape']), r['type'], r['intention'], r['texte_fr'], None, note, deja[1] if deja else None])
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
    ws.auto_filter.ref = ws.dimensions
    return len(lignes)


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


# Textes lus sur de vrais écrans (flux/argent-mobile/textes.csv) : un texte de référence par sens, pour tous les services
ENTETES_TEXTES = ['Réf.', 'Thème', 'Genre', 'Où', 'TEXTE DE RÉFÉRENCE (français)', 'Autres écritures vues', 'Sens, à savoir',
                  'Sur le même écran (contexte)', 'Vu dans', 'Portée', 'Termes déjà validés dans ce texte', f'TRADUCTION {MAJ}',
                  'Longueur conseillée', 'Longueur', 'Cases {…}', 'Traduit par', 'Relu par', 'État', 'Commentaire', 'Voir la capture']
LONGUEUR = {'choix de menu': 30, 'bouton': 22, 'onglet': 16, 'filtre': 16, 'case à cocher': 30, 'lien': 25, 'champ à remplir': 30, 'rubrique': 22}
GENRES_CRITIQUES = {"message d'erreur", 'invite'}


def captures_du_profil():
    profil = racine / 'profiles' / f'{SERVICE}.json'
    nom = json.load(open(profil, encoding='utf-8')).get('nom', SERVICE) if profil.exists() else SERVICE
    return {c['ref']: dict(c, service=nom) for c in lire_profil('captures.csv')}


def lignes_ecran(texte):
    return [l.strip() for l in texte.splitlines() if l.strip() and not l.startswith('[')]


def contexte(t, captures):
    vus = [captures[c] for c in t['captures'].split() if c in captures]
    if not vus:
        return '', ''
    formes = {comparable(f) for f in [t['texte'], *t['formes_vues'].split('|')] if f.strip()}
    autres = [l for l in lignes_ecran(vus[0]['texte']) if comparable(re.sub(r'^\d+[.)]\s*', '', l)) not in formes]
    ecran = ' · '.join(autres[:9]) + (' · …' if len(autres) > 9 else '')
    ou = ' ; '.join(f"{c['service']}, {'USSD' if c['code'].startswith('*') else c['code']} : {c['chemin']}" for c in vus[:3])
    return ecran, ou


def termes_presents(texte):
    vu, cites = f' {comparable(texte)} ', []
    for cle, forme, traduction in TERMES:
        if f' {cle} ' in vu and cle != comparable(texte):
            cites.append(f'{forme} = {traduction}')
            vu = vu.replace(f' {cle} ', ' | ')
    return ' ; '.join(cites[:4])


def deja_valide(t):
    for forme in [t['texte'], *t['formes_vues'].split('|')]:
        trouve = VALIDEES.get(comparable(forme)) if forme.strip() else None
        if trouve:
            return trouve
    return None


def onglet_textes(wb):
    ws = feuille(wb, 'Textes relevés', ENTETES_TEXTES, [9, 16, 14, 11, 38, 26, 34, 40, 30, 12, 30, 38, 9, 8, 10, 12, 12, 12, 24, 11])
    ws.freeze_panes = 'F2'
    captures = captures_du_profil()
    lignes_captures = {ref: n for n, ref in enumerate(captures, 2)}
    textes = lire(SOCLE / 'textes.csv')
    for n, t in enumerate(textes, 2):
        ecran, ou = contexte(t, captures)
        deja = deja_valide(t)
        canal = 'ussd' if 'ussd' in t['canaux'] else 'application'
        limite = LONGUEUR.get(t['genre'], 160 if canal == 'ussd' else 90)
        ws.append([t['ref'], t['theme'], t['genre'], t['canaux'], t['texte'], t['formes_vues'] or None, t['sens'] or None, ecran or None,
                   ou or None, t['portee'], termes_presents(t['texte']) or None, deja[1] if deja else None, limite,
                   f'=IF(L{n}="","",LEN(L{n}))',
                   f'=IF(L{n}="","",IF(LEN(E{n})-LEN(SUBSTITUTE(E{n},"{{",""))=LEN(L{n})-LEN(SUBSTITUTE(L{n},"{{","")),"ok","à revoir"))',
                   None, None,
                   f'=IF(L{n}="","à traduire",IF(LEFT(S{n},11)="Déjà validé","déjà validé",IF(OR(P{n}="",Q{n}=""),"à relire",'
                   f'IF(P{n}=Q{n},"deux noms différents","validé"))))',
                   f'Déjà validé ({deja[0]})' if deja else None, None])
        premiere = next((c for c in t['captures'].split() if c in lignes_captures), None)
        if premiere:
            lien = ws.cell(n, 20, premiere)
            lien.hyperlink = f"#'Captures'!A{lignes_captures[premiere]}"
            lien.font = Font(color='0563C1', underline='single')
    habiller(ws, (12, 16, 17), critique=lambda l: l[2].value in GENRES_CRITIQUES)
    fin = ws.max_row
    for ligne in ws.iter_rows(min_row=2):
        if ligne[11].value:
            ligne[11].fill = DEJA
        if ligne[9].value != 'commun':
            ligne[9].fill = PatternFill('solid', fgColor='FFF1C2')
        ligne[4].font = Font(bold=True)
    etats = {'à traduire': 'FFF8E1', 'à relire': 'E6F0F7', 'validé': 'D7EFDD', 'déjà validé': 'E8EEF0', 'deux noms différents': 'F9D3B8'}
    for etat, couleur in etats.items():
        ws.conditional_formatting.add(f'R2:R{fin}', FormulaRule(formula=[f'R2="{etat}"'], fill=PatternFill('solid', fgColor=couleur)))
    ws.conditional_formatting.add(f'N2:N{fin}', FormulaRule(formula=['AND(N2<>"",N2>M2)'], fill=PatternFill('solid', fgColor='F4B4AE')))
    ws.conditional_formatting.add(f'O2:O{fin}', FormulaRule(formula=['O2="à revoir"'], fill=PatternFill('solid', fgColor='F4B4AE')))
    choix(ws, 'J', ['commun', 'propre au service'])
    ws.auto_filter.ref = f'A1:T{fin}'
    return len(textes)


def onglet_captures(wb):
    ws = feuille(wb, 'Captures', ['Capture', 'Relevé le', 'Heure', 'Service', 'Code ou application', 'Chemin (touches ou écrans)', 'Chemin sûr ?',
                                  "Texte complet tel qu'affiché", 'Textes repris (onglet Textes relevés)', 'Reste à relever'],
                 [9, 11, 7, 14, 16, 34, 11, 52, 30, 44])
    captures = captures_du_profil()
    for c in captures.values():
        ws.append([c['ref'], c['releve_le'], c['heure'], c['service'], c['code'], c['chemin'], c['certitude'], c['texte'],
                   c.get('textes') or None, c['a_verifier'] or None])
    habiller(ws, ())
    couleurs = {'sûr': 'D7EFDD', 'probable': 'FFF1C2', 'inconnu': 'F9D3B8'}
    for ligne in ws.iter_rows(min_row=2):
        ligne[6].fill = PatternFill('solid', fgColor=couleurs.get(ligne[6].value, 'FFFFFF'))
    ws.auto_filter.ref = ws.dimensions
    return len(captures)


def recapitulatif(wb, comptes):
    ws = feuille(wb, 'Récapitulatif', ['Onglet', 'Lignes', 'Qui', 'Ordre conseillé'], [30, 12, 30, 50])
    ordre = {'Textes relevés': ('Les locuteurs', "1. Traduire les textes vus sur de vrais écrans (rouge d'abord)"),
             'Captures': ("L'équipe", "Écrans photographiés : le contexte de chaque texte"),
             'Mots du métier': ('Les locuteurs', "2. Traduire les mots (critiques d'abord)"),
             'Demandes': ('Les locuteurs', '3. Dire chaque demande de cinq façons'),
             'Écrans': ("L'équipe puis les locuteurs", '4. Écrans types pas encore vus sur un téléphone'),
             'Codes': ("L'équipe", 'Vérifier les codes sur un téléphone'), 'Services': ("L'équipe", 'Confirmer les noms'),
             'Touches': ("L'équipe", 'Relever les touches de chaque opération')}
    for onglet, n in comptes.items():
        ws.append([onglet, n, *ordre.get(onglet, ('', ''))])
    if 'Textes relevés' not in comptes:
        return
    ws.append([])
    ws.append(['AVANCEMENT DES TEXTES RELEVÉS (se met à jour tout seul)', 'Textes', 'Traduits et validés', 'Part'])
    for c in ws[ws.max_row]:
        c.font = Font(bold=True)
    themes = list(dict.fromkeys(t['theme'] for t in lire(SOCLE / 'textes.csv')))
    plage = "'Textes relevés'!"
    for theme in themes + ['Tous']:
        n = ws.max_row + 1
        filtre = f'{plage}B:B,"{theme}",' if theme != 'Tous' else ''
        total = f'=COUNTIFS({plage}B:B,"{theme}")' if theme != 'Tous' else f'=COUNTA({plage}A:A)-1'
        faits = f'=COUNTIFS({filtre}{plage}R:R,"validé")+COUNTIFS({filtre}{plage}R:R,"déjà validé")'
        ws.append([theme, total, faits, f'=IF(B{n}=0,"",C{n}/B{n})'])
        ws.cell(n, 4).number_format = '0%'
    ws.conditional_formatting.add(f'D2:D{ws.max_row}', FormulaRule(formula=['AND(ISNUMBER(D2),D2>=1)'], fill=PatternFill('solid', fgColor='D7EFDD')))


def main():
    wb = Workbook()
    comptes = {'Textes relevés': onglet_textes(wb), 'Captures': onglet_captures(wb), 'Mots du métier': onglet_mots(wb),
               'Demandes': onglet_demandes(wb), 'Écrans': onglet_ecrans(wb), 'Services': onglet_services(wb), 'Codes': onglet_codes(wb),
               'Touches': onglet_touches(wb)}
    recapitulatif(wb, comptes)
    mode_emploi(wb, comptes)
    wb.move_sheet("Mode d'emploi", offset=-(len(wb.sheetnames) - 1))
    # L'import retrouve le profil à mettre à jour, même si le fichier est renommé
    wb.properties.subject = SERVICE
    chemin = racine / f'service-{SERVICE}-{LANGUE}.xlsx'
    wb.save(chemin)
    deja = sum(1 for t in lire(SOCLE / 'textes.csv') if deja_valide(t))
    print(f'{chemin.name} : {", ".join(f"{k} {v}" for k, v in comptes.items())} ; {deja} textes relevés déjà traduits')


if __name__ == '__main__':
    main()
