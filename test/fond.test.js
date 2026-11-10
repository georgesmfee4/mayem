// Le script de fond construit (dist/dom/fond.js) refuse un pack incohérent avant d'entrer dans la page.
// Chrome est simulé : on compte ce qui serait injecté dans l'onglet.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { runInNewContext } from 'node:vm';

const racine = new URL('..', import.meta.url);
const lire = (chemin) => JSON.parse(readFileSync(new URL(chemin, racine), 'utf8'));

const construction = spawnSync(process.execPath, ['--experimental-strip-types', '--disable-warning=ExperimentalWarning', 'tools/compile.js'], { cwd: racine });
const fond = readFileSync(new URL('dist/dom/fond.js', racine), 'utf8');

// Charge le script de fond avec le pack donné. Rend clic() et demander(langue), comme le panneau de Mayem.
function charger(pack) {
  const fichiers = {
    'packs/index.json': [{ langue: 'bum', nom: 'Bulu', version: pack.version }],
    'packs/bum/pack.json': pack,
    'packs/schema.json': lire('packs/schema.json'),
  };
  let clic;
  let message;
  const etat = { injections: 0, erreurs: [] };
  const chrome = {
    runtime: { id: 'mayem', getURL: (chemin) => chemin, onMessage: { addListener: (rappel) => (message = rappel) } },
    action: { onClicked: { addListener: (rappel) => (clic = rappel) } },
    scripting: { insertCSS: async () => etat.injections++, executeScript: async () => etat.injections++ },
  };
  const fetch = async (chemin) => ({ json: async () => structuredClone(fichiers[chemin]) });
  const console = { error: (texte) => etat.erreurs.push(texte), warn: (...t) => etat.erreurs.push(t.join(' ')) };
  runInNewContext(fond, { chrome, fetch, console, structuredClone, crypto, TextEncoder, Uint8Array });
  return {
    clic: async () => { await clic({ id: 1 }); return etat; },
    demander: (langue, id = 'mayem') => new Promise((repondre) => message({ mayemLangue: langue }, { id }, repondre)),
  };
}
const cliquer = (pack) => charger(pack).clic();

test('le script de fond se construit', () => assert.equal(construction.status, 0, String(construction.stderr)));

test('le pack actuel est injecté', async () => {
  const { injections, erreurs } = await cliquer(lire('packs/bum/pack.json'));
  assert.deepEqual(erreurs, []);
  assert.equal(injections, 3);
});

test('un chiffre ajouté au bulu : rien n\'est injecté', async () => {
  const pack = lire('packs/bum/pack.json');
  pack.phrases.find((p) => p.id === 'X08').bulu += ' 500';
  const { injections, erreurs } = await cliquer(pack);
  assert.equal(injections, 0);
  assert.match(erreurs.join('\n'), /X08 : les chiffres du bulu diffèrent/);
});

test('un champ manquant : rien n\'est injecté', async () => {
  const pack = lire('packs/bum/pack.json');
  delete pack.phrases[0].relu_par;
  const { injections, erreurs } = await cliquer(pack);
  assert.equal(injections, 0);
  assert.match(erreurs.join('\n'), /champ « relu_par » manquant/);
});

test('bulu modifié sans toucher aux chiffres : refusé par l’empreinte', async () => {
  const pack = lire('packs/bum/pack.json');
  const phrase = pack.phrases.find((p) => p.id === 'X08');
  phrase.bulu = phrase.bulu.replace(/\p{L}+/u, 'Autre');
  const { injections, erreurs } = await cliquer(pack);
  assert.equal(injections, 0);
  assert.match(erreurs.join(' '), /empreinte différente/);
});

test('changement de langue : le pack vérifié est rendu, un pack modifié ne l’est pas', async () => {
  const pack = lire('packs/bum/pack.json');
  assert.equal((await charger(pack).demander('bum')).empreinte, pack.empreinte);
  pack.phrases[0].bulu = 'autre';
  assert.equal(await charger(pack).demander('bum'), null);
});

test('le moteur seul (dist-lib/mayem-core.js) s’importe et traduit sans l’extension', async () => {
  const moteur = await import(new URL('dist-lib/mayem-core.js', racine));
  const pack = lire('packs/bum/pack.json');
  assert.equal(moteur.traduire('Votre solde est de 25 000 FCFA', pack).id, 'X08');
  assert.equal(await moteur.empreinte(pack), pack.empreinte);
  assert.deepEqual(moteur.verifierPack(pack, lire('packs/schema.json')), []);
});
