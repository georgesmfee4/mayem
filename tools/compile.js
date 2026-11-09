// Prépare l'extension dans dist/ : le TypeScript de core/ et dom/ devient du JavaScript,
// puis manifeste, style et pack sont copiés. Usage : node tools/compile.js
// Pas de compilateur à installer : Node retire lui-même les types (stripTypeScriptTypes).
// Ça ne marche qu'avec des types « effaçables » : pas d'enum ni de namespace.

import { cpSync, mkdirSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { stripTypeScriptTypes } from 'node:module';
import { fileURLToPath } from 'node:url';
import { verifierPack } from './check-pack.js';

const racine = fileURLToPath(new URL('..', import.meta.url));
const dist = racine + 'dist/';

// Les imports écrits « ./faits.ts » doivent pointer vers « ./faits.js » une fois compilés
const versJs = (code) => code.replace(/((?:from|import)\s*\(?\s*['"]\.{1,2}\/[^'"]+)\.ts(['"])/g, '$1.js$2');

function compilerDossier(dossier) {
  mkdirSync(dist + dossier, { recursive: true });
  for (const fichier of readdirSync(racine + dossier).filter((f) => f.endsWith('.ts'))) {
    const source = readFileSync(`${racine}${dossier}/${fichier}`, 'utf8');
    // Les types sont remplacés par des espaces : on retire ceux qui restent en fin de ligne
    const js = versJs(stripTypeScriptTypes(source, { mode: 'strip' })).replace(/[ \t]+$/gm, '');
    writeFileSync(`${dist}${dossier}/${fichier.replace(/\.ts$/, '.js')}`, js);
  }
}

const pack = JSON.parse(readFileSync(racine + 'packs/bum/pack.json', 'utf8'));
const erreurs = verifierPack(pack);
if (erreurs.length) {
  console.error(erreurs.join('\n'));
  process.exit(1);
}

rmSync(dist, { recursive: true, force: true });
compilerDossier('core');
compilerDossier('dom');
cpSync(racine + 'dom/style.css', dist + 'dom/style.css');
cpSync(racine + 'manifest.json', dist + 'manifest.json');
cpSync(racine + 'packs/bum/pack.json', dist + 'packs/bum/pack.json');
console.log('Extension prête dans dist/');
