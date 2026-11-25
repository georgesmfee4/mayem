"""Alphabet des téléphones simples (USSD, GSM-7) et écriture, sur ce canal, des textes validés en langue nationale.
Partagé par le tableur des locuteurs (kit_finale.py --gsm7) et son import (import_finale.py). Les signes
typographiques (service/gsm7-signes.json) se remplacent sans décision ; les lettres de la langue, seulement comme les
locuteurs l'ont décidé (finale/gsm7.csv), et jamais si deux phrases validées devenaient identiques."""
import csv, io, json, pathlib, re, unicodedata

racine = pathlib.Path(__file__).resolve().parent.parent
ALPHABET = set("@£$¥èéùìòÇ\nØø\rÅåΔ_ΦΓΛΩΠΨΣΘΞÆæßÉ !\"#¤%&'()*+,-./0123456789:;<=>?¡"
               "ABCDEFGHIJKLMNOPQRSTUVWXYZÄÖÑÜ§¿abcdefghijklmnopqrstuvwxyzäöñüà")
EXTENSION = set("^{}\\[~]|€\f")
SIGNES = json.load(open(racine / 'service' / 'gsm7-signes.json', encoding='utf-8'))
MOT = re.compile(r"[^\s.,;:!?()\"«»/{}\d…—]+")


def hors_alphabet(texte):
    return {c for c in texte if c not in ALPHABET and c not in EXTENSION}


def lire(chemin):
    if not chemin.exists():
        return []
    return list(csv.DictReader(io.StringIO(open(chemin, encoding='utf-8-sig', newline='').read())))


def textes_affichables(dossier):
    """Tout ce que Mayem peut afficher en langue nationale : phrases et termes validés, versions par canal, explications"""
    pack = json.load(open(dossier / 'pack.json', encoding='utf-8'))
    textes = [p['cible'] for p in pack['phrases'] if p.get('valide') and p.get('cible')]
    textes += [t['cible'] for t in pack['glossaire'] if t.get('cible')]
    textes += [v['cible'] for v in lire(dossier / 'finale' / 'variantes.csv')]
    textes += [e[c] for e in lire(dossier / 'finale' / 'explications-recues.csv') for c in ('explication', 'courte') if e.get(c)]
    return textes


def ecrire(texte, table):
    return ''.join(table.get(c, SIGNES.get(c, c)) for c in texte)


def sans_accent(lettre):
    return unicodedata.normalize('NFD', lettre)[0]


def confusions(textes, table):
    """Paires de textes validés différents qui s'écriraient pareil sur l'USSD avec cette table"""
    vus, paires = {}, []
    for texte in dict.fromkeys(textes):
        ecrit = ecrire(texte, table)
        if ecrit in vus:
            paires.append((vus[ecrit], texte))
        else:
            vus[ecrit] = texte
    return paires
