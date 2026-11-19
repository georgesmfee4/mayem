// Import d'un lexique relu : ce qui entre, où, et ce qui n'entre jamais. Les mots « cible » sont des marqueurs d'essai.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { estPhraseComplete, memesValeurs, trier } from '../tools/lexique.js';

const entree = (id, fr, bulu, statut = 'valide', relu = 'B') => ({ id, fr, bulu, statut, theme: 'T', contexte: '', critique: true, traduit_par: 'A', relu_par: relu });
const glossaire = [{ ref: 'G1', terme: 'carte bancaire', cible: 'ANCIEN' }, { ref: 'G2', terme: 'ils / elles', cible: 'PRONOM' }];
const corpus = [{ id: 'P1', fr: 'Frais de transfert', cible: 'FRAIS' }];

test('phrase complète : majuscule et point final, ou un champ {…} ; un terme sinon', () => {
  assert.ok(estPhraseComplete('Votre prêt de {amount} a été approuvé.'));
  assert.ok(estPhraseComplete('Opération annulée. Aucun montant n\'a été débité.'));
  assert.ok(!estPhraseComplete('taux de change'));
});

test('chiffres et champs identiques exigés entre le français et la traduction', () => {
  assert.ok(memesValeurs('Composez #150#.', 'X #150#'));
  assert.ok(!memesValeurs('Il expire dans 5 minutes.', 'X'));
  assert.ok(!memesValeurs('Frais : {fee}.', 'X : {amount}'));
});

test('tri : statut, deux noms, déjà présent (gardé), retenue, terme ou phrase', () => {
  const lexique = { entrees: [
    entree('E1', 'taux de change', 'CIBLE'),
    entree('E2', 'Le bénéficiaire recevra {amount}.', 'CIBLE {amount}'),
    entree('E3', 'carte bancaire / carte prépayée', 'NOUVEAU'),
    entree('E4', 'frais de transfert', 'FRAIS'),
    entree('E5', 'compte courant', 'CIBLE', 'conflit'),
    entree('E6', 'identifiant', 'CIBLE'),
    entree('E7', 'devise', 'CIBLE', 'valide', 'a'),
    entree('E8', 'ils / elles reçoivent', 'CIBLE'),
  ] };
  const bilan = trier(lexique, glossaire, corpus, ['E6']);
  assert.deepEqual(bilan.termes.map((e) => e.id), ['E1', 'E8']);
  assert.deepEqual(bilan.phrases.map((e) => e.id), ['E2']);
  assert.deepEqual(bilan.gardees.map(({ e, ref }) => `${e.id}:${ref}`), ['E3:G1']);
  assert.deepEqual(bilan.dejaLa.map(({ e }) => e.id), ['E4']);
  assert.deepEqual(bilan.ecartees.map((e) => e.id), ['E5']);
  assert.deepEqual(bilan.retenues.map((e) => e.id), ['E6']);
  assert.deepEqual(bilan.refusees.map(({ e }) => e.id), ['E7']);
});
