// Le choix de la langue sur l'USSD. Le premier appel d'un numéro inconnu commence par l'écran de choix ; ensuite la
// langue est retrouvée (service/preferences.ts). Sur chaque menu, Mayem ajoute une ligne « Langue », écrite dans la
// langue en cours et sans nommer aucune langue : c'est l'écran de choix qui montre les langues prises en charge.
// Après le choix, la personne reprend exactement là où elle en était.

import type { Reponses } from './reponses.ts';

export interface Langue { code: string; nom: string }

// Une ligne de menu numérotée : « 1. Solde », « 2) Envoyer »
const MENU = /^\s*\d{1,2}\s*[.):-]/m;

// Titre dans chaque langue au premier appel (on ne sait pas encore laquelle la personne lit), sinon dans la sienne.
// Chaque langue s'annonce sous son propre nom, qui ne se traduit pas.
export function ecranDeChoix(reponses: Reponses, langues: Langue[], langueActuelle: string | null): string {
  const titres = (langueActuelle ? [langueActuelle] : langues.map((l) => l.code)).map((code) => reponses.rendre({ ref: 'RF102' }, code).texte);
  return [...new Set(titres), ...langues.map((l, i) => `${i + 1}. ${l.nom}`)].join('\n');
}

export function langueChoisie(saisie: string, langues: Langue[]): string | null {
  return /^\d{1,2}$/.test(saisie.trim()) ? langues[Number(saisie) - 1]?.code ?? null : null;
}

// La ligne « Langue » à ajouter sous un menu : seulement sur un écran de menu, si la touche n'y est pas déjà prise
// (« 0. Retour ») et si l'écran tient toujours dans la place d'un écran USSD
export function ligneLangue(reponses: Reponses, touche: string, langue: string, ecranOriginal: string, affiche: string, limite: number): string | null {
  if (!MENU.test(ecranOriginal) || new RegExp(`^\\s*${touche}\\s*[.):-]`, 'm').test(ecranOriginal)) return null;
  const ligne = reponses.rendre({ ref: 'U08', prefixe: `${touche}. ` }, langue).texte;
  return affiche.length + 1 + ligne.length <= limite ? ligne : null;
}
