// Hébergement de l'API : le Worker ne sert les exports qu'avec une clé connue, par quelque chemin qu'on
// les demande ; les fichiers publics passent sans lui ; les versions figées se gardent en cache ; et le
// déploiement s'arrête si une version déjà en ligne diffère.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import worker, { empreinteCle } from '../hebergement/worker.js';
import { publier } from '../tools/api.js';
import { nouvelleCleAcces } from '../tools/cle-acces.js';
import { ecarts } from '../tools/deployer.js';
import { nouvelleCle } from './cles-essai.js';

const racine = fileURLToPath(new URL('..', import.meta.url));
const lire = (chemin) => JSON.parse(readFileSync(chemin, 'utf8'));

async function environnement() {
  const cle = nouvelleCleAcces();
  const servis = [];
  const kv = new Map([[await empreinteCle(cle), 'client-essai/2026-11-19']]);
  const env = {
    ASSETS: { fetch: async (requete) => { servis.push(new URL(requete.url).pathname); return new Response('contenu', { headers: { 'cache-control': 'public' } }); } },
    CLES_ACCES: { get: async (k) => kv.get(k) ?? null },
  };
  return { cle, env, servis };
}

const demander = (env, chemin, entetes = {}, method = 'GET') => worker.fetch(new Request('https://api.exemple.test' + chemin, { method, headers: entetes }), env);

test('export : refusé sans clé ou avec une clé inconnue, servi avec la bonne, jamais gardé en cache', async () => {
  const { cle, env, servis } = await environnement();
  assert.equal((await demander(env, '/v1/exports/bum/bum.tmx')).status, 401);
  assert.equal((await demander(env, '/v1/exports/bum/bum.tmx', { 'X-Mayem-Cle': nouvelleCleAcces() })).status, 401);
  assert.equal((await demander(env, '/v1/exports/bum/bum.tmx', { 'X-Mayem-Cle': 'court' })).status, 401);
  assert.equal(servis.length, 0);
  const bon = await demander(env, '/v1/exports/bum/bum.tmx', { 'X-Mayem-Cle': cle });
  assert.equal(bon.status, 200);
  assert.equal(await bon.text(), 'contenu');
  assert.equal(bon.headers.get('cache-control'), 'private, no-store');
  assert.equal((await demander(env, '/v1/exports/bum/bum.tmx', { 'X-Mayem-Cle': cle }, 'POST')).status, 405);
});

test('export demandé par un chemin détourné : toujours refusé sans clé', async () => {
  const { env, servis } = await environnement();
  // Chemins que le serveur de fichiers peut ramener aux exports. new URL normalise déjà « .. » ; les
  // formes encodées, la casse et les segments vides arrivent tels quels.
  for (const chemin of ['/v1/%65xports/bum/bum.tmx', '/V1/EXPORTS/bum/bum.tmx', '/v1//exports/bum/bum.tmx', '/v1/packs/%2e%2e/exports/bum/bum.tmx',
    '/v1/packs/..%2fexports/bum/bum.tmx', '/v1/packs/..%5cexports/bum/bum.tmx', '/v1/exports', '/v1/exports/']) {
    assert.equal((await demander(env, chemin)).status, 401, chemin);
  }
  assert.equal((await demander(env, '/v1/%E0%A4%A/x')).status, 400);
  assert.equal(servis.length, 0);
});

test('fichiers publics : servis tels quels, sans clé', async () => {
  const { env, servis } = await environnement();
  for (const chemin of ['/', '/v1/index.json', '/v1/packs/bum/0.6.0.json', '/v1/exportsx.json', '/v1/packs/exports/x']) {
    assert.equal((await demander(env, chemin)).status, 200, chemin);
  }
  assert.equal(servis.length, 5);
});

test('configuration : le Worker passe avant tout chemin qui n\'est pas explicitement public', () => {
  const config = lire(racine + 'hebergement/wrangler.json');
  const regles = config.assets.run_worker_first;
  assert.equal(regles[0], '/*');
  assert.ok(regles.slice(1).every((r) => r.startsWith('!/') && !/export/i.test(r)), 'aucun chemin d\'export n\'échappe au Worker');
  assert.equal(config.observability.enabled, false);
  assert.equal(config.assets.directory, '../api');
});

test('_headers : versions figées gardées un an, latest et index revalidés, ouverts aux autres sites', async () => {
  const sortie = mkdtempSync(join(tmpdir(), 'mayem-heberg-')) + '/';
  const { cle, publique } = await nouvelleCle();
  const script = { version: '0.0.0+essai', packs: [], contenu: Buffer.from('console.log(1);') };
  await publier({ sortie, cle, cles: [publique], script });
  const entetes = readFileSync(sortie + '_headers', 'utf8');
  const version = lire(racine + 'packs/bum/pack.json').version;
  assert.match(entetes, /^\/\*\n {2}Access-Control-Allow-Origin: \*\n/);
  assert.match(entetes, new RegExp(`/v1/packs/bum/${version.replace(/\./g, '\\.')}\\.json\\n {2}Cache-Control: public, max-age=31536000, immutable`));
  // Cloudflare redirige « + » vers « %2B » : la règle et le lien publié visent déjà l'adresse finale
  assert.match(entetes, /\/v1\/script\/0\.0\.0%2Bessai\/\*\n {2}Cache-Control: public, max-age=31536000, immutable/);
  assert.equal(lire(sortie + 'v1/script/index.json').versions[0].script, 'script/0.0.0%2Bessai/mayem.js');
  assert.doesNotMatch(entetes, /latest|index|cles-publiques/);
  rmSync(sortie, { recursive: true, force: true });
});

test('déploiement : une version en ligne différente ou absente de api/ est signalée', async () => {
  const sortie = mkdtempSync(join(tmpdir(), 'mayem-heberg-')) + '/';
  const { cle, publique } = await nouvelleCle();
  await publier({ sortie, cle, cles: [publique] });
  const v1 = sortie + 'v1/';
  const enLigne = new Map();
  const distant = async (chemin) => enLigne.get(chemin) ?? (existsSync(v1 + chemin) ? readFileSync(v1 + chemin) : null);
  assert.deepEqual(await ecarts(v1, distant), { differents: [], manquants: [] });
  const version = lire(racine + 'packs/bum/pack.json').version;
  enLigne.set(`packs/bum/${version}.json`, Buffer.from('{"autre":true}'));
  assert.deepEqual((await ecarts(v1, distant)).differents, [`packs/bum/${version}.json`]);
  enLigne.clear();
  const detail = lire(v1 + 'langues/bum.json');
  detail.versions.push({ version: '9.9.9', pack: 'packs/bum/9.9.9.json' });
  enLigne.set('langues/bum.json', Buffer.from(JSON.stringify(detail)));
  enLigne.set('packs/bum/9.9.9.json', Buffer.from('{}'));
  assert.deepEqual((await ecarts(v1, distant)).manquants, ['packs/bum/9.9.9.json']);
  // Premier déploiement : rien en ligne
  assert.deepEqual(await ecarts(v1, async () => null), { differents: [], manquants: [] });
  rmSync(sortie, { recursive: true, force: true });
});
