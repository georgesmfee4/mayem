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
    { ...terme('G1', 'aucun / aucune', 'Dzing'), sens: '« Aucun agent ne vous le demandera. »' }, // mot grammatical
    terme('T8', 'bénéficiaire', 'Benef'),
    terme('T9', 'côte', 'Kot'),
    terme('T10', 'coté', 'Kote'),
    { ...terme('T11', 'banque', 'Banke'), critique: false, sens: 'L’établissement qui tient le compte' }, // concept défini
    { ...terme('G2', 'avec', 'Ake'), critique: false }, // ni critique ni défini
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

test('mot grammatical : traduit seul comme libellé, jamais glosé dans une phrase', () => {
  assert.equal(sortie('Aucun'), 'Dzing');
  assert.deepEqual(gloses('Aucun solde disponible pour le moment'), ['solde=Zolo']);
});

test('libellé sans accents : traduit si un seul terme s’écrit ainsi', () => {
  assert.equal(sortie('BENEFICIAIRE'), 'Benef');
  assert.equal(sortie('Beneficiaire'), 'Benef');
  assert.equal(sortie('côte'), 'kot');
  assert.equal(sortie('cote'), null); // « côte » ou « coté » : on ne devine pas
});

test('pluriel : jamais traduit par le singulier, seulement glosé', () => {
  assert.equal(sortie('Soldes'), null);
  assert.deepEqual(gloses('Soldes'), ['solde=Zolo']);
});

test('glose : concept critique ou défini, à la casse, à l’accent et au pluriel près', () => {
  assert.deepEqual(gloses('VOS CODES SECRETS ET VOTRE BENEFICIAIRE'), ['code secret=Kod sekre', 'bénéficiaire=Benef']);
  assert.deepEqual(gloses('Payez avec votre banque'), ['banque=Banke']);
  assert.equal(traduire('Payez avec votre banque', pack).critique, false);
});

test('phrase inconnue : non traduite, termes signalés, le plus long d’abord, sans doublon', () => {
  const res = traduire('Votre code secret et votre solde : ne communiquez jamais votre code secret.', pack);
  assert.equal(res.sortie, null);
  assert.equal(res.statut, 'non_verifie');
  assert.deepEqual(gloses('Votre code secret et votre solde : ne communiquez jamais votre code secret.'), ['code secret=Kod sekre', 'solde=Zolo']);
  assert.equal(res.critique, true);
});
