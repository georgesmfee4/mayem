// Ajouter une langue ne demande que des données : une langue d'essai (code qaa, réservé par l'ISO 639
// à l'usage local) passe la fabrication du pack, son contrôle, la révision, les exports et le moteur,
// sans une ligne de code propre à elle. Les textes « [qaa] … » sont des marqueurs, pas des traductions.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { traduire } from '../core/moteur.ts';
import { exports } from '../tools/export.js';
import { reviser } from '../tools/revision.js';

const racine = fileURLToPath(new URL('..', import.meta.url));
const packs = mkdtempSync(join(tmpdir(), 'mayem-langue-'));
const ici = join(packs, 'qaa');
const csv = (lignes) => '﻿' + lignes.map((l) => l.join(',')).join('\r\n') + '\r\n';

mkdirSync(ici);
writeFileSync(join(ici, 'infos.json'), JSON.stringify({
  langue: 'qaa', nom: 'Essai', producteur: 'Équipe Mayem', droits: 'Tous droits réservés',
  orthographe: "Orthographe d'essai", ecriture: 'Latn', etiquettes: { securite: 'A02' },
}));
writeFileSync(join(ici, 'corpus.csv'), csv([
  ['id', 'priorite', 'ecran', 'element', 'critique', 'champ_fait', 'fr', 'en', 'cible', 'valide_par', 'valide', 'consigne'],
  ['A01', 'P1', 'Accueil', 'Texte', '1', '1', 'Votre solde est de {amount}.', 'Your balance is {amount}.', '[qaa] Votre solde est de {amount}.', 'Ana / relu par Ben', '1', ''],
  ['A02', 'P1', 'Accueil', 'Titre', '1', '0', 'Sécurité', 'Security', '[qaa] Sécurité ɔŋɛ', 'Ana / relu par Ben', '1', ''],
  ['A03', 'P2', 'Accueil', 'Bouton', '0', '0', 'Annuler', 'Cancel', '', '', '', ''],
]));
// En-têtes au nom de la langue, comme dans les tableurs que remplissent les locuteurs
writeFileSync(join(ici, 'glossaire.csv'), csv([
  ['Réf.', 'Terme français', 'Anglais', "Sens dans l'application", 'Critique', 'TRADUCTION ESSAI', 'Mots à éviter', 'Traduit par', 'Relu par', 'Commentaire'],
  ['T01', 'solde', 'balance', 'Argent disponible', 'Oui', '[qaa] solde', '', 'Ana', 'Ben', ''],
]));
writeFileSync(join(ici, 'retraduction.csv'), csv([
  ['Réf.', 'Texte essai', 'VOTRE TRADUCTION EN FRANÇAIS', 'Traduit par'],
  ['A01', '[qaa] Votre solde est de {amount}.', 'Votre solde est de {amount}.', 'Chloé'],
]));

const outil = (nom, ...args) => spawnSync(process.execPath, ['--experimental-strip-types', '--disable-warning=ExperimentalWarning', `tools/${nom}.js`, ...args],
  { cwd: racine, env: { ...process.env, MAYEM_PACKS: packs }, encoding: 'utf8' });

const fabrication = outil('build-pack', 'qaa', '--strict');
const pack = JSON.parse(readFileSync(join(ici, 'pack.json'), 'utf8'));
test.after(() => rmSync(packs, { recursive: true, force: true }));

test('le pack d\'une nouvelle langue se fabrique et se contrôle comme celui du bulu', () => {
  assert.equal(fabrication.status, 0, fabrication.stderr);
  assert.equal(pack.format, 2);
  assert.equal(pack.langue, 'qaa');
  assert.equal(pack.version, '0.1.0');
  assert.equal(pack.glossaire[0].cible, '[qaa] solde');
  assert.equal(pack.phrases.find((p) => p.id === 'A01').retraduit_par, 'Chloé');
  assert.equal(outil('check-pack', 'qaa').status, 0);
  assert.match(readFileSync(join(ici, 'CHANGELOG.md'), 'utf8'), /Journal du pack Essai \(qaa\)/);
  assert.ok(!JSON.stringify(pack).toLowerCase().includes('bulu'));
});

test('le moteur affiche la langue d\'essai, valeurs intactes', () => {
  const res = traduire('Votre solde est de 25 000 FCFA.', pack);
  assert.equal(res.statut, 'ok');
  assert.equal(res.sortie, '[qaa] Votre solde est de 25 000 FCFA.');
  assert.equal(traduire('Annuler', pack).statut, 'non_verifie');
});

test('les règles d\'écriture du bulu ne s\'appliquent pas : ɔ, ŋ et ɛ sont des lettres latines comme les autres', () => {
  const profil = JSON.parse(readFileSync(join(ici, 'infos.json'), 'utf8'));
  const constats = reviser({ phrases: pack.phrases, glossaire: pack.glossaire, profil });
  assert.deepEqual(constats.filter((c) => ['alphabet', 'politesse'].includes(c.code)), []);
});

test('les exports portent le code de la langue', () => {
  const fichiers = exports(pack);
  assert.ok('qaa.tmx' in fichiers && 'i18next/qaa.json' in fichiers);
  assert.match(fichiers['qaa.tmx'], /xml:lang="qaa"[^]*\[qaa\] Votre solde est de \{amount\}\./);
});
