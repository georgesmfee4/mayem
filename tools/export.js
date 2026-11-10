// Exporte un pack aux formats standards, pour que d'autres outils réutilisent nos données sans
// connaître Mayem. Seules les phrases validées par deux personnes sortent.
// Usage : npm run export [-- <langue>]  ->  exports/<langue>/

import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { cheminPack, racine } from './langues.js';
import { versTmx } from './exports/tmx.js';
import { versXliff } from './exports/xliff.js';
import { versTbx } from './exports/tbx.js';
import { versI18next } from './exports/i18next.js';
import { versStringsXml } from './exports/android.js';

// Chemin relatif -> contenu, pour un pack
export function exports(pack) {
  const l = pack.langue;
  const fichiers = {
    [`${l}.tmx`]: versTmx(pack),
    [`${l}.xlf`]: versXliff(pack),
    'glossaire.tbx': versTbx(pack),
  };
  for (const [langue, texte] of Object.entries(versI18next(pack))) fichiers[`i18next/${langue}.json`] = texte;
  for (const [valeurs, texte] of Object.entries(versStringsXml(pack))) fichiers[`android/${valeurs}/strings.xml`] = texte;
  return fichiers;
}

export function ecrireExports(pack, sortie) {
  const fichiers = exports(pack);
  for (const [chemin, texte] of Object.entries(fichiers)) {
    mkdirSync(dirname(sortie + chemin), { recursive: true });
    writeFileSync(sortie + chemin, texte);
  }
  return Object.keys(fichiers);
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  const pack = JSON.parse(readFileSync(cheminPack(process.argv[2]), 'utf8'));
  const sortie = `${racine}exports/${pack.langue}/`;
  const ecrits = ecrireExports(pack, sortie);
  console.log(`${pack.nom} ${pack.version} : ${ecrits.length} fichiers -> exports/${pack.langue}/\n  ${ecrits.join('\n  ')}`);
}
