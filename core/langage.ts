// Un texte sans mot en minuscules (« NOUS CONTACTER », « Nos Comptes ») est-il un texte à lire ou
// un nom propre ? Sans dictionnaire, la preuve vient du pack : un mot que le corpus ou le glossaire
// écrit en minuscules est un mot courant, pas un nom ni une marque.

import { estPhrase, retirerFaits } from './faits.ts';
import type { Pack } from './types.ts';

export const sansAccents = (texte: string) => texte.normalize('NFD').replace(/\p{M}/gu, '');

// Comparaison large d'un mot : casse, accents et pluriel ignorés (« SECURITE », « Comptes »).
// Elle sert à reconnaître et à gloser, jamais à remplacer un texte.
export function souple(mot: string): string {
  const nu = sansAccents(mot).toLowerCase();
  return nu.length > 4 ? nu.replace(/[sx]$/, '') : nu;
}

// Le français seulement : l'anglais écrit ses marques avec ses mots courants (« Mobile Money »)
const MOT_COURANT = /(?<!\p{L})\p{Ll}\p{L}{3,}/gu;
function motsCourants(pack: Pack): Set<string> {
  const textes = [...pack.phrases.map((phrase) => phrase.fr), ...pack.glossaire.map((terme) => terme.terme)];
  return new Set(textes.flatMap((texte) => texte.replace(/\{\w+\}/g, ' ').match(MOT_COURANT) || []).map(souple));
}

const cacheMots = new WeakMap<Pack, Set<string>>();
function motsCourantsDe(pack: Pack): Set<string> {
  let mots = cacheMots.get(pack);
  if (!mots) cacheMots.set(pack, (mots = motsCourants(pack)));
  return mots;
}

export function estLangage(texte: string, pack: Pack): boolean {
  if (estPhrase(texte)) return true;
  const mots = retirerFaits(texte).split(/[^\p{L}]+/u).filter(Boolean);
  // Phrase entière en majuscules : un nom ne finit pas par un point
  if (mots.length >= 4 && /[.!?…]$/.test(texte.trim())) return true;
  const courants = motsCourantsDe(pack);
  return mots.some((mot) => mot.length >= 4 && courants.has(souple(mot)));
}
