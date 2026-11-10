// Prépare l'extension dans dist/. Usage : npm run build [-- <langue> <langue>…]
// Toutes les langues de packs/ par défaut ; la première est celle proposée au clic.
// --pseudo : dist-pseudo/, avec la seule pseudo-langue tirée de la première langue (tools/pseudo.js)
// et un contour autour des textes qui débordent.
// Pas de compilateur à installer : Node retire lui-même les types (stripTypeScriptTypes).
// Ça ne marche qu'avec des types « effaçables » : pas d'enum ni de namespace.
// Un script injecté dans une page ne peut pas importer d'autres fichiers sans les exposer aux sites :
// dom/entree.ts et tout ce qu'il importe sont donc regroupés dans un seul dom/contenu.js.
// Le script de fond suit la même règle : dom/fond.ts et core/verifier.ts donnent dom/fond.js.
// dist-web/mayem.js : Mayem à intégrer dans un site en une ligne (dom/web.ts), packs compris.

import { createHash } from 'node:crypto';
import { cpSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { dirname, join, relative } from 'node:path';
import { stripTypeScriptTypes } from 'node:module';
import { verifierPack } from './check-pack.js';
import { choisirLangue, dossier, langues, racine } from './langues.js';
import { packPseudo } from './pseudo.js';
import { versPublic } from './public.js';

const enPseudo = process.argv.includes('--pseudo');
const demandees = process.argv.slice(2).filter((argument) => argument !== '--pseudo');
const dist = racine + (enPseudo ? 'dist-pseudo/' : 'dist/');
// Version pseudo : chaque texte traduit qui déborde de sa boîte est entouré
const CONTOUR = '\n[data-mayem-deborde] { outline: 2px dashed #dc2626; outline-offset: 1px; }\n';

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

// En tête de chaque fichier construit : le code et les données appartiennent à l'équipe Mayem
const DROITS = '// Mayem — © Équipe Mayem. Tous droits réservés. Aucune copie ni modification sans accord écrit (LICENSE).\n';

// Les noms de premier niveau ne se répètent pas d'un fichier à l'autre (vérifié par node --check)
// debut : déclarations ajoutées avant les fichiers (style.css pour les Shadow DOM)
function regrouper(entree, debut = '') {
  const corps = debut + ordre(entree)
    .map((chemin) => `// ${chemin}\n` + sansTypes(chemin).replace(IMPORT, '').replace(/^export\s+/gm, '').trim())
    .join('\n\n');
  return `${DROITS}(() => {\n'use strict';\n${corps}\n})();\n`;
}

// Le moteur seul, en module ES utilisable par n'importe quel projet : core/index.ts dit ce qui est public
function bibliotheque() {
  const publics = sansTypes('core/index.ts').match(/^export\s*\{([^}]*)\}/m)[1];
  const corps = ordre('core/index.ts')
    .filter((chemin) => chemin !== 'core/index.ts')
    .map((chemin) => `// ${chemin}\n` + sansTypes(chemin).replace(IMPORT, '').replace(/^export\s+/gm, '').trim())
    .join('\n\n');
  const { version } = JSON.parse(readFileSync(racine + 'package.json', 'utf8'));
  return `${DROITS}// Mayem ${version}, moteur de traduction. Documentation : docs/API.md\n${corps}\n\nexport {${publics}};\n`;
}

const choisies = demandees.length ? demandees.map(choisirLangue) : langues();
// Ce qui est distribué (extension, script intégré) ne contient aucun nom de traducteur : version publique
const vrais = await Promise.all(choisies.map((langue) => versPublic(JSON.parse(readFileSync(dossier(langue) + 'pack.json', 'utf8')))));
const packs = enPseudo ? [await packPseudo(vrais[0])] : vrais;
const erreurs = packs.flatMap((pack) => verifierPack(pack).map((erreur) => `${pack.langue} : ${erreur}`));
if (erreurs.length || !packs.length) {
  console.error(erreurs.join('\n') || 'Aucun pack dans packs/');
  process.exit(1);
}

rmSync(dist, { recursive: true, force: true });
mkdirSync(dist + 'dom', { recursive: true });
writeFileSync(dist + 'dom/fond.js', regrouper('dom/fond.ts'));
const style = readFileSync(racine + 'dom/style.css', 'utf8') + (enPseudo ? CONTOUR : '');
writeFileSync(dist + 'dom/contenu.js', regrouper('dom/entree.ts', `const STYLE_PAGE = ${JSON.stringify(style)};\n\n`));
writeFileSync(dist + 'dom/style.css', style);
cpSync(racine + 'manifest.json', dist + 'manifest.json');
// Le script de fond ne lit que le pack de la langue choisie : un clic coûte autant avec une langue qu'avec cinquante
for (const pack of packs) {
  mkdirSync(dist + `packs/${pack.langue}`, { recursive: true });
  writeFileSync(dist + `packs/${pack.langue}/pack.json`, JSON.stringify(pack, null, 2) + '\n');
}
const sommaire = packs.map(({ langue, nom, version }) => ({ langue, nom, version }));
writeFileSync(dist + 'packs/index.json', JSON.stringify(sommaire, null, 2) + '\n');
cpSync(racine + 'packs/schema.json', dist + 'packs/schema.json');
if (enPseudo) {
  console.log(`Extension pseudo prête dans dist-pseudo/ (qps, tirée de ${choisies[0]}) : textes allongés de 40 %, débordements entourés`);
} else {
  mkdirSync(racine + 'dist-lib', { recursive: true });
  writeFileSync(racine + 'dist-lib/mayem-core.js', bibliotheque());
  const integrite = scriptIntegre();
  console.log(`Extension prête dans dist/ (${choisies.join(', ')}), moteur seul dans dist-lib/mayem-core.js`);
  console.log(`Script à intégrer : dist-web/mayem.js, integrity="${integrite}"`);
}

// Packs et schéma relus par JSON.parse : plus rapide à charger qu'un gros objet écrit en JavaScript
function scriptIntegre() {
  const debut = [
    `const STYLE_PAGE = ${JSON.stringify(style)};`,
    `const PACKS_EMBARQUES = JSON.parse(${JSON.stringify(JSON.stringify(packs))});`,
    `const SCHEMA_EMBARQUE = ${readFileSync(racine + 'packs/schema.json', 'utf8').trim()};`,
  ].join('\n') + '\n\n';
  const code = regrouper('dom/web.ts', debut);
  rmSync(racine + 'dist-web', { recursive: true, force: true });
  mkdirSync(racine + 'dist-web');
  writeFileSync(racine + 'dist-web/mayem.js', code);
  return 'sha384-' + createHash('sha384').update(code).digest('base64');
}
