// Ressources Android (strings.xml) : values/ pour le français, values-b+<langue>/ pour la langue
// (qualificatif BCP 47, obligatoire pour un code à trois lettres comme bum).
// Les champs {nom} deviennent %1$s, %2$s… numérotés dans l'ordre du français, pour que la traduction
// garde les mêmes arguments même si elle les cite dans un autre ordre.

import { champs, entete, mentionDroits, validees } from './commun.js';

const nomRessource = (id) => 'mayem_' + id.toLowerCase().replace(/[^a-z0-9_]/g, '_');

function versAndroid(texte, ordre) {
  // % n'est doublé que dans une chaîne à arguments : sans argument, Android l'affiche tel quel
  const brut = ordre.length ? texte.replace(/%/g, '%%') : texte;
  const place = brut.replace(/\{(\w+)\}/g, (_, nom) => `%${ordre.indexOf(nom) + 1}$s`);
  // Android lit lui-même \ ' " @ ou ? en tête, et les retours à la ligne : on les échappe à sa façon
  const android = place
    .replace(/\\/g, '\\\\')
    .replace(/'/g, "\\'")
    .replace(/"/g, '\\"')
    .replace(/^([@?])/, '\\$1')
    .replace(/\n/g, '\\n');
  return android.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

export function versStringsXml(pack) {
  const phrases = validees(pack);
  // « -- » est interdit dans un commentaire XML
  const fichier = (champ) => entete + `<!-- ${mentionDroits(pack).replace(/-{2,}/g, '-')} -->\n<resources>\n`
    + phrases.map((p) => `  <string name="${nomRessource(p.id)}">${versAndroid(p[champ], champs(p.fr))}</string>`).join('\n')
    + '\n</resources>\n';
  return { values: fichier('fr'), [`values-b+${pack.langue}`]: fichier('cible') };
}
