// Prépare de quoi montrer en direct qu'un pack modifié est refusé. Usage : npm run demo:refus
//   dist-refus/mot-change/      un mot changé dans une traduction, chiffres et champs intacts : seule l'empreinte le voit
//   dist-refus/chiffre-ajoute/  un chiffre ajouté : la règle des chiffres le refuse avant même l'empreinte
//   dist-web/mayem-modifie.js   le script intégré avec le même mot changé (fixtures/integre-refus.html)
// dist/ et dist-web/mayem.js ne sont jamais modifiés.

import { spawnSync } from 'node:child_process';
import { cpSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { racine } from './langues.js';

const construction = spawnSync(process.execPath, ['--experimental-strip-types', '--disable-warning=ExperimentalWarning', racine + 'tools/compile.js'], { stdio: 'inherit' });
if (construction.status !== 0) process.exit(1);

const [{ langue }] = JSON.parse(readFileSync(racine + 'dist/packs/index.json', 'utf8'));
const pack = JSON.parse(readFileSync(`${racine}dist/packs/${langue}/pack.json`, 'utf8'));
// Première traduction validée qui commence par un mot : on change ce mot, rien d'autre
const cible = pack.phrases.find((p) => p.valide && /^\p{L}+/u.test(p.bulu));
const motChange = cible.bulu.replace(/^\p{L}+/u, 'Autre');

function copie(nom, bulu) {
  const dossier = `${racine}dist-refus/${nom}/`;
  cpSync(racine + 'dist', dossier, { recursive: true });
  const modifie = structuredClone(pack);
  modifie.phrases.find((p) => p.id === cible.id).bulu = bulu;
  writeFileSync(`${dossier}packs/${langue}/pack.json`, JSON.stringify(modifie, null, 2) + '\n');
}

rmSync(racine + 'dist-refus', { recursive: true, force: true });
copie('mot-change', motChange);
copie('chiffre-ajoute', cible.bulu + ' 1');

// Dans le script intégré, les packs sont une chaîne JSON elle-même écrite en JSON : on remplace la traduction
// sous cette double forme
const deuxFois = (texte) => JSON.stringify(JSON.stringify(texte)).slice(1, -1);
const script = readFileSync(racine + 'dist-web/mayem.js', 'utf8');
if (!script.includes(deuxFois(cible.bulu))) throw new Error(`Traduction de ${cible.id} introuvable dans dist-web/mayem.js`);
writeFileSync(racine + 'dist-web/mayem-modifie.js', script.replace(deuxFois(cible.bulu), deuxFois(motChange)));

console.log(`Phrase ${cible.id} : « ${cible.bulu} » -> « ${motChange} » (ou + « 1 »)
  dist-refus/mot-change/       charger dans un second profil : clic -> badge « ! », page intacte (empreinte)
  dist-refus/chiffre-ajoute/   même chose, refusé par la règle des chiffres
  fixtures/integre-refus.html  sans extension (dist-web/mayem-modifie.js) : console, Mayem.etat()`);
