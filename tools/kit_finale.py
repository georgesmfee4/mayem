#!/usr/bin/env python3
"""Tableurs des locuteurs pour la finale : comprendre les demandes et répondre sur chaque canal.

  python3 tools/kit_finale.py            -> quatre tableurs finale-*-<langue>.xlsx à la racine
  python3 tools/kit_finale.py --restants -> retours-finale-<langue>.xlsx : seulement ce qui manque encore
  python3 tools/kit_finale.py --gsm7     -> ecriture-ussd-<langue>.xlsx : écrire sur l'USSD les lettres absentes du téléphone
  python3 tools/kit_finale.py --complement -> finale-1b-demandes-<langue>.xlsx : demandes et mots pas encore recueillis
  python3 tools/kit_finale.py --test2    -> finale-4b-test-aveugle-2-<langue>.xlsx : second test, nouvelles situations
  python3 tools/kit_finale.py --jury     -> finale-jury-<langue>.xlsx : les dix scénarios du jury, 15 façons par situation
  python3 tools/kit_finale.py --termes-revus -> termes-revus-<langue>.xlsx : phrases qui emploient encore un terme abandonné
  python3 tools/kit_finale.py --langue X -> s'il y a plusieurs langues

Les textes français viennent de packs/<langue>/finale/*.csv. Une phrase déjà validée du corpus
(colonne reprise, ou même français exactement) arrive pré-remplie : on ne la refait pas.
"""
import collections, csv, json, pathlib, re, sys, unicodedata
try:
    from openpyxl import Workbook
except ImportError:
    sys.exit("openpyxl manque. L'installer une fois : python -m pip install openpyxl")
from openpyxl.formatting.rule import FormulaRule
from openpyxl.styles import Alignment, Font, PatternFill
from openpyxl.utils import get_column_letter

racine = pathlib.Path(__file__).resolve().parent.parent

def choisir_langue(args):
    presentes = sorted(p.parent.name for p in (racine / 'packs').glob('*/finale'))
    if '--langue' in args:
        code = args[args.index('--langue') + 1]
        if code in presentes:
            return code
        sys.exit(f"Langue sans dossier finale/ : {code}. Présentes : {', '.join(presentes)}")
    if len(presentes) == 1:
        return presentes[0]
    sys.exit(f"Langues possibles ({', '.join(presentes) or 'aucune'}) : ajouter --langue <code>")

DOSSIER = racine / 'packs' / choisir_langue(sys.argv)
NOM = json.load(open(DOSSIER / 'infos.json', encoding='utf-8'))['nom']
LANGUE, MAJ = NOM.lower(), NOM.upper()

ENTETE = PatternFill('solid', fgColor='0F6B5C')
A_REMPLIR = PatternFill('solid', fgColor='FFF8E1')
DEJA = PatternFill('solid', fgColor='E8EEF0')
P1 = PatternFill('solid', fgColor='FDE2E1')
TROP_LONG = PatternFill('solid', fgColor='F4B4AE')
MINUTES_PAR_LIGNE = {'demandes': 4, 'dialogue': 2, 'nombres': 1, 'reponses': 4, 'courtes': 2,
                     'menus': 1, 'termes': 5, 'test': 2, 'gsm7': 3, 'jury': 12, 'vocabulaire': 3, 'revus': 4}


def lire(nom):
    with open(DOSSIER / 'finale' / nom, encoding='utf-8-sig', newline='') as f:
        # En français, un nom de langue s'écrit en minuscules : « nous continuons en bulu »
        return [{k: v.replace('{langue}', LANGUE) for k, v in r.items()} for r in csv.DictReader(f)]


def lire_pack(nom):
    with open(DOSSIER / nom, encoding='utf-8-sig', newline='') as f:
        return list(csv.DictReader(f))


CORPUS = {r['id']: r for r in lire_pack('corpus.csv') if r.get('valide') == '1'}
PAR_FRANCAIS = {r['fr'].strip(): r for r in CORPUS.values()}


SANS_PARENTHESES = re.compile(r'\s*\([^)]*\)')


def avec_gloses(traduction, formes, anglais, i):
    """Chaque explication entre parenthèses devient « (français / anglais) » : on part de deux langues sources.
    Plusieurs parenthèses suivent l'ordre des formes (« prêt / emprunter ») ; une seule désigne la forme cherchée."""
    nombre = traduction.count('(')
    rang = iter(range(nombre))

    def gloser(_):
        j = next(rang) if nombre > 1 else i
        francais = SANS_PARENTHESES.sub('', formes[min(j, len(formes) - 1)]).strip()
        english = anglais[j] if j < len(anglais) else (anglais[0] if anglais else '')
        return f'({francais} / {english})' if english else f'({francais})'
    return re.sub(r'\([^)]*\)', gloser, traduction)


def glossaire():
    lignes = lire_pack('glossaire.csv')
    if not lignes:
        return {}
    # Terme et anglais sont toujours dans les deuxième et troisième colonnes, quel que soit leur nom.
    fr, en = list(lignes[0])[1:3]
    cible = next(k for k in lignes[0] if 'TRADUCTION' in k.upper())
    termes = {}
    for r in lignes:
        traduction = r[cible].strip()
        # Un affixe (« -fe ») ou « aucun équivalent » n'est pas une traduction à proposer comme libellé
        if not traduction or traduction.startswith('-') or traduction.lower().startswith('aucun'):
            continue
        formes = [f.strip() for f in r[fr].split('/')]
        anglais = [a.strip() for a in r[en].split('/') if a.strip()]
        for i, forme in enumerate(formes):
            termes.setdefault(SANS_PARENTHESES.sub('', forme).strip().lower(), avec_gloses(traduction, formes, anglais, i))
    return termes


GLOSSAIRE = glossaire()


def sans_accents(mot):
    return ''.join(c for c in unicodedata.normalize('NFD', mot.lower()) if unicodedata.category(c) != 'Mn')


def abandonnes():
    """Termes que l'équipe n'emploie plus (finale/termes-abandonnes.csv, signé de deux noms) : mot -> (français, remplaçant)"""
    if not (DOSSIER / 'finale' / 'termes-abandonnes.csv').exists():
        return {}
    return {sans_accents(r['ancien']): (r['francais'], r['remplace_par']) for r in lire('termes-abandonnes.csv')
            if r['decide_par'].strip() and r['relu_par'].strip() and r['decide_par'].strip().lower() != r['relu_par'].strip().lower()}


ABANDONNES = abandonnes()


def anciens_termes(traduction):
    """Les termes abandonnés présents dans une traduction"""
    simple = sans_accents(traduction)
    return [mot for mot in ABANDONNES if re.search(r'(?<![a-z])' + re.escape(mot), simple)]


def deja_valide(reprise, francais):
    ligne = CORPUS.get(reprise) or PAR_FRANCAIS.get(francais.strip())
    return (ligne['id'], ligne['cible']) if ligne else ('', '')


def feuille(classeur, titre, entetes, largeurs):
    ws = classeur.create_sheet(titre)
    ws.append(entetes)
    for i, largeur in enumerate(largeurs, 1):
        ws.column_dimensions[get_column_letter(i)].width = largeur
        cellule = ws.cell(1, i)
        cellule.fill, cellule.font = ENTETE, Font(bold=True, color='FFFFFF')
        cellule.alignment = Alignment(wrap_text=True, vertical='center')
    ws.row_dimensions[1].height = 48
    ws.freeze_panes = 'A2'
    return ws


def mettre_en_forme(ws, colonnes_a_remplir, colonne_priorite=None):
    for ligne in ws.iter_rows(min_row=2):
        for c in ligne:
            c.alignment = Alignment(wrap_text=True, vertical='top')
            if c.column in colonnes_a_remplir and not c.value:
                c.fill = A_REMPLIR
        if colonne_priorite and ligne[colonne_priorite - 1].value == 'P1':
            ligne[0].fill = P1


def longueur(ws, colonne_texte, colonne_longueur, maximum):
    """Formule de longueur, en rouge au-delà du maximum (maximum = nombre ou colonne de la ligne)."""
    if ws.max_row < 2:
        return
    texte, lettre = get_column_letter(colonne_texte), get_column_letter(colonne_longueur)
    for n in range(2, ws.max_row + 1):
        ws.cell(n, colonne_longueur, f'=IF({texte}{n}="","",LEN({texte}{n}))')
    limite = f'${maximum}2' if isinstance(maximum, str) else str(maximum)
    plage = f'{lettre}2:{lettre}{ws.max_row}'
    ws.conditional_formatting.add(plage, FormulaRule(
        formula=[f'AND({lettre}2<>"",{limite}>0,{lettre}2>{limite})'], fill=TROP_LONG))


def mode_emploi(classeur, titre, lignes):
    ws = classeur.active
    ws.title = "Mode d'emploi"
    ws.column_dimensions['A'].width = 110
    ws.append([titre])
    ws['A1'].font = Font(bold=True, size=14, color='0F6B5C')
    for texte in lignes:
        ws.append([texte])
        ws.cell(ws.max_row, 1).alignment = Alignment(wrap_text=True, vertical='top')
        if texte.isupper():
            ws.cell(ws.max_row, 1).font = Font(bold=True)


def recapitulatif(classeur, comptes):
    ws = feuille(classeur, 'Récapitulatif', ['Onglet', 'Lignes', 'Dont P1', 'Temps estimé'], [34, 10, 10, 18])
    total = 0
    for onglet, (lignes, p1, cle) in comptes.items():
        minutes = lignes * MINUTES_PAR_LIGNE[cle]
        total += minutes
        ws.append([onglet, lignes, p1 or '', f'{minutes // 60} h {minutes % 60:02d}'])
    ws.append(['Total', '', '', f'{total // 60} h {total % 60:02d}'])
    ws.cell(ws.max_row, 1).font = Font(bold=True)


REGLES_COMMUNES = [
    "RÈGLES QUI NE CHANGENT PAS",
    "• Les montants, numéros de téléphone, dates, références et prénoms restent exactement comme en français.",
    "• Les cases entre accolades, comme {amount} ou {name}, ne se traduisent pas : elles restent toutes, telles quelles.",
    f"• Écrivez avec l'alphabet et la charte habituels de l'équipe (forme d'adresse, ponctuation).",
    "• Une ligne compte quand elle porte deux noms différents : celui qui écrit et celui qui relit ou vérifie.",
    "• Cases jaunes : à remplir. Cases grises : déjà validées, ne pas les changer. Réf. en rouge : priorité P1, à faire d'abord.",
    "• Un doute ? Écrivez-le dans « Commentaire » plutôt que de deviner.",
]


def signees(nom):
    """Références qui ont déjà au moins une ligne signée de deux noms dans un fichier reçu"""
    if not (DOSSIER / 'finale' / nom).exists():
        return set()
    return {r['ref'] for r in lire(nom) if r.get('ecrit_par', '').strip() and r.get('verifie_par', '').strip()
            and r['ecrit_par'].strip().lower() != r['verifie_par'].strip().lower()}


COMPLEMENT = [
    "CE TABLEUR COMPLÈTE LE PREMIER",
    "Il ne contient que des situations et des mots pas encore recueillis. Écrivez ce que vous diriez vraiment, sans "
    "reprendre une phrase que vous auriez écrite pour le test à l'aveugle.",
    "IMPORTANT : la personne qui remplira le second test à l'aveugle ne doit pas voir ce tableur.",
]


def classeur_demandes(complement=False):
    """complement : seulement les demandes et les mots sans réponse signée de deux noms, pas les nombres"""
    wb = Workbook()
    mode_emploi(wb, f"Comment les gens demandent, en {LANGUE}", [*(COMPLEMENT if complement else []),
        "POURQUOI CE TABLEUR",
        f"La machine doit comprendre ce qu'une personne dit ou écrit en {LANGUE} pour consulter son solde, envoyer de "
        "l'argent, payer une facture… Pour cela, elle a besoin de nombreuses façons réelles de le demander.",
        "CE QU'ON VOUS DEMANDE",
        "• Lisez la situation, puis écrivez ce que VOUS diriez vraiment, comme dans la vie. Ne traduisez pas l'exemple "
        "français mot à mot : il n'est là que pour aider.",
        "• Remplissez autant de « façons » que possible (au moins trois). Plus elles sont différentes, mieux c'est.",
        f"• La façon 4 mêle le français au {LANGUE}, comme on parle vraiment au quotidien : elle est aussi précieuse que les autres.",
        "• Certaines demandes sont volontairement incomplètes ou négatives : dites-les telles quelles.",
        "• « Vérifié par » : une autre personne lit la ligne et confirme « oui, on dit vraiment comme ça ».",
        "• Onglet « Mots du dialogue » : les petits mots (oui, non, annuler, répète…), toutes les façons de les dire.",
        "• Onglet « Nombres » : comment on dit les sommes d'argent, en entier et comme les gens le disent vraiment.",
        *REGLES_COMMUNES,
    ])
    a_remplir = range(7, 15)
    ws = feuille(wb, 'Demandes', ['Réf.', 'Priorité', 'Intention', 'Situation', 'Exemple en français (ne pas traduire mot à mot)',
                                  'À savoir', 'Façon 1 : comme à un proche', 'Façon 2 : poliment, à un agent',
                                  'Façon 3 : très courte, comme un SMS', 'Façon 4 : en mêlant le français, comme on parle vraiment',
                                  'Façon 5 : autre façon', 'Écrit par', 'Vérifié par (on dit vraiment ainsi)', 'Commentaire'],
                 [7, 8, 12, 42, 32, 24, 30, 30, 26, 30, 26, 12, 14, 24])
    deja = signees('formulations.csv') if complement else set()
    demandes = [r for r in lire('demandes.csv') if r['ref'] not in deja]
    for r in demandes:
        ws.append([r['ref'], r['priorite'], r['intention'], r['situation'], r['exemple_fr'], r['a_noter']])
    mettre_en_forme(ws, a_remplir, 2)

    ws = feuille(wb, 'Mots du dialogue', ['Réf.', 'En français', 'Quand on l\'emploie', 'Façon 1', 'Façon 2', 'Façon 3',
                                          'Écrit par', 'Vérifié par', 'Commentaire'], [7, 26, 36, 22, 22, 22, 12, 12, 24])
    deja = signees('mots.csv') if complement else set()
    dialogue = [r for r in lire('dialogue.csv') if r['ref'] not in deja]
    for r in dialogue:
        ws.append([r['ref'], r['fr'], r['usage']])
    mettre_en_forme(ws, range(4, 9))
    if complement:
        recapitulatif(wb, {'Demandes': (len(demandes), sum(r['priorite'] == 'P1' for r in demandes), 'demandes'),
                           'Mots du dialogue': (len(dialogue), 0, 'dialogue')})
        return wb

    ws = feuille(wb, 'Nombres', ['Réf.', 'Nombre', 'À savoir', f'En {LANGUE}, en entier', 'Comme les gens le disent vraiment pour l\'argent',
                                 'Écrit par', 'Vérifié par', 'Commentaire'], [7, 14, 24, 34, 34, 12, 12, 24])
    nombres = lire('nombres.csv')
    for r in nombres:
        ws.append([r['ref'], r['valeur'], r['usage']])
    mettre_en_forme(ws, range(4, 8))
    recapitulatif(wb, {'Demandes': (len(demandes), sum(r['priorite'] == 'P1' for r in demandes), 'demandes'),
                       'Mots du dialogue': (len(dialogue), 0, 'dialogue'), 'Nombres': (len(nombres), 0, 'nombres')})
    return wb


def classeur_reponses():
    wb = Workbook()
    mode_emploi(wb, f"Ce que la machine répond, en {LANGUE}, sur chaque canal", [
        "POURQUOI CE TABLEUR",
        "La même réponse doit s'afficher sur une application, une page web, un menu USSD (*123#), un SMS et au téléphone "
        "à voix haute. Chaque canal a ses contraintes : il faut donc parfois plusieurs versions de la même phrase.",
        "LES COLONNES",
        f"• TRADUCTION {MAJ} : la phrase complète, fidèle et naturelle. Elle sert sur l'application, le web et le guichet.",
        "• Version USSD : la même idée, plus courte, sans abréviation inventée. La longueur se calcule seule et devient rouge "
        "si elle dépasse le maximum. Case grise « pas besoin » : rien à faire.",
        "• Version SMS : au plus 160 signes. Les lettres ô, ê, â et les tons font passer le message à 70 signes seulement : "
        "évitez-les SI ET SEULEMENT SI le sens reste sans ambiguïté. Sinon gardez-les et dites-le en commentaire.",
        "• Version voix : seulement si la phrase entendue doit être différente de la phrase lue. Phrases courtes, rien entre "
        "parenthèses, la somme redite à la fin si besoin. Ces phrases seront enregistrées à voix haute.",
        "• Onglet « Versions courtes » : phrases déjà validées. Seules les versions USSD et SMS manquent.",
        "• Onglet « Menus » : libellés très courts des menus USSD, du guichet automatique et du serveur vocal.",
        "ATTENTION AUX PHRASES CRITIQUES",
        "Les lignes critiques touchent à l'argent ou à la sécurité : « retiré », « reçu », « frais », « jamais » doivent être "
        "parfaitement clairs. Une troisième personne les retraduira sans voir le français.",
        *REGLES_COMMUNES,
    ])
    ws = feuille(wb, 'Réponses', ['Réf.', 'Priorité', 'Critique', 'Intention', 'Texte français', 'À savoir',
                                  f'TRADUCTION {MAJ} (complète)', 'Version USSD', 'Max USSD', 'Longueur USSD', 'Version SMS',
                                  'Longueur SMS', 'Version voix (si différente)', 'Traduit par', 'Relu par', 'Commentaire'],
                 [8, 8, 8, 11, 40, 26, 38, 30, 8, 9, 30, 9, 30, 12, 12, 24])
    reponses = lire('reponses.csv')
    for r in reponses:
        ref, cible = deja_valide(r['reprise'], r['fr'])
        note = (f"Déjà validée ({ref}). " if ref else '') + r['a_noter']
        canaux = r['canaux'].split(',')
        ws.append([r['ref'], r['priorite'], 'oui' if r['critique'] == '1' else '', r['intention'], r['fr'], note, cible,
                   '' if 'ussd' in canaux else 'pas besoin', int(r['max_ussd']) or '', None,
                   '' if 'sms' in canaux else 'pas besoin', None, '' if 'voix' in canaux else 'pas besoin'])
    mettre_en_forme(ws, [7, 8, 11, 13, 14, 15], 2)
    griser(ws, [7, 8, 11, 13])
    longueur(ws, 8, 10, 'I')
    longueur(ws, 11, 12, 160)

    ws = feuille(wb, 'Versions courtes', ['Réf.', 'Texte français', f'Traduction validée (ne pas changer)', 'Version USSD',
                                          'Longueur USSD', 'Version SMS', 'Longueur SMS', 'Traduit par', 'Relu par', 'Commentaire'],
                 [8, 40, 40, 32, 9, 32, 9, 12, 12, 24])
    courtes = [CORPUS[r['reprise']] for r in lire('courtes.csv') if r['reprise'] in CORPUS]
    for r in courtes:
        ws.append([r['id'], r['fr'], r['cible']])
    mettre_en_forme(ws, [4, 6, 8, 9])
    griser(ws, [3])
    longueur(ws, 4, 5, 100)
    longueur(ws, 6, 7, 160)

    ws = feuille(wb, 'Menus', ['Réf.', 'Canal', 'Texte français', 'Max signes', 'À savoir', f'TRADUCTION {MAJ}', 'Longueur',
                               'Traduit par', 'Relu par', 'Commentaire'], [7, 9, 34, 9, 24, 34, 9, 12, 12, 24])
    menus = lire('menus.csv')
    for r in menus:
        ref, cible = deja_valide('', r['fr'])
        cible = cible or GLOSSAIRE.get(r['fr'].lower(), '')
        note = (f"Déjà validé ({ref}). " if ref else ('Terme du glossaire. ' if cible else '')) + r['a_noter']
        ws.append([r['ref'], r['canal'], r['fr'], int(r['max']) or '', note, cible])
    mettre_en_forme(ws, [6, 8, 9])
    griser(ws, [6])
    longueur(ws, 6, 7, 'D')
    recapitulatif(wb, {'Réponses': (len(reponses), sum(r['priorite'] == 'P1' for r in reponses), 'reponses'),
                       'Versions courtes': (len(courtes), 0, 'courtes'), 'Menus': (len(menus), 0, 'menus')})
    return wb


def remarques():
    """Ce qu'il faut dire aux locuteurs sur une ligne : raison d'une mise de côté (exclusions.csv), ou remarque
    de relecture (a-revoir.csv)"""
    notes = {}
    for nom, colonne in (('exclusions.csv', 'raison'), ('a-revoir.csv', 'remarque')):
        if (DOSSIER / 'finale' / nom).exists():
            for r in lire(nom):
                notes[r['ref']] = ' '.join(x for x in (notes.get(r['ref']), r[colonne]) if x)
    return notes


def classeur_retours():
    """Seulement ce qui manque : réponses sans traduction validée ou à revoir, menus sans traduction. Mêmes onglets
    et colonnes que le tableur des réponses, il s'importe de la même façon ; son premier onglet s'appelle « Retours » :
    l'import sait alors qu'une ligne mise de côté a été renvoyée pour être refaite."""
    notes = remarques()
    deja_par_canal = {(v['ref'], v['canal']) for v in lire('variantes.csv')}
    wb = Workbook()
    mode_emploi(wb, f"Phrases encore en français quand on a choisi le {LANGUE}", [
        "POURQUOI CE TABLEUR",
        f"Ces phrases s'affichent encore en français quand la personne a choisi le {LANGUE} : elles n'ont pas encore de "
        "traduction validée, ou la traduction reçue a été mise de côté. La raison est écrite dans « À savoir ».",
        "En attendant, la machine montre à leur place des phrases déjà validées, plus simples (par exemple le récapitulatif "
        "ligne à ligne). La phrase complète reste meilleure : elle est plus claire pour la personne.",
        "CE QU'ON VOUS DEMANDE",
        f"• Écrivez la phrase complète dans la colonne TRADUCTION {MAJ}. Les versions USSD, SMS et voix aident, sans être obligatoires.",
        "• Commencez par les lignes P1 (Réf. en rouge).",
        "• Avant une opération, rien n'est encore retiré du compte : on parle du total « à débiter », pas du total « débité ». "
        "Le glossaire a un terme pour chacun.",
        "• Une ligne « à revoir » montre la traduction actuelle dans « À savoir » : si elle est juste, recopiez-la avec deux noms.",
        *REGLES_COMMUNES,
    ])
    wb.active.title = 'Retours'
    ws = feuille(wb, 'Réponses', ['Réf.', 'Priorité', 'Critique', 'Intention', 'Texte français', 'À savoir',
                                  f'TRADUCTION {MAJ} (complète)', 'Version USSD', 'Max USSD', 'Longueur USSD', 'Version SMS',
                                  'Longueur SMS', 'Version voix (si différente)', 'Traduit par', 'Relu par', 'Commentaire'],
                 [8, 8, 8, 11, 40, 34, 38, 30, 8, 9, 30, 9, 30, 12, 12, 24])
    restantes = []
    for r in lire('reponses.csv'):
        ref, cible = deja_valide(r['reprise'], r['fr'])
        if ref and r['ref'] not in notes:
            continue
        actuelle = f"À revoir. Traduction actuelle ({ref}) : « {cible} »." if ref else ''
        restantes.append((r, ' '.join(x for x in (actuelle, notes.get(r['ref']), r['a_noter']) if x)))
    # D'abord le transfert, l'opération que le jury fait toujours, puis les autres phrases critiques
    restantes.sort(key=lambda x: (x[0]['priorite'], x[0]['critique'] != '1', x[0]['intention'] != 'transfert', x[0]['ref']))
    for r, note in restantes:
        canaux = r['canaux'].split(',')
        sans = lambda canal: '' if canal in canaux and (r['ref'], canal) not in deja_par_canal else 'pas besoin'
        ws.append([r['ref'], r['priorite'], 'oui' if r['critique'] == '1' else '', r['intention'], r['fr'], note, '',
                   sans('ussd'), int(r['max_ussd']) or '', None, sans('sms'), None, sans('voix')])
    mettre_en_forme(ws, [7, 8, 11, 13, 14, 15], 2)
    griser(ws, [8, 11, 13])
    longueur(ws, 8, 10, 'I')
    longueur(ws, 11, 12, 160)
    feuille(wb, 'Versions courtes', ['Réf.', 'Texte français', 'Traduction validée (ne pas changer)', 'Version USSD',
                                     'Longueur USSD', 'Version SMS', 'Longueur SMS', 'Traduit par', 'Relu par', 'Commentaire'],
            [8, 40, 40, 32, 9, 32, 9, 12, 12, 24])
    ws = feuille(wb, 'Menus', ['Réf.', 'Canal', 'Texte français', 'Max signes', 'À savoir', f'TRADUCTION {MAJ}', 'Longueur',
                               'Traduit par', 'Relu par', 'Commentaire'], [7, 9, 34, 9, 34, 34, 9, 12, 12, 24])
    menus = [r for r in lire('menus.csv') if r['ref'] in notes or not (deja_valide('', r['fr'])[0] or GLOSSAIRE.get(r['fr'].lower()))]
    for r in menus:
        ws.append([r['ref'], r['canal'], r['fr'], int(r['max']) or '', ' '.join(x for x in (notes.get(r['ref']), r['a_noter']) if x)])
    mettre_en_forme(ws, [6, 8, 9])
    longueur(ws, 6, 7, 'D')
    termes = termes_a_refaire(wb, notes)
    recapitulatif(wb, {'Réponses': (len(restantes), sum(r['priorite'] == 'P1' for r, _ in restantes), 'reponses'),
                       'Menus': (len(menus), 0, 'menus'), 'Termes à expliquer': (termes, 0, 'termes')})
    return wb


def termes_a_refaire(wb, notes):
    """Explications mises de côté ou à revoir : mêmes colonnes que le tableur 3 (l'import les lit au même endroit),
    la remarque et l'explication actuelle en dernière colonne"""
    actuelles = {r['ref']: r for r in lire('explications-recues.csv')} if (DOSSIER / 'finale' / 'explications-recues.csv').exists() else {}
    ws = feuille(wb, 'Termes à expliquer', ['Réf.', 'Priorité', 'Terme', f'Terme {LANGUE} validé', 'Explication simple en français',
                                            'Exemple', f'EXPLICATION {MAJ} (deux phrases au plus)', 'Version très courte (une phrase)',
                                            'Traduit par', 'Relu par', 'Commentaire', 'À savoir'],
                 [7, 8, 18, 22, 44, 40, 46, 32, 12, 12, 24, 44])
    lignes = [r for r in lire('termes.csv') if r['ref'] in notes]
    for r in lignes:
        actuelle = actuelles.get(r['ref'])
        avant = f"Explication actuelle : « {actuelle['explication']} » Version courte : « {actuelle['courte']} »." if actuelle else ''
        ws.append([r['ref'], r['priorite'], r['terme'], GLOSSAIRE.get(r['terme'].split('/')[0].strip().lower(), ''),
                   r['explication_fr'], r['exemple'], '', '', '', '', '', ' '.join(x for x in (notes[r['ref']], avant) if x)])
    mettre_en_forme(ws, [7, 8, 9, 10], 2)
    griser(ws, [4])
    return len(lignes)


def classeur_gsm7():
    """Une ligne par lettre que le téléphone simple n'affiche pas : où elle apparaît, et les mots validés qui se
    confondraient si elle perdait son accent. Rien n'est proposé : les locuteurs décident de l'écriture."""
    import gsm7
    textes = gsm7.textes_affichables(DOSSIER)
    deja = {l['lettre']: l for l in gsm7.lire(DOSSIER / 'finale' / 'gsm7.csv')}
    compte, mots, tous = collections.Counter(), collections.defaultdict(collections.Counter), set()
    for texte in textes:
        lettres = gsm7.hors_alphabet(texte) - set(gsm7.SIGNES)
        compte.update(lettres)
        for mot in gsm7.MOT.findall(texte):
            tous.add(mot)
            for lettre in set(mot) & lettres:
                mots[lettre][mot] += 1
    wb = Workbook()
    mode_emploi(wb, f"Écrire le {LANGUE} sur un téléphone simple (*123#)", [
        "POURQUOI CE TABLEUR",
        f"Sur un téléphone simple, l'écran du *123# n'affiche bien qu'un alphabet limité. Plusieurs lettres du {LANGUE} "
        "n'y sont pas. Un écran qui en contient est envoyé autrement par le réseau : il est coupé à 70 signes au lieu de "
        "182, ou il s'affiche mal.",
        f"Sur le *123# seulement, la machine peut écrire chacune de ces lettres autrement. Sur l'application et le web, "
        "rien ne change : les lettres restent telles que vous les avez écrites.",
        "CE QU'ON VOUS DEMANDE",
        "• Pour chaque lettre, écrivez dans la colonne jaune comment l'écrire sur le *123#, avec les lettres autorisées "
        "ci-dessous. Une lettre peut s'écrire avec deux lettres si c'est plus clair.",
        "• La colonne « Mots qui deviendraient identiques » montre les mots déjà validés qui se confondraient si la "
        "lettre perdait son accent. Si cette confusion gêne la compréhension, choisissez une autre écriture, ou "
        "dites-le en commentaire.",
        "• Une majuscule a sa propre ligne quand elle apparaît dans les phrases.",
        "• Deux noms différents par ligne : celui qui décide et celui qui vérifie.",
        "• Avant d'utiliser votre choix, la machine vérifie qu'aucune phrase validée ne devient identique à une autre. "
        "Sinon, le choix revient vers vous avec les phrases concernées.",
        "LETTRES AUTORISÉES",
        "a b c d e f g h i j k l m n o p q r s t u v w x y z et leurs majuscules ; é è ù ì ò à ä ö ü ñ É Ä Ö Ñ Ü Ç "
        "Ø ø Å å Æ æ ß ; l'apostrophe ' et le tiret -.",
        "RIEN À DÉCIDER",
        "Les signes ’ … — « » sont remplacés tout seuls par ' ... - et des guillemets droits.",
    ])
    ws = feuille(wb, 'Écriture USSD', ['Lettre', 'Textes où elle apparaît', 'Mots où elle apparaît',
                                        "Mots qui deviendraient identiques sans l'accent", 'ÉCRITURE SUR LE *123#',
                                        'Décidé par', 'Vérifié par', 'Commentaire'], [8, 10, 40, 40, 18, 14, 14, 30])
    for lettre, nombre in compte.most_common():
        base = gsm7.sans_accent(lettre)
        paires = [f'{m} / {m.replace(lettre, base)}' for m, _ in mots[lettre].most_common() if m.replace(lettre, base) in tous][:6]
        ancien = deja.get(lettre, {})
        ws.append([lettre, nombre, ', '.join(m for m, _ in mots[lettre].most_common(8)), ' ; '.join(paires) or 'aucun',
                   ancien.get('ecriture', ''), ancien.get('decide_par', ''), ancien.get('verifie_par', '')])
    mettre_en_forme(ws, [5, 6, 7])
    for ligne in ws.iter_rows(min_row=2):
        ligne[0].font = Font(size=16, bold=True)
    recapitulatif(wb, {'Écriture USSD': (len(compte), 0, 'gsm7')})
    return wb


# Quinze façons de dire la même chose : ce qu'un linguiste fait varier (acte de langage, registre, mélange des langues,
# ellipse, désignation de la personne, nombres, hésitation, écriture au clavier)
FACONS = ['Comme à un proche, naturellement', 'Poliment, à un agent de la banque', 'Très court, comme un SMS',
          'En mêlant le français, comme au quotidien', 'Sous forme de question', 'Sous forme d\'ordre direct',
          'De façon indirecte (« je voudrais… »)', 'En commençant par la raison (« c\'est pour… »)',
          "Avec un autre mot pour l'action principale", 'Avec la somme ou le nombre dit en mots',
          'En désignant la personne autrement (nom, parent, numéro)', 'Comme une personne âgée au village',
          'Comme un jeune en ville', 'Avec une hésitation ou une reprise (« euh… non, plutôt… »)',
          'Comme vous le taperiez au clavier, sans accents ni tons']


def deja_dit(intention, combien=3):
    """Quelques formulations déjà signées pour cette intention : à ne pas refaire"""
    if not (DOSSIER / 'finale' / 'formulations.csv').exists():
        return ''
    # Une façon qui emploie un terme abandonné n'est pas montrée en exemple
    vues = [r['texte'] for r in lire('formulations.csv') if r['intention'] == intention and not anciens_termes(r['texte']) and r['ecrit_par'].strip()
            and r['verifie_par'].strip() and r['ecrit_par'].strip().lower() != r['verifie_par'].strip().lower()]
    return ' | '.join(vues[:combien])


def a_jour(traduction):
    """Un terme validé qui emploie un terme abandonné n'est plus proposé : il est à refaire"""
    return 'à refaire avec les nouveaux termes (tableur des termes revus)' if anciens_termes(traduction) else traduction


def termes_valides(liste):
    """Les termes du glossaire déjà validés pour ces mots français : à réutiliser tels quels"""
    trouves = [f'{t} : {a_jour(GLOSSAIRE[t.lower()])}' for t in (x.strip() for x in liste.split('/')) if t and t.lower() in GLOSSAIRE]
    return ' ; '.join(trouves)


def mots_valides(francais):
    """Ce qui est déjà validé pour ce mot : terme du glossaire, ou façons déjà signées dans les mots du dialogue"""
    cle = SANS_PARENTHESES.sub('', francais).strip().lower()
    if cle in GLOSSAIRE:
        return a_jour(GLOSSAIRE[cle])
    refs = {r['ref'] for r in lire('dialogue.csv') if r['fr'].strip().lower() == cle}
    signes = [r['texte'] for r in lire('mots.csv') if r['ref'] in refs and r['ecrit_par'].strip() and r['verifie_par'].strip()] if refs else []
    return ' / '.join(dict.fromkeys(s for s in signes if not anciens_termes(s)))


def classeur_jury():
    wb = Workbook()
    mode_emploi(wb, f"Les dix scénarios du jury, en {LANGUE}", [
        "POURQUOI CE TABLEUR",
        f"Le jury va parler à la machine en {LANGUE} dans dix situations : solde, envoi d'argent avec confirmation, frais, "
        "historique, correction, demande incomplète, solde insuffisant, changement de langue, *123#, explication d'un mot. "
        "Plus la machine connaît de façons réelles de demander, mieux elle comprend la personne, quelle que soit sa façon de parler.",
        "CE QU'ON VOUS DEMANDE",
        "• Onglet « Scénarios » : pour chaque situation, écrivez 15 façons de la dire, chacune selon la consigne de sa colonne. "
        "Elles doivent être vraiment différentes : un autre mot, un autre ordre, une autre façon de s'adresser.",
        "• Si une consigne ne convient pas à la situation (pas de somme, pas de personne), écrivez librement une autre façon.",
        "• Colonne grise « Mots déjà validés » : réutilisez-les tels quels, c'est ce qui va le plus vite et garde la même langue partout.",
        "• Colonne grise « Déjà recueilli » : des façons déjà écrites. Ne les recopiez pas : il en faut d'autres.",
        "• Onglet « Vocabulaire » : les mots dont la machine a besoin pour chaque scénario. Écrivez jusqu'à trois façons de "
        "les dire ; si un terme est déjà validé (gris), donnez seulement les autres façons qu'on entend vraiment.",
        "• Ne reprenez jamais une phrase écrite pour un test à l'aveugle.",
        "• Commencez par les lignes P1 (Réf. en rouge).",
        "• Une ligne compte quand elle porte deux noms différents : celui qui écrit et celui qui vérifie « on dit vraiment ainsi ».",
        *REGLES_COMMUNES,
    ])
    ws = feuille(wb, 'Scénarios', ['Réf.', 'Scénario du jury', 'Priorité', 'Intention', 'Situation', 'Exemple en français (ne pas traduire mot à mot)',
                                    'Mots déjà validés (à réutiliser)', 'Déjà recueilli (ne pas répéter)',
                                    *[f'Façon {i} : {c}' for i, c in enumerate(FACONS, 1)], 'Écrit par', 'Vérifié par (on dit vraiment ainsi)', 'Commentaire'],
                 [7, 16, 8, 11, 40, 28, 30, 34, *[24] * 15, 12, 14, 24])
    situations = lire('scenarios-jury.csv')
    for r in situations:
        ws.append([r['ref'], r['scenario'], r['priorite'], r['intention'], r['situation'], r['exemple_fr'],
                   termes_valides(r['termes']), deja_dit(r['intention'])])
    mettre_en_forme(ws, range(9, 26), 3)
    griser(ws, [7, 8])
    ws = feuille(wb, 'Vocabulaire', ['Réf.', 'Scénario du jury', 'Intention', 'Mot ou expression en français', "Exemple d'emploi",
                                      'Déjà validé (ne pas changer)', 'Façon 1', 'Façon 2', 'Façon 3', 'Écrit par', 'Vérifié par', 'Commentaire'],
                 [7, 18, 11, 30, 34, 30, 22, 22, 22, 12, 12, 24])
    vocabulaire = lire('vocabulaire.csv')
    for r in vocabulaire:
        ws.append([r['ref'], r['scenario'], r['intention'], r['fr'], r['usage'], mots_valides(r['fr'])])
    mettre_en_forme(ws, range(7, 12))
    griser(ws, [6])
    recapitulatif(wb, {'Scénarios': (len(situations), sum(r['priorite'] == 'P1' for r in situations), 'jury'),
                       'Vocabulaire': (len(vocabulaire), 0, 'vocabulaire')})
    return wb


def griser(ws, colonnes):
    """Cases déjà validées ou sans objet : grises."""
    for ligne in ws.iter_rows(min_row=2):
        for c in ligne:
            if c.column in colonnes and c.value:
                c.fill = DEJA


def classeur_termes():
    wb = Workbook()
    mode_emploi(wb, f"Expliquer les mots de l'argent, en {LANGUE}", [
        "POURQUOI CE TABLEUR",
        f"Le jury demandera à la machine d'expliquer des mots comme « frais » ou « solde ». L'explication doit être juste, "
        f"et surtout compréhensible par quelqu'un qui n'a jamais utilisé une banque.",
        "CE QU'ON VOUS DEMANDE",
        f"• Lisez l'explication et l'exemple en français, puis expliquez le mot en {LANGUE} comme vous le feriez à un parent "
        "âgé, en deux phrases au plus. Vous pouvez reprendre l'exemple, avec les mêmes chiffres.",
        "• Utilisez le terme déjà validé (colonne grise) : la même idée doit avoir le même mot partout.",
        "• Version très courte : une seule phrase, pour un SMS ou un menu.",
        *REGLES_COMMUNES,
    ])
    ws = feuille(wb, 'Termes à expliquer', ['Réf.', 'Priorité', 'Terme', f'Terme {LANGUE} validé', 'Explication simple en français',
                                            'Exemple', f'EXPLICATION {MAJ} (deux phrases au plus)', 'Version très courte (une phrase)',
                                            'Traduit par', 'Relu par', 'Commentaire'],
                 [7, 8, 18, 22, 44, 40, 46, 32, 12, 12, 24])
    termes = lire('termes.csv')
    for r in termes:
        ws.append([r['ref'], r['priorite'], r['terme'], GLOSSAIRE.get(r['terme'].split('/')[0].strip().lower(), ''),
                   r['explication_fr'], r['exemple']])
    mettre_en_forme(ws, [7, 8, 9, 10], 2)
    griser(ws, [4])
    recapitulatif(wb, {'Termes à expliquer': (len(termes), sum(r['priorite'] == 'P1' for r in termes), 'termes')})
    return wb


def textes_a_revoir():
    """Chaque texte validé qui emploie encore un terme abandonné : (réf., où, priorité, français, traduction)"""
    textes = [(r['id'], 'Phrase', r['priorite'], r['fr'], r['cible']) for r in CORPUS.values()]
    glossaire = lire_pack('glossaire.csv')
    if glossaire:
        fr, critique, cible = list(glossaire[0])[1], list(glossaire[0])[4], next(k for k in glossaire[0] if 'TRADUCTION' in k.upper())
        textes += [(r[list(r)[0]], 'Terme', 'P1' if r[critique].strip().lower() == 'oui' else 'P2', r[fr], r[cible]) for r in glossaire]
    modeles = {r['ref']: r for r in lire('reponses.csv')}
    canaux = {'sms': 'Réponse SMS', 'ussd': 'Réponse USSD', 'voix': 'Réponse voix'}
    textes += [(r['ref'], canaux.get(r['canal'], r['canal']), modeles.get(r['ref'], {}).get('priorite', 'P1'),
                modeles.get(r['ref'], {}).get('fr', ''), r['cible']) for r in lire('variantes.csv')]
    termes = {r['ref']: r for r in lire('termes.csv')}
    for r in lire('explications-recues.csv'):
        t = termes.get(r['ref'], {})
        francais = f"{t.get('explication_fr', '')} Exemple : {t.get('exemple', '')}".strip()
        textes += [(r['ref'], 'Explication', t.get('priorite', 'P1'), francais, r['explication']),
                   (r['ref'], 'Explication courte', t.get('priorite', 'P1'), t.get('explication_fr', ''), r['courte'])]
    return [t for t in textes if t[4] and anciens_termes(t[4])]


def classeur_termes_revus():
    wb = Workbook()
    mode_emploi(wb, f"Phrases à refaire avec les nouveaux termes, en {LANGUE}", [
        "POURQUOI CE TABLEUR",
        "L'équipe a changé des termes (colonne « Termes décidés »). Les phrases ci-dessous emploient encore l'ancien terme : "
        "en attendant, la machine les affiche telles qu'elles sont.",
        "CE QU'ON VOUS DEMANDE",
        "• Réécrivez toute la phrase avec le nouveau terme, en accordant les mots qui l'accompagnent comme on le dit vraiment.",
        "• Gardez le sens de la traduction actuelle (grise) et du français : seul le terme change, avec ce qui s'accorde avec lui.",
        "• Pour le solde, choisissez la forme qui convient à la phrase (voir « Termes décidés »).",
        "• N'ajoutez pas d'explication française entre parenthèses : elle serait retirée.",
        "• Une phrase qui garde un ancien terme est refusée à l'import.",
        "• « Où » dit à quoi sert le texte : phrase affichée, terme du glossaire, réponse sur un canal, explication d'un mot. Ne le changez pas.",
        *REGLES_COMMUNES,
    ])
    ws = feuille(wb, 'Termes revus', ['Réf.', 'Où', 'Priorité', 'Français', 'Traduction actuelle (à refaire)', 'Termes décidés',
                                      f'NOUVELLE TRADUCTION {MAJ}', 'Écrit par', 'Vérifié par', 'Commentaire'],
                 [8, 14, 8, 44, 44, 40, 48, 12, 14, 24])
    textes = sorted(textes_a_revoir(), key=lambda t: (t[2] != 'P1', ['Phrase', 'Réponse SMS', 'Réponse USSD', 'Réponse voix',
                                                                    'Explication', 'Explication courte', 'Terme'].index(t[1]) if t[1] in
                                                       ['Phrase', 'Réponse SMS', 'Réponse USSD', 'Réponse voix', 'Explication',
                                                        'Explication courte', 'Terme'] else 9, t[0]))
    for ref, ou, priorite, francais, traduction in textes:
        decides = dict.fromkeys(f'{ABANDONNES[m][0]} : {ABANDONNES[m][1]}' for m in anciens_termes(traduction))
        ws.append([ref, ou, priorite, francais, traduction, ' | '.join(decides)])
    mettre_en_forme(ws, [7, 8, 9], 3)
    griser(ws, [5, 6])
    recapitulatif(wb, {'Termes revus': (len(textes), sum(t[2] == 'P1' for t in textes), 'revus')})
    return wb


def classeur_test(source='test.csv', onglet='Test'):
    """source, onglet : le second test (test-2.csv, onglet « Test 2 ») a ses propres situations et son propre import"""
    wb = Workbook()
    second = source != 'test.csv'
    mode_emploi(wb, f"Test à l'aveugle{' n° 2' if second else ''}, en {LANGUE}", [
        "QUI REMPLIT CE TABLEUR",
        "Une personne qui N'A PAS VU le tableur « Comment les gens demandent ». C'est indispensable : ce tableur sert à vérifier "
        "que la machine comprend des phrases qu'elle n'a jamais vues, comme ce sera le cas devant le jury.",
        "CE QU'ON VOUS DEMANDE",
        "• Lisez chaque situation et écrivez tout de suite ce que vous diriez, sans chercher la belle phrase.",
        "• Puis, si une autre façon vous vient, écrivez-la à côté.",
        "• Ne montrez pas vos réponses aux autres locuteurs avant la fin.",
        "• Ici un seul nom suffit : ces phrases servent à tester la machine, elles ne seront jamais affichées.",
        *(["• Ce second test doit être rempli par une personne qui n'a vu ni le premier test, ni aucun autre tableur."] if second else []),
    ])
    ws = feuille(wb, onglet, ['Réf.', 'Situation', 'Ce que vous diriez (première idée)', 'Une autre façon', 'Écrit par', 'Commentaire'],
                 [7, 60, 44, 44, 14, 24])
    test = lire(source)
    for r in test:
        ws.append([r['ref'], r['situation']])
    mettre_en_forme(ws, [3, 4, 5])
    recapitulatif(wb, {onglet: (len(test), 0, 'test')})
    return wb


def main():
    autres = {'--complement': ('finale-1b-demandes', lambda: classeur_demandes(complement=True)),
              '--test2': ('finale-4b-test-aveugle-2', lambda: classeur_test('test-2.csv', 'Test 2')),
              '--jury': ('finale-jury', classeur_jury),
              '--termes-revus': ('termes-revus', classeur_termes_revus)}
    for option, (nom, fabriquer) in autres.items():
        if option in sys.argv:
            chemin = racine / f'{nom}-{LANGUE}.xlsx'
            fabriquer().save(chemin)
            print(chemin.name)
            return
    if '--gsm7' in sys.argv:
        chemin = racine / f'ecriture-ussd-{LANGUE}.xlsx'
        classeur_gsm7().save(chemin)
        print(chemin.name)
        return
    if '--restants' in sys.argv:
        chemin = racine / f'retours-finale-{LANGUE}.xlsx'
        classeur_retours().save(chemin)
        print(chemin.name)
        return
    classeurs = {'1-demandes': classeur_demandes, '2-reponses': classeur_reponses,
                 '3-expliquer': classeur_termes, '4-test-aveugle': classeur_test}
    for nom, fabriquer in classeurs.items():
        chemin = racine / f'finale-{nom}-{LANGUE}.xlsx'
        fabriquer().save(chemin)
        print(chemin.name)


if __name__ == '__main__':
    main()
