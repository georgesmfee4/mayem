// Version publique d'un pack : ce qui sort de l'équipe Mayem (extension, script intégré, API, exports).
// Les noms des traducteurs ne servent qu'à la double validation interne et ne sortent jamais :
// chaque personne devient un code (« Mayem-1 »…), toujours le même pour un même nom. La règle des deux
// personnes différentes reste ainsi vérifiable par l'extension, sans dire qui. Les commentaires du
// glossaire, qui peuvent citer des personnes, sont retirés. L'empreinte est recalculée.

import { empreinte } from '../core/empreinte.ts';

const PERSONNES_PHRASE = ['traduit_par', 'relu_par', 'retraduit_par'];
const PERSONNES_TERME = ['traduit_par', 'relu_par'];

export async function versPublic(pack) {
  const codes = new Map();
  const code = (nom) => {
    const cle = (nom || '').trim().toLowerCase();
    if (!cle) return '';
    if (!codes.has(cle)) codes.set(cle, `Mayem-${codes.size + 1}`);
    return codes.get(cle);
  };
  const masquer = (element, champs) => ({ ...element, ...Object.fromEntries(champs.map((c) => [c, code(element[c])])) });
  const resultat = {
    ...pack,
    empreinte: '',
    phrases: pack.phrases.map((p) => masquer(p, PERSONNES_PHRASE)),
    glossaire: pack.glossaire.map((t) => ({ ...masquer(t, PERSONNES_TERME), commentaire: '' })),
  };
  resultat.empreinte = await empreinte(resultat);
  return resultat;
}

// Noms réels d'un pack interne, pour vérifier qu'aucun ne sort
export const nomsInternes = (pack) => [...new Set([
  ...pack.phrases.flatMap((p) => PERSONNES_PHRASE.map((c) => p[c])),
  ...pack.glossaire.flatMap((t) => PERSONNES_TERME.map((c) => t[c])),
].map((nom) => (nom || '').trim()).filter(Boolean))];
