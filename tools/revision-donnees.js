// Révision d'une langue : constats du pack, avec le contexte du corpus (écran, élément, consigne, priorité)
// et la charte de style.csv, moins ce que les locuteurs ont décidé de garder (decisions.csv).

import { existsSync, readFileSync } from 'node:fs';
import { lireCsv } from './csv.js';
import { constatsOuverts, lireDecisions } from './decisions.js';
import { reviser } from './revision.js';
import { BLOQUANT } from './revision-commun.js';

const lireSiPresent = (fichier) => (existsSync(fichier) ? lireCsv(readFileSync(fichier, 'utf8')) : []);

// style.csv : Sujet -> réponse des locuteurs
export function charte(dossier) {
  const lignes = lireSiPresent(dossier + 'style.csv');
  const reponse = (l) => Object.entries(l).find(([cle]) => cle.toLowerCase().startsWith('votre réponse'))?.[1] || '';
  return Object.fromEntries(lignes.map((l) => [l.Sujet, reponse(l)]));
}

export function revisionOuverte(pack, dossier) {
  const contexte = Object.fromEntries(lireSiPresent(dossier + 'corpus.csv').map((l) => [l.id, l]));
  const constats = reviser({ phrases: pack.phrases, glossaire: pack.glossaire, contexte, politesse: charte(dossier).Politesse || '' });
  return constatsOuverts(constats, lireDecisions(dossier + 'decisions.csv'), pack);
}

export const resume = (constats) => {
  const bloquants = constats.filter((c) => c.niveau === BLOQUANT).length;
  return `${constats.length - bloquants} constats à revoir, ${bloquants} bloquants`;
};
