// Ce qui a changé entre deux packs, la version qui en découle et l'entrée du journal (CHANGELOG.md).
// Un service qui réutilise nos données voit ainsi qu'elles ont changé, et quelles phrases.

// Avant le format 2, la traduction s'appelait comme la langue : les anciennes versions restent comparables
const actuel = (element) => ('bulu' in element && !('cible' in element) ? { ...element, cible: element.bulu } : element);
const parCle = (liste, cle) => new Map(liste.map((element) => [element[cle], actuel(element)]));

// Champs qui changent le sens affiché ; les noms des relecteurs ou un commentaire n'en font pas partie
const PHRASE = ['fr', 'cible', 'valide', 'critique', 'variantes'];
const TERME = ['terme', 'cible', 'critique'];
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
    format: ancien && 'format' in nouveau && ancien.format !== nouveau.format ? nouveau.format : null,
  };
}

const total = (d, ...types) => types.reduce((n, type) => n + d.phrases[type].length + d.termes[type].length, 0);
export const aChange = (d) => total(d, 'ajoutes', 'retires', 'modifies') > 0 || (d.infos || []).length > 0 || !!d.format;

// Correction -> 0.3.1 ; phrase ou terme ajouté ou retiré -> 0.4.0. Le chiffre majeur reste aux humains
// (changement de schéma ou d'orthographe).
export function versionSuivante(version, d) {
  const [majeur, mineur, correctif] = version.split('.').map(Number);
  // Un nouveau format n'est plus lisible par les anciens lecteurs : au moins une version mineure
  if (d.format || total(d, 'ajoutes', 'retires')) return `${majeur}.${mineur + 1}.0`;
  if (total(d, 'modifies') || (d.infos || []).length) return `${majeur}.${mineur}.${correctif + 1}`;
  return version;
}

export function entreeJournal(version, date, d) {
  const lignes = [`## ${version} (${date})`];
  if (d.format) lignes.push(`- Format ${d.format} du pack (packs/schema.json) ; aucune traduction changée par ce passage`);
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
