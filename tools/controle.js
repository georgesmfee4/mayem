// Liste les traductions validées à faire relire : glossaire, cohérence, négations.
// Usage : npm run controle [-- <langue> | chemin/pack.json]
// Ne bloque rien : les règles sont dans core/controle.ts, le refus des chiffres dans core/verifier.ts.

import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { controler } from '../core/controle.ts';
import { cheminPack } from './langues.js';
import { lireDecisions, pointsOuverts } from './decisions.js';
import { dirname, join } from 'node:path';

const TITRES = {
  glossaire: 'Terme du glossaire absent',
  coherence: 'Cohérence',
  negation: 'Négation peut-être absente',
};

export function rapport(points) {
  const lignes = [];
  for (const [type, titre] of Object.entries(TITRES)) {
    const duType = points.filter((point) => point.type === type);
    if (!duType.length) continue;
    lignes.push(`\n${titre} (${duType.length})`);
    for (const point of duType) lignes.push(`  ${point.ids.join(', ')} : ${point.message}`);
  }
  return lignes.join('\n');
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  const fichier = cheminPack(process.argv[2]);
  const pack = JSON.parse(readFileSync(fichier, 'utf8'));
  // Les points que les locuteurs ont décidé de garder ne sont plus redemandés (decisions.csv)
  const points = pointsOuverts(controler(pack), lireDecisions(join(dirname(fichier), 'decisions.csv')), pack);
  console.log(points.length ? `${points.length} points à faire relire par les locuteurs :${rapport(points)}` : 'Aucun point à relire.');
}
