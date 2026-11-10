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

// Clique sur l'icône avec le pack donné ; rend le nombre d'injections et les messages d'erreur
async function cliquer(pack) {
  const fichiers = { 'packs/bum/pack.json': pack, 'packs/schema.json': lire('packs/schema.json') };
  let clic;
  let injections = 0;
  const erreurs = [];
  const chrome = {
    runtime: { getURL: (chemin) => chemin },
    action: { onClicked: { addListener: (rappel) => (clic = rappel) } },
    scripting: { insertCSS: async () => injections++, executeScript: async () => injections++ },
  };
  const fetch = async (chemin) => ({ json: async () => structuredClone(fichiers[chemin]) });
  const console = { error: (texte) => erreurs.push(texte), warn: (...t) => erreurs.push(t.join(' ')) };
  runInNewContext(fond, { chrome, fetch, console, structuredClone });
  await clic({ id: 1 });
  return { injections, erreurs };
}

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
