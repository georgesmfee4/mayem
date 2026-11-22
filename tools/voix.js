// Enregistrements à faire par les locuteurs pour le serveur vocal, langue par langue (packs/<code>/finale/voix.csv).
// Une phrase validée sans case se dit en entier ; une phrase à cases {…} se coupe en morceaux dits séparément :
// le serveur vocal y glisse ensuite la somme ou le prénom enregistrés à part. Rien d'autre que le corpus validé.
//
//   node tools/voix.js SORTIE.json      liste de chaque langue qui en a une

import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { pathToFileURL } from 'node:url';
import { lireCsv } from './csv.js';
import { dossier, langues } from './langues.js';

const CASE = /\{[a-z_0-9]+\}/g;
const lire = (chemin) => lireCsv(readFileSync(chemin, 'utf8'));

// Les morceaux autour des cases, sans la ponctuation qui touchait la case
export const morceaux = (texte) =>
  texte.split(CASE).map((p) => p.trim().replace(/^[\s:,;.]+|[\s:,;.]+$/g, '')).filter((p) => /[\p{L}\p{N}]/u.test(p));

function depuisCorpus(ligne, phrase) {
  if (!phrase.cible.match(CASE)) {
    return [{ ref: ligne.ref, groupe: 'phrases', texte: phrase.cible, fr: phrase.fr, consigne: 'Dites la phrase en entier, d\'une voix posée.' }];
  }
  const parts = morceaux(phrase.cible);
  return parts.map((texte, i) => ({
    ref: `${ligne.ref}-${i + 1}`, groupe: 'morceaux', texte, fr: phrase.fr,
    consigne: `Morceau ${i + 1} sur ${parts.length} de la phrase. Dites seulement ce morceau : la somme ou le nom est enregistré à part.`,
  }));
}

export function listeVoix(code) {
  const infos = JSON.parse(readFileSync(dossier(code) + 'infos.json', 'utf8'));
  const corpus = new Map(lire(dossier(code) + 'corpus.csv').filter((r) => r.valide === '1').map((r) => [r.id, r]));
  const phrases = lire(dossier(code) + 'finale/voix.csv').flatMap((ligne) => {
    if (!ligne.reprise) return [{ ref: ligne.ref, groupe: ligne.groupe, texte: ligne.texte, fr: '', consigne: ligne.consigne }];
    const phrase = corpus.get(ligne.reprise);
    return phrase ? depuisCorpus(ligne, phrase) : [];
  });
  return { langue: code, nom: infos.nom, phrases };
}

export const listesVoix = () => langues().filter((code) => existsSync(dossier(code) + 'finale/voix.csv')).map(listeVoix);

if (import.meta.url === pathToFileURL(process.argv[1] || '').href) {
  const sortie = process.argv[2];
  if (!sortie) { console.error('Usage : node tools/voix.js SORTIE.json'); process.exit(1); }
  const listes = listesVoix();
  writeFileSync(sortie, JSON.stringify(listes, null, 1));
  for (const l of listes) console.log(`${l.nom} : ${l.phrases.length} enregistrements`);
}
