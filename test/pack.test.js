// check-pack refuse chaque forme de pack invalide, et accepte le pack bulu actuel.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { verifierPack } from '../tools/check-pack.js';
import { lireCsv } from '../tools/csv.js';

const pack = JSON.parse(readFileSync(new URL('../packs/bum/pack.json', import.meta.url), 'utf8'));

// Copie du pack où la phrase X08 reçoit les changements donnés
function avec(changements) {
  const copie = structuredClone(pack);
  Object.assign(copie.phrases.find((p) => p.id === 'X08'), changements);
  return copie;
}
const refuse = (p, motif) => assert.ok(verifierPack(p).some((e) => motif.test(e)), verifierPack(p).join('\n') || 'aucune erreur');

test('le pack bulu actuel est valide', () => {
  assert.deepEqual(verifierPack(pack), []);
});

test('un champ manquant est refusé', () => {
  const sansVersion = structuredClone(pack);
  delete sansVersion.version;
  refuse(sansVersion, /« version » manquant/);
  const copie = structuredClone(pack);
  delete copie.phrases[0].relu_par;
  refuse(copie, /phrases\[0\].*« relu_par » manquant/);
});

test('un mauvais type est refusé', () => {
  refuse(avec({ valide: 'oui' }), /valide : attendu boolean/);
});

test('des champs {…} différents entre français et bulu sont refusés', () => {
  refuse(avec({ bulu: 'Mebal' }), /champs \{…\} du bulu/);
});

test('des chiffres différents entre français et bulu sont refusés', () => {
  refuse(avec({ bulu: 'Mebal ya 2 {amount}' }), /chiffres du bulu/);
});

test('une ligne validée sans relecteur est refusée', () => {
  refuse(avec({ valide: true, traduit_par: 'georges', relu_par: '' }), /sans relecteur/);
});

test('une ligne relue par son propre traducteur est refusée', () => {
  refuse(avec({ valide: true, traduit_par: 'georges', relu_par: 'Georges' }), /relue par la personne/);
});

test('une ligne retraduite par son propre traducteur est refusée', () => {
  refuse(avec({ traduit_par: 'georges', retraduit_par: 'Georges', retraduction: 'Votre solde' }), /retraduite par la personne/);
});

test('une ligne validée avec deux personnes différentes est acceptée', () => {
  assert.deepEqual(verifierPack(avec({ valide: true, traduit_par: 'georges', relu_par: 'bene' })), []);
});

test('le lecteur CSV gère guillemets, virgules et retours à la ligne', () => {
  const lignes = lireCsv('﻿id,fr\r\nA1,"Bonjour, ""Amina"""\r\nA2,"deux\nlignes"\r\n');
  assert.deepEqual(lignes, [{ id: 'A1', fr: 'Bonjour, "Amina"' }, { id: 'A2', fr: 'deux\nlignes' }]);
});
