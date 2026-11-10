// Refuse un pack de langue invalide.
// Usage : npm run check [-- packs/bum/pack.json]
// Les règles vivent dans core/verifier.ts : l'extension applique les mêmes avant d'entrer dans une page.

import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { verifierPack as verifier } from '../core/verifier.ts';

const racine = fileURLToPath(new URL('..', import.meta.url));
const schema = JSON.parse(readFileSync(racine + 'packs/schema.json', 'utf8'));

export const verifierPack = (pack) => verifier(pack, schema);

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  const fichier = process.argv[2] || racine + 'packs/bum/pack.json';
  const erreurs = verifierPack(JSON.parse(readFileSync(fichier, 'utf8')));
  if (erreurs.length) {
    console.error(erreurs.join('\n'));
    process.exit(1);
  }
  console.log(`${fichier} : pack valide`);
}
