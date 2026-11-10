// Ce qui a changé entre deux packs, la version qui en découle et l'entrée du journal (CHANGELOG.md).
// Un service qui réutilise nos données voit ainsi qu'elles ont changé, et quelles phrases.

const parCle = (liste, cle) => new Map(liste.map((element) => [element[cle], element]));

// Champs qui changent le sens affiché ; les noms des relecteurs ou un commentaire n'en font pas partie
const PHRASE = ['fr', 'bulu', 'valide', 'critique'];
const TERME = ['terme', 'bulu', 'critique'];
// Informations générales : un changement (droits, orthographe, étiquettes…) compte comme une correction
const INFOS = ['nom', 'producteur', 'droits', 'orthographe', 'etiquettes'];

function comparer(anciens, nouveaux, cle, champs) {
  const avant = parCle(anciens, cle);
  const apres = parCle(nouveaux, cle);
  return {
    ajoutes: [...apres.keys()].filter((k) => !avant.has(k)),
    retires: [...avant.keys()].filter((k) => !apres.has(k)),
    modifies: [...apres.keys()].filter((k) => avant.has(k) && champs.some((c) => JSON.stringify(avant.get(k)[c]) !== JSON.stringify(apres.get(k)[c]))),
  };
}

export function differences(ancien, nouveau) {
  return {
    phrases: comparer(ancien?.phrases || [], nouveau.phrases, 'id', PHRASE),
    termes: comparer(ancien?.glossaire || [], nouveau.glossaire, 'ref', TERME),
    infos: INFOS.filter((champ) => champ in nouveau && JSON.stringify(ancien?.[champ]) !== JSON.stringify(nouveau[champ])),
  };
}

const total = (d, ...types) => types.reduce((n, type) => n + d.phrases[type].length + d.termes[type].length, 0);
export const aChange = (d) => total(d, 'ajoutes', 'retires', 'modifies') > 0 || (d.infos || []).length > 0;

// Correction -> 0.3.1 ; phrase ou terme ajouté ou retiré -> 0.4.0. Le chiffre majeur reste aux humains
// (changement de schéma ou d'orthographe).
export function versionSuivante(version, d) {
  const [majeur, mineur, correctif] = version.split('.').map(Number);
  if (total(d, 'ajoutes', 'retires')) return `${majeur}.${mineur + 1}.0`;
  if (total(d, 'modifies') || (d.infos || []).length) return `${majeur}.${mineur}.${correctif + 1}`;
  return version;
}

export function entreeJournal(version, date, d) {
  const lignes = [`## ${version} (${date})`];
  const ligne = (titre, ids) => ids.length && lignes.push(`- ${titre} (${ids.length}) : ${ids.join(', ')}`);
  ligne('Phrases ajoutées', d.phrases.ajoutes);
  ligne('Phrases modifiées', d.phrases.modifies);
  ligne('Phrases retirées', d.phrases.retires);
  ligne('Termes ajoutés', d.termes.ajoutes);
  ligne('Termes modifiés', d.termes.modifies);
  ligne('Termes retirés', d.termes.retires);
  ligne('Informations modifiées', d.infos || []);
  return lignes.join('\n');
}
