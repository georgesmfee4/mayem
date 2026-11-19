// API v1 : fichiers signés, versions figées, aucun nom de traducteur, et l'outil de l'intégrateur qui
// n'écrit rien de ce qu'il ne peut pas vérifier.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { existsSync, mkdtempSync, readFileSync, readdirSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { verifierOctets, verifierSignature } from '../core/signature.ts';
import { publier } from '../tools/api.js';
import { nouvelleCle } from './cles-essai.js';

const racine = fileURLToPath(new URL('..', import.meta.url));
const lire = (chemin) => JSON.parse(readFileSync(chemin, 'utf8'));
const interne = lire(join(racine, 'packs/bum/pack.json'));
const script = (contenu = 'console.log("Mayem");') => ({ version: `0.0.0+bum.${interne.version}`, packs: [{ langue: 'bum', version: interne.version }], contenu: Buffer.from(contenu) });
// Le moteur pour l'outil de l'intégrateur : les sources TypeScript, lancées avec le retrait des types
const coeur = `export { verifierOctets, verifierSignature } from '${pathToFileURL(join(racine, 'core/signature.ts')).href}';\n`;

function fichiers(dossier) {
  return readdirSync(dossier).flatMap((nom) => (statSync(join(dossier, nom)).isDirectory() ? fichiers(join(dossier, nom)) : [join(dossier, nom)]));
}

async function publication() {
  const sortie = mkdtempSync(join(tmpdir(), 'mayem-api-')) + '/';
  const { cle, publique } = await nouvelleCle();
  await publier({ sortie, cle, cles: [publique], script: script(), coeur });
  return { sortie, v1: sortie + 'v1/', cle, publique };
}

test('chaque version du pack est publiée, signée et vérifiable ; latest est la version courante', async () => {
  const { sortie, v1, publique } = await publication();
  const detail = lire(v1 + 'langues/bum.json');
  assert.ok(detail.versions.length >= 2);
  for (const { pack } of detail.versions) assert.deepEqual(await verifierSignature(lire(v1 + pack), [publique]), [], pack);
  assert.equal(lire(v1 + 'packs/bum/latest.json').version, interne.version);
  assert.equal(lire(v1 + 'langues.json')[0].derniere.version, interne.version);
  assert.deepEqual(lire(v1 + 'cles-publiques.json').cles, [publique]);
  assert.equal(lire(v1 + 'openapi.json').openapi, '3.1.0');
  const fiche = lire(`${v1}script/${script().version}/signature.json`);
  assert.equal(await verifierOctets(readFileSync(`${v1}script/${script().version}/mayem.js`), fiche.signature, [publique]), null);
  assert.match(fiche.integrite, /^sha384-/);
  rmSync(sortie, { recursive: true, force: true });
});

test('aucun nom de traducteur ni de relecteur dans ce que publie l\'API', async () => {
  const { sortie } = await publication();
  const noms = new Set([...interne.phrases, ...interne.glossaire].flatMap((e) => [e.traduit_par, e.relu_par, e.retraduit_par])
    .flatMap((nom) => (nom || '').split(/\s+(?:et|and)\s+|,/)).map((nom) => nom.trim()).filter((nom) => nom.length > 2));
  assert.ok(noms.size > 0);
  for (const fichier of fichiers(sortie)) {
    const contenu = readFileSync(fichier, 'utf8');
    for (const nom of noms) assert.ok(!contenu.includes(nom), `${nom} dans ${fichier}`);
  }
  rmSync(sortie, { recursive: true, force: true });
});

test('une version publiée ne change jamais : mêmes octets, même signature, et refus d\'un contenu différent', async () => {
  const { sortie, v1, cle, publique } = await publication();
  const chemin = `${v1}packs/bum/${interne.version}.json`;
  const avant = readFileSync(chemin, 'utf8');
  await publier({ sortie, cle, cles: [publique], script: script(), coeur });
  assert.equal(readFileSync(chemin, 'utf8'), avant);
  const modifie = lire(chemin);
  modifie.phrases[0].fr = 'Autre texte';
  writeFileSync(chemin, JSON.stringify(modifie));
  await assert.rejects(publier({ sortie, cle, cles: [publique], script: script(), coeur }), /ne change jamais/);
  writeFileSync(chemin, avant);
  await assert.rejects(publier({ sortie, cle, cles: [publique], script: script('autre'), coeur }), /ne change jamais/);
  rmSync(sortie, { recursive: true, force: true });
});

test('clé révoquée : le même contenu est signé de nouveau par la clé active', async () => {
  const { sortie, v1, cle, publique } = await publication();
  const nouvelle = await nouvelleCle();
  const cles = [{ ...publique, statut: 'revoquee' }, nouvelle.publique];
  await publier({ sortie, cle: nouvelle.cle, cles, script: script(), coeur });
  const pack = lire(`${v1}packs/bum/${interne.version}.json`);
  assert.equal(pack.signature.cle, nouvelle.publique.id);
  assert.deepEqual(await verifierSignature(pack, cles), []);
  assert.ok(cle.id !== nouvelle.cle.id);
  rmSync(sortie, { recursive: true, force: true });
});

test('outil de l\'intégrateur : écrit ce qui est vérifié, refuse le reste sans rien écrire', async () => {
  const { sortie, v1 } = await publication();
  const outil = (...args) => spawnSync(process.execPath, ['--experimental-strip-types', '--disable-warning=ExperimentalWarning', v1 + 'outils/mayem-verifier.mjs', ...args], { encoding: 'utf8' });
  const pack = `${v1}packs/bum/${interne.version}.json`;
  const bon = outil(pack, '--sortie', sortie + 'pack.json');
  assert.equal(bon.status, 0, bon.stderr);
  assert.match(bon.stdout, /Vérifié : pack Bulu/);
  assert.ok(existsSync(sortie + 'pack.json'));
  const js = `${v1}script/${script().version}/mayem.js`;
  assert.equal(outil(js).status, 0);

  const modifie = lire(pack);
  modifie.phrases[0].cible = 'autre';
  writeFileSync(sortie + 'modifie.json', JSON.stringify(modifie));
  const refus = outil(sortie + 'modifie.json', '--sortie', sortie + 'jamais.json');
  assert.equal(refus.status, 1);
  assert.match(refus.stderr, /Refusé : empreinte différente/);
  assert.ok(!existsSync(sortie + 'jamais.json'));
  writeFileSync(js, 'console.log("autre");');
  assert.match(outil(js).stderr, /Refusé : signature fausse/);
  assert.match(outil('http://exemple.test/pack.json').stderr, /https/);
  rmSync(sortie, { recursive: true, force: true });
});
