// Texte coupé par des balises : « Votre solde est de <b>25 000 FCFA</b> ».
// Le bloc entier est traduit d'un coup ; il faut ensuite ranger le bulu dans les morceaux
// d'origine, car la page ne change que la valeur des nœuds texte existants.
// Les morceaux protégés (faits, valeurs reprises comme un nom) gardent leur texte exact.

import { memesChiffres, queDesFaits } from './faits.ts';
import { normaliser } from './moteur.ts';

// Nouveau texte de chaque morceau (sans les espaces autour), ou null quand le bulu
// ne se range pas dans la structure d'origine : la page garde alors l'original.
export function repartir(morceaux: string[], sortie: string, valeurs: string[]): string[] | null {
  const propres = morceaux.map(normaliser);
  const protege = propres.map((texte) => texte !== '' && (queDesFaits(texte) || valeurs.includes(texte)));

  // Le bulu coupé à chaque morceau protégé, dans l'ordre d'origine
  const segments: string[] = [];
  let debut = 0;
  for (let i = 0; i < morceaux.length; i++) {
    if (!protege[i]) continue;
    const position = sortie.indexOf(propres[i], debut);
    if (position < 0) return null; // valeur absente ou déplacée par la traduction
    segments.push(sortie.slice(debut, position));
    debut = position + propres[i].length;
  }
  segments.push(sortie.slice(debut));

  const resultat = [...propres];
  let espace = 0; // numéro de l'intervalle entre deux morceaux protégés
  let groupe: number[] = [];
  for (let i = 0; i <= morceaux.length; i++) {
    if (i < morceaux.length && !protege[i]) {
      if (propres[i]) groupe.push(i);
      continue;
    }
    if (!ranger(groupe, segments[espace].trim(), propres, resultat)) return null;
    groupe = [];
    espace++;
  }
  return resultat;
}

// Le segment va dans le premier morceau de mots de l'intervalle, les suivants sont vidés
function ranger(groupe: number[], segment: string, propres: string[], resultat: string[]): boolean {
  if (!groupe.length) return segment === '';
  const origine = groupe.map((i) => propres[i]).join(' ');
  if (!memesChiffres(origine, segment)) return false;
  groupe.forEach((i, rang) => (resultat[i] = rang === 0 ? segment : ''));
  return true;
}
