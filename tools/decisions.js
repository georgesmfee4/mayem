// Décisions « garder » des locuteurs sur les constats de révision (packs/<langue>/decisions.csv, écrit à
// l'import du tableur). Un constat gardé n'est plus redemandé tant que le bulu concerné n'a pas changé :
// si le bulu change, le constat peut revenir.

import { existsSync, readFileSync } from 'node:fs';
import { lireCsv } from './csv.js';

export const ENTETES_DECISIONS = ['code', 'ref', 'bulu', 'decide_par', 'relu_par', 'date', 'commentaire'];

export const lireDecisions = (fichier) => (existsSync(fichier) ? lireCsv(readFileSync(fichier, 'utf8')) : []);

// Texte actuel d'une phrase ou d'un terme du glossaire
export function texteDe(pack, ref) {
  const phrase = pack.phrases.find((p) => p.id === ref);
  if (phrase) return { fr: phrase.fr, bulu: phrase.bulu, critique: phrase.critique };
  const terme = pack.glossaire.find((t) => t.ref === ref);
  return terme ? { fr: terme.terme, bulu: terme.bulu, critique: terme.critique } : { fr: '', bulu: '', critique: false };
}

const cle = (code, ref, bulu) => [code, ref, (bulu || '').trim()].join('\u0000');

// Constats encore ouverts : réglé quand chacune de ses références a été gardée, sur son bulu actuel
export function constatsOuverts(constats, decisions, pack) {
  const gardes = new Set(decisions.map((d) => cle(d.code, d.ref, d.bulu)));
  return constats.filter((c) => !c.refs.every((ref) => gardes.has(cle(c.code, ref, texteDe(pack, ref).bulu))));
}
