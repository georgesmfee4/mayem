"""Tableur de révision pour les locuteurs (python tools/kit.py revision), à partir de revision.json.

Aucun bulu n'est écrit ici : les cases « TRADUCTION BULU » reprennent le bulu actuel, à garder ou corriger
par les locuteurs. Les colonnes masquées (codes, groupe) servent seulement au réimport.
"""
import csv, json
from openpyxl import Workbook
from openpyxl.styles import Alignment, Font, PatternFill
from openpyxl.worksheet.datavalidation import DataValidation

BLEU = PatternFill('solid', fgColor='0F4C5C')
JAUNE = PatternFill('solid', fgColor='FFF2CC')
GRIS = PatternFill('solid', fgColor='EEEEEE')
ROUGE = Font(bold=True, color='B42318')
HAUT = Alignment(wrap_text=True, vertical='top')

GUIDE = [
    "RÉVISION DU BULU — merci pour votre aide",
    "",
    "Pourquoi cette révision ? Un jury de spécialistes va juger si le bulu dit exactement la même chose que le français.",
    "Quand deux idées différentes sont écrites pareil en bulu (par exemple « confirmer » et « confirmation »), un client",
    "peut se tromper sur ce qu'il fait avec son argent. Nous avons repéré ces endroits ; vous seuls pouvez trancher.",
    "",
    "Combien de temps ? Environ 2 à 3 heures en tout, à vous répartir (voir l'onglet « Récapitulatif »).",
    "",
    "Dans quel ordre ?",
    "1. « Charte d'orthographe » : quelques questions sur la façon d'écrire. Vos réponses servent à corriger tout le reste.",
    "2. « Sens à distinguer » : des phrases différentes écrites pareil. Dites s'il faut un bulu différent pour chacune.",
    "3. « Phrases à revoir » : commencez par les lignes P1 en rouge (argent ou sécurité), puis les autres.",
    "4. « Glossaire à compléter » : les mots qui n'ont pas encore de traduction.",
    "",
    "Que remplir ? Seulement les cases jaunes.",
    "- « Décision » : « garder » si le bulu actuel est juste, « corriger » si vous le changez.",
    "- « TRADUCTION BULU » : elle contient déjà le bulu actuel. Pour corriger, écrivez la phrase bulu complète,",
    "  pas une explication : jamais « … pour dire … ». Si vous gardez, ne touchez à rien.",
    "- « Traduit par » : votre nom. « Relu par » : le nom d'une autre personne, qui a relu.",
    "  Sans deux noms différents, une correction n'est pas affichée dans l'application.",
    "- « Commentaire » : vos doutes, vos remarques. Ils seront tous lus.",
    "",
    "Règles importantes :",
    "- Ne changez jamais un chiffre.",
    "- Recopiez tels quels les mots entre accolades : {amount}, {phone}, {ref}, {name}… Ce sont des valeurs remplies par l'application.",
    "- Ne traduisez pas les noms de marque ni les noms de personnes.",
    "",
    "Exemple de ligne remplie (on garde le bulu actuel) :",
    "   Décision : garder   |   TRADUCTION BULU : (inchangée)   |   Traduit par : votre nom   |   Relu par : le nom d'un autre locuteur",
    "",
    "Les noms servent uniquement à la double vérification au sein de l'équipe Mayem ; ils ne sont jamais publiés.",
]

CHARTE = [
    ('Orthographe', "Quel alphabet utilisez-vous ? (Église presbytérienne avec ô et ñ, ou alphabet général avec ɔ et ŋ)"),
    ('Tons', "Écrivez-vous les tons (accents de ton) ? Oui / Non. Si oui, sur quels mots ?"),
    ('Politesse', "Pour s'adresser au client : « wo », « ô », ou les deux selon le cas ? Donnez la règle."),
    ('Majuscule au début', "Chaque phrase et chaque bouton commencent-ils par une majuscule ?"),
    ('Majuscules du glossaire', "Les mots du glossaire (solde, compte, bénéficiaire…) s'écrivent-ils avec une majuscule au milieu d'une phrase ?"),
    ('Apostrophe', "Quelle apostrophe utiliser partout : ' (droite) ou ’ (courbe) ?"),
    ('Ponctuation', "Le bulu garde-t-il la même ponctuation que le français (point final, deux-points, point d'interrogation) ?"),
    ('Boutons', "Les boutons s'écrivent-ils à l'infinitif, à l'impératif ou comme un nom ? Combien de mots au plus ?"),
    ('Mots français', "Mots empruntés (Nombor, test, Mobile Money…) : à garder ou à remplacer par un mot bulu ?"),
    ('Variante', "Quelle variante du bulu parlez-vous dans l'équipe (région, village) ?"),
]

PHRASES = ['Réf.', 'Priorité', 'Critique', 'Écran', 'Élément', 'Texte français', 'Texte anglais', 'Consigne', 'Bulu actuel']
SAISIE_PHRASE = ['TRADUCTION BULU', 'Traduit par', 'Relu par', 'Commentaire']


def _entete(ws, noms, largeurs):
    ws.append(noms)
    for c in ws[ws.max_row]:
        c.font = Font(bold=True, color='FFFFFF')
        c.fill = BLEU
        c.alignment = Alignment(wrap_text=True, vertical='center')
    for i, largeur in enumerate(largeurs):
        ws.column_dimensions[ws.cell(row=1, column=i + 1).column_letter].width = largeur


def _ligne(ws, valeurs, jaunes, critique=False, gris=()):
    ws.append(valeurs)
    rang = ws.max_row
    for col in range(1, len(valeurs) + 1):
        ws.cell(row=rang, column=col).alignment = HAUT
    for col in jaunes:
        ws.cell(row=rang, column=col).fill = JAUNE
    for col in gris:
        ws.cell(row=rang, column=col).fill = GRIS
    if critique:
        ws.cell(row=rang, column=1).font = ROUGE
        ws.cell(row=rang, column=3).font = ROUGE


def _liste(ws, valeurs, colonne, debut):
    choix = DataValidation(type='list', formula1=f'"{",".join(valeurs)}"', allow_blank=True)
    ws.add_data_validation(choix)
    choix.add(f'{colonne}{debut}:{colonne}{max(ws.max_row, debut)}')


def _finir(ws, figer, masquees=()):
    ws.freeze_panes = figer
    ws.auto_filter.ref = ws.dimensions
    for lettre in masquees:
        ws.column_dimensions[lettre].hidden = True


def _contexte_phrase(p, ctx):
    critique = 'Oui' if p['critique'] else 'Non'
    return [p['id'], ctx.get('priorite', ''), critique, ctx.get('ecran', ''), ctx.get('element', ''),
            p['fr'], ' / '.join(p['en']), ctx.get('consigne', ''), p['bulu']]

SAUT = chr(10)


def _onglet_guide(wb):
    ws = wb.active
    ws.title = "Mode d'emploi"
    ws.column_dimensions['A'].width = 125
    for i, texte in enumerate(GUIDE, 1):
        ws.cell(row=i, column=1, value=texte).alignment = Alignment(wrap_text=True)
    ws['A1'].font = Font(bold=True, size=13)


def _onglet_charte(wb, style, sans_reponse_seulement=False):
    ws = wb.create_sheet("Charte d'orthographe")
    _entete(ws, ['Sujet', 'Question', 'Réponse actuelle', 'VOTRE RÉPONSE (confirmer ou corriger)', 'Commentaire'], [20, 60, 50, 50, 30])
    questions = [(s, q) for s, q in CHARTE if not (sans_reponse_seulement and style.get(s, '').strip())]
    for sujet, question in questions:
        _ligne(ws, [sujet, question, style.get(sujet, ''), '', ''], jaunes=(4, 5))
    _finir(ws, 'C2')
    return len(questions)


def _onglet_sens(wb, groupes, phrases, contexte, precedent):
    ws = wb.create_sheet('Sens à distinguer')
    noms = PHRASES + ['Faut-il un bulu différent ? (oui / non)'] + SAISIE_PHRASE + ['Réponse précédente', 'groupe']
    _entete(ws, noms, [7, 8, 8, 14, 18, 36, 28, 26, 32, 14, 36, 13, 13, 26, 30, 8])
    lignes = 0
    for g in groupes:
        ws.append([f"{g['niveau'].upper()} : {g['explication']} {g['question']}"])
        rang = ws.max_row
        ws.cell(row=rang, column=1).font = Font(bold=True, color='0F4C5C')
        ws.cell(row=rang, column=1).alignment = HAUT
        ws.merge_cells(start_row=rang, start_column=1, end_row=rang, end_column=15)
        ws.row_dimensions[rang].height = 45
        for ref in g['refs']:
            p = phrases[ref]
            valeurs = _contexte_phrase(p, contexte.get(ref, {})) + ['', p['bulu'], '', '', '', precedent.get(ref, ''), g['ref']]
            _ligne(ws, valeurs, jaunes=range(10, 15), critique=p['critique'], gris=(15,))
            lignes += 1
    _liste(ws, ['oui', 'non'], 'J', 2)
    _finir(ws, 'G2', masquees=('P',))
    return lignes


def _rang(p, ctx):
    return (0 if ctx.get('priorite') == 'P1' else 2) + (0 if p['critique'] else 1)


def _par_ref(constats, connus):
    groupes = {}
    for c in constats:
        for ref in c['refs']:
            if ref in connus:
                groupes.setdefault(ref, []).append(c)
    return groupes


def _onglet_phrases(wb, constats, phrases, contexte, precedent):
    ws = wb.create_sheet('Phrases à revoir')
    noms = PHRASES + ['Ce qui a été repéré', 'Question', 'Décision (garder / corriger)'] + SAISIE_PHRASE + ['Réponse précédente', 'codes']
    _entete(ws, noms, [7, 8, 8, 14, 18, 36, 28, 26, 32, 48, 36, 12, 36, 13, 13, 26, 30, 10])
    par_ref = _par_ref(constats, phrases)
    ordre = sorted(par_ref, key=lambda ref: (_rang(phrases[ref], contexte.get(ref, {})), ref))
    for ref in ordre:
        p, liste = phrases[ref], par_ref[ref]
        repere = SAUT.join('• ' + c['explication'] for c in liste)
        questions = SAUT.join(dict.fromkeys('• ' + c['question'] for c in liste))
        codes = ','.join(dict.fromkeys(c['code'] for c in liste))
        valeurs = _contexte_phrase(p, contexte.get(ref, {})) + [repere, questions, '', p['bulu'], '', '', '', precedent.get(ref, ''), codes]
        _ligne(ws, valeurs, jaunes=range(12, 17), critique=p['critique'], gris=(17,))
    _liste(ws, ['garder', 'corriger'], 'L', 2)
    _finir(ws, 'G2', masquees=('R',))
    return len(ordre), [contexte.get(ref, {}).get('priorite', '') for ref in ordre]


def _onglet_glossaire(wb, constats, termes):
    ws = wb.create_sheet('Glossaire à compléter')
    noms = ['Réf.', 'Terme français', "Sens dans l'application", 'Critique', 'Mots à éviter déjà notés', 'Terme bulu actuel',
            'Ce qui a été repéré', 'TERME BULU APPROUVÉ', 'Choisi par', 'Relu par', 'Commentaire', 'codes']
    _entete(ws, noms, [8, 24, 34, 8, 30, 24, 48, 26, 13, 13, 26, 10])
    par_ref = _par_ref(constats, termes)
    ordre = sorted(par_ref, key=lambda ref: (not termes[ref]['critique'], ref))
    for ref in ordre:
        t, liste = termes[ref], par_ref[ref]
        valeurs = [ref, t['terme'], t['sens'], 'Oui' if t['critique'] else 'Non', t['a_eviter'], t['bulu'],
                   SAUT.join('• ' + c['explication'] for c in liste), '', '', '', '', ','.join(dict.fromkeys(c['code'] for c in liste))]
        _ligne(ws, valeurs, jaunes=range(8, 12), critique=t['critique'])
    _finir(ws, 'C2', masquees=('L',))
    return len(ordre)


def _onglet_recap(wb, compte, priorites):
    ws = wb.create_sheet('Récapitulatif')
    _entete(ws, ['Onglet', 'Lignes', 'Dont P1', 'Dont P2', 'Ordre conseillé'], [28, 10, 10, 10, 60])
    lignes = [
        ["Charte d'orthographe", compte['charte'], '', '', '1. À faire ensemble, en premier'],
        ['Sens à distinguer', compte['sens'], '', '', "2. Groupes marqués BLOQUANT d'abord"],
        ['Phrases à revoir', compte['phrases'], priorites.count('P1'), priorites.count('P2'), '3. Lignes P1 en rouge, puis P1, puis P2'],
        ['Glossaire à compléter', compte['glossaire'], '', '', "4. Termes critiques d'abord"],
    ]
    for ligne in lignes:
        if ligne[1]:
            _ligne(ws, ligne, jaunes=())


def _style(dossier):
    chemin = dossier / 'style.csv'
    if not chemin.exists():
        return {}
    lignes = list(csv.DictReader(open(chemin, encoding='utf-8-sig', newline='')))
    reponse = lambda l: next((v for k, v in l.items() if k and k.lower().startswith('votre réponse')), '') or ''
    return {l['Sujet']: reponse(l) for l in lignes}


def precedentes(fichier):
    """Réponses d'un ancien tableur de relecture : réf. -> leur texte, à confirmer (jamais importé tel quel)."""
    from openpyxl import load_workbook
    ws = load_workbook(fichier, data_only=True)['Relecture']
    rangs = list(ws.iter_rows(values_only=True))
    index = {nom: i for i, nom in enumerate(rangs[0])}
    texte = lambda r, nom: ('' if r[index[nom]] is None else str(r[index[nom]]).strip())
    reponses = {}
    for r in rangs[1:]:
        if not r or not r[index['Réf.']]:
            continue
        morceaux = [texte(r, 'DÉCISION'), texte(r, 'NOUVEAU BULU'), texte(r, 'Commentaire')]
        if any(morceaux):
            reponses[texte(r, 'Réf.')] = ' ; '.join(m for m in morceaux if m)
    return reponses


def _termes_contredits(constats):
    """Un terme critique absent d'une phrase revue : le glossaire est peut-être à changer, pas la phrase."""
    return [{'refs': [c['terme']], 'ref': c['terme'], 'code': 'terme-critique',
             'explication': f"{c['ref']} n'utilise pas ce terme. Si la phrase est juste, écrivez ici le terme à utiliser partout."}
            for c in constats if c['code'] == 'terme-critique' and c.get('terme')]


def exporter(dossier, sortie, precedent_fichier=None, codes=None):
    """codes : ne garder que ces constats (tableur court) ; la charte ne montre alors que les questions sans réponse."""
    constats = json.load(open(dossier / 'revision.json', encoding='utf-8'))
    if codes:
        constats = [c for c in constats if c['code'] in codes]
        constats += _termes_contredits(constats)
    pack = json.load(open(dossier / 'pack.json', encoding='utf-8'))
    phrases = {p['id']: p for p in pack['phrases']}
    termes = {t['ref']: t for t in pack['glossaire']}
    contexte = {l['id']: l for l in csv.DictReader(open(dossier / 'corpus.csv', encoding='utf-8-sig', newline=''))}
    precedent = precedentes(precedent_fichier) if precedent_fichier else {}
    sens = [c for c in constats if c['code'] == 'sens-confondus']
    autres = [c for c in constats if c['code'] != 'sens-confondus' and c['ref'] != 'charte']
    wb = Workbook()
    _onglet_guide(wb)
    compte = {'charte': _onglet_charte(wb, _style(dossier), bool(codes)),'sens': _onglet_sens(wb, sens, phrases, contexte, precedent)}
    compte['phrases'], priorites = _onglet_phrases(wb, autres, phrases, contexte, precedent)
    compte['glossaire'] = _onglet_glossaire(wb, autres, termes)
    _onglet_recap(wb, compte, priorites)
    # Tableur court : un onglet vide ne ferait que dérouter les locuteurs (l'import tolère son absence)
    for nom, cle in (("Charte d'orthographe", 'charte'), ('Sens à distinguer', 'sens')):
        if codes and not compte[cle]:
            del wb[nom]
    wb.save(sortie)
    print(f"Tableur de révision -> {sortie}")
    print(f"  charte : {compte['charte']} questions ; sens à distinguer : {compte['sens']} lignes ({len(sens)} groupes) ;"
          f" phrases à revoir : {compte['phrases']} ; glossaire : {compte['glossaire']}")
    return compte


def _lignes(wb, nom):
    """Lignes d'un onglet sous forme de dictionnaires, en sautant les titres de bloc (sans réf.) ; onglet absent : aucune."""
    if nom not in wb.sheetnames:
        return []
    rangs = list(wb[nom].iter_rows(values_only=True))
    entetes = [str(h).strip() if h is not None else '' for h in rangs[0]]
    texte = lambda v: '' if v is None else str(v).strip()
    lignes = [dict(zip(entetes, map(texte, r))) for r in rangs[1:] if r]
    return [l for l in lignes if l.get('Réf.') or l.get('Sujet')]


def extraire(wb, dossier):
    """Réponses du tableur rempli -> reponses-revision.json, appliqué ensuite par tools/appliquer-revision.js."""
    phrases = []
    for l in _lignes(wb, 'Sens à distinguer'):
        phrases.append({'ref': l['Réf.'], 'bulu': l.get('TRADUCTION BULU', ''), 'decision': '',
                        'different': l.get('Faut-il un bulu différent ? (oui / non)', ''), 'traduit_par': l.get('Traduit par', ''),
                        'relu_par': l.get('Relu par', ''), 'commentaire': l.get('Commentaire', ''), 'codes': ['sens-confondus']})
    for l in _lignes(wb, 'Phrases à revoir'):
        phrases.append({'ref': l['Réf.'], 'bulu': l.get('TRADUCTION BULU', ''), 'decision': l.get('Décision (garder / corriger)', ''),
                        'different': '', 'traduit_par': l.get('Traduit par', ''), 'relu_par': l.get('Relu par', ''),
                        'commentaire': l.get('Commentaire', ''), 'codes': [c for c in l.get('codes', '').split(',') if c]})
    glossaire = [{'ref': l['Réf.'], 'bulu': l.get('TERME BULU APPROUVÉ', ''), 'choisi_par': l.get('Choisi par', ''),
                  'relu_par': l.get('Relu par', ''), 'commentaire': l.get('Commentaire', '')} for l in _lignes(wb, 'Glossaire à compléter')]
    charte = [{'sujet': l['Sujet'], 'question': l.get('Question', ''), 'reponse': l.get('VOTRE RÉPONSE (confirmer ou corriger)', ''),
               'commentaire': l.get('Commentaire', '')} for l in _lignes(wb, "Charte d'orthographe")]
    with open(dossier / 'reponses-revision.json', 'w', encoding='utf-8') as f:
        json.dump({'phrases': phrases, 'glossaire': glossaire, 'charte': charte}, f, ensure_ascii=False, indent=1)
    print(f"révision : {len(phrases)} lignes de phrases, {len(glossaire)} termes, {len(charte)} questions de charte lues")
