// Décisions « garder » des locuteurs sur les constats de révision (packs/<langue>/decisions.csv, écrit à
// l'import du tableur). Un constat gardé n'est plus redemandé tant que la traduction concernée n'a pas changé :
// si la traduction change, le constat peut revenir.

import { existsSync, readFileSync } from 'node:fs';
import { lireCsv } from './csv.js';

export const ENTETES_DECISIONS = ['code', 'ref', 'cible', 'decide_par', 'relu_par', 'date', 'commentaire'];

export const lireDecisions = (fichier) => (existsSync(fichier) ? lireCsv(readFileSync(fichier, 'utf8')) : []);

// Texte actuel d'une phrase ou d'un terme du glossaire
export function texteDe(pack, ref) {
  const phrase = pack.phrases.find((p) => p.id === ref);
  if (phrase) return { fr: phrase.fr, cible: phrase.cible, critique: phrase.critique };
  const terme = pack.glossaire.find((t) => t.ref === ref);
  return terme ? { fr: terme.terme, cible: terme.cible, critique: terme.critique } : { fr: '', cible: '', critique: false };
}

// Une majuscule, une apostrophe ou une espace corrigée ne change pas ce qui a été décidé
const comparable = (cible) => (cible || '').replace(/[’‘]/g, "'").replace(/\s+/g, ' ').trim().toLowerCase();
const cle = (code, ref, cible) => [code, ref, comparable(cible)].join('\u0000');

// Constats encore ouverts : réglé quand chacune de ses références a été gardée, sur sa traduction actuelle
export function constatsOuverts(constats, decisions, pack) {
  const gardes = new Set(decisions.map((d) => cle(d.code, d.ref, d.cible)));
  return constats.filter((c) => !c.refs.every((ref) => gardes.has(cle(c.code, ref, texteDe(pack, ref).cible))));
}
