// Longueur d'un texte sur l'USSD, comptée comme le réseau la compte : en septets de l'alphabet GSM-7. Une lettre de
// la table d'extension (« € », « [ ») en vaut deux ; une lettre hors de l'alphabet (« ô ») fait passer tout le
// message en UCS-2, où la limite tombe à 70 caractères.

import signes from './gsm7-signes.json' with { type: 'json' };

const BASE = '@£$¥èéùìòÇ\nØø\rÅåΔ_ΦΓΛΩΠΨΣΘΞÆæßÉ !"#¤%&\'()*+,-./0123456789:;<=>?¡ABCDEFGHIJKLMNOPQRSTUVWXYZÄÖÑÜ§¿'
  + 'abcdefghijklmnopqrstuvwxyzäöñüà';
const EXTENSION = '^{}\\[~]|€\f';

export const horsGsm7 = (texte: string): string[] =>
  [...new Set([...texte].filter((c) => !BASE.includes(c) && !EXTENSION.includes(c)))];

export const septets = (texte: string): number => [...texte].reduce((n, c) => n + (EXTENSION.includes(c) ? 2 : 1), 0);

// Un écran qui déborde perd ses dernières lignes, jamais la première : une phrase validée n'est jamais coupée
export function ajuster(texte: string, limite: number): string {
  const lignes = texte.split('\n');
  while (lignes.length > 1 && septets(lignes.join('\n')) > limite) lignes.pop();
  return lignes.join('\n');
}

// Sur un canal à l'alphabet limité : les signes typographiques remplacés (service/gsm7-signes.json), et les lettres de
// la langue écrites comme les locuteurs l'ont décidé (finale/gsm7.csv : deux noms, et l'import a vérifié qu'aucune
// phrase validée n'en devient identique à une autre)
export function versGsm7(texte: string, lettres: Map<string, string> = new Map()): string {
  const typographie = signes as Record<string, string>;
  return [...texte].map((c) => lettres.get(c) ?? typographie[c] ?? c).join('');
}
