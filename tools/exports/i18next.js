// i18next (JSON v4) : un fichier par langue, la clé est l'id stable de la phrase.
// Les champs {nom} deviennent {{nom}}, la syntaxe d'interpolation d'i18next.

import { validees } from './commun.js';

const interpoler = (texte) => texte.replace(/\{(\w+)\}/g, '{{$1}}');

export function versI18next(pack) {
  const phrases = validees(pack);
  const fichier = (champ) => JSON.stringify(Object.fromEntries(phrases.map((p) => [p.id, interpoler(p[champ])])), null, 2) + '\n';
  return { fr: fichier('fr'), [pack.langue]: fichier('cible') };
}
