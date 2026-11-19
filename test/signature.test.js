// Signature de l'équipe Mayem : un pack modifié, même avec une empreinte recalculée, est refusé ;
// seule une clé de confiance non révoquée fait foi.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { empreinte } from '../core/empreinte.ts';
import { depuisBase64, verifierOctets, verifierSignature, versBase64 } from '../core/signature.ts';
import { verifierPack } from '../tools/check-pack.js';
import { signerOctets, signerPack } from '../tools/signature.js';
import { nouvelleCle } from './cles-essai.js';

const pack = JSON.parse(readFileSync(new URL('../packs/bum/pack.json', import.meta.url), 'utf8'));

test('un pack signé est accepté, et la signature ne change pas son empreinte', async () => {
  const { cle, publique } = await nouvelleCle();
  const signe = await signerPack(pack, cle);
  assert.equal(await empreinte(signe), pack.empreinte);
  assert.deepEqual(await verifierSignature(signe, [publique]), []);
  assert.deepEqual(verifierPack(signe), []);
});

test('une modification est refusée, même avec une empreinte recalculée', async () => {
  const { cle, publique } = await nouvelleCle();
  const signe = await signerPack(pack, cle);
  const modifie = structuredClone(signe);
  modifie.phrases[0].cible = 'autre';
  assert.match((await verifierSignature(modifie, [publique]))[0], /empreinte différente/);
  modifie.empreinte = await empreinte(modifie);
  assert.match((await verifierSignature(modifie, [publique]))[0], /signature fausse/);
});

test('clé inconnue, clé révoquée, pack non signé : refusés ; clé retirée : toujours valable', async () => {
  const { cle, publique } = await nouvelleCle();
  const autre = await nouvelleCle();
  const signe = await signerPack(pack, cle);
  assert.match((await verifierSignature(signe, [autre.publique]))[0], /clé inconnue/);
  assert.match((await verifierSignature(signe, [{ ...publique, statut: 'revoquee' }]))[0], /clé révoquée/);
  assert.deepEqual(await verifierSignature(signe, [{ ...publique, statut: 'retiree' }]), []);
  assert.match((await verifierSignature(pack, [publique]))[0], /non signé/);
  // Une clé publiée sous l'identifiant d'une autre est refusée
  assert.match((await verifierSignature(signe, [{ ...autre.publique, id: publique.id }]))[0], /identifiant faux/);
});

test('octets signés (script) : la moindre différence est refusée', async () => {
  const { cle, publique } = await nouvelleCle();
  const octets = new TextEncoder().encode('console.log("Mayem")');
  const signature = await signerOctets(octets, cle);
  assert.equal(await verifierOctets(octets, signature, [publique]), null);
  assert.equal(await verifierOctets(new TextEncoder().encode('console.log("Mayen")'), signature, [publique]), 'signature fausse');
  const brut = new Uint8Array([0, 251, 255, 62, 63, 1]);
  assert.deepEqual(depuisBase64(versBase64(brut)), brut);
});

test('la clé privée doit être une clé active de packs/cles.json', async () => {
  const dossier = mkdtempSync(join(tmpdir(), 'mayem-cle-'));
  const { paire, publique } = await nouvelleCle();
  writeFileSync(join(dossier, 'cle.jwk'), JSON.stringify(await crypto.subtle.exportKey('jwk', paire.privateKey)));
  writeFileSync(join(dossier, 'cles.json'), JSON.stringify({ cles: [] }));
  const racine = fileURLToPath(new URL('..', import.meta.url));
  const charger = () => spawnSync(process.execPath, ['--experimental-strip-types', '--disable-warning=ExperimentalWarning', '--input-type=module', '-e',
    "import { chargerCle } from './tools/signature.js'; const c = await chargerCle(); console.log(c.id);"],
  { cwd: racine, encoding: 'utf8', env: { ...process.env, MAYEM_CLE_PRIVEE: join(dossier, 'cle.jwk'), MAYEM_CLES: join(dossier, 'cles.json') } });
  assert.match(charger().stderr, /n'est pas une clé active/);
  writeFileSync(join(dossier, 'cles.json'), JSON.stringify({ cles: [publique] }));
  assert.equal(charger().stdout.trim(), publique.id);
  rmSync(dossier, { recursive: true, force: true });
});
