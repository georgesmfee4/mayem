// Inventaire des textes d'un service : ce qui est déjà traduit, ce qui manque, et sous quelle forme
// le donner aux locuteurs. Les montants, dates, numéros et références sont remplacés par des champs
// ({amount}, {date}…) : des centaines de textes qui ne diffèrent que par leurs valeurs deviennent un
// seul modèle à traduire, et aucune valeur réelle ne sort de l'inventaire.
// Un nom de personne ne se reconnaît pas sans risque : l'inventaire se fait sur des données fictives.

import { MOTIFS } from './faits.ts';
import { souple } from './langage.ts';
import { normaliser, traduire } from './moteur.ts';
import { termeUtilisable } from './termes.ts';
import type { Categorie, Pack } from './types.ts';

// proche : le texte ne diffère d'une entrée validée que par un pluriel, un accent ou la ponctuation ; les locuteurs
// confirment ou corrigent au lieu de retraduire
export type Etat = 'traduit' | 'proche' | 'partiel' | 'absent' | 'rejete';
// services : nombre de services où le modèle apparaît ; categorie vide : Mayem ne le signale pas dans la page
export interface Manque { modele: string; occurrences: number; services: number; etat: Etat; proche: string; categorie: Categorie | null; termes: string[] }
export interface Rapport {
  couverture: Record<Etat, number> & { total: number };
  manques: Manque[];
  motsAbsents: { mot: string; occurrences: number }[];
}
// services : le service de chaque texte, dans le même ordre (un seul service si absent).
// intacts : marques et noms de produits du service, jamais envoyés aux locuteurs.
export interface Releve { services?: string[]; intacts?: string[] }

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
  return new Set(textes.flatMap(motsDuTexte).map(souple));
}

// Texte comparé au large : casse, accents, pluriels et ponctuation ignorés, champs réduits à {}
const large = (texte: string) =>
  texte.replace(/\{\w+\}/g, ' {} ').split(/[^\p{L}\p{N}{}]+/u).filter(Boolean).map(souple).join(' ');

// Entrées validées, rangées par leur forme large : « Cartes bancaires » retrouve « carte bancaire »
function validees(pack: Pack): Map<string, string> {
  const sources = [
    ...pack.phrases.filter((p) => p.valide && p.bulu).flatMap((p) => [p.fr, ...p.en]),
    ...pack.glossaire.filter(termeUtilisable).flatMap((t) => t.terme.split('/').map((forme) => forme.trim())),
  ];
  return new Map(sources.filter(Boolean).map((source) => [large(source), source]));
}

type Constat = Pick<Manque, 'etat' | 'proche' | 'categorie' | 'termes'>;

function etatDe(texte: string, pack: Pack, proches: Map<string, string>): Constat | null {
  const res = traduire(texte, pack);
  if (!res) return null; // vide ou uniquement des faits : rien à traduire
  if (res.statut === 'ok') return { etat: 'traduit', proche: '', categorie: null, termes: [] };
  if (res.statut === 'rejete') return { etat: 'rejete', proche: '', categorie: null, termes: [] };
  const termes = (res.termes || []).map((t) => t.fr);
  const proche = proches.get(large(masquerFaits(texte))) || '';
  return { etat: proche ? 'proche' : termes.length ? 'partiel' : 'absent', proche, categorie: res.categorie, termes };
}

// Les textes communs à plusieurs services d'abord : c'est le jargon partagé, traduit une fois pour tous
const parReprise = (a: Manque, b: Manque) => b.services - a.services || b.occurrences - a.occurrences;

export function inventorier(textes: string[], pack: Pack, releve: Releve = {}): Rapport {
  const couverture = { traduit: 0, proche: 0, partiel: 0, absent: 0, rejete: 0, total: 0 };
  const manques = new Map<string, Manque>();
  const servicesDe = new Map<string, Set<string>>();
  const connus = vocabulaire(pack);
  const proches = validees(pack);
  const intacts = new Set((releve.intacts || []).map((nom) => normaliser(nom).toLowerCase()));
  const absents = new Map<string, number>();
  textes.forEach((brut, i) => {
    const texte = normaliser(brut);
    const constat = intacts.has(texte.toLowerCase()) ? null : etatDe(texte, pack, proches);
    if (!constat) return;
    couverture[constat.etat]++;
    couverture.total++;
    if (constat.etat === 'traduit') return;
    const modele = masquerFaits(texte);
    // « Cartes Bancaires » et « Cartes bancaires » : une seule ligne pour les locuteurs
    const cle = modele.toLowerCase();
    servicesDe.set(cle, (servicesDe.get(cle) || new Set<string>()).add(releve.services?.[i] || ''));
    const deja = manques.get(cle);
    if (deja) {
      deja.occurrences++;
      return;
    }
    manques.set(cle, { modele, occurrences: 1, services: 1, ...constat });
    for (const mot of motsDuTexte(modele)) if (!connus.has(souple(mot))) absents.set(mot, (absents.get(mot) || 0) + 1);
  });
  for (const [cle, manque] of manques) manque.services = servicesDe.get(cle)!.size;
  return {
    couverture,
    manques: [...manques.values()].sort(parReprise),
    motsAbsents: [...absents].map(([mot, occurrences]) => ({ mot, occurrences })).sort((a, b) => b.occurrences - a.occurrences),
  };
}
