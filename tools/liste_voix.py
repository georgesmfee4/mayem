#!/usr/bin/env python3
"""Liste des enregistrements à faire par les locuteurs, pour la page d'enregistrement.

  python3 tools/liste_voix.py SORTIE.json [--langue X]

Lit packs/<langue>/finale/voix.csv. Une phrase du corpus sans case est dite en entier ; une phrase
avec des cases {…} est coupée en morceaux, dits séparément : le serveur vocal y glisse ensuite la
somme ou le prénom enregistrés à part. Seules les phrases validées du corpus sont reprises.
"""
import csv, json, pathlib, re, sys

racine = pathlib.Path(__file__).resolve().parent.parent
CASE = re.compile(r'\{[a-z_0-9]+\}')


def choisir_langue(args):
    presentes = sorted(p.parent.parent.name for p in (racine / 'packs').glob('*/finale/voix.csv'))
    if '--langue' in args:
        return args[args.index('--langue') + 1]
    if len(presentes) == 1:
        return presentes[0]
    sys.exit(f"Langues possibles ({', '.join(presentes) or 'aucune'}) : ajouter --langue <code>")


def lire(chemin):
    with open(chemin, encoding='utf-8-sig', newline='') as f:
        return list(csv.DictReader(f))


def morceaux(texte):
    """Les morceaux à dire autour des cases, sans la ponctuation qui touchait la case."""
    parties = [p.strip(' :,;.') for p in CASE.split(texte)]
    return [p for p in parties if re.search(r'\w', p)]


def depuis_corpus(ligne, corpus):
    phrase = corpus.get(ligne['reprise'])
    if not phrase:
        return []
    if not CASE.search(phrase['cible']):
        return [{'ref': ligne['ref'], 'groupe': 'phrases', 'texte': phrase['cible'], 'fr': phrase['fr'],
                 'consigne': "Dites la phrase en entier, d'une voix posée."}]
    parts = morceaux(phrase['cible'])
    return [{'ref': f"{ligne['ref']}-{i}", 'groupe': 'morceaux', 'texte': p, 'fr': phrase['fr'],
             'consigne': f"Morceau {i} sur {len(parts)} de la phrase. Dites seulement ce morceau, "
                         "sans rien ajouter : la somme ou le nom est enregistré à part."}
            for i, p in enumerate(parts, 1)]


def main():
    if len(sys.argv) < 2 or sys.argv[1].startswith('--'):
        sys.exit(__doc__)
    dossier = racine / 'packs' / choisir_langue(sys.argv)
    infos = json.load(open(dossier / 'infos.json', encoding='utf-8'))
    corpus = {r['id']: r for r in lire(dossier / 'corpus.csv') if r.get('valide') == '1'}
    phrases = []
    for ligne in lire(dossier / 'finale' / 'voix.csv'):
        if ligne['reprise']:
            phrases += depuis_corpus(ligne, corpus)
        else:
            phrases.append({'ref': ligne['ref'], 'groupe': ligne['groupe'], 'texte': ligne['texte'],
                            'fr': '', 'consigne': ligne['consigne']})
    sortie = {'langue': infos['nom'], 'version': infos.get('version', ''), 'phrases': phrases}
    pathlib.Path(sys.argv[1]).write_text(json.dumps(sortie, ensure_ascii=False, indent=1), encoding='utf-8')
    print(f"{len(phrases)} enregistrements -> {sys.argv[1]}")


if __name__ == '__main__':
    main()
