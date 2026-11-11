// Affiche les constats de révision groupés par sorte, avec un total par niveau, et écrit la liste complète
// dans packs/<langue>/revision.json (lue par python tools/kit.py revision pour le tableur des locuteurs).
// Usage : npm run revision [-- <langue>]

import { readFileSync, writeFileSync } from 'node:fs';
import { choisirLangue, dossier } from './langues.js';
import { resume, revisionOuverte } from './revision-donnees.js';

const TITRES = {
  'sens-confondus': 'Sens confondus (même bulu pour des phrases différentes)',
  'traductions-multiples': 'Même français traduit de plusieurs façons',
  'glossaire-double': 'Glossaire : même terme pour deux idées',
  'glossaire-inclus': 'Glossaire : terme contenu dans celui d\'une autre idée',
  'negation': 'Négation peut-être absente',
  'terme-critique': 'Terme critique du glossaire absent',
  'glossaire-vide': 'Glossaire : terme sans traduction',
  'minuscule': 'Minuscule au début',
  'majuscule-glossaire': 'Majuscules des mots du glossaire (question de charte)',
  'majuscule': 'Majuscule au milieu d\'une phrase',
  'apostrophe': 'Apostrophe minoritaire',
  'espaces': 'Espaces en trop',
  'ponctuation': 'Ponctuation finale différente',
  'alphabet': 'Lettre hors de l\'alphabet choisi',
  'politesse': 'Forme de politesse à confirmer',
  'bouton-long': 'Bouton trop long',
};

const langue = choisirLangue(process.argv[2]);
const ici = dossier(langue);
const constats = revisionOuverte(JSON.parse(readFileSync(ici + 'pack.json', 'utf8')), ici);
writeFileSync(ici + 'revision.json', JSON.stringify(constats, null, 2) + '\n');
for (const [code, titre] of Object.entries(TITRES)) {
  const duCode = constats.filter((c) => c.code === code);
  if (!duCode.length) continue;
  console.log(`\n${titre} (${duCode.length})`);
  for (const c of duCode) console.log(`  [${c.niveau}] ${c.ref} : ${c.explication}`);
}
console.log(`\n${resume(constats)} -> packs/${langue}/revision.json ; tableur : python tools/kit.py revision`);
