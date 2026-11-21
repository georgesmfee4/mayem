// Prépare le fichier à déposer sur la boutique des extensions (Microsoft Edge Add-ons, Chrome Web Store).
// Usage : npm run boutique   ->   boutique/mayem-<version>.zip
// Reconstruit dist/, vérifie ce qu'un relecteur de la boutique et l'équipe Mayem exigent, puis zippe dist/ :
// permissions minimales, aucun script automatique, MODE_TEST à false, icônes présentes, aucun nom de traducteur.
// Rien n'est envoyé : le dépôt se fait à la main sur le site de la boutique (docs/boutique.md).

import { spawnSync } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync, readdirSync, statSync, writeFileSync } from 'node:fs';
import { join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';
import { crc32, deflateRawSync } from 'node:zlib';
import { dossier, langues, racine } from './langues.js';
import { nomsInternes } from './public.js';

const lireJson = (chemin) => JSON.parse(readFileSync(chemin, 'utf8'));
const fichiers = (ici) => readdirSync(ici).flatMap((nom) => (statSync(join(ici, nom)).isDirectory() ? fichiers(join(ici, nom)) : [join(ici, nom)]));

// Ce qui ferait refuser l'extension, ou trahirait une règle de Mayem
export function controler(dist, entree, noms) {
  const erreurs = [];
  const manifeste = lireJson(join(dist, 'manifest.json'));
  const permissions = [...(manifeste.permissions || [])].sort().join(',');
  if (permissions !== 'activeTab,scripting') erreurs.push(`permissions : ${permissions || 'aucune'} (attendu : activeTab, scripting)`);
  for (const cle of ['content_scripts', 'web_accessible_resources', 'host_permissions', 'optional_host_permissions']) {
    if (manifeste[cle]) erreurs.push(`manifeste : « ${cle} » interdit (injection au clic seulement)`);
  }
  for (const icone of Object.values(manifeste.icons || {})) if (!existsSync(join(dist, icone))) erreurs.push(`icône absente : ${icone}`);
  if (!manifeste.icons?.['128']) erreurs.push('icône 128 × 128 absente du manifeste');
  if (!/const MODE_TEST = false;/.test(entree)) erreurs.push('MODE_TEST doit être à false dans dom/entree.ts');
  for (const fichier of fichiers(dist).filter((f) => !f.endsWith('.png'))) {
    const contenu = readFileSync(fichier, 'utf8');
    for (const nom of noms) if (contenu.includes(nom)) erreurs.push(`nom de traducteur dans ${relative(dist, fichier)}`);
  }
  return erreurs;
}

// Archive zip sans dépendance : chaque fichier compressé (deflate), puis le répertoire central
export function zipper(dist) {
  const locaux = [], central = [];
  let decalage = 0;
  for (const fichier of fichiers(dist).sort()) {
    const nom = Buffer.from(relative(dist, fichier).split('\\').join('/'));
    const donnees = readFileSync(fichier);
    const compresse = deflateRawSync(donnees, { level: 9 });
    const somme = crc32(donnees);
    const entete = Buffer.alloc(30);
    entete.writeUInt32LE(0x04034b50, 0); entete.writeUInt16LE(20, 4); entete.writeUInt16LE(0x0800, 6); entete.writeUInt16LE(8, 8);
    entete.writeUInt32LE(0, 10); entete.writeUInt32LE(somme, 14); entete.writeUInt32LE(compresse.length, 18);
    entete.writeUInt32LE(donnees.length, 22); entete.writeUInt16LE(nom.length, 26); entete.writeUInt16LE(0, 28);
    const repertoire = Buffer.alloc(46);
    repertoire.writeUInt32LE(0x02014b50, 0); repertoire.writeUInt16LE(20, 4); repertoire.writeUInt16LE(20, 6); repertoire.writeUInt16LE(0x0800, 8);
    repertoire.writeUInt16LE(8, 10); repertoire.writeUInt32LE(0, 12); repertoire.writeUInt32LE(somme, 16); repertoire.writeUInt32LE(compresse.length, 20);
    repertoire.writeUInt32LE(donnees.length, 24); repertoire.writeUInt16LE(nom.length, 28); repertoire.writeUInt32LE(decalage, 42);
    locaux.push(entete, nom, compresse);
    central.push(repertoire, nom);
    decalage += entete.length + nom.length + compresse.length;
  }
  const tailleCentral = central.reduce((n, b) => n + b.length, 0);
  const fin = Buffer.alloc(22);
  fin.writeUInt32LE(0x06054b50, 0); fin.writeUInt16LE(central.length / 2, 8); fin.writeUInt16LE(central.length / 2, 10);
  fin.writeUInt32LE(tailleCentral, 12); fin.writeUInt32LE(decalage, 16);
  return Buffer.concat([...locaux, ...central, fin]);
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  const construction = spawnSync(process.execPath, ['--experimental-strip-types', '--disable-warning=ExperimentalWarning', racine + 'tools/compile.js'], { stdio: 'inherit' });
  if (construction.status !== 0) process.exit(1);
  const dist = racine + 'dist';
  const noms = langues().flatMap((langue) => nomsInternes(lireJson(dossier(langue) + 'pack.json')))
    .flatMap((nom) => nom.split(/\s+(?:et|and)\s+|,|\//)).map((nom) => nom.replace(/relu par/i, '').trim()).filter((nom) => nom.length > 2);
  const erreurs = controler(dist, readFileSync(racine + 'dom/entree.ts', 'utf8'), noms);
  if (erreurs.length) {
    console.error(['Rien n\'est préparé :', ...erreurs].join('\n- '));
    process.exit(1);
  }
  const { version, version_name: detail } = lireJson(join(dist, 'manifest.json'));
  mkdirSync(racine + 'boutique', { recursive: true });
  const chemin = `boutique/mayem-${version}.zip`;
  const zip = zipper(dist);
  writeFileSync(racine + chemin, zip);
  console.log(`Prêt à déposer : ${chemin} (${Math.round(zip.length / 1024)} Ko, ${detail}).`);
  console.log('Contrôlé : permissions activeTab et scripting seules, aucun script automatique, MODE_TEST à false, icônes, aucun nom de traducteur.');
  console.log('Une nouvelle version déposée doit avoir un numéro plus grand dans manifest.json et package.json.');
}
