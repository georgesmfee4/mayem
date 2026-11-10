// Inventaire des textes d'un service : ce qui est déjà traduit, ce qui manque, et sous quelle forme
// le donner aux locuteurs. Les montants, dates, numéros et références sont remplacés par des champs
// ({amount}, {date}…) : des centaines de textes qui ne diffèrent que par leurs valeurs deviennent un
// seul modèle à traduire, et aucune valeur réelle ne sort de l'inventaire.
// Un nom de personne ne se reconnaît pas sans risque : l'inventaire se fait sur des données fictives.

import { MOTIFS } from './faits.ts';
import { normaliser, traduire } from './moteur.ts';
import { termeUtilisable } from './termes.ts';
import type { Categorie, Pack } from './types.ts';

export type Etat = 'traduit' | 'partiel' | 'absent' | 'rejete';
export interface Manque { modele: string; occurrences: number; etat: Etat; categorie: Categorie | null; termes: string[] }
export interface Rapport {
  couverture: Record<Etat, number> & { total: number };
  manques: Manque[];
  motsAbsents: { mot: string; occurrences: number }[];
}

// Nom de champ du corpus pour chaque sorte de fait, dans l'ordre où on les cherche
const SORTES: [string, string][] = [
  ['amount', MOTIFS.montant], ['date', MOTIFS.date], ['account', MOTIFS.compte],
  ['ref', MOTIFS.reference], ['phone', MOTIFS.telephone], ['percent', MOTIFS.pourcentage],
];
const FAIT = new RegExp(SORTES.map(([nom, motif]) => `(?<${nom}>${motif})`).join('|'), 'gu');

// « Envoi de 5 000 FCFA à 690 12 34 56 » -> « Envoi de {amount} à {phone} » ; amount_1, amount_2 s'il y en a plusieurs
export function masquerFaits(texte: string): string {
  const trouves = [...texte.matchAll(FAIT)].map((m) => Object.keys(m.groups!).find((nom) => m.groups![nom] !== undefined)!);
  const total = (nom: string) => trouves.filter((t) => t === nom).length;
  const vus = new Map<string, number>();
  return texte.replace(FAIT, (...args) => {
    const groupes = args[args.length - 1] as Record<string, string | undefined>;
    const nom = Object.keys(groupes).find((n) => groupes[n] !== undefined)!;
    vus.set(nom, (vus.get(nom) || 0) + 1);
    return total(nom) > 1 ? `{${nom}_${vus.get(nom)}}` : `{${nom}}`;
  });
}

const motsDuTexte = (texte: string) =>
  texte.replace(/\{\w+\}/g, ' ').toLowerCase().split(/[^\p{L}'’-]+/u).filter((mot) => mot.length >= 3 && /\p{L}/u.test(mot));

// Mots déjà connus : ceux des phrases validées et des termes utilisables du glossaire
function vocabulaire(pack: Pack): Set<string> {
  const textes = [
    ...pack.phrases.filter((p) => p.valide).flatMap((p) => [p.fr, ...p.en]),
    ...pack.glossaire.filter(termeUtilisable).map((t) => t.terme),
  ];
  return new Set(textes.flatMap(motsDuTexte));
}

function etatDe(texte: string, pack: Pack): { etat: Etat; categorie: Categorie | null; termes: string[] } | null {
  const res = traduire(texte, pack);
  if (!res) return null; // vide ou uniquement des faits : rien à traduire
  if (res.statut === 'ok') return { etat: 'traduit', categorie: null, termes: [] };
  if (res.statut === 'rejete') return { etat: 'rejete', categorie: null, termes: [] };
  const termes = (res.termes || []).map((t) => t.fr);
  return { etat: termes.length ? 'partiel' : 'absent', categorie: res.categorie, termes };
}

export function inventorier(textes: string[], pack: Pack): Rapport {
  const couverture = { traduit: 0, partiel: 0, absent: 0, rejete: 0, total: 0 };
  const manques = new Map<string, Manque>();
  const connus = vocabulaire(pack);
  const absents = new Map<string, number>();
  for (const brut of textes) {
    const texte = normaliser(brut);
    const etat = etatDe(texte, pack);
    if (!etat) continue;
    couverture[etat.etat]++;
    couverture.total++;
    if (etat.etat === 'traduit') continue;
    const modele = masquerFaits(texte);
    const deja = manques.get(modele);
    if (deja) { deja.occurrences++; continue; }
    manques.set(modele, { modele, occurrences: 1, ...etat });
    for (const mot of motsDuTexte(modele)) if (!connus.has(mot)) absents.set(mot, (absents.get(mot) || 0) + 1);
  }
  const parFrequence = <T extends { occurrences: number }>(a: T, b: T) => b.occurrences - a.occurrences;
  return {
    couverture,
    manques: [...manques.values()].sort(parFrequence),
    motsAbsents: [...absents].map(([mot, occurrences]) => ({ mot, occurrences })).sort(parFrequence),
  };
}
