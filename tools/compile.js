// Prépare l'extension dans dist/. Usage : node tools/compile.js
// Pas de compilateur à installer : Node retire lui-même les types (stripTypeScriptTypes).
// Ça ne marche qu'avec des types « effaçables » : pas d'enum ni de namespace.
// Un script injecté dans une page ne peut pas importer d'autres fichiers sans les exposer aux sites :
// dom/entree.ts et tout ce qu'il importe sont donc regroupés dans un seul dom/contenu.js.
// Le script de fond suit la même règle : dom/fond.ts et core/verifier.ts donnent dom/fond.js.

import { cpSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { dirname, join, relative } from 'node:path';
import { stripTypeScriptTypes } from 'node:module';
import { fileURLToPath } from 'node:url';
import { verifierPack } from './check-pack.js';

const racine = fileURLToPath(new URL('..', import.meta.url));
const dist = racine + 'dist/';

// Les types sont remplacés par des espaces : on retire ceux qui restent en fin de ligne
const sansTypes = (chemin) =>
  stripTypeScriptTypes(readFileSync(racine + chemin, 'utf8'), { mode: 'strip' }).replace(/[ \t]+$/gm, '');

const IMPORT = /^import\s[\s\S]*?from\s*['"](\.{1,2}\/[^'"]+)['"];?/gm;

// Chaque fichier après ceux qu'il importe, une seule fois chacun
function ordre(chemin, vus = new Set()) {
  if (vus.has(chemin)) return [];
  vus.add(chemin);
  const source = readFileSync(racine + chemin, 'utf8');
  const dependances = [...source.matchAll(IMPORT)].map((m) => relative(racine, join(racine, dirname(chemin), m[1])).replaceAll('\\', '/'));
  return [...dependances.flatMap((d) => ordre(d, vus)), chemin];
}

// Les noms de premier niveau ne se répètent pas d'un fichier à l'autre (vérifié par node --check)
// debut : déclarations ajoutées avant les fichiers (style.css pour les Shadow DOM)
function regrouper(entree, debut = '') {
  const corps = debut + ordre(entree)
    .map((chemin) => `// ${chemin}\n` + sansTypes(chemin).replace(IMPORT, '').replace(/^export\s+/gm, '').trim())
    .join('\n\n');
  return `(() => {\n'use strict';\n${corps}\n})();\n`;
}

const pack = JSON.parse(readFileSync(racine + 'packs/bum/pack.json', 'utf8'));
const erreurs = verifierPack(pack);
if (erreurs.length) {
  console.error(erreurs.join('\n'));
  process.exit(1);
}

rmSync(dist, { recursive: true, force: true });
mkdirSync(dist + 'dom', { recursive: true });
writeFileSync(dist + 'dom/fond.js', regrouper('dom/fond.ts'));
const style = readFileSync(racine + 'dom/style.css', 'utf8');
writeFileSync(dist + 'dom/contenu.js', regrouper('dom/entree.ts', `const STYLE_PAGE = ${JSON.stringify(style)};\n\n`));
writeFileSync(dist + 'dom/style.css', style);
cpSync(racine + 'manifest.json', dist + 'manifest.json');
cpSync(racine + 'packs/bum/pack.json', dist + 'packs/bum/pack.json');
cpSync(racine + 'packs/schema.json', dist + 'packs/schema.json');
console.log('Extension prête dans dist/');
