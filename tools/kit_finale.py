#!/usr/bin/env python3
"""Tableurs des locuteurs pour la finale : comprendre les demandes et répondre sur chaque canal.

  python3 tools/kit_finale.py            -> quatre tableurs finale-*-<langue>.xlsx à la racine
  python3 tools/kit_finale.py --restants -> retours-finale-<langue>.xlsx : seulement ce qui manque encore
  python3 tools/kit_finale.py --langue X -> s'il y a plusieurs langues

Les textes français viennent de packs/<langue>/finale/*.csv. Une phrase déjà validée du corpus
(colonne reprise, ou même français exactement) arrive pré-remplie : on ne la refait pas.
"""
import csv, json, pathlib, re, sys
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
                     'menus': 1, 'termes': 5, 'test': 2}


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


def classeur_demandes():
    wb = Workbook()
    mode_emploi(wb, f"Comment les gens demandent, en {LANGUE}", [
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
    demandes = lire('demandes.csv')
    for r in demandes:
        ws.append([r['ref'], r['priorite'], r['intention'], r['situation'], r['exemple_fr'], r['a_noter']])
    mettre_en_forme(ws, a_remplir, 2)

    ws = feuille(wb, 'Mots du dialogue', ['Réf.', 'En français', 'Quand on l\'emploie', 'Façon 1', 'Façon 2', 'Façon 3',
                                          'Écrit par', 'Vérifié par', 'Commentaire'], [7, 26, 36, 22, 22, 22, 12, 12, 24])
    dialogue = lire('dialogue.csv')
    for r in dialogue:
        ws.append([r['ref'], r['fr'], r['usage']])
    mettre_en_forme(ws, range(4, 9))

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
    recapitulatif(wb, {'Réponses': (len(restantes), sum(r['priorite'] == 'P1' for r, _ in restantes), 'reponses'),
                       'Menus': (len(menus), 0, 'menus')})
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


def classeur_test():
    wb = Workbook()
    mode_emploi(wb, f"Test à l'aveugle, en {LANGUE}", [
        "QUI REMPLIT CE TABLEUR",
        "Une personne qui N'A PAS VU le tableur « Comment les gens demandent ». C'est indispensable : ce tableur sert à vérifier "
        "que la machine comprend des phrases qu'elle n'a jamais vues, comme ce sera le cas devant le jury.",
        "CE QU'ON VOUS DEMANDE",
        "• Lisez chaque situation et écrivez tout de suite ce que vous diriez, sans chercher la belle phrase.",
        "• Puis, si une autre façon vous vient, écrivez-la à côté.",
        "• Ne montrez pas vos réponses aux autres locuteurs avant la fin.",
        "• Ici un seul nom suffit : ces phrases servent à tester la machine, elles ne seront jamais affichées.",
    ])
    ws = feuille(wb, 'Test', ['Réf.', 'Situation', 'Ce que vous diriez (première idée)', 'Une autre façon', 'Écrit par', 'Commentaire'],
                 [7, 60, 44, 44, 14, 24])
    test = lire('test.csv')
    for r in test:
        ws.append([r['ref'], r['situation']])
    mettre_en_forme(ws, [3, 4, 5])
    recapitulatif(wb, {'Test': (len(test), 0, 'test')})
    return wb


def main():
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
