#!/usr/bin/env python3
"""Import des tableurs de la finale remplis par les locuteurs (tools/kit_finale.py les a produits).

  python3 tools/import_finale.py FICHIER.xlsx [FICHIER.xlsx …] [--langue X]

Chaque tableur est reconnu à ses onglets :
- réponses et menus : une traduction entre dans le corpus si elle porte deux noms différents, garde exactement les
  cases {…} et les chiffres du français, et ne contredit pas le glossaire ; versions USSD, SMS et voix à part ;
- demandes, mots du dialogue, nombres : rangés pour la compréhension ; seules les lignes à deux noms serviront ;
- explications des termes : rangées ; seules les lignes à deux noms s'afficheront ;
- test à l'aveugle : rangé pour mesurer la compréhension (un seul nom suffit, ces phrases ne s'affichent jamais).
Les termes déjà décidés remplacent un mot français resté dans une traduction (« facture » -> Faktur), et une
explication entre parenthèses prend la forme « (français / anglais) ». Rien n'est effacé : une case vide ne
remplace rien. Le rapport liste chaque refus, à renvoyer aux locuteurs. Ensuite : npm run pack
"""
import csv, io, json, pathlib, re, sys, unicodedata
try:
    from openpyxl import load_workbook
except ImportError:
    sys.exit("openpyxl manque. L'installer une fois : python -m pip install openpyxl")

racine = pathlib.Path(__file__).resolve().parent.parent


def choisir_langue(args):
    presentes = sorted(p.parent.parent.name for p in (racine / 'packs').glob('*/finale/reponses.csv'))
    if '--langue' in args:
        i = args.index('--langue')
        code = args[i + 1]
        del args[i:i + 2]
        return code
    if len(presentes) == 1:
        return presentes[0]
    sys.exit(f"Langues possibles ({', '.join(presentes) or 'aucune'}) : ajouter --langue <code>")


ARGS = sys.argv[1:]
DOSSIER = racine / 'packs' / choisir_langue(ARGS)
FINALE = DOSSIER / 'finale'
NOM = json.load(open(DOSSIER / 'infos.json', encoding='utf-8'))['nom']

# Termes décidés par l'équipe : un mot français resté dans une traduction prend la traduction validée
ALIGNEMENTS = {'facture': 'faktur', 'factures': 'faktur', 'reçu': 'resu', 'recu': 'resu'}
# Gloses anglaises des explications entre parenthèses absentes du glossaire
ANGLAIS = {'nouveau solde': 'new balance', 'minimum': 'minimum', 'maximum': 'maximum', 'banque': 'bank', 'confirmer': 'confirm',
           'code pin': 'PIN', 'solde': 'balance', 'frais': 'fees', 'compte': 'account', 'gratuit': 'free'}
SANS_OBJET = {'', 'pas besoin', 'none'}
CASE = re.compile(r'\{[a-z_0-9]+\}')


def lire_csv(chemin):
    if not chemin.exists():
        return [], []
    lignes = list(csv.reader(io.StringIO(open(chemin, encoding='utf-8-sig', newline='').read())))
    return (lignes[0], lignes[1:]) if lignes else ([], [])


def ecrire_csv(chemin, entetes, lignes, bom=True):
    sortie = io.StringIO()
    csv.writer(sortie, lineterminator='\n').writerows([entetes, *lignes])
    open(chemin, 'w', encoding='utf-8-sig' if bom else 'utf-8', newline='').write(sortie.getvalue())


def texte(valeur):
    return '' if valeur is None else str(valeur).strip()


def sans_accents(mot):
    return ''.join(c for c in unicodedata.normalize('NFD', mot.lower()) if unicodedata.category(c) != 'Mn')


def deux_noms(a, b):
    a, b = texte(a), texte(b)
    return bool(a) and bool(b) and a.lower() != b.lower()


# Glossaire : forme française -> (traduction, anglais)
def glossaire():
    entetes, lignes = lire_csv(DOSSIER / 'glossaire.csv')
    i_fr, i_en = 1, 2
    i_cible = next(i for i, e in enumerate(entetes) if 'TRADUCTION' in e.upper())
    termes = {}
    for l in lignes:
        if len(l) <= i_cible or not l[i_cible].strip():
            continue
        formes = [f.strip() for f in l[i_fr].split('/')]
        anglais = [a.strip() for a in l[i_en].split('/') if a.strip()]
        for j, f in enumerate(formes):
            cle = sans_accents(re.sub(r'\s*\([^)]*\)', '', f))
            termes.setdefault(cle, (l[i_cible].strip(), anglais[j] if j < len(anglais) else (anglais[0] if anglais else '')))
    return termes


GLOSSAIRE = glossaire()


def aligner(traduction, notes):
    def remplacer(m):
        mot = m.group(0)
        nouveau = ALIGNEMENTS[sans_accents(mot) if sans_accents(mot) in ALIGNEMENTS else mot.lower()]
        notes.append(f'« {mot} » -> « {nouveau} »')
        return nouveau.capitalize() if mot[0].isupper() else nouveau
    motif = r'(?<![\w\'’])(' + '|'.join(sorted(map(re.escape, ALIGNEMENTS), key=len, reverse=True)) + r')(?![\w\'’])'
    return re.sub(motif, remplacer, traduction, flags=re.IGNORECASE)


def gloser(traduction, notes):
    """« (frais) » devient « (frais / fees) » ; une glose déjà double n'est pas touchée."""
    def remplacer(m):
        contenu = m.group(1).strip()
        # Une glose est un mot ; une somme entre parenthèses (« (10 000 F) ») n'en est pas une
        if '/' in contenu or not contenu or re.search(r'\d', contenu):
            return m.group(0)
        francais = re.sub(r'^be\s+', '', contenu, flags=re.IGNORECASE)
        cle = sans_accents(francais)
        anglais = (GLOSSAIRE.get(cle) or ('', ''))[1] or ANGLAIS.get(cle, '')
        if not anglais:
            notes.append(f'pas d\'anglais connu pour « {francais} »')
            return m.group(0)
        return f'({francais} / {anglais})'
    return re.sub(r'\(([^()]*)\)', remplacer, traduction)


def contredit(traduction):
    """« Mebal (frais) » : le mot avant une glose doit être la traduction validée de la glose."""
    for m in re.finditer(r'((?:[^\s()]+\s+){0,3})\(([^()/]*)\)', traduction):
        francais = re.sub(r'^be\s+', '', m.group(2).strip(), flags=re.IGNORECASE)
        attendu = GLOSSAIRE.get(sans_accents(francais))
        if not attendu:
            continue
        premier = sans_accents(attendu[0].split()[0])
        avant = [sans_accents(x) for x in m.group(1).split()]
        if not any(x.startswith(premier) or premier.startswith(x) for x in avant if len(x) > 2):
            return f'« {m.group(0).strip()} » : « {francais} » se dit « {attendu[0]} » (glossaire)'
    return None


def controler(francais, traduction):
    """Raison du refus, ou None"""
    if traduction.count('{') != traduction.count('}'):
        return 'accolade non fermée dans une case {…}'
    if sorted(CASE.findall(francais)) != sorted(CASE.findall(traduction)) and set(CASE.findall(francais)) == set(CASE.findall(traduction)):
        return 'une case {…} est répétée : chaque valeur doit apparaître une seule fois, comme en français'
    if sorted(CASE.findall(francais)) != sorted(CASE.findall(traduction)):
        return f'cases différentes : français {sorted(set(CASE.findall(francais)))}, traduction {sorted(set(CASE.findall(traduction)))}'
    chiffres = lambda t: sorted(re.findall(r'\d+', CASE.sub('', t)))
    if chiffres(francais) != chiffres(traduction):
        return f'chiffres différents : français {chiffres(francais)}, traduction {chiffres(traduction)}'
    if traduction.lstrip().startswith('-'):
        return 'affixe grammatical, pas une traduction de libellé'
    return contredit(traduction)


class Rapport:
    def __init__(self):
        self.entrees, self.refus, self.alignes, self.attente = [], [], [], []

    def afficher(self):
        print(f'\n{len(self.entrees)} traduction(s) importée(s).')
        for ligne in self.alignes:
            print(f'  aligné   {ligne}')
        if self.refus:
            print(f'\n{len(self.refus)} refus, à renvoyer aux locuteurs :')
            for ligne in self.refus:
                print(f'  refusé   {ligne}')
        for ligne in self.attente:
            print(f'  attente  {ligne}')


R = Rapport()


# Lignes écartées après relecture (exclusions.csv) : un contresens qu'aucun contrôle automatique ne voit
EXCLUSIONS = {l[0]: l[1] for l in lire_csv(FINALE / 'exclusions.csv')[1]}


def preparer(ref, colonne, francais, brute):
    """Traduction alignée et glosée, ou None si elle est refusée (le rapport dit pourquoi)"""
    if ref in EXCLUSIONS:
        R.refus.append(f'{ref} ({colonne}) : écarté à la relecture, {EXCLUSIONS[ref]}')
        return None
    traduction = re.sub(r'\s+', ' ', brute.replace('´', "'")).strip()
    notes = []
    # Contrôle avant la mise en forme des gloses : « Mebal (frais) » doit être vu tel que le locuteur l'a écrit
    traduction = aligner(traduction, notes)
    raison = controler(francais, traduction)
    traduction = gloser(traduction, notes)
    if raison:
        R.refus.append(f'{ref} ({colonne}) : {raison} | {brute.strip()}')
        return None
    if notes:
        R.alignes.append(f'{ref} ({colonne}) : {", ".join(notes)}')
    return traduction


def sources(nom):
    return {l[0]: dict(zip(e, l)) for e, ls in [lire_csv(FINALE / nom)] for l in ls}


def ajouter_corpus(phrases):
    """phrases : id -> dict (fr, cible, critique, element, valide_par). Une phrase dont le français est déjà au
    corpus n'est pas doublée ; la même id est remplacée (réimport)."""
    entetes, lignes = lire_csv(DOSSIER / 'corpus.csv')
    i = {e: n for n, e in enumerate(entetes)}
    # Une phrase du corpus qui ne vient pas de la finale n'est jamais remplacée, même si l'identifiant coïncide
    for l in lignes:
        if l[i['id']] in phrases and l[i['ecran']] != 'Finale':
            R.refus.append(f'{l[i["id"]]} : identifiant déjà pris par une phrase validée hors finale ; rien remplacé')
            phrases.pop(l[i['id']])
    existants = {l[i['fr']].strip().lower(): l for l in lignes if l[i['id']] not in phrases}
    gardees = [l for l in lignes if l[i['id']] not in phrases]
    for ref, p in phrases.items():
        deja = existants.get(p['fr'].strip().lower())
        if deja:
            if sans_accents(deja[i['cible']]) != sans_accents(p['cible']):
                R.attente.append(f'{ref} : même français que {deja[i["id"]]} déjà validé (« {deja[i["cible"]]} ») ; gardé tel quel')
            continue
        ligne = [''] * len(entetes)
        valeurs = {'id': ref, 'priorite': p.get('priorite', 'P1'), 'ecran': 'Finale', 'element': p['element'], 'critique': p['critique'],
                   'champ_fait': '1' if '{' in p['fr'] else '0', 'fr': p['fr'], 'en': '', 'cible': p['cible'],
                   'valide_par': p['valide_par'], 'valide': '1', 'consigne': ''}
        for cle, v in valeurs.items():
            ligne[i[cle]] = v
        gardees.append(ligne)
        R.entrees.append(ref)
    ecrire_csv(DOSSIER / 'corpus.csv', entetes, gardees)


def ajouter_variantes(variantes):
    entetes = ['ref', 'canal', 'cible', 'traduit_par', 'relu_par']
    _, lignes = lire_csv(FINALE / 'variantes.csv')
    cles = {(v[0], v[1]) for v in variantes}
    ecrire_csv(FINALE / 'variantes.csv', entetes, [l for l in lignes if (l[0], l[1]) not in cles] + sorted(variantes), bom=False)


def francais_de(modele):
    # Une réponse au nom de langue (« nous continuons en {langue} ») ne sert que pour la langue nationale
    return modele.replace('{langue}', NOM.lower())


def importer_reponses(wb):
    modeles = sources('reponses.csv')
    corpus, variantes = {}, []
    ws = wb['Réponses']
    for r in list(ws.iter_rows(values_only=True))[1:]:
        ref = texte(r[0])
        if ref not in modeles:
            continue
        if not deux_noms(r[13], r[14]):
            R.attente.append(f'{ref} : deux noms différents attendus (« Traduit par », « Relu par »)')
            continue
        francais = francais_de(modeles[ref]['fr'])
        valide_par = f'{texte(r[13])} / relu par {texte(r[14])}'
        complete = preparer(ref, 'complète', francais, texte(r[6])) if texte(r[6]).lower() not in SANS_OBJET else None
        if complete:
            corpus[ref] = {'fr': francais, 'cible': complete, 'critique': modeles[ref]['critique'], 'element': modeles[ref]['intention'],
                           'priorite': modeles[ref]['priorite'], 'valide_par': valide_par}
        for colonne, canal in ((7, 'ussd'), (10, 'sms'), (12, 'voix')):
            brute = texte(r[colonne])
            if brute.lower() in SANS_OBJET:
                continue
            version = preparer(ref, canal, francais, brute)
            if version and version != complete:
                variantes.append([ref, canal, version, texte(r[13]), texte(r[14])])
    return corpus, variantes


def importer_menus(wb):
    corpus = {}
    for r in list(wb['Menus'].iter_rows(values_only=True))[1:]:
        ref, francais, brute = texte(r[0]), texte(r[2]), texte(r[5])
        if not ref or brute.lower() in SANS_OBJET:
            continue
        if not deux_noms(r[7], r[8]):
            R.attente.append(f'{ref} : deux noms différents attendus')
            continue
        traduction = preparer(ref, 'menu', francais, brute)
        if traduction:
            # Identifiant propre aux menus (MU01, MG01, MV01) : les références du tableur peuvent coïncider avec le corpus
            corpus['M' + ref] = {'fr': francais, 'cible': traduction, 'critique': '0', 'element': f'menu {texte(r[1])}', 'valide_par': f'{texte(r[7])} / relu par {texte(r[8])}'}
    return corpus


def importer_courtes(wb):
    """Versions courtes de phrases déjà validées : seulement si elles diffèrent de la traduction actuelle"""
    entetes, lignes = lire_csv(DOSSIER / 'corpus.csv')
    i = {e: n for n, e in enumerate(entetes)}
    actuelles = {l[i['id']]: (l[i['fr']], l[i['cible']]) for l in lignes}
    variantes = []
    for r in list(wb['Versions courtes'].iter_rows(values_only=True))[1:]:
        ref = texte(r[0])
        if ref not in actuelles or not deux_noms(r[7], r[8]):
            continue
        francais, actuelle = actuelles[ref]
        for colonne, canal in ((3, 'ussd'), (5, 'sms')):
            brute = texte(r[colonne])
            if brute.lower() in SANS_OBJET or sans_accents(brute) == sans_accents(actuelle):
                continue
            if sans_accents(brute) == sans_accents(texte(r[2])):
                R.attente.append(f'{ref} ({canal}) : reprend l\'ancienne traduction, remplacée depuis par « {actuelle} » ; ignorée')
                continue
            version = preparer(ref, canal, francais, brute)
            if version:
                variantes.append([ref, canal, version, texte(r[7]), texte(r[8])])
    return variantes


def ranger(nom, entetes, lignes):
    ecrire_csv(FINALE / nom, entetes, lignes, bom=False)
    signees = sum(1 for l in lignes if deux_noms(l[-2], l[-1])) if 'verifie_par' in entetes or 'relu_par' in entetes else len(lignes)
    print(f'{nom} : {len(lignes)} ligne(s) rangée(s), {signees} signée(s) de deux noms')
    if signees < len(lignes):
        R.attente.append(f'{nom} : {len(lignes) - signees} ligne(s) sans deux noms différents, gardées mais pas utilisées')


def fusionner(nom, entetes, nouvelles):
    """Les lignes d'une référence reçue remplacent celles de la même référence ; les autres restent"""
    _, anciennes = lire_csv(FINALE / nom)
    refs = {l[0] for l in nouvelles}
    ranger(nom, entetes, [l for l in anciennes if l and l[0] not in refs] + nouvelles)


def importer_demandes(wb):
    intentions = {k: v['intention'] for k, v in sources('demandes.csv').items()}
    formulations = []
    for r in list(wb['Demandes'].iter_rows(values_only=True))[1:]:
        ref = texte(r[0])
        for n, colonne in enumerate(range(6, 11), 1):
            if texte(r[colonne]):
                formulations.append([ref, intentions.get(ref, texte(r[2])), str(n), texte(r[colonne]), texte(r[11]), texte(r[12])])
    fusionner('formulations.csv', ['ref', 'intention', 'facon', 'texte', 'ecrit_par', 'verifie_par'], formulations)
    if 'Mots du dialogue' in wb.sheetnames:
        mots = [[texte(r[0]), texte(r[1]), str(n), texte(r[c]), texte(r[6]), texte(r[7])]
                for r in list(wb['Mots du dialogue'].iter_rows(values_only=True))[1:] for n, c in enumerate((3, 4, 5), 1) if texte(r[c])]
        fusionner('mots.csv', ['ref', 'fr', 'facon', 'texte', 'ecrit_par', 'verifie_par'], mots)
    if 'Nombres' in wb.sheetnames:
        nombres = [[texte(r[0]), texte(r[1]), texte(r[3]), texte(r[4]), texte(r[5]), texte(r[6])]
                   for r in list(wb['Nombres'].iter_rows(values_only=True))[1:] if texte(r[0])]
        fusionner('nombres-recus.csv', ['ref', 'valeur', 'en_entier', 'a_l_oral', 'ecrit_par', 'verifie_par'], nombres)


# Classeur d'un service (tools/kit_service.py) : écrans, mots du métier, codes et touches vérifiés, demandes
TYPES_CRITIQUES = {'recapitulatif', 'alerte', 'erreur'}


def service_du_classeur(wb, chemin):
    sujet = (wb.properties.subject or '').strip()
    m = re.match(r'service-(.+)-[^-]+\.xlsx$', pathlib.Path(chemin).name)
    return sujet or (m.group(1) if m else None)


def importer_ecrans(wb):
    corpus, variantes, releves = {}, [], []
    for r in list(wb['Écrans'].iter_rows(values_only=True))[1:]:
        ref, releve, traduction = texte(r[0]), texte(r[7]), texte(r[9])
        if releve:
            releves.append([ref, releve])
        if not ref or not traduction:
            continue
        if not deux_noms(r[12], r[13]):
            if not texte(r[8]).startswith('Déjà validé'):
                R.attente.append(f'{ref} : deux noms différents attendus')
            continue
        francais = releve or texte(r[6])
        valide_par = f'{texte(r[12])} / relu par {texte(r[13])}'
        complete = preparer(ref, 'écran', francais, traduction)
        if complete:
            corpus[ref] = {'fr': francais, 'cible': complete, 'critique': '1' if texte(r[4]) in TYPES_CRITIQUES else '0',
                           'element': f'{texte(r[1])} : {texte(r[2])}', 'valide_par': valide_par}
        courte = texte(r[10])
        if courte and courte.lower() not in SANS_OBJET:
            version = preparer(ref, 'ussd', francais, courte)
            if version and version != complete:
                variantes.append([ref, 'ussd', version, texte(r[12]), texte(r[13])])
    return corpus, variantes, releves


def importer_mots_metier(wb):
    entetes, lignes = lire_csv(DOSSIER / 'glossaire.csv')
    refs = {l[0] for l in lignes if l}
    ajoutes = 0
    for r in list(wb['Mots du métier'].iter_rows(values_only=True))[1:]:
        ref, terme, traduction = texte(r[0]), texte(r[1]), texte(r[6])
        if not traduction or not deux_noms(r[7], r[8]):
            continue
        if ref in refs:
            R.attente.append(f'{ref} : déjà au glossaire, gardé tel quel')
            continue
        if sans_accents(terme) in GLOSSAIRE:
            R.attente.append(f'{ref} « {terme} » : terme déjà traduit au glossaire (« {GLOSSAIRE[sans_accents(terme)][0]} ») ; gardé tel quel')
            continue
        lignes.append([ref, terme, texte(r[2]), texte(r[3]), 'Oui' if texte(r[4]) == 'oui' else 'Non', traduction, '', texte(r[7]), texte(r[8]), texte(r[9])])
        R.entrees.append(ref)
        ajoutes += 1
    if ajoutes:
        ecrire_csv(DOSSIER / 'glossaire.csv', entetes, lignes)


def mettre_a_jour_profil(service, wb, releves):
    dossier = racine / 'profiles' / service
    if not dossier.is_dir():
        R.attente.append(f'profiles/{service}/ introuvable : codes et touches non enregistrés')
        return
    if releves:
        ecrire_csv(dossier / 'releves.csv', ['ref', 'texte_exact'], releves, bom=False)
        print(f'profiles/{service}/releves.csv : {len(releves)} texte(s) exact(s) relevé(s)')
    entetes, codes = lire_csv(dossier / 'codes.csv')
    for colonne in ('premier_ecran', 'verifie_par'):
        if colonne not in entetes:
            entetes.append(colonne)
            codes = [l + [''] for l in codes]
    i = {e: n for n, e in enumerate(entetes)}
    verifies = {texte(r[0]): r for r in list(wb['Codes'].iter_rows(values_only=True))[1:] if texte(r[6]).lower() == 'oui' and texte(r[8])}
    for l in codes:
        r = verifies.get(l[i['code']])
        if r:
            l[i['fiabilite']], l[i['premier_ecran']], l[i['verifie_par']] = 'vérifié', texte(r[7]), texte(r[8])
    ecrire_csv(dossier / 'codes.csv', entetes, codes, bom=False)
    touches = {texte(r[0]): (texte(r[4]), texte(r[6])) for r in list(wb['Touches'].iter_rows(values_only=True))[1:] if texte(r[4]) and texte(r[6])}
    entetes, raccourcis = lire_csv(dossier / 'raccourcis.csv')
    for l in raccourcis:
        if l[0] in touches:
            l[1], l[2] = touches[l[0]]
    ecrire_csv(dossier / 'raccourcis.csv', entetes, raccourcis, bom=False)
    print(f'profiles/{service} : {len(verifies)} code(s) vérifié(s), {len(touches)} parcours de touches relevé(s)')


def importer_explications(wb):
    lignes = []
    for r in list(wb['Termes à expliquer'].iter_rows(values_only=True))[1:]:
        ref = texte(r[0])
        if not ref or not texte(r[6]):
            continue
        notes = []
        explication = gloser(aligner(re.sub(r'\s+', ' ', texte(r[6])), notes), notes)
        courte = gloser(aligner(re.sub(r'\s+', ' ', texte(r[7])), notes), notes)
        if notes:
            R.alignes.append(f'{ref} (explication) : {", ".join(notes)}')
        lignes.append([ref, texte(r[2]), explication, courte, texte(r[8]), texte(r[9])])
    ranger('explications-recues.csv', ['ref', 'terme', 'explication', 'courte', 'traduit_par', 'relu_par'], lignes)


def importer_test(wb):
    lignes = [[texte(r[0]), str(n), texte(r[c])] for r in list(wb['Test'].iter_rows(values_only=True))[1:] for n, c in ((1, 2), (2, 3)) if texte(r[c])]
    ecrire_csv(FINALE / 'test-recu.csv', ['ref', 'facon', 'texte'], lignes, bom=False)
    print(f'test-recu.csv : {len(lignes)} phrase(s) de test à l\'aveugle')


def main():
    fichiers = [a for a in ARGS if not a.startswith('--')]
    if not fichiers:
        sys.exit(__doc__)
    corpus, variantes = {}, []
    for chemin in fichiers:
        wb = load_workbook(chemin, data_only=True)
        onglets = set(wb.sheetnames)
        if 'Écrans' in onglets:
            service = service_du_classeur(wb, chemin)
            c, v, releves = importer_ecrans(wb)
            corpus.update(c); variantes += v
            importer_mots_metier(wb)
            importer_demandes(wb)
            if service:
                mettre_a_jour_profil(service, wb, releves)
        elif 'Réponses' in onglets:
            c, v = importer_reponses(wb)
            corpus.update(c); variantes += v
            corpus.update(importer_menus(wb))
            variantes += importer_courtes(wb)
        elif 'Demandes' in onglets:
            importer_demandes(wb)
        elif 'Termes à expliquer' in onglets:
            importer_explications(wb)
        elif 'Test' in onglets:
            importer_test(wb)
        else:
            print(f'{chemin} : tableur non reconnu, ignoré')
    if corpus:
        ajouter_corpus(corpus)
    if variantes:
        ajouter_variantes(variantes)
        print(f'variantes.csv : {len(variantes)} version(s) USSD, SMS ou voix')
    R.afficher()


if __name__ == '__main__':
    main()
