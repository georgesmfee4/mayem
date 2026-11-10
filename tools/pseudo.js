// Pseudo-langue « qps » (code ISO réservé à l'usage local) : trouve les textes coupés et les débordements
// avant que les locuteurs aient tout traduit. Chaque texte français devient plus long de 40 %, prend des
// lettres accentuées et des lettres du bulu (ô, é, ñ, ɔ, ŋ) pour vérifier les polices, et s'encadre de ⟦ ⟧ :
// un crochet de fin absent à l'écran signale un texte tronqué.
// Champs {…}, montants, dates, numéros et références ne changent pas : le pack reste valide.

import { FAITS } from '../core/faits.ts';
import { empreinte } from '../core/empreinte.ts';
import { termeUtilisable } from '../core/termes.ts';

const LETTRES = { a: 'á', e: 'é', i: 'í', o: 'ô', u: 'ú', n: 'ñ', c: 'ç', A: 'Á', E: 'É', I: 'Í', O: 'Ô', U: 'Ú', N: 'Ñ' };
const REMPLISSAGE = ' ɔŋɔ ŋɔɔ ɔŋŋ';
const PROTEGE = new RegExp(`\\{\\w+\\}|${FAITS.source}`, 'gu');

const accentuer = (morceau) => morceau.replace(/[aeiounc]/gi, (lettre) => LETTRES[lettre] || lettre);

export function pseudo(texte) {
  if (!texte) return texte;
  let sortie = '';
  let fin = 0;
  for (const protege of texte.matchAll(PROTEGE)) {
    sortie += accentuer(texte.slice(fin, protege.index)) + protege[0];
    fin = protege.index + protege[0].length;
  }
  sortie += accentuer(texte.slice(fin));
  const ajout = Math.ceil(texte.length * 0.4);
  return `⟦${sortie}${REMPLISSAGE.repeat(Math.ceil(ajout / REMPLISSAGE.length)).slice(0, ajout)}⟧`;
}

// Le pack pseudo est fabriqué en mémoire à partir d'un vrai pack : il n'entre jamais dans packs/
export async function packPseudo(pack) {
  const resultat = {
    ...pack,
    langue: 'qps',
    nom: 'Pseudo',
    empreinte: '',
    phrases: pack.phrases.map((p) => ({ ...p, bulu: pseudo(p.fr) })),
    glossaire: pack.glossaire.map((t) => (termeUtilisable(t) ? { ...t, bulu: t.terme.split('/').map((f) => pseudo(f.trim())).join(' / ') } : t)),
  };
  resultat.empreinte = await empreinte(resultat);
  return resultat;
}
