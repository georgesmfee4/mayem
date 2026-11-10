// Termes du glossaire hors des phrases : libellés courts traduits, termes signalés dans une phrase inconnue.
// Jamais de phrase composée mot à mot. Les mots « bulu » ci-dessous sont des marqueurs d'essai.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { traduire } from '../core/moteur.ts';

const terme = (ref, francais, bulu, traduit_par = 'A', relu_par = 'B') =>
  ({ ref, terme: francais, sens: '', en: '', bulu, critique: true, a_eviter: '', traduit_par, relu_par, commentaire: '' });
const pack = {
  langue: 'xx', nom: 'Essai', version: '1.0.0', etiquettes: {}, phrases: [],
  glossaire: [
    terme('T1', 'solde', 'Zolo'),
    terme('T2', 'frais / commission', 'Kufa / Kufo'),
    terme('T3', 'code', 'Kod'),
    terme('T4', 'code secret', 'Kod sekre'),
    terme('T5', 'annuler', 'Fetek', 'A', 'a'), // relu par son traducteur
    terme('T6', 'retour', 'Bula', 'A', ''), // pas relu
    terme('T7', 'montant', 'Somme (à accorder)'), // explication, pas un terme
  ],
};
const sortie = (texte) => traduire(texte, pack)?.sortie ?? null;
const gloses = (texte) => traduire(texte, pack).termes.map((t) => `${t.fr}=${t.traduction}`);

test('libellé qui est un terme validé : traduit, avec la casse du texte', () => {
  assert.equal(sortie('Solde'), 'Zolo');
  assert.equal(sortie('solde'), 'zolo');
  assert.equal(traduire('Solde', pack).statut, 'ok');
  assert.equal(sortie('Commission'), 'Kufo'); // formes appariées
});

test('libellé suivi de « : valeur » : seulement si la valeur est un fait, qui ne bouge pas', () => {
  assert.equal(sortie('Frais : 500 FCFA'), 'Kufa : 500 FCFA');
  assert.deepEqual(traduire('Frais : 500 FCFA', pack).valeurs, ['500 FCFA']);
  assert.equal(sortie('Solde : bientôt disponible'), null);
});

test('terme non relu, relu par son traducteur ou expliqué : jamais utilisé', () => {
  assert.equal(sortie('Annuler'), null);
  assert.equal(sortie('Retour'), null);
  assert.equal(sortie('Montant'), null);
});

test('phrase inconnue : non traduite, termes signalés, le plus long d’abord, sans doublon', () => {
  const res = traduire('Votre code secret et votre solde : ne communiquez jamais votre code secret.', pack);
  assert.equal(res.sortie, null);
  assert.equal(res.statut, 'non_verifie');
  assert.deepEqual(gloses('Votre code secret et votre solde : ne communiquez jamais votre code secret.'), ['code secret=Kod sekre', 'solde=Zolo']);
  assert.equal(res.critique, true);
});
