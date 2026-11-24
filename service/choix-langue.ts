// Le choix de la langue sur l'USSD. Le premier appel d'un numéro inconnu commence par l'écran de choix ; ensuite la
// langue est retrouvée (service/preferences.ts). Mayem n'ajoute rien aux menus du service : pour changer de langue,
// la personne écrit son nom (« bulu », « français ») ou « langue » pour revoir le choix, à tout moment.
// Après le choix, elle reprend exactement là où elle en était.

import type { Reponses } from './reponses.ts';

export interface Langue { code: string; nom: string }

// Titre dans chaque langue au premier appel (on ne sait pas encore laquelle la personne lit), sinon dans la sienne.
// Chaque langue s'annonce sous son propre nom, qui ne se traduit pas.
export function ecranDeChoix(reponses: Reponses, langues: Langue[], langueActuelle: string | null): string {
  const titres = (langueActuelle ? [langueActuelle] : langues.map((l) => l.code)).map((code) => reponses.rendre({ ref: 'RF102' }, code).texte);
  return [...new Set(titres), ...langues.map((l, i) => `${i + 1}. ${l.nom}`)].join('\n');
}

// Casse, accents et ponctuation ne comptent pas ; « en bulu » vaut « bulu »
const simple = (texte: string) => texte.normalize('NFD').replace(/\p{M}/gu, '').toLowerCase()
  .replace(/[^\p{L}\p{N}]+/gu, ' ').trim().replace(/^en /, '');

// Sur l'écran de choix : son numéro, ou le nom de la langue écrit en entier
export function langueChoisie(saisie: string, langues: Langue[]): string | null {
  if (/^\d{1,2}$/.test(saisie.trim())) return langues[Number(saisie) - 1]?.code ?? null;
  return langues.find((l) => simple(l.nom) === simple(saisie))?.code ?? null;
}
