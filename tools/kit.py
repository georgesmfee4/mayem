#!/usr/bin/env python3
"""Kit de validation pour les locuteurs bulu.

  python3 tools/kit.py export            -> kit-validation-bulu.xlsx (à envoyer aux locuteurs)
  python3 tools/kit.py import FICHIER    -> reporte traductions, glossaire et style du fichier rempli
  python3 tools/kit.py retraduction      -> retraduction-a-envoyer.xlsx (bulu seul, pour une 3e personne)
  python3 tools/kit.py import RETRAD     -> enregistre la retraduction reçue (retraduction.csv)
  python3 tools/kit.py revision          -> revision-<langue>.xlsx (après npm run revision ; --precedent ANCIEN.xlsx
                                            recopie les réponses d'un ancien tableur de relecture, à confirmer)

Les fichiers de la langue sont dans packs/<langue>/. S'il y a plusieurs langues : --langue <code>.

Une ligne n'est marquée validée que si « Traduit par » ET « Relu par » sont remplis
(deux personnes différentes). Ensuite : npm run pack
"""
import csv, pathlib, re, sys
try:
    from openpyxl import Workbook, load_workbook
except ImportError:
    sys.exit("openpyxl manque. L'installer une fois : python -m pip install openpyxl")
from openpyxl.styles import Alignment, Font, PatternFill
import revision_kit  # après la vérification d'openpyxl, qu'il utilise aussi

root = pathlib.Path(__file__).resolve().parent.parent

def choisir_langue(args):
    """Langue donnée par --langue (retirée des arguments), ou la seule présente dans packs/."""
    presentes = sorted(p.parent.name for p in (root / 'packs').glob('*/infos.json'))
    if '--langue' in args:
        i = args.index('--langue')
        code = args[i + 1] if i + 1 < len(args) else ''
        del args[i:i + 2]
        if code in presentes:
            return code
        sys.exit(f"Langue inconnue : {code}. Présentes : {', '.join(presentes)}")
    if len(presentes) == 1:
        return presentes[0]
    sys.exit(f"Plusieurs langues ({', '.join(presentes)}) : ajouter --langue <code>")

DOSSIER = root / 'packs' / choisir_langue(sys.argv)
CORPUS = DOSSIER / 'corpus.csv'
FIELDS = ['id', 'priorite', 'ecran', 'element', 'critique', 'champ_fait', 'fr', 'en', 'bulu', 'valide_par', 'valide', 'consigne']
HEAD = ['Réf.', 'Priorité', 'Écran', 'Où apparaît le texte', 'Critique (argent ou sécurité)',
        'Texte français', 'Texte anglais', 'À savoir', 'TRADUCTION BULU', 'Traduit par', 'Relu par', 'Commentaire / doute']
# Glossaire : un concept = un terme bulu approuvé, utilisé partout. À remplir AVANT les phrases.
GLOSSARY = [
    # (réf., terme français, anglais, sens dans l'application, critique)
    ('T01', 'solde', 'balance', "L'argent disponible sur le compte", 1),
    ('T02', 'frais', 'fee / fees', "La somme prise par le service pour faire une opération", 1),
    ('T03', 'gratuit', 'free', 'Sans frais : rien à payer pour l’opération', 1),
    ('T04', 'montant', 'amount', "La somme d'argent d'une opération", 1),
    ('T05', 'total débité / débiter', 'total debited / debit', 'La somme retirée du compte (montant + frais)', 1),
    ('T06', 'compte', 'account', 'Le compte bancaire de la personne', 0),
    ('T07', 'transfert / envoyer de l’argent', 'transfer / send money', "Envoyer de l'argent à une autre personne", 1),
    ('T08', 'bénéficiaire / destinataire', 'beneficiary / recipient', "La personne qui reçoit l'argent", 1),
    ('T09', 'numéro de téléphone', 'phone number', 'Le numéro de la personne qui reçoit', 0),
    ('T10', 'référence', 'reference', "Le code qui identifie une opération (ex. SAF-2026-K3P9QZ)", 0),
    ('T11', 'confirmer / valider', 'confirm / validate', "Action définitive : après, l'argent part", 1),
    ('T12', 'annuler', 'cancel', "Abandonner l'opération (différent de modifier)", 1),
    ('T13', 'modifier', 'edit', 'Revenir corriger les informations (différent de annuler)', 1),
    ('T14', 'continuer', 'continue', "Passer à l'étape suivante", 1),
    ('T15', 'retour', 'back', "Revenir à l'étape précédente", 0),
    ('T16', 'vérifier', 'verify / check', 'Contrôler avec attention avant d’agir', 1),
    ('T17', 'alerte de sécurité / attention', 'security warning / warning', 'Avertissement : il y a un risque', 1),
    ('T18', 'erreur', 'error', "Quelque chose n'a pas marché", 1),
    ('T19', 'code secret / code PIN', 'secret code / PIN', 'Le code personnel que l’on ne donne à personne', 1),
    ('T20', 'jamais (ne… jamais)', 'never', 'Négation forte : en aucun cas', 1),
    ('T21', 'ne… pas', 'do not / not', 'Négation simple', 1),
    ('T22', 'avant de…', 'before …', 'Faire une chose en premier, puis l’autre', 1),
    ('T23', 'récapitulatif', 'summary', "Résumé de l'opération avant de confirmer", 0),
    ('T24', 'reçu / effectué / succès', 'receipt / completed / success', "L'opération est terminée et a réussi", 1),
    ('T25', 'opération', 'operation / transaction', 'Une action sur le compte (transfert, paiement…)', 0),
    ('T26', 'motif', 'reason', "Pourquoi on envoie l'argent", 0),
    ('T27', 'message important', 'important message', "Une information que le client doit lire", 1),
    ('T28', 'banque / banque en ligne', 'bank / online banking', 'La banque, et son service sur internet', 0),
    ('T29', 'paiement / facture / salaire', 'payment / bill / salary', "Lignes de l'historique du compte", 0),
    ('T30', 'Mobile Money', 'Mobile Money', 'Garder « Mobile Money » si c’est le mot que tout le monde utilise', 0),
]
STYLE = [
    ('Orthographe', "Quel alphabet utilisez-vous ? (ex. Église presbytérienne avec ô et ñ, ou alphabet général avec ɔ et ŋ)"),
    ('Tons', 'Écrivez-vous les tons (accents de ton) ? Oui / Non'),
    ('Politesse', "Comment s'adresser poliment au client (équivalent de « vous ») ?"),
    ('Montants', 'Les montants restent en chiffres, avec « FCFA » : 25 000 FCFA. Est-ce naturel pour vous ? Sinon, expliquez.'),
    ('Mots français', "Quels mots français sont si courants qu'il vaut mieux les garder (ex. FCFA, Mobile Money, code PIN) ?"),
    ('Boutons', 'Les boutons doivent rester courts (1 à 3 mots). Y a-t-il des mots bulu très longs qui poseraient problème ?'),
]

GUIDE = [
    "Merci de votre aide ! Ces textes viennent d'une application bancaire de démonstration.",
    "",
    "ÉTAPE 1 — Remplissez d'abord les feuilles « Choix de style » et « Glossaire » (30 minutes environ, à faire ensemble si possible).",
    "   Le glossaire fixe UN mot bulu par idée (solde, frais, bénéficiaire…). Ce mot sera ensuite utilisé dans toutes les phrases.",
    "",
    "ÉTAPE 2 — Traduisez ensuite les phrases de la feuille « À traduire » :",
    "1. Écrivez la traduction bulu de chaque texte français dans la colonne jaune « TRADUCTION BULU ».",
    "2. Les mots entre accolades, comme {name}, {amount}, {account} ou {percent}, ne se traduisent pas :",
    "   recopiez-les tels quels, à la bonne place dans la phrase bulu. Ils seront remplacés par un nom ou un montant.",
    "3. Ne changez aucun chiffre. Ne traduisez pas les noms de personnes ni les noms de marque (Safinum Pay, Mobile Money).",
    "4. Les lignes « Critique = Oui » parlent d'argent ou de sécurité : le sens doit être exactement le même",
    "   (envoyer, confirmer, annuler, frais, jamais, avant de…). En cas de doute, écrivez-le dans « Commentaire ».",
    "5. Utilisez une seule orthographe pour tout le fichier, et indiquez-la ci-dessous.",
    "6. Écrivez votre nom dans « Traduit par ». Une deuxième personne relit et écrit son nom dans « Relu par ».",
    "   Seules les lignes relues par une deuxième personne seront affichées dans l'application.",
    "7. Commencez par les lignes de priorité P1 : ce sont celles que le jury verra.",
    "8. Utilisez les mots du glossaire. Si une phrase demande un autre mot, expliquez pourquoi dans « Commentaire ».",
    "",
    "ÉTAPE 3 — Pour les lignes « Critique = Oui », une troisième personne recevra un fichier séparé, avec seulement",
    "   le bulu, et le retraduira en français sans voir l'original. On comparera ensuite les deux sens.",
    "",
    "Les traductions produites pour Mayem appartiennent à l'équipe Mayem. Vos noms servent uniquement à la double validation interne et ne sont jamais publiés.",
]

def export():
    rows = list(csv.DictReader(open(CORPUS, encoding='utf-8-sig', newline='')))
    wb = Workbook()
    g = wb.active
    g.title = "Mode d'emploi"
    g.column_dimensions['A'].width = 120
    for i, line in enumerate(GUIDE, 1):
        c = g.cell(row=i, column=1, value=line)
        c.alignment = Alignment(wrap_text=True)
        if i == 1: c.font = Font(bold=True, size=13)
    head_style = lambda cells: [setattr(c, 'font', Font(bold=True, color='FFFFFF')) or
                                setattr(c, 'fill', PatternFill('solid', fgColor='0F4C5C')) or
                                setattr(c, 'alignment', Alignment(wrap_text=True, vertical='center')) for c in cells]
    yellow = PatternFill('solid', fgColor='FFF2CC')
    red = Font(bold=True, color='B42318')
    wrap = Alignment(wrap_text=True, vertical='top')

    st = wb.create_sheet('Choix de style')
    st.append(['Sujet', 'Question', 'VOTRE RÉPONSE'])
    head_style(st[1])
    for s in STYLE:
        st.append(list(s) + [''])
        st.cell(row=st.max_row, column=3).fill = yellow
        for col in (1, 2, 3): st.cell(row=st.max_row, column=col).alignment = wrap
    for col, w in zip('ABC', [16, 70, 50]): st.column_dimensions[col].width = w

    gl = wb.create_sheet('Glossaire')
    gl.append(['Réf.', 'Terme français', 'Anglais', 'Sens dans l’application', 'Critique',
               'TERME BULU APPROUVÉ', 'Mots à éviter (et pourquoi)', 'Choisi par', 'Relu par', 'Commentaire'])
    head_style(gl[1])
    for ref, fr, en, sens, crit in GLOSSARY:
        gl.append([ref, fr, en, sens, 'Oui' if crit else 'Non', '', '', '', '', ''])
        gl.cell(row=gl.max_row, column=6).fill = yellow
        if crit: gl.cell(row=gl.max_row, column=5).font = red
        for col in range(1, 11): gl.cell(row=gl.max_row, column=col).alignment = wrap
    for col, w in zip('ABCDEFGHIJ', [6, 26, 24, 44, 9, 30, 30, 14, 14, 26]): gl.column_dimensions[col].width = w
    gl.freeze_panes = 'C2'

    ws = wb.create_sheet('À traduire')
    ws.append(HEAD)
    for c in ws[1]:
        c.font = Font(bold=True, color='FFFFFF')
        c.fill = PatternFill('solid', fgColor='0F4C5C')
        c.alignment = Alignment(wrap_text=True, vertical='center')
    yellow = PatternFill('solid', fgColor='FFF2CC')
    red = Font(bold=True, color='B42318')
    for r in rows:
        ws.append([r['id'], r['priorite'], r['ecran'], r['element'], 'Oui' if r['critique'] == '1' else 'Non',
                   r['fr'], r['en'].replace('|', ' / '), r['consigne'], r['bulu'], '', '', ''])
        row = ws.max_row
        ws.cell(row=row, column=9).fill = yellow
        if r['critique'] == '1': ws.cell(row=row, column=5).font = red
        for col in range(1, 13):
            ws.cell(row=row, column=col).alignment = Alignment(wrap_text=True, vertical='top')
    for col, w in zip('ABCDEFGHIJKL', [7, 8, 14, 22, 11, 46, 40, 34, 46, 16, 16, 30]):
        ws.column_dimensions[col].width = w
    ws.freeze_panes = 'F2'
    ws.auto_filter.ref = f'A1:L{ws.max_row}'
    out = root / 'kit-validation-bulu.xlsx'
    wb.save(out)
    print(f'{len(rows)} lignes -> {out}')
    # Glossaire complet (sections B à L) : le même kit sert pour toute nouvelle langue
    from extend_glossary import main as extend_glossary
    extend_glossary(str(out), str(out))

def sheet_to_csv(wb, name, out):
    if name not in wb.sheetnames:
        return 0
    rows = [[('' if v is None else str(v).strip()) for v in row] for row in wb[name].iter_rows(values_only=True)]
    rows = [r for r in rows if any(r)]
    with open(out, 'w', encoding='utf-8-sig', newline='') as f:
        csv.writer(f).writerows(rows)
    return max(0, len(rows) - 1)

def backtranslation(path):
    """Fichier séparé pour la 3e personne : uniquement le bulu des lignes critiques, sans le français."""
    rows = {r['id']: r for r in csv.DictReader(open(CORPUS, encoding='utf-8-sig', newline=''))}
    wb = Workbook(); ws = wb.active; ws.title = 'Retraduction'
    ws.append(['Réf.', 'Texte bulu', 'VOTRE TRADUCTION EN FRANÇAIS', 'Traduit par', 'Commentaire'])
    for c in ws[1]:
        c.font = Font(bold=True, color='FFFFFF'); c.fill = PatternFill('solid', fgColor='0F4C5C')
    n = 0
    for r in rows.values():
        if r['critique'] == '1' and r['bulu']:
            ws.append([r['id'], r['bulu'], '', '', '']); n += 1
            ws.cell(row=ws.max_row, column=3).fill = PatternFill('solid', fgColor='FFF2CC')
            for col in range(1, 6): ws.cell(row=ws.max_row, column=col).alignment = Alignment(wrap_text=True, vertical='top')
    for col, w in zip('ABCDE', [7, 50, 50, 16, 30]): ws.column_dimensions[col].width = w
    out = root / 'retraduction-a-envoyer.xlsx'
    wb.save(out)
    print(f'{n} phrases critiques -> {out} (à envoyer à une personne qui n’a pas vu le français)')

def bulu_column(header):
    """Indices des colonnes bulu, traducteur et relecteur, quel que soit le nom donné par les locuteurs."""
    find = lambda *starts: next((i for i, h in enumerate(header) if h.strip().lower().startswith(starts)), None)
    return find('terme bulu', 'traduction bulu'), find('traduit par', 'choisi par'), find('relu par')

def import_glossary(wb):
    """Reporte le glossaire du tableur. Une case bulu vide n'efface jamais un terme déjà traduit :
    un kit fraîchement exporté a un glossaire vierge, il ne doit pas vider glossaire.csv."""
    path = DOSSIER / 'glossaire.csv'
    old = {}
    if path.exists():
        with open(path, encoding='utf-8-sig', newline='') as f:
            old_rows = list(csv.reader(f))
        if old_rows:
            b, t, r = bulu_column(old_rows[0])
            for row in old_rows[1:]:
                if row and b is not None and len(row) > b and row[b].strip():
                    old[row[0].strip()] = (row[b], row[t] if t is not None else '', row[r] if r is not None else '')
    n = sheet_to_csv(wb, 'Glossaire', path)
    with open(path, encoding='utf-8-sig', newline='') as f:
        rows = list(csv.reader(f))
    if not rows:
        return n
    b, t, r = bulu_column(rows[0])
    kept = 0
    for row in rows[1:]:
        ref = row[0].strip() if row else ''
        if b is not None and ref in old and not row[b].strip():
            row[b] = old[ref][0]
            if t is not None and not row[t].strip(): row[t] = old[ref][1]
            if r is not None and not row[r].strip(): row[r] = old[ref][2]
            kept += 1
    with open(path, 'w', encoding='utf-8-sig', newline='') as f:
        csv.writer(f).writerows(rows)
    if kept:
        print(f'glossaire : {kept} terme(s) vide(s) dans le tableur, traduction existante conservée')
    return n

def import_(path):
    try:
        full = load_workbook(path, data_only=True)
    except PermissionError:
        # Excel verrouille le fichier tant qu'il est ouvert
        sys.exit(f"{path} est ouvert dans Excel : l'enregistrer, le fermer, puis relancer l'import.")
    # Un fichier de retraduction n'a ni glossaire ni style : ne pas annoncer « 0 termes »
    if 'Glossaire' in full.sheetnames:
        print(f"glossaire : {import_glossary(full)} termes -> glossaire.csv")
    if 'Choix de style' in full.sheetnames:
        print(f"style : {sheet_to_csv(full, 'Choix de style', DOSSIER / 'style.csv')} réponses -> style.csv")
    if 'Retraduction' in full.sheetnames:
        print(f"retraduction : {sheet_to_csv(full, 'Retraduction', DOSSIER / 'retraduction.csv')} lignes -> retraduction.csv")
        return
    if 'À traduire' not in full.sheetnames:
        print("pas d'onglet « À traduire » : seuls le glossaire et le style ont été importés")
        return
    ws = load_workbook(path, read_only=True)['À traduire']
    filled = {}
    for row in ws.iter_rows(min_row=2, values_only=True):
        rid, bu, by, rev = row[0], row[8], row[9], row[10]
        if rid and bu:
            filled[str(rid).strip()] = (str(bu).strip(), (by or '').strip(), (rev or '').strip())
    rows = list(csv.DictReader(open(CORPUS, encoding='utf-8-sig', newline='')))
    n_valid = 0
    changes = []
    for r in rows:
        if r['id'] in filled:
            bu, by, rev = filled[r['id']]
            # Un fichier plus ancien que corpus.csv écraserait des corrections récentes : on montre tout
            if r['bulu'] and r['bulu'] != bu:
                changes.append(f"  {r['id']} : « {r['bulu']} » -> « {bu} »")
            r['bulu'] = bu
            ok = bool(by and rev and by.lower() != rev.lower())
            r['valide_par'] = f'{by} / relu par {rev}' if ok else by
            r['valide'] = '1' if ok else ''
            n_valid += ok
    with open(CORPUS, 'w', encoding='utf-8-sig', newline='') as f:
        w = csv.DictWriter(f, fieldnames=FIELDS)
        w.writeheader()
        w.writerows(rows)
    print(f'{len(filled)} traductions importées, {n_valid} validées par deux personnes -> {CORPUS}')
    if changes:
        print(f'{len(changes)} traduction(s) bulu modifiée(s) :')
        print('\n'.join(changes))
        print('Si un changement est un retour en arrière : git checkout packs/<langue>/corpus.csv, puis corriger le tableur.')

if __name__ == '__main__':
    if len(sys.argv) >= 2 and sys.argv[1] == 'export':
        export()
    elif len(sys.argv) >= 3 and sys.argv[1] == 'import':
        import_(sys.argv[2])
    elif len(sys.argv) >= 2 and sys.argv[1] == 'retraduction':
        backtranslation(None)
    elif len(sys.argv) >= 2 and sys.argv[1] == 'revision':
        import json
        if not (DOSSIER / 'revision.json').exists():
            sys.exit("Lancer d'abord : npm run revision")
        precedent = sys.argv[sys.argv.index('--precedent') + 1] if '--precedent' in sys.argv else None
        nom = json.load(open(DOSSIER / 'infos.json', encoding='utf-8'))['nom'].lower()
        revision_kit.exporter(DOSSIER, root / f'revision-{nom}.xlsx', precedent)
    else:
        print(__doc__)
