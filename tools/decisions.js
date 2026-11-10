// Décisions « garder » des locuteurs sur les points du contrôle (packs/<langue>/decisions.csv, écrit par
// tools/kit.py à l'import d'un tableur de relecture). Un point gardé n'est plus redemandé tant que le texte
// sur lequel porte la décision n'a pas changé : si le bulu change, le point peut revenir.

import { existsSync, readFileSync } from 'node:fs';
import { lireCsv } from './csv.js';

export const ENTETES_DECISIONS = ['type', 'point', 'ref', 'bulu', 'decide_par', 'relu_par', 'date', 'commentaire'];

export const lireDecisions = (fichier) => (existsSync(fichier) ? lireCsv(readFileSync(fichier, 'utf8')) : []);

// Texte actuel d'une phrase ou d'un terme du glossaire (les points de cohérence citent aussi des termes)
export function texteDe(pack, ref) {
  const phrase = pack.phrases.find((p) => p.id === ref);
  if (phrase) return { fr: phrase.fr, bulu: phrase.bulu, critique: phrase.critique };
  const terme = pack.glossaire.find((t) => t.ref === ref);
  return terme ? { fr: terme.terme, bulu: terme.bulu, critique: terme.critique } : { fr: '', bulu: '', critique: false };
}

const cle = (type, point, ref, bulu) => [type, point, ref, bulu.trim()].join('\u0000');

// Points encore à traiter : un point est réglé quand chacune de ses références a été gardée, sur son bulu actuel
export function pointsOuverts(points, decisions, pack) {
  const gardees = new Set(decisions.map((d) => cle(d.type, d.point, d.ref, d.bulu)));
  return points.filter((point) => !point.ids.every((ref) => gardees.has(cle(point.type, point.ids.join('+'), ref, texteDe(pack, ref).bulu))));
}
